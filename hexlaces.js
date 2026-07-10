// Hexlaces - live set-list sharing. Each person's NFC tag (or QR code) carries
// a permanent read-only link (?f=<readId>). Opening it collects that person's
// list into the "Friends' sets collected" panel, refreshed whenever there's signal.
// A secret write key, held only in the owner's localStorage, is what publishes
// changes - so tapping someone's tag can only ever read, never overwrite.
// Giveaway tags add a claim token (?claim=). Opening one quietly records the
// scan time and a local write key, then syncs that claim whenever signal exists.
// If another phone hits the server first, the earliest recorded scan still wins.
(() => {
  const API_BASE = "https://shambhala-setlists.hexadecibel.workers.dev";
  const IDENTITY_KEY = "shambhala-2026-hexlace-identity";
  const COLLECTED_KEY = "shambhala-2026-hexlaces-collected";
  const SETS_KEY = "shambhala-2026-my-set-list";
  const PING_KEY = "shambhala-2026-ping";
  const HANDOFF_COOKIE = "shambhala-2026-hexlace-handoff";
  const HANDOFF_MAX_AGE_SECONDS = 24 * 60 * 60;
  const STAGES = [
    { id: "amp", label: "AMP" },
    { id: "fractal-forest", label: "Fractal Forest" },
    { id: "grove", label: "Grove" },
    { id: "living-room", label: "Living Room" },
    { id: "pagoda", label: "Pagoda" },
    { id: "secret-garden", label: "Secret Garden" },
    { id: "village", label: "Village" }
  ];
  const PING_LOCATIONS = {
    camp: "At camp",
    river: "At the river",
    vendors: "At the vendors"
  };
  const PUBLISH_DEBOUNCE_MS = 4000;
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const REFRESH_MIN_AGE_MS = 60 * 1000;
  const FESTIVAL_TIME_ZONE = "America/Vancouver";

  const elements = {
    myPanel: document.querySelector("#my-hexlace"),
    panel: document.querySelector("#hexlaces"),
    count: document.querySelector("#hexlace-count"),
    list: document.querySelector("#hexlace-list"),
    empty: document.querySelector("#hexlace-empty"),
    setup: document.querySelector("#hexlace-setup"),
    enable: document.querySelector("#hexlace-enable"),
    mine: document.querySelector("#hexlace-mine"),
    myName: document.querySelector("#hexlace-name"),
    status: document.querySelector("#hexlace-status"),
    rename: document.querySelector("#hexlace-rename"),
    shareLink: document.querySelector("#hexlace-share-link"),
    qr: document.querySelector("#hexlace-qr"),
    nfc: document.querySelector("#hexlace-nfc"),
    giveaway: document.querySelector("#hexlace-giveaway"),
    giveawayResult: document.querySelector("#hexlace-giveaway-result"),
    giveawayQr: document.querySelector("#hexlace-giveaway-qr"),
    giveawayUrl: document.querySelector("#hexlace-giveaway-url"),
    giveawayShare: document.querySelector("#hexlace-giveaway-share"),
    giveawayNfc: document.querySelector("#hexlace-giveaway-nfc"),
    editor: document.querySelector("#hexlace-editor"),
    editorPrompt: document.querySelector("#hexlace-editor-prompt"),
    nameInput: document.querySelector("#hexlace-name-input"),
    nameSave: document.querySelector("#hexlace-name-save"),
    nameCancel: document.querySelector("#hexlace-name-cancel"),
    feedback: document.querySelector("#hexlace-feedback")
  };
  if (!elements.myPanel || !elements.panel) return;

  const friendOpenState = new Map();
  let editorMode = "";
  let publishTimer = 0;
  let giveawayLink = "";
  let renderedQrUrl = "";
  let claiming = false;
  let preparingHandoff = false;
  let redeemingHandoff = false;
  let handoffPreparedThisPage = false;

  // Unambiguous alphabet (no 0/O/1/l/I), matching the Worker's id style.
  const KEY_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  function randomKey(length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    let out = "";
    for (const byte of bytes) out += KEY_ALPHABET[byte % KEY_ALPHABET.length];
    return out;
  }

  function renderQr(container, url) {
    if (typeof qrcode !== "function" || !container) return;
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  function stageLabel(stageId) {
    return STAGES.find(stage => stage.id === stageId)?.label || stageId;
  }

  function isPingLocation(value) {
    return Object.prototype.hasOwnProperty.call(PING_LOCATIONS, value);
  }

  function loadIdentity() {
    try {
      const parsed = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
      return parsed && parsed.readId && parsed.writeKey ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveIdentity(identity) {
    try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch {}
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function appCookiePath() {
    const path = location.pathname || "/";
    if (path.endsWith("/")) return path;
    return path.slice(0, path.lastIndexOf("/") + 1) || "/";
  }

  function handoffCookie() {
    const prefix = `${HANDOFF_COOKIE}=`;
    const cookie = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
    if (!cookie) return "";
    try { return decodeURIComponent(cookie.slice(prefix.length)); } catch { return ""; }
  }

  function setHandoffCookie(token) {
    document.cookie = `${HANDOFF_COOKIE}=${encodeURIComponent(token)}; Max-Age=${HANDOFF_MAX_AGE_SECONDS}; Path=${appCookiePath()}; Secure; SameSite=Strict`;
  }

  function clearHandoffCookie() {
    document.cookie = `${HANDOFF_COOKIE}=; Max-Age=0; Path=${appCookiePath()}; Secure; SameSite=Strict`;
  }

  function isVisibleIdentity(identity) {
    return Boolean(identity && (identity.name || !identity.silentClaim));
  }

  function loadCollected() {
    try {
      const parsed = JSON.parse(localStorage.getItem(COLLECTED_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(entry => entry && entry.readId) : [];
    } catch {
      return [];
    }
  }

  function saveCollected(entries) {
    try { localStorage.setItem(COLLECTED_KEY, JSON.stringify(entries)); } catch {}
  }

  function mySets() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function myPing() {
    try {
      const ping = JSON.parse(localStorage.getItem(PING_KEY) || "null");
      return ping && (ping.type === "set" || isPingLocation(ping.type)) && Number.isSafeInteger(ping.endKey) && ping.endKey > festivalNowKey() ? ping : null;
    } catch {
      return null;
    }
  }

  function dateToSerial(date) {
    const [year, month, day] = date.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  }

  function festivalNowKey() {
    const preview = new URLSearchParams(window.location.search).get("preview");
    const previewMatch = preview && preview.match(/^(2026-07-\d{2})T(\d{2}):(\d{2})$/);
    if (previewMatch) return dateToSerial(previewMatch[1]) * 1440 + Number(previewMatch[2]) * 60 + Number(previewMatch[3]);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: FESTIVAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return dateToSerial(`${values.year}-${values.month}-${values.day}`) * 1440 + (Number(values.hour) % 24) * 60 + Number(values.minute);
  }

  function formatPingTime(key) {
    const minutes = ((key % 1440) + 1440) % 1440;
    const hour24 = Math.floor(minutes / 60);
    const hour = hour24 % 12 || 12;
    const minute = String(minutes % 60).padStart(2, "0");
    return `${hour}:${minute} ${hour24 < 12 ? "AM" : "PM"}`;
  }

  function shareUrl(readId) {
    return `${location.origin}${location.pathname.replace(/index\.html$/, "")}?f=${readId}`;
  }

  function feedback(message) {
    if (!elements.feedback) return;
    elements.feedback.textContent = message;
    window.clearTimeout(feedback.timeout);
    feedback.timeout = window.setTimeout(() => { elements.feedback.textContent = ""; }, 3200);
  }

  function syncMyPanelOpen() {
    if (editorMode) elements.myPanel.open = true;
  }

  function timeAgo(timestamp) {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} d ago`;
  }

  async function api(path, options) {
    const response = await fetch(`${API_BASE}${path}`, options);
    let body = null;
    try { body = await response.json(); } catch {}
    return { ok: response.ok, status: response.status, body };
  }

  async function prepareHandoff(identity = loadIdentity(), force = false) {
    // iOS copies first-party cookies into a newly installed Home Screen app.
    // Safari keeps the write key in localStorage and exposes only this opaque,
    // expiring ticket for that one-time bootstrap.
    if (isStandalone() || preparingHandoff || !identity || identity.pendingClaim) return false;
    if (!force && (handoffPreparedThisPage || handoffCookie())) return true;
    preparingHandoff = true;
    try {
      const result = await api(`/lists/${identity.readId}/handoff`, {
        method: "POST",
        headers: { "X-Write-Key": identity.writeKey }
      });
      if (!result.ok || !result.body?.token) return false;
      setHandoffCookie(result.body.token);
      handoffPreparedThisPage = true;
      return true;
    } catch {
      return false;
    } finally {
      preparingHandoff = false;
    }
  }

  async function redeemHandoff() {
    if (!isStandalone() || loadIdentity() || redeemingHandoff) return false;
    const token = handoffCookie();
    if (!token) return false;
    redeemingHandoff = true;
    try {
      const result = await api("/handoffs/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (!result.ok || !result.body?.readId || !result.body?.writeKey) {
        if (result.status === 410) {
          clearHandoffCookie();
          feedback("Hexlace transfer expired. Open the site in Safari before installing again.");
        }
        return false;
      }
      clearHandoffCookie();
      saveIdentity({
        readId: result.body.readId,
        writeKey: result.body.writeKey,
        name: result.body.name || "",
        lastPublished: Date.now()
      });
      if (!mySets().length && Array.isArray(result.body.sets) && result.body.sets.length) {
        try { localStorage.setItem(SETS_KEY, JSON.stringify(result.body.sets)); } catch {}
        window.dispatchEvent(new CustomEvent("setlist-restored"));
      }
      if (!myPing() && result.body.ping) {
        try { localStorage.setItem(PING_KEY, JSON.stringify(result.body.ping)); } catch {}
        window.dispatchEvent(new CustomEvent("ping-restored"));
      }
      renderMine();
      feedback("Your Hexlace moved into the Home Screen app.");
      return true;
    } catch {
      // Keep the cookie so a temporary connection failure can retry later.
      return false;
    } finally {
      redeemingHandoff = false;
    }
  }

  // --- My Hexlace: publishing ---------------------------------------------

  function renderMine() {
    const identity = loadIdentity();
    const visibleIdentity = isVisibleIdentity(identity);
    syncMyPanelOpen();
    elements.setup.hidden = Boolean(visibleIdentity) || editorMode === "enable" || editorMode === "claim";
    elements.mine.hidden = !visibleIdentity || editorMode === "claim";
    elements.editor.hidden = !editorMode;
    if (!visibleIdentity) return;
    elements.myName.textContent = identity.name || "(no name yet)";
    if (identity.pendingClaim) elements.status.textContent = "Changes waiting for signal to publish.";
    else if (identity.invalid) elements.status.textContent = "This sharing link stopped working. Tap your name to try re-publishing.";
    else if (identity.dirty) elements.status.textContent = "Changes waiting for signal to publish.";
    else if (identity.lastPublished) elements.status.textContent = `Live - published ${timeAgo(identity.lastPublished)}.`;
    else elements.status.textContent = "Live.";
    const url = shareUrl(identity.readId);
    if (url !== renderedQrUrl) {
      renderQr(elements.qr, url);
      renderedQrUrl = url;
    }
  }

  function markDirtyAndPublishSoon(delay = PUBLISH_DEBOUNCE_MS) {
    const identity = loadIdentity();
    if (!identity) return;
    identity.dirty = true;
    saveIdentity(identity);
    renderMine();
    window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(publish, delay);
  }

  async function createSharingIdentity(name) {
    const result = await api("/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sets: mySets(), ping: myPing() })
    });
    if (!result.ok || !result.body?.readId) return false;
    const identity = { readId: result.body.readId, writeKey: result.body.writeKey, name, lastPublished: Date.now() };
    saveIdentity(identity);
    await prepareHandoff(identity);
    return true;
  }

  async function publish(options = {}) {
    const identity = loadIdentity();
    if (!identity || !identity.name) return false;
    // A freshly claimed tag has no server-side write key until the claim lands,
    // so finish that first; the claim publishes the current list on success.
    if (identity.pendingClaim) return flushPendingClaim(options);
    try {
      const result = await api(`/lists/${identity.readId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Write-Key": identity.writeKey },
        body: JSON.stringify({ name: identity.name, sets: mySets(), ping: myPing() })
      });
      if (result.ok) {
        identity.dirty = false;
        identity.invalid = false;
        identity.lastPublished = Date.now();
      } else if (result.status === 403 || result.status === 404) {
        if (options.fallbackToNew && identity.claimScannedAt) {
          const created = await createSharingIdentity(identity.name);
          renderMine();
          return created;
        }
        identity.invalid = true;
      }
      saveIdentity(identity);
      if (result.ok) await prepareHandoff(identity);
      renderMine();
      return result.ok;
    } catch {
      identity.dirty = true;
      saveIdentity(identity);
    }
    renderMine();
    return false;
  }

  function openEditor(mode, prompt, prefill) {
    editorMode = mode;
    elements.editorPrompt.textContent = prompt;
    elements.nameInput.value = prefill || "";
    renderMine();
    elements.nameInput.focus();
  }

  function closeEditor() {
    editorMode = "";
    renderMine();
  }

  async function saveName() {
    const name = elements.nameInput.value.trim();
    if (!name) { feedback("Please enter a name."); return; }
    elements.nameSave.disabled = true;
    try {
      if (editorMode === "enable") {
        const reserved = loadIdentity();
        if (reserved?.silentClaim) {
          reserved.name = name;
          reserved.dirty = true;
          reserved.silentClaim = false;
          saveIdentity(reserved);
          closeEditor();
          const live = await publish({ fallbackToNew: true });
          feedback(live ? "Sharing is live!" : "Changes waiting for signal to publish.");
          return;
        }
        try {
          if (!(await createSharingIdentity(name))) { feedback("Couldn't start sharing - check your signal."); return; }
        } catch {
          feedback("Couldn't start sharing - you need signal for this first step.");
          return;
        }
        feedback("Sharing is live!");
      } else {
        const identity = loadIdentity();
        if (!identity) return;
        identity.name = name;
        saveIdentity(identity);
        feedback("Name updated.");
        publish();
      }
      closeEditor();
    } finally {
      elements.nameSave.disabled = false;
    }
  }

  // --- Giveaway tags -------------------------------------------------------

  async function createGiveaway() {
    elements.giveaway.disabled = true;
    try {
      const result = await api("/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Unclaimed Hexlace", sets: [], claimable: true })
      });
      if (!result.ok || !result.body?.readId) { feedback("Couldn't create one - check your signal."); return; }
      giveawayLink = `${shareUrl(result.body.readId)}&claim=${result.body.claimToken}`;
      elements.giveawayUrl.textContent = giveawayLink;
      renderQr(elements.giveawayQr, giveawayLink);
      elements.giveawayResult.hidden = false;
      addCollected(result.body.readId, "Unclaimed Hexlace");
      feedback("Giveaway Hexlace created.");
    } finally {
      elements.giveaway.disabled = false;
    }
  }

  function claimHexlace(readId, claimToken) {
    // Adopt the tag right away with a locally generated key so naming and
    // list-building work offline; the claim is sent (and retried) on signal.
    saveIdentity({ readId, writeKey: randomKey(24), name: "", pendingClaim: claimToken, claimScannedAt: Date.now(), silentClaim: true, dirty: true });
    flushPendingClaim();
    return true;
  }

  async function flushPendingClaim(options = {}) {
    const identity = loadIdentity();
    if (!identity || !identity.pendingClaim || claiming) return false;
    claiming = true;
    try {
      const result = await api(`/lists/${identity.readId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken: identity.pendingClaim, writeKey: identity.writeKey, scannedAt: identity.claimScannedAt || Date.now() })
      });
      if (result.ok) {
        const claimed = loadIdentity();
        if (claimed && claimed.readId === identity.readId) {
          delete claimed.pendingClaim;
          if (result.body?.accepted === false && claimed.silentClaim && !claimed.name) {
            try { localStorage.removeItem(IDENTITY_KEY); } catch {}
            renderMine();
            return false;
          }
          saveIdentity(claimed);
          await prepareHandoff(claimed);
          if (claimed.name) return publish(options);
          renderMine();
          return true;
        }
      } else if (result.status === 409 || result.status === 403) {
        // Keep the user's sets and quietly drop an unstarted background claim.
        const lostId = identity.readId;
        try { localStorage.removeItem(IDENTITY_KEY); } catch {}
        editorMode = "";
        if (!identity.silentClaim) addCollected(lostId, "");
        renderMine();
      }
    } catch {
      // Offline: leave the pending claim in place and try again later.
    } finally {
      claiming = false;
    }
    return false;
  }

  function syncMine() {
    const identity = loadIdentity();
    if (!identity) {
      redeemHandoff();
      return;
    }
    if (identity.pendingClaim) flushPendingClaim({ fallbackToNew: Boolean(identity.claimScannedAt) });
    else if (identity.dirty) publish({ fallbackToNew: Boolean(identity.claimScannedAt) });
    else prepareHandoff(identity);
  }

  // --- Collecting friends --------------------------------------------------

  function buildFriendPing(ping) {
    if (!ping || !Number.isSafeInteger(ping.startKey) || !Number.isSafeInteger(ping.endKey)) return null;
    const nowKey = festivalNowKey();
    if (ping.endKey <= nowKey) return null;
    const card = document.createElement("span");
    card.className = "hexlace-ping";
    const status = document.createElement("span");
    status.className = "hexlace-ping-status";
    const detail = document.createElement("span");
    detail.className = "hexlace-ping-detail";
    if (isPingLocation(ping.type)) {
      card.classList.add("is-location");
      status.textContent = PING_LOCATIONS[ping.type];
      detail.textContent = ` - ${Math.max(0, ping.endKey - nowKey)} min left`;
    } else if (ping.type === "set") {
      card.classList.add("is-set");
      const stage = stageLabel(ping.stageId);
      const minutesUntil = ping.startKey - nowKey;
      if (minutesUntil > 30) status.textContent = `Meeting at ${stage} at ${ping.time}`;
      else if (minutesUntil > 0) status.textContent = `Heading to ${stage} for ${ping.time}`;
      else status.textContent = `Come meet me at ${stage}`;
      detail.textContent = ` - until ${formatPingTime(ping.endKey)}`;
    } else {
      return null;
    }
    card.append(status, detail);
    return card;
  }

  function renderCollected() {
    const entries = loadCollected();
    elements.count.textContent = entries.length
      ? `${entries.length} friend${entries.length === 1 ? "" : "s"}`
      : "No friends' sets collected yet";
    elements.empty.hidden = entries.length > 0;
    elements.list.innerHTML = "";
    entries.forEach(entry => {
      const group = document.createElement("details");
      group.className = "planner-day hexlace-friend";
      group.open = friendOpenState.has(entry.readId) ? friendOpenState.get(entry.readId) : false;

      const summary = document.createElement("summary");
      summary.className = "planner-day-summary hexlace-friend-summary";
      const copy = document.createElement("span");
      copy.className = "hexlace-friend-summary-copy";
      const heading = document.createElement("span");
      heading.className = "hexlace-friend-heading";
      const name = document.createElement("strong");
      name.className = "hexlace-friend-name";
      name.textContent = entry.name || "Loading...";
      const count = document.createElement("span");
      count.className = "hexlace-friend-count";
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      count.textContent = entry.pending ? "waiting for signal" : `${sets.length} set${sets.length === 1 ? "" : "s"}`;
      heading.append(name, document.createTextNode(" · "), count);
      copy.append(heading);
      const ping = buildFriendPing(entry.ping);
      if (ping) copy.append(ping);
      const view = document.createElement("span");
      view.className = "hexlace-friend-view";
      view.textContent = group.open ? "Hide" : "View";
      summary.append(copy, view);
      group.addEventListener("toggle", () => {
        friendOpenState.set(entry.readId, group.open);
        view.textContent = group.open ? "Hide" : "View";
      });
      group.append(summary);

      const list = document.createElement("ol");
      list.className = "planner-day-list";
      sets.forEach(item => {
        const row = document.createElement("li");
        row.className = "planner-set";
        const time = document.createElement("span");
        time.className = "planner-time";
        time.textContent = item.time || "";
        const details = document.createElement("span");
        details.className = "planner-details";
        const artist = document.createElement("span");
        artist.className = "planner-artist";
        artist.textContent = item.artist || "";
        const meta = document.createElement("span");
        meta.className = "planner-meta";
        meta.textContent = `${item.day || ""} - ${stageLabel(item.stageId)}`;
        details.append(artist, meta);
        row.append(time, details);
        list.append(row);
      });
      if (!sets.length && !entry.pending) {
        const note = document.createElement("li");
        note.className = "planner-set hexlace-empty-note";
        note.textContent = entry.missing ? "This Hexlace has expired or was removed." : "No sets saved yet.";
        list.append(note);
      }
      group.append(list);

      const foot = document.createElement("div");
      foot.className = "hexlace-friend-foot";
      const updated = document.createElement("span");
      updated.className = "hexlace-updated";
      updated.textContent = entry.updated ? `Updated ${timeAgo(entry.updated)}` : "Not loaded yet";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "planner-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${entry.name || "this Hexlace"} from your collection`);
      remove.addEventListener("click", () => {
        saveCollected(loadCollected().filter(other => other.readId !== entry.readId));
        friendOpenState.delete(entry.readId);
        renderCollected();
        feedback("Removed.");
      });
      foot.append(updated, remove);
      group.append(foot);

      elements.list.append(group);
    });
  }

  async function fetchEntry(readId) {
    const result = await api(`/lists/${readId}`, { cache: "no-store" });
    const entries = loadCollected();
    const entry = entries.find(item => item.readId === readId);
    if (!entry) return;
    if (result.ok && result.body) {
      entry.name = result.body.name;
      entry.sets = result.body.sets;
      entry.ping = result.body.ping || null;
      entry.updated = result.body.updated;
      entry.pending = false;
      entry.missing = false;
      entry.lastFetched = Date.now();
    } else if (result.status === 404) {
      entry.missing = true;
      entry.ping = null;
      entry.pending = false;
      entry.lastFetched = Date.now();
    }
    saveCollected(entries);
  }

  async function addCollected(readId, provisionalName) {
    const entries = loadCollected();
    if (!entries.some(entry => entry.readId === readId)) {
      entries.push({ readId, name: provisionalName || "", sets: [], ping: null, pending: true });
      saveCollected(entries);
    }
    renderCollected();
    // Preserve an offline scan for a later refresh instead of surfacing a
    // network failure as an unhandled rejection.
    try { await fetchEntry(readId); } catch {}
    renderCollected();
    return loadCollected().find(entry => entry.readId === readId);
  }

  async function refreshCollected(force) {
    const due = loadCollected().filter(entry =>
      force || entry.pending || !entry.lastFetched || Date.now() - entry.lastFetched > REFRESH_MIN_AGE_MS);
    if (!due.length) { renderCollected(); return; }
    await Promise.all(due.map(entry => fetchEntry(entry.readId).catch(() => {})));
    renderCollected();
  }

  // --- Incoming ?f= links --------------------------------------------------

  async function handleIncomingLink() {
    const params = new URLSearchParams(location.search);
    const readId = (params.get("f") || "").trim();
    if (!readId) return;
    const claimToken = (params.get("claim") || "").trim();
    params.delete("f");
    params.delete("claim");
    const query = params.toString();
    history.replaceState({}, "", `${location.pathname}${query ? "?" + query : ""}${location.hash}`);

    friendOpenState.clear();
    const identity = loadIdentity();
    if (identity && identity.readId === readId) {
      renderCollected();
      feedback("That's your own Hexlace.");
      return;
    }
    // A claim link only takes effect on a phone with no identity of its own -
    // your Hexlace can never be replaced by tapping someone else's tag.
    if (claimToken && !identity) {
      try {
        if (await claimHexlace(readId, claimToken)) {
          renderCollected();
          return;
        }
      } catch {}
    }
    friendOpenState.set(readId, true);
    const entry = await addCollected(readId, "");
    if (entry && !entry.pending && !entry.missing) feedback(`Collected ${entry.name}'s Hexlace.`);
    else if (entry && entry.missing) feedback("That Hexlace has expired or was removed.");
    else feedback("Hexlace saved - the list will load when you have signal.");
    elements.panel.scrollIntoView({ block: "nearest" });
  }

  // --- Link sharing helpers ------------------------------------------------

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      feedback(message);
      return;
    } catch {}
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-999px";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    feedback(message);
  }

  async function writeTag(url) {
    try {
      feedback("Hold a tag against the back of your phone...");
      await new NDEFReader().write({ records: [{ recordType: "url", data: url }] });
      feedback("Tag written!");
    } catch {
      feedback("Couldn't write the tag.");
    }
  }

  async function shareOrCopy(url, title) {
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (error) { if (error && error.name === "AbortError") return; }
    }
    copyText(url, "Link copied.");
  }

  // --- Wiring ---------------------------------------------------------------

  elements.enable.addEventListener("click", () => openEditor("enable", "What name should friends see?", ""));
  elements.rename.addEventListener("click", () => openEditor("rename", "Update the name friends see:", loadIdentity()?.name || ""));
  elements.nameSave.addEventListener("click", saveName);
  elements.nameCancel.addEventListener("click", () => {
    closeEditor();
  });
  elements.nameInput.addEventListener("keydown", event => { if (event.key === "Enter") saveName(); });
  elements.shareLink.addEventListener("click", () => {
    const identity = loadIdentity();
    if (identity) shareOrCopy(shareUrl(identity.readId), `${identity.name}'s Shambhala sets`);
  });
  elements.giveaway.addEventListener("click", createGiveaway);
  elements.giveawayShare.addEventListener("click", () => { if (giveawayLink) shareOrCopy(giveawayLink, "A Hexlace for you"); });
  if ("NDEFReader" in window) {
    elements.nfc.hidden = false;
    elements.giveawayNfc.hidden = false;
    elements.nfc.addEventListener("click", () => {
      const identity = loadIdentity();
      if (identity) writeTag(shareUrl(identity.readId));
    });
    elements.giveawayNfc.addEventListener("click", () => { if (giveawayLink) writeTag(giveawayLink); });
  }

  window.addEventListener("setlist-changed", markDirtyAndPublishSoon);
  window.addEventListener("ping-changed", () => markDirtyAndPublishSoon(0));
  window.prepareHexlaceHandoff = async () => {
    let identity = loadIdentity();
    if (!identity) return true;
    if (identity.pendingClaim) await flushPendingClaim({ fallbackToNew: Boolean(identity.claimScannedAt) });
    identity = loadIdentity();
    if (!identity) return true;
    const prepared = await prepareHandoff(identity, true);
    if (!prepared) feedback("Connect to the internet before installing so your Hexlace can transfer.");
    return prepared;
  };
  window.addEventListener("online", () => { syncMine(); refreshCollected(false); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    syncMine();
    refreshCollected(false);
    renderMine();
  });
  window.setInterval(() => {
    syncMine();
    refreshCollected(false);
    renderMine();
  }, REFRESH_INTERVAL_MS);
  window.setInterval(renderCollected, 30000);

  renderMine();
  renderCollected();
  handleIncomingLink();
  flushPendingClaim();
  if (isStandalone()) redeemHandoff();
  else prepareHandoff();
  window.setTimeout(() => refreshCollected(false), 2500);
})();
