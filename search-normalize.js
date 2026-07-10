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
})();
