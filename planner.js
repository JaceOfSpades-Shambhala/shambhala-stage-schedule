(() => {
  const STAGES = [
    { id: "amp", label: "AMP" },
    { id: "fractal-forest", label: "Fractal Forest" },
    { id: "grove", label: "Grove" },
    { id: "living-room", label: "Living Room" },
    { id: "pagoda", label: "Pagoda" },
    { id: "secret-garden", label: "Secret Garden" },
    { id: "village", label: "Village" }
  ];
  const DAYS = ["Thursday", "Friday", "Saturday", "Sunday"];
  const FESTIVAL_TIME_ZONE = "America/Vancouver";
  const FESTIVAL_DATES = { Thursday: "2026-07-23", Friday: "2026-07-24", Saturday: "2026-07-25", Sunday: "2026-07-26" };
  const STORAGE_KEY = "shambhala-2026-my-set-list";
  // How long after its start time a saved set still counts as "now" here -
  // the source schedule has no end times.
  const CURRENT_SET_WINDOW_MINUTES = 90;
  const data = window.SCHEDULE_DATA || {};
  const elements = {
    panel: document.querySelector("#planner"),
    scheduleList: document.querySelector("#set-list"),
    dayLabel: document.querySelector("#day-label"),
    list: document.querySelector("#planner-list"),
    empty: document.querySelector("#planner-empty"),
    count: document.querySelector("#planner-count"),
    share: document.querySelector("#planner-share"),
    clear: document.querySelector("#planner-clear"),
    feedback: document.querySelector("#planner-feedback"),
    upNext: document.querySelector("#planner-up-next"),
    upNextTitle: document.querySelector("#planner-up-next-title"),
    upNextDetails: document.querySelector("#planner-up-next-details")
  };
  if (!elements.panel || !elements.scheduleList) return;

  function titleCaseStage(stageId) {
    return STAGES.find(stage => stage.id === stageId)?.label || "AMP";
  }

  function stageIdFromLabel(label) {
    const normalised = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return STAGES.find(stage => stage.id === normalised || stage.label.toLowerCase() === String(label || "").toLowerCase())?.id || "";
  }

  function properDay(value) {
    return DAYS.find(day => day.toLowerCase() === String(value || "").trim().toLowerCase()) || "";
  }

  function parseSetTime(time) {
    const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return 0;
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

  function formatDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  function formatStartsIn(minutes) {
    const safeMinutes = Math.max(0, minutes);
    if (safeMinutes < 1) return "Starts now";
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    if (hours && remainingMinutes) return `Starts in ${hours} hr ${remainingMinutes} min`;
    if (hours) return `Starts in ${hours} hr`;
    return `Starts in ${remainingMinutes} min`;
  }

  function getFestivalNow() {
    const preview = new URLSearchParams(window.location.search).get("preview");
    const previewMatch = preview && preview.match(/^(2026-07-\d{2})T(\d{2}):(\d{2})$/);
    if (previewMatch) return { date: previewMatch[1], minutes: Number(previewMatch[2]) * 60 + Number(previewMatch[3]) };
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: FESTIVAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, minutes: (Number(values.hour) % 24) * 60 + Number(values.minute) };
  }

  function buildStageTimeline(stageId) {
    const timeline = [];
    DAYS.forEach(day => {
      const entries = data[day]?.[stageId] || [];
      const baseDate = FESTIVAL_DATES[day];
      if (!baseDate) return;
      let rolloverDays = 0;
      let previousMinutes = -1;
      entries.forEach(([time, artist]) => {
        const minutes = parseSetTime(time);
        if (previousMinutes !== -1 && minutes < previousMinutes) rolloverDays += 1;
        previousMinutes = minutes;
        const date = addDays(baseDate, rolloverDays);
        timeline.push({ day, stageId, date, time, artist, key: dateToSerial(date) * 1440 + minutes });
      });
    });
    return timeline.sort((a, b) => a.key - b.key);
  }

  function normaliseSet(item) {
    return { day: item.day, stageId: item.stageId, time: item.time, artist: item.artist };
  }

  function setId(item) {
    return [item.day, item.stageId, item.time, item.artist].join("|");
  }

  function timelineMatch(item) {
    return buildStageTimeline(item.stageId).find(entry => entry.day === item.day && entry.time === item.time && entry.artist === item.artist);
  }

  function sortKey(item) {
    return timelineMatch(item)?.key || (DAYS.indexOf(item.day) + 1) * 100000 + parseSetTime(item.time);
  }

  function loadSets() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && DAYS.includes(item.day) && STAGES.some(stage => stage.id === item.stageId) && item.time && item.artist).map(normaliseSet);
    } catch {
      return [];
    }
  }

  function saveSets(sets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets.map(normaliseSet)));
  }

  function sortedSets() {
    return loadSets().sort((a, b) => sortKey(a) - sortKey(b) || titleCaseStage(a.stageId).localeCompare(titleCaseStage(b.stageId)));
  }

  // The published schedule has no end times, so a set is assumed to run until
  // the next listed set on its own stage, capped at ASSUMED_SET_MINUTES.
  const ASSUMED_SET_MINUTES = 90;

  function setEndKey(match) {
    const nextOnStage = buildStageTimeline(match.stageId).find(entry => entry.key > match.key);
    const cap = match.key + ASSUMED_SET_MINUTES;
    return nextOnStage ? Math.min(nextOnStage.key, cap) : cap;
  }

  function findOverlaps() {
    const entries = loadSets()
      .map(item => ({ item, match: timelineMatch(item) }))
      .filter(entry => entry.match)
      .map(entry => ({ ...entry, end: setEndKey(entry.match) }));
    const overlaps = new Map();
    const note = (item, artist) => overlaps.set(setId(item), [...(overlaps.get(setId(item)) || []), artist]);
    entries.forEach((a, index) => {
      entries.slice(index + 1).forEach(b => {
        if (a.item.stageId === b.item.stageId) return;
        if (a.match.key < b.end && b.match.key < a.end) {
          note(a.item, b.item.artist);
          note(b.item, a.item.artist);
        }
      });
    });
    return overlaps;
  }

  function hasSet(item) {
    return loadSets().some(saved => setId(saved) === setId(item));
  }

  function addSet(item) {
    const sets = loadSets();
    if (!sets.some(saved => setId(saved) === setId(item))) {
      sets.push(normaliseSet(item));
      saveSets(sets);
    }
    renderPlanner();
    enhanceScheduleRows();
  }

  function removeSet(item) {
    saveSets(loadSets().filter(saved => setId(saved) !== setId(item)));
    renderPlanner();
    enhanceScheduleRows();
  }

  function getCurrentStageId() {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, "")).toLowerCase();
    if (STAGES.some(stage => stage.id === hash)) return hash;
    const bodyStage = Array.from(document.body.classList).find(className => className.startsWith("stage-"))?.replace(/^stage-/, "");
    return STAGES.some(stage => stage.id === bodyStage) ? bodyStage : "amp";
  }

  function getCurrentDay() {
    const raw = elements.dayLabel?.textContent || "";
    if (raw.includes("ALL")) return "";
    return properDay(raw);
  }

  function itemFromRow(row) {
    const time = row.querySelector(".set-time")?.textContent?.trim() || "";
    const artist = row.querySelector(".set-artist")?.textContent?.trim() || "";
    if (!time || !artist) return null;
    const meta = row.querySelector(".set-meta")?.textContent || "";
    if (meta.includes(" - ")) {
      const [dayLabel, stageLabel] = meta.split(" - ");
      const day = properDay(dayLabel);
      const stageId = stageIdFromLabel(stageLabel);
      if (day && stageId) return { day, stageId, time, artist };
    }
    const day = getCurrentDay();
    const stageId = getCurrentStageId();
    if (!day || !stageId) return null;
    return { day, stageId, time, artist };
  }

  function setButtonState(button, item) {
    const saved = hasSet(item);
    button.textContent = saved ? "Added" : "+";
    button.classList.toggle("is-added", saved);
    button.setAttribute("aria-label", `${saved ? "Remove" : "Add"} ${item.artist} at ${item.time} from My Set List`);
    button.title = saved ? "Remove from My Set List" : "Add to My Set List";
  }

  function enhanceScheduleRows() {
    elements.scheduleList.querySelectorAll(".set").forEach(row => {
      row.querySelector(".planner-add")?.remove();
      const item = itemFromRow(row);
      if (!item) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "planner-add";
      setButtonState(button, item);
      button.addEventListener("click", () => hasSet(item) ? removeSet(item) : addSet(item));
      row.append(button);
    });
  }

  function setFeedback(message) {
    if (!elements.feedback) return;
    elements.feedback.textContent = message;
    window.clearTimeout(setFeedback.timeout);
    setFeedback.timeout = window.setTimeout(() => { elements.feedback.textContent = ""; }, 2200);
  }

  function renderUpNext() {
    if (!elements.upNext) return;
    const now = getFestivalNow();
    const nowKey = dateToSerial(now.date) * 1440 + now.minutes;
    const timeline = loadSets()
      .map(item => ({ item, match: timelineMatch(item) }))
      .filter(entry => entry.match)
      .sort((a, b) => a.match.key - b.match.key || titleCaseStage(a.item.stageId).localeCompare(titleCaseStage(b.item.stageId)));
    const next = timeline.find(entry => entry.match.key > nowKey);
    const current = timeline.filter(entry => entry.match.key <= nowKey && nowKey - entry.match.key <= CURRENT_SET_WINDOW_MINUTES).at(-1);

    if (!next && !current) {
      elements.upNext.hidden = true;
      return;
    }

    elements.upNext.hidden = false;
    if (next) {
      const alsoNext = timeline.filter(entry => entry !== next && entry.match.key === next.match.key);
      elements.upNextTitle.textContent = `${next.item.artist} - ${next.item.time} at ${titleCaseStage(next.item.stageId)}`;
      const parts = [`${formatDate(next.match.date)} - ${formatStartsIn(next.match.key - nowKey)}`];
      if (alsoNext.length) parts.push(`Also at ${next.item.time}: ${alsoNext.map(entry => `${entry.item.artist} (${titleCaseStage(entry.item.stageId)})`).join(", ")}`);
      if (current) parts.push(`Now: ${current.item.artist} at ${titleCaseStage(current.item.stageId)}`);
      elements.upNextDetails.textContent = parts.join(" - ");
      return;
    }
    elements.upNextTitle.textContent = `${current.item.artist} at ${titleCaseStage(current.item.stageId)}`;
    elements.upNextDetails.textContent = `Started at ${current.item.time} - the last set on your list`;
  }

  function renderPlanner() {
    const sets = sortedSets();
    const overlaps = findOverlaps();
    elements.count.textContent = `${sets.length} set${sets.length === 1 ? "" : "s"} saved`;
    elements.list.innerHTML = "";
    elements.empty.hidden = sets.length > 0;
    elements.share.hidden = sets.length === 0;
    elements.clear.hidden = sets.length === 0;
    renderUpNext();
    sets.forEach(item => {
      const match = timelineMatch(item);
      const conflicts = overlaps.get(setId(item));
      const row = document.createElement("li");
      row.className = "planner-set";
      const time = document.createElement("span");
      time.className = "planner-time";
      time.textContent = item.time;
      const details = document.createElement("span");
      details.className = "planner-details";
      const artist = document.createElement("span");
      artist.className = "planner-artist";
      artist.textContent = item.artist;
      details.append(artist);
      if (conflicts) {
        const badge = document.createElement("span");
        badge.className = "overlap-badge";
        badge.textContent = "Overlap";
        details.append(badge);
      }
      const meta = document.createElement("span");
      meta.className = "planner-meta";
      meta.textContent = `${match ? formatDate(match.date) : item.day} - ${titleCaseStage(item.stageId)}`
        + (conflicts ? ` - Overlaps ${conflicts.join(", ")}` : "");
      details.append(meta);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "planner-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${item.artist} from My Set List`);
      remove.addEventListener("click", () => removeSet(item));
      row.append(time, details, remove);
      elements.list.append(row);
    });
  }

  function plannerText() {
    const sets = sortedSets();
    if (!sets.length) return "";
    return ["My Shambhala 2026 Set List", "", ...sets.map(item => {
      const match = timelineMatch(item);
      return `${match ? formatDate(match.date) : item.day} ${item.time} - ${item.artist} (${titleCaseStage(item.stageId)})`;
    })].join("\n");
  }

  async function copyPlanner(text) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Copied set list");
      return;
    } catch {}
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    setFeedback("Copied set list");
  }

  async function sharePlanner() {
    const text = plannerText();
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My Shambhala 2026 Set List", text });
        return;
      } catch (error) {
        // Cancelling the share sheet is not a failure; anything else falls
        // back to the clipboard so the button always does something useful.
        if (error && error.name === "AbortError") return;
      }
    }
    copyPlanner(text);
  }

  elements.share.addEventListener("click", sharePlanner);
  elements.clear.addEventListener("click", () => {
    saveSets([]);
    renderPlanner();
    enhanceScheduleRows();
    setFeedback("Cleared set list");
  });
  new MutationObserver(() => enhanceScheduleRows()).observe(elements.scheduleList, { childList: true });
  window.addEventListener("hashchange", () => window.setTimeout(enhanceScheduleRows, 0));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderUpNext(); });
  renderPlanner();
  enhanceScheduleRows();
  window.setInterval(renderUpNext, 30000);
})();
