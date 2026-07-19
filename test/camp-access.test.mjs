import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

async function loadCampAccess(fetchHexlaceApi = () => { throw new Error("not used"); }, windowGlobals = {}) {
  const source = await readFile(new URL("../camp-access.js", import.meta.url), "utf8");
  const adminPanel = { hidden: true, open: false };
  const traitSection = { hidden: true, open: false };
  const localStorage = storage();
  const context = {
    crypto: webcrypto,
    localStorage,
    navigator: { onLine: true },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: {
      hidden: false,
      querySelector(selector) {
        if (selector === "#hexlace-admin-section") return adminPanel;
        if (selector === "#hex-owl-camp-editor-section") return traitSection;
        return null;
      },
      addEventListener() {}
    },
    window: {
      addEventListener() {},
      dispatchEvent() {},
      setTimeout() {},
      fetchHexlaceApi,
      ...windowGlobals
    }
  };
  vm.runInNewContext(source, context);
  return { access: context.window.CampAccess, adminPanel, traitSection, localStorage };
}

test("camp admin controls stay hidden until a claimed device key is confirmed", async () => {
  const { access, adminPanel } = await loadCampAccess();
  const claim = access.claimCredentials("grant-token-that-is-long-enough-123");
  assert.ok(claim.campAccessKey.length >= 24);
  assert.deepEqual({ ...access.authorizationHeaders() }, {});
  assert.equal(adminPanel.hidden, true);

  access.applyResponse({ campAccess: { active: true, role: "member", readId: "abcdEFGH" } });
  assert.equal(adminPanel.hidden, true);
  assert.match(access.authorizationHeaders().Authorization, /^Bearer /);

  access.applyResponse({ campAccess: { active: true, role: "admin", readId: "abcdEFGH" } });
  assert.equal(adminPanel.hidden, false);

  access.applyResponse({ campAccess: { active: false, role: null, readId: "abcdEFGH" } });
  assert.equal(adminPanel.hidden, true);
  assert.deepEqual({ ...access.authorizationHeaders() }, {});
});

test("regular page has no visible camp-access controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const campAccess = await readFile(new URL("../camp-access.js", import.meta.url), "utf8");
  const hexadex = await readFile(new URL("../hexadex.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /Camp access on this device/);
  assert.doesNotMatch(html, /camp-device-access-(?:section|code|redeem)/);
  assert.match(html, /id="camp-access-redemption-status"[^>]*hidden/);
  assert.match(html, /id="hexlace-admin-section"[^>]*hidden/);
  assert.match(html, /id="hex-owl-camp-editor-section"[^>]*hidden/);
  assert.match(html, /id="hex-owl-camp-original"/);
  assert.match(html, /id="hex-owl-camp-preview"/);
  assert.match(html, /Mix any enabled traits freely/);
  assert.match(html, /<option value="">No camp access<\/option>/);
  assert.match(campAccess, /freestyle:\s*true/);
  assert.match(hexadex, /freestyle:\s*true/);
});

test("member and admin access expose the current Owl catalogue without disabled or fixed traits", async () => {
  const owl = { seed: "0123456789abcdef0123456789abcdef", version: 2 };
  const profile = { profileId: "profile-1", profileKey: "private-key", owl };
  const HexOwl = {
    catalogue: () => ({
      rarities: [{ id: "common", name: "Common" }, { id: "rare", name: "Rare" }],
      categories: {
        palette: [{ id: "day", name: "Day" }, { id: "night", name: "Night" }, { id: "disabled", name: "Disabled", enabled: false }],
        eyes: [{ id: "open", name: "Open" }, { id: "sleepy", name: "Sleepy" }],
        accessory: [{ id: "none", name: "None" }]
      }
    }),
    selectTraits: () => ({
      rarity: { id: "common", name: "Common" },
      selectionIds: { palette: "day", eyes: "open", accessory: "none" }
    })
  };
  const { access, adminPanel, traitSection } = await loadCampAccess(undefined, {
    Hexadex: { loadProfile: () => profile },
    HexOwl
  });

  access.claimCredentials("grant-token-that-is-long-enough-123");
  access.applyResponse({ campAccess: { active: true, role: "member", readId: "abcdEFGH" } });
  assert.equal(adminPanel.hidden, true);
  assert.equal(traitSection.hidden, false);
  assert.deepEqual([...access.owlCustomizationDefinitions()].map(definition => definition.key), ["rarity", "palette", "eyes"]);
  assert.deepEqual([...access.owlCustomizationDefinitions()[1].options].map(option => option.value), ["day", "night"]);
  access.registerOwlTraits({ key: "admin_glow", label: "Admin glow", options: ["quiet", "bright"] });
  assert.equal(access.owlCustomizationDefinitions().some(definition => definition.key === "admin_glow"), false);

  access.applyResponse({ campAccess: { active: true, role: "admin", readId: "abcdEFGH" } });
  assert.equal(adminPanel.hidden, false);
  assert.equal(traitSection.hidden, false);
  assert.equal(access.owlCustomizationDefinitions().some(definition => definition.key === "admin_glow"), true);
});

for (const role of ["member", "admin"]) {
  test(`access-only ${role} QR preserves an existing phone profile and saved data`, async () => {
    let requestBody = null;
    const { access, localStorage } = await loadCampAccess(async (url, options) => {
      assert.match(url, /\/camp\/pairings\/redeem$/);
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        ok: true,
        campAccess: { active: true, role, readId: "abcdEFGH" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const existingPhoneData = {
      "shambhala-2026-hexlace-identity": JSON.stringify({ readId: "phone123", writeKey: "existing-private-key", name: "Phone owner" }),
      "shambhala-2026-my-set-list": JSON.stringify([{ artist: "Existing set", startKey: 123 }]),
      "shambhala-2026-hexlaces-collected": JSON.stringify(["friend01"]),
      "shambhala-2026-ping": JSON.stringify({ type: "camp", startKey: 1, endKey: 31 }),
      "shambhala-hex-owl-profile": JSON.stringify({ profileId: "existingProfile1", profileKey: "existing-profile-private-key", owl: { seed: "abc" } })
    };
    for (const [key, value] of Object.entries(existingPhoneData)) localStorage.setItem(key, value);

    const paired = await access.redeemPairing("2345-6789-abcd-efgh-jkmn-pqrs");

    assert.equal(paired, true);
    assert.equal(requestBody.token, "23456789abcdefghjkmnpqrs");
    assert.ok(requestBody.accessKey.length >= 24);
    for (const [key, value] of Object.entries(existingPhoneData)) assert.equal(localStorage.getItem(key), value);
    assert.equal(access.load().role, role);
  });
}
