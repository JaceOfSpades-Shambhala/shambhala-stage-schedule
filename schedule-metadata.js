// Machine-readable provenance and PDF-derived details that are not represented
// by the source schedule's start-time-only rows.
window.SCHEDULE_VERSION = "July 13 - PDF end times and Sunday AMP correction";
window.SCHEDULE_SOURCE = {
  title: "Shambhala 2026 Set Times",
  kind: "official downloadable schedule",
  url: "https://www.shambhalamusicfestival.com/lineup",
  dataFile: "schedule-data.js",
  reviewed: "2026-07-13",
  note: "Start times are transcribed in schedule-data.js; final-stage end times below are inferred from the printed schedule bars."
};

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
