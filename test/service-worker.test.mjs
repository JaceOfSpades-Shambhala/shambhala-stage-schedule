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

async function runInstall({ rejectedOptionalAsset }) {
  const listeners = new Map();
  const added = [];
  const context = {
    Response,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: async () => new Response("ok"),
    caches: {
      async open() {
        return {
          async addAll(assets) { added.push(...assets); },
          async add(asset) {
            if (asset === rejectedOptionalAsset) throw new Error("temporary asset failure");
            added.push(asset);
          },
          async put() {},
          async match() { return null; }
        };
      },
      async match() { return null; },
      async keys() { return []; },
      async delete() { return true; }
    },
    self: {
      location: { origin: "https://site.example.test" },
      addEventListener(type, listener) { listeners.set(type, listener); },
      async skipWaiting() {},
      clients: { claim() {} }
    }
  };
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, context);
  let installPromise;
  listeners.get("install")({ waitUntil(value) { installPromise = Promise.resolve(value); } });
  await installPromise;
  return added;
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

test("a failed optional precache asset does not block the offline shell install", async () => {
  const added = await runInstall({ rejectedOptionalAsset: "./stage-names/amp.png?v=77" });
  assert.ok(added.includes("./index.html"));
  assert.ok(added.includes("./hex-owl-playground.html"));
  assert.ok(added.includes("./camp-access.js?v=77"));
  assert.ok(added.includes("./hexlaces.js?v=77"));
  assert.ok(added.includes("./hexlace-compare.js?v=77"));
  assert.ok(added.includes("./hex-owl.js?v=77"));
  assert.ok(added.includes("./hex-owl-base.svg?v=77"));
  assert.ok(added.includes("./hexadex.js?v=77"));
  assert.equal(added.includes("./stage-names/amp.png?v=77"), false);
  assert.ok(added.includes("./stage-names/fractal-forest.png?v=77"));
});

test("background refresh is schedule-only and cache cleanup is app-scoped", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(source, /REFRESH_ASSETS = \["\.\/schedule-data\.js\?v=77", "\.\/schedule-metadata\.js\?v=77"\]/);
  assert.match(source, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(source, /OPTIONAL_CACHE_TIMEOUT_MS/);
  assert.match(source, /request\.mode === "navigate"/);
});
