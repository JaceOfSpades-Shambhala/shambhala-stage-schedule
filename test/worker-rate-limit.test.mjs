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
