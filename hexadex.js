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
    ownRarity: document.querySelector("#hex-owl-rarity"),
    open: document.querySelector("#hexadex-open"),
    openAvatar: document.querySelector("#hexadex-avatar"),
    count: document.querySelector("#hexadex-count"),
    dialog: document.querySelector("#hexadex-dialog"),
    grid: document.querySelector("#hexadex-grid"),
    empty: document.querySelector("#hexadex-empty"),
    status: document.querySelector("#hexadex-status"),
    detail: document.querySelector("#hexadex-detail-dialog"),
    detailEyebrow: document.querySelector("#hexadex-detail-eyebrow"),
    detailArt: document.querySelector("#hexadex-detail-art"),
    detailNumber: document.querySelector("#hexadex-detail-number"),
    detailRarity: document.querySelector("#hexadex-detail-rarity"),
    detailTraits: document.querySelector("#hexadex-detail-traits"),
    detailFooter: document.querySelector("#hexadex-detail-footer"),
    reveal: document.querySelector("#hexadex-reveal-dialog"),
    revealImage: document.querySelector("#hexadex-reveal-image"),
    revealName: document.querySelector("#hexadex-reveal-name"),
    revealNumber: document.querySelector("#hexadex-reveal-number")
  };

  const DETAIL_TRAITS = [
    "Owl colour",
    "Portal rings",
    "Ring finish",
    "Ring twist",
    "Brow treatment",
    "Eye style",
    "Beak",
    "Facial disc",
    "Aura"
  ];

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

  function regenerateV1Owl(owl) {
    if (!validOwl(owl)) return null;
    return owl.version === 1 ? { ...owl, version: 2 } : owl;
  }

  function loadProfile() {
    const profile = readJson(PROFILE_KEY, null);
    if (!profile || typeof profile.profileId !== "string" || typeof profile.profileKey !== "string") return null;
    const owl = regenerateV1Owl(profile.owl);
    if (owl !== profile.owl) {
      profile.owl = owl;
      writeJson(PROFILE_KEY, profile);
    }
    return profile;
  }

  function saveFromResponse(data) {
    if (!data || typeof data !== "object") return loadProfile();
    const current = loadProfile() || {};
    if (typeof data.profileId === "string" && typeof data.profileKey === "string") {
      current.profileId = data.profileId;
      current.profileKey = data.profileKey;
    }
    if (validOwl(data.owl)) current.owl = regenerateV1Owl(data.owl);
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
    current.owl = regenerateV1Owl(owl);
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
    void window.HexOwl.hydrate?.(container);
  }

  function traitsFor(owl) {
    if (!validOwl(owl) || !window.HexOwl) return {};
    try {
      return window.HexOwl.traitNames(owl.seed, owl.version) || {};
    } catch {
      return {};
    }
  }

  function cachedEntries() {
    const entries = readJson(CACHE_KEY, []);
    if (!Array.isArray(entries)) return [];
    let changed = false;
    const migrated = entries.filter(entry => entry && validOwl(entry.owl)).map(entry => {
      const owl = regenerateV1Owl(entry.owl);
      if (owl !== entry.owl) {
        changed = true;
        return { ...entry, owl };
      }
      return entry;
    });
    if (changed) writeJson(CACHE_KEY, migrated);
    return migrated;
  }

  function mergeEntry(entry) {
    if (!entry || !validOwl(entry.owl)) return false;
    entry = { ...entry, owl: regenerateV1Owl(entry.owl) };
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

  function openDetail({ owl, name = "", firstCollectedAt, context, isOwn = false }) {
    if (!validOwl(owl) || !elements.detail) return;
    const traits = traitsFor(owl);
    const rarity = traits.Rarity || "Unknown rarity";
    const displayName = name || "Festival friend";
    elements.detailEyebrow.textContent = isOwn ? "Your Hex Owl" : `Hex Owl - ${displayName}`;
    putOwl(elements.detailArt, owl);
    elements.detailNumber.textContent = owlLabel(owl);
    elements.detailRarity.textContent = `${rarity} - 2026 edition`;
    elements.detailTraits.replaceChildren();
    for (const trait of DETAIL_TRAITS) {
      const row = document.createElement("div");
      row.className = "hexadex-detail-trait";
      const label = document.createElement("span");
      label.className = "hexadex-detail-trait-label";
      label.textContent = trait;
      const value = document.createElement("span");
      value.className = "hexadex-detail-trait-value";
      value.textContent = traits[trait] || "Unknown";
      row.append(label, value);
      elements.detailTraits.append(row);
    }
    elements.detailFooter.textContent = isOwn
      ? "Travels with your physical Hexlace, always."
      : `Collected ${formatCollected({ owl, firstCollectedAt, context })}`;
    showDialog(elements.detail);
  }

  function renderOwn(name = "") {
    if (!elements.own) return;
    const profile = loadProfile();
    const hasOwnOwl = validOwl(profile?.owl);
    elements.own.hidden = !hasOwnOwl;
    if (elements.openAvatar) elements.openAvatar.hidden = !hasOwnOwl;
    if (!hasOwnOwl) {
      elements.own.removeAttribute("aria-label");
      renderCount();
      return;
    }
    const traits = traitsFor(profile.owl);
    const rarity = traits.Rarity || "Unknown rarity";
    putOwl(elements.ownImage, profile.owl);
    putOwl(elements.openAvatar, profile.owl);
    elements.ownNumber.textContent = owlLabel(profile.owl);
    elements.ownRarity.textContent = rarity;
    elements.own.setAttribute("aria-label", `Your Hex Owl, ${owlLabel(profile.owl)}, ${rarity}. Show details.`);
    renderCount();
  }

  function renderCount() {
    const profile = loadProfile();
    const total = cachedEntries().length + (validOwl(profile?.owl) ? 1 : 0);
    if (elements.open) elements.open.hidden = !validOwl(profile?.owl) && total === 0;
    if (elements.count) elements.count.textContent = String(total);
  }

  function ghostSlot(rotated = false) {
    const slot = document.createElement("div");
    slot.className = `hexadex-ghost${rotated ? " is-rotated" : ""}`;
    slot.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    const hexagon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    hexagon.setAttribute("points", "50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27");
    hexagon.setAttribute("fill", "none");
    hexagon.setAttribute("stroke", "var(--accent)");
    hexagon.setAttribute("stroke-width", "2.5");
    svg.append(hexagon);
    slot.append(svg);
    return slot;
  }

  function renderGrid() {
    if (!elements.grid) return;
    const entries = cachedEntries();
    const profile = loadProfile();
    elements.grid.replaceChildren();
    elements.grid.classList.toggle("is-empty", entries.length === 0);
    elements.empty.hidden = entries.length > 0;
    if (validOwl(profile?.owl)) {
      const own = document.createElement("button");
      own.className = "hexadex-own-slot";
      own.type = "button";
      own.setAttribute("aria-label", `Your Hex Owl, ${owlLabel(profile.owl)}. Show details.`);
      const art = document.createElement("span");
      art.className = "hexadex-own-art";
      putOwl(art, profile.owl);
      const label = document.createElement("span");
      label.className = "hexadex-own-label";
      label.textContent = "Yours";
      own.append(art, label);
      own.addEventListener("click", () => openDetail({ owl: profile.owl, isOwn: true }));
      elements.grid.append(own);
    }
    if (entries.length === 0) elements.grid.append(ghostSlot(), ghostSlot(true));
    for (const entry of entries) {
      const card = document.createElement("button");
      card.className = "hexadex-entry";
      card.type = "button";
      const displayName = entry.name || "Festival friend";
      card.setAttribute("aria-label", `Hex Owl - ${displayName}, ${owlLabel(entry.owl)}. Show details.`);
      const art = document.createElement("span");
      art.className = "hexadex-entry-art";
      putOwl(art, entry.owl);
      const copy = document.createElement("span");
      copy.className = "hexadex-entry-copy";
      const name = document.createElement("strong");
      name.textContent = displayName;
      const number = document.createElement("span");
      number.className = "hexadex-entry-number";
      number.textContent = owlLabel(entry.owl);
      const collected = document.createElement("small");
      collected.textContent = formatCollected(entry);
      copy.append(name, number, collected);
      card.append(art, copy);
      card.addEventListener("click", () => openDetail({
        owl: entry.owl,
        name: displayName,
        firstCollectedAt: entry.firstCollectedAt,
        context: entry.context
      }));
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

  elements.own?.addEventListener("click", () => {
    const profile = loadProfile();
    if (validOwl(profile?.owl)) openDetail({ owl: profile.owl, isOwn: true });
  });
  elements.open?.addEventListener("click", open);
  elements.detail?.addEventListener("click", event => {
    if (event.target === elements.detail) elements.detail.close?.();
  });
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
