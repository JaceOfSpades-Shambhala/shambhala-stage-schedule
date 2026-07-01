(() => {
  const STAGES = [
    { id: "amp", label: "AMP" },
    { id: "fractal-forest", label: "Fractal Forest" },
    { id: "grove", label: "Grove" },
    { id: "living-room", label: "Living Room" },
    { id: "pagoda", label: "Pagoda" },
    { id: "village", label: "Village" }
  ];
  const DAYS = ["Thursday", "Friday", "Saturday", "Sunday"];
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
    copyLink: document.querySelector("#copy-link")
  };
  const appState = { stage: "amp", day: "Thursday", term: "" };

  function titleCaseStage(stageId) {
    return STAGES.find(stage => stage.id === stageId)?.label || "AMP";
  }

  function isAvailable(day, stage) {
    return Array.isArray(data[day]?.[stage]) && data[day][stage].length > 0;
  }

  function normaliseForSearch(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .toLowerCase()
      .trim();
  }

  function clearSearch() {
    appState.term = "";
    elements.search.value = "";
  }

  function getInitialState() {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, "")).toLowerCase();
    const matchedStage = STAGES.find(stage => stage.id === hash);
    if (matchedStage) appState.stage = matchedStage.id;

    const params = new URLSearchParams(window.location.search);
    const requestedDay = params.get("day");
    if (DAYS.includes(requestedDay) && isAvailable(requestedDay, appState.stage)) {
      appState.day = requestedDay;
    } else {
      appState.day = DAYS.find(day => isAvailable(day, appState.stage)) || "Friday";
    }
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.hash = appState.stage;
    url.searchParams.set("day", appState.day);
    history.replaceState({}, "", url);
  }

  function switchStage(stageId) {
    appState.stage = stageId;
    if (!isAvailable(appState.day, appState.stage)) {
      appState.day = DAYS.find(day => isAvailable(day, appState.stage)) || "Friday";
    }
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
      button.textContent = day;
      button.disabled = !available;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(day === appState.day));
      button.addEventListener("click", () => switchDay(day));
      elements.dayTabs.append(button);
    });
  }

  // Deliberately reads every entry from the schedule data, rather than the
  // currently selected stage/day. This avoids search being limited by tabs.
  function getGlobalMatches(term) {
    const query = normaliseForSearch(term);
    if (!query) return [];

    const matches = [];
    Object.entries(data).forEach(([day, stages]) => {
      Object.entries(stages || {}).forEach(([stageId, entries]) => {
        const stageLabel = titleCaseStage(stageId);
        (entries || []).forEach(entry => {
          const [time, artist] = entry;
          if (normaliseForSearch(artist).includes(query)) {
            matches.push({ day, stage: stageLabel, time, artist });
          }
        });
      });
    });

    return matches;
  }

  function appendSet({ time, artist, day, stage }) {
    const item = document.createElement("li");
    item.className = "set";

    const timeElement = document.createElement("span");
    timeElement.className = "set-time";
    timeElement.textContent = time;

    const details = document.createElement("span");
    details.className = "set-details";

    const artistElement = document.createElement("span");
    artistElement.className = "set-artist";
    artistElement.textContent = artist;
    details.append(artistElement);

    if (day && stage) {
      const meta = document.createElement("span");
      meta.className = "set-meta";
      meta.textContent = `${day} · ${stage}`;
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
      elements.scheduleTitle.textContent = `Search results for “${term}”`;
      elements.scheduleNote.textContent = `${matches.length} matching set${matches.length === 1 ? "" : "s"} across all listed stages and days.`;
      elements.noResults.textContent = "No matching artist was found across the listed stages and days.";
      matches.forEach(appendSet);
      elements.noResults.hidden = matches.length !== 0;
      return;
    }

    elements.dayLabel.textContent = appState.day.toUpperCase();
    elements.scheduleTitle.textContent = `${stageLabel} set times`;
    elements.scheduleNote.textContent = `${entries.length} listed set${entries.length === 1 ? "" : "s"}. All times are shown as published.`;
    elements.noResults.hidden = true;
    entries.forEach(([time, artist]) => appendSet({ time, artist }));
  }

  function render() {
    renderTabs();
    renderSchedule();
  }

  function handleSearch(event) {
    appState.term = event.target.value || "";
    renderSchedule();
  }

  // input covers typing/pasting; search catches the clear button on mobile browsers.
  elements.search.addEventListener("input", handleSearch);
  elements.search.addEventListener("search", handleSearch);

  elements.copyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const original = elements.copyLink.textContent;
      elements.copyLink.textContent = "Copied";
      window.setTimeout(() => { elements.copyLink.textContent = original; }, 1600);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  });

  window.addEventListener("hashchange", () => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, "")).toLowerCase();
    const stage = STAGES.find(item => item.id === hash);
    if (stage && stage.id !== appState.stage) switchStage(stage.id);
  });

  getInitialState();
  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
