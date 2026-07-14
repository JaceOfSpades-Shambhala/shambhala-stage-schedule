// Shambhala set-list sharing API — Durable Objects coordinate ownership and
// mutations while KV serves read-optimized public snapshots so a person can
// publish their set list under a permanent, unguessable read id (carried on an
// NFC tag or QR) that friends' phones pull live. A separate secret write key,
// held only on the owner's device, is required to update a list — so tapping
// someone's tag can only ever read, never overwrite.
//
// Routes:
//   POST /lists               -> create own list, returns { readId, writeKey };
//                                with claimable:true instead returns { readId,
//                                claimToken } and stores NO write key, so a
//                                giveaway tag is unwritable until claimed
//   GET  /lists/:readId       -> read,   returns { name, sets, ping, updated }
//   PUT  /lists/:readId       -> update, requires header X-Write-Key
//   POST /lists/:readId/claim -> the recipient sends the claim token plus a
//                                write key THEY generated and the local time
//                                they first scanned it. The earliest scan wins,
//                                even if another phone reached the server first.
//   POST /lists/:readId/handoff -> create a 24-hour PWA transfer
//   POST /lists/:readId/connect-code -> create a human-entered PWA transfer
//   POST /lists/:readId/release -> clear ownership and make the tag claimable
//   POST/GET /lists/:readId/trade -> reciprocal physical-tag trade handshake
//   GET  /lists/:readId/owner -> authenticated state for cross-context sync
//   POST /handoffs/redeem       -> idempotently exchange it for ownership

import { CLAIM_CONTENTION_WINDOW_MS, HexlaceCoordinator, HexOwlProfile, OwlNumberAllocator, RateLimitCoordinator } from "./durable-objects.js";

export { HexlaceCoordinator, HexOwlProfile, OwlNumberAllocator, RateLimitCoordinator };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Write-Key, X-Profile-Key",
  "Access-Control-Max-Age": "86400"
};

const TTL_SECONDS = 60 * 24 * 60 * 60; // lists expire 60 days after their last write
const MAX_SETS = 100;
const MAX_FRIENDS = 100;
const MAX_BYTES = 20000;
const MAX_NAME = 60;
const MAX_ARTIST_LENGTH = 120;
const MAX_SET_PING_MINUTES = 12 * 60;
const LOCATION_PING_MINUTES = new Set([30, 60, 90]);
const VALID_PING_LOCATIONS = new Set(["camp", "river", "vendors"]);
const MIN_KEY_LENGTH = 16;
const READ_ID_LENGTH = 8;
const PROFILE_ID_LENGTH = 16;
const VALID_DAYS = new Set(["Thursday", "Friday", "Saturday", "Sunday"]);
const VALID_STAGE_IDS = new Set(["amp", "fractal-forest", "grove", "living-room", "pagoda", "secret-garden", "village"]);
const TIME_PATTERN = /^(1[0-2]|[1-9]):[0-5]\d\s(?:AM|PM)$/;
// Per-IP limits are sized for festival reality: a whole camp can sit behind
// one carrier-NAT/hotspot IP, so bursts of legitimate traffic share a bucket.
// The per-list update cap is per readId (NAT-independent) and stays tighter.
const RATE_LIMITS = {
  create: { limit: 120, windowSeconds: 300 },
  claim: { limit: 120, windowSeconds: 300 },
  updateIp: { limit: 450, windowSeconds: 300 },
  updateList: { limit: 180, windowSeconds: 300 }
};
// The imported seven-day contention window covers an intended recipient who
// remains offline for the festival while still bounding bearer-token claims.
const HANDOFF_TTL_SECONDS = 24 * 60 * 60;
// Base58-ish alphabet: no 0/O/1/l/I, so ids are safe to read aloud or retype.
const ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function isReadId(value) {
  return typeof value === "string" && value.length === READ_ID_LENGTH && [...value].every(character => ID_ALPHABET.includes(character));
}

function cleanHandoffToken(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.includes(".")) return trimmed;
  const compact = [...trimmed].filter(character => ID_ALPHABET.includes(character)).join("");
  if (compact.length === READ_ID_LENGTH + 8) {
    return `${compact.slice(0, READ_ID_LENGTH)}.${compact.slice(READ_ID_LENGTH)}`;
  }
  return compact === trimmed && compact.length >= 24 && compact.length <= 128 ? compact : "";
}

function displayHandoffCode(token) {
  const compact = token.replace(".", "");
  return compact.match(/.{1,4}/g)?.join("-") || compact;
}

