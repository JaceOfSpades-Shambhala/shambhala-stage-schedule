import assert from "node:assert/strict";
import test from "node:test";
import { installHexlacesGlobals, loadHexlaces, makeIdentity } from "./helpers/hexlaces-harness.mjs";

const IDENTITY_KEY = "shambhala-2026-hexlace-identity";
const SETS_KEY = "shambhala-2026-my-set-list";
const COLLECTED_KEY = "shambhala-2026-hexlaces-collected";

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

// Any request other than the one under test (owner pulls, handoff prep,
// publishes the test doesn't care about) should resolve quickly without
// throwing, so unrelated code paths triggered along the way don't fail.
function harmlessResponse() {
  return { ok: false, status: 404, json: async () => ({}) };
}

test("a planner edit made while an owner refresh is in flight survives, instead of being overwritten by the stale pre-edit snapshot", async () => {
  const { localStorage } = installHexlacesGlobals();
  const identity = makeIdentity({ dirty: false });
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  localStorage.setItem(SETS_KEY, JSON.stringify([]));

  const ownerFetchStarted = deferred();
  const ownerFetchResult = deferred();
  globalThis.fetch = async url => {
    if (String(url).includes("/owner")) {
      ownerFetchStarted.resolve();
      return { ok: true, status: 200, json: async () => ownerFetchResult.promise };
    }
    return harmlessResponse();
  };

  await loadHexlaces();
  await ownerFetchStarted.promise;

  // A planner save lands while the periodic owner pull's GET is in flight.
  const freshSet = { day: "Friday", stageId: "amp", time: "11:00 PM", artist: "NEW SET" };
  localStorage.setItem(SETS_KEY, JSON.stringify([freshSet]));
  window.dispatchEvent(new Event("setlist-changed"));

  // The server responds with a newer revision but the OLD (pre-edit) sets -
  // exactly the stale snapshot a naive pull would apply.
  ownerFetchResult.resolve({ name: "Tester", sets: [], ping: null, updated: Date.now(), revision: 2, friends: [] });
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.deepEqual(JSON.parse(localStorage.getItem(SETS_KEY)), [freshSet]);
});

test("a friend scanned while an owner refresh is in flight is not dropped by the stale pre-scan friends snapshot", async () => {
  const { localStorage } = installHexlacesGlobals();
  const identity = makeIdentity({ dirty: false });
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  localStorage.setItem(SETS_KEY, JSON.stringify([]));
  localStorage.setItem(COLLECTED_KEY, JSON.stringify([]));

  const ownerFetchStarted = deferred();
  const ownerFetchResult = deferred();
  globalThis.fetch = async url => {
    if (String(url).includes("/owner")) {
      ownerFetchStarted.resolve();
      return { ok: true, status: 200, json: async () => ownerFetchResult.promise };
    }
    return harmlessResponse();
  };

  await loadHexlaces();
  await ownerFetchStarted.promise;

  // A friend's tag is scanned mid-flight, collecting them locally.
  localStorage.setItem(COLLECTED_KEY, JSON.stringify([{ readId: "frnd1234", name: "", sets: [], ping: null, pending: true }]));

  // The server responds with a newer revision but doesn't know about this
  // friend yet - exactly the stale snapshot that dropped a scanned friend
  // before the friends list was unioned instead of replaced.
  ownerFetchResult.resolve({ name: "Tester", sets: [], ping: null, updated: Date.now(), revision: 2, friends: [] });
  await new Promise(resolve => setTimeout(resolve, 20));

  const collected = JSON.parse(localStorage.getItem(COLLECTED_KEY));
  assert.ok(collected.some(entry => entry.readId === "frnd1234"));
});

test("a release completing while a publish is still in flight is not undone by that publish's late success", async () => {
  const { localStorage } = installHexlacesGlobals();
  const identity = makeIdentity({ dirty: true });
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  localStorage.setItem(SETS_KEY, JSON.stringify([]));

  const publishStarted = deferred();
  const publishResult = deferred();
  globalThis.fetch = async (url, options) => {
    const method = options?.method || "GET";
    if (String(url).endsWith(`/lists/${identity.readId}`) && method === "PUT") {
      publishStarted.resolve();
      return { ok: true, status: 200, json: async () => publishResult.promise };
    }
    if (String(url).includes("/release") && method === "POST") {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return harmlessResponse();
  };

  await loadHexlaces();
  await publishStarted.promise;

  // The user releases their Hexlace while the earlier publish is still
  // in flight - this is exactly what releaseHexlace() does on success.
  localStorage.removeItem(IDENTITY_KEY);

  // The stale publish then resolves successfully.
  publishResult.resolve({ revision: 5, updated: Date.now() });
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(localStorage.getItem(IDENTITY_KEY), null);
});
