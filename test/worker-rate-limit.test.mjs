import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.js";

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }

  async delete(key) {
    this.values.delete(key);
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

  for (let index = 0; index < 80; index += 1) {
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
