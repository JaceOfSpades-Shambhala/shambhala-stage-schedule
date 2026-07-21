import assert from "node:assert/strict";
import test from "node:test";
import { installHexlacesGlobals, loadCampAccess } from "./helpers/hexlaces-harness.mjs";

const STORAGE_KEY = "shambhala-2026-camp-access";

test("a revoked camp access shows the update banner instead of a misleading error, and clears local admin state", async () => {
  const { localStorage } = installHexlacesGlobals();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    accessKey: "revoked-access-key-1234567890",
    active: true,
    role: "admin",
    readId: "abcd1234"
  }));

  let bannerShown = false;
  window.showUpdateBanner = () => { bannerShown = true; };
  globalThis.fetch = async url => {
    if (String(url).includes("/camp/access")) return { ok: false, status: 401, json: async () => ({ error: "Camp access is invalid or revoked." }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };

  await loadCampAccess();
  const refreshed = await window.CampAccess.refresh();

  assert.equal(refreshed, false);
  assert.equal(bannerShown, true, "a revoked session should prompt the same update banner as any other stale-app-state refresh");
  assert.equal(localStorage.getItem(STORAGE_KEY), null, "local camp-access state must be cleared so the admin UI disappears without waiting for the reload");
});