async function handoffKey(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return `handoff:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", ...CORS }
  });
}

function clientBucket(request) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  return ip.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 80) || "unknown";
}

function nowMs(env) {
  return Number.isSafeInteger(env?.NOW_MS) ? env.NOW_MS : Date.now();
}

function namedStub(namespace, name) {
  if (typeof namespace.getByName === "function") return namespace.getByName(name);
  return namespace.get(namespace.idFromName(name));
}

function hasHexlaceCoordinator(env) {
  return Boolean(env?.HEXLACES && (typeof env.HEXLACES.getByName === "function" || (typeof env.HEXLACES.idFromName === "function" && typeof env.HEXLACES.get === "function")));
}

function hasOwlInfrastructure(env) {
  return Boolean(env?.HEX_OWL_PROFILES && env?.OWL_NUMBERS);
}

function validProfileCredentials(profileId, profileKey) {
  return typeof profileId === "string" && profileId.length === PROFILE_ID_LENGTH
    && [...profileId].every(character => ID_ALPHABET.includes(character))
    && typeof profileKey === "string" && profileKey.length >= 24;
}

function cleanOwl(value) {
  if (!value || typeof value !== "object") return null;
  const seed = typeof value.seed === "string" ? value.seed.toLowerCase() : "";
  const version = Number(value.version);
  const number = Number(value.number);
  const createdAt = Number(value.createdAt);
  const season = Number(value.season);
  if (!/^[0-9a-f]{32}$/.test(seed) || !Number.isSafeInteger(version) || version < 1
    || !Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(createdAt) || createdAt < 1
    || !Number.isSafeInteger(season) || season < 2026) return null;
  return { seed, version, number, createdAt, season };
}

async function callOwlProfile(env, profileId, path, body = {}) {
  return namedStub(env.HEX_OWL_PROFILES, profileId).fetch(new Request(`https://profile.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, profileId })
  }));
}

async function initializeProfile(env, profileId, profileKey) {
  const response = await callOwlProfile(env, profileId, "/initialize", { profileKey });
  if (!response.ok) throw new HttpError(response.status, "The Hex Owl profile could not be initialized.");
}

async function qualifyProfile(env, { profileId, profileKey, eligible, claimedReadId = "", tagOwl = null }) {
  await initializeProfile(env, profileId, profileKey);
  if (cleanOwl(tagOwl) && claimedReadId) {
    const adopted = await callOwlProfile(env, profileId, "/adopt", { profileKey, owl: cleanOwl(tagOwl), claimedReadId });
    if (!adopted.ok) throw new HttpError(adopted.status, "The Hex Owl could not be synchronized.");
    return cleanOwl((await adopted.json()).owl);
  }
  const response = await callOwlProfile(env, profileId, "/qualify", { profileKey, eligible, ...(claimedReadId ? { claimedReadId } : {}) });
  if (!response.ok) throw new HttpError(response.status, "The Hex Owl could not be assigned.");
  return cleanOwl((await response.json()).owl);
}

function profileCredentials(body) {
  const suppliedId = body && typeof body.profileId === "string" ? body.profileId : "";
  const suppliedKey = body && typeof body.profileKey === "string" ? body.profileKey : "";
  return validProfileCredentials(suppliedId, suppliedKey)
    ? { profileId: suppliedId, profileKey: suppliedKey }
    : { profileId: randomId(PROFILE_ID_LENGTH), profileKey: randomId(32) };
}

