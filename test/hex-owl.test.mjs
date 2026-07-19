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

function catalogueValue(owl, version = owl.VERSION) {
  const value = typeof owl.catalogue === "function" ? owl.catalogue(version) : owl.catalogue;
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

function renderResolved(owl, seed, resolved, version = resolved?.version) {
  assert.ok(Number.isSafeInteger(Number(version)), "Resolved traits must identify the renderer version.");
  const svg = owl.renderWithTraits(seed, resolved, Number(version));
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
    this.parentNode = null;
    this.style = { cssText: "" };
  }

  set id(value) { this.setAttribute("id", value); }
  get id() { return this.getAttribute("id") || ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) {
    nodes.forEach(node => { node.parentNode = this; });
    this.children.push(...nodes);
  }
  prepend(...nodes) {
    nodes.forEach(node => { node.parentNode = this; });
    this.children.unshift(...nodes);
  }
  replaceWith(node) {
    const index = this.parentNode?.children.indexOf(this) ?? -1;
    if (index < 0) return;
    node.parentNode = this.parentNode;
    this.parentNode.children.splice(index, 1, node);
    this.parentNode = null;
  }
  querySelectorAll(selector) {
    const results = [];
    const matches = node => selector === 'use[href^="#hex-owl-shared-mark"]'
      && node.tagName === "use"
      && String(node.getAttribute("href") || "").startsWith("#hex-owl-shared-mark");
    const visit = node => node.children.forEach(child => {
      if (matches(child)) results.push(child);
      visit(child);
    });
    visit(this);
    return results;
  }
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
  const document = {
    body,
    documentElement: root,
    defaultView: { DOMParser: FakeDOMParser },
    createElementNS(namespace, tagName) {
      assert.equal(namespace, "http://www.w3.org/2000/svg");
      return new FakeSvgElement(tagName);
    },
    importNode(node, deep) { return node.cloneNode(deep); },
    getElementById(id) { return find(root, id) || null; },
    querySelectorAll(selector) { return root.querySelectorAll(selector); }
  };
  return document;
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
  assert.match(owl.renderSvg(seed, 2), /data-hex-owl-version="2"/);
  assert.throws(() => owl.renderSvg(seed, 3), /Unsupported Hex Owl version/);
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
  const accessoryIds = categoryOptions(catalogueValue(owl, 1), "accessory").map(rawOptionId);
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
  const spec = owl.spec(1);
  const seed = "00112233445566778899aabbccddeeff";
  const traits = owl.selectTraits(seed, 1);
  const svg = owl.renderWithTraits(seed, traits, 1);
  const tags = [...svg.matchAll(/<polygon\b[^>]*\bdata-ring="[^"]+"[^>]*>/g)].map(match => match[0]);
  assert.equal(tags.length, 4);
  const sign = traits.direction.id === "counter-clockwise" ? -1 : 1;
  tags.forEach((tag, index) => {
    const attrs = attributes(tag);
    const ring = spec.geometry.rings[index];
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
  const spec = owl.spec(1);
  const catalogue = catalogueValue(owl, 1);
  const eyeOptions = categoryOptions(catalogue, "eyes");
  assert.deepEqual(plain(eyeOptions.map(rawOptionId)), [
    "original-eyes",
    "festival-eye-wells",
    "electric-eye-wells",
    "pupil-lasers"
  ]);

  const zone = spec.geometry.safeZones.eyeFields;
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
  const spec = owl.spec(1);
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
    assert.ok(svg.includes(`<polygon points="${spec.geometry.safeZones.innerPortal.points}"/>`),
      `${name} must be constrained by the exact inner-portal polygon.`);
  }
});

test("retired sticker-like, pinpoint, face-glow, and accessory traits do not return", async () => {
  const owl = await renderer();
  const legacyCatalogue = JSON.stringify(plain(catalogueValue(owl, 1)));
  assert.doesNotMatch(legacyCatalogue, /LED Totem|Flower Crown|Third Eye|Bandana Dots|Wide Awake|Spiral|Heart/);
  assert.doesNotMatch(legacyCatalogue, /ember-pinpoint|aqua-pinpoint|facial-disc-tint|kandi-arc|double-kandi|integrated-leds/);
  assert.doesNotMatch(legacyCatalogue, /pattern.*(?:halo|pulse|moon)/);
});

test("the dual-version public API keeps V1 frozen and makes V2 current", async () => {
  const owl = await renderer();
  for (const name of ["normalizeSeed", "randomSeed", "selectTraits", "traitNames", "renderSvg", "mountBase", "hydrate",
    "spec", "catalogue", "resolveTraits", "validateTraits", "renderWithTraits"]) {
    assert.equal(typeof owl[name], "function", `HexOwl.${name} must remain public.`);
  }
  assert.equal(owl.VERSION, 2);
  assert.deepEqual(Object.keys(owl.SPECS), ["1", "2"]);
  assert.equal(owl.SPECS[1].id, "hex-owl-v1");
  assert.equal(owl.SPECS[1].version, 1);
  assert.equal(owl.SPECS[1].status, "frozen");
  assert.equal(owl.SPECS[2].id, "hex-owl-v2");
  assert.equal(owl.SPECS[2].version, 2);
  assert.equal(owl.SPECS[2].status, "current");
  assert.equal(owl.SPEC, owl.SPECS[2]);
  assert.equal(owl.spec(), owl.SPECS[2]);
  assert.equal(owl.spec(1), owl.SPECS[1]);
  for (const version of [1, 2]) {
    const spec = owl.spec(version);
    for (const key of ["rarities", "paletteFamilies", "palettes", "geometry", "layerOrder", "catalogue"]) {
      assert.ok(spec[key] != null, `SPECS[${version}].${key} is required.`);
    }
    assert.equal(owl.catalogue(version), spec.catalogue);
    assert.deepEqual(Object.keys(spec.catalogue.categories).sort(),
      ["accessory", "aura", "beak", "brow", "direction", "eyes", "marking", "palette", "ringMode", "ringStyle"].sort());
  }
  assert.equal(owl.catalogue(), owl.SPECS[2].catalogue, "The unversioned catalogue follows current V2.");
  assertDeepFrozen(owl, "HexOwl");
  assertDeepFrozen(owl.SPEC, "HexOwl.SPEC");
  assertDeepFrozen(owl.SPECS, "HexOwl.SPECS");
  assertDeepFrozen(owl.catalogue(1), "HexOwl.catalogue(1)");
  assertDeepFrozen(owl.catalogue(2), "HexOwl.catalogue(2)");

  const seed = "00112233445566778899aabbccddeeff";
  for (const version of [1, 2]) {
    const selected = owl.selectTraits(seed, version);
    const resolved = owl.resolveTraits(seed, {}, version);
    assertDeepFrozen(selected, `selectTraits V${version} result`);
    assertDeepFrozen(resolved, `resolveTraits V${version} result`);
    assert.deepEqual(plain(selected), plain(resolved));
    assert.equal(owl.renderSvg(seed, version), owl.renderWithTraits(seed, resolved, version));
    assert.deepEqual(plain(owl.traitNames(seed, version)), plain(owl.traitNames(seed, version)));
  }
  assert.deepEqual(plain(owl.selectTraits(seed)), plain(owl.selectTraits(seed, 2)));
  assert.equal(owl.renderSvg(seed), owl.renderSvg(seed, 2));
  assert.notEqual(owl.renderSvg(seed, 1), owl.renderSvg(seed, 2));
  assert.throws(() => owl.spec(3), /Unsupported Hex Owl version/i);
  assert.throws(() => owl.resolveTraits(seed, {}, 3), /Unsupported Hex Owl version/i);
  assert.throws(() => owl.renderWithTraits(seed, { version: 3 }, 3), /Unsupported Hex Owl version/i);
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

test("64-seed aggregate SVG fixture freezes the complete V1 renderer", async () => {
  const owl = await renderer();
  const aggregate = Array.from({ length: 64 }, (_, index) =>
    owl.renderSvg(`v1-regression-${index}`, 1)).join("\0");
  assert.equal(svgHash(aggregate), "866426af1aed0eaaddb542a9e15697699a10e8a6f30c35d23ef31fd5c9b0d653");
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
  const rows = rarityRows(owl.spec(1));
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
  const catalogue = catalogueValue(owl, 1);
  for (const row of rarityRows(owl.spec(1))) {
    const budget = numberField(row, ["budget", "densityBudget"]);
    const cap = numberField(row, ["focalCap", "maxFocal", "focalLimit"]);
    for (let index = 0; index < 600; index += 1) {
      const seed = owl.normalizeSeed(`budget-${row.id}-${index}`);
      const resolved = owl.resolveTraits(seed, { rarity: row.id }, 1);
      assert.equal(rarityId(resolved), row.id);
      assert.ok(densityUsed(catalogue, resolved) <= budget, `${row.id} exceeded density budget ${budget}.`);
      assert.ok(focalCount(catalogue, resolved) <= cap, `${row.id} exceeded focal cap ${cap}.`);
      assert.equal(validationIsValid(owl.validateTraits(resolved, 1)), true, `${row.id} should resolve to a valid combination.`);
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
  const catalogue = catalogueValue(owl, 1);
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
  const catalogue = catalogueValue(owl, 1);
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
      const report = owl.validateTraits(resolved, 1);
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
  const report = owl.validateTraits(first, 1);
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
  const spec = owl.spec(1);
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
  const positions = spec.layerOrder.map(layer => {
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
  const spec = owl.spec(1);
  const svg = owl.renderWithTraits(owl.normalizeSeed("geometry-containment"), { rarity: "common" }, 1);
  const svgAttributes = attributes(svg.match(/^<svg\b[^>]*>/)?.[0] || "");
  const viewBox = String(svgAttributes.viewBox || spec.geometry.viewBox || "").trim().split(/[ ,]+/).map(Number);
  assert.deepEqual(viewBox, [0, 0, 100, 100]);
  let tags = [...svg.matchAll(/<polygon\b[^>]*>/g)].map(match => match[0]);
  const ringTagged = tags.filter(tag => /data-(?:ring|portal)/i.test(tag));
  if (ringTagged.length) tags = ringTagged;
  assert.equal(tags.length, 4, "Every Owl must have exactly four portal hexagon rings.");
  const rings = tags.map(polygonFromTag).sort((first, second) => polygonArea(second.points) - polygonArea(first.points));
  const centerValue = spec.geometry.center;
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
  const ringGap = numberField(spec.geometry, ["ringGap", "minimumRingGap", "minRingGap"]);
  assert.ok(Number.isFinite(ringGap) && ringGap > 0, "SPEC.geometry must declare a positive minimum ring gap.");
  for (let index = 0; index < rings.length - 1; index += 1) {
    const outer = rings[index];
    const inner = rings[index + 1];
    assert.equal(inner.points.every(point => pointInPolygon(point, outer.points)), true, `Ring ${index + 2} must be wholly inside ring ${index + 1}.`);
    const clearDistance = polygonDistance(outer.points, inner.points) - (outer.strokeWidth + inner.strokeWidth) / 2;
    assert.ok(clearDistance >= ringGap - 1e-6, `Rings ${index + 1}/${index + 2} clear by ${clearDistance}, expected ${ringGap}.`);
  }
  const owlBounds = normalizedBounds(spec.geometry.owlBounds ?? spec.geometry.transformedOwlBounds);
  assert.ok(owlBounds, "SPEC.geometry must expose the exact transformed Owl bounds.");
  assert.deepEqual(owlBounds, {
    minX: 23.598301,
    minY: 23.641839,
    maxX: 76.408828,
    maxY: 76.36719
  });
  const owlGap = numberField(spec.geometry, ["owlGap", "safetyGap", "innerGap"]);
  assert.ok(Number.isFinite(owlGap) && owlGap > 0, "SPEC.geometry must declare the Owl safety gap.");
  assert.equal(owlGap, 1.64207, "The frozen V1 gap must be the measured exact-silhouette clearance, not an AABB approximation.");
  const innermost = rings.at(-1);
  const foregroundPolygon = String(spec.geometry.safeZones.innerPortal.points).split(/\s+/).map(pair => pair.split(",").map(Number));
  assert.equal(foregroundPolygon.every(point => pointInPolygon(point, innermost.points)), true,
    "The exact foreground containment polygon must stay inside the rendered inner ring.");
  const safeDefinition = svg.match(/<clipPath id="([^"]+-safe)">([\s\S]*?)<\/clipPath>/);
  assert.ok(safeDefinition, "The renderer must serialize a foreground containment clip path.");
  assert.match(safeDefinition[1], new RegExp(`^hex-owl-${owl.normalizeSeed("geometry-containment").slice(0, 12)}-[0-9a-f]+-safe$`));
  assert.equal(safeDefinition[2], `<polygon points="${spec.geometry.safeZones.innerPortal.points}"/>`,
    "The renderer must serialize the frozen exact foreground containment polygon.");
  const asset = await readFile(new URL("../hex-owl-base.svg", import.meta.url), "utf8");
  const suppliedPath = asset.match(/\sd="([^"]+)"/)?.[1];
  assert.equal(svgHash(suppliedPath), "c481e17d177271d177fd341df161a99950a08bcc61f6088cd70c64d886489ac3",
    "Silhouette clearance evidence must stay tied to the exact supplied Owl contour.");
  assert.match(svg, /<use href="#hex-owl-shared-mark"[^>]*transform="translate\(50 50\) scale\(\.0365\) translate\(-724 -723\)"/);
});

test("every added beak shares the natural 60.5116 lower alignment point", async () => {
  const owl = await renderer();
  const beaks = categoryOptions(catalogueValue(owl, 1), "beak");
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
  const catalogue = catalogueValue(owl, 1);
  const zones = owl.spec(1).geometry.safeZones;
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
  const catalogue = catalogueValue(owl, 1);
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
      const report = owl.validateTraits(resolved, 1);
      assert.equal(validationIsValid(report), true, `${category}.${id}: ${JSON.stringify(validationIssues(report))}`);
      const svg = renderResolved(owl, seed, resolved);
      assert.equal(svg, renderResolved(owl, seed, resolved), `${category}.${id} must serialize byte-identically.`);
      forced += 1;
    }
  }
  assert.ok(forced >= 35, "The public catalogue should expose a substantial stable-ID trait roster.");
});

test("V2 exposes the exact rarity and trait tables from the handoff", async () => {
  const owl = await renderer();
  const spec = owl.spec(2);
  const catalogue = catalogueValue(owl, 2);
  const rows = (category, fields) => categoryOptions(catalogue, category).map(option => [
    rawOptionId(option),
    optionLabel(option),
    ...fields.map(field => field === "hero" || field === "focal" || field === "multicolor"
      ? Boolean(option[field])
      : option[field])
  ]);

  assert.deepEqual(plain(spec.rarities.map(rarity => [
    rarity.id, rarity.name, rarity.weight, rarity.budget, rarity.focalCap,
    rarity.level, rarity.supportCap, rarity.treatmentCap
  ])), [
    ["common", "Common", 50, 3, 0, 0, 3, 3],
    ["rare", "Rare", 30, 7, 1, 1, 2, 3],
    ["legendary", "Legendary", 20, 9, 1, 2, 1, 3]
  ]);
  assert.deepEqual(plain(spec.rarityWeights), { common: 50, rare: 30, legendary: 20 });
  assert.deepEqual(plain(spec.budgets), { common: 3, rare: 7, legendary: 9 });

  assert.deepEqual(plain(rows("rings", ["weight", "cost", "minRarity", "hero", "multicolor"])), [
    ["single", "Coordinated Single Colour", 100, 0, "common", false, false],
    ["festival-prism", "Palette-linked Festival Prism", 0, 2, "legendary", false, true]
  ]);
  assert.deepEqual(plain(rows("ringStyle", ["weight", "cost", "minRarity", "widthFactor", "dash", "linecap"])), [
    ["solid", "Solid Portal", 28, 0, "common", 1, "", "round"],
    ["fine", "Fine Lines", 16, 1, "common", 0.56, "", "round"],
    ["beat-dash", "Beat Dash", 22, 1, "common", 0.72, "2.20 1.10", "round"],
    ["dotted", "Dotted Signal", 14, 1, "common", 0.72, "0.01 2.10", "round"],
    ["double-line", "Double Line", 10, 2, "common", 0.96, "", "round"],
    ["comet-dash", "Comet Dash", 10, 1, "common", 0.72, "3.60 1.20 0.70 1.20", "round"]
  ]);
  assert.deepEqual(plain(categoryOptions(catalogue, "ringStyle")
    .find(option => rawOptionId(option) === "double-line")?.excludes), ["festival-prism"]);
  assert.deepEqual(plain(rows("ringDirection", ["weight", "cost", "minRarity"])), [
    ["clockwise", "Clockwise", 50, 0, "common"],
    ["counter-clockwise", "Counter-clockwise", 50, 0, "common"]
  ]);

  assert.deepEqual(plain(rows("brow", ["weight", "cost", "minRarity", "focal", "hero"])), [
    ["original-crown", "Original Crown", 1, 0, "common", false, false],
    ["crown-gem", "Top-ridge Gem", 20, 1, "common", false, false],
    ["brow-echo", "Brow Echo", 18, 1, "common", false, false],
    ["brow-tint", "Festival Brow Tint", 16, 1, "common", false, false],
    ["moonstone-crest", "Moonstone Crest", 14, 2, "common", false, false],
    ["twin-gems", "Twin Gems", 14, 1, "common", false, false],
    ["dusk-fade", "Dusk Fade Crown", 14, 1, "common", false, false],
    ["third-eye", "Third Eye", 12, 1, "rare", false, false],
    ["three-band-prism", "Three-band Prism", 0, 2, "rare", true, true]
  ]);
  assert.deepEqual(plain(rows("eyes", ["weight", "cost", "minRarity", "focal", "hero"])), [
    ["original-eyes", "Original Shambhala", 26, 0, "common", false, false],
    ["festival-eye-wells", "Festival Eye Wells", 22, 1, "common", false, false],
    ["electric-eye-wells", "Electric Eye Wells", 20, 1, "common", false, false],
    ["midnight-eye-wells", "Midnight Eye Wells", 18, 1, "common", false, false],
    ["sleepy-lids", "Sleepy Lids", 14, 1, "common", false, false],
    ["heterochroma-wells", "Heterochroma Wells", 8, 2, "rare", false, false],
    ["pupil-lasers", "Pupil Lasers", 0, 3, "rare", true, true],
    ["radiant-gaze", "Radiant Gaze", 0, 3, "rare", true, true]
  ]);
  assert.deepEqual(plain(rows("beak", ["weight", "cost", "minRarity"])), [
    ["original-beak", "Original Mark", 1, 0, "common"],
    ["amber-shard", "Amber Shard", 28, 1, "common"],
    ["moonstone-facet", "Moonstone Facet", 24, 1, "common"],
    ["bold-chevron", "Bold Chevron", 30, 1, "common"],
    ["ember-tip", "Ember Tip", 18, 1, "common"]
  ]);
  assert.deepEqual(plain(rows("marking", ["weight", "cost", "minRarity"])), [
    ["clean-face", "Clean Face", 1, 0, "common"],
    ["moon-freckles", "Moon Freckles", 22, 1, "common"],
    ["ember-comet", "Ember Comet", 20, 1, "common"],
    ["diamond-dust", "Diamond Dust", 20, 1, "common"],
    ["festival-stripes", "Festival Stripes", 16, 1, "common"],
    ["hex-studs", "Hex Studs", 12, 1, "common"],
    ["cheek-crescents", "Cheek Crescents", 10, 1, "common"]
  ]);
  assert.deepEqual(plain(rows("accessory", ["weight", "cost", "minRarity"])), [
    ["no-accessory", "None", 1, 0, "common"]
  ]);
  assert.deepEqual(plain(rows("aura", ["weight", "cost", "minRarity", "focal", "hero"])), [
    ["quiet-aura", "Quiet", 1, 0, "common", false, false],
    ["radial-glow", "Portal Halo", 24, 2, "rare", true, true],
    ["portal-rays", "Restrained Portal Rays", 22, 2, "rare", true, true],
    ["sound-waves", "Sound Waves", 20, 2, "rare", true, true],
    ["stardust", "Stardust", 18, 2, "rare", true, true],
    ["shooting-star", "Shooting Star", 16, 2, "rare", true, true]
  ]);
  assert.deepEqual(plain(categoryOptions(catalogue, "aura")
    .find(option => rawOptionId(option) === "sound-waves")?.bounds), [1, 6, 99, 94],
    "Sound Waves metadata must contain the outer radius-48.5 arcs and stroke.");

  assert.deepEqual(plain(spec.geometry.safeZones.eyeFields.bounds), [30, 49.8, 70, 58.5]);
  assert.deepEqual(plain(spec.geometry.safeZones.eyeFields.regions), [[30, 49.8, 41, 58.5], [59, 49.8, 70, 58.5]]);
  assert.deepEqual(plain(spec.geometry.safeZones.cheeks.bounds), [36.2, 62.2, 63.8, 69]);
});

test("Blacklight remains catalogue-only and Vortex Echo remains parked in V2", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl, 2);
  const palettes = categoryOptions(catalogue, "face");
  const blacklight = palettes.find(option => rawOptionId(option) === "blacklight");
  assert.ok(blacklight);
  assert.equal(blacklight.name, "Blacklight");
  assert.equal(blacklight.campOnly, true);
  assert.equal(blacklight.enabled, false);
  assert.equal(blacklight.weight, 0);
  assert.deepEqual(plain(blacklight.tokens), {
    face: "#29e07d",
    shadow: "#0a5c33",
    highlight: "#eafff2",
    focal: "#c8ff3d",
    ring: "#35f58c",
    beam: "#52ffa1"
  });
  assert.deepEqual(plain(palettes.filter(option => option.enabled !== false && !option.campOnly).map(rawOptionId)),
    plain(categoryOptions(catalogueValue(owl, 1), "face").map(rawOptionId)),
    "V2 must preserve every live V1 public palette while keeping Blacklight disabled.");
  assert.doesNotMatch(JSON.stringify(plain(catalogue)), /vortex-echo|Vortex Echo/i);

  const forced = owl.resolveTraits("blacklight-cannot-be-forced", {
    rarity: "common",
    overrides: { palette: "blacklight" }
  }, 2);
  assert.notEqual(forced.palette.id, "blacklight");
  assert.ok(forced.repairs.some(message => /camp provenance/i.test(message)));
  for (let index = 0; index < 4000; index += 1) {
    const resolved = owl.selectTraits(`v2-public-palette-${index}`, 2);
    assert.notEqual(resolved.palette.id, "blacklight");
    assert.doesNotMatch(owl.renderWithTraits(resolved.seed, resolved, 2), /vortex/i);
  }
});

test("V2 eye wells use exact ellipses, approved tokens, lids, rims, and radiant gradients", async () => {
  const owl = await renderer();
  const renderEyes = (id, rarity = "common") => {
    const overrides = { palette: "amp-daylight", eyes: id };
    if (rarity === "rare" && id === "heterochroma-wells") overrides.aura = "radial-glow";
    const seed = `v2-eye-art-${id}`;
    const resolved = owl.resolveTraits(seed, { rarity, overrides }, 2);
    assert.equal(resolved.eyes.id, id);
    assert.equal(validationIsValid(owl.validateTraits(resolved, 2)), true);
    const svg = owl.renderWithTraits(seed, resolved, 2);
    const start = svg.indexOf(`data-layer="eyes"`);
    const end = svg.indexOf(`data-layer="owl-base"`);
    assert.ok(start >= 0 && end > start);
    return { resolved, svg, layer: svg.slice(start, end) };
  };
  const baseWell = (cx, fill) => `<ellipse cx="${cx}" cy="54.15" rx="5.5" ry="4.35" fill="${fill}"/>`;

  const festival = renderEyes("festival-eye-wells");
  assert.ok(festival.layer.includes(baseWell("35.5", festival.resolved.palette.tokens.focal)));
  assert.ok(festival.layer.includes(baseWell("64.5", festival.resolved.palette.tokens.focal)));

  const electric = renderEyes("electric-eye-wells");
  assert.ok(electric.layer.includes(baseWell("35.5", electric.resolved.palette.tokens.highlight)));
  assert.ok(electric.layer.includes(baseWell("64.5", electric.resolved.palette.tokens.highlight)));
  assert.equal(electric.layer.includes(electric.resolved.palette.tokens.beam), false,
    "Electric wells must use highlight, never the same-hue beam token.");

  const midnight = renderEyes("midnight-eye-wells");
  assert.ok(midnight.layer.includes(baseWell("35.5", midnight.resolved.palette.tokens.shadow)));
  assert.ok(midnight.layer.includes(baseWell("64.5", midnight.resolved.palette.tokens.shadow)));
  assert.match(midnight.layer, new RegExp(`<g fill="none" stroke="${midnight.resolved.palette.tokens.highlight}" stroke-width="\\.5">`));
  assert.match(midnight.layer, /<ellipse cx="35\.5" cy="54\.15" rx="5\.1" ry="3\.95"\/><ellipse cx="64\.5" cy="54\.15" rx="5\.1" ry="3\.95"\/>/);

  const sleepy = renderEyes("sleepy-lids");
  assert.ok(sleepy.layer.includes(baseWell("35.5", sleepy.resolved.palette.tokens.focal)));
  assert.ok(sleepy.layer.includes(baseWell("64.5", sleepy.resolved.palette.tokens.focal)));
  assert.ok(sleepy.layer.includes('<path d="M30.27 52.8 A5.5 4.35 0 0 1 40.73 52.8 Z M59.27 52.8 A5.5 4.35 0 0 1 69.73 52.8 Z" ' +
    `fill="${sleepy.resolved.palette.tokens.shadow}"/>`));

  const heterochroma = renderEyes("heterochroma-wells", "rare");
  assert.ok(heterochroma.layer.includes(baseWell("35.5", heterochroma.resolved.palette.tokens.focal)));
  assert.ok(heterochroma.layer.includes(baseWell("64.5", heterochroma.resolved.palette.tokens.highlight)));

  const radiant = renderEyes("radiant-gaze", "rare");
  const gradientIds = [...radiant.svg.matchAll(/<radialGradient id="([^"]+-gaze-(?:left|right))">([\s\S]*?)<\/radialGradient>/g)];
  assert.equal(gradientIds.length, 2);
  for (const [, id, stops] of gradientIds) {
    assert.equal(stops,
      `<stop offset="0" stop-color="${radiant.resolved.palette.tokens.highlight}"/>` +
      `<stop offset=".45" stop-color="${radiant.resolved.palette.tokens.focal}"/>` +
      `<stop offset="1" stop-color="${radiant.resolved.palette.tokens.focal}" stop-opacity=".12"/>`);
    assert.ok(radiant.layer.includes(`fill="url(#${id})"`));
  }

  for (const sample of [festival, electric, midnight, sleepy, heterochroma, radiant]) {
    assert.doesNotMatch(sample.layer, /<rect\b/, "V2 wells must never flood the rectangular V1 eye field.");
    assert.doesNotMatch(sample.layer, /<circle\b[^>]*cx="(?:34\.8890|65\.1840)"/,
      "The supplied Owl's native pupils remain the only pupil anatomy.");
  }
});

test("V2 serializes the exact approved ring, brow, beak, marking, and aura art", async () => {
  const owl = await renderer();
  const renderTrait = (category, id, rarity = "common", companion = {}) => {
    const overrides = { palette: "amp-daylight", ...companion, [category]: id };
    if (rarity !== "common" && !Object.values(overrides).some(value => [
      "three-band-prism", "pupil-lasers", "radiant-gaze", "radial-glow", "portal-rays",
      "sound-waves", "stardust", "shooting-star"
    ].includes(value))) overrides.aura = "radial-glow";
    const seed = `v2-art-${category}-${id}`;
    const resolved = owl.resolveTraits(seed, { rarity, overrides }, 2);
    assert.equal(resolved.selectionIds[category], id, `${category}.${id} must stay forced.`);
    assert.equal(validationIsValid(owl.validateTraits(resolved, 2)), true);
    return { resolved, svg: owl.renderWithTraits(seed, resolved, 2) };
  };
  const between = (svg, startLayer, endLayer) => {
    const start = svg.indexOf(`data-layer="${startLayer}"`);
    const end = svg.indexOf(`data-layer="${endLayer}"`);
    assert.ok(start >= 0 && end > start, `${startLayer} must precede ${endLayer}.`);
    return svg.slice(start, end);
  };

  const cometDash = renderTrait("ringStyle", "comet-dash");
  const cometRings = between(cometDash.svg, "portal-rings", "owl-backdrop");
  assert.equal((cometRings.match(/stroke-dasharray="3\.60 1\.20 0\.70 1\.20"/g) || []).length, 4);

  const browEcho = renderTrait("brow", "brow-echo");
  const echoLayer = between(browEcho.svg, "brows", "facial-details");
  assert.match(echoLayer, new RegExp(`brow-lower" fill="${browEcho.resolved.palette.tokens.shadow}" opacity="1"`));
  assert.match(echoLayer, new RegExp(`brow-upper" fill="${browEcho.resolved.palette.tokens.highlight}" opacity="\\.94"`));

  const paleCrest = renderTrait("brow", "moonstone-crest", "common", { palette: "gold-daylight" });
  const crestLayer = between(paleCrest.svg, "brows", "facial-details");
  assert.match(crestLayer, new RegExp(`brow-upper" fill="${paleCrest.resolved.palette.tokens.shadow}"`));
  assert.match(crestLayer, /brow-gem" fill="#fefdf0"/);

  const twinGems = renderTrait("brow", "twin-gems");
  assert.ok(between(twinGems.svg, "brows", "facial-details").includes(
    `<path d="M31 42.9 L32.15 44.05 L31 45.2 L29.85 44.05 Z"/><path d="M69 42.9 L70.15 44.05 L69 45.2 L67.85 44.05 Z"/>`));
  const duskFade = renderTrait("brow", "dusk-fade");
  const duskLayer = between(duskFade.svg, "brows", "facial-details");
  assert.match(duskLayer, new RegExp(`brow-upper" fill="${duskFade.resolved.palette.tokens.highlight}" opacity="1"`));
  assert.match(duskLayer, new RegExp(`brow-lower" fill="${duskFade.resolved.palette.tokens.shadow}" opacity="\\.85"`));
  const thirdEye = renderTrait("brow", "third-eye", "rare");
  const thirdEyeLayer = between(thirdEye.svg, "brows", "facial-details");
  assert.match(thirdEyeLayer, /<polygon points="50\.00,44\.70 48\.35,45\.65 48\.35,47\.55 50\.00,48\.50 51\.65,47\.55 51\.65,45\.65" fill="none"/);
  assert.match(thirdEyeLayer, /<circle cx="50" cy="46\.6" r="\.6"/);

  const amber = renderTrait("beak", "amber-shard");
  assert.match(between(amber.svg, "beak", "accessories"), /M48\.8 60\.55L50 64\.75l1\.2-4\.2L50 59\.85z" fill="#ffce58"/);
  const moonstone = renderTrait("beak", "moonstone-facet");
  const moonstoneLayer = between(moonstone.svg, "beak", "accessories");
  assert.ok(moonstoneLayer.includes('<path d="M48.6 61.1 L50 60.2 L51.4 61.1 L50 64.75 z"'));
  assert.ok(moonstoneLayer.includes('<path d="M48.6 61.1 L51.4 61.1 M50 60.2 v.9"'));
  const chevron = renderTrait("beak", "bold-chevron");
  assert.ok(between(chevron.svg, "beak", "accessories").includes(
    '<path d="M48.7 60.5 L50 61.7 L51.3 60.5 M48.95 62.4 L50 64.5 L51.05 62.4" fill="none"'));
  const emberTip = renderTrait("beak", "ember-tip");
  const emberTipLayer = between(emberTip.svg, "beak", "accessories");
  assert.match(emberTipLayer, /<path d="M50 60\.1 v1\.6"[^>]*stroke-width="\.5"/);
  assert.match(emberTipLayer, /<circle cx="50" cy="63\.35" r="1\.35"[^>]*opacity="\.28"/);
  assert.match(emberTipLayer, /<circle cx="50" cy="63\.35" r="\.85"/);

  const freckles = renderTrait("marking", "moon-freckles");
  assert.match(between(freckles.svg, "facial-details", "beak"), /r="\.78"[\s\S]*r="\.66"[\s\S]*r="\.54"/);
  const emberComet = renderTrait("marking", "ember-comet");
  assert.match(between(emberComet.svg, "facial-details", "beak"), /cx="38\.6" cy="63\.7" r="\.8"[\s\S]*cx="61\.4" cy="63\.7" r="\.8"/);
  const stripes = renderTrait("marking", "festival-stripes");
  const stripesLayer = between(stripes.svg, "facial-details", "beak");
  assert.match(stripesLayer, /M36\.6 62\.9 l4\.8 \.9 M63\.4 62\.9 l-4\.8 \.9/);
  assert.match(stripesLayer, /M36\.9 64\.7 l4\.6 \.85 M63\.1 64\.7 l-4\.6 \.85/);
  assert.match(stripesLayer, /M37\.2 66\.5 l4\.4 \.8 M62\.8 66\.5 l-4\.4 \.8/);
  const studs = renderTrait("marking", "hex-studs");
  const studLayer = between(studs.svg, "facial-details", "beak");
  assert.match(studLayer, /39\.80,64\.15 38\.89,64\.67 38\.89,65\.73 39\.80,66\.25 40\.71,65\.73 40\.71,64\.67/);
  assert.match(studLayer, /60\.20,64\.15 59\.29,64\.67 59\.29,65\.73 60\.20,66\.25 61\.11,65\.73 61\.11,64\.67/);
  const crescents = renderTrait("marking", "cheek-crescents");
  assert.match(between(crescents.svg, "facial-details", "beak"), /M37\.4 63\.8 q2\.4 2\.0 4\.8 0 M57\.8 63\.8 q2\.4 2\.0 4\.8 0/);

  const halo = renderTrait("aura", "radial-glow", "rare");
  assert.match(halo.svg, /<stop offset="0"[^>]*stop-opacity="0"\/><stop offset="\.52"[^>]*stop-opacity="0"\/><stop offset="\.70"[^>]*stop-opacity="\.50"\/><stop offset="\.85"[^>]*stop-opacity="\.62"\/><stop offset="1"[^>]*stop-opacity="0"\/>/);
  assert.match(between(halo.svg, "aura", "laser-outer"), /<circle cx="50" cy="50" r="47" fill="url\(#[^"]+-glow\)"\/>/);
  const waves = renderTrait("aura", "sound-waves", "rare");
  const waveLayer = between(waves.svg, "aura", "laser-outer");
  assert.match(waveLayer, /M88\.51 67\.98 A42\.5 42\.5 0 0 0 88\.51 32\.02 M11\.49 67\.98 A42\.5 42\.5 0 0 1 11\.49 32\.02/);
  assert.match(waveLayer, /stroke-width="1"[^>]*opacity="1"[\s\S]*stroke-width="0\.8"[^>]*opacity="0\.65"[\s\S]*stroke-width="0\.6"[^>]*opacity="0\.38"/);
  const shootingStar = renderTrait("aura", "shooting-star", "rare");
  const starLayer = between(shootingStar.svg, "aura", "laser-outer");
  assert.match(starLayer, /<path d="M68 24 L87 9"[^>]*stroke-width="3" opacity="\.2"/);
  assert.match(starLayer, /<path d="M68 24 L87 9"[^>]*stroke-width="1\.1"/);
  assert.match(starLayer, /<circle cx="87" cy="9" r="2\.6"[^>]*opacity="\.3"/);
  assert.match(starLayer, /M13 76l\.95 2\.2 2\.2\.95-2\.2\.95L13 83l-.95-2\.2-2\.2-.95 2\.2-.95z/);
});

test("V2 ordinary rarity rolls follow 50/30/20 over ten thousand seeds", async () => {
  const owl = await renderer();
  const expected = new Map([["common", 0.50], ["rare", 0.30], ["legendary", 0.20]]);
  const counts = Object.fromEntries([...expected.keys()].map(id => [id, 0]));
  const samples = 10000;
  for (let index = 0; index < samples; index += 1) {
    const resolved = owl.selectTraits(`v2-rarity-distribution-${index}`, 2);
    assert.ok(Object.hasOwn(counts, resolved.rarity.id), `Unexpected V2 rarity ${resolved.rarity.id}.`);
    assert.notEqual(resolved.palette.id, "blacklight");
    counts[resolved.rarity.id] += 1;
  }
  for (const [id, target] of expected) {
    const actual = counts[id] / samples;
    assert.ok(Math.abs(actual - target) <= 0.02,
      `${id} was ${(actual * 100).toFixed(2)}%, expected ${(target * 100).toFixed(0)}% ±2%.`);
  }
});

test("V2 enforces exact hero grammar plus support and treatment caps", async () => {
  const owl = await renderer();
  const rows = new Map(owl.spec(2).rarities.map(row => [row.id, row]));
  const supportKeys = ["ringStyle", "brow", "eyes", "beak", "marking"];
  for (const rarity of ["common", "rare", "legendary"]) {
    const row = rows.get(rarity);
    for (let index = 0; index < 1500; index += 1) {
      const seed = `v2-composition-${rarity}-${index}`;
      const resolved = owl.resolveTraits(seed, { rarity }, 2);
      const chosen = [resolved.ringMode, resolved.ringStyle, resolved.direction, resolved.brow,
        resolved.eyes, resolved.beak, resolved.marking, resolved.accessory, resolved.aura];
      const heroes = chosen.filter(option => option.hero === true).length;
      const supports = supportKeys.filter(category => {
        const option = resolved[category];
        return Number(option.cost || 0) > 0 && option.hero !== true;
      }).length;
      const treatments = Number(resolved.ringMode.cost || 0) > 0 ? 1 + heroes + supports : heroes + supports;

      assert.equal(resolved.rarity.id, rarity);
      assert.equal(heroes, rarity === "common" ? 0 : 1, `${rarity} must have the exact hero count.`);
      assert.equal(resolved.heroCount, heroes);
      assert.equal(resolved.supportCount, supports);
      assert.equal(resolved.treatmentCount, treatments);
      assert.ok(resolved.cost <= row.budget, `${rarity} exceeded budget ${row.budget}.`);
      assert.ok(supports <= row.supportCap, `${rarity} exceeded support cap ${row.supportCap}.`);
      assert.ok(treatments <= row.treatmentCap, `${rarity} exceeded treatment cap ${row.treatmentCap}.`);
      assert.equal(resolved.ringMode.id === "festival-prism", rarity === "legendary");
      assert.equal(validationIsValid(owl.validateTraits(resolved, 2)), true,
        `${rarity}: ${JSON.stringify(validationIssues(owl.validateTraits(resolved, 2)))}`);
    }
  }
});

test("V2 hero and aura selections track their exact configured weights", async () => {
  const owl = await renderer();
  const expectedHeroes = new Map([
    ["three-band-prism", 0.35],
    ["pupil-lasers", 0.15],
    ["radiant-gaze", 0.15],
    ["aura", 0.35]
  ]);
  const expectedAuras = new Map([
    ["radial-glow", 0.24],
    ["portal-rays", 0.22],
    ["sound-waves", 0.20],
    ["stardust", 0.18],
    ["shooting-star", 0.16]
  ]);
  const samples = 12000;
  for (const rarity of ["rare", "legendary"]) {
    const heroes = Object.fromEntries([...expectedHeroes.keys()].map(id => [id, 0]));
    const auras = Object.fromEntries([...expectedAuras.keys()].map(id => [id, 0]));
    let auraTotal = 0;
    for (let index = 0; index < samples; index += 1) {
      const resolved = owl.resolveTraits(`v2-hero-weight-${rarity}-${index}`, { rarity }, 2);
      let hero = "";
      if (resolved.brow.hero) hero = resolved.brow.id;
      if (resolved.eyes.hero) hero = resolved.eyes.id;
      if (resolved.aura.hero) hero = "aura";
      assert.ok(Object.hasOwn(heroes, hero), `${rarity} produced unknown hero ${hero}.`);
      heroes[hero] += 1;
      if (hero === "aura") {
        assert.ok(Object.hasOwn(auras, resolved.aura.id), `Unknown aura hero ${resolved.aura.id}.`);
        auras[resolved.aura.id] += 1;
        auraTotal += 1;
      }
    }
    for (const [id, target] of expectedHeroes) {
      const actual = heroes[id] / samples;
      assert.ok(Math.abs(actual - target) <= 0.03,
        `${rarity}.${id} was ${(actual * 100).toFixed(2)}%, expected ${(target * 100).toFixed(0)}% ±3%.`);
    }
    for (const [id, target] of expectedAuras) {
      const actual = auras[id] / auraTotal;
      assert.ok(Math.abs(actual - target) <= 0.04,
        `${rarity}.${id} aura share was ${(actual * 100).toFixed(2)}%, expected ${(target * 100).toFixed(0)}% ±4%.`);
    }
  }
});

test("V2 reaches all 24 deterministic prism permutations with coherent brow and ring colours", async () => {
  const owl = await renderer();
  const second = await renderer();
  const permute = values => values.length === 1
    ? [values]
    : values.flatMap((value, index) => permute(values.filter((_, at) => at !== index))
      .map(tail => [value, ...tail]));
  const permutations = permute(["highlight", "beam", "focal", "ring"]);
  assert.equal(permutations.length, 24);
  const seen = new Set();
  const browParts = ["upper", "lower", "middle", "gem"];

  for (let index = 0; index < 12000 && seen.size < 24; index += 1) {
    const seed = `v2-prism-permutation-${index}`;
    const options = {
      rarity: "legendary",
      overrides: { palette: "amp-daylight", brow: "three-band-prism", ringStyle: "solid" }
    };
    const resolved = owl.resolveTraits(seed, options, 2);
    const repeated = second.resolveTraits(seed, options, 2);
    assert.equal(resolved.ringMode.id, "festival-prism");
    assert.equal(resolved.brow.id, "three-band-prism");
    assert.deepEqual(plain(resolved.prismOrder), permutations[resolved.prismPermutation]);
    assert.deepEqual(plain(repeated.prismOrder), plain(resolved.prismOrder));
    assert.equal(repeated.prismPermutation, resolved.prismPermutation);
    const colours = resolved.prismOrder.map(token => resolved.palette.tokens[token]);
    assert.deepEqual(plain(resolved.rings.colors), plain(colours));

    if (seen.has(resolved.prismPermutation)) continue;
    seen.add(resolved.prismPermutation);
    const svg = owl.renderWithTraits(seed, resolved, 2);
    assert.match(svg, new RegExp(`data-prism-permutation="${resolved.prismPermutation}"`));
    const ringLayer = svg.slice(svg.indexOf('data-layer="portal-rings"'), svg.indexOf('data-layer="owl-backdrop"'));
    const ringColours = [...ringLayer.matchAll(/<polygon data-ring="[^"]+"[^>]* stroke="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ringColours, plain(colours));
    const browLayer = svg.slice(svg.indexOf('data-layer="brows"'), svg.indexOf('data-layer="facial-details"'));
    browParts.forEach((part, at) => {
      assert.match(browLayer, new RegExp(`brow-${part}" fill="${colours[at]}"`),
        `Permutation ${resolved.prismPermutation} must map ${resolved.prismOrder[at]} coherently to brow-${part}.`);
    });
    assert.equal(svg, second.renderWithTraits(seed, repeated, 2));
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 24 }, (_, index) => index));
});

