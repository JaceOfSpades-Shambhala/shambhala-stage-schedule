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
  const PING_KEY = "shambhala-2026-ping";
  const IDENTITY_KEY = "shambhala-2026-hexlace-identity";
  const MIN_OVERLAP_MINUTES = 15;
  const LIVE_GROUP_WINDOW_MINUTES = 20;
  const PING_LOCATIONS = {
    camp: { label: "Camp", status: "At camp" },
    river: { label: "River", status: "At the river" },
    vendors: { label: "Vendors", status: "At the vendors" }
  };
  const data = window.SCHEDULE_DATA || {};
  const isCancelledSet = item => Boolean(window.ScheduleStatus?.isCancelled(item));
  const elements = {
    panel: document.querySelector("#planner"),
    scheduleList: document.querySelector("#set-list"),
    dayLabel: document.querySelector("#schedule-day"),
    list: document.querySelector("#planner-list"),
    empty: document.querySelector("#planner-empty"),
    count: document.querySelector("#planner-count"),
    share: document.querySelector("#planner-share"),
    clear: document.querySelector("#planner-clear"),
    feedback: document.querySelector("#planner-feedback"),
    upNext: document.querySelector("#planner-up-next"),
    liveNow: document.querySelector("#planner-live-now"),
    liveNowList: document.querySelector("#planner-live-now-list"),
    liveNext: document.querySelector("#planner-live-next"),
    liveNextList: document.querySelector("#planner-live-next-list"),
    pingCurrent: document.querySelector("#planner-ping-current"),
    pingState: document.querySelector("#planner-ping-state"),
    pingStatus: document.querySelector("#planner-ping-status"),
    pingDetail: document.querySelector("#planner-ping-detail"),
    pingEnd: document.querySelector("#planner-ping-end"),
    pingLocation: document.querySelector("#planner-ping-location"),
    pingPicker: document.querySelector("#planner-ping-picker"),
    pingLocationOptions: document.querySelector("#planner-ping-location-options"),
    pingDurationOptions: document.querySelector("#planner-ping-duration-options"),
    pingDurationLabel: document.querySelector("#planner-ping-duration-label")
  };
  if (!elements.panel || !elements.scheduleList) return;

  function titleCaseStage(stageId) {
    return STAGES.find(stage => stage.id === stageId)?.label || "AMP";
  }

  function isPingLocation(value) {
    return Object.prototype.hasOwnProperty.call(PING_LOCATIONS, value);
  }

  // A malformed percent-encoding in the URL hash otherwise throws and aborts.
  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch { return value; }
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
    const previewTime = window.parseSchedulePreview(preview);
    if (previewTime) return previewTime;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: FESTIVAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, minutes: (Number(values.hour) % 24) * 60 + Number(values.minute) };
  }

  function festivalNowKey() {
    const now = getFestivalNow();
    return dateToSerial(now.date) * 1440 + now.minutes;
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
        const entry = { day, stageId, date, time, artist, key: dateToSerial(date) * 1440 + minutes };
        timeline.push({ ...entry, cancelled: isCancelledSet(entry) });
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

  // Matches the Worker's per-list cap so a saved list can always be published.
  const MAX_SAVED_SETS = 100;

  function saveSets(sets) {
    // Stored pre-sorted so anything publishing the raw list (hexlaces.js)
    // shares it in chronological order.
    const sorted = sets.map(normaliseSet)
      .sort((a, b) => sortKey(a) - sortKey(b) || titleCaseStage(a.stageId).localeCompare(titleCaseStage(b.stageId)));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      setFeedback("Couldn't save - your device storage may be full.");
      return;
    }
    window.dispatchEvent(new CustomEvent("setlist-changed"));
  }

  function sortedSets() {
    return loadSets().sort((a, b) => sortKey(a) - sortKey(b) || titleCaseStage(a.stageId).localeCompare(titleCaseStage(b.stageId)));
  }

  function loadPing() {
    try {
      const ping = JSON.parse(localStorage.getItem(PING_KEY) || "null");
      if (!ping || !(ping.type === "set" || isPingLocation(ping.type))) return null;
      if (!Number.isSafeInteger(ping.startKey) || !Number.isSafeInteger(ping.endKey) || ping.endKey <= ping.startKey) return null;
      if (ping.endKey <= festivalNowKey()) return null;
      if (ping.type === "set" && (!ping.day || !ping.stageId || !ping.time || !ping.artist)) return null;
      if (ping.type === "set" && isCancelledSet(ping)) {
        localStorage.removeItem(PING_KEY);
        return null;
      }
      return ping;
    } catch {
      return null;
    }
  }

  function hasSharingIdentity() {
    try {
      const identity = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
      return Boolean(identity?.readId && identity?.writeKey);
    } catch {
      return false;
    }
  }

  function savePing(ping, message) {
    try {
      if (ping) localStorage.setItem(PING_KEY, JSON.stringify(ping));
      else localStorage.removeItem(PING_KEY);
    } catch {
      setFeedback("Couldn't save your ping - your device storage may be full.");
      return;
    }
    window.dispatchEvent(new CustomEvent("ping-changed"));
    renderPlanner();
    if (!hasSharingIdentity() && ping) {
      const myHexlace = document.querySelector("#my-hexlace");
      if (myHexlace) myHexlace.open = true;
      setFeedback("Ping saved. Start sharing your Hexlace below so friends can see it.");
      return;
    }
    if (message) setFeedback(message);
  }

  function pingMatchesSet(ping, item) {
    return ping?.type === "set" && setId(ping) === setId(item);
  }

  function pingEndKey(match) { return setEndKey(match); }

  function setSetPing(item) {
    if (isCancelledSet(item)) { setFeedback("That set was cancelled."); return; }
    const match = timelineMatch(item);
    if (!match) { setFeedback("That set couldn't be matched to the schedule."); return; }
    const endKey = pingEndKey(match);
    if (festivalNowKey() >= endKey) { setFeedback("That set has already ended."); return; }
    pingPickerOpen = false;
    pendingLocation = "";
    savePing({ type: "set", ...normaliseSet(item), startKey: match.key, endKey }, `Ping set for ${titleCaseStage(item.stageId)}.`);
  }

  function setLocationPing(location, minutes) {
    if (!isPingLocation(location)) return;
    const config = PING_LOCATIONS[location];
    const startKey = festivalNowKey();
    pingPickerOpen = false;
    pendingLocation = "";
    savePing({ type: location, startKey, endKey: startKey + minutes }, `${config.label} ping set for ${minutes === 60 ? "1 hour" : `${minutes} minutes`}.`);
  }

  // Most sets run until the next listed set on their stage, capped at 90
  // minutes. The printed PDF's bars supply explicit endpoints for final sets.
  const ASSUMED_SET_MINUTES = 90;
  function inferredFinalEndKey(match) {
    const time = window.SCHEDULE_FINAL_END_TIMES?.[match.day]?.[match.stageId];
    if (!time) return match.key + ASSUMED_SET_MINUTES;
    const minutes = parseSetTime(time);
    const startMinutes = parseSetTime(match.time);
    const baseSerial = dateToSerial(match.date);
    return (baseSerial + (minutes <= startMinutes ? 1 : 0)) * 1440 + minutes;
  }
  function setEndKey(match) {
    const nextOnStage = buildStageTimeline(match.stageId).find(entry => entry.day === match.day && entry.key > match.key);
    const cap = match.key + ASSUMED_SET_MINUTES;
    return nextOnStage ? Math.min(nextOnStage.key, cap) : inferredFinalEndKey(match);
  }

  function savedTimeline() {
    return loadSets()
      .map(item => ({ item, match: timelineMatch(item) }))
      .filter(entry => entry.match && !entry.match.cancelled)
      .map(entry => ({ ...entry, end: setEndKey(entry.match) }))
      .sort((a, b) => a.match.key - b.match.key || titleCaseStage(a.item.stageId).localeCompare(titleCaseStage(b.item.stageId)));
  }

  function overlapMinutes(a, b) {
    return Math.max(0, Math.min(a.end, b.end) - Math.max(a.match.key, b.match.key));
  }

  function findOverlaps(entries = savedTimeline()) {
    const overlaps = new Map();
    const note = (item, clash) => overlaps.set(setId(item), [...(overlaps.get(setId(item)) || []), clash]);
    entries.forEach((a, index) => {
      entries.slice(index + 1).forEach(b => {
        if (a.item.day !== b.item.day) return;
        if (overlapMinutes(a, b) >= MIN_OVERLAP_MINUTES) {
          note(a.item, b);
          note(b.item, a);
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
      if (sets.length >= MAX_SAVED_SETS) {
        setFeedback(`Your set list is full (${MAX_SAVED_SETS} max).`);
        return;
      }
      sets.push(normaliseSet(item));
      saveSets(sets);
    }
    renderPlanner();
    enhanceScheduleRows();
  }

  function removeSet(item) {
    const previousSets = loadSets();
    const previousPing = loadPing();
    const clearsPing = pingMatchesSet(previousPing, item);
    window.showUndo?.(`${item.artist} removed.`, () => {
      saveSets(previousSets);
      if (previousPing) savePing(previousPing, "Set restored.");
      else {
        renderPlanner();
        enhanceScheduleRows();
        setFeedback("Set restored.");
      }
    });
    saveSets(previousSets.filter(saved => setId(saved) !== setId(item)));
    if (clearsPing) {
      savePing(null, "Ping ended because that set was removed.");
      enhanceScheduleRows();
      return;
    }
    renderPlanner();
    enhanceScheduleRows();
  }

  function getCurrentStageId() {
    const hash = safeDecode(window.location.hash.replace(/^#/, "")).toLowerCase();
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
    button.textContent = saved ? "✓ Saved" : "+ Save";
    button.classList.toggle("is-added", saved);
    button.setAttribute("aria-label", `${saved ? "Remove" : "Add"} ${item.artist} at ${item.time} from My Set List`);
    button.title = saved ? "Remove from My Set List" : "Add to My Set List";
  }

  function enhanceScheduleRows() {
    elements.scheduleList.querySelectorAll(".set").forEach(row => {
      row.querySelector(".planner-add")?.remove();
      const item = itemFromRow(row);
      if (!item) return;
      if (isCancelledSet(item) && !hasSet(item)) return;
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

  function liveEntry(artist, detailText, overlapAction = null) {
    const wrap = document.createElement("div");
    wrap.className = "planner-live-entry";
    const copy = document.createElement("span");
    copy.className = "planner-live-copy";
    const title = document.createElement("strong");
    title.className = "planner-live-title";
    title.textContent = artist;
    const details = document.createElement("span");
    details.className = "planner-live-details";
    details.textContent = detailText;
    copy.append(title, details);
    wrap.append(copy);
    if (overlapAction) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "planner-live-overlap";
      button.textContent = overlapAction.label;
      button.setAttribute("aria-label", `${overlapAction.label}; open overlap timeline for ${overlapAction.item.artist}`);
      button.addEventListener("click", () => openPlannerOverlap(overlapAction.item));
      wrap.append(button);
    }
    return wrap;
  }

  function liveSummary(lead, mode, nowKey, overlaps) {
    if (!lead) return null;
    const conflicts = overlaps.get(setId(lead.item)) || [];
    const nearby = conflicts.filter(entry => {
      const startsAfterLead = entry.match.key - lead.match.key;
      if (startsAfterLead < 0 || startsAfterLead > LIVE_GROUP_WINDOW_MINUTES) return false;
      return mode === "now"
        ? entry.match.key <= nowKey && nowKey < entry.end
        : entry.match.key > nowKey;
    });
    const later = conflicts.filter(entry => entry.match.key - lead.match.key > LIVE_GROUP_WINDOW_MINUTES);
    const groupSize = 1 + nearby.length;
    const hasOverlap = conflicts.length > 0;
    const action = hasOverlap ? {
      item: lead.item,
      label: groupSize > 1 ? "View overlap" : `+${later.length} overlap${later.length === 1 ? "" : "s"}`
    } : null;

    if (groupSize > 1) {
      const timing = mode === "now"
        ? `· ${later.length ? `+${later.length} later` : `playing within ${LIVE_GROUP_WINDOW_MINUTES} min`}`
        : `· ${lead.item.time} · ${formatStartsIn(lead.match.key - nowKey).replace(/^Starts /, "")}`;
      return liveEntry(`${groupSize} sets ${mode === "now" ? "now" : "up next"}`, timing, action);
    }

    const detail = mode === "now"
      ? `· ${titleCaseStage(lead.item.stageId)} · until ${formatTimelineTime(lead.end)}`
      : `· ${titleCaseStage(lead.item.stageId)} · ${lead.item.time} · ${formatStartsIn(lead.match.key - nowKey).replace(/^Starts /, "")}`;
    return liveEntry(lead.item.artist, detail, later.length ? action : null);
  }

  function renderUpNext() {
    if (!elements.upNext) return;
    const now = getFestivalNow();
    const nowKey = dateToSerial(now.date) * 1440 + now.minutes;
    const timeline = savedTimeline();
    const playing = timeline.filter(entry => entry.match.key <= nowKey && nowKey < entry.end);
    const next = timeline.find(entry => entry.match.key > nowKey) || null;
    const overlaps = findOverlaps(timeline);

    elements.upNext.hidden = !playing.length && !next;
    elements.upNext.dataset.state = playing.length ? "now" : "next";
    elements.liveNow.hidden = !playing.length;
    elements.liveNext.hidden = !next;

    elements.liveNowList.innerHTML = "";
    const nowSummary = liveSummary(playing[0], "now", nowKey, overlaps);
    if (nowSummary) elements.liveNowList.append(nowSummary);

    elements.liveNextList.innerHTML = "";
    const nextSummary = liveSummary(next, "next", nowKey, overlaps);
    if (nextSummary) elements.liveNextList.append(nextSummary);
  }

  // Remembers days the user has manually opened or closed, so re-renders
  // (add/remove/clear) don't fight their choice within a session.
  const dayOpenState = new Map();
  let expandedKey = null;
  let pingPickerOpen = false;
  let pendingLocation = "";

  function openPlannerOverlap(item) {
    const itemKey = setId(item);
    if (!(findOverlaps(savedTimeline()).get(itemKey)?.length)) return;
    dayOpenState.set(item.day, true);
    expandedKey = itemKey;
    renderPlanner();
    window.requestAnimationFrame(() => {
      const toggle = Array.from(elements.list.querySelectorAll(".planner-overlap-toggle"))
        .find(button => button.dataset.plannerKey === itemKey);
      const timeline = toggle?.getAttribute("aria-controls")
        ? document.getElementById(toggle.getAttribute("aria-controls"))
        : null;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      (timeline || toggle)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      toggle?.focus({ preventScroll: true });
    });
  }

  function formatTimelineTime(key) {
    const minutes = ((key % 1440) + 1440) % 1440;
    const hour24 = Math.floor(minutes / 60);
    const hour = hour24 % 12 || 12;
    const minute = String(minutes % 60).padStart(2, "0");
    return `${hour}:${minute} ${hour24 < 12 ? "AM" : "PM"}`;
  }

  function renderPlannerPing() {
    if (!elements.pingCurrent || !elements.pingPicker) return;
    const ping = loadPing();
    const nowKey = festivalNowKey();
    elements.pingCurrent.hidden = !ping;
    elements.pingPicker.hidden = !pingPickerOpen;
    elements.pingLocationOptions.hidden = !pingPickerOpen || Boolean(pendingLocation);
    elements.pingDurationOptions.hidden = !pingPickerOpen || !pendingLocation;
    elements.pingLocation.setAttribute("aria-expanded", String(pingPickerOpen));
    if (pendingLocation) elements.pingDurationLabel.textContent = `How long at ${PING_LOCATIONS[pendingLocation].label}?`;
    if (!ping) return;
    if (isPingLocation(ping.type)) {
      elements.pingCurrent.dataset.state = "location";
      elements.pingState.textContent = "Pinging now";
      elements.pingStatus.textContent = PING_LOCATIONS[ping.type].status;
      elements.pingDetail.textContent = `Ends ${formatTimelineTime(ping.endKey)} - ${Math.max(0, ping.endKey - nowKey)} min left`;
      return;
    }
    const stage = titleCaseStage(ping.stageId);
    const minutesUntil = ping.startKey - nowKey;
    const isFuture = minutesUntil > 0;
    elements.pingCurrent.dataset.state = isFuture ? "future" : "active";
    elements.pingState.textContent = isFuture ? `Ping set · starts ${ping.time}` : "Pinging now";
    elements.pingStatus.textContent = isFuture
      ? `Heading to ${stage} for ${ping.artist} at ${ping.time}`
      : `Come meet me at ${stage}`;
    elements.pingDetail.textContent = isFuture
      ? `Becomes “Come meet me at ${stage}” at ${ping.time} - ends ${formatTimelineTime(ping.endKey)}`
      : `${ping.artist} - until ${formatTimelineTime(ping.endKey)}`;
  }

  function toggleOverlap(itemKey) {
    expandedKey = expandedKey === itemKey ? null : itemKey;
    renderPlanner();
    const toggle = Array.from(elements.list.querySelectorAll(".planner-overlap-toggle"))
      .find(button => button.dataset.plannerKey === itemKey);
    toggle?.focus({ preventScroll: true });
  }

  function timelineTickSpacing(windowSpan) {
    if (windowSpan <= 120) return { grid: 15, label: 30 };
    if (windowSpan <= 240) return { grid: 30, label: 60 };
    if (windowSpan <= 480) return { grid: 60, label: 120 };
    return { grid: 120, label: 240 };
  }

  function buildOverlapTimeline(current, clashes, timelineId) {
    const cluster = [current, ...clashes]
      .sort((a, b) => a.match.key - b.match.key || titleCaseStage(a.item.stageId).localeCompare(titleCaseStage(b.item.stageId)));
    const windowStart = Math.min(...cluster.map(entry => entry.match.key));
    const windowEnd = Math.max(...cluster.map(entry => entry.end));
    const windowSpan = Math.max(1, windowEnd - windowStart);

    const timeline = document.createElement("div");
    timeline.id = timelineId;
    timeline.className = "planner-overlap-timeline";
    timeline.setAttribute("role", "group");
    timeline.setAttribute("aria-label", `Overlap timeline for ${current.item.artist}, ${formatTimelineTime(windowStart)} to ${formatTimelineTime(windowEnd)}`);

    const bars = document.createElement("div");
    bars.className = "planner-overlap-bars";

    const spacing = timelineTickSpacing(windowSpan);
    const tickKeys = [windowStart];
    for (let key = windowStart + spacing.grid; key < windowEnd; key += spacing.grid) tickKeys.push(key);
    if (tickKeys.at(-1) !== windowEnd) tickKeys.push(windowEnd);
    const grid = document.createElement("div");
    grid.className = "planner-overlap-grid";
    grid.setAttribute("aria-hidden", "true");
    tickKeys.forEach(key => {
      const line = document.createElement("span");
      line.className = "planner-overlap-grid-line";
      line.style.left = `${((key - windowStart) / windowSpan) * 100}%`;
      grid.append(line);
    });
    bars.append(grid);

    cluster.forEach(entry => {
      const track = document.createElement("div");
      track.className = "planner-overlap-track";
      const bar = document.createElement("div");
      bar.className = "planner-overlap-bar";
      bar.classList.toggle("is-selected", setId(entry.item) === setId(current.item));
      bar.style.left = `${((entry.match.key - windowStart) / windowSpan) * 100}%`;
      bar.style.width = `${((entry.end - entry.match.key) / windowSpan) * 100}%`;
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${entry.item.artist}, ${formatTimelineTime(entry.match.key)} to ${formatTimelineTime(entry.end)}`);

      const intersections = cluster
        .filter(other => setId(other.item) !== setId(entry.item))
        .map(other => ({ start: Math.max(entry.match.key, other.match.key), end: Math.min(entry.end, other.end) }))
        .filter(range => range.end > range.start);
      if (intersections.length) {
        const overlapStart = Math.min(...intersections.map(range => range.start));
        const overlapEnd = Math.max(...intersections.map(range => range.end));
        const fill = document.createElement("span");
        fill.className = "planner-overlap-fill";
        fill.style.left = `${((overlapStart - entry.match.key) / (entry.end - entry.match.key)) * 100}%`;
        fill.style.width = `${((overlapEnd - overlapStart) / (entry.end - entry.match.key)) * 100}%`;
        bar.append(fill);
      }

      const label = document.createElement("span");
      label.className = "planner-overlap-label";
      label.textContent = entry.item.artist;
      bar.append(label);
      track.append(bar);
      bars.append(track);
    });

    const axis = document.createElement("div");
    axis.className = "planner-overlap-axis";
    tickKeys.forEach((key, index) => {
      const isEndpoint = index === 0 || index === tickKeys.length - 1;
      const showLabel = isEndpoint || (key - windowStart) % spacing.label === 0;
      if (!showLabel) return;
      const label = document.createElement("span");
      label.className = "planner-overlap-axis-label";
      if (index === 0) label.classList.add("is-start");
      if (index === tickKeys.length - 1) label.classList.add("is-end");
      label.style.left = `${((key - windowStart) / windowSpan) * 100}%`;
      label.textContent = formatTimelineTime(key);
      axis.append(label);
    });
    bars.append(axis);
    timeline.append(bars);
    return timeline;
  }

  function buildSetRow(item, current, conflicts, rowIndex, activePing, nowKey) {
    const itemKey = setId(item);
    const cancelled = isCancelledSet(item);
    const isExpanded = expandedKey === itemKey && conflicts.length > 0;
    const timelineId = `planner-overlap-${rowIndex}`;
    const wrap = document.createElement("li");
    wrap.className = "planner-set-wrap";
    const row = document.createElement("div");
    row.className = "planner-set";
    row.classList.toggle("planner-set-cancelled", cancelled);
    const time = document.createElement("span");
    time.className = "planner-time";
    time.textContent = item.time;
    const details = document.createElement("span");
    details.className = "planner-details";
    const artist = document.createElement("span");
    artist.className = "planner-artist";
    artist.textContent = item.artist;
    details.append(artist);

    const meta = document.createElement("span");
    meta.className = "planner-meta";
    const stage = document.createElement("span");
    stage.className = "planner-stage";
    stage.textContent = titleCaseStage(item.stageId);
    meta.append(stage);
    if (cancelled) {
      const badge = document.createElement("span");
      badge.className = "cancelled-badge";
      badge.textContent = "Cancelled";
      meta.append(badge);
    }
    if (conflicts.length) {
      const badge = document.createElement("span");
      badge.className = "overlap-badge";
      badge.append(`${conflicts.length} overlap${conflicts.length === 1 ? "" : "s"}`);
      const chevron = document.createElement("span");
      chevron.className = "overlap-chevron";
      chevron.textContent = "▾";
      chevron.setAttribute("aria-hidden", "true");
      badge.append(chevron);
      meta.append(badge);
    }
    details.append(meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "planner-remove";
    remove.textContent = "−";
    remove.setAttribute("aria-label", `Remove ${item.artist} from My Set List`);
    remove.title = "Remove from My Set List";
    remove.addEventListener("click", event => {
      event.stopPropagation();
      if (expandedKey === itemKey) expandedKey = null;
      removeSet(item);
    });
    const actions = document.createElement("span");
    actions.className = "planner-row-actions";
    const pingIsCurrent = pingMatchesSet(activePing, item);
    const pingEnd = current?.match ? pingEndKey(current.match) : 0;
    if (current?.match && nowKey < pingEnd) {
      const meet = document.createElement("button");
      meet.type = "button";
      meet.className = "planner-ping-set";
      meet.classList.toggle("is-active", pingIsCurrent);
      meet.textContent = "Ping";
      meet.setAttribute("aria-label", `${pingIsCurrent ? "Current ping" : "Ping friends to meet"} at ${titleCaseStage(item.stageId)} for ${item.artist}`);
      meet.addEventListener("click", event => {
        event.stopPropagation();
        if (!pingIsCurrent) setSetPing(item);
      });
      actions.append(meet);
    }
    actions.append(remove);
    if (conflicts.length) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "planner-overlap-toggle";
      toggle.dataset.plannerKey = itemKey;
      toggle.setAttribute("aria-expanded", String(isExpanded));
      toggle.setAttribute("aria-controls", timelineId);
      toggle.setAttribute("aria-label", `${isExpanded ? "Hide" : "Show"} overlap details for ${item.artist}`);
      toggle.addEventListener("click", () => toggleOverlap(itemKey));
      row.append(toggle);
    }
    row.append(time, details, actions);
    wrap.append(row);
    if (isExpanded && current) wrap.append(buildOverlapTimeline(current, conflicts, timelineId));
    return wrap;
  }

  function renderPlanner() {
    const sets = sortedSets();
    const activePing = loadPing();
    const nowKey = festivalNowKey();
    const timeline = savedTimeline();
    const timelineById = new Map(timeline.map(entry => [setId(entry.item), entry]));
    const overlaps = findOverlaps(timeline);
    if (expandedKey && !(overlaps.get(expandedKey)?.length)) expandedKey = null;
    elements.count.textContent = `${sets.length} set${sets.length === 1 ? "" : "s"} saved`;
    elements.list.innerHTML = "";
    elements.empty.hidden = sets.length > 0;
    elements.share.hidden = sets.length === 0;
    elements.clear.hidden = sets.length === 0;
    renderPlannerPing();
    renderUpNext();
    let rowIndex = 0;
    DAYS.forEach(day => {
      const daySets = sets.filter(item => item.day === day);
      if (!daySets.length) return;
      const group = document.createElement("details");
      group.className = "planner-day";
      group.open = dayOpenState.has(day) ? dayOpenState.get(day) : false;
      group.addEventListener("toggle", () => dayOpenState.set(day, group.open));
      const summary = document.createElement("summary");
      summary.className = "planner-day-summary";
      const name = document.createElement("span");
      name.className = "planner-day-name";
      name.textContent = day;
      const count = document.createElement("span");
      count.className = "planner-day-count";
      count.textContent = `${daySets.length} set${daySets.length === 1 ? "" : "s"}`;
      summary.append(name, count);
      const list = document.createElement("ol");
      list.className = "planner-day-list";
      daySets.forEach(item => {
        const itemKey = setId(item);
        list.append(buildSetRow(item, timelineById.get(itemKey), overlaps.get(itemKey) || [], rowIndex, activePing, nowKey));
        rowIndex += 1;
      });
      group.append(summary, list);
      elements.list.append(group);
    });
  }

  function plannerText() {
    const sets = sortedSets();
    if (!sets.length) return "";
    return ["My Shambhala 2026 Set List", "", ...sets.map(item => {
      const match = timelineMatch(item);
      const status = isCancelledSet(item) ? " - CANCELLED" : "";
      return `${match ? formatDate(match.date) : item.day} ${item.time} - ${item.artist}${status} (${titleCaseStage(item.stageId)})`;
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
    const copied = document.execCommand("copy");
    textarea.remove();
    setFeedback(copied ? "Copied set list" : "Couldn't copy automatically. Select and copy the set list manually.");
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
  elements.pingLocation.addEventListener("click", () => {
    pingPickerOpen = !pingPickerOpen;
    pendingLocation = "";
    renderPlannerPing();
    window.requestAnimationFrame(() => {
      if (pingPickerOpen) elements.pingLocationOptions.querySelector("button")?.focus();
      else elements.pingLocation.focus();
    });
  });
  elements.pingLocationOptions.addEventListener("click", event => {
    const button = event.target.closest("[data-ping-location]");
    if (!button) return;
    pendingLocation = button.dataset.pingLocation || "";
    renderPlannerPing();
    window.requestAnimationFrame(() => elements.pingDurationOptions.querySelector("button")?.focus());
  });
  elements.pingDurationOptions.addEventListener("click", event => {
    const button = event.target.closest("[data-ping-minutes]");
    if (!button || !pendingLocation) return;
    setLocationPing(pendingLocation, Number(button.dataset.pingMinutes));
    window.requestAnimationFrame(() => elements.pingLocation.focus());
  });
  elements.pingEnd.addEventListener("click", () => {
    const previousPing = loadPing();
    if (!previousPing) return;
    window.showUndo?.("Ping ended.", () => savePing(previousPing, "Ping restored."));
    pingPickerOpen = false;
    pendingLocation = "";
    savePing(null, "Ping ended.");
    window.requestAnimationFrame(() => elements.pingLocation.focus());
  });
  elements.clear.addEventListener("click", () => {
    const setCount = loadSets().length;
    if (!window.confirm(`Are you sure you want to clear all ${setCount} saved set${setCount === 1 ? "" : "s"}?`)) return;
    const hadSetPing = loadPing()?.type === "set";
    saveSets([]);
    if (hadSetPing) {
      savePing(null, "Set list and ping cleared.");
      enhanceScheduleRows();
      return;
    }
    renderPlanner();
    enhanceScheduleRows();
    setFeedback("Cleared set list");
  });
  new MutationObserver(() => enhanceScheduleRows()).observe(elements.scheduleList, { childList: true });
  window.addEventListener("hashchange", () => window.setTimeout(enhanceScheduleRows, 0));
  window.addEventListener("setlist-restored", () => {
    renderPlanner();
    enhanceScheduleRows();
  });
  window.addEventListener("ping-restored", () => renderPlanner());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderUpNext(); });
  renderPlanner();
  enhanceScheduleRows();
  window.setInterval(() => {
    renderUpNext();
    renderPlannerPing();
  }, 30000);
})();
