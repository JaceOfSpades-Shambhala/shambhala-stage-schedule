import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function runFetch({ networkResponse, cachedResponse, mode = "navigate" }) {
  const listeners = new Map();
  const cache = { async put() {}, async match() { return cachedResponse || null; } };
  const context = {
    Response,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: async () => networkResponse,
    caches: {
      async open() { return cache; },
      async match() { return cachedResponse || null; },
      async keys() { return []; },
      async delete() { return true; }
    },
    self: {
      location: { origin: "https://site.example.test" },
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting() {},
      clients: { claim() {} }
    }
  };
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, context);
  let responsePromise;
  const waits = [];
  listeners.get("fetch")({
    request: new Request("https://site.example.test/index.html", { method: "GET" }),
    respondWith(value) { responsePromise = Promise.resolve(value); },
    waitUntil(value) { waits.push(Promise.resolve(value)); }
  });
  const response = await responsePromise;
  await Promise.all(waits);
  return response;
}

test("a fast server error falls back to a cached navigation", async () => {
  const cached = new Response("cached page", { status: 200 });
  const response = await runFetch({ networkResponse: new Response("unavailable", { status: 503 }), cachedResponse: cached });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "cached page");
});

test("a successful network response remains preferred", async () => {
  const response = await runFetch({ networkResponse: new Response("fresh page", { status: 200 }), cachedResponse: new Response("cached page") });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "fresh page");
});
