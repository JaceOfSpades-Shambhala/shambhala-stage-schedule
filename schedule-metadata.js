// Machine-readable provenance and supplemental details that are not represented
// by the base schedule's start-time-only rows.
window.SCHEDULE_VERSION = "July 22 - AMP replacements: Benga for Rusko, Cool Customer for Whethan, Ravenscoon for Inzo";
window.SCHEDULE_SOURCE = {
  title: "Shambhala 2026 Set Times",
  kind: "official downloadable schedule",
  url: "https://www.shambhalamusicfestival.com/lineup",
  dataFile: "schedule-data.js",
  reviewed: "2026-07-22",
  note: "Base start times come from the downloadable schedule. July 17 cancellations use artist announcements, and the Sunday Grove circus slot comes from the festival app schedule. July 22 AMP replacements (Benga for Rusko, Cool Customer for Whethan, Ravenscoon for Inzo) were announced via the official Shambhala Instagram story. Final-stage end times below are inferred from the printed schedule bars."
};

// Cancellation records overlay the original schedule rows so existing saved-set
// identities keep their exact day, stage, time, and artist values.
window.SCHEDULE_CANCELLATIONS = Object.freeze([
  Object.freeze({
    day: "Friday",
    stageId: "amp",
    time: "12:00 AM",
    artist: "RUSKO",
    source: "https://www.instagram.com/rusko/"
  }),
  Object.freeze({
    day: "Saturday",
    stageId: "amp",
    time: "1:30 AM",
    artist: "WHETHAN",
    source: "https://edmidentity.com/2026/07/16/whethan-shambhala-oliver-tree-funeral/"
  }),
  Object.freeze({
    day: "Saturday",
    stageId: "amp",
    time: "11:00 PM",
    artist: "INZO",
    source: "https://www.instagram.com/shambhalamf/"
  })
]);

window.ScheduleStatus = (() => {
  const normalise = value => String(value || "").trim().toLocaleLowerCase();
  const setKey = item => [item?.day, item?.stageId, item?.time, item?.artist].map(normalise).join("\u001f");
  const cancellations = new Map(window.SCHEDULE_CANCELLATIONS.map(record => [setKey(record), record]));
  return Object.freeze({
    cancellation: item => cancellations.get(setKey(item)) || null,
    isCancelled: item => cancellations.has(setKey(item))
  });
})();

window.SCHEDULE_FINAL_END_TIMES = {
  Thursday: {
    amp: "2:30 AM",
    "living-room": "2:30 AM",
    pagoda: "2:30 AM"
  },
  Friday: {
    amp: "4:00 AM",
    "fractal-forest": "6:00 AM",
    grove: "6:00 AM",
    "living-room": "5:30 AM",
    pagoda: "6:00 AM",
    "secret-garden": "4:00 AM",
    village: "5:30 AM"
  },
  Saturday: {
    amp: "4:00 AM",
    "fractal-forest": "6:30 AM",
    grove: "6:00 AM",
    "living-room": "4:30 AM",
    pagoda: "6:00 AM",
    "secret-garden": "4:30 AM",
    village: "6:00 AM"
  },
  Sunday: {
    amp: "4:30 AM",
    "fractal-forest": "9:30 AM",
    grove: "7:00 AM",
    "living-room": "9:30 AM",
    pagoda: "6:30 AM",
    "secret-garden": "4:30 AM",
    village: "5:30 AM"
  }
};

// The PDF places this afternoon event before ORENDA. Keeping the correction
// here avoids hand-editing the generated one-line schedule-data.js payload.
const sundayAmp = window.SCHEDULE_DATA?.Sunday?.amp;
const afternoonSaloonIndex = sundayAmp?.findIndex(([, artist]) => artist === "AFTERNOON SALOON W/ MARIN PATENAUDE") ?? -1;
if (afternoonSaloonIndex >= 0) {
  const [afternoonSaloon] = sundayAmp.splice(afternoonSaloonIndex, 1);
  afternoonSaloon[0] = "4:30 PM";
  sundayAmp.unshift(afternoonSaloon);
}

// The festival app includes a short circus slot between Eva Lazarus and DRAMA
// that was omitted from the downloadable schedule transcription.
const sundayGrove = window.SCHEDULE_DATA?.Sunday?.grove;
const sundayGroveDramaIndex = sundayGrove?.findIndex(([, artist]) => artist === "DRAMA") ?? -1;
const hasSundayGroveCircus = sundayGrove?.some(([time, artist]) => time === "10:00 PM" && artist === "CIRCUS ACTS INSOMNIACS");
if (sundayGroveDramaIndex >= 0 && !hasSundayGroveCircus) {
  sundayGrove.splice(sundayGroveDramaIndex, 0, ["10:00 PM", "CIRCUS ACTS INSOMNIACS"]);
}
