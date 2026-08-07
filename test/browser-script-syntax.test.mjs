// Copyright (c) 2026 Jace Jacques. All rights reserved.
// Proprietary and confidential. Unauthorized copying, modification, or
// distribution of this file, via any medium, is strictly prohibited.
// See LICENSE at the repository root.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { parseAsClassicScript } from "../scripts/load-globals.mjs";

const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");

test("every script index.html loads parses as a classic browser script", async () => {
  const html = await read("index.html");
  const tags = [...html.matchAll(/<script\b[^>]*>/g)]
    .map(match => match[0])
    .filter(tag => /\ssrc\s*=/.test(tag));
  const paths = tags
    .map(tag => {
      const match = /\ssrc\s*=\s*["']([^"']+)["']/.exec(tag);
      assert.ok(match, "a <script> tag with src did not match the extraction pattern");
      return match[1];
    })
    .filter(path => !/^(https?:)?\/\//.test(path))
    .map(path => path.replace(/\?.*$/, ""));

  assert.ok(paths.length >= 15, "index.html script discovery matched nothing - the regex is stale.");

  for (const path of paths) {
    const source = await read(path);
    parseAsClassicScript(source, path);
  }
});

test("the classic-script guard rejects ESM syntax", () => {
  assert.throws(() => parseAsClassicScript("export function bar() {}"), SyntaxError);
  assert.throws(() => parseAsClassicScript("import x from 'y';"), SyntaxError);
  assert.doesNotThrow(() => parseAsClassicScript("window.FOO = 1;"));
});

test("load-globals resolves paths from the repo root, not the cwd", () => {
  const helper = new URL("../scripts/load-globals.mjs", import.meta.url).href;
  const out = execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import { loadGlobals } from ${JSON.stringify(helper)};
     process.stdout.write(String(Boolean(loadGlobals("schedule-data.js").SCHEDULE_DATA)));`
  ], { cwd: tmpdir(), encoding: "utf8" });
  assert.equal(out.trim(), "true");
});