test("every enabled V2 catalogue option can be forced, validated, and rendered deterministically", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl, 2);
  const categories = ["palette", "ringMode", "ringStyle", "direction", "brow", "eyes", "beak", "marking", "accessory", "aura"];
  let forced = 0;
  let expected = 0;
  for (const category of categories) {
    for (const option of categoryOptions(catalogue, category)) {
      if (option.enabled === false || option.campOnly === true) continue;
      expected += 1;
      const id = rawOptionId(option);
      const minimum = rawOptionId(option.minRarity);
      const rarity = minimum === "legendary" ? "legendary" : (minimum === "rare" || option.hero === true ? "rare" : "common");
      const overrides = { [category]: id };
      if (rarity !== "common" && option.hero !== true) overrides.aura = "radial-glow";
      const seed = `v2-force-${category}-${id}`;
      const resolved = owl.resolveTraits(seed, { rarity, overrides }, 2);
      assert.equal(resolved.selectionIds[category], id, `${category}.${id} was repaired away.`);
      const report = owl.validateTraits(resolved, 2);
      assert.equal(validationIsValid(report), true,
        `${category}.${id}: ${JSON.stringify(validationIssues(report))}`);
      const first = owl.renderWithTraits(seed, resolved, 2);
      const second = owl.renderWithTraits(seed, resolved, 2);
      assert.match(first, /^<svg\b[^>]*data-hex-owl-version="2"/);
      assert.equal(first, second, `${category}.${id} must serialize byte-identically.`);
      forced += 1;
    }
  }
  assert.equal(forced, expected);
  assert.ok(forced >= 80, `Expected the complete V2 public catalogue, forced only ${forced} options.`);
});

