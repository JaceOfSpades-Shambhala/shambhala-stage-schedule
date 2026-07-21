import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("friend scans use the quiet collection sync path", async () => {
  const source = await readFile(new URL("../hexlaces.js", import.meta.url), "utf8");
  assert.match(source, /async function syncFriendCollection\(\)/);
  assert.match(source, /publish\(\{ backgroundFriendSync: true \}\)/);
  assert.match(source, /if \(options\.backgroundFriendSync\) \{[\s\S]*?identity\.conflict = false;/);
  assert.match(source, /window\.addEventListener\("hexlace-friends-changed", \(\) => \{[\s\S]*?queueFriendCollectionSync\(\)/);
  assert.match(source, /else if \(friendSyncPending && !identity\.dirty\) await syncFriendCollection\(\);/);
});

test("friend removal publishes as an owner edit instead of the scan merge", async () => {
  const source = await readFile(new URL("../hexlaces.js", import.meta.url), "utf8");
  // The scan merge unions the server's friend list with local friends, so a
  // removal routed through it would immediately restore the removed friend.
  assert.match(source, /saveCollected\(previousEntries\.filter\(other => other\.readId !== entry\.readId\)\);[\s\S]{0,240}markDirtyAndPublishSoon\(0\);\s*\n\s*friendCollectionChanged\(\);/);
  // An in-flight scan merge must abort once a removal marks the owner dirty.
  assert.match(source, /async function syncFriendCollection\(\)[\s\S]{0,1200}?if \(loadIdentity\(\)\?\.dirty\) return false;/);
});
