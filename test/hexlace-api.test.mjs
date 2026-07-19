import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function helper() {
  const source = await readFile(new URL("../hexlace-api.js", import.meta.url), "utf8");
  const context = { window: { setTimeout, clearTimeout }, AbortController, fetch };
  vm.runInNewContext(source, context);
  return context.window.fetchHexlaceApi;
}

test("Hexlace requests abort after their configured timeout", async () => {
  const request = await helper();
  let aborted = false;
  const stalledFetch = (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Timed out", "AbortError"));
    });
  });
  await assert.rejects(request("https://api.example.test/lists", {}, 10, stalledFetch), { name: "AbortError" });
  assert.equal(aborted, true);
});

test("Hexlace requests preserve supplied options when they complete", async () => {
  const request = await helper();
  const response = await request("https://api.example.test/lists", { method: "POST", headers: { "X-Test": "yes" } }, 50, async (_url, options) => {
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-Test"], "yes");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response("ok");
  });
  assert.equal(await response.text(), "ok");
});

test("Hexlace requests attach confirmed camp bearer access without replacing caller headers", async () => {
  const source = await readFile(new URL("../hexlace-api.js", import.meta.url), "utf8");
  const context = {
    window: {
      setTimeout,
      clearTimeout,
      CampAccess: { authorizationHeaders: () => ({ Authorization: "Bearer admin-device-key" }) }
    },
    AbortController,
    fetch
  };
  vm.runInNewContext(source, context);
  await context.window.fetchHexlaceApi("https://api.example.test/lists", { headers: { "X-Write-Key": "owner" } }, 50, async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer admin-device-key");
    assert.equal(options.headers["X-Write-Key"], "owner");
    return new Response("ok");
  });
});
