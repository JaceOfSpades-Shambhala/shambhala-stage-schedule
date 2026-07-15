import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playgroundUrl = new URL("../hex-owl-playground.html", import.meta.url);
const hexadexUrl = new URL("../hexadex.js", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const livePlaygroundUrl = "https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/hex-owl-playground.html";

test("Hex Owl playground is discoverable from the README", async () => {
  const readme = await readFile(readmeUrl, "utf8");
  assert.match(readme, new RegExp(`\\[open the live playground\\]\\(${livePlaygroundUrl.replaceAll(".", "\\.")}\\)`));
});

test("Hex Owl playground options pair readable text with an opaque background", async () => {
  const playground = await readFile(playgroundUrl, "utf8");
  const declarations = playground.match(/select\s+option\s*\{([^}]*)\}/)?.[1];

  assert.ok(declarations, "The playground must explicitly style native select options.");
  assert.match(declarations, /(?:^|;)\s*color:\s*var\(--ink\)\s*;/);
  assert.match(declarations, /(?:^|;)\s*background-color:\s*var\(--panel-strong\)\s*;/);
});

test("Hex Owl browser mounts avoid Android compositor-sensitive sprite reuse", async () => {
  const [playground, hexadex] = await Promise.all([
    readFile(playgroundUrl, "utf8"),
    readFile(hexadexUrl, "utf8")
  ]);
  const panel = playground.match(/\.panel\s*\{([^}]*)\}/)?.[1] || "";

  assert.doesNotMatch(panel, /backdrop-filter\s*:/, "Owl panels must not force a backdrop-filter compositing layer.");
  assert.match(playground, /function setSvg\(container, svg\)/);
  assert.match(playground, /api\.hydrate\?\.\(container\)/);
  assert.match(hexadex, /HexOwl\.hydrate\?\.\(container\)/);
  assert.match(playground, /Renderer V\$\{version\} .* Release v\$\{release\}/);
});
