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

async function loadCampAccess(fetchHexlaceApi = () => { throw new Error("not used"); }) {
  const source = await readFile(new URL("../camp-access.js", import.meta.url), "utf8");
  const adminPanel = { hidden: true, open: false };
  const localStorage = storage();
  const context = {
    crypto: webcrypto,
    localStorage,
    navigator: { onLine: true },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: {
      hidden: false,
      querySelector(selector) { return selector === "#hexlace-admin-section" ? adminPanel : null; },
      addEventListener() {}
    },
    window: {
      addEventListener() {},
      dispatchEvent() {},
      setTimeout() {},
      fetchHexlaceApi
    }
  };
  vm.runInNewContext(source, context);
  return { access: context.window.CampAccess, adminPanel, localStorage };
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

test("access-only admin pairing preserves an existing phone profile and saved data", async () => {
  let requestBody = null;
  const { access, localStorage } = await loadCampAccess(async (url, options) => {
    assert.match(url, /\/camp\/pairings\/redeem$/);
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      ok: true,
      campAccess: { active: true, role: "admin", readId: "abcdEFGH" }
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
  assert.equal(access.load().role, "admin");
});
