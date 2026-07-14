// Deterministic Hex Owl renderer. Version 1 uses the exact supplied
// Shambhala Owl vector mark as its immutable anatomy. Future festival trait
// packs must add a new renderer rather than changing these arrays, weights,
// selection order, or SVG geometry after release.
(() => {
  const VERSION = 1;
  const HEX_SEED = /^[0-9a-f]{32}$/i;
  const OWL_ASSET = "./hex-owl-base.svg?v=55";
  const SHARED_MARK_ID = "hex-owl-shared-mark";
  const BROW_MARK_IDS = Object.freeze({
    lower: `${SHARED_MARK_ID}-brow-lower`,
    middle: `${SHARED_MARK_ID}-brow-middle`,
    upper: `${SHARED_MARK_ID}-brow-upper`,
    gem: `${SHARED_MARK_ID}-brow-gem`
  });
  const OWL_TRANSFORM = "translate(50 50) scale(.0365) translate(-724 -723)";
  let baseMountPromise = null;

  const FACE_PALETTES = [
    { name: "AMP Magenta", face: "#ff4fd8", shade: "#7b146f", accent: "#ffe3fa" },
    { name: "Fractal Violet", face: "#a46cff", shade: "#3f197b", accent: "#efe4ff" },
    { name: "Grove Teal", face: "#36e6c2", shade: "#087a73", accent: "#d9fff8" },
    { name: "Living Room Aqua", face: "#55dfff", shade: "#12648a", accent: "#e0faff" },
    { name: "Pagoda Ember", face: "#ff8a3d", shade: "#8f2e16", accent: "#fff0d7" },
    { name: "Secret Garden Lime", face: "#9cff57", shade: "#3e7e1b", accent: "#f1ffe4" },
    { name: "Village Crimson", face: "#ff536f", shade: "#8d1838", accent: "#ffe2e8" },
    { name: "Bass Gold", face: "#ffd34e", shade: "#8b6510", accent: "#fff8d7" },
    { name: "Moon Pearl", face: "#e7e5ff", shade: "#67619c", accent: "#ffffff" },
    { name: "Laser Mint", face: "#55ffad", shade: "#14734c", accent: "#e0ffef" },
    { name: "Sunrise Coral", face: "#ff7062", shade: "#8a2e35", accent: "#ffe8de" },
    { name: "Electric Blue", face: "#5f83ff", shade: "#263b95", accent: "#e5eaff" }
  ];

  const RING_PALETTES = [
    { name: "Ultraviolet", colors: ["#ad63ff", "#ad63ff", "#ad63ff", "#ad63ff"] },
    { name: "Forest Portal", colors: ["#45e7bb", "#45e7bb", "#45e7bb", "#45e7bb"] },
    { name: "Village Voltage", colors: ["#ff5f7d", "#ff5f7d", "#ff5f7d", "#ff5f7d"] },
    { name: "Glacier Laser", colors: ["#59cfff", "#59cfff", "#59cfff", "#59cfff"] },
    { name: "Garden Bloom", colors: ["#a5ef62", "#a5ef62", "#a5ef62", "#a5ef62"] },
    { name: "Bass Gold", colors: ["#f5c85a", "#f5c85a", "#f5c85a", "#f5c85a"] },
    { name: "Moonbeam", colors: ["#e8e4ff", "#e8e4ff", "#e8e4ff", "#e8e4ff"] },
    { name: "Sunrise Coral", colors: ["#ff806f", "#ff806f", "#ff806f", "#ff806f"] }
  ];

  // Multi-colour portals are deliberately restricted to the very rarest
  // ordinary Owls. Camp-only palettes can be added here without changing the
  // common generator.
  const RARE_RING_PALETTES = [
    { name: "Pagoda Sunset", colors: ["#ffcc55", "#ff873d", "#ff4f7a", "#b744ff"] },
    { name: "Aurora Bloom", colors: ["#a5ef62", "#45e7bb", "#59cfff", "#ad63ff"] },
    { name: "Moon Prism", colors: ["#f8f7ff", "#bcb6ff", "#7b8dff", "#ec8cba"] }
  ];

  const AURAS = [
    { name: "Quiet", color: "#000000", pattern: "none", weight: 62 },
    { name: "Portal Rays", color: "#d46cff", pattern: "rays", weight: 23 },
    { name: "Festival Confetti", color: "#55e7c2", pattern: "confetti", weight: 15 }
  ];
  const RARE_AURA = { name: "Star Dust", color: "#ffe66b", pattern: "stars" };

  const EYES = [
    { name: "Original Shambhala", type: "natural", weight: 76 },
    { name: "Laser", type: "laser", weight: 12 },
    { name: "Ember Pinpoint", type: "ember", weight: 6 },
    { name: "Aqua Pinpoint", type: "aqua", weight: 6 }
  ];

  const ACCESSORIES = [
    { name: "None", type: "none", weight: 45 },
    { name: "Kandi Beads", type: "kandi", weight: 18 },
    { name: "Double Kandi", type: "double-kandi", weight: 8 },
    { name: "LED Ear Cuffs", type: "led-cuffs", weight: 10 },
    { name: "Glow Hoops", type: "glow-hoops", weight: 8 },
    { name: "Disco Chin Gem", type: "disco", weight: 6 },
    { name: "Glowstick Earrings", type: "glowsticks", weight: 5 }
  ];

  const BROW_TREATMENTS = [
    { name: "Original Crown", type: "none", weight: 42 },
    { name: "Crown Gem", type: "crown-gem", weight: 22 },
    { name: "Brow Echo", type: "brow-echo", weight: 18 },
    { name: "Triple Prism", type: "triple-prism", weight: 12 },
    { name: "Moonstone Crest", type: "moonstone", weight: 6 }
  ];

  const BEAKS = [
    { name: "Original Mark", type: "none", weight: 55 },
    { name: "Amber Shard", type: "amber-shard", weight: 25 },
    { name: "Moonstone Shard", type: "moon-shard", weight: 12 },
    { name: "Laser Prism", type: "laser-prism", weight: 8 }
  ];

  const RARITIES = [
    { name: "Common", type: "common", weight: 62 },
    { name: "Uncommon", type: "uncommon", weight: 26 },
    { name: "Rare", type: "rare", weight: 10 },
    { name: "Legendary", type: "legendary", weight: 2 }
  ];

  const RING_STYLES = [
    { name: "Solid Portal", width: 13, dash: "" },
    { name: "Fine Lines", width: 8, dash: "" },
    { name: "Beat Dash", width: 11, dash: "28 9" },
    { name: "Signal Dash", width: 9, dash: "8 11" },
    { name: "Heavy Gate", width: 17, dash: "" },
    { name: "Alternating Beat", width: 12, dash: "42 8 9 8" }
  ];

  const MARKINGS = [
    { name: "Clean Face", type: "none", weight: 40 },
    { name: "UV Cheek Glow", type: "sparks", weight: 18 },
    { name: "Moon Freckles", type: "freckles", weight: 17 },
    { name: "Festival Arcs", type: "stripes", weight: 15 },
    { name: "Diamond Dust", type: "diamonds", weight: 10 }
  ];

  function hashWords(value) {
    const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    const bytes = new TextEncoder().encode(String(value));
    for (let index = 0; index < bytes.length; index += 1) {
      for (let lane = 0; lane < 4; lane += 1) {
        words[lane] ^= bytes[index] + lane * 41 + index;
        words[lane] = Math.imul(words[lane], 0x01000193 ^ (lane * 0x1f123bb5));
        words[lane] ^= words[lane] >>> 16;
      }
    }
    return words.map(word => (word >>> 0).toString(16).padStart(8, "0")).join("");
  }

  function normalizeSeed(value) {
    const trimmed = String(value || "").trim().replace(/^0x/i, "");
    return HEX_SEED.test(trimmed) ? trimmed.toLowerCase() : hashWords(trimmed || "hex-owl");
  }

  function randomSeed(cryptoApi = globalThis.crypto) {
    if (!cryptoApi?.getRandomValues) throw new Error("Secure randomness is unavailable.");
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function prng(seed, version) {
    const normalized = normalizeSeed(seed);
    const state = [0, 8, 16, 24].map(offset => parseInt(normalized.slice(offset, offset + 8), 16) >>> 0);
    state[0] ^= Math.imul(version >>> 0, 0x9e3779b9);
    if (!state.some(Boolean)) state[0] = 1;
    return () => {
      const result = Math.imul(((state[1] * 5) << 7 | (state[1] * 5) >>> 25) >>> 0, 9) >>> 0;
      const t = (state[1] << 9) >>> 0;
      state[2] ^= state[0]; state[3] ^= state[1]; state[1] ^= state[2]; state[0] ^= state[3];
      state[2] ^= t; state[3] = (state[3] << 11 | state[3] >>> 21) >>> 0;
      return result / 4294967296;
    };
  }

  function pick(items, random) {
    return items[Math.floor(random() * items.length) % items.length];
  }

  function weighted(items, random) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let cursor = random() * total;
    for (const item of items) {
      cursor -= item.weight;
      if (cursor < 0) return item;
    }
    return items[items.length - 1];
  }

  function selectV1(seed) {
    const random = prng(seed, VERSION);
    const face = pick(FACE_PALETTES, random);
    const rarity = weighted(RARITIES, random);
    const rings = rarity.type === "legendary" ? pick(RARE_RING_PALETTES, random) : pick(RING_PALETTES, random);
    const aura = rarity.type === "rare" || rarity.type === "legendary" ? RARE_AURA : weighted(AURAS, random);
    const eyes = weighted(EYES, random);
    const accessory = weighted(ACCESSORIES, random);
    const ringStyle = pick(RING_STYLES, random);
    const marking = weighted(MARKINGS, random);
    const brow = weighted(BROW_TREATMENTS, random);
    const beak = weighted(BEAKS, random);

    return Object.freeze({
      version: VERSION,
      seed: normalizeSeed(seed),
      face, rings, aura, eyes, accessory, ringStyle, marking, brow, beak, rarity,
      ringDirection: random() < 0.5 ? "Clockwise" : "Counter-clockwise"
    });
  }

  function selectTraits(seed, version = VERSION) {
    if (Number(version) !== VERSION) throw new Error(`Unsupported Hex Owl version: ${version}`);
    return selectV1(seed);
  }

  function splitClosedSubpaths(pathData) {
    const rawSubpaths = String(pathData || "").match(/[mM][\s\S]*?[zZ](?=\s*[mM]|$)/g) || [];
    let priorStart = [0, 0];
    return rawSubpaths.map(subpath => {
      const start = subpath.match(/^([mM])\s*([-+\d.eE]+)\s*,?\s*([-+\d.eE]+)/);
      if (!start) throw new Error("The supplied Hex Owl base has an invalid subpath.");
      const point = [Number(start[2]), Number(start[3])];
      const absolute = start[1] === "M" ? point : [priorStart[0] + point[0], priorStart[1] + point[1]];
      priorStart = absolute;
      return subpath.replace(start[0], `M ${absolute[0]},${absolute[1]}`);
    });
  }

  function mountBase(rootDocument = globalThis.document) {
    if (!rootDocument?.createElementNS || typeof globalThis.fetch !== "function") return Promise.resolve(false);
    const markIsMounted = () => rootDocument.getElementById(SHARED_MARK_ID) && Object.values(BROW_MARK_IDS).every(id => rootDocument.getElementById(id));
    if (markIsMounted()) return Promise.resolve(true);
    if (baseMountPromise) return baseMountPromise;
    baseMountPromise = globalThis.fetch(OWL_ASSET).then(response => {
      if (!response.ok) throw new Error(`Could not load the Hex Owl base (${response.status}).`);
      return response.text();
    }).then(source => {
      if (markIsMounted()) return true;
      const Parser = rootDocument.defaultView?.DOMParser || globalThis.DOMParser;
      const parsed = new Parser().parseFromString(source, "image/svg+xml");
      const suppliedPath = parsed.querySelector("#shambhala-owl-mark");
      if (!suppliedPath) throw new Error("The supplied Hex Owl base path is missing.");
      const browPaths = splitClosedSubpaths(suppliedPath.getAttribute("d")).slice(-4);
      if (browPaths.length !== 4) throw new Error("The supplied Hex Owl brow components are missing.");
      const namespace = "http://www.w3.org/2000/svg";
      const sprite = rootDocument.createElementNS(namespace, "svg");
      const definitions = rootDocument.createElementNS(namespace, "defs");
      const sharedPath = rootDocument.importNode(suppliedPath, true);
      sharedPath.id = SHARED_MARK_ID;
      sharedPath.removeAttribute("fill");
      definitions.append(sharedPath);
      Object.values(BROW_MARK_IDS).forEach((id, index) => {
        const sharedBrow = rootDocument.createElementNS(namespace, "path");
        sharedBrow.setAttribute("id", id);
        sharedBrow.setAttribute("d", browPaths[index]);
        definitions.append(sharedBrow);
      });
      sprite.append(definitions);
      sprite.setAttribute("aria-hidden", "true");
      sprite.setAttribute("focusable", "false");
      sprite.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
      (rootDocument.body || rootDocument.documentElement).prepend(sprite);
      return true;
    }).catch(() => {
      baseMountPromise = null;
      return false;
    });
    return baseMountPromise;
  }

  const HEX_POINTS = "50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26";

  function auraSvg(aura) {
    if (aura.pattern === "none") return "";
    if (aura.pattern === "stars") return `<g fill="${aura.color}" opacity=".82"><path d="M13 24l1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1zM86 65l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9zM80 17l.65 1.55 1.55.65-1.55.65L80 21.4l-.65-1.55-1.55-.65 1.55-.65zM22 79l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z"/><circle cx="84" cy="31" r=".65"/><circle cx="17" cy="66" r=".6"/></g>`;
    if (aura.pattern === "rays") return `<g stroke="${aura.color}" stroke-width="1.05" stroke-linecap="round" opacity=".32"><path d="M50 4v6M50 92v6M3 51h6M91 51h6M16.5 18l4.2 4.2M79.3 79.8l4.2 4.2M83.5 18l-4.2 4.2M20.7 79.8L16.5 84"/></g>`;
    return `<g stroke="${aura.color}" stroke-width="1.2" stroke-linecap="round" opacity=".62"><path d="M14 34l2.4 1.2M83 28l2.1-1.4M88 72l-2.3-.7M15 71l2.3-.8M29 10l1.2 2.3M70 89l1.1 2.2"/><path d="M22 18l1.7-1.2M78 82l1.8 1.1" stroke="#ec8cba"/></g>`;
  }

  function colourLuminance(hex) {
    const channels = String(hex).match(/[0-9a-f]{2}/gi)?.map(channel => Number.parseInt(channel, 16) / 255) || [0, 0, 0];
    const linear = channels.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }

  function strongestContrast(base, candidates) {
    const baseLuminance = colourLuminance(base);
    return [...new Set(candidates)].reduce((best, candidate) => {
      const luminance = colourLuminance(candidate);
      const score = (Math.max(baseLuminance, luminance) + .05) / (Math.min(baseLuminance, luminance) + .05);
      return !best || score > best.score ? { colour: candidate, score } : best;
    }, null).colour;
  }

  function browTreatmentSvg(brow, face) {
    const recolour = (part, fill, opacity = 1) => `<use href="#${BROW_MARK_IDS[part]}" fill="${fill}" opacity="${opacity}" transform="${OWL_TRANSFORM}"/>`;
    const contrast = strongestContrast(face.face, [face.shade, "#090716", "#f8f7ff"]);
    const jewel = strongestContrast(face.face, ["#ffd34e", "#55dfff", "#ff4fd8", "#9cff57"]);
    if (brow.type === "crown-gem") return recolour("gem", jewel);
    if (brow.type === "brow-echo") return `${recolour("lower", contrast)}${recolour("upper", contrast)}`;
    if (brow.type === "triple-prism") return `${recolour("lower", contrast)}${recolour("middle", jewel)}${recolour("upper", face.accent)}`;
    if (brow.type === "moonstone") return `${recolour("upper", contrast)}${recolour("gem", "#f8f7ff")}`;
    return "";
  }

  function eyeTreatmentSvg(type, face) {
    if (type === "natural") return "";
    const left = 34.89;
    const right = 65.18;
    const y = 52.45;
    const eyes = [left, right];
    if (type === "laser") return `<g stroke="#ff5757" stroke-linecap="round"><path d="M${left} ${y}L2 62" stroke-width="2.35" opacity=".2"/><path d="M${left} ${y}L2 62" stroke-width=".78"/><path d="M${right} ${y}L98 62" stroke-width="2.35" opacity=".2"/><path d="M${right} ${y}L98 62" stroke-width=".78"/></g>`;
    const color = type === "ember" ? "#ff5757" : "#3ce6d0";
    return `<g>${eyes.map(x => `<g><circle cx="${x}" cy="${y}" r=".92" fill="${color}"/><circle cx="${x - .24}" cy="${y - .25}" r=".22" fill="#fff" opacity=".9"/></g>`).join("")}</g>`;
  }

  function markingsSvg(marking, face) {
    if (marking.type === "sparks") return `<g stroke="${face.accent}" stroke-width=".85" stroke-linecap="round"><path d="M39.2 65.1l2.1 1M40 67.4l1.5 1.4M60.8 65.1l-2.1 1M60 67.4l-1.5 1.4"/></g>`;
    if (marking.type === "freckles") return `<g fill="${face.accent}" opacity=".84"><circle cx="39.2" cy="64.8" r=".55"/><circle cx="41.1" cy="66" r=".48"/><circle cx="42.4" cy="67.5" r=".4"/><circle cx="60.8" cy="64.8" r=".55"/><circle cx="58.9" cy="66" r=".48"/><circle cx="57.6" cy="67.5" r=".4"/></g>`;
    if (marking.type === "stripes") return `<g fill="none" stroke="${face.accent}" stroke-width=".8" stroke-linecap="round"><path d="M38.7 64.7q2.3 1.4 4.5 3.4M61.3 64.7q-2.3 1.4-4.5 3.4M39.5 67q1.6 1 2.7 2M60.5 67q-1.6 1-2.7 2"/></g>`;
    if (marking.type === "diamonds") return `<g fill="${face.accent}"><path d="M40 64.5l.9 1.3-.9 1.3-.9-1.3zM42 67.1l.7 1-.7 1-.7-1zM60 64.5l.9 1.3-.9 1.3-.9-1.3zM58 67.1l.7 1-.7 1-.7-1z"/></g>`;
    return "";
  }

  function beakSvg(beak, face, accent) {
    if (beak.type === "amber-shard") return `<g><path d="M48.45 60.5L50 65.1l1.55-4.6L50 59.55z" fill="#f5bf4f"/><path d="M50 60.1v4" stroke="#fff4bd" stroke-width=".35" opacity=".8"/></g>`;
    if (beak.type === "moon-shard") return `<g><path d="M48.55 60.7L50 64.8l1.45-4.1L50 59.8z" fill="${face.accent}"/><path d="M50 60.3v3.5" stroke="#fff" stroke-width=".3" opacity=".72"/></g>`;
    if (beak.type === "laser-prism") return `<g><path d="M48.55 60.65L50 64.9l1.45-4.25L50 59.75z" fill="${accent}"/><path d="M50 60.2v3.8" stroke="#bafff2" stroke-width=".3" opacity=".82"/></g>`;
    return "";
  }

  function accessorySvg(accessory, face, rings) {
    const accent = rings.colors[0];
    const beads = (y, scale = 1) => `<g stroke="#111321" stroke-width=".42">${[[40,"#ff5eae"],[43.5,"#69e9ff"],[47.8,"#ffe45e"],[52.2,"#8dff76"],[56.5,"#b375ff"],[60,"#ff7b61"]].map(([x, colour], index) => `<circle cx="${x}" cy="${y + Math.sin(index / 5 * Math.PI) * 2.2}" r="${1.25 * scale}" fill="${colour}"/>`).join("")}</g>`;
    if (accessory.type === "kandi") return `<g><path d="M39 79.2q11 6.6 22 0" fill="none" stroke="#111321" stroke-width="1.25"/>${beads(79.7)}</g>`;
    if (accessory.type === "double-kandi") return `<g><path d="M40 78.8q10 5.8 20 0M40.5 82q9.5 5 19 0" fill="none" stroke="#111321" stroke-width="1.05"/>${beads(79.2,.92)}${beads(82,.76)}</g>`;
    if (accessory.type === "led-cuffs") return `<g>${[20.2,79.8].map(x => `<g fill="${face.accent}"><circle cx="${x}" cy="57.5" r="1.4" opacity=".18"/><circle cx="${x}" cy="61" r="1.4" opacity=".18"/><circle cx="${x}" cy="64.5" r="1.4" opacity=".18"/><circle cx="${x}" cy="57.5" r=".58"/><circle cx="${x}" cy="61" r=".58"/><circle cx="${x}" cy="64.5" r=".58"/></g>`).join("")}</g>`;
    if (accessory.type === "glow-hoops") return `<g fill="none" stroke="${accent}" stroke-linecap="round"><path d="M18 56a3.2 4.4 0 1 0 0 8.8" stroke-width="2.1" opacity=".16"/><path d="M18 56a3.2 4.4 0 1 0 0 8.8" stroke-width=".72"/><path d="M82 56a3.2 4.4 0 1 1 0 8.8" stroke-width="2.1" opacity=".16"/><path d="M82 56a3.2 4.4 0 1 1 0 8.8" stroke-width=".72"/></g>`;
    if (accessory.type === "disco") return `<g transform="translate(50 83.5)"><circle r="2.25" fill="#e8e4ff"/><path d="M-2 0h4M0-2v4M-1.4-1.4l2.8 2.8M1.4-1.4l-2.8 2.8" stroke="#7b68e8" stroke-width=".38" opacity=".8"/></g>`;
    if (accessory.type === "glowsticks") return `<g stroke-linecap="round"><path d="M17 64l-2 6M83 64l2 6" stroke="#55ffad" stroke-width="2.7" opacity=".16"/><path d="M17 64l-2 6M83 64l2 6" stroke="#55ffad" stroke-width=".85"/></g>`;
    return "";
  }

  function renderSvg(seed, version = VERSION) {
    const traits = selectTraits(seed, version);
    const direction = traits.ringDirection === "Clockwise" ? 1 : -1;
    // A regular hexagon needs 30 degrees between flat top/bottom edges and
    // vertical left/right edges. Four even 10-degree steps preserve those
    // exact endpoints while the direction trait reverses the middle twist.
    const rotations = [30, 20, 10, 0];
    const scales = [1, .91, .82, .73];
    const widths = [2.2, 1.55, 1.25, 1];
    const rings = rotations.map((rotation, index) => `<polygon points="${HEX_POINTS}" transform="translate(50 50) rotate(${direction * rotation}) scale(${scales[index]}) translate(-50 -50)" fill="none" stroke="${traits.rings.colors[index]}" stroke-width="${Math.max(.7, widths[index] * traits.ringStyle.width / 13)}"${traits.ringStyle.dash ? ` stroke-dasharray="${traits.ringStyle.dash.split(" ").map(value => (Number(value) / 13).toFixed(2)).join(" ")}"` : ""} stroke-linejoin="round" opacity="${.92 - index * .1}"/>`).join("");
    const face = traits.face;
    const fallbackImage = `<image href="${OWL_ASSET}" x="23.574" y="23.61" width="52.852" height="52.779" preserveAspectRatio="none"/>`;
    const sourceUse = `<use href="#${SHARED_MARK_ID}" fill="${face.face}" transform="${OWL_TRANSFORM}"/>`;
    const faceBackdrop = `<g fill="#090716"><ellipse cx="50" cy="53.5" rx="26.7" ry="25"/><path d="M29 50q4-18 21-27 17 9 21 27z"/></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Algorithmically generated Hex Owl" preserveAspectRatio="xMidYMid meet"><title>Hex Owl, ${traits.rarity.name} 2026 edition</title><desc>The Owl anatomy is the exact supplied Shambhala vector mark. Brow treatments recolour complete original chevrons; small accessories stay clear of its edges.</desc><rect width="100" height="100" rx="10" fill="#090716"/>${auraSvg(traits.aura)}<g>${rings}</g>${faceBackdrop}${fallbackImage}${sourceUse}${browTreatmentSvg(traits.brow, face)}${markingsSvg(traits.marking, face)}${eyeTreatmentSvg(traits.eyes.type, face)}${beakSvg(traits.beak, face, traits.rings.colors[0])}${accessorySvg(traits.accessory, face, traits.rings)}<text x="84" y="91" fill="${face.accent}" opacity=".72" font-family="system-ui,sans-serif" font-size="3.4" font-weight="900" letter-spacing="-.15">26</text></svg>`;
  }

  function traitNames(seed, version = VERSION) {
    const traits = selectTraits(seed, version);
    return Object.freeze({
      "Eye style": traits.eyes.name,
      "Owl colour": traits.face.name,
      Accessory: traits.accessory.name,
      Aura: traits.aura.name,
      "Brow treatment": traits.brow.name,
      Beak: traits.beak.name,
      "Facial disc": traits.marking.name,
      "Portal rings": traits.rings.name,
      "Ring finish": traits.ringStyle.name,
      "Ring twist": traits.ringDirection,
      Rarity: traits.rarity.name,
      Edition: "2026"
    });
  }

  if (globalThis.document) {
    if (globalThis.document.readyState === "loading") {
      globalThis.document.addEventListener("DOMContentLoaded", () => { void mountBase(); }, { once: true });
    } else {
      void mountBase();
    }
    globalThis.addEventListener?.("online", () => { void mountBase(); });
  }

  window.HexOwl = Object.freeze({ VERSION, normalizeSeed, randomSeed, selectTraits, traitNames, renderSvg, mountBase });
})();
