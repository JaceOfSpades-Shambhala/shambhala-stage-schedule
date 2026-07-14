// Pure comparison helpers kept separate from the UI so shared-set matching can
// be tested without a browser or access to Hexlace storage.
(() => {
  const DAYS = ["Thursday", "Friday", "Saturday", "Sunday"];

  function normalise(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function setKey(item) {
    return [item?.day, item?.stageId, item?.time, item?.artist].map(normalise).join("\u001f");
  }

  function timeOrder(time) {
    const match = String(time || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return Number.MAX_SAFE_INTEGER;
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    const minutes = hour * 60 + Number(match[2]);
    // A festival day continues through the following morning, so 1 AM sorts
    // after 11 PM rather than before the afternoon sets.
    return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
  }

  function sharedSets(mine, theirs, day) {
    if (!DAYS.includes(day)) return [];
    const theirKeys = new Set((Array.isArray(theirs) ? theirs : []).filter(item => item?.day === day).map(setKey));
    const seen = new Set();
    return (Array.isArray(mine) ? mine : [])
      .filter(item => item?.day === day && theirKeys.has(setKey(item)))
      .filter(item => {
        const key = setKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => timeOrder(a.time) - timeOrder(b.time) || normalise(a.stageId).localeCompare(normalise(b.stageId)));
  }

  window.HexlaceCompare = Object.freeze({ DAYS, sharedSets });
})();
