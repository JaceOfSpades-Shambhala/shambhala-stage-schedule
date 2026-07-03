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
  const FINAL_SET_WINDOW_MINUTES = 180;
  const data = window.SCHEDULE_DATA || {};
  const elements = {
    stageTabs: document.querySelector("#stage-tabs"),
    dayTabs: document.querySelector("#day-tabs"),
    stageTitle: document.querySelector("#stage-title"),
    dayLabel: document.querySelector("#day-label"),
    scheduleTitle: document.querySelector("#schedule-title"),
    scheduleNote: document.querySelector("#schedule-note"),
    setList: document.querySelector("#set-list"),
    noResults: document.querySelector("#no-results"),
    search: document.querySelector("#artist-search"),
    campLocation: document.querySelector("#camp-location-link"),
    nowPlaying: document.querySelector("#now-playing"),
    nowPlayingLabel: document.querySelector("#now-playing-label"),
    nowPlayingTitle: document.querySelector("#now-playing-title"),
    nowPlayingDetails: document.querySelector("#now-playing-details")
  };
  const appState = { stage: "amp", day: "Thursday", term: "" };

  function titleCaseStage(stageId) {
    return STAGES.find(stage => stage.id === stageId)?.label || "AMP";
  }

  function isAvailable(day, stage) {
    return Array.isArray(data[day]?.[stage]) && data[day][stage].length > 0;
  }

  function normaliseForSearch(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2019\u2018]/g, "'").toLowerCase().trim();
  }

  function clearSearch() {
    appState.term = "";
    elements.search.value = "";
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

  function nowToKey(now) {
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
        timeline.push({ day, date, time, artist, minutes, key: dateToSerial(date) * 1440 + minutes });
      });
    });
    return timeline.sort((a, b) => a.key - b.key);
  }

  function getFestivalNow() {
    const preview = new URLSearchParams(window.location.search).get("preview");
    const previewMatch = preview && preview.match(/^(2026-07-\d{2})T(\d{2}):(\d{2})$/);
    if (previewMatch) return { date: previewMatch[1], minutes: Number(previewMatch[2]) * 60 + Number(previewMatch[3]), isPreview: true };
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: FESTIVAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, minutes: (Number(values.hour) % 24) * 60 + Number(values.minute), isPreview: false };
  }

  function getNowPlayingStatus(stageId) {
    const now = getFestivalNow();
    const nowKey = nowToKey(now);
    const timeline = buildStageTimeline(stageId);
    const nextIndex = timeline.findIndex(item => item.key > nowKey);
    const previous = nextIndex === -1 ? timeline.at(-1) : timeline[nextIndex - 1];
    const next = nextIndex === -1 ? null : timeline[nextIndex];
    if (previous && previous.key <= nowKey) {
      if (next && previous.day === next.day) return { type: "active", current: previous, next, now, minutesUntilNext: next.key - nowKey };
      if (nowKey - previous.key <= FINAL_SET_WINDOW_MINUTES) return { type: "final", current: previous, next, now };
    }
    if (next) return { type: "upcoming", next, now, minutesUntilNext: next.key - nowKey };
    return { type: "unavailable", now };
  }

  function getCurrentScheduleDay(stageId) {
    const status = getNowPlayingStatus(stageId);
    if (status.current?.day && isAvailable(status.current.day, stageId)) return status.current.day;
    if (status.next?.day && isAvailable(status.next.day, stageId)) {
      const nowSerial = dateToSerial(status.now.date);
      if (nowSerial >= dateToSerial(FESTIVAL_DATES.Thursday) && nowSerial <= dateToSerial(addDays(FESTIVAL_DATES.Sunday, 1))) return status.next.day;
    }
    return null;
  }

  function getInitialState() {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, "")).toLowerCase();
    const matchedStage = STAGES.find(stage => stage.id === hash);
    if (matchedStage) appState.stage = matchedStage.id;
    const requestedDay = new URLSearchParams(window.location.search).get("day");
    appState.day = DAYS.includes(requestedDay) && isAvailable(requestedDay, appState.stage)
      ? requestedDay
      : getCurrentScheduleDay(appState.stage) || DAYS.find(day => isAvailable(day, appState.stage)) || "Friday";
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.hash = appState.stage;
    url.searchParams.set("day", appState.day);
    history.replaceState({}, "", url);
  }

  function switchStage(stageId) {
    appState.stage = stageId;
    if (!isAvailable(appState.day, appState.stage)) appState.day = getCurrentScheduleDay(appState.stage) || DAYS.find(day => isAvailable(day, appState.stage)) || "Friday";
    clearSearch();
    updateUrl();
    render();
  }

  function switchDay(day) {
    if (!isAvailable(day, appState.stage)) return;
    appState.day = day;
    clearSearch();
    updateUrl();
    render();
  }

  function renderTabs() {
    const currentScheduleDay = getCurrentScheduleDay(appState.stage);
    elements.stageTabs.innerHTML = "";
    STAGES.forEach(stage => {
      const button = document.createElement("button");
      button.className = "tab";
      button.type = "button";
      button.textContent = stage.label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(stage.id === appState.stage));
      button.addEventListener("click", () => switchStage(stage.id));
      elements.stageTabs.append(button);
    });
    elements.dayTabs.innerHTML = "";
    DAYS.forEach(day => {
      const button = document.createElement("button");
      const available = isAvailable(day, appState.stage);
      button.className = "tab";
      button.type = "button";
      button.disabled = !available;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(day === appState.day));
      button.addEventListener("click", () => switchDay(day));
      const label = document.createElement("span");
      label.textContent = day;
      button.append(label);
      if (available && day === currentScheduleDay) {
        button.classList.add("tab-today");
        button.setAttribute("aria-label", `${day} - current schedule day`);
        const marker = document.createElement("span");
        marker.className = "today-marker";
        marker.textContent = "Today";
        button.append(document.createTextNode(" "), marker);
      }
      elements.dayTabs.append(button);
    });
  }

  function getGlobalMatches(term) {
    const query = normaliseForSearch(term);
    if (!query) return [];
    const matches = [];
    Object.entries(data).forEach(([day, stages]) => Object.entries(stages || {}).forEach(([stageId, entries]) => {
      const stage = titleCaseStage(stageId);
      (entries || []).forEach(([time, artist]) => {
        if (normaliseForSearch(artist).includes(query)) matches.push({ day, stage, time, artist });
      });
    }));
    return matches;
  }

  function appendSet({ time, artist, day, stage, isCurrent = false }) {
    const item = document.createElement("li");
    item.className = "set";
    if (isCurrent) {
      item.classList.add("set-current");
      item.setAttribute("aria-current", "true");
    }
    const timeElement = document.createElement("span");
    timeElement.className = "set-time";
    timeElement.textContent = time;
    const details = document.createElement("span");
    details.className = "set-details";
    const artistElement = document.createElement("span");
    artistElement.className = "set-artist";
    artistElement.textContent = artist;
    details.append(artistElement);
    if (isCurrent) {
      const badge = document.createElement("span");
      badge.className = "now-badge";
      badge.textContent = "NOW";
      details.append(badge);
    }
    if (day && stage) {
      const meta = document.createElement("span");
      meta.className = "set-meta";
      meta.textContent = `${day} - ${stage}`;
      details.append(meta);
    }
    item.append(timeElement, details);
    elements.setList.append(item);
  }

  function renderSchedule() {
    const stageLabel = titleCaseStage(appState.stage);
    const entries = data[appState.day]?.[appState.stage] || [];
    const term = appState.term.trim();
    document.body.className = `stage-${appState.stage}`;
    elements.stageTitle.textContent = stageLabel;
    elements.setList.innerHTML = "";
    if (term) {
      const matches = getGlobalMatches(term);
      elements.dayLabel.textContent = "ALL DAYS & STAGES";
      elements.scheduleTitle.textContent = `Search results for "${term}"`;
      elements.scheduleNote.textContent = `${matches.length} matching set${matches.length === 1 ? "" : "s"} across all listed stages and days.`;
      elements.noResults.textContent = "No matching artist was found across the listed stages and days.";
      matches.forEach(appendSet);
      elements.noResults.hidden = matches.length !== 0;
      return;
    }
    const status = getNowPlayingStatus(appState.stage);
    const current = ["active", "final"].includes(status.type) ? status.current : null;
    elements.dayLabel.textContent = appState.day.toUpperCase();
    elements.scheduleTitle.textContent = `${stageLabel} set times`;
    elements.scheduleNote.textContent = `${entries.length} listed set${entries.length === 1 ? "" : "s"}. All times are shown as published.`;
    elements.noResults.hidden = true;
    entries.forEach(([time, artist]) => appendSet({ time, artist, isCurrent: Boolean(current && current.day === appState.day && current.time === time && current.artist === artist) }));
  }

  function setNowPlayingDetails(parts) {
    elements.nowPlayingDetails.textContent = "";
    parts.forEach(part => {
      if (typeof part === "string") elements.nowPlayingDetails.append(document.createTextNode(part));
      else {
        const element = document.createElement(part.tag || "span");
        element.className = part.className || "";
        element.textContent = part.text;
        elements.nowPlayingDetails.append(element);
      }
    });
  }

  function renderNowPlaying() {
    const stageLabel = titleCaseStage(appState.stage);
    const status = getNowPlayingStatus(appState.stage);
    const timeBasis = status.now.isPreview ? "Preview time (Salmo, BC)" : "Salmo, BC time";
    elements.nowPlaying.dataset.status = status.type;
    if (status.type === "active") {
      elements.nowPlayingLabel.textContent = `NOW PLAYING - ${stageLabel.toUpperCase()}`;
      elements.nowPlayingTitle.textContent = status.current.artist;
      setNowPlayingDetails([`Started at ${status.current.time} - Up next: `, { tag: "strong", className: "now-playing-next", text: status.next.artist }, ` at ${status.next.time} - ${timeBasis}`]);
      return;
    }
    if (status.type === "final") {
      elements.nowPlayingLabel.textContent = `FINAL LISTED SET - ${stageLabel.toUpperCase()}`;
      elements.nowPlayingTitle.textContent = status.current.artist;
      setNowPlayingDetails([`Started at ${status.current.time}. The source schedule does not list an end time - ${timeBasis}`]);
      return;
    }
    if (status.type === "upcoming") {
      elements.nowPlayingLabel.textContent = `NO SET SCHEDULED RIGHT NOW - ${stageLabel.toUpperCase()}`;
      elements.nowPlayingTitle.textContent = `Next: ${status.next.artist}`;
      setNowPlayingDetails([`${status.next.day} schedule - ${formatDate(status.next.date)} at ${status.next.time} - `, { tag: "strong", className: "now-playing-next", text: formatStartsIn(status.minutesUntilNext) }, ` - ${timeBasis}`]);
      return;
    }
    elements.nowPlayingLabel.textContent = `NO MORE LISTED SETS - ${stageLabel.toUpperCase()}`;
    elements.nowPlayingTitle.textContent = "No scheduled set right now";
    setNowPlayingDetails([`The live status is only based on the 2026 schedule listed in this guide - ${timeBasis}`]);
  }

  function renderLiveStatus() {
    renderSchedule();
    renderNowPlaying();
  }

  function render() {
    renderTabs();
    renderLiveStatus();
  }

  function updateCampLocationLink() {
    const config = window.CAMP_LOCATION || {};
    const googleMapsUrl = String(config.googleMapsUrl || "").trim();
    const latitude = String(config.latitude || "").trim();
    const longitude = String(config.longitude || "").trim();
    if (googleMapsUrl) elements.campLocation.href = googleMapsUrl;
    else if (latitude && longitude) elements.campLocation.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  }

  elements.search.addEventListener("input", event => { appState.term = event.target.value || ""; renderSchedule(); });
  elements.search.addEventListener("search", event => { appState.term = event.target.value || ""; renderSchedule(); });
  window.addEventListener("hashchange", () => {
    const stage = STAGES.find(item => item.id === decodeURIComponent(window.location.hash.replace(/^#/, "")).toLowerCase());
    if (stage && stage.id !== appState.stage) switchStage(stage.id);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderLiveStatus(); });

  getInitialState();
  updateCampLocationLink();
  render();
  window.setInterval(renderLiveStatus, 30000);
    if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=15").catch(() => {}));
})();
