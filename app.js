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
    stagePoster: document.querySelector("#stage-poster"),
    posterDay: document.querySelector("#poster-day"),
    scheduleNote: document.querySelector("#schedule-note"),
    setList: document.querySelector("#set-list"),
    noResults: document.querySelector("#no-results"),
    search: document.querySelector("#artist-search"),
    campLocation: document.querySelector("#camp-location-link"),
    nowPlaying: document.querySelector("#now-playing"),
    nowPlayingLabel: document.querySelector("#now-playing-label"),
    nowPlayingTitle: document.querySelector("#now-playing-title"),
    nowPlayingDetails: document.querySelector("#now-playing-details"),
    scheduleVersion: document.querySelector("#schedule-version"),
    updateBanner: document.querySelector("#update-banner")
  };
  const appState = { stage: "amp", day: "Thursday", term: "" };

  function titleCaseStage(stageId) {
    return STAGES.find(stage => stage.id === stageId)?.label || "AMP";
  }

  // A malformed percent-encoding in the URL hash (e.g. a truncated shared link
  // or a mis-written NFC tag) otherwise throws and aborts the whole script.
  function safeDecodeHash() {
    try { return decodeURIComponent(window.location.hash.replace(/^#/, "")); }
    catch { return window.location.hash.replace(/^#/, ""); }
  }

  function isAvailable(day, stage) {
    return Array.isArray(data[day]?.[stage]) && data[day][stage].length > 0;
  }

  function normaliseForSearch(value) {
    return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'").toLowerCase().trim();
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

  // The actual festival programming day right now, independent of any stage.
  // Sets run past midnight, so early-morning hours still belong to the
  // previous day's programming. Returns null outside the festival.
  function getCurrentFestivalDay() {
    const now = getFestivalNow();
    const date = now.minutes < 10 * 60 ? addDays(now.date, -1) : now.date;
    return DAYS.find(day => FESTIVAL_DATES[day] === date) || null;
  }

  function getCurrentScheduleDay(stageId) {
    const currentFestivalDay = getCurrentFestivalDay();
    if (currentFestivalDay && isAvailable(currentFestivalDay, stageId)) return currentFestivalDay;

    const status = getNowPlayingStatus(stageId);
    if (status.current?.day && isAvailable(status.current.day, stageId)) return status.current.day;
    if (status.next?.day && isAvailable(status.next.day, stageId)) {
      const nowSerial = dateToSerial(status.now.date);
      if (nowSerial >= dateToSerial(FESTIVAL_DATES.Thursday) && nowSerial <= dateToSerial(addDays(FESTIVAL_DATES.Sunday, 1))) return status.next.day;
    }
    return null;
  }

  function getInitialState() {
    const hash = safeDecodeHash().toLowerCase();
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
    const currentScheduleDay = getCurrentFestivalDay();
    elements.stageTabs.innerHTML = "";
    STAGES.forEach(stage => {
      const button = document.createElement("button");
      button.className = "tab";
      button.type = "button";
      button.textContent = stage.label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(stage.id === appState.stage));
      button.setAttribute("aria-controls", "schedule");
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
      button.setAttribute("aria-controls", "schedule");
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

  function appendSet({ time, artist, day, stage, isCurrent = false, state = "", sub = "", progress = null }) {
    const item = document.createElement("li");
    item.className = "set";
    if (isCurrent) item.setAttribute("aria-current", "true");
    if (state) item.classList.add(`set-${state}`);
    // A timeline node is drawn only in the day/stage view (which passes a
    // state); search results stay as flat rows.
    if (state) {
      const node = document.createElement("span");
      node.className = "set-node";
      node.setAttribute("aria-hidden", "true");
      item.append(node);
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
    if (sub) {
      const subElement = document.createElement("span");
      subElement.className = "set-sub";
      subElement.textContent = sub;
      details.append(subElement);
      if (progress !== null) {
        const track = document.createElement("span");
        track.className = "set-progress";
        const fill = document.createElement("span");
        fill.className = "set-progress-fill";
        fill.style.width = `${progress}%`;
        track.append(fill);
        details.append(track);
      }
    } else if (isCurrent) {
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

  function upNextLabel(minutes) {
    const safe = Math.max(0, minutes);
    if (safe < 1) return "UP NEXT - NOW";
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    if (hours && mins) return `UP NEXT - IN ${hours} HR ${mins} MIN`;
    if (hours) return `UP NEXT - IN ${hours} HR`;
    return `UP NEXT - IN ${mins} MIN`;
  }

  // The official stage-name art used as the poster heading. Falls back to
  // plain text if an image ever fails to load.
  function setPosterArt(stageLabel) {
    const art = document.createElement("img");
    art.id = "poster-mark";
    art.className = "poster-mark";
    art.src = `stage-names/${appState.stage}.png?v=40`;
    art.alt = stageLabel;
    art.addEventListener("error", () => {
      const fallback = document.createElement("h2");
      fallback.id = "poster-mark";
      fallback.className = "poster-fallback";
      fallback.textContent = stageLabel;
      art.replaceWith(fallback);
    });
    elements.stagePoster.querySelector("#poster-mark").replaceWith(art);
  }

  function renderSchedule() {
    const stageLabel = titleCaseStage(appState.stage);
    const entries = data[appState.day]?.[appState.stage] || [];
    const term = appState.term.trim();
    document.body.className = `stage-${appState.stage}`;
    elements.setList.innerHTML = "";
    if (term) {
      const matches = getGlobalMatches(term);
      elements.stagePoster.hidden = true;
      elements.scheduleNote.textContent = `${matches.length} matching set${matches.length === 1 ? "" : "s"} across all listed stages and days.`;
      elements.noResults.textContent = "No matching artist was found across the listed stages and days.";
      elements.setList.classList.remove("timeline");
      matches.forEach(appendSet);
      elements.noResults.hidden = matches.length !== 0;
      return;
    }
    const status = getNowPlayingStatus(appState.stage);
    const current = ["active", "final"].includes(status.type) ? status.current : null;
    const next = status.next || null;
    const nowKey = nowToKey(status.now);
    const timeline = buildStageTimeline(appState.stage);
    elements.stagePoster.hidden = false;
    setPosterArt(stageLabel);
    elements.posterDay.textContent = appState.day.toUpperCase();
    elements.scheduleNote.textContent = "Unofficial guide - set times can change.";
    elements.noResults.hidden = true;
    elements.setList.classList.add("timeline");
    entries.forEach(([time, artist]) => {
      const isCurrent = Boolean(current && current.day === appState.day && current.time === time && current.artist === artist);
      const isNext = Boolean(next && next.day === appState.day && next.time === time && next.artist === artist);
      const index = timeline.findIndex(entry => entry.day === appState.day && entry.time === time && entry.artist === artist);
      const key = index === -1 ? null : timeline[index].key;
      let state = "up";
      let sub = "";
      let progress = null;
      if (isCurrent) {
        state = "now";
        const endEntry = index === -1 ? null : timeline[index + 1];
        if (endEntry) {
          const span = endEntry.key - key;
          progress = span > 0 ? Math.max(0, Math.min(100, Math.round((nowKey - key) / span * 100))) : null;
          sub = `ON NOW - ENDS ${endEntry.time}`;
        } else {
          sub = "ON NOW";
        }
      } else if (isNext) {
        state = "next";
        sub = upNextLabel(next.key - nowKey);
      } else if (key !== null && key <= nowKey) {
        state = "done";
      }
      appendSet({ time, artist, isCurrent, state, sub, progress });
    });
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
    const status = getNowPlayingStatus(appState.stage);
    elements.nowPlaying.dataset.status = status.type;
    if (status.type === "active") {
      elements.nowPlayingLabel.textContent = "ON NOW";
      elements.nowPlayingTitle.textContent = status.current.artist;
      setNowPlayingDetails([`Started at ${status.current.time} - Up next: `, { tag: "strong", className: "now-playing-next", text: status.next.artist }, ` at ${status.next.time}`]);
      return;
    }
    if (status.type === "final") {
      elements.nowPlayingLabel.textContent = "FINAL LISTED SET";
      elements.nowPlayingTitle.textContent = status.current.artist;
      setNowPlayingDetails([`Started at ${status.current.time}. The source schedule does not list an end time.`]);
      return;
    }
    if (status.type === "upcoming") {
      elements.nowPlayingLabel.textContent = "NO SET SCHEDULED RIGHT NOW";
      elements.nowPlayingTitle.textContent = `Next: ${status.next.artist}`;
      setNowPlayingDetails([`${formatDate(status.next.date)} at ${status.next.time} - `, { tag: "strong", className: "now-playing-next", text: formatStartsIn(status.minutesUntilNext) }]);
      return;
    }
    elements.nowPlayingLabel.textContent = "NO MORE LISTED SETS";
    elements.nowPlayingTitle.textContent = "No scheduled set right now";
    setNowPlayingDetails(["The live status is only based on the 2026 schedule listed in this guide."]);
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

  const SCHEDULE_ASSET = "schedule-data.js?v=40";
  const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  let updateAvailable = false;

  function renderScheduleVersion() {
    if (!elements.scheduleVersion) return;
    const version = String(window.SCHEDULE_VERSION || "").trim();
    elements.scheduleVersion.textContent = version ? `Schedule data: ${version}.` : "";
    elements.scheduleVersion.hidden = !version;
  }

  function showUpdateBanner() {
    updateAvailable = true;
    elements.updateBanner.hidden = false;
  }

  // The release number lives in a comment at the top of <body>; every deploy
  // bumps it, so comparing it against the live copy detects new app code the
  // same way SCHEDULE_VERSION detects new set times.
  function currentAppVersion() {
    for (const node of document.body.childNodes) {
      if (node.nodeType === Node.COMMENT_NODE) {
        const match = node.textContent.match(/v(\d+)/);
        if (match) return match[1];
      }
    }
    return "";
  }

  async function checkForScheduleUpdate() {
    if (updateAvailable || document.hidden || navigator.onLine === false) return;
    if (!elements.updateBanner) return;
    try {
      // "no-cache" revalidates with the server's ETag - a ~304 (few hundred
      // bytes) when nothing changed - and the service worker stores any fresh
      // copy it fetches here, so a refresh can still work if signal drops after
      // the check completes.
      const currentVersion = String(window.SCHEDULE_VERSION || "").trim();
      if (currentVersion) {
        const response = await fetch(SCHEDULE_ASSET, { cache: "no-cache" });
        if (response.ok) {
          const latest = (await response.text()).match(/SCHEDULE_VERSION\s*=\s*"([^"]+)"/)?.[1];
          if (latest && latest !== currentVersion) return showUpdateBanner();
        }
      }
      const appVersion = currentAppVersion();
      if (appVersion) {
        const response = await fetch("index.html", { cache: "no-cache" });
        if (response.ok) {
          const latest = (await response.text()).match(/<!--\s*v(\d+)\s*-->/)?.[1];
          if (latest && latest !== appVersion) showUpdateBanner();
        }
      }
    } catch {}
  }

  elements.search.addEventListener("input", event => { appState.term = event.target.value || ""; renderSchedule(); });
  elements.search.addEventListener("search", event => { appState.term = event.target.value || ""; renderSchedule(); });
  window.addEventListener("hashchange", () => {
    const stage = STAGES.find(item => item.id === safeDecodeHash().toLowerCase());
    if (stage && stage.id !== appState.stage) switchStage(stage.id);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    renderLiveStatus();
    checkForScheduleUpdate();
  });
  elements.updateBanner?.addEventListener("click", () => window.location.reload());

  getInitialState();
  updateCampLocationLink();
  renderScheduleVersion();
  render();
  window.setInterval(renderLiveStatus, 30000);
  window.setTimeout(checkForScheduleUpdate, 8000);
  window.setInterval(checkForScheduleUpdate, UPDATE_CHECK_INTERVAL_MS);
  async function registerPeriodicSync() {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (!("periodicSync" in registration)) return;
      // Only granted for installed PWAs with enough engagement; never prompts,
      // and a no-op on browsers without the permission or the API.
      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state !== "granted") return;
      await registration.periodicSync.register("refresh-schedule", { minInterval: 6 * 60 * 60 * 1000 });
    } catch {}
  }

  if ("serviceWorker" in navigator) window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js?v=40").then(registerPeriodicSync).catch(() => {});
  });
})();
