import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function normalise(value) {
  const source = await readFile(new URL("../search-normalize.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.normaliseScheduleSearch(value);
}

test("artist search folds combining accents and distinct Latin letters", async () => {
  assert.equal(await normalise("TORBJØRN"), "torbjorn");
  assert.equal(await normalise("BÆR & ŁUKASZ"), "baer & lukasz");
  assert.equal(await normalise("Beyoncé"), "beyonce");
  assert.equal(await normalise("  O’CONNOR  "), "o'connor");
});