test("camp freestyle keeps every enabled V2 choice without rarity, weight, or grammar repairs", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl, 2);
  const categories = ["palette", "ringMode", "ringStyle", "direction", "brow", "eyes", "beak", "marking", "accessory", "aura"];
  let forced = 0;
  for (const category of categories) {
    for (const option of categoryOptions(catalogue, category)) {
      if (option.enabled === false) continue;
      const id = rawOptionId(option);
      const resolved = owl.resolveTraits(`freestyle-${category}-${id}`, {
        rarity: "common",
        overrides: { [category]: id },
        freestyle: true
      }, 2);
      assert.equal(resolved.selectionIds[category], id, `${category}.${id} must remain selected in freestyle mode.`);
      assert.equal(resolved.freestyle, true);
      assert.deepEqual(plain(resolved.repairs), []);
      assert.equal(validationIsValid(owl.validateTraits(resolved, 2)), true);
      assert.equal(owl.renderWithTraits(resolved.seed, resolved, 2), owl.renderWithTraits(resolved.seed, resolved, 2));
      forced += 1;
    }
  }
  assert.ok(forced >= 80, `Expected freestyle coverage for the complete enabled catalogue, forced only ${forced} options.`);
});

test("camp freestyle also keeps every enabled choice on recorded V1 Owls", async () => {
  const owl = await renderer();
  const catalogue = catalogueValue(owl, 1);
  const categories = ["palette", "ringMode", "ringStyle", "direction", "brow", "eyes", "beak", "marking", "accessory", "aura"];
  let forced = 0;
  for (const category of categories) {
    for (const option of categoryOptions(catalogue, category)) {
      if (option.enabled === false) continue;
      const id = rawOptionId(option);
      const resolved = owl.resolveTraits(`v1-freestyle-${category}-${id}`, {
        rarity: "common",
        overrides: { [category]: id },
        freestyle: true
      }, 1);
      assert.equal(resolved.selectionIds[category], id, `${category}.${id} must remain selected in V1 freestyle mode.`);
      assert.equal(resolved.freestyle, true);
      assert.deepEqual(plain(resolved.repairs), []);
      assert.equal(validationIsValid(owl.validateTraits(resolved, 1)), true);
      assert.equal(owl.renderWithTraits(resolved.seed, resolved, 1), owl.renderWithTraits(resolved.seed, resolved, 1));
      forced += 1;
    }
  }
  assert.ok(forced >= 60, `Expected freestyle coverage for the complete enabled V1 catalogue, forced only ${forced} options.`);
});

