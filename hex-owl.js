// Hex Owl renderer, frozen festival edition V1.
//
// V1 deliberately keeps the persisted identity contract unchanged: an Owl is
// still identified by its seed and version. The manifest below is the complete
// art grammar for that version and is frozen with this release. A future art
// system must add a new versioned renderer.
(() => {
  "use strict";

  const VERSION = 1;
  const HEX_SEED = /^[0-9a-f]{32}$/i;
  const OWL_ASSET = "./hex-owl-base.svg?v=59";
  const SHARED_MARK_ID = "hex-owl-shared-mark";
  const BROW_MARK_IDS = {
    lower: SHARED_MARK_ID + "-brow-lower",
    middle: SHARED_MARK_ID + "-brow-middle",
    upper: SHARED_MARK_ID + "-brow-upper",
    gem: SHARED_MARK_ID + "-brow-gem"
  };
  const OWL_TRANSFORM = "translate(50 50) scale(.0365) translate(-724 -723)";
  let baseMountDocument = null;
  let baseMountPromise = null;

  function deepFreeze(value, seen) {
    if (!value || typeof value !== "object") return value;
    const visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key], visited));
    return Object.freeze(value);
  }

  const RARITIES = deepFreeze([
    { id: "common", name: "Common", weight: 35, budget: 3, focalCap: 1, level: 0 },
    { id: "uncommon", name: "Uncommon", weight: 30, budget: 5, focalCap: 1, level: 1 },
    { id: "rare", name: "Rare", weight: 25, budget: 7, focalCap: 2, level: 2 },
    { id: "legendary", name: "Legendary", weight: 10, budget: 9, focalCap: 2, level: 3 }
  ]);

  // The first seven anchors are the stage colours already used by the app.
  // The final five anchors are a literal 2026-07-14 snapshot of the current
  // shambhalamusicfestival.com public palette. All supporting colours are
  // curated here and are never fetched or derived at runtime.
  const PALETTE_FAMILY_DEFS = deepFreeze([
    {
      id: "amp", name: "AMP", source: "app-stage", sourceHex: "#ec8cba",
      variants: [
        { id: "amp-daylight", name: "Daylight", tokens: { face: "#ec8cba", shadow: "#8f4169", highlight: "#fff0f8", focal: "#ffd34e", ring: "#ec8cba", beam: "#ff6fb5" } },
        { id: "amp-electric", name: "Electric", tokens: { face: "#ff63bd", shadow: "#8d245e", highlight: "#ffe8f5", focal: "#62e6ff", ring: "#ff78c7", beam: "#ff3d9f" } },
        { id: "amp-midnight", name: "Midnight", tokens: { face: "#c76a97", shadow: "#52213f", highlight: "#ffd9ec", focal: "#a98ad8", ring: "#d97eaa", beam: "#ff62b7" } }
      ]
    },
    {
      id: "fractal-forest", name: "Fractal Forest", source: "app-stage", sourceHex: "#ec4e58",
      variants: [
        { id: "fractal-daylight", name: "Daylight", tokens: { face: "#ec4e58", shadow: "#81232b", highlight: "#ffe9e8", focal: "#ffce58", ring: "#f26168", beam: "#ff4f58" } },
        { id: "fractal-electric", name: "Electric", tokens: { face: "#ff5c65", shadow: "#7a1826", highlight: "#fff0e8", focal: "#9fdda6", ring: "#ff6d72", beam: "#ff394a" } },
        { id: "fractal-midnight", name: "Midnight", tokens: { face: "#bd3640", shadow: "#48131b", highlight: "#ffd9dd", focal: "#785cd7", ring: "#d64953", beam: "#ff5462" } }
      ]
    },
    {
      id: "grove", name: "The Grove", source: "app-stage", sourceHex: "#16af9c",
      variants: [
        { id: "grove-daylight", name: "Daylight", tokens: { face: "#16af9c", shadow: "#07594f", highlight: "#dcfff8", focal: "#ffce58", ring: "#23c9b4", beam: "#42f0cf" } },
        { id: "grove-electric", name: "Electric", tokens: { face: "#27d7bd", shadow: "#066b60", highlight: "#e3fff9", focal: "#ec8cba", ring: "#3be2c8", beam: "#38ffd7" } },
        { id: "grove-midnight", name: "Midnight", tokens: { face: "#0e8375", shadow: "#043e39", highlight: "#cafff5", focal: "#a98ad8", ring: "#19a997", beam: "#2be4c4" } }
      ]
    },
    {
      id: "living-room", name: "The Living Room", source: "app-stage", sourceHex: "#3cade3",
      variants: [
        { id: "living-daylight", name: "Daylight", tokens: { face: "#3cade3", shadow: "#165b79", highlight: "#e7f8ff", focal: "#ffce58", ring: "#50bce9", beam: "#63d8ff" } },
        { id: "living-electric", name: "Electric", tokens: { face: "#54c8f5", shadow: "#126387", highlight: "#edfbff", focal: "#ec8cba", ring: "#69d3ff", beam: "#46c8ff" } },
        { id: "living-midnight", name: "Midnight", tokens: { face: "#2680aa", shadow: "#10394f", highlight: "#d8f2ff", focal: "#9fdda6", ring: "#349ac4", beam: "#42bded" } }
      ]
    },
    {
      id: "pagoda", name: "The Pagoda", source: "app-stage", sourceHex: "#7f8ce0",
      variants: [
        { id: "pagoda-daylight", name: "Daylight", tokens: { face: "#7f8ce0", shadow: "#394582", highlight: "#eef0ff", focal: "#ffce58", ring: "#909ced", beam: "#8ea3ff" } },
        { id: "pagoda-electric", name: "Electric", tokens: { face: "#91a0ff", shadow: "#3a438f", highlight: "#f1f3ff", focal: "#ec8cba", ring: "#9faaff", beam: "#708cff" } },
        { id: "pagoda-midnight", name: "Midnight", tokens: { face: "#2b3789", shadow: "#141944", highlight: "#dce2ff", focal: "#9fdda6", ring: "#5363bd", beam: "#6f85ff" } }
      ]
    },
    {
      id: "secret-garden", name: "The Secret Garden", source: "app-stage", sourceHex: "#90cd8d",
      variants: [
        { id: "garden-daylight", name: "Daylight", tokens: { face: "#90cd8d", shadow: "#416f42", highlight: "#efffed", focal: "#ffce58", ring: "#9ddb99", beam: "#adf0a8" } },
        { id: "garden-electric", name: "Electric", tokens: { face: "#a5e99f", shadow: "#49794a", highlight: "#f3fff1", focal: "#785cd7", ring: "#b0efaa", beam: "#9dff9a" } },
        { id: "garden-midnight", name: "Midnight", tokens: { face: "#5f9e5d", shadow: "#29492b", highlight: "#ddffda", focal: "#ec8cba", ring: "#77b875", beam: "#8ee58a" } }
      ]
    },
    {
      id: "village", name: "The Village", source: "app-stage", sourceHex: "#a98ad8",
      variants: [
        { id: "village-daylight", name: "Daylight", tokens: { face: "#a98ad8", shadow: "#594078", highlight: "#f5edff", focal: "#ffce58", ring: "#b79ae4", beam: "#c19cff" } },
        { id: "village-electric", name: "Electric", tokens: { face: "#bd91ff", shadow: "#5b388e", highlight: "#f8f0ff", focal: "#9fdda6", ring: "#c29fff", beam: "#b374ff" } },
        { id: "village-midnight", name: "Midnight", tokens: { face: "#69499c", shadow: "#2f1d4d", highlight: "#eadcff", focal: "#ec8cba", ring: "#8462b9", beam: "#a878ed" } }
      ]
    },
    {
      id: "website-gold", name: "Farm Gold", source: "official-website", sourceHex: "#ffce58",
      variants: [
        { id: "gold-daylight", name: "Daylight", tokens: { face: "#ffce58", shadow: "#8c6514", highlight: "#fff8dc", focal: "#4884c4", ring: "#ffda70", beam: "#ffe061" } },
        { id: "gold-electric", name: "Electric", tokens: { face: "#ffe06f", shadow: "#92701a", highlight: "#fffbe7", focal: "#785cd7", ring: "#ffe57e", beam: "#ffd43d" } },
        { id: "gold-midnight", name: "Midnight", tokens: { face: "#c99727", shadow: "#4d390d", highlight: "#fff0bd", focal: "#9fdda6", ring: "#e0ae34", beam: "#ffcc45" } }
      ]
    },
    {
      id: "website-blue", name: "River Blue", source: "official-website", sourceHex: "#4884c4",
      variants: [
        { id: "blue-daylight", name: "Daylight", tokens: { face: "#4884c4", shadow: "#1f456d", highlight: "#e7f2ff", focal: "#ffce58", ring: "#5b96d2", beam: "#66aaff" } },
        { id: "blue-electric", name: "Electric", tokens: { face: "#5b9ce0", shadow: "#214c7b", highlight: "#edf7ff", focal: "#ffedf6", ring: "#6aabec", beam: "#4d9eff" } },
        { id: "blue-midnight", name: "Midnight", tokens: { face: "#285d95", shadow: "#102b49", highlight: "#d9edff", focal: "#9fdda6", ring: "#3978b3", beam: "#4b94df" } }
      ]
    },
    {
      id: "website-purple", name: "Festival Purple", source: "official-website", sourceHex: "#785cd7",
      variants: [
        { id: "purple-daylight", name: "Daylight", tokens: { face: "#785cd7", shadow: "#392673", highlight: "#eee8ff", focal: "#ffce58", ring: "#8a6ee4", beam: "#956fff" } },
        { id: "purple-electric", name: "Electric", tokens: { face: "#916fff", shadow: "#422985", highlight: "#f3edff", focal: "#9fdda6", ring: "#9e7cff", beam: "#8758ff" } },
        { id: "purple-midnight", name: "Midnight", tokens: { face: "#5036a2", shadow: "#24164f", highlight: "#e4d9ff", focal: "#ec8cba", ring: "#674cb8", beam: "#805ee8" } }
      ]
    },
    {
      id: "website-green", name: "Meadow Green", source: "official-website", sourceHex: "#9fdda6",
      variants: [
        { id: "green-daylight", name: "Daylight", tokens: { face: "#9fdda6", shadow: "#4b7952", highlight: "#f0fff1", focal: "#785cd7", ring: "#afe9b5", beam: "#a8f5b1" } },
        { id: "green-electric", name: "Electric", tokens: { face: "#b3f1b9", shadow: "#4e8257", highlight: "#f5fff5", focal: "#4884c4", ring: "#c0f5c5", beam: "#9dffa8" } },
        { id: "green-midnight", name: "Midnight", tokens: { face: "#6fae78", shadow: "#304f36", highlight: "#e3ffe6", focal: "#ffce58", ring: "#83c48b", beam: "#91e99c" } }
      ]
    },
    {
      id: "website-pink", name: "Cloud Pink", source: "official-website", sourceHex: "#ffedf6",
      variants: [
        { id: "pink-daylight", name: "Daylight", tokens: { face: "#ffedf6", shadow: "#9e617f", highlight: "#ffffff", focal: "#785cd7", ring: "#ffcfe5", beam: "#ff9ac8" } },
        { id: "pink-electric", name: "Electric", tokens: { face: "#ffc9e3", shadow: "#984d72", highlight: "#fff6fb", focal: "#4884c4", ring: "#ffb9da", beam: "#ff79b7" } },
        { id: "pink-midnight", name: "Midnight", tokens: { face: "#cb86a8", shadow: "#5b3046", highlight: "#ffe8f4", focal: "#ffce58", ring: "#dc98b9", beam: "#f06cae" } }
      ]
    }
  ]);

  const paletteList = [];
  PALETTE_FAMILY_DEFS.forEach(family => {
    family.variants.forEach(variant => {
      paletteList.push({
        id: variant.id,
        name: family.name + " — " + variant.name,
        variantName: variant.name,
        familyId: family.id,
        familyName: family.name,
        source: family.source,
        sourceHex: family.sourceHex,
        weight: 1,
        cost: 0,
        focal: false,
        minRarity: "common",
        tokens: variant.tokens,
        face: variant.tokens.face,
        shade: variant.tokens.shadow,
        accent: variant.tokens.highlight
      });
    });
  });
  const PALETTES = deepFreeze(paletteList);
  const PALETTE_FAMILIES = deepFreeze(PALETTE_FAMILY_DEFS.map(family => ({
    id: family.id,
    name: family.name,
    source: family.source,
    sourceHex: family.sourceHex,
    variants: PALETTES.filter(palette => palette.familyId === family.id)
  })));

  const RING_MODES = deepFreeze([
    { id: "single", name: "Coordinated Single Colour", weight: 100, cost: 0, focal: false, minRarity: "common", multicolor: false },
    { id: "festival-prism", name: "Palette-linked Festival Prism", weight: 0, cost: 2, focal: false, minRarity: "legendary", multicolor: true, excludes: ["double-line"] }
  ]);
  const RING_STYLES = deepFreeze([
    { id: "solid", name: "Solid Portal", weight: 24, cost: 0, focal: false, minRarity: "common", widthFactor: 0.86, dash: "", linecap: "round" },
    { id: "fine", name: "Fine Lines", weight: 28, cost: 1, focal: false, minRarity: "common", widthFactor: 0.56, dash: "", linecap: "round" },
    { id: "beat-dash", name: "Beat Dash", weight: 24, cost: 1, focal: false, minRarity: "common", widthFactor: 0.72, dash: "2.20 1.10", linecap: "round" },
    { id: "dotted", name: "Dotted Signal", weight: 16, cost: 1, focal: false, minRarity: "common", widthFactor: 0.72, dash: "0.01 2.10", linecap: "round" },
    { id: "double-line", name: "Double Line", weight: 8, cost: 2, focal: false, minRarity: "uncommon", widthFactor: 0.96, dash: "", linecap: "round", excludes: ["festival-prism"] }
  ]);
  const DIRECTIONS = deepFreeze([
    { id: "clockwise", name: "Clockwise", weight: 50, cost: 0, focal: false, minRarity: "common" },
    { id: "counter-clockwise", name: "Counter-clockwise", weight: 50, cost: 0, focal: false, minRarity: "uncommon" }
  ]);
  const BROWS = deepFreeze([
    { id: "original-crown", name: "Original Crown", weight: 1, cost: 0, focal: false, minRarity: "common", safeZone: "brows", bounds: [26.5799, 23.6418, 73.4330, 49.7415] },
    { id: "crown-gem", name: "Top-ridge Gem", weight: 24, cost: 1, focal: false, minRarity: "common", safeZone: "brows", bounds: [44.0982, 23.6418, 55.8689, 28.0280] },
    { id: "brow-echo", name: "Brow Echo", weight: 22, cost: 1, focal: false, minRarity: "common", safeZone: "brows", bounds: [26.5799, 25.5127, 73.4330, 49.7415] },
    { id: "brow-tint", name: "Festival Brow Tint", weight: 18, cost: 1, focal: false, minRarity: "uncommon", safeZone: "brows", bounds: [30.7645, 25.5127, 69.2248, 42.2230] },
    { id: "moonstone-crest", name: "Moonstone Crest", weight: 16, cost: 2, focal: false, minRarity: "common", safeZone: "brows", bounds: [36.7742, 23.6418, 63.2130, 34.2279] },
    { id: "three-band-prism", name: "Three-band Prism", weight: 0, cost: 2, focal: false, minRarity: "rare", safeZone: "brows", bounds: [26.5799, 23.6418, 73.4330, 49.7415], multicolor: true }
  ]);
  const EYES = deepFreeze([
    { id: "original-eyes", name: "Original Shambhala", weight: 1, cost: 0, focal: false, minRarity: "common", safeZone: "eyes", bounds: [34.0, 51.5, 66.1, 53.4] },
    { id: "festival-eye-wells", name: "Festival Eye Wells", weight: 50, cost: 1, focal: false, minRarity: "common", safeZone: "eyeFields", bounds: [30.8740, 50.7665, 69.0895, 57.9205] },
    { id: "electric-eye-wells", name: "Electric Eye Wells", weight: 50, cost: 1, focal: false, minRarity: "common", safeZone: "eyeFields", bounds: [30.8740, 50.7665, 69.0895, 57.9205] },
    { id: "pupil-lasers", name: "Pupil Lasers", weight: 0, cost: 3, focal: true, minRarity: "rare", safeZone: "laserCorridor", bounds: [1.4, 50.7, 98.6, 63.2], crossingException: true }
  ]);
  const BEAKS = deepFreeze([
    { id: "original-beak", name: "Original Mark", weight: 1, cost: 0, focal: false, minRarity: "common", safeZone: "beak", bounds: [49.9944, 60.5116, 49.9944, 60.5116] },
    { id: "amber-shard", name: "Amber Shard", weight: 28, cost: 1, focal: false, minRarity: "common", safeZone: "beak", bounds: [48.8, 55.6116, 51.2, 60.5117] },
    { id: "moonstone-shard", name: "Moonstone Shard", weight: 24, cost: 1, focal: false, minRarity: "common", safeZone: "beak", bounds: [48.8, 55.6116, 51.2, 60.5117] },
    { id: "chevron-beak", name: "Chevron Beak", weight: 30, cost: 1, focal: false, minRarity: "common", safeZone: "beak", bounds: [48.59, 56.0916, 51.41, 60.5117] },
    { id: "chevron-diamond", name: "Chevron and Diamond Tip", weight: 18, cost: 2, focal: false, minRarity: "uncommon", safeZone: "beak", bounds: [48.59, 56.2516, 51.41, 60.5117] }
  ]);
  const MARKINGS = deepFreeze([
    { id: "clean-face", name: "Clean Face", weight: 1, cost: 0, focal: false, minRarity: "common", safeZone: "face", bounds: [31.0, 39.0, 69.0, 71.0] },
    { id: "moon-freckles", name: "Moon Freckles", weight: 35, cost: 1, focal: false, minRarity: "common", safeZone: "cheeks", bounds: [36.8, 62.2, 63.2, 69.0] },
    { id: "ember-specks", name: "Ember Specks", weight: 35, cost: 1, focal: false, minRarity: "common", safeZone: "cheeks", bounds: [36.8, 62.2, 63.2, 69.0] },
    { id: "diamond-dust", name: "Diamond Dust", weight: 30, cost: 1, focal: false, minRarity: "common", safeZone: "cheeks", bounds: [36.8, 62.2, 63.2, 69.0] }
  ]);
  const ACCESSORIES = deepFreeze([
    { id: "no-accessory", name: "None", weight: 1, cost: 0, focal: false, minRarity: "common", safeZone: "innerPortal", bounds: [50, 50, 50, 50] }
  ]);
  const AURAS = deepFreeze([
    { id: "quiet-aura", name: "Quiet", weight: 1, cost: 0, focal: false, minRarity: "common", safeZone: "outer", bounds: [0, 0, 100, 100] },
    { id: "radial-glow", name: "Portal Halo", weight: 38, cost: 2, focal: true, minRarity: "rare", safeZone: "outer", bounds: [3, 3, 97, 97] },
    { id: "portal-rays", name: "Restrained Portal Rays", weight: 34, cost: 2, focal: true, minRarity: "rare", safeZone: "outer", bounds: [3, 3, 97, 97] },
    { id: "stardust", name: "Stardust", weight: 28, cost: 2, focal: true, minRarity: "rare", safeZone: "outer", bounds: [7, 7, 93, 93] },
    { id: "camp-beacon", name: "Camp Beacon (reserved)", weight: 0, cost: 2, focal: true, minRarity: "legendary", safeZone: "outer", bounds: [0, 0, 100, 100], campOnly: true, enabled: false }
  ]);

  const GEOMETRY = deepFreeze({
    viewBox: [0, 0, 100, 100],
    center: [50, 50],
    owlBounds: [23.598301, 23.641839, 76.408828, 76.367190],
    owlGap: 1.64207,
    ringGap: 0.747,
    laserCorridorWidth: 3.4,
    rings: [
      {
        id: "outer", rotation: 30, radius: 48.8, strokeWidth: 1.2,
        points: "74.4000,7.7380 98.8000,50.0000 74.4000,92.2620 25.6000,92.2620 1.2000,50.0000 25.6000,7.7380",
        reversePoints: "25.6000,7.7380 1.2000,50.0000 25.6000,92.2620 74.4000,92.2620 98.8000,50.0000 74.4000,7.7380",
        envelopeBounds: [0.6, 7.13796, 99.4, 92.86204]
      },
      {
        id: "middle-outer", rotation: 20, radius: 42.95, strokeWidth: 1.1,
        points: "64.6898,9.6402 92.2975,42.5418 77.6077,82.9016 35.3102,90.3598 7.7025,57.4582 22.3923,17.0984",
        reversePoints: "35.3102,9.6402 7.7025,42.5418 22.3923,82.9016 64.6898,90.3598 92.2975,57.4582 77.6077,17.0984",
        envelopeBounds: [7.1525, 9.0902, 92.8475, 90.9098]
      },
      {
        id: "middle-inner", rotation: 10, radius: 37.67, strokeWidth: 1.0,
        points: "56.5413,12.9023 85.3982,37.1161 78.8569,74.2138 43.4587,87.0977 14.6018,62.8839 21.1431,25.7862",
        reversePoints: "43.4587,12.9023 14.6018,37.1161 21.1431,74.2138 56.5413,87.0977 85.3982,62.8839 78.8569,25.7862",
        envelopeBounds: [14.1018, 12.4023, 85.8982, 87.5977]
      },
      {
        id: "inner", rotation: 0, radius: 32.91, strokeWidth: 0.9,
        points: "50.0000,17.0900 78.5009,33.5450 78.5009,66.4550 50.0000,82.9100 21.4991,66.4550 21.4991,33.5450",
        reversePoints: "50.0000,17.0900 21.4991,33.5450 21.4991,66.4550 50.0000,82.9100 78.5009,66.4550 78.5009,33.5450",
        envelopeBounds: [21.0491, 16.64, 78.9509, 83.36]
      }
    ],
    safeZones: {
      outer: { bounds: [0, 0, 100, 100], points: "0,0 100,0 100,100 0,100" },
      innerPortal: { bounds: [22.9491, 18.7643, 77.0509, 81.2357], points: "50.0000,18.7643 77.0509,34.3822 77.0509,65.6178 50.0000,81.2357 22.9491,65.6178 22.9491,34.3822" },
      brows: { bounds: [26.5799, 23.6418, 73.4330, 49.7415], exactSubpaths: true },
      eyes: { bounds: [33.8, 51.3, 66.3, 53.6], exactPupils: [[34.8890, 52.4455], [65.1840, 52.4455]] },
      eyeFields: {
        bounds: [30.8740, 50.7665, 69.0895, 57.9205],
        regions: [[30.8740, 50.7665, 40.1085, 57.9205], [59.8550, 50.7665, 69.0895, 57.9205]],
        preserveNativePupils: true
      },
      face: { bounds: [31, 39, 69, 71] },
      cheeks: { bounds: [36.8, 62.2, 63.2, 69] },
      beak: { bounds: [48.5, 55.5, 51.5, 60.6], points: "50,55.5 51.5,56.2 51.5,59.7 50,60.6 48.5,59.7 48.5,56.2" },
      chin: { bounds: [43.5, 74.6, 56.5, 79], points: "43.5,74.6 56.5,74.6 56,76.6 52.5,79 47.5,79 44,76.6" },
      temples: { bounds: [24, 55.5, 76, 67] },
      laserCorridor: { bounds: [1.4, 50.7, 98.6, 63.2], crossingException: true }
    }
  });

  const LAYER_ORDER = deepFreeze([
    "background",
    "aura",
    "laser-outer",
    "portal-rings",
    "owl-backdrop",
    "eyes",
    "owl-base",
    "brows",
    "facial-details",
    "beak",
    "accessories",
    "laser-inner"
  ]);

  const CATEGORIES = deepFreeze({
    palette: PALETTES,
    ringMode: RING_MODES,
    ringStyle: RING_STYLES,
    direction: DIRECTIONS,
    brow: BROWS,
    eyes: EYES,
    beak: BEAKS,
    marking: MARKINGS,
    accessory: ACCESSORIES,
    aura: AURAS
  });

  const SPEC = deepFreeze({
    id: "hex-owl-v1",
    version: VERSION,
    status: "frozen",
    frozenAt: "2026-07-14",
    rarityWeights: { common: 35, uncommon: 30, rare: 25, legendary: 10 },
    budgets: { common: 3, uncommon: 5, rare: 7, legendary: 9 },
    rarities: RARITIES,
    paletteFamilies: PALETTE_FAMILIES,
    palettes: PALETTES,
    geometry: GEOMETRY,
    layerOrder: LAYER_ORDER,
    specialEligibility: { campOnlyOrdinaryWeight: 0, assignment: "deferred" },
    catalogue: {
      categories: CATEGORIES,
      paletteFamilies: PALETTE_FAMILIES,
      rarities: RARITIES
    }
  });

  const CATEGORY_KEYS = deepFreeze(["ringMode", "ringStyle", "direction", "brow", "eyes", "beak", "marking", "accessory", "aura"]);
  const QUIET_ORDERS = deepFreeze([
    ["ringStyle", "marking", "accessory", "eyes", "brow", "beak"],
    ["accessory", "ringStyle", "eyes", "marking", "brow", "beak"],
    ["eyes", "marking", "ringStyle", "brow", "accessory", "beak"],
    ["marking", "brow", "accessory", "ringStyle", "eyes", "beak"]
  ]);

  function hashWords(value) {
    const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    const source = String(value);
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      for (let lane = 0; lane < 4; lane += 1) {
        words[lane] ^= code + lane * 41 + index;
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

  function randomSeed(cryptoApi) {
    const secure = cryptoApi || globalThis.crypto;
    if (!secure || typeof secure.getRandomValues !== "function") throw new Error("Secure randomness is unavailable.");
    const bytes = secure.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function prng(seed, version) {
    const normalized = normalizeSeed(seed);
    const state = [0, 8, 16, 24].map(offset => parseInt(normalized.slice(offset, offset + 8), 16) >>> 0);
    state[0] ^= Math.imul(version >>> 0, 0x9e3779b9);
    if (!state.some(Boolean)) state[0] = 1;
    return () => {
      const product = Math.imul(state[1], 5) >>> 0;
      const rotated = ((product << 7) | (product >>> 25)) >>> 0;
      const result = Math.imul(rotated, 9) >>> 0;
      const shifted = (state[1] << 9) >>> 0;
      state[2] ^= state[0];
      state[3] ^= state[1];
      state[1] ^= state[2];
      state[0] ^= state[3];
      state[2] ^= shifted;
      state[3] = ((state[3] << 11) | (state[3] >>> 21)) >>> 0;
      return result / 4294967296;
    };
  }

  function categoryRandom(seed, version, category) {
    return prng(hashWords(normalizeSeed(seed) + "|v" + version + "|" + category), version);
  }

  function roll(seed, version, category) {
    return categoryRandom(seed, version, category)();
  }

  function weighted(items, random) {
    const eligible = items.filter(item => Number(item.weight) > 0);
    const total = eligible.reduce((sum, item) => sum + Number(item.weight), 0);
    if (!eligible.length || total <= 0) return null;
    let cursor = random() * total;
    for (const item of eligible) {
      cursor -= Number(item.weight);
      if (cursor < 0) return item;
    }
    return eligible[eligible.length - 1];
  }

  function findByIdOrName(items, value) {
    if (!value && value !== 0) return null;
    if (typeof value === "object" && value.id) value = value.id;
    const needle = String(value).trim().toLowerCase();
    if (!needle || needle === "auto") return null;
    return items.find(item => item.id.toLowerCase() === needle || item.name.toLowerCase() === needle) || null;
  }

  function rarityLevel(id) {
    return RARITIES.find(item => item.id === id)?.level ?? -1;
  }

  function isTierEligible(option, rarity) {
    return rarity.level >= rarityLevel(option.minRarity || "common") && option.enabled !== false && !option.campOnly;
  }

  function selectionTotals(state) {
    let cost = 0;
    let focalCount = 0;
    CATEGORY_KEYS.forEach(key => {
      const option = state[key];
      cost += Number(option?.cost || 0);
      if (option?.focal) focalCount += 1;
    });
    return { cost, focalCount };
  }

  function exclusionsAllow(state, category, candidate) {
    const candidateExclusions = candidate.excludes || [];
    for (const key of CATEGORY_KEYS) {
      if (key === category) continue;
      const selected = state[key];
      if (!selected) continue;
      if (candidateExclusions.includes(selected.id)) return false;
      if ((selected.excludes || []).includes(candidate.id)) return false;
    }
    return true;
  }

  function generatedRarity(seed, version) {
    return weighted(RARITIES, categoryRandom(seed, version, "rarity"));
  }

  function resolveTraits(seed, options, version) {
    const resolvedVersion = version === undefined ? VERSION : Number(version);
    if (resolvedVersion !== VERSION) throw new Error("Unsupported Hex Owl version: " + version);
    const normalized = normalizeSeed(seed);
    const config = options && typeof options === "object" ? options : {};
    const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : config;
    const repairs = [];
    const forcedKeys = new Set();
    const requestedRarity = config.rarity !== undefined ? config.rarity : overrides.rarity;
    let rarity = findByIdOrName(RARITIES, requestedRarity);
    if (!rarity) {
      rarity = generatedRarity(normalized, resolvedVersion);
      if (requestedRarity && String(requestedRarity).toLowerCase() !== "auto") {
        repairs.push("Unknown rarity override was replaced with the seeded rarity.");
      }
    }

    const state = {
      ringMode: RING_MODES[0],
      ringStyle: RING_STYLES[0],
      direction: DIRECTIONS[0],
      brow: BROWS[0],
      eyes: EYES[0],
      beak: BEAKS[0],
      marking: MARKINGS[0],
      accessory: ACCESSORIES[0],
      aura: AURAS[0]
    };
    let palette = weighted(PALETTES, categoryRandom(normalized, resolvedVersion, "palette"));
    const mandatory = new Set();

    function canApply(category, candidate) {
      if (!candidate || !isTierEligible(candidate, rarity)) return false;
      if (!exclusionsAllow(state, category, candidate)) return false;
      const prior = state[category];
      state[category] = candidate;
      const totals = selectionTotals(state);
      state[category] = prior;
      return totals.cost <= rarity.budget && totals.focalCount <= rarity.focalCap;
    }

    function apply(category, candidate) {
      if (!canApply(category, candidate)) return false;
      state[category] = candidate;
      return true;
    }

    if (rarity.id === "rare" || rarity.id === "legendary") {
      state.brow = findByIdOrName(BROWS, "three-band-prism");
      mandatory.add("brow");
    }
    if (rarity.id === "legendary") {
      state.ringMode = findByIdOrName(RING_MODES, "festival-prism");
      mandatory.add("ringMode");
    }

    const paletteOverride = findByIdOrName(PALETTES, overrides.palette || overrides.face);
    if (paletteOverride) {
      palette = paletteOverride;
      forcedKeys.add("palette");
    } else if ((overrides.palette || overrides.face) && String(overrides.palette || overrides.face).toLowerCase() !== "auto") {
      repairs.push("Unknown palette override was replaced with the seeded palette.");
    }

    CATEGORY_KEYS.forEach(category => {
      const legacyKey = category === "direction" ? "ringDirection" : category;
      const supplied = overrides[category] !== undefined ? overrides[category] : overrides[legacyKey];
      if (supplied === undefined || supplied === null || supplied === "" || String(supplied).toLowerCase() === "auto") return;
      const candidate = findByIdOrName(CATEGORIES[category], supplied);
      if (!candidate) {
        repairs.push("Unknown " + category + " override was replaced.");
        return;
      }
      forcedKeys.add(category);
      if (mandatory.has(category) && state[category].id !== candidate.id) {
        repairs.push(candidate.name + " was replaced by required " + state[category].name + " grammar.");
        return;
      }
      if (!apply(category, candidate)) {
        repairs.push(candidate.name + " was incompatible with " + rarity.name + " and was replaced.");
      }
    });

    if (!forcedKeys.has("direction")) {
      if (rarity.level >= 1 && roll(normalized, resolvedVersion, "direction-reverse") < 0.5) {
        state.direction = DIRECTIONS[1];
      } else {
        state.direction = DIRECTIONS[0];
      }
    }

    if (rarity.id === "uncommon" && !forcedKeys.has("brow") && roll(normalized, resolvedVersion, "uncommon-brow-colour") < 0.25) {
      apply("brow", findByIdOrName(BROWS, "brow-tint"));
    }

    if (rarity.level >= 2) {
      const auraAttempt = !forcedKeys.has("aura") && roll(normalized, resolvedVersion, "rare-aura-attempt") < 0.5;
      const laserAttempt = !forcedKeys.has("eyes") && roll(normalized, resolvedVersion, "rare-laser-attempt") < 0.25;
      const auraCandidate = weighted(AURAS.filter(item => item.id !== "quiet-aura" && isTierEligible(item, rarity)), categoryRandom(normalized, resolvedVersion, "aura"));
      const laserCandidate = findByIdOrName(EYES, "pupil-lasers");
      const laserFirst = roll(normalized, resolvedVersion, "rare-focal-order") < 0.5;
      if (laserFirst) {
        if (laserAttempt) apply("eyes", laserCandidate);
        if (auraAttempt) apply("aura", auraCandidate);
      } else {
        if (auraAttempt) apply("aura", auraCandidate);
        if (laserAttempt) apply("eyes", laserCandidate);
      }
    }

    const beakAttempt = forcedKeys.has("beak") ||
      roll(normalized, resolvedVersion, "beak-attempt") < (rarity.id === "common" ? 0.5 : 0.65);
    if (beakAttempt && !forcedKeys.has("beak") && state.beak.id === "original-beak") {
      const beakChoices = BEAKS.filter(item => item.cost > 0 && isTierEligible(item, rarity));
      apply("beak", weighted(beakChoices, categoryRandom(normalized, resolvedVersion, "beak")));
    }

    const quietOrder = QUIET_ORDERS[Math.floor(roll(normalized, resolvedVersion, "quiet-order") * QUIET_ORDERS.length) % QUIET_ORDERS.length];
    quietOrder.forEach(category => {
      if (forcedKeys.has(category)) return;
      if (mandatory.has(category)) return;
      if (category === "beak" && !beakAttempt) return;
      if (state[category] && state[category].cost > 0) return;
      const choices = CATEGORIES[category].filter(item =>
        item.cost > 0 &&
        !item.focal &&
        item.id !== "brow-tint" &&
        isTierEligible(item, rarity) &&
        canApply(category, item)
      );
      if (!choices.length) return;
      const candidate = weighted(choices, categoryRandom(normalized, resolvedVersion, "quiet-" + category));
      apply(category, candidate);
    });

    // If the first quiet pass leaves capacity, deterministically upgrade an
    // already-selected quiet treatment. This preserves the 50% Common beak
    // gate and focal caps while making the larger tiers visibly earn their
    // additional density budget.
    quietOrder.forEach(category => {
      const used = selectionTotals(state).cost;
      if (used >= rarity.budget || forcedKeys.has(category) || mandatory.has(category)) return;
      if (category === "beak" && !beakAttempt) return;
      const current = state[category];
      const upgrades = CATEGORIES[category].filter(item =>
        !item.focal &&
        item.id !== "brow-tint" &&
        item.cost > Number(current?.cost || 0) &&
        isTierEligible(item, rarity) &&
        canApply(category, item)
      );
      if (!upgrades.length) return;
      apply(category, weighted(upgrades, categoryRandom(normalized, resolvedVersion, "upgrade-" + category)));
    });

    const totals = selectionTotals(state);
    const ringColours = state.ringMode.multicolor
      ? [palette.tokens.ring, palette.tokens.focal, palette.tokens.beam, palette.tokens.highlight]
      : [palette.tokens.ring, palette.tokens.ring, palette.tokens.ring, palette.tokens.ring];
    const rings = deepFreeze({
      id: state.ringMode.id,
      name: state.ringMode.multicolor ? palette.name + " Festival Prism" : palette.name + " Portal",
      colors: ringColours,
      multicolor: state.ringMode.multicolor
    });
    const selectionIds = {};
    CATEGORY_KEYS.forEach(key => { selectionIds[key] = state[key].id; });
    selectionIds.palette = palette.id;

    return deepFreeze({
      version: VERSION,
      seed: normalized,
      palette,
      face: palette,
      rings,
      ringMode: state.ringMode,
      ringStyle: state.ringStyle,
      direction: state.direction,
      ringDirection: state.direction.name,
      brow: state.brow,
      eyes: state.eyes,
      beak: state.beak,
      marking: state.marking,
      accessory: state.accessory,
      aura: state.aura,
      rarity,
      cost: totals.cost,
      budget: rarity.budget,
      focalCount: totals.focalCount,
      focalCap: rarity.focalCap,
      selectionIds: deepFreeze(selectionIds),
      repairs: deepFreeze(repairs.slice())
    });
  }

  function selectTraits(seed, version) {
    return resolveTraits(seed, {}, version === undefined ? VERSION : version);
  }

  function validateTraits(traits) {
    const issues = [];
    if (!traits || typeof traits !== "object") {
      return deepFreeze({ valid: false, issues: ["Traits are missing."], repairs: [] });
    }
    const rarity = findByIdOrName(RARITIES, traits.rarity);
    if (!rarity) issues.push("Rarity is not in the V1 manifest.");
    const palette = findByIdOrName(PALETTES, traits.palette || traits.face);
    if (!palette) issues.push("Palette is not in the V1 manifest.");
    const chosen = [];
    CATEGORY_KEYS.forEach(category => {
      const supplied = traits[category] || (category === "direction" ? traits.ringDirection : null);
      const option = findByIdOrName(CATEGORIES[category], supplied);
      if (!option) {
        issues.push(category + " is not in the V1 manifest.");
      } else {
        chosen.push({ category, option });
        if (rarity && !isTierEligible(option, rarity)) issues.push(option.name + " is not eligible for " + rarity.name + ".");
        if (option.campOnly) issues.push(option.name + " is camp-only and excluded from ordinary generation.");
      }
    });
    const computedCost = chosen.reduce((sum, item) => sum + Number(item.option.cost || 0), 0);
    const computedFocals = chosen.reduce((sum, item) => sum + (item.option.focal ? 1 : 0), 0);
    if (rarity && computedCost > rarity.budget) issues.push("Trait cost exceeds the rarity budget.");
    if (rarity && computedFocals > rarity.focalCap) issues.push("Focal trait count exceeds the rarity cap.");
    for (let index = 0; index < chosen.length; index += 1) {
      for (let other = index + 1; other < chosen.length; other += 1) {
        const left = chosen[index].option;
        const right = chosen[other].option;
        if ((left.excludes || []).includes(right.id) || (right.excludes || []).includes(left.id)) {
          issues.push(left.name + " conflicts with " + right.name + ".");
        }
      }
    }
    const brow = findByIdOrName(BROWS, traits.brow);
    const ringMode = findByIdOrName(RING_MODES, traits.ringMode);
    if (rarity && rarity.level >= 2 && brow?.id !== "three-band-prism") issues.push(rarity.name + " requires a multicolour prism brow.");
    if (rarity?.id === "legendary" && ringMode?.id !== "festival-prism") issues.push("Legendary requires palette-linked multicolour portal rings.");
    if (rarity && rarity.id !== "legendary" && ringMode?.multicolor) issues.push("Multicolour portal rings are Legendary-only.");
    return deepFreeze({
      valid: issues.length === 0,
      issues,
      repairs: Array.isArray(traits.repairs) ? traits.repairs.slice() : [],
      computedCost,
      computedFocals
    });
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
      return subpath.replace(start[0], "M " + absolute[0] + "," + absolute[1]);
    });
  }

  function mountBase(rootDocument) {
    const documentRoot = rootDocument || globalThis.document;
    if (!documentRoot?.createElementNS || typeof globalThis.fetch !== "function") return Promise.resolve(false);
    const markIsMounted = () =>
      documentRoot.getElementById(SHARED_MARK_ID) &&
      Object.values(BROW_MARK_IDS).every(id => documentRoot.getElementById(id));
    if (markIsMounted()) return Promise.resolve(true);
    if (baseMountDocument === documentRoot && baseMountPromise) return baseMountPromise;
    baseMountDocument = documentRoot;
    baseMountPromise = globalThis.fetch(OWL_ASSET).then(response => {
      if (!response.ok) throw new Error("Could not load the Hex Owl base (" + response.status + ").");
      return response.text();
    }).then(source => {
      if (markIsMounted()) return true;
      const Parser = documentRoot.defaultView?.DOMParser || globalThis.DOMParser;
      const parsed = new Parser().parseFromString(source, "image/svg+xml");
      const suppliedSvg = parsed.documentElement;
      const suppliedPath = parsed.querySelector("#shambhala-owl-mark");
      if (!suppliedPath || suppliedSvg.getAttribute("viewBox") !== "0 0 1448 1446") {
        throw new Error("The supplied Hex Owl base geometry is missing or changed.");
      }
      const browPaths = splitClosedSubpaths(suppliedPath.getAttribute("d")).slice(-4);
      if (browPaths.length !== 4) throw new Error("The supplied Hex Owl brow components are missing.");
      const namespace = "http://www.w3.org/2000/svg";
      const sprite = documentRoot.createElementNS(namespace, "svg");
      const definitions = documentRoot.createElementNS(namespace, "defs");
      const sharedPath = documentRoot.importNode(suppliedPath, true);
      sharedPath.id = SHARED_MARK_ID;
      sharedPath.removeAttribute("fill");
      definitions.append(sharedPath);
      Object.values(BROW_MARK_IDS).forEach((id, index) => {
        const sharedBrow = documentRoot.createElementNS(namespace, "path");
        sharedBrow.setAttribute("id", id);
        sharedBrow.setAttribute("d", browPaths[index]);
        definitions.append(sharedBrow);
      });
      sprite.append(definitions);
      sprite.setAttribute("aria-hidden", "true");
      sprite.setAttribute("focusable", "false");
      sprite.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
      (documentRoot.body || documentRoot.documentElement).prepend(sprite);
      return true;
    }).catch(() => {
      if (baseMountDocument === documentRoot) baseMountPromise = null;
      return false;
    });
    return baseMountPromise;
  }

  function hydrate(root) {
    const documentRoot = root?.ownerDocument || (root?.createElementNS ? root : globalThis.document);
    const scope = root?.querySelectorAll ? root : documentRoot;
    if (!documentRoot || !scope?.querySelectorAll) return Promise.resolve(0);
    return mountBase(documentRoot).then(mounted => {
      if (!mounted) return 0;
      let replacements = 0;
      const uses = Array.from(scope.querySelectorAll('use[href^="#' + SHARED_MARK_ID + '"]'));
      uses.forEach(use => {
        const href = use.getAttribute("href") || "";
        const source = href.startsWith("#") ? documentRoot.getElementById(href.slice(1)) : null;
        if (!source || typeof use.replaceWith !== "function") return;
        const path = documentRoot.importNode(source, true);
        path.removeAttribute("id");
        Array.from(use.attributes || []).forEach(attribute => {
          const name = attribute.name ?? attribute[0];
          const value = attribute.value ?? attribute[1];
          if (name && name !== "href") path.setAttribute(name, value);
        });
        path.setAttribute("data-hex-owl-inline", href.slice(1));
        use.replaceWith(path);
        replacements += 1;
      });
      return replacements;
    });
  }

  function layer(name, contents, attributes) {
    return '<g data-layer="' + name + '"' + (attributes || "") + ">" + (contents || "") + "</g>";
  }

  function auraSvg(traits, ids) {
    const aura = traits.aura;
    const tokens = traits.palette.tokens;
    if (aura.id === "radial-glow") {
      return '<circle cx="50" cy="50" r="47" fill="url(#' + ids.glow + ')"/>';
    }
    if (aura.id === "portal-rays") {
      const rays = "M50 3v10M50 87v10M3 50h10M87 50h10M16.2 16.2l7.1 7.1M76.7 76.7l7.1 7.1M83.8 16.2l-7.1 7.1M23.3 76.7l-7.1 7.1";
      return '<g fill="none" stroke-linecap="round"><path d="' + rays + '" stroke="' + tokens.beam + '" stroke-width="2.4" opacity=".14"/>' +
        '<path d="' + rays + '" stroke="' + tokens.focal + '" stroke-width="1.05" opacity=".72"/></g>';
    }
    if (aura.id === "stardust") {
      return '<g fill="' + tokens.focal + '" opacity=".86">' +
        '<path d="M13 22.5l1.25 2.85 2.85 1.25-2.85 1.25L13 30.7l-1.25-2.85L8.9 26.6l2.85-1.25zM86 63l1.15 2.65 2.65 1.15-2.65 1.15L86 70.6l-1.15-2.65-2.65-1.15 2.65-1.15zM80 15l.9 2.1 2.1.9-2.1.9L80 21l-.9-2.1L77 18l2.1-.9zM22 77l.95 2.2 2.2.95-2.2.95-.95 2.2-.95-2.2-2.2-.95 2.2-.95z"/>' +
        '<circle cx="84" cy="31" r="1"/><circle cx="17" cy="66" r=".95"/><circle cx="72" cy="10" r=".82"/><circle cx="29" cy="90" r=".88"/>' +
        "</g>";
    }
    return "";
  }

  const LASER_SPLITS = deepFreeze({
    clockwise: {
      left: { pupil: "34.8890 52.4455", innerEnd: "21.9491 56.2046", outerStart: "21.0491 56.4661", endpoint: "2.0000 62.0000" },
      right: { pupil: "65.1840 52.4455", innerEnd: "78.0509 56.1917", outerStart: "78.9509 56.4538", endpoint: "98.0000 62.0000" }
    },
    "counter-clockwise": {
      left: { pupil: "34.8890 52.4455", innerEnd: "21.9491 56.2046", outerStart: "21.0491 56.4661", endpoint: "2.0000 62.0000" },
      right: { pupil: "65.1840 52.4455", innerEnd: "78.0509 56.1917", outerStart: "78.9509 56.4538", endpoint: "98.0000 62.0000" }
    }
  });

  function laserSegmentSvg(traits, section) {
    if (traits.eyes.id !== "pupil-lasers") return "";
    const splits = LASER_SPLITS[traits.direction.id];
    const beam = traits.palette.tokens.beam;
    const ends = section === "inner"
      ? [
          [splits.left.pupil, splits.left.innerEnd],
          [splits.right.pupil, splits.right.innerEnd]
        ]
      : [
          [splits.left.outerStart, splits.left.endpoint],
          [splits.right.outerStart, splits.right.endpoint]
        ];
    return '<g fill="none" stroke-linecap="round">' +
      ends.map(pair =>
        '<path d="M' + pair[0] + "L" + pair[1] + '" stroke="' + beam + '" stroke-width="2.35" opacity=".20"/>' +
        '<path d="M' + pair[0] + "L" + pair[1] + '" stroke="' + beam + '" stroke-width=".78"/>'
      ).join("") +
      "</g>";
  }

  function ringsSvg(traits) {
    const reverse = traits.direction.id === "counter-clockwise";
    return GEOMETRY.rings.map((ring, index) => {
      const points = reverse ? ring.reversePoints : ring.points;
      const width = (ring.strokeWidth * traits.ringStyle.widthFactor).toFixed(3);
      const opacity = ["1", ".95", ".91", ".87"][index];
      const dash = traits.ringStyle.dash ? ' stroke-dasharray="' + traits.ringStyle.dash + '"' : "";
      const common = ' points="' + points + '" fill="none" stroke-linejoin="round" stroke-linecap="' + traits.ringStyle.linecap + '"';
      const primary = '<polygon data-ring="' + ring.id + '" data-rotation="' + (reverse ? -ring.rotation : ring.rotation) + '" data-radius="' + ring.radius.toFixed(2) + '" data-stroke="' + width + '"' +
        common + ' stroke="' + traits.rings.colors[index] + '" stroke-width="' + width + '"' + dash + ' opacity="' + opacity + '"/>';
      if (traits.ringStyle.id !== "double-line") return primary;
      const cutWidth = (Number(width) * 0.44).toFixed(3);
      return primary + '<polygon data-ring-cut="' + ring.id + '"' + common + ' stroke="#090716" stroke-width="' + cutWidth + '" opacity=".96"/>';
    }).join("");
  }

  function browSvg(traits) {
    const tokens = traits.palette.tokens;
    const use = (part, colour, opacity) =>
      '<use href="#' + BROW_MARK_IDS[part] + '" fill="' + colour + '" opacity="' + (opacity === undefined ? "1" : opacity) + '" transform="' + OWL_TRANSFORM + '"/>';
    if (traits.brow.id === "crown-gem") return use("gem", tokens.focal);
    if (traits.brow.id === "brow-echo") return use("lower", tokens.shadow, ".92") + use("upper", tokens.highlight, ".94");
    if (traits.brow.id === "brow-tint") return use("middle", tokens.focal, ".96") + use("upper", tokens.highlight, ".88");
    if (traits.brow.id === "moonstone-crest") return use("upper", tokens.highlight) + use("gem", "#fefdf0");
    if (traits.brow.id === "three-band-prism") {
      return use("lower", tokens.beam) + use("middle", tokens.focal) + use("upper", tokens.highlight) + use("gem", tokens.ring);
    }
    return "";
  }

  function facialDetailsSvg(traits) {
    const tokens = traits.palette.tokens;
    if (traits.marking.id === "moon-freckles") {
      return '<g fill="' + tokens.highlight + '" opacity=".88"><circle cx="39.2" cy="64.4" r=".52"/><circle cx="41.1" cy="65.7" r=".44"/><circle cx="42.4" cy="67.1" r=".36"/><circle cx="60.8" cy="64.4" r=".52"/><circle cx="58.9" cy="65.7" r=".44"/><circle cx="57.6" cy="67.1" r=".36"/></g>';
    }
    if (traits.marking.id === "ember-specks") {
      return '<g fill="' + tokens.focal + '"><circle cx="38.9" cy="64.4" r=".47"/><circle cx="41.0" cy="66.2" r=".35"/><circle cx="42.5" cy="67.7" r=".28"/><circle cx="61.1" cy="64.4" r=".47"/><circle cx="59.0" cy="66.2" r=".35"/><circle cx="57.5" cy="67.7" r=".28"/></g>';
    }
    if (traits.marking.id === "diamond-dust") {
      return '<g fill="' + tokens.highlight + '"><path d="M39.3 63.9l.8 1.2-.8 1.2-.8-1.2zM41.6 66.2l.65.95-.65.95-.65-.95zM60.7 63.9l.8 1.2-.8 1.2-.8-1.2zM58.4 66.2l.65.95-.65.95-.65-.95z"/></g>';
    }
    return "";
  }

  function beakSvg(traits) {
    const tokens = traits.palette.tokens;
    if (traits.beak.id === "amber-shard") {
      return '<g transform="translate(0 -4.2384)" data-beak-bottom="60.5116"><path d="M48.8 60.55L50 64.75l1.2-4.2L50 59.85z" fill="#ffce58"/><path d="M50 60.35v3.55" stroke="#fff4bd" stroke-width=".30"/></g>';
    }
    if (traits.beak.id === "moonstone-shard") {
      return '<g transform="translate(0 -4.2384)" data-beak-bottom="60.5116"><path d="M48.8 60.55L50 64.75l1.2-4.2L50 59.85z" fill="' + tokens.highlight + '"/><path d="M50 60.35v3.55" stroke="#ffffff" stroke-width=".28" opacity=".78"/></g>';
    }
    if (traits.beak.id === "chevron-beak") {
      return '<g transform="translate(0 -4.2484)" data-beak-bottom="60.5116"><path d="M48.9 60.65L50 61.65l1.1-1M49.35 62.15L50 64.45l.65-2.3" fill="none" stroke="' + tokens.focal + '" stroke-width=".62" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
    if (traits.beak.id === "chevron-diamond") {
      return '<g transform="translate(0 -4.0884)" data-beak-bottom="60.5116"><path d="M48.9 60.65L50 61.65l1.1-1" fill="none" stroke="' + tokens.focal + '" stroke-width=".62" stroke-linecap="round"/><path d="M50 62l.86 1.25L50 64.6l-.86-1.35z" fill="' + tokens.highlight + '"/></g>';
    }
    return "";
  }

  function eyesSvg(traits) {
    if (traits.eyes.id === "original-eyes" || traits.eyes.id === "pupil-lasers") return "";
    const tokens = traits.palette.tokens;
    const colour = traits.eyes.id === "festival-eye-wells" ? tokens.focal : tokens.beam;
    return '<g data-eye-treatment="' + traits.eyes.id + '" fill="' + colour + '">' +
      '<rect x="30.8740" y="50.7665" width="9.2345" height="7.1540"/><rect x="59.8550" y="50.7665" width="9.2345" height="7.1540"/></g>';
  }

  function renderResolved(traits) {
    const validation = validateTraits(traits);
    if (!validation.valid) throw new Error("Invalid Hex Owl traits: " + validation.issues.join(" "));
    const selectionSignature = ["palette"].concat(CATEGORY_KEYS)
      .map(key => traits.selectionIds[key])
      .join("|");
    const idRoot = "hex-owl-" + traits.seed.slice(0, 12) + "-" + hashWords(selectionSignature).slice(0, 8);
    const ids = { safe: idRoot + "-safe", glow: idRoot + "-glow" };
    const tokens = traits.palette.tokens;
    const definitions =
      '<defs><clipPath id="' + ids.safe + '"><polygon points="' + GEOMETRY.safeZones.innerPortal.points + '"/></clipPath>' +
      '<radialGradient id="' + ids.glow + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="' + tokens.focal + '" stop-opacity="0"/><stop offset=".50" stop-color="' + tokens.focal + '" stop-opacity="0"/><stop offset=".68" stop-color="' + tokens.focal + '" stop-opacity=".30"/><stop offset=".84" stop-color="' + tokens.ring + '" stop-opacity=".42"/><stop offset="1" stop-color="' + tokens.beam + '" stop-opacity="0"/></radialGradient></defs>';
    const backdrop =
      '<ellipse cx="50" cy="53.5" rx="26.7" ry="24.8" fill="#090716"/>' +
      '<path d="M29 50q4-18 21-27 17 9 21 27z" fill="#090716"/>';
    // Keep this vector-only: an external SVG image mask caused zoom-dependent
    // rectangular raster artifacts in Android Chrome.
    const base = '<use href="#' + SHARED_MARK_ID + '" fill="' + tokens.face + '" transform="' + OWL_TRANSFORM + '"/>';
    const clipped = ' clip-path="url(#' + ids.safe + ')"';
    const body =
      layer("background", '<rect width="100" height="100" rx="10" fill="#090716"/>') +
      layer("aura", auraSvg(traits, ids), ' data-aura="' + traits.aura.id + '"') +
      layer("laser-outer", laserSegmentSvg(traits, "outer"), ' data-crossing-exception="' + (traits.eyes.id === "pupil-lasers" ? "laser" : "none") + '"') +
      layer("portal-rings", ringsSvg(traits), ' data-direction="' + traits.direction.id + '"') +
      layer("owl-backdrop", backdrop) +
      layer("eyes", eyesSvg(traits), clipped) +
      layer("owl-base", base) +
      layer("brows", browSvg(traits), clipped) +
      layer("facial-details", facialDetailsSvg(traits), clipped) +
      layer("beak", beakSvg(traits), clipped) +
      layer("accessories", "", clipped) +
      layer("laser-inner", laserSegmentSvg(traits, "inner"), ' data-origin="exact-pupils"');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Algorithmically generated Hex Owl" preserveAspectRatio="xMidYMid meet" data-hex-owl-version="1" data-rarity="' + traits.rarity.id + '" data-cost="' + traits.cost + '">' +
      '<title>Hex Owl, ' + traits.rarity.name + ' 2026 edition</title>' +
      '<desc>Exact Shambhala Owl anatomy inside four measured portal rings. Traits are deterministically selected from the frozen V1 manifest.</desc>' +
      definitions + body + "</svg>";
  }

  function renderWithTraits(seed, traitsOrOptions, version) {
    const resolvedVersion = version === undefined ? VERSION : Number(version);
    if (resolvedVersion !== VERSION) throw new Error("Unsupported Hex Owl version: " + version);
    let traits = traitsOrOptions;
    if (!traits || typeof traits !== "object" || !traits.palette || !traits.rarity || !traits.selectionIds) {
      traits = resolveTraits(seed, traitsOrOptions || {}, resolvedVersion);
    } else {
      const forced = {};
      Object.keys(traits.selectionIds || {}).forEach(key => { forced[key] = traits.selectionIds[key]; });
      traits = resolveTraits(seed, { rarity: traits.rarity.id, overrides: forced }, resolvedVersion);
    }
    return renderResolved(traits);
  }

  function renderSvg(seed, version) {
    const resolvedVersion = version === undefined ? VERSION : Number(version);
    return renderResolved(selectTraits(seed, resolvedVersion));
  }

  function traitNames(seed, version) {
    const traits = selectTraits(seed, version === undefined ? VERSION : version);
    return deepFreeze({
      "Eye style": traits.eyes.name,
      "Owl colour": traits.palette.name,
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

  function catalogue() {
    return SPEC.catalogue;
  }

  const API = deepFreeze({
    VERSION,
    SPEC,
    normalizeSeed,
    randomSeed,
    selectTraits,
    resolveTraits,
    validateTraits,
    renderSvg,
    renderWithTraits,
    traitNames,
    catalogue,
    mountBase,
    hydrate
  });
  globalThis.HexOwl = API;
  if (typeof window !== "undefined") window.HexOwl = API;
  if (globalThis.window && globalThis.window !== globalThis) globalThis.window.HexOwl = API;

  if (globalThis.document) {
    const hydrateDocument = () => { void hydrate(globalThis.document); };
    if (globalThis.document.readyState === "loading") {
      globalThis.document.addEventListener("DOMContentLoaded", hydrateDocument, { once: true });
    } else {
      hydrateDocument();
    }
    globalThis.addEventListener?.("online", hydrateDocument);
  }
})();
