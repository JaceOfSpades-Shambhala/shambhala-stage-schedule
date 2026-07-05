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
//                                write key THEY generated; the server records it
//                                and burns the token. First valid claim wins,
//                                which lets the claimer own the tag offline (the
//                                claim is retried until it lands).

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
          await env.LISTS.put(`claim:${readId}`, claimToken, { expirationTtl: TTL_SECONDS });
          return json({ readId, claimToken }, 201);
        }
        const writeKey = randomId(24);
        await env.LISTS.put(`auth:${readId}`, writeKey, { expirationTtl: TTL_SECONDS });
        return json({ readId, writeKey }, 201);
      }

      // POST /lists/:readId/claim — the recipient records the write key they
      // generated. First valid claim wins and burns the token.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "claim") {
        const readId = parts[1];
        const expected = await env.LISTS.get(`claim:${readId}`);
        if (!expected) return json({ error: "Already claimed or not claimable." }, 409);
        const body = await readJson(request);
        if (((body && body.claimToken) || "") !== expected) return json({ error: "Invalid claim token." }, 403);
        const writeKey = body && typeof body.writeKey === "string" ? body.writeKey : "";
        if (writeKey.length < MIN_KEY_LENGTH) return json({ error: "A valid write key is required." }, 400);
        await env.LISTS.put(`auth:${readId}`, writeKey, { expirationTtl: TTL_SECONDS });
        await env.LISTS.delete(`claim:${readId}`);
        return json({ ok: true });
      }

      // GET /lists/:readId — read a shared list.
      if (request.method === "GET" && parts.length === 2) {
        const stored = await env.LISTS.get(`list:${parts[1]}`);
        if (!stored) return json({ error: "Not found." }, 404);
        return new Response(stored, { headers: { "Content-Type": "application/json", ...CORS } });
      }

      // PUT /lists/:readId — update a list; requires the secret write key.
      if (request.method === "PUT" && parts.length === 2) {
        const readId = parts[1];
        const expected = await env.LISTS.get(`auth:${readId}`);
        if (!expected) return json({ error: "Not found." }, 404);
        if ((request.headers.get("X-Write-Key") || "") !== expected) return json({ error: "Invalid write key." }, 403);
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
