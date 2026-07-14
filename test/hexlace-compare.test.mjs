import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function compareHelper() {
  const source = await readFile(new URL("../hexlace-compare.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.HexlaceCompare;
}

test("Hexlace comparison returns only sets saved by both people on one day", async () => {
  const { sharedSets } = await compareHelper();
  const shared = { day: "Friday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO" };
  const mineOnly = { day: "Friday", stageId: "village", time: "10:00 PM", artist: "MY PICK" };
  const otherDay = { day: "Saturday", stageId: "amp", time: "11:00 PM", artist: "PEEKABOO" };
  assert.deepEqual(Array.from(sharedSets([shared, mineOnly, otherDay], [shared, otherDay], "Friday")), [shared]);
});

test("Hexlace comparison sorts after-midnight sets after evening sets and removes duplicates", async () => {
  const { sharedSets } = await compareHelper();
  const evening = { day: "Sunday", stageId: "pagoda", time: "11:30 PM", artist: "EVENING" };
  const morning = { day: "Sunday", stageId: "grove", time: "2:00 AM", artist: "MORNING" };
  const result = Array.from(sharedSets([morning, evening, evening], [morning, evening], "Sunday"));
  assert.deepEqual(result, [evening, morning]);
});

test("Hexlace comparison rejects days outside the four festival days", async () => {
  const { sharedSets } = await compareHelper();
  assert.deepEqual(Array.from(sharedSets([], [], "Monday")), []);
});
