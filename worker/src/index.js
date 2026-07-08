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
//   GET  /lists/:readId       -> read,   returns { name, sets, updated }
//   PUT  /lists/:readId       -> update, requires header X-Write-Key
//   POST /lists/:readId/claim -> the recipient sends the claim token plus a
//                                write key THEY generated and the local time
//                                they first scanned it. The earliest scan wins,
//                                even if another phone reached the server first.

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
const MIN_KEY_LENGTH = 16;
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
// Base58-ish alphabet: no 0/O/1/l/I, so ids are safe to read aloud or retype.
const ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
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

// Validates and returns a clean { name, sets } payload, or throws a message.
function cleanPayload(body) {
  if (!body || typeof body !== "object") throw "Body must be a JSON object.";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw "A display name is required.";
  if (name.length > MAX_NAME) throw `Name must be ${MAX_NAME} characters or fewer.`;
  if (!Array.isArray(body.sets)) throw "sets must be an array.";
  if (body.sets.length > MAX_SETS) throw `Too many sets (max ${MAX_SETS}).`;
  return { name, sets: body.sets };
}

function serialize(payload) {
  const blob = JSON.stringify({ ...payload, updated: Date.now() });
  if (blob.length > MAX_BYTES) throw "List is too large.";
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

    if (parts[0] !== "lists") return json({ error: "Not found." }, 404);

    try {
      // POST /lists — create a list.
      if (request.method === "POST" && parts.length === 1) {
        const limited = await enforceRateLimit(request, env, "create");
        if (limited) return limited;
        const body = await readJson(request);
        const blob = serialize(cleanPayload(body));
        let readId;
        for (let attempt = 0; attempt < 5; attempt++) {
          readId = randomId(8);
          if (!(await env.LISTS.get(`list:${readId}`))) break;
        }
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

      // GET /lists/:readId — read a shared list.
      if (request.method === "GET" && parts.length === 2) {
        const stored = await env.LISTS.get(`list:${parts[1]}`);
        if (!stored) return json({ error: "Not found." }, 404);
        return new Response(stored, { headers: { "Content-Type": "application/json", ...CORS } });
      }

      // PUT /lists/:readId — update a list; requires the secret write key.
      if (request.method === "PUT" && parts.length === 2) {
        const limitedByIp = await enforceRateLimit(request, env, "updateIp");
        if (limitedByIp) return limitedByIp;
        const readId = parts[1];
        const expected = await env.LISTS.get(`auth:${readId}`);
        if (!expected) return json({ error: "Not found." }, 404);
        if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
        const limitedByList = await enforceRateLimit(request, env, "updateList", readId);
        if (limitedByList) return limitedByList;
        const blob = serialize(cleanPayload(await readJson(request)));
        await env.LISTS.put(`list:${readId}`, blob, { expirationTtl: TTL_SECONDS });
        return json({ ok: true, updated: JSON.parse(blob).updated });
      }
    } catch (message) {
      return json({ error: String(message) }, 400);
    }

    return json({ error: "Not found." }, 404);
  }
};
