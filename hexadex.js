// Private Hex Owl profile and Hexadex UI. Hexadex entries are only submitted
// when a tap-specific token was read from a physical Hexlace; ordinary shared
// links still collect set lists, but never add an Owl to the Hexadex.
(() => {
  const API_BASE = "https://shambhala-setlists.hexadecibel.workers.dev";
  const PROFILE_KEY = "shambhala-hex-owl-profile";
  const CACHE_KEY = "shambhala-hexadex-cache";
  const PENDING_KEY = "shambhala-hexadex-pending";
  const API_TIMEOUT_MS = 12000;

  const elements = {
    own: document.querySelector("#hex-owl-card"),
    ownImage: document.querySelector("#hex-owl-image"),
    ownNumber: document.querySelector("#hex-owl-number"),
    ownTraits: document.querySelector("#hex-owl-traits"),
    open: document.querySelector("#hexadex-open"),
    count: document.querySelector("#hexadex-count"),
    dialog: document.querySelector("#hexadex-dialog"),
    grid: document.querySelector("#hexadex-grid"),
    empty: document.querySelector("#hexadex-empty"),
    status: document.querySelector("#hexadex-status"),
    reveal: document.querySelector("#hexadex-reveal-dialog"),
    revealImage: document.querySelector("#hexadex-reveal-image"),
    revealName: document.querySelector("#hexadex-reveal-name"),
    revealNumber: document.querySelector("#hexadex-reveal-number")
  };

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function validOwl(owl) {
    return Boolean(owl && /^[0-9a-f]{32}$/i.test(owl.seed || "")
      && Number.isSafeInteger(owl.version) && owl.version > 0
      && Number.isSafeInteger(owl.number) && owl.number > 0);
  }

  function loadProfile() {
    const profile = readJson(PROFILE_KEY, null);
    return profile && typeof profile.profileId === "string" && typeof profile.profileKey === "string" ? profile : null;
  }

  function saveFromResponse(data) {
    if (!data || typeof data !== "object") return loadProfile();
    const current = loadProfile() || {};
    if (typeof data.profileId === "string" && typeof data.profileKey === "string") {
      current.profileId = data.profileId;
      current.profileKey = data.profileKey;
    }
    if (validOwl(data.owl)) current.owl = data.owl;
    if (!current.profileId || !current.profileKey) return null;
    writeJson(PROFILE_KEY, current);
    renderOwn();
    renderCount();
    return current;
  }

  function setOwl(owl) {
    if (!validOwl(owl)) return loadProfile();
    const current = loadProfile();
    if (!current) return null;
    current.owl = owl;
    writeJson(PROFILE_KEY, current);
    renderOwn();
    return current;
  }

  function clearOwl() {
    const current = loadProfile();
    if (!current) return null;
    delete current.owl;
    writeJson(PROFILE_KEY, current);
    renderOwn();
    return current;
  }

  function requestCredentials() {
    const profile = loadProfile();
    return profile ? { profileId: profile.profileId, profileKey: profile.profileKey } : {};
  }

  function owlLabel(owl) {
    return `HEX #${String(owl.number).padStart(4, "0")}`;
  }

  function putOwl(container, owl) {
    if (!container || !validOwl(owl) || !window.HexOwl) return;
    container.innerHTML = window.HexOwl.renderSvg(owl.seed, owl.version);
  }

  function cachedEntries() {
    const entries = readJson(CACHE_KEY, []);
    return Array.isArray(entries) ? entries.filter(entry => entry && validOwl(entry.owl)) : [];
  }

  function mergeEntry(entry) {
    if (!entry || !validOwl(entry.owl)) return false;
    const entries = cachedEntries();
    const index = entries.findIndex(item => item.owl.number === entry.owl.number);
    if (index >= 0) entries[index] = { ...entries[index], ...entry, firstCollectedAt: entries[index].firstCollectedAt || entry.firstCollectedAt };
    else entries.push(entry);
    entries.sort((a, b) => (b.firstCollectedAt || 0) - (a.firstCollectedAt || 0));
    writeJson(CACHE_KEY, entries);
    renderCount();
    return index < 0;
  }

  function feedback(message) {
    window.dispatchEvent(new CustomEvent("hexadex-feedback", { detail: { message } }));
  }

  async function api(path, options = {}) {
    const response = await window.fetchHexlaceApi(`${API_BASE}${path}`, options, API_TIMEOUT_MS);
    let body = null;
    try { body = await response.json(); } catch {}
    return { ok: response.ok, status: response.status, body };
  }

  function formatCollected(entry) {
    const date = Number(entry.firstCollectedAt);
    const when = Number.isFinite(date)
      ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(date))
      : "Date unknown";
    return `${when} · ${entry.context || `Shambhala ${entry.owl.season || ""}`}`;
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function renderOwn(name = "") {
    if (!elements.own) return;
    const profile = loadProfile();
    elements.own.hidden = !validOwl(profile?.owl);
    if (!validOwl(profile?.owl)) return;
    putOwl(elements.ownImage, profile.owl);
    elements.ownNumber.textContent = owlLabel(profile.owl);
    elements.ownNumber.setAttribute("aria-label", `${name ? `${name}'s ` : "Your "}${owlLabel(profile.owl)}`);
    if (elements.ownTraits && window.HexOwl) {
      const traits = window.HexOwl.traitNames(profile.owl.seed, profile.owl.version);
      elements.ownTraits.textContent = `${traits["Eye style"]} eyes · ${traits.Accessory}`;
    }
  }

  function renderCount() {
    const total = cachedEntries().length;
    const profile = loadProfile();
    if (elements.open) elements.open.hidden = !validOwl(profile?.owl) && total === 0;
    if (elements.count) elements.count.textContent = String(total);
  }

  function renderGrid() {
    if (!elements.grid) return;
    const entries = cachedEntries();
    elements.grid.replaceChildren();
    elements.empty.hidden = entries.length > 0;
    for (const entry of entries) {
      const card = document.createElement("article");
      card.className = "hexadex-entry";
      const art = document.createElement("div");
      art.className = "hexadex-entry-art";
      putOwl(art, entry.owl);
      const copy = document.createElement("div");
      copy.className = "hexadex-entry-copy";
      const name = document.createElement("strong");
      name.textContent = entry.name || "Festival friend";
      const number = document.createElement("span");
      number.className = "hexadex-entry-number";
      number.textContent = owlLabel(entry.owl);
      const collected = document.createElement("small");
      collected.textContent = formatCollected(entry);
      copy.append(name, number, collected);
      card.append(art, copy);
      elements.grid.append(card);
    }
  }

  async function refresh() {
    const profile = loadProfile();
    if (!profile) return false;
    if (elements.status) elements.status.textContent = navigator.onLine === false ? "Showing saved Owls offline." : "Refreshing…";
    if (navigator.onLine === false) {
      renderGrid();
      return false;
    }
    try {
      let cursor = "";
      let pageCount = 0;
      do {
        const query = new URLSearchParams({ limit: "48", ...(cursor ? { cursor } : {}) });
        const result = await api(`/profiles/${profile.profileId}/hexadex?${query}`, {
          cache: "no-store",
          headers: { "X-Profile-Key": profile.profileKey }
        });
        if (!result.ok) throw new Error("Hexadex refresh failed");
        for (const entry of result.body?.entries || []) mergeEntry(entry);
        if (validOwl(result.body?.owl)) setOwl(result.body.owl);
        cursor = result.body?.nextCursor || "";
        pageCount += 1;
      } while (cursor && pageCount < 25);
      if (elements.status) elements.status.textContent = "";
      renderGrid();
      return true;
    } catch {
      if (elements.status) elements.status.textContent = "Couldn’t refresh. Showing Owls saved on this device.";
      renderGrid();
      return false;
    }
  }

  async function open() {
    renderGrid();
    showDialog(elements.dialog);
    await syncPending();
    await refresh();
  }

  function pendingCollections() {
    const pending = readJson(PENDING_KEY, []);
    return Array.isArray(pending) ? pending.filter(item => item?.readId && item?.tapToken) : [];
  }

  async function submitCollection(item, reveal = false) {
    const profile = loadProfile();
    if (!profile || navigator.onLine === false) return false;
    const result = await api(`/profiles/${profile.profileId}/hexadex`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Profile-Key": profile.profileKey },
      body: JSON.stringify(item)
    });
    if (!result.ok || !result.body?.entry) return false;
    const added = mergeEntry(result.body.entry);
    if (reveal && added) {
      putOwl(elements.revealImage, result.body.entry.owl);
      elements.revealName.textContent = result.body.entry.name || "Festival friend";
      elements.revealNumber.textContent = owlLabel(result.body.entry.owl);
      showDialog(elements.reveal);
    }
    return true;
  }

  async function collect(readId, tapToken) {
    if (!readId || !tapToken) return false;
    const items = pendingCollections();
    if (!items.some(item => item.readId === readId && item.tapToken === tapToken)) {
      items.push({ readId, tapToken, firstCollectedAt: Date.now() });
      writeJson(PENDING_KEY, items);
    }
    const item = items.find(candidate => candidate.readId === readId && candidate.tapToken === tapToken);
    if (!loadProfile()) {
      feedback("Hex Owl saved for later. Set up My Hexlace to unlock your Hexadex.");
      return false;
    }
    if (navigator.onLine === false) {
      feedback("Hex Owl tap saved. It will join your Hexadex when you reconnect.");
      return false;
    }
    try {
      const saved = await submitCollection(item, true);
      if (saved) writeJson(PENDING_KEY, pendingCollections().filter(candidate =>
        candidate.readId !== item.readId || candidate.tapToken !== item.tapToken));
      return saved;
    } catch {
      feedback("Hex Owl tap saved. It will retry when you have signal.");
      return false;
    }
  }

  async function syncPending() {
    const profile = loadProfile();
    if (!profile || navigator.onLine === false) return;
    const remaining = [];
    for (const item of pendingCollections()) {
      try {
        if (!(await submitCollection(item, false))) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    writeJson(PENDING_KEY, remaining);
    renderGrid();
  }

  elements.open?.addEventListener("click", open);
  window.addEventListener("online", syncPending);
  renderOwn();
  renderCount();
  window.setTimeout(syncPending, 0);

  window.Hexadex = Object.freeze({
    loadProfile,
    requestCredentials,
    saveFromResponse,
    setOwl,
    clearOwl,
    renderOwn,
    collect,
    syncPending,
    open,
    validOwl
  });
})();
