import assert from "node:assert/strict";
import test from "node:test";
import { loadPlannerHarness } from "./helpers/planner-harness.mjs";

const STORAGE_KEY = "shambhala-2026-my-set-list";
const PING_KEY = "shambhala-2026-ping";
const schedule = {
  Friday: {
    amp: [["9:00 PM", "First"], ["11:00 PM", "Corrected"], ["2:00 AM", "After Midnight"]]
  }
};

const set = (time, artist) => ({ day: "Friday", stageId: "amp", time, artist });

test("saved sets reconcile a unique corrected schedule time without changing the festival day", async () => {
  const harness = await loadPlannerHarness({
    schedule,
    savedSets: [set("10:30 PM", "Corrected"), set("2:00 AM", "After Midnight")]
  });
  const saved = JSON.parse(harness.localStorage.getItem(STORAGE_KEY));
  assert.deepEqual(saved, [set("11:00 PM", "Corrected"), set("2:00 AM", "After Midnight")]);
});

test("undo merges the removed set into newer planner state instead of restoring a stale snapshot", async () => {
  const harness = await loadPlannerHarness({ schedule, savedSets: [set("9:00 PM", "First"), set("11:00 PM", "Corrected")] });
  harness.plannerList.querySelector(".planner-remove").click();
  const undo = harness.takeUndo();
  assert.equal(typeof undo, "function");

  harness.localStorage.setItem(STORAGE_KEY, JSON.stringify([set("11:00 PM", "Corrected"), set("2:00 AM", "After Midnight")]));
  undo();
  assert.deepEqual(JSON.parse(harness.localStorage.getItem(STORAGE_KEY)), [
    set("9:00 PM", "First"), set("11:00 PM", "Corrected"), set("2:00 AM", "After Midnight")
  ]);
});

test("a failed planner removal does not clear its ping or offer a false Undo", async () => {
  const first = set("9:00 PM", "First");
  const festivalDate = Math.floor(Date.UTC(2026, 6, 24) / 86400000) * 1440;
  const ping = { type: "set", ...first, startKey: festivalDate + 21 * 60, endKey: festivalDate + 22 * 60 + 30 };
  const harness = await loadPlannerHarness({ schedule, savedSets: [first], ping });
  harness.setWriteFailure(true);
  harness.plannerList.querySelector(".planner-remove").click();

  assert.equal(harness.takeUndo(), null);
  assert.deepEqual(JSON.parse(harness.localStorage.getItem(STORAGE_KEY)), [first]);
  assert.deepEqual(JSON.parse(harness.localStorage.getItem(PING_KEY)), ping);
});