async function callHexlaceCoordinator(env, readId, path, body = {}) {
  const stub = namedStub(env.HEXLACES, readId);
  return stub.fetch(new Request(`https://hexlace.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, readId })
  }));
}

async function relayInternal(response, transform = value => value) {
  let data;
  try {
    data = await response.json();
  } catch {
    return json({ error: "Internal server error." }, 500);
  }
  return json(transform(data), response.status);
}

async function checkRateLimit(env, key, limit, windowSeconds) {
  const now = nowMs(env);
  const slot = Math.floor(now / 1000 / windowSeconds);
  if (env?.RATE_LIMITS) {
    const response = await namedStub(env.RATE_LIMITS, key).fetch(new Request("https://rate-limit.internal/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, limit, expiresAt: now + windowSeconds * 2 * 1000 })
    }));
    if (!response.ok) throw new Error("Rate-limit coordinator failed.");
    return Boolean((await response.json()).ok);
  }
  const bucket = `rate:${key}:${slot}`;
  const current = Number(await env.LISTS.get(bucket)) || 0;
  if (current >= limit) return false;
  await env.LISTS.put(bucket, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return true;
}

async function enforceRateLimit(request, env, kind, id = clientBucket(request)) {
  const rule = RATE_LIMITS[kind];
  if (!rule) return null;
  const ok = await checkRateLimit(env, `${kind}:${id}`, rule.limit, rule.windowSeconds);
  if (ok) return null;
  return new Response(JSON.stringify({ error: "Too many requests. Try again in a few minutes." }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(rule.windowSeconds),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...CORS
    }
  });
}

// Validates and returns a clean { name, sets, ping } payload, or throws a message.
function cleanSet(set) {
  if (!set || typeof set !== "object" || Array.isArray(set)) throw "Each set must be an object.";
  const day = typeof set.day === "string" ? set.day.trim() : "";
  const stageId = typeof set.stageId === "string" ? set.stageId.trim() : "";
  const time = typeof set.time === "string" ? set.time.trim() : "";
  const artist = typeof set.artist === "string" ? set.artist.trim() : "";
  if (!VALID_DAYS.has(day) || !VALID_STAGE_IDS.has(stageId) || !TIME_PATTERN.test(time) || !artist || artist.length > MAX_ARTIST_LENGTH) {
    throw "Each set needs a valid day, stage, time, and artist.";
  }
  return { day, stageId, time, artist };
}

function sameSet(a, b) {
  return a.day === b.day && a.stageId === b.stageId && a.time === b.time && a.artist === b.artist;
}

function cleanPing(value, sets) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw "ping must be an object or null.";
  const startKey = Number(value.startKey);
  const endKey = Number(value.endKey);
  if (!Number.isSafeInteger(startKey) || !Number.isSafeInteger(endKey) || startKey <= 0 || endKey <= startKey) {
    throw "Ping times are invalid.";
  }
  const duration = endKey - startKey;
  if (VALID_PING_LOCATIONS.has(value.type)) {
    if (!LOCATION_PING_MINUTES.has(duration)) throw "Location pings must last 30, 60, or 90 minutes.";
    return { type: value.type, startKey, endKey };
  }
  if (value.type === "set") {
    const set = cleanSet(value);
    if (!sets.some(saved => sameSet(saved, set))) throw "A set ping must reference a saved set.";
    if (duration > MAX_SET_PING_MINUTES) throw "A set ping lasts too long.";
    return { type: "set", ...set, startKey, endKey };
  }
  throw "Ping type must be camp, river, vendors, or set.";
}

function cleanPayload(body) {
  if (!body || typeof body !== "object") throw "Body must be a JSON object.";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw "A display name is required.";
  if (name.length > MAX_NAME) throw `Name must be ${MAX_NAME} characters or fewer.`;
  if (!Array.isArray(body.sets)) throw "sets must be an array.";
  if (body.sets.length > MAX_SETS) throw `Too many sets (max ${MAX_SETS}).`;
  const sets = body.sets.map(cleanSet);
  let friends;
  if (Object.prototype.hasOwnProperty.call(body, "friends")) {
    if (!Array.isArray(body.friends)) throw "friends must be an array.";
    if (body.friends.length > MAX_FRIENDS) throw `Too many friends (max ${MAX_FRIENDS}).`;
    friends = [...new Set(body.friends.map(value => typeof value === "string" ? value.trim() : ""))];
    if (friends.some(value => !isReadId(value))) throw "Each friend needs a valid Hexlace id.";
  }
  return { name, sets, ping: cleanPing(body.ping, sets), friends };
}

function serialize(payload, revision = 1, env) {
  const blob = JSON.stringify({ ...payload, updated: nowMs(env), revision });
  if (new TextEncoder().encode(blob).byteLength > MAX_BYTES) throw "List is too large.";
  return blob;
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) throw new HttpError(413, "Request body is too large.");
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON.");
  }
}

function currentMinuteKey(env) {
  if (Number.isSafeInteger(env?.NOW_MINUTE_KEY)) return env.NOW_MINUTE_KEY;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const serial = Math.floor(Date.UTC(values.year, values.month - 1, values.day) / 86400000);
  return serial * 1440 + (values.hour % 24) * 60 + values.minute;
}

function freshPing(ping, env) {
  return ping && Number.isSafeInteger(ping.endKey) && ping.endKey > currentMinuteKey(env) ? ping : null;
}

function publicList(stored, env) {
  const list = JSON.parse(stored);
  const owl = cleanOwl(list.owl);
  return {
    name: list.name,
    sets: list.sets,
    ping: freshPing(list.ping, env),
    updated: list.updated,
    revision: list.revision,
    ...(owl ? { owl } : {})
  };
}

function parseClaimRecord(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && typeof parsed.token === "string") return parsed;
  } catch {}
  return { token: value };
}

function cleanScannedAt(value, env) {
  const scannedAt = Number(value);
  return Number.isFinite(scannedAt) && scannedAt > 0 ? scannedAt : nowMs(env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const parts = new URL(request.url).pathname.split("/").filter(Boolean);

    if (request.method === "GET" && parts.length === 0) {
      return new Response("Shambhala set-list sharing API.", { headers: CORS });
    }

    if (request.method === "GET" && parts.length === 1 && parts[0] === "health") {
      return json({ ok: true, build: typeof env.BUILD_SHA === "string" ? env.BUILD_SHA : "unknown" });
    }

    try {
      // POST /handoffs/redeem — the installed PWA consumes the cookie copied
      // by iOS and receives the existing owner identity. New tickets are held
      // by the per-Hexlace coordinator and may be retried with the same stable
      // redemption id if the first response is lost. The KV path below remains
      // only for already-issued legacy tickets.
      if (request.method === "POST" && parts.length === 2 && parts[0] === "handoffs" && parts[1] === "redeem") {
        const limited = await enforceRateLimit(request, env, "claim");
        if (limited) return limited;
        const body = await readJson(request);
        const token = cleanHandoffToken(body?.token || body?.code);
        if (token.length < 17 || token.length > 128) return json({ error: "Invalid or expired handoff." }, 410);
        const tokenReadId = token.includes(".") ? token.slice(0, token.indexOf(".")) : "";
        if (hasHexlaceCoordinator(env) && isReadId(tokenReadId)) {
          const redemptionId = body && typeof body.redemptionId === "string" ? body.redemptionId.trim() : "";
          const response = await callHexlaceCoordinator(env, tokenReadId, "/redeem", { token, redemptionId });
          return relayInternal(response, data => {
            if (!data?.list) return data;
            const list = publicList(JSON.stringify(data.list), env);
            return {
              readId: data.readId,
              writeKey: data.writeKey,
              name: list.name || "",
              sets: Array.isArray(list.sets) ? list.sets : [],
              ping: list.ping || null,
              friends: Array.isArray(data.list.friends) ? data.list.friends : [],
              revision: Number.isSafeInteger(list.revision) ? list.revision : 1,
              ...(hasOwlInfrastructure(env) ? {
                profileId: data.profileId || null,
                profileKey: data.profileKey || null,
                owl: cleanOwl(data.owl),
                isPhysical: data.isPhysical === true,
                tapToken: data.tapToken || null
              } : {})
            };
          });
        }
        const key = await handoffKey(token);
        const readId = await env.LISTS.get(key);
        if (!isReadId(readId)) return json({ error: "Invalid or expired handoff." }, 410);
        await env.LISTS.delete(key);
        const [writeKey, stored] = await Promise.all([
          env.LISTS.get(`auth:${readId}`),
          env.LISTS.get(`list:${readId}`)
        ]);
        if (!writeKey || !stored) return json({ error: "Invalid or expired handoff." }, 410);
        const list = publicList(stored, env);
        const privateList = JSON.parse(stored);
        return json({ readId, writeKey, name: list.name || "", sets: Array.isArray(list.sets) ? list.sets : [], ping: list.ping || null, friends: Array.isArray(privateList.friends) ? privateList.friends : [], revision: Number.isSafeInteger(list.revision) ? list.revision : 1 });
      }

      // Private, authenticated Hexadex storage. A source entry is accepted only
      // after the physical tag's tap token is validated by its Hexlace object.
      if (parts[0] === "profiles" && parts.length === 3 && parts[2] === "hexadex") {
        if (!hasOwlInfrastructure(env) || !hasHexlaceCoordinator(env)) return json({ error: "Hexadex is temporarily unavailable." }, 503);
        const profileId = parts[1];
        const profileKey = request.headers.get("X-Profile-Key") || "";
        if (!validProfileCredentials(profileId, profileKey)) return json({ error: "Not found." }, 404);
        if (request.method === "GET") {
          const url = new URL(request.url);
          const response = await callOwlProfile(env, profileId, "/hexadex/read", {
            profileKey,
            cursor: url.searchParams.get("cursor") || "",
            limit: Number(url.searchParams.get("limit")) || 24
          });
          return relayInternal(response);
        }
        if (request.method === "POST") {
          const limited = await enforceRateLimit(request, env, "updateIp");
          if (limited) return limited;
          const body = await readJson(request);
          const sourceReadId = body && typeof body.readId === "string" ? body.readId : "";
          const tapToken = body && typeof body.tapToken === "string" ? body.tapToken : "";
          if (!isReadId(sourceReadId) || tapToken.length < 16) return json({ error: "A physical Hexlace tap is required." }, 400);
          const own = await callOwlProfile(env, profileId, "/read", { profileKey });
          if (!own.ok) return relayInternal(own);
          const ownState = await own.json();
          if (ownState.claimedReadId === sourceReadId) return json({ error: "That is your own Hexlace." }, 409);
          const collectible = await callHexlaceCoordinator(env, sourceReadId, "/collect", { tapToken });
          if (!collectible.ok) return relayInternal(collectible);
          const source = await collectible.json();
          const owl = cleanOwl(source.owl);
          if (!owl) return json({ error: "This Hexlace does not have a Hex Owl yet." }, 409);
          const firstCollectedAt = Number(body.firstCollectedAt);
          const entry = {
            readId: sourceReadId,
            name: typeof source.name === "string" ? source.name : "",
            owl,
            firstCollectedAt: Number.isSafeInteger(firstCollectedAt) && firstCollectedAt > 0 ? firstCollectedAt : nowMs(env),
            festivalYear: owl.season,
            context: `Shambhala ${owl.season}`
          };
          const saved = await callOwlProfile(env, profileId, "/hexadex/add", { profileKey, entry });
          return relayInternal(saved);
        }
      }

      if (parts[0] !== "lists") return json({ error: "Not found." }, 404);

      // POST /lists — create a list.
      if (request.method === "POST" && parts.length === 1) {
        const limited = await enforceRateLimit(request, env, "create");
        if (limited) return limited;
        const body = await readJson(request);
        const payload = cleanPayload(body);
        const blob = serialize(payload, 1, env);
        if (hasHexlaceCoordinator(env)) {
          const claimable = body.claimable === true;
          const credentials = !claimable && hasOwlInfrastructure(env) ? profileCredentials(body) : null;
          const owl = credentials
            ? await qualifyProfile(env, { ...credentials, eligible: payload.sets.length > 0 })
            : null;
          for (let attempt = 0; attempt < 5; attempt++) {
            const readId = randomId(READ_ID_LENGTH);
            const claimToken = claimable ? randomId(12) : null;
            const writeKey = claimable ? null : randomId(24);
            const tapToken = randomId(24);
            const isPhysical = claimable || body.physical !== false;
            const response = await callHexlaceCoordinator(env, readId, "/initialize", {
              list: JSON.parse(blob),
              claimToken,
              writeKey,
              tapToken,
              isPhysical,
              ...(credentials ? { ...credentials, owl } : {})
            });
            if (response.status === 409) continue;
            if (response.status !== 201) return relayInternal(response);
            if (!claimable && credentials && isPhysical && owl) {
              await qualifyProfile(env, { ...credentials, eligible: true, claimedReadId: readId, tagOwl: owl });
            }
            return claimable
              ? json({ readId, claimToken, tapToken, isPhysical: true, revision: 1 }, 201)
              : json({ readId, writeKey, tapToken, isPhysical, revision: 1, ...credentials, ...(owl ? { owl } : {}) }, 201);
          }
          return json({ error: "Couldn't create a unique list. Please try again." }, 503);
        }
        let readId = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = randomId(READ_ID_LENGTH);
          if (!(await env.LISTS.get(`list:${candidate}`))) {
            readId = candidate;
            break;
          }
        }
        if (!readId) return json({ error: "Couldn't create a unique list. Please try again." }, 503);
        await env.LISTS.put(`list:${readId}`, blob, { expirationTtl: TTL_SECONDS });
        // A giveaway tag is created unclaimed: no write key exists yet, so it
        // cannot be published to until someone claims it and sets one.
        if (body.claimable === true) {
          const claimToken = randomId(12);
          await env.LISTS.put(`claim:${readId}`, JSON.stringify({ token: claimToken }), { expirationTtl: TTL_SECONDS });
          return json({ readId, claimToken, revision: 1 }, 201);
        }
        const writeKey = randomId(24);
        await env.LISTS.put(`auth:${readId}`, writeKey, { expirationTtl: TTL_SECONDS });
        return json({ readId, writeKey, revision: 1 }, 201);
      }

      // POST /lists/:readId/claim — the recipient records the write key they
      // generated. If multiple phones scan before signal, the earliest local
      // scan time wins even when it reaches the server later.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "claim") {
        const limited = await enforceRateLimit(request, env, "claim");
        if (limited) return limited;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const body = await readJson(request);
        if (hasHexlaceCoordinator(env)) {
          let credentials = null;
          let owl = null;
          if (hasOwlInfrastructure(env)) {
            credentials = profileCredentials(body);
            owl = await qualifyProfile(env, { ...credentials, eligible: false });
          }
          const response = await callHexlaceCoordinator(env, readId, "/claim", {
            claimToken: body && typeof body.claimToken === "string" ? body.claimToken : "",
            writeKey: body && typeof body.writeKey === "string" ? body.writeKey : "",
            scannedAt: cleanScannedAt(body && body.scannedAt, env),
            ...(credentials ? { ...credentials, owl } : {})
          });
          if (!credentials) return relayInternal(response);
          const claimed = await response.json().catch(() => ({}));
          if (!response.ok) return json(claimed, response.status);
          if (claimed.accepted) {
            owl = await qualifyProfile(env, { ...credentials, eligible: false, claimedReadId: readId, tagOwl: owl });
          }
          return json({
            ok: true,
            accepted: claimed.accepted === true,
            revision: claimed.revision,
            isPhysical: true,
            tapToken: claimed.tapToken || null,
            ...credentials,
            ...(owl ? { owl } : {})
          });
        }
        const claim = parseClaimRecord(await env.LISTS.get(`claim:${readId}`));
        if (!claim) return json({ error: "Not claimable." }, 409);
        if (((body && body.claimToken) || "") !== claim.token) return json({ error: "Invalid claim token." }, 403);
        const writeKey = body && typeof body.writeKey === "string" ? body.writeKey : "";
        if (writeKey.length < MIN_KEY_LENGTH) return json({ error: "A valid write key is required." }, 400);
        const scannedAt = cleanScannedAt(body && body.scannedAt, env);
        const previousScannedAt = Number.isFinite(Number(claim.scannedAt)) ? Number(claim.scannedAt) : Infinity;
        // firstClaimedAt never advances on takeovers, so the whole contention
        // period is bounded to the window after the very first claim.
        const firstClaimedAt = Number.isFinite(Number(claim.claimedAt)) ? Number(claim.claimedAt) : null;
        const contentionOpen = firstClaimedAt === null || nowMs(env) - firstClaimedAt < CLAIM_CONTENTION_WINDOW_MS;
        const accepted = !claim.ownerSet || (contentionOpen && scannedAt <= previousScannedAt);
        if (accepted) {
          await env.LISTS.put(`auth:${readId}`, writeKey, { expirationTtl: TTL_SECONDS });
          await env.LISTS.put(`claim:${readId}`, JSON.stringify({
            token: claim.token,
            scannedAt,
            claimedAt: firstClaimedAt ?? nowMs(env),
            ownerSet: true
          }), { expirationTtl: TTL_SECONDS });
        }
        return json({ ok: true, accepted });
      }

      // Releasing is deliberately online-only and irreversible. The claim
      // token becomes discoverable from the plain public tag URL so the
      // existing physical NFC tag can be claimed without being rewritten.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "release") {
        const limited = await enforceRateLimit(request, env, "updateIp");
        if (limited) return limited;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const writeKey = request.headers.get("X-Write-Key") || "";
        const claimToken = randomId(12);
        if (hasHexlaceCoordinator(env)) {
          const response = await callHexlaceCoordinator(env, readId, "/release", { writeKey, claimToken });
          return relayInternal(response);
        }
        const expected = await env.LISTS.get(`auth:${readId}`);
        const stored = await env.LISTS.get(`list:${readId}`);
        if (!expected || !stored) return json({ error: "Not found." }, 404);
        if (writeKey !== expected) return json({ error: "Invalid write key." }, 403);
        const current = JSON.parse(stored);
        const revision = (Number.isSafeInteger(current.revision) ? current.revision : 1) + 1;
        const released = serialize({ name: "Unclaimed Hexlace", sets: [], ping: null, friends: [] }, revision, env);
        await Promise.all([
          env.LISTS.put(`list:${readId}`, released, { expirationTtl: TTL_SECONDS }),
          env.LISTS.put(`claim:${readId}`, JSON.stringify({ token: claimToken, released: true }), { expirationTtl: TTL_SECONDS }),
          env.LISTS.delete(`auth:${readId}`)
        ]);
        return json({ ok: true, revision });
      }

      // Called only after Web NFC successfully writes the tap-specific URL.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "physical") {
        const limited = await enforceRateLimit(request, env, "updateIp");
        if (limited) return limited;
        const readId = parts[1];
        if (!isReadId(readId) || !hasHexlaceCoordinator(env)) return json({ error: "Not found." }, 404);
        const response = await callHexlaceCoordinator(env, readId, "/physical", {
          writeKey: request.headers.get("X-Write-Key") || ""
        });
        return relayInternal(response);
      }

      // A trade is a reciprocal NFC handshake. Both owners must enter trade
      // mode, tap the other physical tag, and confirm the matched pair.
      if (parts.length >= 3 && parts[2] === "trade") {
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        if (!hasHexlaceCoordinator(env)) return json({ error: "Trading is temporarily unavailable." }, 503);
        const writeKey = request.headers.get("X-Write-Key") || "";
        if (request.method === "POST" && parts.length === 3) {
          const limited = await enforceRateLimit(request, env, "updateIp");
          if (limited) return limited;
          const body = await readJson(request);
          const targetReadId = body && typeof body.targetReadId === "string" ? body.targetReadId : "";
          if (!isReadId(targetReadId) || targetReadId === readId) return json({ error: "Invalid trade target." }, 400);
          if (hasOwlInfrastructure(env)) {
            const targetTapToken = body && typeof body.targetTapToken === "string" ? body.targetTapToken : "";
            const tapped = await callHexlaceCoordinator(env, targetReadId, "/collect", { tapToken: targetTapToken });
            if (!tapped.ok) return relayInternal(tapped);
          }
          const targetStored = await env.LISTS.get(`list:${targetReadId}`);
          if (!targetStored) return json({ error: "That Hexlace is not available." }, 404);
          const response = await callHexlaceCoordinator(env, readId, "/trade", { writeKey, targetReadId });
          return relayInternal(response, data => ({ ...data, targetName: publicList(targetStored, env).name || "your friend" }));
        }
        if (request.method === "GET" && parts.length === 3) {
          const response = await callHexlaceCoordinator(env, readId, "/trade/read", { writeKey });
          return relayInternal(response);
        }
        if (request.method === "POST" && parts.length === 4 && parts[3] === "confirm") {
          const limited = await enforceRateLimit(request, env, "updateIp");
          if (limited) return limited;
          const response = await callHexlaceCoordinator(env, readId, "/trade/confirm", { writeKey });
          if (!response.ok) return relayInternal(response);
          const confirmed = await response.json();
          const targetReadId = confirmed?.targetReadId;
          if (!isReadId(targetReadId)) return json({ error: "Trade could not be completed." }, 409);
          const coordinatorReadId = [readId, targetReadId].sort()[0];
          const settledResponse = await callHexlaceCoordinator(env, coordinatorReadId, "/trade/settle");
          if (settledResponse.status === 202) return json({ completed: false });
          const settled = await settledResponse.json().catch(() => ({}));
          if (!settledResponse.ok || !settled.completed) return json(settled, settledResponse.status);
          const callerIsCoordinator = readId === settled.coordinatorReadId;
          const completed = {
            completed: true,
            readId: callerIsCoordinator ? settled.targetReadId : settled.coordinatorReadId,
            revision: callerIsCoordinator ? settled.targetRevision : settled.selfRevision
          };
          if (hasOwlInfrastructure(env)) {
            completed.owl = cleanOwl(callerIsCoordinator ? settled.targetOwl : settled.selfOwl);
            completed.tapToken = callerIsCoordinator ? settled.targetTapToken : settled.selfTapToken;
            completed.isPhysical = true;
          }
          return json(completed);
        }
        if (request.method === "POST" && parts.length === 4 && parts[3] === "cancel") {
          const response = await callHexlaceCoordinator(env, readId, "/trade/cancel", { writeKey });
          return relayInternal(response);
        }
      }

      // POST /lists/:readId/handoff — Safari proves ownership and receives a
      // random 24-hour token suitable for a first-party transfer cookie. The
      // raw write key is never stored in that cookie.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "handoff") {
        const limited = await enforceRateLimit(request, env, "updateIp");
        if (limited) return limited;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        if (hasHexlaceCoordinator(env)) {
          const token = `${readId}.${randomId(48)}`;
          const response = await callHexlaceCoordinator(env, readId, "/handoff", {
            writeKey: request.headers.get("X-Write-Key") || "",
            token
          });
          if (response.status !== 201) return relayInternal(response);
          return json({ token, expiresIn: HANDOFF_TTL_SECONDS }, 201);
        }
        const expected = await env.LISTS.get(`auth:${readId}`);
        if (!expected) return json({ error: "Not found." }, 404);
        if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
        const token = randomId(48);
        await env.LISTS.put(await handoffKey(token), readId, { expirationTtl: HANDOFF_TTL_SECONDS });
        return json({ token, expiresIn: HANDOFF_TTL_SECONDS }, 201);
      }

      // GET /lists/:readId — read a shared list.
      // A compact fallback when iOS does not copy the automatic handoff cookie
      // into the newly installed Home Screen app.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "connect-code") {
        const limited = await enforceRateLimit(request, env, "updateIp");
        if (limited) return limited;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const token = `${readId}.${randomId(8)}`;
        if (hasHexlaceCoordinator(env)) {
          const response = await callHexlaceCoordinator(env, readId, "/handoff", {
            writeKey: request.headers.get("X-Write-Key") || "",
            token
          });
          if (response.status !== 201) return relayInternal(response);
        } else {
          const expected = await env.LISTS.get(`auth:${readId}`);
          if (!expected) return json({ error: "Not found." }, 404);
          if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
          await env.LISTS.put(await handoffKey(token), readId, { expirationTtl: HANDOFF_TTL_SECONDS });
        }
        return json({ code: displayHandoffCode(token), expiresIn: HANDOFF_TTL_SECONDS }, 201);
      }

      // Private owner state keeps Safari and its installed app synchronized.
      // Collected friend ids are deliberately excluded from the public route.
      if (request.method === "GET" && parts.length === 3 && parts[2] === "owner") {
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        if (hasHexlaceCoordinator(env)) {
          const response = await callHexlaceCoordinator(env, readId, "/owner", {
            writeKey: request.headers.get("X-Write-Key") || ""
          });
          return relayInternal(response, data => {
            if (!data?.list) return data;
            return {
              ...publicList(JSON.stringify(data.list), env),
              friends: Array.isArray(data.list.friends) ? data.list.friends : [],
              ...(hasOwlInfrastructure(env) ? {
                profileId: data.profileId || null,
                profileKey: data.profileKey || null,
                owl: cleanOwl(data.owl),
                isPhysical: data.isPhysical === true,
                tapToken: data.tapToken || null
              } : {})
            };
          });
        }
        const [expected, stored] = await Promise.all([
          env.LISTS.get(`auth:${readId}`),
          env.LISTS.get(`list:${readId}`)
        ]);
        if (!expected || !stored) return json({ error: "Not found." }, 404);
        if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
        const list = JSON.parse(stored);
        return json({ ...publicList(stored, env), friends: Array.isArray(list.friends) ? list.friends : [] });
      }

      if (request.method === "GET" && parts.length === 2) {
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const stored = await env.LISTS.get(`list:${readId}`);
        if (!stored && hasHexlaceCoordinator(env)) {
          const response = await callHexlaceCoordinator(env, readId, "/read");
          if (response.status === 200) {
            const data = await response.json();
            const list = { ...data.list, ...(cleanOwl(data.owl) ? { owl: cleanOwl(data.owl) } : {}) };
            return json({ ...publicList(JSON.stringify(list), env), ...(data.claimToken ? { claimToken: data.claimToken } : {}) });
          }
        }
        if (!stored) return json({ error: "Not found." }, 404);
        const claim = parseClaimRecord(await env.LISTS.get(`claim:${readId}`));
        const publicClaim = claim?.released === true && !claim.ownerSet && !(await env.LISTS.get(`auth:${readId}`)) ? claim.token : null;
        return json({ ...publicList(stored, env), ...(publicClaim ? { claimToken: publicClaim } : {}) });
      }

      // PUT /lists/:readId — update a list; requires the secret write key.
      if (request.method === "PUT" && parts.length === 2) {
        const limitedByIp = await enforceRateLimit(request, env, "updateIp");
        if (limitedByIp) return limitedByIp;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        if (hasHexlaceCoordinator(env)) {
          const limitedByList = await enforceRateLimit(request, env, "updateList", readId);
          if (limitedByList) return limitedByList;
          const body = await readJson(request);
          const suppliedRevision = Number(body?.revision);
          const hasRevision = Object.prototype.hasOwnProperty.call(body || {}, "revision");
          if (hasRevision && (!Number.isSafeInteger(suppliedRevision) || suppliedRevision < 1)) {
            return json({ error: "Invalid list revision." }, 400);
          }
          const list = JSON.parse(serialize(cleanPayload(body), 1, env));
          let owlState = null;
          if (hasOwlInfrastructure(env)) {
            const requested = profileCredentials(body);
            const linkedResponse = await callHexlaceCoordinator(env, readId, "/profile/link", {
              writeKey: request.headers.get("X-Write-Key") || "",
              ...requested
            });
            if (!linkedResponse.ok) return relayInternal(linkedResponse);
            const linked = await linkedResponse.json();
            const credentials = validProfileCredentials(linked.profileId, linked.profileKey)
              ? { profileId: linked.profileId, profileKey: linked.profileKey }
              : requested;
            const owl = await qualifyProfile(env, {
              ...credentials,
              eligible: list.sets.length > 0,
              claimedReadId: linked.isPhysical === true ? readId : "",
              tagOwl: linked.isPhysical === true ? cleanOwl(linked.owl) : null
            });
            owlState = {
              ...credentials,
              owl,
              isPhysical: linked.isPhysical === true,
              tapToken: linked.tapToken || null
            };
          }
          const response = await callHexlaceCoordinator(env, readId, "/update", {
            writeKey: request.headers.get("X-Write-Key") || "",
            list,
            hasRevision,
            revision: suppliedRevision,
            force: body.force === true,
            ...(owlState || {})
          });
          return relayInternal(response, data => hasOwlInfrastructure(env) && data?.ok
            ? { ...data, ...owlState, owl: cleanOwl(data.owl) || cleanOwl(owlState?.owl) }
            : data);
        }
        const expected = await env.LISTS.get(`auth:${readId}`);
        if (!expected) return json({ error: "Not found." }, 404);
        if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
        const limitedByList = await enforceRateLimit(request, env, "updateList", readId);
        if (limitedByList) return limitedByList;
        const body = await readJson(request);
        const stored = await env.LISTS.get(`list:${readId}`);
        if (!stored) return json({ error: "Not found." }, 404);
        const current = JSON.parse(stored);
        const currentRevision = Number.isSafeInteger(current.revision) && current.revision > 0 ? current.revision : 1;
        const suppliedRevision = Number(body?.revision);
        const hasRevision = Object.prototype.hasOwnProperty.call(body || {}, "revision");
        if (hasRevision && (!Number.isSafeInteger(suppliedRevision) || suppliedRevision < 1)) {
          return json({ error: "Invalid list revision." }, 400);
        }
        if (hasRevision && suppliedRevision !== currentRevision && body.force !== true) {
          return json({ error: "This Hexlace changed in another app.", currentRevision }, 409);
        }
        const revision = currentRevision + 1;
        const payload = cleanPayload(body);
        if (payload.friends === undefined) payload.friends = Array.isArray(current.friends) ? current.friends : [];
        const blob = serialize(payload, revision, env);
        await env.LISTS.put(`list:${readId}`, blob, { expirationTtl: TTL_SECONDS });
        await env.LISTS.put(`auth:${readId}`, expected, { expirationTtl: TTL_SECONDS });
        return json({ ok: true, updated: JSON.parse(blob).updated, revision });
      }
    } catch (error) {
      if (typeof error === "string") return json({ error }, 400);
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error("Unexpected Worker error", error);
      return json({ error: "Internal server error." }, 500);
    }

    return json({ error: "Not found." }, 404);
  }
};
