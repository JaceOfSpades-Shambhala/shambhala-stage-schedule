import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.js";

class MemoryKv {
  constructor() {
    this.values = new Map();
    this.writes = [];
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value, options) {
    this.values.set(key, String(value));
    this.writes.push({ key, value: String(value), options });
  }

  async delete(key) {
    this.values.delete(key);
  }
}

class CollidingListKv extends MemoryKv {
  async get(key) {
    if (key.startsWith("list:")) return "occupied";
    return super.get(key);
  }
}

function makeRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("CF-Connecting-IP")) headers.set("CF-Connecting-IP", "203.0.113.10");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Request(`https://api.example.test${path}`, { ...options, headers });
}

test("create endpoint returns 429 after its write limit", async () => {
  const env = { LISTS: new MemoryKv() };
  const body = JSON.stringify({ name: "Tester", sets: [] });

  for (let index = 0; index < 120; index += 1) {
    const response = await worker.fetch(makeRequest("/lists", { method: "POST", body }), env);
    assert.equal(response.status, 201);
  }

  const blocked = await worker.fetch(makeRequest("/lists", { method: "POST", body }), env);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "300");
  assert.match(await blocked.text(), /Too many requests/);
});

test("earlier local scan can claim after a later scan reached the server first", async () => {
  const env = { LISTS: new MemoryKv() };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Unclaimed Hexlace", sets: [], claimable: true })
  }), env);
  assert.equal(created.status, 201);
  const { readId, claimToken } = await created.json();

  const laterClaim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimToken, writeKey: "later-write-key-123", scannedAt: 2000 })
  }), env);
  assert.deepEqual(await laterClaim.json(), { ok: true, accepted: true });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "later-write-key-123");

  const earlierClaim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.11" },
    body: JSON.stringify({ claimToken, writeKey: "earlier-write-key-123", scannedAt: 1000 })
  }), env);
  assert.deepEqual(await earlierClaim.json(), { ok: true, accepted: true });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "earlier-write-key-123");

  const tooLateClaim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.12" },
    body: JSON.stringify({ claimToken, writeKey: "too-late-write-key", scannedAt: 3000 })
  }), env);
  assert.deepEqual(await tooLateClaim.json(), { ok: true, accepted: false });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "earlier-write-key-123");
});

test("ownership locks once the 24h contention window closes", async () => {
  const env = { LISTS: new MemoryKv() };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Unclaimed Hexlace", sets: [], claimable: true })
  }), env);
  const { readId, claimToken } = await created.json();

  const claim = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimToken, writeKey: "owner-write-key-1234", scannedAt: 2000 })
  }), env);
  assert.deepEqual(await claim.json(), { ok: true, accepted: true });

  // Age the first claim past the contention window, then try an
  // earlier-scan takeover - it must be refused and the key untouched.
  const record = JSON.parse(await env.LISTS.get(`claim:${readId}`));
  record.claimedAt = Date.now() - (24 * 60 * 60 * 1000 + 60000);
  await env.LISTS.put(`claim:${readId}`, JSON.stringify(record));

  const staleTakeover = await worker.fetch(makeRequest(`/lists/${readId}/claim`, {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.13" },
    body: JSON.stringify({ claimToken, writeKey: "hijack-write-key-1234", scannedAt: 1 })
  }), env);
  assert.deepEqual(await staleTakeover.json(), { ok: true, accepted: false });
  assert.equal(await env.LISTS.get(`auth:${readId}`), "owner-write-key-1234");
});

test("list payloads are normalized and successful updates renew the write key TTL", async () => {
  const env = { LISTS: new MemoryKv() };
  const set = { day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO", ignored: "not stored" };
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "  Tester  ", sets: [set] })
  }), env);
  assert.equal(created.status, 201);
  const { readId, writeKey } = await created.json();

  const updated = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [set] })
  }), env);
  assert.equal(updated.status, 200);
  const authWrites = env.LISTS.writes.filter(write => write.key === `auth:${readId}`);
  assert.equal(authWrites.at(-1).options.expirationTtl, 60 * 24 * 60 * 60);

  const read = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  assert.equal(read.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await read.json()).sets, [{ day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO" }]);
});

