import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function requestGiveaway(api) {
  const source = await readFile(new URL("../hexlace-giveaway.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.requestHexlaceGiveaway(api);
}

test("giveaway creation turns a rejected API request into a retryable failed result", async () => {
  const result = await requestGiveaway(async () => { throw new DOMException("Timed out", "AbortError"); });
  assert.deepEqual({ ...result }, { ok: false, status: 0, body: null, networkError: true });
});

test("giveaway creation sends only the expected claimable-list payload", async () => {
  let captured;
  await requestGiveaway(async (path, options) => {
    captured = { path, method: options.method, body: JSON.parse(options.body) };
    return { ok: true, body: { readId: "abcdEFGH" } };
  });
  assert.deepEqual(captured, {
    path: "/lists",
    method: "POST",
    body: { name: "Unclaimed Hexlace", sets: [], claimable: true }
  });
});
