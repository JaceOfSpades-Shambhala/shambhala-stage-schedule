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
