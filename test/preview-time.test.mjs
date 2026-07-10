import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function parse(value) {
  const source = await readFile(new URL("../preview-time.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.parseSchedulePreview(value);
}

test("preview mode accepts only real times during the festival window", async () => {
  assert.deepEqual({ ...(await parse("2026-07-24T23:30")) }, { date: "2026-07-24", minutes: 1410 });
  assert.deepEqual({ ...(await parse("2026-07-27T02:00")) }, { date: "2026-07-27", minutes: 120 });
  assert.equal(await parse("2026-07-99T25:99"), null);
  assert.equal(await parse("2026-07-22T10:00"), null);
  assert.equal(await parse("not-a-time"), null);
});