test("fixed-location and saved-set pings are normalized while malformed pings are rejected", async () => {
  const env = { LISTS: new MemoryKv() };
  const set = { day: "Friday", stageId: "pagoda", time: "2:00 PM", artist: "TEST ARTIST" };
  const startKey = 29748000;
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({
      name: "Tester",
      sets: [set],
      ping: { type: "set", ...set, startKey, endKey: startKey + 60, ignored: "not stored" }
    })
  }), env);
  assert.equal(created.status, 201);
  const { readId, writeKey } = await created.json();

  const read = await worker.fetch(makeRequest(`/lists/${readId}`), env);
  assert.deepEqual((await read.json()).ping, { type: "set", ...set, startKey, endKey: startKey + 60 });

  const camp = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [set], ping: { type: "camp", startKey, endKey: startKey + 90 } })
  }), env);
  assert.equal(camp.status, 200);

  for (const location of ["river", "vendors"]) {
    const locationUpdate = await worker.fetch(makeRequest(`/lists/${readId}`, {
      method: "PUT",
      headers: { "X-Write-Key": writeKey },
      body: JSON.stringify({ name: "Tester", sets: [set], ping: { type: location, startKey, endKey: startKey + 30 } })
    }), env);
    assert.equal(locationUpdate.status, 200);
    const locationRead = await worker.fetch(makeRequest(`/lists/${readId}`), env);
    assert.deepEqual((await locationRead.json()).ping, { type: location, startKey, endKey: startKey + 30 });
  }

  const invalidDuration = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [set], ping: { type: "camp", startKey, endKey: startKey + 45 } })
  }), env);
  assert.equal(invalidDuration.status, 400);

  const unsavedSet = await worker.fetch(makeRequest(`/lists/${readId}`, {
    method: "PUT",
    headers: { "X-Write-Key": writeKey },
    body: JSON.stringify({ name: "Tester", sets: [], ping: { type: "set", ...set, startKey, endKey: startKey + 60 } })
  }), env);
  assert.equal(unsavedSet.status, 400);
});

test("malformed set data and exhausted generated IDs never create or overwrite a list", async () => {
  const malformedEnv = { LISTS: new MemoryKv() };
  const malformed = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets: [{ day: "Monday", stageId: "amp", time: "25:00 PM", artist: "" }] })
  }), malformedEnv);
  assert.equal(malformed.status, 400);
  assert.match(await malformed.text(), /Each set needs a valid day/);

  const collisionEnv = { LISTS: new CollidingListKv() };
  const collision = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets: [] })
  }), collisionEnv);
  assert.equal(collision.status, 503);
  assert.equal(collisionEnv.LISTS.writes.some(write => write.key.startsWith("list:")), false);
});

test("24-hour handoff tokens transfer ownership once without storing the raw write key", async () => {
  const env = { LISTS: new MemoryKv() };
  const sets = [{ day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO" }];
  const created = await worker.fetch(makeRequest("/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Tester", sets })
  }), env);
  const { readId, writeKey } = await created.json();

  const forbidden = await worker.fetch(makeRequest(`/lists/${readId}/handoff`, {
    method: "POST",
    headers: { "X-Write-Key": "wrong-write-key-1234" }
  }), env);
  assert.equal(forbidden.status, 403);

  const handoff = await worker.fetch(makeRequest(`/lists/${readId}/handoff`, {
    method: "POST",
    headers: { "X-Write-Key": writeKey }
  }), env);
  assert.equal(handoff.status, 201);
  const { token, expiresIn } = await handoff.json();
  assert.equal(expiresIn, 24 * 60 * 60);
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 24);

  const transferWrite = env.LISTS.writes.find(write => write.key.startsWith("handoff:"));
  assert.ok(transferWrite);
  assert.equal(transferWrite.options.expirationTtl, 24 * 60 * 60);
  assert.equal(transferWrite.key.includes(token), false);
  assert.equal(transferWrite.value, readId);
  assert.equal(transferWrite.value.includes(writeKey), false);

  const redeemed = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    body: JSON.stringify({ token })
  }), env);
  assert.equal(redeemed.status, 200);
  assert.deepEqual(await redeemed.json(), { readId, writeKey, name: "Tester", sets, ping: null });

  const replayed = await worker.fetch(makeRequest("/handoffs/redeem", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.20" },
    body: JSON.stringify({ token })
  }), env);
  assert.equal(replayed.status, 410);
});
