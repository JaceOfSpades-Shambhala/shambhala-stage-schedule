import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function renderer(options = {}) {
  const source = await readFile(new URL("../hex-owl.js", import.meta.url), "utf8");
  const context = { window: {}, globalThis: {}, TextEncoder, Uint8Array, Error };
  context.globalThis.crypto = { getRandomValues(bytes) { bytes.fill(7); return bytes; } };
  Object.assign(context.globalThis, options.globalThis || {});
  vm.runInNewContext(source, context);
  return context.window.HexOwl;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function svgHash(svg) {
  return createHash("sha256").update(svg).digest("hex");
}

function assertDeepFrozen(value, label, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${label} must be deeply frozen.`);
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], `${label}.${String(key)}`, seen);
}

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function optionId(value) {
  if (typeof value === "string") return normalizedKey(value);
  if (!value || typeof value !== "object") return "";
  return normalizedKey(value.id ?? value.type ?? value.value ?? value.key ?? value.name ?? value.label);
}

function rawOptionId(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return String(value.id ?? value.type ?? value.value ?? value.key ?? value.name ?? value.label ?? "");
}

function optionLabel(value) {
  if (typeof value === "string") return value;
  return String(value?.label ?? value?.name ?? value?.id ?? value?.type ?? value?.value ?? "");
}

const CATEGORY_ALIASES = Object.freeze({
  face: ["face", "owlColour", "owlColor", "colour", "color", "palette"],
  rings: ["rings", "ringMode", "portalRings", "portal", "ringPalette"],
  aura: ["aura", "auras", "background"],
  eyes: ["eyes", "eye", "eyeTreatment"],
  accessory: ["accessory", "accessories", "festivalAccessory"],
  ringStyle: ["ringStyle", "ringFinish", "portalFinish"],
  ringDirection: ["ringDirection", "ringTwist", "direction"],
  marking: ["marking", "markings", "facialDisc", "facialDiscTreatment"],
  brow: ["brow", "brows", "browTreatment"],
  beak: ["beak", "beaks", "beakTreatment"]
});

function catalogueValue(owl) {
  const value = typeof owl.catalogue === "function" ? owl.catalogue() : owl.catalogue;
  assert.ok(value && typeof value === "object", "catalogue must return versioned trait data.");
  return value;
}

function categoryRoot(catalogue) {
  return catalogue.categories ?? catalogue.traits ?? catalogue.catalogue ?? catalogue;
}

function categoryEntry(catalogue, category) {
  const root = categoryRoot(catalogue);
  const aliases = new Set((CATEGORY_ALIASES[category] || [category]).map(normalizedKey));
  if (Array.isArray(root)) {
    return root.find(entry => aliases.has(normalizedKey(entry?.id ?? entry?.key ?? entry?.name ?? entry?.category)));
  }
  return Object.entries(root).find(([key]) => aliases.has(normalizedKey(key)))?.[1];
}

function categoryOptions(catalogue, category) {
  const entry = categoryEntry(catalogue, category);
  if (Array.isArray(entry)) return entry;
  const options = entry?.options ?? entry?.values ?? entry?.traits ?? entry;
  if (Array.isArray(options)) return options;
  if (options && typeof options === "object") return Object.entries(options).map(([id, value]) =>
    value && typeof value === "object" ? { id, ...value } : { id, value });
  return [];
}

function traitRoot(resolved) {
  return resolved?.traits ?? resolved?.selection ?? resolved?.resolved ?? resolved;
}

function traitChoice(resolved, category) {
  const traits = traitRoot(resolved);
  if (!traits || typeof traits !== "object") return undefined;
  const aliases = new Set((CATEGORY_ALIASES[category] || [category]).map(normalizedKey));
  return Object.entries(traits).find(([key]) => aliases.has(normalizedKey(key)))?.[1];
}

function rarityId(resolved) {
  return optionId(traitRoot(resolved)?.rarity ?? resolved?.rarity);
}

function isMulticolour(value) {
  if (!value) return false;
  if (value.multicolour === true || value.multicolor === true || value.gradient === true) return true;
  if (Array.isArray(value.colors)) return new Set(value.colors).size > 1;
  return /multi|gradient|prism|aurora|sunset|rainbow/.test(`${optionId(value)} ${normalizedKey(optionLabel(value))}`);
}

function isLaser(value) {
  return /laser/.test(`${optionId(value)} ${normalizedKey(optionLabel(value))}`);
}

function isActive(value) {
  const id = optionId(value);
  return Boolean(id && !/^(?:none|noaccessory|original.*|quiet.*|clean.*|solid|single|clockwise|default|off)$/.test(id));
}

function validationIssues(report) {
  if (Array.isArray(report)) return report;
  if (!report || typeof report !== "object") return [];
  return report.issues ?? report.errors ?? report.warnings ?? report.violations ?? [];
}

function validationIsValid(report) {
  if (Array.isArray(report)) return report.length === 0;
  if (!report || typeof report !== "object") return false;
  if (typeof report.valid === "boolean") return report.valid;
  return validationIssues(report).length === 0;
}

function rarityRows(spec) {
  const source = spec.rarities ?? spec.rarityTiers ?? spec.rarity ?? spec.tiers;
  if (Array.isArray(source)) return source.map(row => ({ ...row, id: optionId(row) }));
  if (source && typeof source === "object") return Object.entries(source).map(([id, row]) => ({ ...row, id: optionId(id) }));
  return [];
}

function numberField(value, names) {
  for (const name of names) {
    const number = Number(value?.[name]);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function selectedOption(catalogue, resolved, category) {
  const selected = traitChoice(resolved, category);
  if (selected && typeof selected === "object") return selected;
  const id = optionId(selected);
  return categoryOptions(catalogue, category).find(option => optionId(option) === id) ?? selected;
}

function densityUsed(catalogue, resolved) {
  const direct = numberField(resolved, ["density", "densityUsed", "budgetUsed", "cost"]);
  if (Number.isFinite(direct)) return direct;
  let total = 0;
  let measured = false;
  for (const category of Object.keys(CATEGORY_ALIASES)) {
    const option = selectedOption(catalogue, resolved, category);
    const cost = numberField(option, ["density", "densityCost", "cost", "budget"]);
    if (Number.isFinite(cost)) {
      measured = true;
      total += cost;
    }
  }
  assert.equal(measured, true, "Resolved traits or catalogue entries must expose density costs.");
  return total;
}

function focalCount(catalogue, resolved) {
  const direct = numberField(resolved, ["focalCount", "focals"]);
  if (Number.isFinite(direct)) return direct;
  let total = 0;
  for (const category of Object.keys(CATEGORY_ALIASES)) {
    const option = selectedOption(catalogue, resolved, category);
    if (option?.focal === true || option?.role === "focal" || option?.treatment === "focal") total += 1;
  }
  return total;
}

function renderResolved(owl, seed, resolved) {
  const svg = owl.renderWithTraits(seed, resolved, owl.VERSION);
  assert.equal(typeof svg, "string");
  assert.match(svg, /^<svg\b/);
  return svg;
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([:\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

function transformPoint(point, transform) {
  let [x, y] = point;
  const centerMatch = transform.match(/translate\(([-+\d.]+)[ ,]+([-+\d.]+)\)/);
  const rotationMatch = transform.match(/rotate\(([-+\d.]+)\)/);
  const scaleMatch = transform.match(/scale\(([-+\d.]+)(?:[ ,]+([-+\d.]+))?\)/);
  const translations = [...transform.matchAll(/translate\(([-+\d.]+)[ ,]+([-+\d.]+)\)/g)];
  const cx = Number(centerMatch?.[1] ?? 0);
  const cy = Number(centerMatch?.[2] ?? 0);
  const sx = Number(scaleMatch?.[1] ?? 1);
  const sy = Number(scaleMatch?.[2] ?? sx);
  const tail = translations.at(-1);
  if (tail && translations.length > 1) {
    x += Number(tail[1]);
    y += Number(tail[2]);
  }
  x *= sx;
  y *= sy;
  const degrees = Number(rotationMatch?.[1] ?? 0);
  if (degrees !== 0) {
    const known = new Map([
      [10, [0.984807753012208, 0.17364817766693033]],
      [-10, [0.984807753012208, -0.17364817766693033]],
      [20, [0.9396926207859084, 0.3420201433256687]],
      [-20, [0.9396926207859084, -0.3420201433256687]],
      [30, [0.8660254037844386, 0.5]],
      [-30, [0.8660254037844386, -0.5]]
    ]);
    const pair = known.get(degrees);
    assert.ok(pair, `Unexpected runtime ring rotation ${degrees}; add a serialized exact geometry constant instead.`);
    const [cosine, sine] = pair;
    [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
  }
  return [x + cx, y + cy];
}

function polygonFromTag(tag) {
  const attrs = attributes(tag);
  const original = String(attrs.points || "").trim().split(/\s+/).map(pair => pair.split(",").map(Number));
  assert.ok(original.length >= 6 && original.every(point => point.length === 2 && point.every(Number.isFinite)), "Ring polygon points must be numeric.");
  const points = attrs.transform ? original.map(point => transformPoint(point, attrs.transform)) : original;
  return { attrs, points, strokeWidth: Number(attrs["stroke-width"] || 0) };
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

function polygonCenter(points) {
  return points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, prior = polygon.length - 1; index < polygon.length; prior = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[prior];
    if ((yi > point[1]) !== (yj > point[1])
      && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + amount * dx), point[1] - (start[1] + amount * dy));
}

function polygonDistance(first, second) {
  let distance = Infinity;
  for (let index = 0; index < first.length; index += 1) {
    const start = first[index];
    const end = first[(index + 1) % first.length];
    for (const point of second) distance = Math.min(distance, pointSegmentDistance(point, start, end));
  }
  for (let index = 0; index < second.length; index += 1) {
    const start = second[index];
    const end = second[(index + 1) % second.length];
    for (const point of first) distance = Math.min(distance, pointSegmentDistance(point, start, end));
  }
  return distance;
}

function normalizedBounds(value) {
  if (Array.isArray(value) && value.length === 4) {
    return { minX: Number(value[0]), minY: Number(value[1]), maxX: Number(value[2]), maxY: Number(value[3]) };
  }
  if (!value || typeof value !== "object") return null;
  if (value.bounds !== undefined) return normalizedBounds(value.bounds);
  const minX = Number(value.minX ?? value.x ?? value.left);
  const minY = Number(value.minY ?? value.y ?? value.top);
  const maxX = Number(value.maxX ?? value.right ?? (Number.isFinite(Number(value.width)) ? minX + Number(value.width) : NaN));
  const maxY = Number(value.maxY ?? value.bottom ?? (Number.isFinite(Number(value.height)) ? minY + Number(value.height) : NaN));
  return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
}

function boundsCorners(bounds) {
  return [[bounds.minX, bounds.minY], [bounds.maxX, bounds.minY], [bounds.maxX, bounds.maxY], [bounds.minX, bounds.maxY]];
}

class FakeSvgElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.style = { cssText: "" };
  }

  set id(value) { this.setAttribute("id", value); }
  get id() { return this.getAttribute("id") || ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  cloneNode(deep = false) {
    const copy = new FakeSvgElement(this.tagName);
    copy.attributes = new Map(this.attributes);
    copy.style.cssText = this.style.cssText;
    if (deep) copy.children = this.children.map(child => child.cloneNode(true));
    return copy;
  }
}

function fakeMountDocument(asset) {
  const suppliedPath = new FakeSvgElement("path");
  suppliedPath.setAttribute("id", "shambhala-owl-mark");
  suppliedPath.setAttribute("d", asset.match(/\sd="([^"]+)"/)?.[1] || "");
  suppliedPath.setAttribute("fill-rule", "evenodd");
  const root = new FakeSvgElement("html");
  const body = new FakeSvgElement("body");
  root.append(body);
  const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean);
  class FakeDOMParser {
    parseFromString() {
      const documentElement = new FakeSvgElement("svg");
      documentElement.setAttribute("viewBox", asset.match(/\bviewBox="([^"]+)"/)?.[1] || "");
      return {
        documentElement,
        querySelector(selector) { return selector === "#shambhala-owl-mark" ? suppliedPath : null; }
      };
    }
  }
  return {
    body,
    documentElement: root,
    defaultView: { DOMParser: FakeDOMParser },
    createElementNS(namespace, tagName) {
      assert.equal(namespace, "http://www.w3.org/2000/svg");
      return new FakeSvgElement(tagName);
    },
    importNode(node, deep) { return node.cloneNode(deep); },
    getElementById(id) { return find(root, id) || null; }
  };
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
  assert.deepEqual(plain(traits), {
    "Eye style": "Festival Eye Wells",
    "Owl colour": "The Secret Garden — Midnight",
    Accessory: "None",
    Aura: "Quiet",
    "Brow treatment": "Festival Brow Tint",
    Beak: "Chevron Beak",
    "Facial disc": "Ember Specks",
    "Portal rings": "The Secret Garden — Midnight Portal",
    "Ring finish": "Dotted Signal",
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

test("the paused accessory roster preserves the exact Owl anatomy reference", async () => {
  const owl = await renderer();
  const accessoryIds = categoryOptions(catalogueValue(owl), "accessory").map(rawOptionId);
  assert.deepEqual(plain(accessoryIds), ["no-accessory"], "Accessories stay paused at None until their geometry is redesigned.");
  for (let index = 0; index < 500; index += 1) {
    const seed = (index * 7919).toString(16).padStart(32, "0");
    const traits = owl.traitNames(seed, 1);
    assert.equal(traits.Accessory, "None");
    const svg = owl.renderSvg(seed, 1);
    assert.doesNotMatch(svg, /<mask\b|<image\b/, "The Android-unsafe external-image mask must not return.");
    assert.match(svg, /<use href="#hex-owl-shared-mark" fill="#[0-9a-f]{6}"/);
    assert.doesNotMatch(svg, /M151 270q48-24 96 15/, "The rejected hand-drawn eye socket must not return.");
  }
});

test("Android-safe Owl output avoids the external-image mask raster path", async () => {
  const owl = await renderer();
  const screenshotSeeds = [
    "4be7657855805980d45b3e7ec5f5186d",
    "4ce77cd5739235b416ee93d4222cb208",
    "4de77c2209ed61095612aa210d887508"
  ];
  for (const seed of screenshotSeeds) {
    const svg = owl.renderSvg(seed, 1);
    assert.doesNotMatch(svg, /<mask\b/);
    assert.doesNotMatch(svg, /<image\b/);
    assert.equal((svg.match(/<use href="#hex-owl-shared-mark"/g) || []).length, 1,
      `${seed} must draw its base once through the shared vector path.`);
  }
});

test("ordinary portals stay one colour while Legendary portals use palette-linked prisms", async () => {
  const owl = await renderer();
  let sawRare = false;
  let sawLegendary = false;
  for (let index = 0; index < 4000; index += 1) {
    const seed = owl.normalizeSeed(`rarity-${index}`);
    const traits = owl.selectTraits(seed, 1);
    if (traits.rarity.id === "legendary") {
      sawLegendary = true;
      assert.equal(traits.ringMode.id, "festival-prism");
      assert.equal(traits.rings.multicolor, true);
      assert.deepEqual(plain(traits.rings.colors), [
        traits.palette.tokens.ring,
        traits.palette.tokens.focal,
        traits.palette.tokens.beam,
        traits.palette.tokens.highlight
      ]);
      assert.ok(new Set(traits.rings.colors).size > 1);
    } else {
      assert.equal(new Set([...traits.rings.colors]).size, 1);
      assert.equal(traits.ringMode.id, "single");
      assert.equal(traits.rings.multicolor, false);
    }
    if (traits.rarity.id === "rare") sawRare = true;
  }
  assert.equal(sawRare, true);
  assert.equal(sawLegendary, true);
});

test("portal geometry serializes the frozen measured rotations, radii, and Owl transform", async () => {
  const owl = await renderer();
  const seed = "00112233445566778899aabbccddeeff";
  const traits = owl.selectTraits(seed, 1);
  const svg = owl.renderWithTraits(seed, traits, 1);
  const tags = [...svg.matchAll(/<polygon\b[^>]*\bdata-ring="[^"]+"[^>]*>/g)].map(match => match[0]);
  assert.equal(tags.length, 4);
  const sign = traits.direction.id === "counter-clockwise" ? -1 : 1;
  tags.forEach((tag, index) => {
    const attrs = attributes(tag);
    const ring = owl.SPEC.geometry.rings[index];
    assert.equal(attrs["data-ring"], ring.id);
    assert.equal(Number(attrs["data-rotation"]), ring.rotation === 0 ? 0 : sign * ring.rotation);
    assert.equal(Number(attrs["data-radius"]), ring.radius);
    assert.equal(attrs.points, traits.direction.id === "counter-clockwise" ? ring.reversePoints : ring.points);
  });
  assert.doesNotMatch(svg, /rotate\(-?45\)/);
  assert.match(svg, /translate\(50 50\) scale\(\.0365\) translate\(-724 -723\)/, "The Owl must use the true centre of its source viewBox.");
  assert.doesNotMatch(svg, /<mask\b|<image\b/, "Portal geometry must not reintroduce a rasterized Owl mask.");
});

test("laser eyes use beams without drawn pupil circles", async () => {
  const owl = await renderer();
  const seed = owl.normalizeSeed("laser-treatment");
  const resolved = owl.resolveTraits(seed, { rarity: "rare", overrides: { eyes: "pupil-lasers" } }, 1);
  assert.equal(resolved.eyes.id, "pupil-lasers");
  const laserSvg = owl.renderWithTraits(seed, resolved, 1);
  assert.match(laserSvg, /M34\.8890 52\.4455L21\.9491 56\.2046/);
  assert.match(laserSvg, /M65\.1840 52\.4455L78\.0509 56\.1917/);
  assert.match(laserSvg, /M21\.0491 56\.4661L2\.0000 62\.0000/);
  assert.match(laserSvg, /M78\.9509 56\.4538L98\.0000 62\.0000/);
  assert.doesNotMatch(laserSvg, /<circle\b[^>]*cx="(?:34\.8890|65\.1840)"[^>]*cy="52\.4455"/);
});

test("eye-well variants colour exact negative space beneath the native pupils", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl);
  const eyeOptions = categoryOptions(catalogue, "eyes");
  assert.deepEqual(plain(eyeOptions.map(rawOptionId)), [
    "original-eyes",
    "festival-eye-wells",
    "electric-eye-wells",
    "pupil-lasers"
  ]);

  const zone = owl.SPEC.geometry.safeZones.eyeFields;
  assert.equal(zone.preserveNativePupils, true);
  assert.deepEqual(plain(zone.bounds), [30.874, 50.7665, 69.0895, 57.9205]);
  assert.deepEqual(plain(zone.regions), [
    [30.874, 50.7665, 40.1085, 57.9205],
    [59.855, 50.7665, 69.0895, 57.9205]
  ]);

  for (const [id, token] of [["festival-eye-wells", "focal"], ["electric-eye-wells", "beam"]]) {
    const seed = owl.normalizeSeed(`native-pupil-${id}`);
    const resolved = owl.resolveTraits(seed, { rarity: "common", overrides: { eyes: id, palette: "amp-daylight" } }, 1);
    assert.equal(resolved.eyes.id, id);
    assert.equal(resolved.eyes.safeZone, "eyeFields");
    const svg = renderResolved(owl, seed, resolved);
    const backdropPosition = svg.indexOf('data-layer="owl-backdrop"');
    const eyesPosition = svg.indexOf('data-layer="eyes"');
    const owlPosition = svg.indexOf('data-layer="owl-base"');
    assert.ok(backdropPosition >= 0 && eyesPosition > backdropPosition && owlPosition > eyesPosition,
      `${id} must sit above the dark backing and below the exact Owl mark.`);

    const eyeLayer = svg.slice(eyesPosition, owlPosition);
    assert.match(eyeLayer, new RegExp(`data-eye-treatment="${id}" fill="${resolved.palette.tokens[token]}"`));
    assert.match(eyeLayer, /<rect x="30\.8740" y="50\.7665" width="9\.2345" height="7\.1540"\/>/);
    assert.match(eyeLayer, /<rect x="59\.8550" y="50\.7665" width="9\.2345" height="7\.1540"\/>/);
    assert.doesNotMatch(eyeLayer, /<circle\b/, "Eye-well colour must not paint replacement pupil circles.");
    assert.doesNotMatch(svg, /<circle\b[^>]*cx="(?:34\.8890|65\.1840)"[^>]*cy="52\.4455"/,
      "The supplied Owl's native pupils must remain the only pupil anatomy.");
  }
});

test("brow treatments recolour complete exact chevrons instead of clipped strips", async () => {
  const owl = await renderer();
  const expectedParts = new Map([
    ["Top-ridge Gem", ["brow-gem"]],
    ["Brow Echo", ["brow-lower", "brow-upper"]],
    ["Festival Brow Tint", ["brow-middle", "brow-upper"]],
    ["Moonstone Crest", ["brow-upper", "brow-gem"]],
    ["Three-band Prism", ["brow-lower", "brow-middle", "brow-upper", "brow-gem"]]
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
    const start = svg.indexOf('<g data-layer="brows"');
    const browLayer = svg.slice(start, svg.indexOf("</g>", start) + 4);
    assert.match(browLayer, /clip-path="url\(#hex-owl-[^"]+-safe\)"/);
    assert.doesNotMatch(browLayer, /<(?:rect|path)\b/, `${name} must use complete exact supplied brow subpaths, not substitute strips.`);
    assert.ok(svg.includes(`<polygon points="${owl.SPEC.geometry.safeZones.innerPortal.points}"/>`),
      `${name} must be constrained by the exact inner-portal polygon.`);
  }
});

test("retired sticker-like, pinpoint, face-glow, and accessory traits do not return", async () => {
  const source = await readFile(new URL("../hex-owl.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /LED Totem|Flower Crown|Third Eye|Bandana Dots|Wide Awake|Spiral|Heart/);
  assert.doesNotMatch(source, /ember-pinpoint|aqua-pinpoint|facial-disc-tint|kandi-arc|double-kandi|integrated-leds/);
  assert.doesNotMatch(source, /pattern:\s*"(?:halo|pulse|moon)"/);
  assert.match(source, /function browSvg\(/);
});

test("the versioned public API remains backward compatible and exposes frozen specification data", async () => {
  const owl = await renderer();
  for (const name of ["normalizeSeed", "randomSeed", "selectTraits", "traitNames", "renderSvg", "mountBase",
    "catalogue", "resolveTraits", "validateTraits", "renderWithTraits"]) {
    assert.equal(typeof owl[name], "function", `HexOwl.${name} must remain public.`);
  }
  assert.equal(owl.VERSION, 1);
  assert.ok(owl.SPEC && typeof owl.SPEC === "object");
  assert.equal(owl.SPEC.version, owl.VERSION);
  for (const key of ["rarities", "paletteFamilies", "palettes", "geometry", "layerOrder", "catalogue"]) {
    assert.ok(owl.SPEC[key] != null, `SPEC.${key} is required.`);
  }
  assert.equal(owl.catalogue(), owl.SPEC.catalogue, "catalogue() must expose the canonical frozen catalogue.");
  assert.deepEqual(Object.keys(owl.SPEC.catalogue.categories).sort(),
    ["accessory", "aura", "beak", "brow", "direction", "eyes", "marking", "palette", "ringMode", "ringStyle"].sort());
  assertDeepFrozen(owl, "HexOwl");
  assertDeepFrozen(owl.SPEC, "HexOwl.SPEC");
  assertDeepFrozen(owl.catalogue(), "HexOwl.catalogue()");

  const seed = "00112233445566778899aabbccddeeff";
  const selected = owl.selectTraits(seed, 1);
  const resolved = owl.resolveTraits(seed, {}, 1);
  assertDeepFrozen(selected, "selectTraits result");
  assertDeepFrozen(resolved, "resolveTraits result");
  assert.deepEqual(plain(selected), plain(resolved));
  assert.equal(owl.renderSvg(seed, 1), owl.renderWithTraits(seed, resolved, 1));
  assert.deepEqual(plain(owl.traitNames(seed, 1)), plain(owl.traitNames(seed, 1)));
  assert.throws(() => owl.resolveTraits(seed, {}, 2), /Unsupported Hex Owl version/i);
  assert.throws(() => owl.renderWithTraits(seed, resolved, 2), /Unsupported Hex Owl version/i);
});

test("fixed seeds are byte-stable across fresh renderer contexts", async () => {
  const first = await renderer();
  const second = await renderer();
  const seeds = [
    "00000000000000000000000000000000",
    "0123456789abcdeffedcba9876543210",
    "ffffffffffffffffffffffffffffffff"
  ];
  for (const seed of seeds) {
    const firstTraits = first.selectTraits(seed, 1);
    const secondTraits = second.selectTraits(seed, 1);
    assert.deepEqual(plain(firstTraits), plain(secondTraits));
    const firstSvg = first.renderSvg(seed, 1);
    const secondSvg = second.renderSvg(seed, 1);
    assert.equal(firstSvg, secondSvg);
    assert.equal(svgHash(firstSvg), svgHash(secondSvg));
  }
});

test("representative Common, Uncommon, Rare, and Legendary SVGs have frozen V1 hashes", async () => {
  const owl = await renderer();
  const snapshots = [
    ["common", "fc67ca6aade4ac02d1627d5933eb6fa7", "225d954d3a28ff9fafda4326d2a001a50f4c820187b7cf76cb642de2c5df61b3"],
    ["uncommon", "61c4af676efe9f9ecbcb84dcec8d6b41", "ba5157c61d49644a78e99aef8a9fb47324a2a45c8e8352fe768ad349b9bea96d"],
    ["rare", "f8b765c3f16a5a5cbdad4290599a44b6", "2a4a2ebb01a421afbf7525e90fdbcd0da7a633200ac49ffaae11e2dd07f1840e"],
    ["legendary", "281ba93074f6b88a04749fdaf71f916f", "83074c68fbf5214276df6eb369c71b8930aa725ec3b098c35218f2b19745dbfd"]
  ];
  for (const [rarity, seed, expectedHash] of snapshots) {
    const resolved = owl.resolveTraits(seed, { rarity }, 1);
    assert.equal(resolved.rarity.id, rarity);
    assert.equal(svgHash(owl.renderWithTraits(seed, resolved, 1)), expectedHash, `${rarity} V1 SVG hash changed.`);
  }
});

test("same-seed palette overrides isolate all SVG definition IDs", async () => {
  const owl = await renderer();
  const seed = owl.normalizeSeed("same-seed-palette-definition-isolation");
  const options = palette => ({ rarity: "rare", overrides: { palette, aura: "radial-glow" } });
  const first = owl.resolveTraits(seed, options("amp-daylight"), 1);
  const second = owl.resolveTraits(seed, options("garden-midnight"), 1);
  assert.equal(first.palette.id, "amp-daylight");
  assert.equal(second.palette.id, "garden-midnight");
  assert.equal(first.aura.id, "radial-glow");
  assert.equal(second.aura.id, "radial-glow");

  const firstSvg = owl.renderWithTraits(seed, first, 1);
  const secondSvg = owl.renderWithTraits(seed, second, 1);
  const definitionIds = svg => {
    const definitions = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] || "";
    return [...definitions.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  };
  const firstIds = definitionIds(firstSvg);
  const secondIds = definitionIds(secondSvg);
  assert.equal(firstIds.length, 2);
  assert.equal(secondIds.length, 2);
  assert.deepEqual(firstIds.filter(id => secondIds.includes(id)), [],
    "Two same-seed variants must not share clip-path or glow definition IDs.");

  const firstGlow = firstIds.find(id => id.endsWith("-glow"));
  const secondGlow = secondIds.find(id => id.endsWith("-glow"));
  assert.ok(firstGlow && secondGlow);
  assert.notEqual(firstGlow, secondGlow);
  assert.ok(firstSvg.includes(`fill="url(#${firstGlow})"`));
  assert.ok(secondSvg.includes(`fill="url(#${secondGlow})"`));
  assert.equal(firstSvg.includes(secondGlow), false);
  assert.equal(secondSvg.includes(firstGlow), false);
});

test("rarity weights are 35/30/25/10 and ordinary rolls never produce camp-only Owls", async () => {
  const owl = await renderer();
  const rows = rarityRows(owl.SPEC);
  const expected = new Map([
    ["common", { weight: 35, budget: 3 }],
    ["uncommon", { weight: 30, budget: 5 }],
    ["rare", { weight: 25, budget: 7 }],
    ["legendary", { weight: 10, budget: 9 }]
  ]);
  assert.deepEqual(new Set(rows.map(row => row.id)), new Set(expected.keys()));
  for (const row of rows) {
    assert.equal(numberField(row, ["weight", "chance", "percent"]), expected.get(row.id).weight, `${row.id} weight`);
    assert.equal(numberField(row, ["budget", "densityBudget"]), expected.get(row.id).budget, `${row.id} budget`);
    assert.ok(Number.isSafeInteger(numberField(row, ["focalCap", "maxFocal", "focalLimit"])), `${row.id} needs a focal cap.`);
  }

  const count = 16000;
  const seen = Object.fromEntries([...expected.keys()].map(id => [id, 0]));
  for (let index = 0; index < count; index += 1) {
    const rarity = rarityId(owl.selectTraits(owl.normalizeSeed(`rarity-distribution-${index}`), 1));
    assert.notEqual(rarity, "camp");
    assert.notEqual(rarity, "camponly");
    assert.ok(Object.hasOwn(seen, rarity), `Unexpected ordinary rarity: ${rarity}`);
    seen[rarity] += 1;
  }
  for (const [id, config] of expected) {
    const actual = seen[id] / count;
    const target = config.weight / 100;
    assert.ok(Math.abs(actual - target) < 0.022, `${id} was ${(actual * 100).toFixed(2)}%, expected about ${config.weight}%.`);
  }
});

test("rarity budgets and focal caps constrain every resolved Owl", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl);
  for (const row of rarityRows(owl.SPEC)) {
    const budget = numberField(row, ["budget", "densityBudget"]);
    const cap = numberField(row, ["focalCap", "maxFocal", "focalLimit"]);
    for (let index = 0; index < 600; index += 1) {
      const seed = owl.normalizeSeed(`budget-${row.id}-${index}`);
      const resolved = owl.resolveTraits(seed, { rarity: row.id }, 1);
      assert.equal(rarityId(resolved), row.id);
      assert.ok(densityUsed(catalogue, resolved) <= budget, `${row.id} exceeded density budget ${budget}.`);
      assert.ok(focalCount(catalogue, resolved) <= cap, `${row.id} exceeded focal cap ${cap}.`);
      assert.equal(validationIsValid(owl.validateTraits(resolved)), true, `${row.id} should resolve to a valid combination.`);
    }
  }
});

test("category-specific PRNG streams do not perturb unrelated selections", async () => {
  const owl = await renderer();
  const seed = owl.normalizeSeed("category-stream-stability");
  const baseline = owl.resolveTraits(seed, { rarity: "uncommon" }, 1);
  const direction = optionId(traitChoice(baseline, "ringDirection"));
  const replacement = /counter|reverse/.test(direction) ? "clockwise" : "counter-clockwise";
  const changed = owl.resolveTraits(seed, { rarity: "uncommon", overrides: { direction: replacement } }, 1);
  assert.notEqual(optionId(traitChoice(changed, "ringDirection")), direction);
  for (const category of Object.keys(CATEGORY_ALIASES).filter(name => name !== "ringDirection")) {
    assert.equal(optionId(traitChoice(changed, category)), optionId(traitChoice(baseline, category)),
      `Changing direction must not reroll ${category}.`);
  }
  assert.equal(rarityId(changed), rarityId(baseline));
});

test("tier grammar, palette coupling, and conditional chances hold over deterministic samples", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl);
  const samples = 4000;
  const counts = {
    common: { colouredBeak: 0 },
    uncommon: { reversed: 0, recolouredBrow: 0 },
    rare: { aura: 0, laser: 0 },
    legendary: { aura: 0, laser: 0 }
  };
  for (const rarity of ["common", "uncommon", "rare", "legendary"]) {
    for (let index = 0; index < samples; index += 1) {
      const resolved = owl.resolveTraits(owl.normalizeSeed(`grammar-${rarity}-${index}`), { rarity }, 1);
      const rings = traitChoice(resolved, "rings");
      const brow = traitChoice(resolved, "brow");
      const eyes = traitChoice(resolved, "eyes");
      const aura = traitChoice(resolved, "aura");
      const beak = traitChoice(resolved, "beak");
      const direction = traitChoice(resolved, "ringDirection");
      assert.equal(rarityId(resolved), rarity);
      assert.equal(isMulticolour(rings), rarity === "legendary", `${rarity} portal colour rule`);
      assert.equal(isLaser(eyes) && !["rare", "legendary"].includes(rarity), false, "Lasers begin at Rare.");
      if (rarity === "common") {
        assert.equal(isMulticolour(brow), false);
        assert.equal(/counter|reverse/.test(`${optionId(direction)} ${normalizedKey(optionLabel(direction))}`), false);
        if (isActive(beak)) counts.common.colouredBeak += 1;
      }
      if (rarity === "uncommon") {
        if (/counter|reverse/.test(`${optionId(direction)} ${normalizedKey(optionLabel(direction))}`)) counts.uncommon.reversed += 1;
        if (optionId(brow) === "browtint") counts.uncommon.recolouredBrow += 1;
      }
      if (["rare", "legendary"].includes(rarity)) assert.equal(isMulticolour(brow), true, `${rarity} needs a multicolour brow.`);
      if (["rare", "legendary"].includes(rarity)) {
        if (isActive(aura)) counts[rarity].aura += 1;
        if (isLaser(eyes)) counts[rarity].laser += 1;
      }
      const selected = Object.keys(CATEGORY_ALIASES).map(category => selectedOption(catalogue, resolved, category));
      assert.equal(selected.some(option => option?.campOnly === true || option?.reserved === "camp"), false);
    }
  }
  const near = (actual, expected, label) => assert.ok(Math.abs(actual / samples - expected) < 0.08,
    `${label} was ${(actual / samples * 100).toFixed(1)}%, expected about ${expected * 100}%.`);
  near(counts.common.colouredBeak, 0.5, "Common coloured beak");
  near(counts.uncommon.reversed, 0.5, "Uncommon reversed rings");
  near(counts.uncommon.recolouredBrow, 0.25, "Uncommon brow recolour");
  near(counts.rare.aura, 0.5, "Rare aura");
  near(counts.rare.laser, 0.25, "Rare laser eyes");
  near(counts.legendary.aura, 0.5, "Legendary aura");
  near(counts.legendary.laser, 0.25, "Legendary laser eyes");
});

test("every active aura is forceable at Rare and Legendary but repaired below Rare", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl);
  const auraIds = categoryOptions(catalogue, "aura")
    .filter(option => optionId(option) !== "quietaura" && option.enabled !== false && option.campOnly !== true)
    .map(rawOptionId);
  assert.deepEqual(plain(auraIds), ["radial-glow", "portal-rays", "stardust"]);

  const legendaryRings = categoryOptions(catalogue, "rings").find(option => rawOptionId(option) === "festival-prism");
  const requiredBrow = categoryOptions(catalogue, "brow").find(option => rawOptionId(option) === "three-band-prism");
  assert.equal(legendaryRings?.focal, false, "Required Legendary rings must leave focal capacity for an aura.");
  assert.equal(requiredBrow?.focal, false, "Required multicolour brows must leave focal capacity for an aura.");

  for (const rarity of ["common", "uncommon", "rare", "legendary"]) {
    for (const aura of auraIds) {
      const seed = owl.normalizeSeed(`forced-aura-${rarity}-${aura}`);
      const resolved = owl.resolveTraits(seed, {
        rarity,
        overrides: { aura, eyes: "original-eyes" }
      }, 1);
      const report = owl.validateTraits(resolved);
      assert.equal(validationIsValid(report), true, `${rarity}.${aura} must resolve safely.`);
      if (["common", "uncommon"].includes(rarity)) {
        assert.equal(resolved.aura.id, "quiet-aura", `${aura} must remain Rare+.`);
        assert.ok(resolved.repairs.some(message => /incompatible/i.test(message)));
        continue;
      }

      assert.equal(resolved.aura.id, aura, `${rarity}.${aura} was unexpectedly repaired away.`);
      assert.equal(resolved.focalCount, 1);
      const svg = renderResolved(owl, seed, resolved);
      const auraStart = svg.indexOf(`data-layer="aura" data-aura="${aura}"`);
      const laserStart = svg.indexOf('data-layer="laser-outer"');
      assert.ok(auraStart >= 0 && laserStart > auraStart);
      const auraLayer = svg.slice(auraStart, laserStart);
      assert.match(auraLayer, /<(?:circle|path|g)\b/, `${rarity}.${aura} must render visible aura geometry.`);
    }
  }
});

test("invalid manual overrides are repaired deterministically into production-safe combinations", async () => {
  const owl = await renderer();
  const seed = owl.normalizeSeed("invalid-override-repair");
  const options = {
    rarity: "common",
    overrides: {
      ringMode: "pagoda-sunset-multicolour",
      eyes: "laser",
      marking: "cheek-rays",
      beak: "laser-prism",
      accessory: "not-a-real-accessory"
    }
  };
  const first = owl.resolveTraits(seed, options, 1);
  const second = owl.resolveTraits(seed, options, 1);
  assert.deepEqual(plain(first), plain(second));
  const report = owl.validateTraits(first);
  assert.equal(validationIsValid(report), true, `Resolver returned invalid traits: ${JSON.stringify(validationIssues(report))}`);
  assert.equal(rarityId(first), "common");
  assert.equal(isMulticolour(traitChoice(first, "rings")), false);
  assert.equal(isLaser(traitChoice(first, "eyes")), false);
  assert.notEqual(optionId(traitChoice(first, "accessory")), "notarealaccessory");
  const repairs = first.repairs ?? report.repairs ?? [];
  assert.ok(repairs.length > 0, "Invalid playground overrides must expose deterministic repair diagnostics.");
});

test("renderer source and output avoid nondeterministic or font-dependent primitives", async () => {
  const source = await readFile(new URL("../hex-owl.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.sort\s*\(\s*(?:\([^)]*\)|[a-z_$][\w$]*)\s*=>[^\n]*(?:Math\.random|\brandom\s*\()/i,
    "Random comparators make output engine-dependent.");
  assert.doesNotMatch(source, /Math\.(?:sin|cos|tan|asin|acos|atan|atan2)\s*\(/,
    "Runtime trigonometry can change serialized geometry between engines.");
  assert.doesNotMatch(source, /<text\b|font-family|font-size/i, "SVG identity art must not depend on installed fonts.");
  const owl = await renderer();
  for (let index = 0; index < 500; index += 1) {
    const svg = owl.renderSvg(owl.normalizeSeed(`font-free-${index}`), 1);
    assert.doesNotMatch(svg, /<text\b|font-family|font-size/i);
  }
});

test("layer markers follow the versioned order and laser beams start at the exact pupil centres", async () => {
  const owl = await renderer();
  let seed = "";
  let resolved = null;
  for (let index = 0; index < 8000 && !resolved; index += 1) {
    const candidate = owl.normalizeSeed(`forced-laser-${index}`);
    const traits = owl.resolveTraits(candidate, { rarity: "rare", overrides: { eyes: "laser" } }, 1);
    if (isLaser(traitChoice(traits, "eyes"))) {
      seed = candidate;
      resolved = traits;
    }
  }
  assert.ok(resolved, "At least one valid Rare combination must retain a forced laser treatment.");
  const svg = renderResolved(owl, seed, resolved);
  const positions = owl.SPEC.layerOrder.map(layer => {
    const position = svg.indexOf(`data-layer="${layer}"`);
    assert.notEqual(position, -1, `Missing data-layer marker for ${layer}.`);
    return position;
  });
  assert.deepEqual([...plain(positions)].sort((a, b) => a - b), plain(positions), "SVG layers must follow SPEC.layerOrder exactly.");
  const left = svg.match(/M\s*34\.8890[ ,]+52\.4455\s*L/i);
  const right = svg.match(/M\s*65\.1840[ ,]+52\.4455\s*L/i);
  assert.ok(left, "Left laser must begin at the exact left pupil centre (34.8890, 52.4455)." );
  assert.ok(right, "Right laser must begin at the exact right pupil centre (65.1840, 52.4455)." );
  assert.doesNotMatch(svg, /<circle\b[^>]*\bcx="(?:34\.8890|65\.1840)"[^>]*\bcy="52\.4455"/i,
    "Laser treatment must not paste circles over the original pupils.");
  const ringLayer = svg.indexOf('data-layer="portal-rings"');
  const backdropLayer = svg.indexOf('data-layer="owl-backdrop"');
  const owlLayer = svg.indexOf('data-layer="owl-base"');
  const eyeLayer = svg.indexOf('data-layer="eyes"');
  const outerLaserLayer = svg.indexOf('data-layer="laser-outer"');
  const innerLaserLayer = svg.indexOf('data-layer="laser-inner"');
  assert.ok(outerLaserLayer >= 0 && ringLayer > outerLaserLayer && backdropLayer > ringLayer &&
    eyeLayer > backdropLayer && owlLayer > eyeLayer && innerLaserLayer > owlLayer,
  "Eye-well underlays must precede immutable Owl anatomy while split laser beams keep their ring-crossing order.");
});

test("four portal rings share one centre, clear each other, and preserve measured exact-silhouette clearance", async () => {
  const owl = await renderer();
  const svg = owl.renderWithTraits(owl.normalizeSeed("geometry-containment"), { rarity: "common" }, 1);
  const svgAttributes = attributes(svg.match(/^<svg\b[^>]*>/)?.[0] || "");
  const viewBox = String(svgAttributes.viewBox || owl.SPEC.geometry.viewBox || "").trim().split(/[ ,]+/).map(Number);
  assert.deepEqual(viewBox, [0, 0, 100, 100]);
  let tags = [...svg.matchAll(/<polygon\b[^>]*>/g)].map(match => match[0]);
  const ringTagged = tags.filter(tag => /data-(?:ring|portal)/i.test(tag));
  if (ringTagged.length) tags = ringTagged;
  assert.equal(tags.length, 4, "Every Owl must have exactly four portal hexagon rings.");
  const rings = tags.map(polygonFromTag).sort((first, second) => polygonArea(second.points) - polygonArea(first.points));
  const centerValue = owl.SPEC.geometry.center;
  const expectedCenter = Array.isArray(centerValue)
    ? centerValue.map(Number)
    : [Number(centerValue?.x ?? 50), Number(centerValue?.y ?? 50)];
  for (const ring of rings) {
    const center = polygonCenter(ring.points);
    assert.ok(Math.abs(center[0] - expectedCenter[0]) < 1e-7 && Math.abs(center[1] - expectedCenter[1]) < 1e-7,
      `Ring centre ${center.join(",")} must equal ${expectedCenter.join(",")}.`);
    for (const [x, y] of ring.points) {
      assert.ok(x - ring.strokeWidth / 2 >= viewBox[0] - 1e-7);
      assert.ok(y - ring.strokeWidth / 2 >= viewBox[1] - 1e-7);
      assert.ok(x + ring.strokeWidth / 2 <= viewBox[0] + viewBox[2] + 1e-7);
      assert.ok(y + ring.strokeWidth / 2 <= viewBox[1] + viewBox[3] + 1e-7);
    }
  }
  const ringGap = numberField(owl.SPEC.geometry, ["ringGap", "minimumRingGap", "minRingGap"]);
  assert.ok(Number.isFinite(ringGap) && ringGap > 0, "SPEC.geometry must declare a positive minimum ring gap.");
  for (let index = 0; index < rings.length - 1; index += 1) {
    const outer = rings[index];
    const inner = rings[index + 1];
    assert.equal(inner.points.every(point => pointInPolygon(point, outer.points)), true, `Ring ${index + 2} must be wholly inside ring ${index + 1}.`);
    const clearDistance = polygonDistance(outer.points, inner.points) - (outer.strokeWidth + inner.strokeWidth) / 2;
    assert.ok(clearDistance >= ringGap - 1e-6, `Rings ${index + 1}/${index + 2} clear by ${clearDistance}, expected ${ringGap}.`);
  }
  const owlBounds = normalizedBounds(owl.SPEC.geometry.owlBounds ?? owl.SPEC.geometry.transformedOwlBounds);
  assert.ok(owlBounds, "SPEC.geometry must expose the exact transformed Owl bounds.");
  assert.deepEqual(owlBounds, {
    minX: 23.598301,
    minY: 23.641839,
    maxX: 76.408828,
    maxY: 76.36719
  });
  const owlGap = numberField(owl.SPEC.geometry, ["owlGap", "safetyGap", "innerGap"]);
  assert.ok(Number.isFinite(owlGap) && owlGap > 0, "SPEC.geometry must declare the Owl safety gap.");
  assert.equal(owlGap, 1.64207, "The frozen V1 gap must be the measured exact-silhouette clearance, not an AABB approximation.");
  const innermost = rings.at(-1);
  const foregroundPolygon = String(owl.SPEC.geometry.safeZones.innerPortal.points).split(/\s+/).map(pair => pair.split(",").map(Number));
  assert.equal(foregroundPolygon.every(point => pointInPolygon(point, innermost.points)), true,
    "The exact foreground containment polygon must stay inside the rendered inner ring.");
  const safeDefinition = svg.match(/<clipPath id="([^"]+-safe)">([\s\S]*?)<\/clipPath>/);
  assert.ok(safeDefinition, "The renderer must serialize a foreground containment clip path.");
  assert.match(safeDefinition[1], new RegExp(`^hex-owl-${owl.normalizeSeed("geometry-containment").slice(0, 12)}-[0-9a-f]+-safe$`));
  assert.equal(safeDefinition[2], `<polygon points="${owl.SPEC.geometry.safeZones.innerPortal.points}"/>`,
    "The renderer must serialize the frozen exact foreground containment polygon.");
  const asset = await readFile(new URL("../hex-owl-base.svg", import.meta.url), "utf8");
  const suppliedPath = asset.match(/\sd="([^"]+)"/)?.[1];
  assert.equal(svgHash(suppliedPath), "c481e17d177271d177fd341df161a99950a08bcc61f6088cd70c64d886489ac3",
    "Silhouette clearance evidence must stay tied to the exact supplied Owl contour.");
  assert.match(svg, /<use href="#hex-owl-shared-mark"[^>]*transform="translate\(50 50\) scale\(\.0365\) translate\(-724 -723\)"/);
});

test("every added beak shares the natural 60.5116 lower alignment point", async () => {
  const owl = await renderer();
  const beaks = categoryOptions(catalogueValue(owl), "beak");
  const naturalBottom = 60.5116;
  const original = beaks.find(option => rawOptionId(option) === "original-beak");
  assert.deepEqual(plain(original?.bounds), [49.9944, naturalBottom, 49.9944, naturalBottom]);

  const geometry = new Map([
    ["amber-shard", { translate: -4.2384, sourceBottom: 64.75, strokeRadius: 0 }],
    ["moonstone-shard", { translate: -4.2384, sourceBottom: 64.75, strokeRadius: 0 }],
    ["chevron-beak", { translate: -4.2484, sourceBottom: 64.45, strokeRadius: 0.31 }],
    ["chevron-diamond", { translate: -4.0884, sourceBottom: 64.6, strokeRadius: 0 }]
  ]);

  for (const option of beaks.filter(isActive)) {
    const id = rawOptionId(option);
    const expected = geometry.get(id);
    assert.ok(expected, `Missing beak alignment evidence for ${id}.`);
    assert.ok(Math.abs(Number(option.bounds[3]) - naturalBottom) <= 0.00011,
      `${id} catalogue bounds must end at the natural beak point.`);
    const rarity = optionId(option.minRarity) === "uncommon" ? "uncommon" : "common";
    const seed = owl.normalizeSeed(`beak-alignment-${id}`);
    const resolved = owl.resolveTraits(seed, { rarity, overrides: { beak: id } }, 1);
    assert.equal(resolved.beak.id, id);
    const svg = renderResolved(owl, seed, resolved);
    const start = svg.indexOf('data-layer="beak"');
    const end = svg.indexOf('data-layer="accessories"');
    const beakLayer = svg.slice(start, end);
    assert.match(beakLayer, /data-beak-bottom="60\.5116"/);
    assert.match(beakLayer, new RegExp(`transform="translate\\(0 ${expected.translate.toFixed(4)}\\)"`));
    const renderedBottom = expected.sourceBottom + expected.translate + expected.strokeRadius;
    assert.ok(Math.abs(renderedBottom - naturalBottom) < 1e-9, `${id} visual endpoint drifted from ${naturalBottom}.`);
  }
});

test("ordinary negative-space treatments stay inside their declared safe zones", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl);
  const zones = owl.SPEC.geometry.safeZones;
  assert.ok(zones && typeof zones === "object" && Object.keys(zones).length > 0, "Safe zones must be versioned geometry data.");
  assert.equal(zones.eyeFields.preserveNativePupils, true);
  assert.equal(zones.eyeFields.regions.length, 2);
  const viewBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const ranks = new Map([["common", 0], ["uncommon", 1], ["rare", 2], ["legendary", 3], ["camp", 4], ["camponly", 4]]);
  let checked = 0;
  for (const category of ["beak", "marking", "eyes", "accessory"]) {
    for (const option of categoryOptions(catalogue, category)) {
      if (!isActive(option) || option.crossingException === true || option.campOnly === true || ranks.get(optionId(option.minRarity)) >= 4) continue;
      assert.equal(typeof option.safeZone, "string", `${category}.${optionId(option)} must name a safe zone.`);
      const zone = normalizedBounds(zones[option.safeZone]);
      const bounds = normalizedBounds(option.bounds);
      assert.ok(zone, `Unknown safe zone ${option.safeZone} for ${category}.${optionId(option)}.`);
      assert.ok(bounds, `${category}.${optionId(option)} must publish validated bounds.`);
      for (const corner of boundsCorners(bounds)) {
        assert.ok(corner[0] >= zone.minX && corner[0] <= zone.maxX && corner[1] >= zone.minY && corner[1] <= zone.maxY,
          `${category}.${optionId(option)} escapes ${option.safeZone}.`);
        assert.ok(corner[0] >= viewBox.minX && corner[0] <= viewBox.maxX && corner[1] >= viewBox.minY && corner[1] <= viewBox.maxY);
      }
      checked += 1;
    }
  }
  assert.ok(checked >= 9, "Beaks, cheek markings, and eye-well fills need explicit safe-zone coverage.");
});

test("every ordinary catalogue option can be forced, validated, and rendered without changing other API contracts", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl);
  const traitCategory = {
    palette: "face",
    ringMode: "rings",
    ringStyle: "ringStyle",
    direction: "ringDirection",
    brow: "brow",
    eyes: "eyes",
    beak: "beak",
    marking: "marking",
    accessory: "accessory",
    aura: "aura"
  };
  let forced = 0;
  for (const [category, traitName] of Object.entries(traitCategory)) {
    for (const option of categoryOptions(catalogue, traitName)) {
      if (option.campOnly === true || /camp/.test(optionId(option.minRarity))) continue;
      const id = optionId(option);
      const overrideId = rawOptionId(option);
      assert.ok(id, `${category} option needs a stable id.`);
      const minimum = optionId(option.minRarity);
      const rarity = ["common", "uncommon", "rare", "legendary"].includes(minimum) ? minimum : "legendary";
      const seed = owl.normalizeSeed(`forced-${category}-${id}`);
      const resolved = owl.resolveTraits(seed, { rarity, overrides: { [category]: overrideId } }, 1);
      const selected = traitRoot(resolved)?.[category] ?? traitChoice(resolved, traitName);
      assert.equal(optionId(selected), id, `${category}.${id} was unexpectedly repaired away.`);
      const report = owl.validateTraits(resolved);
      assert.equal(validationIsValid(report), true, `${category}.${id}: ${JSON.stringify(validationIssues(report))}`);
      const svg = renderResolved(owl, seed, resolved);
      assert.equal(svg, renderResolved(owl, seed, resolved), `${category}.${id} must serialize byte-identically.`);
      forced += 1;
    }
  }
  assert.ok(forced >= 35, "The public catalogue should expose a substantial stable-ID trait roster.");
});

test("mountBase installs the exact shared path once, mounts all brow subpaths, and retries after failure", async () => {
  const asset = await readFile(new URL("../hex-owl-base.svg", import.meta.url), "utf8");
  const unavailable = await renderer();
  assert.equal(await unavailable.mountBase(), false);

  let fetches = 0;
  const mounted = await renderer({ globalThis: {
    fetch: async () => {
      fetches += 1;
      return { ok: true, status: 200, async text() { return asset; } };
    }
  } });
  const document = fakeMountDocument(asset);
  assert.deepEqual(await Promise.all([mounted.mountBase(document), mounted.mountBase(document)]), [true, true]);
  assert.equal(fetches, 1, "Concurrent mounts must share one base-asset request.");
  assert.equal(await mounted.mountBase(document), true);
  assert.equal(fetches, 1, "An already-mounted sprite must not refetch.");
  const shared = document.getElementById("hex-owl-shared-mark");
  assert.ok(shared);
  assert.equal(shared.getAttribute("fill"), null);
  const suppliedPath = asset.match(/\sd="([^"]+)"/)?.[1];
  assert.equal(shared.getAttribute("d"), suppliedPath);
  assert.equal(svgHash(shared.getAttribute("d")), "c481e17d177271d177fd341df161a99950a08bcc61f6088cd70c64d886489ac3");
  for (const part of ["lower", "middle", "upper", "gem"]) {
    const brow = document.getElementById(`hex-owl-shared-mark-brow-${part}`);
    assert.ok(brow, `Missing exact ${part} brow subpath.`);
    assert.match(brow.getAttribute("d"), /^M\s/);
  }

  let attempts = 0;
  const retrying = await renderer({ globalThis: {
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 503, async text() { return ""; } };
      return { ok: true, status: 200, async text() { return asset; } };
    }
  } });
  const retryDocument = fakeMountDocument(asset);
  assert.equal(await retrying.mountBase(retryDocument), false);
  assert.equal(await retrying.mountBase(retryDocument), true);
  assert.equal(attempts, 2, "A failed mount must clear its cached promise so reconnect can retry.");
});
