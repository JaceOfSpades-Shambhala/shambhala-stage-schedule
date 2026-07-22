import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("schedule-metadata.js", "utf8"), context);

const { SCHEDULE_DATA: data, SCHEDULE_CANCELLATIONS: cancellations, ScheduleStatus: status } = context.window;

test("Rusko, Whethan, and Inzo are marked cancelled", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(cancellations.map(({ day, stageId, time, artist }) => ({ day, stageId, time, artist })))),
    [
      { day: "Friday", stageId: "amp", time: "12:00 AM", artist: "RUSKO" },
      { day: "Saturday", stageId: "amp", time: "1:30 AM", artist: "WHETHAN" },
      { day: "Saturday", stageId: "amp", time: "11:00 PM", artist: "INZO" }
    ]
  );
  assert.equal(status.isCancelled({ day: "Friday", stageId: "amp", time: "12:00 AM", artist: "RUSKO" }), true);
  assert.equal(status.isCancelled({ day: "Saturday", stageId: "amp", time: "1:30 AM", artist: "WHETHAN" }), true);
  assert.equal(status.isCancelled({ day: "Saturday", stageId: "amp", time: "11:00 PM", artist: "INZO" }), true);
});

test("Ravenscoon replaces the cancelled INZO", () => {
  assert.equal(status.isCancelled({ day: "Saturday", stageId: "amp", time: "11:00 PM", artist: "INZO" }), true);
  assert.equal(status.isCancelled({ day: "Saturday", stageId: "amp", time: "11:00 PM", artist: "RAVENSCOON" }), false);
  assert.ok(data.Saturday.amp.some(([time, artist]) => time === "11:00 PM" && artist === "RAVENSCOON"));
});

test("Sunday Grove includes the circus slot and omits the unnamed intermission DJ", () => {
  assert.ok(data.Sunday.grove.some(([time, artist]) => time === "10:00 PM" && artist === "CIRCUS ACTS INSOMNIACS"));
  assert.equal(data.Sunday["living-room"].some(([time, artist]) => time === "8:15 PM" && artist === "INTERMISSION DJ"), false);
});
