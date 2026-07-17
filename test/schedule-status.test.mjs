import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("schedule-metadata.js", "utf8"), context);

const { SCHEDULE_DATA: data, SCHEDULE_CANCELLATIONS: cancellations, ScheduleStatus: status } = context.window;

test("only Rusko and Whethan are marked cancelled", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(cancellations.map(({ day, stageId, time, artist }) => ({ day, stageId, time, artist })))),
    [
      { day: "Friday", stageId: "amp", time: "12:00 AM", artist: "RUSKO" },
      { day: "Saturday", stageId: "amp", time: "1:30 AM", artist: "WHETHAN" }
    ]
  );
  assert.equal(status.isCancelled({ day: "Friday", stageId: "amp", time: "12:00 AM", artist: "RUSKO" }), true);
  assert.equal(status.isCancelled({ day: "Saturday", stageId: "amp", time: "1:30 AM", artist: "WHETHAN" }), true);
});

test("INZO remains scheduled", () => {
  assert.equal(status.isCancelled({ day: "Saturday", stageId: "amp", time: "11:00 PM", artist: "INZO" }), false);
});

test("Sunday Grove includes the circus slot and omits the unnamed intermission DJ", () => {
  assert.ok(data.Sunday.grove.some(([time, artist]) => time === "10:00 PM" && artist === "CIRCUS ACTS INSOMNIACS"));
  assert.equal(data.Sunday["living-room"].some(([time, artist]) => time === "8:15 PM" && artist === "INTERMISSION DJ"), false);
});
