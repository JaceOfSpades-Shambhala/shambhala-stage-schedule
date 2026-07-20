import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("saving a new username stops before creation when no sets are saved", async () => {
  const source = await readFile(new URL("../hexlaces.js", import.meta.url), "utf8");
  const guard = source.indexOf('if (editorMode === "enable" && mySets().length === 0)');
  const create = source.indexOf("await createSharingIdentity(name)", guard);

  assert.ok(guard >= 0, "the empty-set name guard should exist");
  assert.ok(create > guard, "the guard should run before the sharing identity is created");
  assert.match(source.slice(guard, create), /Save at least one set before choosing your username\./);
  assert.match(source.slice(guard, create), /return;/);
});