test("camp freestyle permits several hero treatments and Legendary rings on a Common Owl", async () => {
  const owl = await renderer();
  const seed = "camp-freestyle-no-mandatory-grammar";
  const resolved = owl.resolveTraits(seed, {
    rarity: "common",
    overrides: {
      ringMode: "festival-prism",
      brow: "three-band-prism",
      eyes: "pupil-lasers",
      aura: "radial-glow"
    },
    freestyle: true
  }, 2);
  assert.equal(resolved.rarity.id, "common");
  assert.equal(resolved.ringMode.id, "festival-prism");
  assert.equal(resolved.brow.id, "three-band-prism");
  assert.equal(resolved.eyes.id, "pupil-lasers");
  assert.equal(resolved.aura.id, "radial-glow");
  assert.equal(resolved.heroCount, 3);
  assert.ok(resolved.cost > resolved.budget);
  assert.deepEqual(plain(resolved.repairs), []);
  assert.equal(validationIsValid(owl.validateTraits(resolved, 2)), true);
  const svg = owl.renderWithTraits(seed, resolved, 2);
  assert.match(svg, /data-aura="radial-glow"/);
  assert.match(svg, /href="#hex-owl-shared-mark-brow-upper"/);
  assert.match(svg, /data-crossing-exception="laser"/);
  assert.match(svg, new RegExp(`data-rarity="common"[^>]*data-cost="${resolved.cost}"[^>]*data-heroes="3"`));
});

