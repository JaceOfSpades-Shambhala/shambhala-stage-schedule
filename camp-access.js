// Accountless camp access. A device generates its own opaque bearer key; the
// Worker stores only its hash and assigns a member/admin role when a privileged
// Hexlace claim is accepted. Admin UI stays hidden until the Worker confirms
// the saved key is still active.
(() => {
  const API_BASE = "https://shambhala-setlists.hexadecibel.workers.dev";
  const STORAGE_KEY = "shambhala-2026-camp-access";
  const KEY_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const API_TIMEOUT_MS = 12000;
  const definitions = new Map();
  let savedTraits = {};
  let traitsLoaded = false;
  let verifiedThisPage = false;

  const elements = {
    adminPanel: document.querySelector("#hexlace-admin-section"),
    role: document.querySelector("#hexlace-giveaway-role"),
    redemptionStatus: document.querySelector("#camp-access-redemption-status"),
    redemptionText: document.querySelector("#camp-access-redemption-text"),
    pairRole: document.querySelector("#camp-device-pair-role"),
    pairCreate: document.querySelector("#camp-device-pair-create"),
    pairResult: document.querySelector("#camp-device-pair-result"),
    pairQr: document.querySelector("#camp-device-pair-qr"),
    pairResultRole: document.querySelector("#camp-device-pair-result-role"),
    pairFeedback: document.querySelector("#camp-device-pair-feedback"),
    traitControls: document.querySelector("#hex-owl-admin-trait-controls"),
    traitEmpty: document.querySelector("#hex-owl-admin-trait-empty"),
    traitSave: document.querySelector("#hex-owl-admin-trait-save"),
    traitFeedback: document.querySelector("#hex-owl-admin-trait-feedback")
  };
  let currentPairing = null;

  function randomKey(length = 32) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    let value = "";
    for (const byte of bytes) value += KEY_ALPHABET[byte % KEY_ALPHABET.length];
    return value;
  }

  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return value && typeof value.accessKey === "string" && value.accessKey.length >= 24 ? value : null;
    } catch {
      return null;
    }
  }

  function save(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function ensureAccessKey() {
    const current = load();
    if (current?.accessKey) return current.accessKey;
    const accessKey = randomKey();
    save({ accessKey, active: false, role: null, readId: "" });
    return accessKey;
  }

  function authorizationHeaders() {
    const access = load();
    return access?.active === true ? { Authorization: `Bearer ${access.accessKey}` } : {};
  }

  function claimCredentials(grantToken) {
    if (typeof grantToken !== "string" || grantToken.length < 24) return {};
    return { campGrantToken: grantToken, campAccessKey: ensureAccessKey() };
  }

  function handoffCredentials() {
    return { campAccessKey: ensureAccessKey() };
  }

  function applyResponse(data, readId = "") {
    if (!data || typeof data !== "object" || !Object.prototype.hasOwnProperty.call(data, "campAccess")) return load();
    const access = load();
    if (data.campAccess?.active !== true || !["member", "admin"].includes(data.campAccess.role) || !access?.accessKey) {
      save(null);
      savedTraits = {};
      traitsLoaded = false;
      verifiedThisPage = false;
      render();
      window.dispatchEvent(new CustomEvent("camp-access-changed", { detail: { active: false } }));
      return null;
    }
    const next = {
      accessKey: access.accessKey,
      active: true,
      role: data.campAccess.role,
      readId: data.campAccess.readId || readId || access.readId || ""
    };
    save(next);
    verifiedThisPage = true;
    render();
    window.dispatchEvent(new CustomEvent("camp-access-changed", { detail: { active: true, role: next.role } }));
    if (next.role === "admin") window.setTimeout(loadTraits, 0);
    return next;
  }

  function clear() {
    save(null);
    savedTraits = {};
    traitsLoaded = false;
    verifiedThisPage = false;
    render();
  }

  async function api(path, options = {}) {
    const response = await window.fetchHexlaceApi(`${API_BASE}${path}`, options, API_TIMEOUT_MS);
    let body = null;
    try { body = await response.json(); } catch {}
    return { ok: response.ok, status: response.status, body };
  }

  async function refresh() {
    const access = load();
    if (!access?.active || navigator.onLine === false) {
      render();
      return false;
    }
    try {
      const result = await api("/camp/access", { cache: "no-store" });
      if (!result.ok) {
        if (result.status === 401 || result.status === 403) clear();
        return false;
      }
      applyResponse({ campAccess: result.body }, result.body?.readId || access.readId);
      return true;
    } catch {
      render();
      return false;
    }
  }

  async function bootstrap(bootstrapKey) {
    let identity = null;
    try { identity = JSON.parse(localStorage.getItem("shambhala-2026-hexlace-identity") || "null"); } catch {}
    const profile = window.Hexadex?.loadProfile?.();
    if (!identity?.readId || !identity?.writeKey || !profile?.profileId || typeof bootstrapKey !== "string" || !bootstrapKey) {
      return { ok: false, error: "Set up My Hexlace and its Hex Owl before bootstrapping camp access." };
    }
    const accessKey = ensureAccessKey();
    try {
      const result = await api("/camp/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Camp-Bootstrap-Key": bootstrapKey },
        body: JSON.stringify({
          readId: identity.readId,
          writeKey: identity.writeKey,
          profileId: profile.profileId,
          accessKey
        })
      });
      if (result.ok) applyResponse(result.body, identity.readId);
      return result.ok ? { ok: true, role: "admin" } : { ok: false, error: result.body?.error || "Bootstrap failed." };
    } catch {
      return { ok: false, error: "Bootstrap needs an internet connection." };
    }
  }

  function cleanPairingToken(value) {
    if (typeof value !== "string") return "";
    const compact = [...value.trim()].filter(character => KEY_ALPHABET.includes(character)).join("");
    return compact.length === 24 ? compact : "";
  }

  function pairingUrl(token) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("camp-pair", token);
    url.hash = "my-hexlace";
    return url.toString();
  }

  function renderPairingQr(url) {
    if (typeof qrcode !== "function" || !elements.pairQr) return;
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    elements.pairQr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const image = elements.pairQr.querySelector("svg");
    image?.setAttribute("role", "img");
    image?.setAttribute("aria-label", `One-use QR code granting ${currentPairing?.role === "admin" ? "camp admin" : "camp member"} access`);
  }

  async function createPairing() {
    if (load()?.role !== "admin" || !verifiedThisPage) return false;
    const role = elements.pairRole?.value === "admin" ? "admin" : "member";
    elements.pairCreate.disabled = true;
    if (elements.pairFeedback) elements.pairFeedback.textContent = "";
    if (elements.pairResult) elements.pairResult.hidden = true;
    try {
      const result = await api("/camp/pairings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      if (!result.ok || !cleanPairingToken(result.body?.token) || result.body?.role !== role) throw new Error("pairing failed");
      currentPairing = {
        token: result.body.token,
        role,
        url: pairingUrl(result.body.token)
      };
      if (elements.pairResultRole) elements.pairResultRole.textContent = currentPairing.role === "admin" ? "Grants camp admin access" : "Grants camp member access";
      if (elements.pairResult) elements.pairResult.hidden = false;
      renderPairingQr(currentPairing.url);
      return true;
    } catch {
      currentPairing = null;
      if (elements.pairFeedback) elements.pairFeedback.textContent = "Couldn't create an access QR. Check your signal and try again.";
      return false;
    } finally {
      elements.pairCreate.disabled = false;
    }
  }

  function clearPairingFromUrl() {
    if (!window.location || !window.history?.replaceState) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("camp-pair")) return;
    url.searchParams.delete("camp-pair");
    window.history.replaceState(null, "", url.toString());
  }

  async function redeemPairing(value) {
    const pairingToken = cleanPairingToken(value);
    if (!pairingToken) {
      clearPairingFromUrl();
      showRedemptionStatus("That camp access QR is incomplete or invalid.");
      return false;
    }
    showRedemptionStatus("Adding camp access without changing anything already saved on this phone...");
    try {
      const accessKey = ensureAccessKey();
      const result = await api("/camp/pairings/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pairingToken, accessKey })
      });
      const role = result.body?.campAccess?.role;
      if (!result.ok || !["member", "admin"].includes(role)) {
        if (result.status === 410) clearPairingFromUrl();
        showRedemptionStatus(result.body?.error || "That camp access QR is invalid or expired.");
        return false;
      }
      applyResponse(result.body);
      clearPairingFromUrl();
      showRedemptionStatus(`${role === "admin" ? "Camp admin" : "Camp member"} access added. Your existing profile and saved data were not changed.`);
      return true;
    } catch {
      showRedemptionStatus("Couldn't add access yet. Check your signal and scan the QR again.");
      return false;
    }
  }

  function showRedemptionStatus(message) {
    if (elements.redemptionText) elements.redemptionText.textContent = message;
    if (elements.redemptionStatus) elements.redemptionStatus.hidden = false;
  }

  async function redeemPairingFromUrl() {
    if (!window.location) return false;
    const token = new URL(window.location.href).searchParams.get("camp-pair") || "";
    if (!token) return false;
    return redeemPairing(token);
  }

  function validDefinition(source) {
    return source && /^[a-z][a-z0-9_-]{0,39}$/i.test(source.key || "")
      && typeof source.label === "string" && source.label.trim()
      && ["select", "range", "color", "toggle", "text"].includes(source.type);
  }

  function registerOwlTraits(items) {
    for (const source of Array.isArray(items) ? items : [items]) {
      if (!validDefinition(source)) continue;
      definitions.set(source.key, { ...source, label: source.label.trim() });
    }
    renderTraitControls();
  }

  function inputFor(definition) {
    let input;
    if (definition.type === "select") {
      input = document.createElement("select");
      for (const option of definition.options || []) {
        const value = typeof option === "object" ? option.value : option;
        const label = typeof option === "object" ? option.label : option;
        const element = document.createElement("option");
        element.value = String(value);
        element.textContent = String(label);
        input.append(element);
      }
    } else {
      input = document.createElement("input");
      input.type = definition.type === "toggle" ? "checkbox" : definition.type;
      if (definition.min != null) input.min = String(definition.min);
      if (definition.max != null) input.max = String(definition.max);
      if (definition.step != null) input.step = String(definition.step);
    }
    input.dataset.traitKey = definition.key;
    const value = savedTraits[definition.key] ?? definition.defaultValue;
    if (definition.type === "toggle") input.checked = value === true;
    else if (value != null) input.value = String(value);
    return input;
  }

  function renderTraitControls() {
    if (!elements.traitControls) return;
    elements.traitControls.replaceChildren();
    elements.traitEmpty.hidden = definitions.size > 0;
    elements.traitSave.hidden = definitions.size === 0;
    for (const definition of definitions.values()) {
      const label = document.createElement("label");
      label.className = "hex-owl-admin-trait";
      const text = document.createElement("span");
      text.textContent = definition.label;
      label.append(text, inputFor(definition));
      elements.traitControls.append(label);
    }
  }

  function applyTraitsToOwnOwl() {
    const profile = window.Hexadex?.loadProfile?.();
    if (!profile?.owl || !window.Hexadex?.setOwl) return;
    window.Hexadex.setOwl({ ...profile.owl, adminTraits: { ...savedTraits } });
  }

  async function loadTraits() {
    if (load()?.role !== "admin") return false;
    const profile = window.Hexadex?.loadProfile?.();
    if (!profile?.profileId || !profile?.profileKey || navigator.onLine === false) return false;
    try {
      const result = await api(`/profiles/${profile.profileId}/owl-admin-traits`, {
        cache: "no-store",
        headers: { "X-Profile-Key": profile.profileKey }
      });
      if (!result.ok) return false;
      savedTraits = result.body?.traits && typeof result.body.traits === "object" ? result.body.traits : {};
      traitsLoaded = true;
      applyTraitsToOwnOwl();
      renderTraitControls();
      return true;
    } catch {
      return false;
    }
  }

  function traitsFromControls() {
    const traits = { ...savedTraits };
    for (const definition of definitions.values()) {
      const input = elements.traitControls?.querySelector(`[data-trait-key="${definition.key}"]`);
      if (!input) continue;
      if (definition.type === "toggle") traits[definition.key] = input.checked;
      else if (definition.type === "range") traits[definition.key] = Number(input.value);
      else traits[definition.key] = input.value;
    }
    return traits;
  }

  async function saveTraits() {
    const profile = window.Hexadex?.loadProfile?.();
    if (load()?.role !== "admin" || !profile?.profileId || !profile?.profileKey) return false;
    elements.traitSave.disabled = true;
    try {
      const result = await api(`/profiles/${profile.profileId}/owl-admin-traits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Profile-Key": profile.profileKey },
        body: JSON.stringify({ traits: traitsFromControls() })
      });
      if (!result.ok) throw new Error("save failed");
      savedTraits = result.body?.traits || {};
      traitsLoaded = true;
      applyTraitsToOwnOwl();
      elements.traitFeedback.textContent = "Admin Owl choices saved.";
      window.dispatchEvent(new CustomEvent("hex-owl-admin-traits-changed", { detail: { traits: { ...savedTraits } } }));
      return true;
    } catch {
      elements.traitFeedback.textContent = "Couldn't save Owl choices. Check your signal and try again.";
      return false;
    } finally {
      elements.traitSave.disabled = false;
    }
  }

  function render() {
    const access = load();
    const isAdmin = verifiedThisPage && access?.active === true && access.role === "admin";
    if (elements.adminPanel) {
      elements.adminPanel.hidden = !isAdmin;
      if (!isAdmin) elements.adminPanel.open = false;
    }
    if (isAdmin) renderTraitControls();
  }

  elements.pairCreate?.addEventListener("click", createPairing);
  elements.traitSave?.addEventListener("click", saveTraits);
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  render();
  window.CampAccess = Object.freeze({
    load,
    clear,
    bootstrap,
    createPairing,
    redeemPairing,
    refresh,
    authorizationHeaders,
    claimCredentials,
    handoffCredentials,
    applyResponse,
    registerOwlTraits,
    owlTraits: () => ({ ...savedTraits }),
    traitsLoaded: () => traitsLoaded
  });
  window.setTimeout(refresh, 0);
  window.setTimeout(redeemPairingFromUrl, 0);
})();
