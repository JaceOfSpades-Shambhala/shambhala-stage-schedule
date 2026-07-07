import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const DAYS = ["Thursday", "Friday", "Saturday", "Sunday"];
const STAGES = new Set([
  "amp",
  "fractal-forest",
  "grove",
  "living-room",
  "pagoda",
  "secret-garden",
  "village"
]);
const TIME_PATTERN = /^(1[0-2]|[1-9]):([0-5]\d)\s(AM|PM)$/;

function loadSchedule() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
  assert.ok(context.window.SCHEDULE_VERSION, "SCHEDULE_VERSION is required.");
  assert.ok(context.window.SCHEDULE_DATA, "SCHEDULE_DATA is required.");
  return context.window.SCHEDULE_DATA;
}

function parseMinutes(time) {
  const match = TIME_PATTERN.exec(time);
  assert.ok(match, `Bad time format: "${time}". Use h:mm AM/PM, for example 2:30 AM.`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3];
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

function validateSchedule(data) {
  const dayKeys = Object.keys(data);
  assert.deepEqual(dayKeys, DAYS, `Schedule days must be exactly: ${DAYS.join(", ")}.`);

  const globalSetKeys = new Set();
  for (const day of DAYS) {
    const stages = data[day];
    assert.ok(stages && typeof stages === "object" && !Array.isArray(stages), `${day} must contain a stage map.`);

    for (const [stageId, sets] of Object.entries(stages)) {
      assert.ok(STAGES.has(stageId), `${day} has unknown stage id "${stageId}".`);
      assert.ok(Array.isArray(sets), `${day} ${stageId} must be an array.`);
      assert.ok(sets.length > 0, `${day} ${stageId} should be omitted instead of present with no sets.`);

      let previousMinutes = -1;
      let hasRolledToMorning = false;
      const localTimes = new Set();

      sets.forEach((entry, index) => {
        assert.ok(Array.isArray(entry) && entry.length === 2, `${day} ${stageId} set ${index + 1} must be [time, artist].`);
        const [time, artist] = entry;
        assert.equal(typeof time, "string", `${day} ${stageId} set ${index + 1} time must be a string.`);
        assert.equal(typeof artist, "string", `${day} ${stageId} ${time} artist must be a string.`);
        assert.ok(artist.trim(), `${day} ${stageId} ${time} artist cannot be blank.`);
        assert.equal(artist, artist.trim(), `${day} ${stageId} ${time} artist has leading/trailing spaces.`);

        const minutes = parseMinutes(time);
        if (previousMinutes !== -1 && minutes < previousMinutes) {
          assert.ok(!hasRolledToMorning, `${day} ${stageId} has more than one time rollover.`);
          assert.ok(previousMinutes >= 12 * 60 && minutes < 12 * 60, `${day} ${stageId} rolls over outside a PM-to-AM transition.`);
          hasRolledToMorning = true;
        }
        if (hasRolledToMorning) assert.ok(minutes < 12 * 60, `${day} ${stageId} has a PM set after the overnight rollover.`);
        previousMinutes = minutes;

        const localKey = `${time}|${artist.toUpperCase()}`;
        assert.ok(!localTimes.has(localKey), `${day} ${stageId} duplicates ${time} ${artist}.`);
        localTimes.add(localKey);

        const globalKey = `${day}|${stageId}|${time}|${artist.toUpperCase()}`;
        assert.ok(!globalSetKeys.has(globalKey), `Duplicate schedule row: ${globalKey}.`);
        globalSetKeys.add(globalKey);
      });
    }
  }
}

validateSchedule(loadSchedule());
console.log("Schedule validation passed.");