test("same-seed V1 and V2 SVG definition IDs cannot collide", async () => {
  const owl = await renderer();
  const seed = "cross-version-definition-isolation";
  const v1 = owl.renderSvg(seed, 1);
  const v2 = owl.renderSvg(seed, 2);
  const ids = svg => [...(svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] || "")
    .matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const v1Ids = ids(v1);
  const v2Ids = ids(v2);
  assert.ok(v1Ids.length > 0 && v2Ids.length > 0);
  assert.deepEqual(v1Ids.filter(id => v2Ids.includes(id)), []);
  assert.equal(v1Ids.some(id => id.startsWith("hex-owl-v2-")), false);
  assert.equal(v2Ids.every(id => id.startsWith("hex-owl-v2-")), true);
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

  const rendered = new FakeSvgElement("div");
  rendered.ownerDocument = document;
  const baseUse = new FakeSvgElement("use");
  baseUse.setAttribute("href", "#hex-owl-shared-mark");
  baseUse.setAttribute("fill", "#33c7a5");
  baseUse.setAttribute("transform", "translate(50 50) scale(.0365) translate(-724 -723)");
  const browUse = new FakeSvgElement("use");
  browUse.setAttribute("href", "#hex-owl-shared-mark-brow-gem");
  browUse.setAttribute("fill", "#f5bf4f");
  rendered.append(baseUse, browUse);
  document.body.append(rendered);
  assert.equal(await mounted.hydrate(rendered), 2, "Visible shared marks must be replaced with direct paths.");
  assert.deepEqual(rendered.children.map(child => child.tagName), ["path", "path"]);
  assert.equal(rendered.children[0].getAttribute("d"), suppliedPath);
  assert.equal(rendered.children[0].getAttribute("fill-rule"), "evenodd");
  assert.equal(rendered.children[0].getAttribute("fill"), "#33c7a5");
  assert.equal(rendered.children[0].getAttribute("href"), null);
  assert.equal(rendered.children[0].getAttribute("id"), null);
  assert.equal(rendered.children[0].getAttribute("data-hex-owl-inline"), "hex-owl-shared-mark");
  assert.match(rendered.children[1].getAttribute("d"), /^M\s/);
  assert.equal(await mounted.hydrate(rendered), 0, "Hydration must be idempotent.");

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
