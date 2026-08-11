import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveOutputDir } from "../scripts/build-pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("the Pages builder accepts only the repository dist directory", () => {
  const expected = resolve(root, "dist");
  assert.equal(resolveOutputDir(root), expected);
  assert.equal(resolveOutputDir(root, "dist"), expected);
  assert.equal(resolveOutputDir(root, expected), expected);

  for (const arg of [
    "",
    "   ",
    ".",
    "..",
    "../outside",
    "build/out",
    "scripts",
    "test",
    "worker",
    ".audit",
    ".git",
    "app.js",
    "package.json"
  ]) {
    assert.throws(() => resolveOutputDir(root, arg), /Refusing to build:/);
  }
});
