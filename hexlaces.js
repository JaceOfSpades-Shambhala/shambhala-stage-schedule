// Hexlaces - live set-list sharing. Each person's NFC tag (or QR code) carries
// a permanent read-only link (?f=<readId>). Opening it collects that person's
// list into the "Hexlaces Collected" panel, refreshed whenever there's signal.
// A secret write key, held only in the owner's localStorage, is what publishes
// changes - so tapping someone's tag can only ever read, never overwrite.
// Giveaway tags add a one-time claim token (?claim=). The recipient's device
// adopts the tag immediately with a write key IT generates (so it works fully
// offline), then sends that key with the token the moment it gets signal; the
// first successful claim burns the token and locks ownership. Caveat surfaced
// to users: get signal once before letting anyone else tap a fresh tag.
(() => {
  const API_BASE = "https://shambhala-setlists.hexadecibel.workers.dev";
  const IDENTITY_KEY = "shambhala-2026-hexlace-identity";
  const COLLECTED_KEY = "shambhala-2026-hexlaces-collected";
  const SETS_KEY = "shambhala-2026-my-set-list";
  const STAGES = [
    { id: "amp", label: "AMP" },
    { id: "fractal-forest", label: "Fractal Forest" },
    { id: "grove", label: "Grove" },
    { id: "living-room", label: "Living Room" },
    { id: "pagoda", label: "Pagoda" },
    { id: "secret-garden", label: "Secret Garden" },
    { id: "village", label: "Village" }
  ];
  const PUBLISH_DEBOUNCE_MS = 4000;
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const REFRESH_MIN_AGE_MS = 60 * 1000;

  const elements = {
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
  if (!elements.panel) return;

  const friendOpenState = new Map();
  let editorMode = "";
  let publishTimer = 0;
  let giveawayLink = "";
  let renderedQrUrl = "";
  let claiming = false;

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

  function shareUrl(readId) {
    return `${location.origin}${location.pathname.replace(/index\.html$/, "")}?f=${readId}`;
  }

  function feedback(message) {
    if (!elements.feedback) return;
    elements.feedback.textContent = message;
    window.clearTimeout(feedback.timeout);
    feedback.timeout = window.setTimeout(() => { elements.feedback.textContent = ""; }, 3200);
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

  // --- My Hexlace: publishing ---------------------------------------------

  function renderMine() {
    const identity = loadIdentity();
    elements.setup.hidden = Boolean(identity) || editorMode === "enable" || editorMode === "claim";
    elements.mine.hidden = !identity || editorMode === "claim";
    elements.editor.hidden = !editorMode;
    if (!identity) return;
    elements.myName.textContent = identity.name || "(no name yet)";
    if (identity.pendingClaim) elements.status.textContent = "Get signal once to finish claiming this Hexlace - then it's safely yours.";
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

  function markDirtyAndPublishSoon() {
    const identity = loadIdentity();
    if (!identity) return;
    identity.dirty = true;
    saveIdentity(identity);
    renderMine();
    window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(publish, PUBLISH_DEBOUNCE_MS);
  }

  async function publish() {
    const identity = loadIdentity();
    if (!identity || !identity.name) return;
    // A freshly claimed tag has no server-side write key until the claim lands,
    // so finish that first; the claim publishes the current list on success.
    if (identity.pendingClaim) { flushPendingClaim(); return; }
    try {
      const result = await api(`/lists/${identity.readId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Write-Key": identity.writeKey },
        body: JSON.stringify({ name: identity.name, sets: mySets() })
      });
      if (result.ok) {
        identity.dirty = false;
        identity.invalid = false;
        identity.lastPublished = Date.now();
      } else if (result.status === 403 || result.status === 404) {
        identity.invalid = true;
      }
      saveIdentity(identity);
    } catch {
      identity.dirty = true;
      saveIdentity(identity);
    }
    renderMine();
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
        let result;
        try {
          result = await api("/lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, sets: mySets() })
          });
        } catch {
          feedback("Couldn't start sharing - you need signal for this first step.");
          return;
        }
        if (!result.ok || !result.body?.readId) { feedback("Couldn't start sharing - check your signal."); return; }
        saveIdentity({ readId: result.body.readId, writeKey: result.body.writeKey, name, lastPublished: Date.now() });
        feedback("Sharing is live!");
      } else {
        const identity = loadIdentity();
        if (!identity) return;
        identity.name = name;
        saveIdentity(identity);
        feedback(editorMode === "claim" ? "This Hexlace is yours!" : "Name updated.");
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
    saveIdentity({ readId, writeKey: randomKey(24), name: "", pendingClaim: claimToken, dirty: true });
    openEditor("claim", "This Hexlace is now yours! What name should friends see?", "");
    flushPendingClaim();
    return true;
  }

  async function flushPendingClaim() {
    const identity = loadIdentity();
    if (!identity || !identity.pendingClaim || claiming) return;
    claiming = true;
    try {
      const result = await api(`/lists/${identity.readId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken: identity.pendingClaim, writeKey: identity.writeKey })
      });
      if (result.ok) {
        const claimed = loadIdentity();
        if (claimed && claimed.readId === identity.readId) {
          delete claimed.pendingClaim;
          saveIdentity(claimed);
          publish();
        }
      } else if (result.status === 409 || result.status === 403) {
        // Someone else claimed this tag first. Keep the user's sets, drop the
        // dead identity, and collect the winner's list instead.
        const lostId = identity.readId;
        try { localStorage.removeItem(IDENTITY_KEY); } catch {}
        editorMode = "";
        feedback("This Hexlace was claimed by someone else first. Your sets are safe - tap 'Start sharing' to make a new one.");
        addCollected(lostId, "");
        renderMine();
      }
    } catch {
      // Offline: leave the pending claim in place and try again later.
    } finally {
      claiming = false;
    }
  }

  function syncMine() {
    const identity = loadIdentity();
    if (!identity) return;
    if (identity.pendingClaim) flushPendingClaim();
    else if (identity.dirty) publish();
  }

  // --- Collecting friends --------------------------------------------------

  function renderCollected() {
    const entries = loadCollected();
    elements.count.textContent = entries.length
      ? `${entries.length} Hexlace${entries.length === 1 ? "" : "s"} collected`
      : "No Hexlaces collected yet";
    elements.empty.hidden = entries.length > 0;
    elements.list.innerHTML = "";
    entries.forEach(entry => {
      const group = document.createElement("details");
      group.className = "planner-day hexlace-friend";
      group.open = friendOpenState.has(entry.readId) ? friendOpenState.get(entry.readId) : true;
      group.addEventListener("toggle", () => friendOpenState.set(entry.readId, group.open));

      const summary = document.createElement("summary");
      summary.className = "planner-day-summary";
      const name = document.createElement("span");
      name.className = "planner-day-name";
      name.textContent = entry.name || "Loading...";
      const count = document.createElement("span");
      count.className = "planner-day-count";
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      count.textContent = entry.pending ? "waiting for signal" : `${sets.length} set${sets.length === 1 ? "" : "s"}`;
      summary.append(name, count);
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
      entry.updated = result.body.updated;
      entry.pending = false;
      entry.missing = false;
      entry.lastFetched = Date.now();
    } else if (result.status === 404) {
      entry.missing = true;
      entry.pending = false;
      entry.lastFetched = Date.now();
    }
    saveCollected(entries);
  }

  async function addCollected(readId, provisionalName) {
    const entries = loadCollected();
    if (!entries.some(entry => entry.readId === readId)) {
      entries.push({ readId, name: provisionalName || "", sets: [], pending: true });
      saveCollected(entries);
    }
    renderCollected();
    await fetchEntry(readId);
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

    const identity = loadIdentity();
    if (identity && identity.readId === readId) {
      feedback("That's your own Hexlace.");
      return;
    }
    // A claim link only takes effect on a phone with no identity of its own -
    // your Hexlace can never be replaced by tapping someone else's tag.
    if (claimToken && !identity) {
      try {
        if (await claimHexlace(readId, claimToken)) return;
      } catch {}
    }
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
    if (editorMode === "claim") feedback("You can set your name any time by tapping it.");
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

  renderMine();
  renderCollected();
  handleIncomingLink();
  flushPendingClaim();
  window.setTimeout(() => refreshCollected(false), 2500);
})();
