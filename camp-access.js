// Accountless camp access. A device generates its own opaque bearer key; the
// Worker stores only its hash and assigns a member/admin role when a privileged
// Hexlace claim is accepted. Admin UI stays hidden until the Worker confirms
// the saved key is still active.
(() => {
  const API_BASE = "https://shambhala-setlists.hexadecibel.workers.dev";
  const PUBLIC_APP_URL = "https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/";
  const STORAGE_KEY = "shambhala-2026-camp-access";
  const KEY_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const API_TIMEOUT_MS = 12000;
  const TRAIT_LABELS = Object.freeze({
    rarity: "Rarity",
    palette: "Owl colour",
    ringMode: "Portal colours",
    ringStyle: "Ring finish",
    direction: "Ring twist",
    brow: "Brow treatment",
    eyes: "Eye style",
    beak: "Beak",
    marking: "Facial markings",
    accessory: "Accessory",
    aura: "Aura"
  });
  const adminDefinitions = new Map();
  let definitions = [];
  let savedTraits = {};
  let traitsLoaded = false;
  let verifiedThisPage = false;
  let editorSignature = "";

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
    traitSection: document.querySelector("#hex-owl-camp-editor-section"),
    traitControls: document.querySelector("#hex-owl-camp-trait-controls"),
    traitOriginal: document.querySelector("#hex-owl-camp-original"),
    traitPreview: document.querySelector("#hex-owl-camp-preview"),
    traitPreviewStatus: document.querySelector("#hex-owl-camp-preview-status"),
    traitReset: document.querySelector("#hex-owl-camp-trait-reset"),
    traitSave: document.querySelector("#hex-owl-camp-trait-save"),
    traitFeedback: document.querySelector("#hex-owl-camp-trait-feedback")
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
    window.setTimeout(loadTraits, 0);
    return next;
  }

  function clear() {
    save(null);
    savedTraits = {};
    traitsLoaded = false;
    verifiedThisPage = false;
    editorSignature = "";
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
    const url = new URL(window.location?.protocol === "file:" ? PUBLIC_APP_URL : window.location.href);
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

  function hasVerifiedCampAccess() {
    const access = load();
    return verifiedThisPage && access?.active === true && ["member", "admin"].includes(access.role);
  }

  function currentProfile() {
    return window.Hexadex?.loadProfile?.() || null;
  }

  function optionList(items) {
    return (Array.isArray(items) ? items : [])
      .filter(item => item && item.enabled !== false && (item.id != null || item.value != null))
      .map(item => ({
        value: String(item.id ?? item.value),
        label: String(item.name ?? item.label ?? item.id ?? item.value)
      }))
      .filter(option => option.value && option.label);
  }

  function registeredOptionList(items) {
    return (Array.isArray(items) ? items : [])
      .map(item => typeof item === "object" && item
        ? { value: String(item.value ?? item.id ?? ""), label: String(item.label ?? item.name ?? item.value ?? item.id ?? "") }
        : { value: String(item ?? ""), label: String(item ?? "") })
      .filter(option => option.value && option.label);
  }

  function registerOwlTraits(items) {
    for (const source of Array.isArray(items) ? items : [items]) {
      const options = registeredOptionList(source?.options);
      if (!source || !/^[a-z][a-z0-9_-]{0,39}$/i.test(source.key || "")
        || typeof source.label !== "string" || !source.label.trim() || options.length < 1) continue;
      adminDefinitions.set(source.key, {
        key: source.key,
        label: source.label.trim(),
        options,
        originalValue: "",
        originalLabel: String(source.defaultLabel || "Renderer default"),
        adminOnly: true
      });
    }
    editorSignature = "";
    if (hasVerifiedCampAccess() && load()?.role === "admin") renderTraitControls(true);
  }

  function traitDefinitions(profile = currentProfile()) {
    const owl = profile?.owl;
    if (!owl?.seed || !Number.isSafeInteger(owl.version) || !window.HexOwl?.catalogue || !window.HexOwl?.selectTraits) return [];
    try {
      const catalogue = window.HexOwl.catalogue(owl.version);
      const original = window.HexOwl.selectTraits(owl.seed, owl.version);
      const next = [];
      const rarityOptions = optionList(catalogue?.rarities);
      if (rarityOptions.length > 1) {
        next.push({
          key: "rarity",
          label: TRAIT_LABELS.rarity,
          options: rarityOptions,
          originalValue: original.rarity?.id || "",
          originalLabel: original.rarity?.name || original.rarity?.id || "Original"
        });
      }
      for (const [key, items] of Object.entries(catalogue?.categories || {})) {
        const options = optionList(items);
        if (options.length <= 1) continue;
        const originalValue = original.selectionIds?.[key] || "";
        const originalOption = options.find(option => option.value === originalValue);
        next.push({
          key,
          label: TRAIT_LABELS[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2"),
          options,
          originalValue,
          originalLabel: originalOption?.label || originalValue || "Original"
        });
      }
      if (load()?.role === "admin") {
        const existingKeys = new Set(next.map(definition => definition.key));
        for (const definition of adminDefinitions.values()) {
          if (!existingKeys.has(definition.key)) next.push({ ...definition });
        }
      }
      return next;
    } catch {
      return [];
    }
  }

  function inputFor(definition, activeTraits) {
    const input = document.createElement("select");
    const original = document.createElement("option");
    original.value = "";
    original.textContent = `Original - ${definition.originalLabel}`;
    input.append(original);
    for (const option of definition.options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      input.append(element);
    }
    input.dataset.traitKey = definition.key;
    const saved = activeTraits?.[definition.key];
    input.value = definition.options.some(option => option.value === saved) ? saved : "";
    input.addEventListener("change", renderTraitPreview);
    return input;
  }

  function renderTraitControls(force = false) {
    if (!elements.traitControls) return;
    const profile = currentProfile();
    const activeTraits = traitsLoaded ? savedTraits : (profile?.owl?.adminTraits || savedTraits);
    const signature = JSON.stringify([
      profile?.profileId || "",
      profile?.owl?.seed || "",
      profile?.owl?.version || 0,
      activeTraits
    ]);
    if (!force && signature === editorSignature && elements.traitControls.childElementCount > 0) return;
    editorSignature = signature;
    definitions = traitDefinitions(profile);
    elements.traitControls.replaceChildren();
    if (!definitions.length) {
      const empty = document.createElement("p");
      empty.className = "hex-owl-camp-preview-status";
      empty.textContent = "This Owl does not have editable traits yet.";
      elements.traitControls.append(empty);
    }
    for (const definition of definitions) {
      const label = document.createElement("label");
      label.className = "hex-owl-camp-trait";
      const text = document.createElement("span");
      text.textContent = definition.label;
      label.append(text, inputFor(definition, activeTraits));
      elements.traitControls.append(label);
    }
    if (elements.traitSave) elements.traitSave.disabled = definitions.length === 0;
    renderTraitPreview();
  }

  function traitsFromControls() {
    const traits = {};
    for (const definition of definitions) {
      const input = elements.traitControls?.querySelector(`[data-trait-key="${definition.key}"]`);
      if (input?.value) traits[definition.key] = input.value;
    }
    return traits;
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function namespaceSvg(svg, suffix) {
    const ids = [...String(svg).matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    let result = String(svg);
    for (const id of ids) {
      const escaped = escapeRegex(id);
      const next = `${id}-${suffix}`;
      result = result
        .replace(new RegExp(`id="${escaped}"`, "g"), `id="${next}"`)
        .replace(new RegExp(`url\\(#${escaped}\\)`, "g"), `url(#${next})`)
        .replace(new RegExp(`(href|xlink:href)="#${escaped}"`, "g"), `$1="#${next}"`);
    }
    return result;
  }

  function mountPreview(container, svg, suffix) {
    if (!container) return;
    container.innerHTML = namespaceSvg(svg, suffix);
    window.HexOwl?.hydrate?.(container);
  }

  function renderTraitPreview() {
    const profile = currentProfile();
    const owl = profile?.owl;
    if (!owl?.seed || !window.HexOwl?.renderSvg || !window.HexOwl?.renderWithTraits) return;
    try {
      const draft = traitsFromControls();
      const originalSvg = window.HexOwl.renderSvg(owl.seed, owl.version);
      const previewSvg = window.HexOwl.renderWithTraits(owl.seed, { overrides: draft, freestyle: true }, owl.version);
      mountPreview(elements.traitOriginal, originalSvg, "camp-original");
      mountPreview(elements.traitPreview, previewSvg, "camp-preview");
      const count = Object.keys(draft).length;
      const repairs = window.HexOwl.resolveTraits?.(owl.seed, { overrides: draft, freestyle: true }, owl.version)?.repairs || [];
      if (elements.traitPreviewStatus) {
        elements.traitPreviewStatus.textContent = count === 0
          ? "Showing the original Owl on both sides."
          : `${count} freestyle ${count === 1 ? "choice" : "choices"} applied with no rarity, weight, or combination limits.${repairs.length ? ` ${repairs.length} unknown or disabled ${repairs.length === 1 ? "choice was" : "choices were"} ignored.` : ""}`;
      }
    } catch {
      if (elements.traitPreviewStatus) elements.traitPreviewStatus.textContent = "This preview could not be drawn.";
    }
  }

  function resetTraits() {
    for (const input of elements.traitControls?.querySelectorAll?.("[data-trait-key]") || []) input.value = "";
    renderTraitPreview();
    if (elements.traitFeedback) elements.traitFeedback.textContent = "Original traits selected. Save to keep this version.";
  }

  function applyTraitsToOwnOwl() {
    const profile = currentProfile();
    if (!profile?.owl || !window.Hexadex?.setOwl) return;
    const owl = { ...profile.owl };
    if (Object.keys(savedTraits).length) owl.adminTraits = { ...savedTraits };
    else delete owl.adminTraits;
    window.Hexadex.setOwl(owl);
  }

  async function loadTraits() {
    if (!hasVerifiedCampAccess()) return false;
    const profile = currentProfile();
    if (!profile?.profileId || !profile?.profileKey || !profile?.owl || navigator.onLine === false) return false;
    try {
      const result = await api(`/profiles/${profile.profileId}/owl-admin-traits`, {
        cache: "no-store",
        headers: { "X-Profile-Key": profile.profileKey }
      });
      if (!result.ok) return false;
      savedTraits = result.body?.traits && typeof result.body.traits === "object" ? result.body.traits : {};
      traitsLoaded = true;
      applyTraitsToOwnOwl();
      renderTraitControls(true);
      return true;
    } catch {
      return false;
    }
  }

  async function saveTraits() {
    const profile = currentProfile();
    if (!hasVerifiedCampAccess() || !profile?.profileId || !profile?.profileKey || !profile?.owl) return false;
    if (elements.traitSave) elements.traitSave.disabled = true;
    if (elements.traitFeedback) elements.traitFeedback.textContent = "Saving Owl choices...";
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
      editorSignature = "";
      renderTraitControls(true);
      if (elements.traitFeedback) elements.traitFeedback.textContent = "Camp Owl choices saved.";
      window.dispatchEvent(new CustomEvent("hex-owl-admin-traits-changed", { detail: { traits: { ...savedTraits } } }));
      return true;
    } catch {
      if (elements.traitFeedback) elements.traitFeedback.textContent = "Couldn't save Owl choices. Check your signal and try again.";
      return false;
    } finally {
      if (elements.traitSave) elements.traitSave.disabled = definitions.length === 0;
    }
  }

  function render() {
    const access = load();
    const isAdmin = verifiedThisPage && access?.active === true && access.role === "admin";
    if (elements.adminPanel) {
      elements.adminPanel.hidden = !isAdmin;
      if (!isAdmin) elements.adminPanel.open = false;
    }
    const profile = currentProfile();
    const canCustomize = hasVerifiedCampAccess() && Boolean(profile?.owl?.seed);
    if (elements.traitSection) {
      elements.traitSection.hidden = !canCustomize;
      if (!canCustomize) elements.traitSection.open = false;
    }
    if (canCustomize) renderTraitControls();
  }

  elements.pairCreate?.addEventListener("click", createPairing);
  elements.traitSave?.addEventListener("click", saveTraits);
  elements.traitReset?.addEventListener("click", resetTraits);
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
    owlCustomizationDefinitions: () => traitDefinitions(),
    owlTraits: () => ({ ...savedTraits }),
    traitsLoaded: () => traitsLoaded
  });
  window.setTimeout(refresh, 0);
  window.setTimeout(redeemPairingFromUrl, 0);
})();
