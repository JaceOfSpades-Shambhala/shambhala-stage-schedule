// Keep artist search forgiving when a phone keyboard cannot easily enter
// letters used in an artist's name. NFD handles combining marks; this map
// covers distinct Latin letters that do not decompose, such as ø and ł.
(() => {
  const TRANSLITERATION = {
    "ß": "ss", "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe",
    "Ø": "O", "ø": "o", "Ð": "D", "ð": "d", "Þ": "TH", "þ": "th",
    "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h",
    "Ĳ": "IJ", "ĳ": "ij", "Ŋ": "N", "ŋ": "n", "Ŧ": "T", "ŧ": "t"
  };

  window.normaliseScheduleSearch = value => String(value ?? "")
    .replace(/[ßÆæŒœØøÐðÞþŁłĐđĦħĲĳŊŋŦŧ]/g, character => TRANSLITERATION[character])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .trim();

  const FESTIVAL_DAYS = ["Thursday", "Friday", "Saturday", "Sunday"];
  window.scheduleFestivalSortKey = (day, time) => {
    const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return Number.MAX_SAFE_INTEGER;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3].toUpperCase();
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (meridiem === "PM" && hour !== 12) hour += 12;
    const clockMinutes = hour * 60 + minute;
    const festivalMinutes = clockMinutes < 12 * 60 ? clockMinutes + 24 * 60 : clockMinutes;
    const dayIndex = FESTIVAL_DAYS.indexOf(day);
    return (dayIndex < 0 ? FESTIVAL_DAYS.length : dayIndex) * 2 * 24 * 60 + festivalMinutes;
  };
})();
