import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function renderer() {
  const source = await readFile(new URL("../hex-owl.js", import.meta.url), "utf8");
  const context = { window: {}, globalThis: {}, TextEncoder, Uint8Array, Error };
  context.globalThis.crypto = { getRandomValues(bytes) { bytes.fill(7); return bytes; } };
  vm.runInNewContext(source, context);
  return context.window.HexOwl;
}

test("the same seed and version always produce identical traits and SVG", async () => {
  const owl = await renderer();
  const seed = "00112233445566778899aabbccddeeff";
  assert.equal(owl.renderSvg(seed, 1), owl.renderSvg(seed, 1));
  assert.deepEqual({ ...owl.traitNames(seed, 1) }, { ...owl.traitNames(seed, 1) });
});

test("version 1 has a frozen snapshot and ignores display-name labels", async () => {
  const owl = await renderer();
  const seed = "0123456789abcdeffedcba9876543210";
  const traits = owl.traitNames(seed, 1);
  assert.deepEqual({ ...traits }, {
    "Eye style": "Original Shambhala",
    "Owl colour": "Bass Gold",
    Accessory: "LED Ear Cuffs",
    Aura: "Quiet",
    "Brow treatment": "Brow Echo",
    Beak: "Original Mark",
    "Facial disc": "Clean Face",
    "Portal rings": "Village Voltage",
    "Ring finish": "Signal Dash",
    "Ring twist": "Counter-clockwise",
    Rarity: "Uncommon",
    Edition: "2026"
  });
  assert.doesNotMatch(owl.renderSvg(seed, 1), /display name|Night Owl|Alex/);
  assert.throws(() => owl.renderSvg(seed, 2), /Unsupported Hex Owl version/);
});

test("different seeds create useful visible variation", async () => {
  const owl = await renderer();
  const seeds = Array.from({ length: 24 }, (_, index) => index.toString(16).padStart(32, "0"));
  const traitSignatures = new Set(seeds.map(seed => JSON.stringify(owl.traitNames(seed, 1))));
  const svgs = new Set(seeds.map(seed => owl.renderSvg(seed, 1)));
  assert.ok(traitSignatures.size >= 20);
  assert.ok(svgs.size >= 20);
});

test("the shared base asset is the exact supplied Owl path", async () => {
  const asset = await readFile(new URL("../hex-owl-base.svg", import.meta.url), "utf8");
  const path = asset.match(/\sd="([^"]+)"/)?.[1];
  assert.equal(path?.length, 72910);
  assert.equal(createHash("sha256").update(path).digest("hex"), "c481e17d177271d177fd341df161a99950a08bcc61f6088cd70c64d886489ac3");
  assert.match(asset, /id="shambhala-owl-mark"/);
  assert.match(asset, /fill-rule="evenodd"/);
});

test("festival traits preserve the exact Owl anatomy reference", async () => {
  const owl = await renderer();
  const approved = new Set(["None", "Kandi Beads", "Double Kandi", "LED Ear Cuffs", "Glow Hoops", "Disco Chin Gem", "Glowstick Earrings"]);
  for (let index = 0; index < 500; index += 1) {
    const seed = (index * 7919).toString(16).padStart(32, "0");
    const traits = owl.traitNames(seed, 1);
    assert.equal(approved.has(traits.Accessory), true);
    const svg = owl.renderSvg(seed, 1);
    assert.match(svg, /<image href="\.\/hex-owl-base\.svg\?v=55"/);
    assert.match(svg, /<use href="#hex-owl-shared-mark" fill="#[0-9a-f]{6}"/);
    assert.doesNotMatch(svg, /M151 270q48-24 96 15/, "The rejected hand-drawn eye socket must not return.");
  }
});

