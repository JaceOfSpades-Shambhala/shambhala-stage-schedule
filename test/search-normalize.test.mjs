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

async function sortKey(day, time) {
  const source = await readFile(new URL("../search-normalize.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.scheduleFestivalSortKey(day, time);
}

test("artist search folds combining accents and distinct Latin letters", async () => {
  assert.equal(await normalise("TORBJØRN"), "torbjorn");
  assert.equal(await normalise("BÆR & ŁUKASZ"), "baer & lukasz");
  assert.equal(await normalise("Beyoncé"), "beyonce");
  assert.equal(await normalise("  O’CONNOR  "), "o'connor");
});

test("search ordering keeps after-midnight sets with their printed festival day", async () => {
  const thursdayTwoAm = await sortKey("Thursday", "2:00 AM");
  const fridayNoon = await sortKey("Friday", "12:00 PM");
  const fridayTwoAm = await sortKey("Friday", "2:00 AM");
  const saturdayNoon = await sortKey("Saturday", "12:00 PM");

  assert.ok(thursdayTwoAm < fridayNoon, "Thursday 2 AM stays at the end of Thursday, before Friday begins.");
  assert.ok(fridayNoon < fridayTwoAm, "Friday 2 AM sorts after Friday afternoon and evening sets.");
  assert.ok(fridayTwoAm < saturdayNoon, "Friday 2 AM remains in Friday's section, before Saturday begins.");
});
