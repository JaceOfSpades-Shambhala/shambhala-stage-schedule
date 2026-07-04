// Shambhala set-list sharing API — a tiny KV-backed store so a person can
// publish their set list under a permanent, unguessable read id (carried on an
// NFC tag or QR) that friends' phones pull live. A separate secret write key,
// held only on the owner's device, is required to update a list — so tapping
// someone's tag can only ever read, never overwrite.
//
// Routes:
//   POST /lists               -> create, returns { readId, writeKey } and, when
//                                the body has claimable:true, a one-time claimToken
//                                for pre-programmed giveaway tags
//   GET  /lists/:readId       -> read,   returns { name, sets, updated }
//   PUT  /lists/:readId       -> update, requires header X-Write-Key
//   POST /lists/:readId/claim -> exchange a claim token for the write key, once;
//                                lets a gifted tag's first owner take it over

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Write-Key",
  "Access-Control-Max-Age": "86400"
};

const TTL_SECONDS = 60 * 24 * 60 * 60; // lists expire 60 days after their last write
const MAX_SETS = 200;
const MAX_BYTES = 20000;
const MAX_NAME = 60;
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
    headers: { "Content-Type": "application/json", ...CORS }
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
      // POST /lists — create a new shared list.
      if (request.method === "POST" && parts.length === 1) {
        const body = await readJson(request);
        const blob = serialize(cleanPayload(body));
        let readId;
        for (let attempt = 0; attempt < 5; attempt++) {
          readId = randomId(8);
          if (!(await env.LISTS.get(`list:${readId}`))) break;
        }
        const writeKey = randomId(24);
        await env.LISTS.put(`list:${readId}`, blob, { expirationTtl: TTL_SECONDS });
        await env.LISTS.put(`auth:${readId}`, writeKey, { expirationTtl: TTL_SECONDS });
        const created = { readId, writeKey };
        if (body.claimable === true) {
          created.claimToken = randomId(12);
          await env.LISTS.put(`claim:${readId}`, created.claimToken, { expirationTtl: TTL_SECONDS });
        }
        return json(created, 201);
      }

      // POST /lists/:readId/claim — one-time write-key handoff for gifted tags.
      if (request.method === "POST" && parts.length === 3 && parts[2] === "claim") {
        const readId = parts[1];
        const expected = await env.LISTS.get(`claim:${readId}`);
        if (!expected) return json({ error: "Not claimable." }, 404);
        const body = await readJson(request);
        if (((body && body.claimToken) || "") !== expected) return json({ error: "Invalid claim token." }, 403);
        await env.LISTS.delete(`claim:${readId}`);
        const writeKey = await env.LISTS.get(`auth:${readId}`);
        return json({ writeKey });
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
        await env.LISTS.put(`auth:${readId}`, expected, { expirationTtl: TTL_SECONDS });
        return json({ ok: true, updated: JSON.parse(blob).updated });
      }
    } catch (message) {
      return json({ error: String(message) }, 400);
    }

    return json({ error: "Not found." }, 404);
  }
};