test("ordinary portals stay one colour while rarity controls gradients and sparkles", async () => {
  const owl = await renderer();
  const rarePalettes = new Set(["Pagoda Sunset", "Aurora Bloom", "Moon Prism"]);
  let sawRare = false;
  let sawLegendary = false;
  for (let index = 0; index < 4000; index += 1) {
    const seed = owl.normalizeSeed(`rarity-${index}`);
    const traits = owl.selectTraits(seed, 1);
    if (traits.rarity.type === "legendary") {
      sawLegendary = true;
      assert.equal(rarePalettes.has(traits.rings.name), true);
      assert.equal(traits.aura.name, "Star Dust");
    } else {
      assert.equal(new Set([...traits.rings.colors]).size, 1);
      assert.equal(rarePalettes.has(traits.rings.name), false);
    }
    if (traits.rarity.type === "rare") {
      sawRare = true;
      assert.equal(traits.aura.name, "Star Dust");
    }
  }
  assert.equal(sawRare, true);
  assert.equal(sawLegendary, true);
});

test("portal geometry uses exact flat-top and vertical-side endpoints", async () => {
  const owl = await renderer();
  const svg = owl.renderSvg("00112233445566778899aabbccddeeff", 1);
  assert.match(svg, /rotate\(-?30\)/);
  assert.match(svg, /rotate\(-?20\)/);
  assert.match(svg, /rotate\(-?10\)/);
  assert.match(svg, /rotate\(0\)/);
  assert.doesNotMatch(svg, /rotate\(-?45\)/);
  assert.match(svg, /scale\(0\.73\)/, "The innermost portal must clear the full Owl width with visible side clearance.");
  assert.match(svg, /translate\(50 50\) scale\(\.0365\) translate\(-724 -723\)/, "The Owl must use the true centre of its source viewBox.");
  assert.match(svg, /x="23\.574" y="23\.61" width="52\.852" height="52\.779"/);
});

test("laser eyes use beams without drawn pupil circles", async () => {
  const owl = await renderer();
  let laserSvg = "";
  for (let index = 0; index < 1000 && !laserSvg; index += 1) {
    const seed = owl.normalizeSeed(`laser-${index}`);
    if (owl.traitNames(seed, 1)["Eye style"] === "Laser") laserSvg = owl.renderSvg(seed, 1);
  }
  assert.match(laserSvg, /M34\.89 52\.45L2 62/);
  assert.match(laserSvg, /M65\.18 52\.45L98 62/);
  assert.doesNotMatch(laserSvg, /<circle cx="(?:34\.89|65\.18)" cy="52\.45"/);
});

test("brow treatments recolour complete exact chevrons instead of clipped strips", async () => {
  const owl = await renderer();
  const expectedParts = new Map([
    ["Crown Gem", ["brow-gem"]],
    ["Brow Echo", ["brow-lower", "brow-upper"]],
    ["Triple Prism", ["brow-lower", "brow-middle", "brow-upper"]],
    ["Moonstone Crest", ["brow-upper", "brow-gem"]]
  ]);
  const examples = new Map();
  for (let index = 0; index < 5000 && examples.size < expectedParts.size; index += 1) {
    const seed = owl.normalizeSeed(`brow-treatment-${index}`);
    const name = owl.traitNames(seed, 1)["Brow treatment"];
    if (expectedParts.has(name) && !examples.has(name)) examples.set(name, owl.renderSvg(seed, 1));
  }
  assert.equal(examples.size, expectedParts.size);
  for (const [name, parts] of expectedParts) {
    const svg = examples.get(name);
    for (const part of parts) assert.match(svg, new RegExp(`href="#hex-owl-shared-mark-${part}"`), `${name} should use the exact ${part} component.`);
    assert.doesNotMatch(svg, /clipPath|clip-path/, `${name} must not slice the Owl with a rectangular clip.`);
  }
});

test("retired sticker-like traits and ring halos do not return", async () => {
  const source = await readFile(new URL("../hex-owl.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /LED Totem|Flower Crown|Third Eye|Bandana Dots|Wide Awake|Spiral|Heart/);
  assert.doesNotMatch(source, /pattern:\s*"(?:halo|pulse|moon)"/);
  assert.match(source, /browTreatmentSvg/);
});
