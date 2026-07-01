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
    appState.term = "";
    elements.search.value = "";
    updateUrl();
    render();
  }

  function switchDay(day) {
    if (!isAvailable(day, appState.stage)) return;
    appState.day = day;
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

  function renderSchedule() {
    const stageLabel = titleCaseStage(appState.stage);
    const entries = data[appState.day]?.[appState.stage] || [];
    const term = appState.term.trim().toLowerCase();
    const filtered = term ? entries.filter(([, artist]) => artist.toLowerCase().includes(term)) : entries;

    document.body.className = `stage-${appState.stage}`;
    elements.stageTitle.textContent = stageLabel;
    elements.dayLabel.textContent = appState.day.toUpperCase();
    elements.scheduleTitle.textContent = `${stageLabel} set times`;
    elements.scheduleNote.textContent = `${entries.length} listed set${entries.length === 1 ? "" : "s"}. All times are shown as published.`;
    elements.setList.innerHTML = "";

    filtered.forEach(([time, artist]) => {
      const item = document.createElement("li");
      item.className = "set";
      item.innerHTML = `<span class="set-time">${time}</span><span class="set-artist">${artist}</span>`;
      elements.setList.append(item);
    });
    elements.noResults.hidden = filtered.length !== 0;
  }

  function render() {
    renderTabs();
    renderSchedule();
  }

  elements.search.addEventListener("input", event => {
    appState.term = event.target.value;
    renderSchedule();
  });

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
