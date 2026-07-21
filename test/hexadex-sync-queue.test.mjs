import assert from "node:assert/strict";
import test from "node:test";
import { installHexlacesGlobals, loadHexadex } from "./helpers/hexlaces-harness.mjs";

const PROFILE_KEY = "shambhala-hex-owl-profile";
const PENDING_KEY = "shambhala-hexadex-pending";

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

const ITEM_A = { readId: "aaaaaaaa", tapToken: "tokenA", firstCollectedAt: 1 };
const ITEM_B = { readId: "bbbbbbbb", tapToken: "tokenB", firstCollectedAt: 2 };

test("a tap queued while syncPending is submitting an earlier item is not dropped by the end-of-loop write", async () => {
  const { localStorage } = installHexlacesGlobals();
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ profileId: "profile1", profileKey: "profilekey1234567" }));
  localStorage.setItem(PENDING_KEY, JSON.stringify([ITEM_A]));

  const submitStarted = deferred();
  const submitResult = deferred();
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/hexadex") && options?.method === "POST") {
      submitStarted.resolve();
      return { ok: true, status: 200, json: async () => submitResult.promise };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  await loadHexadex();
  const syncing = window.Hexadex.syncPending();
  await submitStarted.promise;

  // A second physical tap queues ITEM_B while ITEM_A's submission is still
  // in flight - this is exactly what collect() does synchronously before it
  // ever awaits a network call.
  localStorage.setItem(PENDING_KEY, JSON.stringify([ITEM_A, ITEM_B]));

  submitResult.resolve({
    entry: { readId: ITEM_A.readId, name: "Friend", owl: { seed: "a".repeat(32), version: 4, number: 1 }, firstCollectedAt: 1, context: "Shambhala 2026" }
  });
  await syncing;

  const stillPending = JSON.parse(localStorage.getItem(PENDING_KEY));
  assert.deepEqual(stillPending, [ITEM_B]);
});
