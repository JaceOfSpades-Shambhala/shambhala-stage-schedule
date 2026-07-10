// Shambhala set-list sharing API — a tiny KV-backed store so a person can
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
//   POST /lists/:readId/handoff -> create a 24-hour, single-use PWA transfer
//   POST /handoffs/redeem       -> exchange that opaque token for ownership

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Write-Key",
  "Access-Control-Max-Age": "86400"
};

const TTL_SECONDS = 60 * 24 * 60 * 60; // lists expire 60 days after their last write
const MAX_SETS = 100;
const MAX_BYTES = 20000;
const MAX_NAME = 60;
const MAX_ARTIST_LENGTH = 120;
const MAX_SET_PING_MINUTES = 12 * 60;
const LOCATION_PING_MINUTES = new Set([30, 60, 90]);
const VALID_PING_LOCATIONS = new Set(["camp", "river", "vendors"]);
const MIN_KEY_LENGTH = 16;
const READ_ID_LENGTH = 8;
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
// After the first successful claim, an earlier-scan takeover is honoured only
// this long. It covers the real offline race (camp-mate taps before the owner
// gets signal) without leaving the write key stealable forever by anyone who
// once saw the tag's claim token.
const CLAIM_CONTENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const HANDOFF_TTL_SECONDS = 24 * 60 * 60;
// Base58-ish alphabet: no 0/O/1/l/I, so ids are safe to read aloud or retype.
const ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function isReadId(value) {
  return typeof value === "string" && value.length === READ_ID_LENGTH && [...value].every(character => ID_ALPHABET.includes(character));
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

async function checkRateLimit(env, key, limit, windowSeconds) {
  const slot = Math.floor(Date.now() / 1000 / windowSeconds);
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
  return { name, sets, ping: cleanPing(body.ping, sets) };
}

function serialize(payload) {
  const blob = JSON.stringify({ ...payload, updated: Date.now() });
  if (new TextEncoder().encode(blob).byteLength > MAX_BYTES) throw "List is too large.";
  return blob;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw "Invalid JSON.";
  }
}

function parseClaimRecord(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && typeof parsed.token === "string") return parsed;
  } catch {}
  return { token: value };
}

