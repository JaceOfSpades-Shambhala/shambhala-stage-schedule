import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const STAGES = [
  "amp",
  "fractal-forest",
  "grove",
  "living-room",
  "pagoda",
  "secret-garden",
  "village"
];
const DAYS = ["Thursday", "Friday", "Saturday", "Sunday"];
const FESTIVAL_DATES = {
  Thursday: "2026-07-23",
  Friday: "2026-07-24",
  Saturday: "2026-07-25",
  Sunday: "2026-07-26"
};
const FINAL_SET_WINDOW_MINUTES = 180;

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("schedule-metadata.js", "utf8"), context);
const data = context.window.SCHEDULE_DATA;
const isCancelledSet = item => context.window.ScheduleStatus.isCancelled(item);

function isAvailable(day, stage) {
  return Array.isArray(data[day]?.[stage]) && data[day][stage].length > 0;
}

function parseSetTime(time) {
  const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  assert.ok(match, `Bad time format: ${time}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

function dateToSerial(date) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function nowToKey(now) {
  return dateToSerial(now.date) * 1440 + now.minutes;
}

function buildStageTimeline(stageId) {
  const timeline = [];
  DAYS.forEach(day => {
    const entries = data[day]?.[stageId] || [];
    const baseDate = FESTIVAL_DATES[day];
    let rolloverDays = 0;
    let previousMinutes = -1;
    entries.forEach(([time, artist]) => {
      const minutes = parseSetTime(time);
      if (previousMinutes !== -1 && minutes < previousMinutes) rolloverDays += 1;
      previousMinutes = minutes;
      const date = addDays(baseDate, rolloverDays);
      const entry = { day, stageId, date, time, artist, key: dateToSerial(date) * 1440 + minutes };
      timeline.push({ ...entry, cancelled: isCancelledSet(entry) });
    });
  });
  return timeline.sort((a, b) => a.key - b.key);
}

function getNowPlayingStatus(stageId, now) {
  const nowKey = nowToKey(now);
  const timeline = buildStageTimeline(stageId);
  const nextIndex = timeline.findIndex(item => item.key > nowKey);
  const previous = nextIndex === -1 ? timeline.at(-1) : timeline[nextIndex - 1];
  const nextBoundary = nextIndex === -1 ? null : timeline[nextIndex];
  const next = nextIndex === -1 ? null : timeline.slice(nextIndex).find(item => !item.cancelled) || null;
  if (previous && previous.key <= nowKey) {
    if (previous.cancelled && nextBoundary) return { type: "cancelled", cancelled: previous, next, now };
    if (nextBoundary?.day === previous.day && next?.day === previous.day) return { type: "active", current: previous, next, now };
    if (nowKey - previous.key <= FINAL_SET_WINDOW_MINUTES) return { type: "final", current: previous, next, now };
  }
  if (next) return { type: "upcoming", next, now };
  return { type: "unavailable", now };
}

function getCurrentFestivalDay(now) {
  const date = now.minutes < 10 * 60 ? addDays(now.date, -1) : now.date;
  return DAYS.find(day => FESTIVAL_DATES[day] === date) || null;
}

function getCurrentScheduleDay(stageId, now) {
  const currentFestivalDay = getCurrentFestivalDay(now);
  if (currentFestivalDay && isAvailable(currentFestivalDay, stageId)) return currentFestivalDay;

  const status = getNowPlayingStatus(stageId, now);
  if (status.current?.day && isAvailable(status.current.day, stageId)) return status.current.day;
  if (status.next?.day && isAvailable(status.next.day, stageId)) {
    const nowSerial = dateToSerial(status.now.date);
    const start = dateToSerial(FESTIVAL_DATES.Thursday);
    const end = dateToSerial(addDays(FESTIVAL_DATES.Sunday, 1));
    if (nowSerial >= start && nowSerial <= end) return status.next.day;
  }
  return null;
}

function now(date, time) {
  const [hour, minute] = time.split(":").map(Number);
  return { date, minutes: hour * 60 + minute };
}

test("schedule data uses known stage ids and day labels", () => {
  assert.deepEqual(Object.keys(data), DAYS);
  for (const [day, stages] of Object.entries(data)) {
    for (const stage of Object.keys(stages)) {
      assert.ok(STAGES.includes(stage), `${day} has unknown stage ${stage}`);
    }
  }
});

test("2 AM Saturday morning still belongs to the Friday schedule", () => {
  const earlySaturday = now("2026-07-25", "02:00");
  assert.equal(getCurrentFestivalDay(earlySaturday), "Friday");
  assert.equal(getCurrentScheduleDay("amp", earlySaturday), "Friday");
});

test("8-10 AM keeps stages on the prior festival day when that stage has one", () => {
  const fridayMorning = now("2026-07-24", "09:00");
  assert.equal(getCurrentFestivalDay(fridayMorning), "Thursday");
  assert.equal(getCurrentScheduleDay("amp", fridayMorning), "Thursday");
  assert.equal(getCurrentScheduleDay("pagoda", fridayMorning), "Thursday");
});

test("8-10 AM falls forward only when the prior day has no stage schedule", () => {
  const fridayMorning = now("2026-07-24", "09:00");
  assert.equal(getCurrentScheduleDay("fractal-forest", fridayMorning), "Friday");
  assert.equal(getCurrentScheduleDay("village", fridayMorning), "Friday");
});

test("10 AM starts the calendar day's schedule selection", () => {
  const fridayTen = now("2026-07-24", "10:00");
  assert.equal(getCurrentFestivalDay(fridayTen), "Friday");
  assert.equal(getCurrentScheduleDay("amp", fridayTen), "Friday");
});

test("Monday morning remains Sunday until 10 AM", () => {
  const mondayMorning = now("2026-07-27", "09:00");
  assert.equal(getCurrentFestivalDay(mondayMorning), "Sunday");
  assert.equal(getCurrentScheduleDay("fractal-forest", mondayMorning), "Sunday");
  assert.equal(getCurrentScheduleDay("living-room", mondayMorning), "Sunday");
});

test("Benga fills Rusko's former AMP slot, now playing with Truth next", () => {
  const status = getNowPlayingStatus("amp", now("2026-07-25", "00:15"));
  assert.equal(status.type, "active");
  assert.equal(status.current.artist, "BENGA");
  assert.equal(status.next.artist, "TRUTH B2B PAV4N");
});

test("Ravenscoon fills Inzo's former AMP slot, now playing with Liquid Stranger next", () => {
  const status = getNowPlayingStatus("amp", now("2026-07-25", "23:15"));
  assert.equal(status.type, "active");
  assert.equal(status.current.artist, "RAVENSCOON");
  assert.equal(status.next.artist, "LIQUID STRANGER");
});

test("Cool Customer fills Whethan's former AMP slot, now playing with JKYL & HYDE next", () => {
  const status = getNowPlayingStatus("amp", now("2026-07-26", "01:45"));
  assert.equal(status.type, "active");
  assert.equal(status.current.artist, "COOL CUSTOMER");
  assert.equal(status.next.artist, "JKYL & HYDE");
});

test("Sunday Grove switches from the circus acts to DRAMA at 10:15 PM", () => {
  assert.equal(getNowPlayingStatus("grove", now("2026-07-26", "22:00")).current.artist, "CIRCUS ACTS INSOMNIACS");
  assert.equal(getNowPlayingStatus("grove", now("2026-07-26", "22:14")).current.artist, "CIRCUS ACTS INSOMNIACS");
  assert.equal(getNowPlayingStatus("grove", now("2026-07-26", "22:15")).current.artist, "DRAMA");
});