function cleanScannedAt(value) {
  const scannedAt = Number(value);
  return Number.isFinite(scannedAt) && scannedAt > 0 ? scannedAt : Date.now();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const parts = new URL(request.url).pathname.split("/").filter(Boolean);

    if (request.method === "GET" && parts.length === 0) {
      return new Response("Shambhala set-list sharing API.", { headers: CORS });
    }

    try {
      // POST /handoffs/redeem — the installed PWA consumes the cookie copied
      // by iOS and receives the existing owner identity. The KV record holds
      // only a hash of the opaque token and is removed before credentials are
      // returned, making normal redemption single-use.
      if (request.method === "POST" && parts.length === 2 && parts[0] === "handoffs" && parts[1] === "redeem") {
        const limited = await enforceRateLimit(request, env, "claim");
        if (limited) return limited;
        const body = await readJson(request);
        const token = body && typeof body.token === "string" ? body.token.trim() : "";
        if (token.length < 24 || token.length > 128) return json({ error: "Invalid or expired handoff." }, 410);
        const key = await handoffKey(token);
        const readId = await env.LISTS.get(key);
        if (!isReadId(readId)) return json({ error: "Invalid or expired handoff." }, 410);
        await env.LISTS.delete(key);
        const [writeKey, stored] = await Promise.all([
          env.LISTS.get(`auth:${readId}`),
          env.LISTS.get(`list:${readId}`)
        ]);
        if (!writeKey || !stored) return json({ error: "Invalid or expired handoff." }, 410);
        const list = JSON.parse(stored);
        return json({ readId, writeKey, name: list.name || "", sets: Array.isArray(list.sets) ? list.sets : [], ping: list.ping || null });
      }

      if (parts[0] !== "lists") return json({ error: "Not found." }, 404);

      // POST /lists — create a list.
      if (request.method === "POST" && parts.length === 1) {
        const limited = await enforceRateLimit(request, env, "create");
        if (limited) return limited;
        const body = await readJson(request);
        const blob = serialize(cleanPayload(body));
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
          return json({ readId, claimToken }, 201);
        }
        const writeKey = randomId(24);
        await env.LISTS.put(`auth:${readId}`, writeKey, { expirationTtl: TTL_SECONDS });
        return json({ readId, writeKey }, 201);
      }

      // POST /lists/:readId/claim — the recipient records the write key they
      // generated. If multiple phones scan before signal, the earliest local
      // scan time wins even when it reaches the server later.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "claim") {
        const limited = await enforceRateLimit(request, env, "claim");
        if (limited) return limited;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const claim = parseClaimRecord(await env.LISTS.get(`claim:${readId}`));
        if (!claim) return json({ error: "Not claimable." }, 409);
        const body = await readJson(request);
        if (((body && body.claimToken) || "") !== claim.token) return json({ error: "Invalid claim token." }, 403);
        const writeKey = body && typeof body.writeKey === "string" ? body.writeKey : "";
        if (writeKey.length < MIN_KEY_LENGTH) return json({ error: "A valid write key is required." }, 400);
        const scannedAt = cleanScannedAt(body && body.scannedAt);
        const previousScannedAt = Number.isFinite(Number(claim.scannedAt)) ? Number(claim.scannedAt) : Infinity;
        // firstClaimedAt never advances on takeovers, so the whole contention
        // period is bounded to the window after the very first claim.
        const firstClaimedAt = Number.isFinite(Number(claim.claimedAt)) ? Number(claim.claimedAt) : null;
        const contentionOpen = firstClaimedAt === null || Date.now() - firstClaimedAt < CLAIM_CONTENTION_WINDOW_MS;
        const accepted = !claim.ownerSet || (contentionOpen && scannedAt <= previousScannedAt);
        if (accepted) {
          await env.LISTS.put(`auth:${readId}`, writeKey, { expirationTtl: TTL_SECONDS });
          await env.LISTS.put(`claim:${readId}`, JSON.stringify({
            token: claim.token,
            scannedAt,
            claimedAt: firstClaimedAt ?? Date.now(),
            ownerSet: true
          }), { expirationTtl: TTL_SECONDS });
        }
        return json({ ok: true, accepted });
      }

      // POST /lists/:readId/handoff — Safari proves ownership and receives a
      // random 24-hour token suitable for a first-party transfer cookie. The
      // raw write key is never stored in that cookie or the handoff KV record.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "handoff") {
        const limited = await enforceRateLimit(request, env, "updateIp");
        if (limited) return limited;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const expected = await env.LISTS.get(`auth:${readId}`);
        if (!expected) return json({ error: "Not found." }, 404);
        if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
        const token = randomId(48);
        await env.LISTS.put(await handoffKey(token), readId, { expirationTtl: HANDOFF_TTL_SECONDS });
        return json({ token, expiresIn: HANDOFF_TTL_SECONDS }, 201);
      }

      // GET /lists/:readId — read a shared list.
      if (request.method === "GET" && parts.length === 2) {
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const stored = await env.LISTS.get(`list:${readId}`);
        if (!stored) return json({ error: "Not found." }, 404);
        return new Response(stored, { headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", ...CORS } });
      }

      // PUT /lists/:readId — update a list; requires the secret write key.
      if (request.method === "PUT" && parts.length === 2) {
        const limitedByIp = await enforceRateLimit(request, env, "updateIp");
        if (limitedByIp) return limitedByIp;
        const readId = parts[1];
        if (!isReadId(readId)) return json({ error: "Not found." }, 404);
        const expected = await env.LISTS.get(`auth:${readId}`);
        if (!expected) return json({ error: "Not found." }, 404);
        if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
        const limitedByList = await enforceRateLimit(request, env, "updateList", readId);
        if (limitedByList) return limitedByList;
        const blob = serialize(cleanPayload(await readJson(request)));
        await env.LISTS.put(`list:${readId}`, blob, { expirationTtl: TTL_SECONDS });
        await env.LISTS.put(`auth:${readId}`, expected, { expirationTtl: TTL_SECONDS });
        return json({ ok: true, updated: JSON.parse(blob).updated });
      }
    } catch (message) {
      return json({ error: String(message) }, 400);
    }

    return json({ error: "Not found." }, 404);
  }
};
