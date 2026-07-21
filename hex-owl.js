// Hex Owl renderer. V1/V2/V3 remain frozen compatibility grammars while every
// current Owl uses one V4 identity contract with a public or Camp Hexadecibel
// rarity tier.
//
// The legacy manifests and rendering paths remain byte-stable for regression
// and migration. Persistence normalizes current identities to V4; the tier
// dispatches to the matching frozen roll grammar.
(() => {
  "use strict";

  const V1_VERSION = 1;
  const V2_VERSION = 2;
  const CAMP_VERSION = 3;
  const VERSION = 4;
  const PUBLIC_TIER = "public";
  const CAMP_TIER = "camp-hexadecibel";
  const HEX_SEED = /^[0-9a-f]{32}$/i;
  const OWL_ASSET = "./hex-owl-base.svg?v=74";
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

  const V1_SPEC = deepFreeze({
    id: "hex-owl-v1",
    version: V1_VERSION,
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

  const V2_RARITIES = deepFreeze([
    { id: "common", name: "Common", weight: 50, budget: 3, focalCap: 0, level: 0, supportCap: 3, treatmentCap: 3 },
    { id: "rare", name: "Rare", weight: 30, budget: 7, focalCap: 1, level: 1, supportCap: 2, treatmentCap: 3 },
    { id: "legendary", name: "Legendary", weight: 20, budget: 9, focalCap: 1, level: 2, supportCap: 1, treatmentCap: 3 }
  ]);

  // The live V1 renderer has 36 public palettes (12 families with Daylight,
  // Electric, and Midnight variants). V2 preserves all of them; the disabled
  // Blacklight family is catalogue-only until a provenance-aware camp mint
  // path exists.
  const BLACKLIGHT_PALETTE = deepFreeze({
    id: "blacklight",
    name: "Blacklight",
    variantName: "Camp-only",
    familyId: "blacklight",
    familyName: "Blacklight",
    source: "camp-hexadecibel",
    sourceHex: "#29e07d",
    weight: 0,
    cost: 0,
    focal: false,
    minRarity: "common",
    campOnly: true,
    enabled: false,
    tokens: { face: "#29e07d", shadow: "#0a5c33", highlight: "#eafff2", focal: "#c8ff3d", ring: "#35f58c", beam: "#52ffa1" },
    face: "#29e07d",
    shade: "#0a5c33",
    accent: "#eafff2"
  });
  const V2_PALETTES = deepFreeze(PALETTES.concat([BLACKLIGHT_PALETTE]));
  const V2_PUBLIC_PALETTES = deepFreeze(V2_PALETTES.filter(palette => palette.enabled !== false && !palette.campOnly));
  const V2_PALETTE_FAMILIES = deepFreeze(PALETTE_FAMILIES.concat([{
    id: "blacklight",
    name: "Blacklight",
    source: "camp-hexadecibel",
    sourceHex: "#29e07d",
    campOnly: true,
    enabled: false,
    variants: [BLACKLIGHT_PALETTE]
  }]));

  const V2_RING_MODES = deepFreeze([
    { id: "single", name: "Coordinated Single Colour", weight: 100, cost: 0, focal: false, hero: false, minRarity: "common", multicolor: false },
    { id: "festival-prism", name: "Palette-linked Festival Prism", weight: 0, cost: 2, focal: false, hero: false, minRarity: "legendary", multicolor: true, excludes: ["double-line"] }
  ]);
  const V2_RING_STYLES = deepFreeze([
    { id: "solid", name: "Solid Portal", weight: 28, cost: 0, focal: false, hero: false, minRarity: "common", widthFactor: 1.00, dash: "", linecap: "round" },
    { id: "fine", name: "Fine Lines", weight: 16, cost: 1, focal: false, hero: false, minRarity: "common", widthFactor: 0.56, dash: "", linecap: "round" },
    { id: "beat-dash", name: "Beat Dash", weight: 22, cost: 1, focal: false, hero: false, minRarity: "common", widthFactor: 0.72, dash: "2.20 1.10", linecap: "round" },
    { id: "dotted", name: "Dotted Signal", weight: 14, cost: 1, focal: false, hero: false, minRarity: "common", widthFactor: 0.72, dash: "0.01 2.10", linecap: "round" },
    { id: "double-line", name: "Double Line", weight: 10, cost: 2, focal: false, hero: false, minRarity: "common", widthFactor: 0.96, dash: "", linecap: "round", excludes: ["festival-prism"] },
    { id: "comet-dash", name: "Comet Dash", weight: 10, cost: 1, focal: false, hero: false, minRarity: "common", widthFactor: 0.72, dash: "3.60 1.20 0.70 1.20", linecap: "round" }
  ]);
  const V2_DIRECTIONS = deepFreeze([
    { id: "clockwise", name: "Clockwise", weight: 50, cost: 0, focal: false, hero: false, minRarity: "common" },
    { id: "counter-clockwise", name: "Counter-clockwise", weight: 50, cost: 0, focal: false, hero: false, minRarity: "common" }
  ]);
  const V2_BROWS = deepFreeze([
    { id: "original-crown", name: "Original Crown", weight: 1, cost: 0, focal: false, hero: false, minRarity: "common", safeZone: "brows", bounds: [26.5799, 23.6418, 73.4330, 49.7415] },
    { id: "crown-gem", name: "Top-ridge Gem", weight: 20, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "brows", bounds: [44.0982, 23.6418, 55.8689, 28.0280] },
    { id: "brow-echo", name: "Brow Echo", weight: 18, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "brows", bounds: [26.5799, 25.5127, 73.4330, 49.7415] },
    { id: "brow-tint", name: "Festival Brow Tint", weight: 16, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "brows", bounds: [30.7645, 25.5127, 69.2248, 42.2230] },
    { id: "moonstone-crest", name: "Moonstone Crest", weight: 14, cost: 2, focal: false, hero: false, minRarity: "common", safeZone: "brows", bounds: [36.7742, 23.6418, 63.2130, 34.2279] },
    { id: "twin-gems", name: "Twin Gems", weight: 14, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "brows", bounds: [29.85, 42.9, 70.15, 45.2] },
    { id: "dusk-fade", name: "Dusk Fade Crown", weight: 14, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "brows", bounds: [26.5799, 25.5127, 73.4330, 49.7415] },
    { id: "third-eye", name: "Third Eye", weight: 12, cost: 1, focal: false, hero: false, minRarity: "rare", safeZone: "brows", bounds: [48.1, 44.7, 51.9, 48.5] },
    { id: "three-band-prism", name: "Three-band Prism", weight: 0, cost: 2, focal: true, hero: true, minRarity: "rare", safeZone: "brows", bounds: [26.5799, 23.6418, 73.4330, 49.7415], multicolor: true }
  ]);
  const V2_EYES = deepFreeze([
    { id: "original-eyes", name: "Original Shambhala", weight: 26, cost: 0, focal: false, hero: false, minRarity: "common", safeZone: "eyes", bounds: [34.0, 51.5, 66.1, 53.4] },
    { id: "festival-eye-wells", name: "Festival Eye Wells", weight: 22, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "eyeFields", bounds: [30, 49.8, 70, 58.5] },
    { id: "electric-eye-wells", name: "Electric Eye Wells", weight: 20, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "eyeFields", bounds: [30, 49.8, 70, 58.5] },
    { id: "midnight-eye-wells", name: "Midnight Eye Wells", weight: 18, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "eyeFields", bounds: [30, 49.8, 70, 58.5] },
    { id: "sleepy-lids", name: "Sleepy Lids", weight: 14, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "eyeFields", bounds: [30, 49.8, 70, 58.5] },
    { id: "heterochroma-wells", name: "Heterochroma Wells", weight: 8, cost: 2, focal: false, hero: false, minRarity: "rare", safeZone: "eyeFields", bounds: [30, 49.8, 70, 58.5] },
    { id: "pupil-lasers", name: "Pupil Lasers", weight: 0, cost: 3, focal: true, hero: true, minRarity: "rare", safeZone: "laserCorridor", bounds: [1.4, 50.7, 98.6, 63.2], crossingException: true },
    { id: "radiant-gaze", name: "Radiant Gaze", weight: 0, cost: 3, focal: true, hero: true, minRarity: "rare", safeZone: "eyeFields", bounds: [30, 49.8, 70, 58.5] }
  ]);
  const V2_BEAKS = deepFreeze([
    { id: "original-beak", name: "Original Mark", weight: 1, cost: 0, focal: false, hero: false, minRarity: "common", safeZone: "beak", bounds: [49.9944, 60.5116, 49.9944, 60.5116] },
    { id: "amber-shard", name: "Amber Shard", weight: 28, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "beak", bounds: [48.8, 55.6116, 51.2, 60.5117] },
    { id: "moonstone-facet", name: "Moonstone Facet", weight: 24, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "beak", bounds: [48.6, 55.9616, 51.4, 60.5116] },
    { id: "bold-chevron", name: "Bold Chevron", weight: 30, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "beak", bounds: [48.7, 56.2516, 51.3, 60.2516] },
    { id: "ember-tip", name: "Ember Tip", weight: 18, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "beak", bounds: [48.65, 55.8616, 51.35, 60.4616] }
  ]);
  const V2_MARKINGS = deepFreeze([
    { id: "clean-face", name: "Clean Face", weight: 1, cost: 0, focal: false, hero: false, minRarity: "common", safeZone: "face", bounds: [31.0, 39.0, 69.0, 71.0] },
    { id: "moon-freckles", name: "Moon Freckles", weight: 22, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "cheeks", bounds: [36.2, 62.2, 63.8, 69.0] },
    { id: "ember-comet", name: "Ember Comet", weight: 20, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "cheeks", bounds: [36.2, 62.2, 63.8, 69.0] },
    { id: "diamond-dust", name: "Diamond Dust", weight: 20, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "cheeks", bounds: [36.2, 62.2, 63.8, 69.0] },
    { id: "festival-stripes", name: "Festival Stripes", weight: 16, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "cheeks", bounds: [36.2, 62.2, 63.8, 69.0] },
    { id: "hex-studs", name: "Hex Studs", weight: 12, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "cheeks", bounds: [36.2, 62.2, 63.8, 69.0] },
    { id: "cheek-crescents", name: "Cheek Crescents", weight: 10, cost: 1, focal: false, hero: false, minRarity: "common", safeZone: "cheeks", bounds: [36.2, 62.2, 63.8, 69.0] }
  ]);
  // Retired by decision 2026-07: chin-scale art fails the 40-64 px size test.
  // New categories live outside the rings or nowhere.
  const V2_ACCESSORIES = deepFreeze([
    { id: "no-accessory", name: "None", weight: 1, cost: 0, focal: false, hero: false, minRarity: "common", safeZone: "innerPortal", bounds: [50, 50, 50, 50] }
  ]);
  const V2_AURAS = deepFreeze([
    { id: "quiet-aura", name: "Quiet", weight: 1, cost: 0, focal: false, hero: false, minRarity: "common", safeZone: "outer", bounds: [0, 0, 100, 100] },
    { id: "radial-glow", name: "Portal Halo", weight: 24, cost: 2, focal: true, hero: true, minRarity: "rare", safeZone: "outer", bounds: [3, 3, 97, 97] },
    { id: "portal-rays", name: "Restrained Portal Rays", weight: 22, cost: 2, focal: true, hero: true, minRarity: "rare", safeZone: "outer", bounds: [3, 3, 97, 97] },
    { id: "sound-waves", name: "Sound Waves", weight: 20, cost: 2, focal: true, hero: true, minRarity: "rare", safeZone: "outer", bounds: [1, 6, 99, 94] },
    { id: "stardust", name: "Stardust", weight: 18, cost: 2, focal: true, hero: true, minRarity: "rare", safeZone: "outer", bounds: [7, 7, 93, 93] },
    { id: "shooting-star", name: "Shooting Star", weight: 16, cost: 2, focal: true, hero: true, minRarity: "rare", safeZone: "outer", bounds: [9, 6, 90, 84] }
  ]);
  const V2_GEOMETRY = deepFreeze({
    ...GEOMETRY,
    safeZones: {
      ...GEOMETRY.safeZones,
      eyeFields: {
        ...GEOMETRY.safeZones.eyeFields,
        bounds: [30, 49.8, 70, 58.5],
        regions: [[30, 49.8, 41, 58.5], [59, 49.8, 70, 58.5]]
      },
      cheeks: { ...GEOMETRY.safeZones.cheeks, bounds: [36.2, 62.2, 63.8, 69] }
    }
  });
  const V2_CATEGORIES = deepFreeze({
    palette: V2_PALETTES,
    ringMode: V2_RING_MODES,
    ringStyle: V2_RING_STYLES,
    direction: V2_DIRECTIONS,
    brow: V2_BROWS,
    eyes: V2_EYES,
    beak: V2_BEAKS,
    marking: V2_MARKINGS,
    accessory: V2_ACCESSORIES,
    aura: V2_AURAS
  });
  const V2_SUPPORT_KEYS = deepFreeze(["ringStyle", "brow", "eyes", "beak", "marking"]);
  const V2_SUPPORT_ORDERS = deepFreeze(QUIET_ORDERS.map(order => order.filter(category => category !== "accessory")));
  const V2_HERO_POOL = deepFreeze([
    { id: "three-band-prism", category: "brow", weight: 35 },
    { id: "pupil-lasers", category: "eyes", weight: 15 },
    { id: "radiant-gaze", category: "eyes", weight: 15 },
    { id: "aura", category: "aura", weight: 35 }
  ]);
  const V2_SPEC = deepFreeze({
    id: "hex-owl-v2",
    version: V2_VERSION,
    status: "frozen",
    frozenAt: "2026-07-16",
    rarityWeights: { common: 50, rare: 30, legendary: 20 },
    budgets: { common: 3, rare: 7, legendary: 9 },
    rarities: V2_RARITIES,
    paletteFamilies: V2_PALETTE_FAMILIES,
    palettes: V2_PALETTES,
    publicPaletteCount: V2_PUBLIC_PALETTES.length,
    geometry: V2_GEOMETRY,
    layerOrder: LAYER_ORDER,
    specialEligibility: { campOnlyOrdinaryWeight: 0, assignment: "provenance-path-required" },
    catalogue: {
      categories: V2_CATEGORIES,
      paletteFamilies: V2_PALETTE_FAMILIES,
      rarities: V2_RARITIES
    }
  });

  const V3_TIER = deepFreeze({
    id: "camp-hexadecibel",
    name: "Camp Hexadecibel",
    weight: 0,
    ordinaryWeight: 0,
    level: 3,
    budget: 12,
    focalCap: 2,
    heroFloor: 1,
    supportCap: 2,
    treatmentCap: 5,
    assignment: "provenance-path-required",
    initialRun: "about 20-25",
    supply: "unlimited, provenance-gated",
    tradeable: false,
    hexadex: "collectible"
  });
  const V3_PALETTES = deepFreeze([
    { id: "uv-green", name: "UV Green", weight: 30, cost: 0, focal: false, hero: false, campOnly: true,
      tokens: { face: "#29e07d", shadow: "#0a5c33", highlight: "#eafff2", focal: "#c8ff3d", ring: "#35f58c", beam: "#52ffa1" } },
    { id: "uv-yellow", name: "UV Yellow", weight: 14, cost: 0, focal: false, hero: false, campOnly: true,
      tokens: { face: "#e9e13c", shadow: "#665f0e", highlight: "#fefce8", focal: "#ffd21f", ring: "#f5ee55", beam: "#fff36b" } },
    { id: "uv-magenta", name: "UV Magenta", weight: 15, cost: 0, focal: false, hero: false, campOnly: true,
      tokens: { face: "#f24fd0", shadow: "#6d0f57", highlight: "#ffe9fa", focal: "#ff7ade", ring: "#ff66d9", beam: "#ff8ce4" } },
    { id: "uv-orange", name: "UV Orange", weight: 14, cost: 0, focal: false, hero: false, campOnly: true,
      tokens: { face: "#ff8f2e", shadow: "#6e3505", highlight: "#fff1e0", focal: "#ffc14d", ring: "#ffa04a", beam: "#ffb066" } },
    { id: "uv-violet", name: "UV Violet", weight: 15, cost: 0, focal: false, hero: false, campOnly: true,
      tokens: { face: "#a45cff", shadow: "#3c1670", highlight: "#f1e7ff", focal: "#c99bff", ring: "#b374ff", beam: "#c08aff" } },
    { id: "uv-blue", name: "UV Blue", weight: 12, cost: 0, focal: false, hero: false, campOnly: true,
      tokens: { face: "#3fa9ff", shadow: "#0e3a66", highlight: "#e4f3ff", focal: "#7cd0ff", ring: "#55b6ff", beam: "#79c8ff" } }
  ]);
  const V3_RING_MODES = deepFreeze([
    { id: "hexadecibel-vortex", name: "Hexadecibel Vortex", weight: 100, cost: 2, focal: false, hero: false, campOnly: true, shape: "hex", twistDeg: 10 }
  ]);
  const V3_RING_STYLES = deepFreeze([
    { id: "solid", name: "Solid Portal", weight: 24, cost: 0, focal: false, hero: false, widthFactor: 1, dash: "", linecap: "round" },
    { id: "fine", name: "Fine Lines", weight: 12, cost: 1, focal: false, hero: false, widthFactor: 0.56, dash: "", linecap: "round" },
    { id: "beat-dash", name: "Beat Dash", weight: 16, cost: 1, focal: false, hero: false, widthFactor: 0.72, dash: "2.20 1.10", linecap: "round" },
    { id: "dotted", name: "Dotted Signal", weight: 10, cost: 1, focal: false, hero: false, widthFactor: 0.72, dash: "0.01 2.10", linecap: "round" },
    { id: "comet-dash", name: "Comet Dash", weight: 12, cost: 1, focal: false, hero: false, widthFactor: 0.72, dash: "3.60 1.20 0.70 1.20", linecap: "round" },
    { id: "filament-lines", name: "Filament Lines", weight: 26, cost: 1, focal: false, hero: false, campOnly: true, widthFactor: 0.34, dash: "", linecap: "round", double: true }
  ]);
  const V3_DIRECTIONS = deepFreeze([
    { id: "clockwise", name: "Clockwise", weight: 50, cost: 0, focal: false, hero: false },
    { id: "counter-clockwise", name: "Counter-clockwise", weight: 50, cost: 0, focal: false, hero: false }
  ]);
  const V3_BROWS = deepFreeze([
    { id: "original-crown", name: "Original Brow", weight: 22, cost: 0, focal: false, hero: false, safeZone: "brows" },
    { id: "crown-gem", name: "Top-ridge Gem", weight: 30, cost: 1, focal: false, hero: false, safeZone: "brows" },
    { id: "hex-crest", name: "Hex Crest", weight: 48, cost: 1, focal: false, hero: false, campOnly: true, safeZone: "brows" }
  ]);
  const V3_EYES = deepFreeze([
    { id: "original-eyes", name: "Original Shambhala", weight: 22, cost: 0, focal: false, hero: false, safeZone: "eyes" },
    { id: "festival-eye-wells", name: "Festival Eye Wells", weight: 30, cost: 1, focal: false, hero: false, safeZone: "eyeFields" },
    { id: "uv-eye-wells", name: "UV Eye Wells", weight: 48, cost: 1, focal: false, hero: false, campOnly: true, safeZone: "eyeFields" }
  ]);
  const V3_BEAKS = deepFreeze([
    { id: "original-beak", name: "Original Beak", weight: 24, cost: 0, focal: false, hero: false, safeZone: "beak" },
    { id: "amber-shard", name: "Amber Shard", weight: 30, cost: 1, focal: false, hero: false, safeZone: "beak" },
    { id: "hex-facet", name: "Hex Facet", weight: 46, cost: 1, focal: false, hero: false, campOnly: true, safeZone: "beak" }
  ]);
  const V3_MARKINGS = deepFreeze([
    { id: "clean-face", name: "Clean Face", weight: 24, cost: 0, focal: false, hero: false, safeZone: "face" },
    { id: "moon-freckles", name: "Moon Freckles", weight: 30, cost: 1, focal: false, hero: false, safeZone: "cheeks" },
    { id: "hexlace-freckles", name: "Hexlace Freckles", weight: 46, cost: 1, focal: false, hero: false, campOnly: true, safeZone: "cheeks" },
    { id: "uv-honeycomb", name: "UV Honeycomb", weight: 0, cost: 3, focal: true, hero: true, campOnly: true, safeZone: "face" }
  ]);
  const V3_AURAS = deepFreeze([
    { id: "quiet-aura", name: "Quiet", weight: 1, cost: 0, focal: false, hero: false, safeZone: "outer" },
    { id: "radial-glow", name: "Portal Halo", weight: 10, cost: 2, focal: true, hero: true, safeZone: "outer" },
    { id: "stardust", name: "Stardust", weight: 15, cost: 2, focal: true, hero: true, safeZone: "outer" },
    { id: "camp-beacon", name: "Camp Beacon", weight: 45, cost: 2, focal: true, hero: true, campOnly: true, safeZone: "outer" }
  ]);
  const V3_CATEGORIES = deepFreeze({
    palette: V3_PALETTES,
    ringMode: V3_RING_MODES,
    ringStyle: V3_RING_STYLES,
    direction: V3_DIRECTIONS,
    brow: V3_BROWS,
    eyes: V3_EYES,
    beak: V3_BEAKS,
    marking: V3_MARKINGS,
    aura: V3_AURAS
  });
  const V3_CATEGORY_KEYS = deepFreeze(["ringMode", "ringStyle", "direction", "brow", "eyes", "beak", "marking", "aura"]);
  const V3_COST_KEYS = deepFreeze(["ringMode", "ringStyle", "brow", "eyes", "beak", "marking", "aura"]);
  const V3_SUPPORT_KEYS = deepFreeze(["ringStyle", "brow", "eyes", "beak", "marking"]);
  const V3_SUPPORT_ORDERS = deepFreeze([
    ["ringStyle", "marking", "eyes", "brow", "beak"],
    ["marking", "ringStyle", "brow", "eyes", "beak"],
    ["eyes", "brow", "ringStyle", "marking", "beak"],
    ["brow", "beak", "marking", "ringStyle", "eyes"]
  ]);
  const V3_HERO_POOL = deepFreeze([
    { category: "aura", id: "camp-beacon", weight: 44 },
    { category: "marking", id: "uv-honeycomb", weight: 20 },
    { category: "aura", id: "stardust", weight: 20 },
    { category: "aura", id: "radial-glow", weight: 16 }
  ]);
  const V3_LAYER_ORDER = deepFreeze([
    "background", "aura", "portal-rings", "ring-glow", "owl-backdrop",
    "base-disc", "eyes", "owl-base", "honeycomb", "brows", "facial-details", "beak"
  ]);
  const V3_SPEC = deepFreeze({
    id: "camp-hexadecibel-v3",
    version: CAMP_VERSION,
    grammarVersion: CAMP_VERSION,
    status: "provenance-only",
    frozenAt: "2026-07-19",
    rarityWeights: { "camp-hexadecibel": 0 },
    budgets: { "camp-hexadecibel": 12 },
    rarities: [V3_TIER],
    paletteFamilies: [],
    palettes: V3_PALETTES,
    geometry: GEOMETRY,
    layerOrder: V3_LAYER_ORDER,
    mandatory: { ringMode: "hexadecibel-vortex" },
    heroPool: V3_HERO_POOL,
    specialEligibility: { campOnlyOrdinaryWeight: 0, assignment: "physical-camp-hexlace-provenance", tradeable: false },
    catalogue: { categories: V3_CATEGORIES, paletteFamilies: [], rarities: [V3_TIER] }
  });

  function mergeCatalogueItems(publicItems, campItems) {
    const merged = (publicItems || []).slice();
    const ids = new Set(merged.map(item => item.id));
    for (const item of campItems || []) {
      if (!ids.has(item.id)) merged.push(item);
    }
    return deepFreeze(merged);
  }

  const V4_CAMP_CATEGORIES = deepFreeze(Object.fromEntries(
    [...new Set(Object.keys(V2_CATEGORIES).concat(Object.keys(V3_CATEGORIES)))].map(key => [
      key,
      mergeCatalogueItems(V2_CATEGORIES[key], V3_CATEGORIES[key])
    ])
  ));
  const V4_PUBLIC_CATALOGUE = deepFreeze({
    categories: V2_CATEGORIES,
    paletteFamilies: V2_PALETTE_FAMILIES,
    rarities: V2_RARITIES
  });
  const V4_CAMP_CATALOGUE = deepFreeze({
    categories: V4_CAMP_CATEGORIES,
    paletteFamilies: V2_PALETTE_FAMILIES,
    rarities: V2_RARITIES.concat([V3_TIER])
  });
  const V4_SPEC = deepFreeze({
    id: "hex-owl-2026",
    version: VERSION,
    status: "current",
    frozenAt: "2026-07-20",
    tiers: { public: PUBLIC_TIER, camp: CAMP_TIER },
    defaultTier: PUBLIC_TIER,
    rarityWeights: V2_SPEC.rarityWeights,
    budgets: V2_SPEC.budgets,
    rarities: V4_CAMP_CATALOGUE.rarities,
    paletteFamilies: V2_SPEC.paletteFamilies,
    palettes: V2_SPEC.palettes,
    publicPaletteCount: V2_SPEC.publicPaletteCount,
    geometry: V2_SPEC.geometry,
    layerOrder: V2_SPEC.layerOrder,
    specialEligibility: {
      campTier: CAMP_TIER,
      ordinaryWeight: 0,
      assignment: "verified-camp-access-required",
      tradeable: false
    },
    catalogue: V4_PUBLIC_CATALOGUE,
    campCatalogue: V4_CAMP_CATALOGUE
  });
  const SPECS = deepFreeze({
    [V1_VERSION]: V1_SPEC,
    [V2_VERSION]: V2_SPEC,
    [CAMP_VERSION]: V3_SPEC,
    [VERSION]: V4_SPEC
  });

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

  function rarityLevelV1(id) {
    return RARITIES.find(item => item.id === id)?.level ?? -1;
  }

  function isTierEligibleV1(option, rarity) {
    return rarity.level >= rarityLevelV1(option.minRarity || "common") && option.enabled !== false && !option.campOnly;
  }

  function selectionTotalsV1(state) {
    let cost = 0;
    let focalCount = 0;
    CATEGORY_KEYS.forEach(key => {
      const option = state[key];
      cost += Number(option?.cost || 0);
      if (option?.focal) focalCount += 1;
    });
    return { cost, focalCount };
  }

  function exclusionsAllowV1(state, category, candidate) {
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

  function generatedRarityV1(seed, version) {
    return weighted(RARITIES, categoryRandom(seed, version, "rarity"));
  }

  function resolveFreestyleTraitsV1(seed, config, version) {
    const normalized = normalizeSeed(seed);
    const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : config;
    const original = resolveTraitsV1(normalized, {}, version);
    const repairs = [];
    const requestedRarity = config.rarity !== undefined ? config.rarity : overrides.rarity;
    let rarity = findByIdOrName(RARITIES, requestedRarity) || original.rarity;
    if (requestedRarity && !findByIdOrName(RARITIES, requestedRarity)) {
      repairs.push("Unknown rarity override was replaced with the original rarity.");
    }

    let palette = original.palette;
    const requestedPalette = overrides.palette || overrides.face;
    if (requestedPalette) {
      const candidate = findByIdOrName(PALETTES, requestedPalette);
      if (candidate && candidate.enabled !== false) palette = candidate;
      else repairs.push("Unknown or disabled palette override was replaced with the original palette.");
    }

    const state = {};
    CATEGORY_KEYS.forEach(category => { state[category] = original[category]; });
    CATEGORY_KEYS.forEach(category => {
      const legacyKey = category === "direction" ? "ringDirection" : category;
      const supplied = overrides[category] !== undefined ? overrides[category] : overrides[legacyKey];
      if (supplied === undefined || supplied === null || supplied === "" || String(supplied).toLowerCase() === "auto") return;
      const candidate = findByIdOrName(CATEGORIES[category], supplied);
      if (candidate && candidate.enabled !== false) state[category] = candidate;
      else repairs.push("Unknown or disabled " + category + " override was replaced with the original choice.");
    });

    const totals = selectionTotalsV1(state);
    const ringColours = state.ringMode.multicolor
      ? [palette.tokens.ring, palette.tokens.focal, palette.tokens.beam, palette.tokens.highlight]
      : [palette.tokens.ring, palette.tokens.ring, palette.tokens.ring, palette.tokens.ring];
    const rings = deepFreeze({
      id: state.ringMode.id,
      name: state.ringMode.multicolor ? palette.name + " Festival Prism" : palette.name + " Portal",
      colors: deepFreeze(ringColours.slice()),
      multicolor: state.ringMode.multicolor
    });
    const selectionIds = {};
    CATEGORY_KEYS.forEach(key => { selectionIds[key] = state[key].id; });
    selectionIds.palette = palette.id;

    return deepFreeze({
      version: V1_VERSION,
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
      repairs: deepFreeze(repairs.slice()),
      freestyle: true
    });
  }

  function resolveTraitsV1(seed, options, version) {
    const resolvedVersion = version === undefined ? V1_VERSION : Number(version);
    if (resolvedVersion !== V1_VERSION) throw new Error("Unsupported Hex Owl version: " + version);
    const normalized = normalizeSeed(seed);
    const config = options && typeof options === "object" ? options : {};
    if (config.freestyle === true) return resolveFreestyleTraitsV1(normalized, config, resolvedVersion);
    const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : config;
    const repairs = [];
    const forcedKeys = new Set();
    const requestedRarity = config.rarity !== undefined ? config.rarity : overrides.rarity;
    let rarity = findByIdOrName(RARITIES, requestedRarity);
    if (!rarity) {
      rarity = generatedRarityV1(normalized, resolvedVersion);
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
      if (!candidate || !isTierEligibleV1(candidate, rarity)) return false;
      if (!exclusionsAllowV1(state, category, candidate)) return false;
      const prior = state[category];
      state[category] = candidate;
      const totals = selectionTotalsV1(state);
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
      const auraCandidate = weighted(AURAS.filter(item => item.id !== "quiet-aura" && isTierEligibleV1(item, rarity)), categoryRandom(normalized, resolvedVersion, "aura"));
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
      const beakChoices = BEAKS.filter(item => item.cost > 0 && isTierEligibleV1(item, rarity));
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
        isTierEligibleV1(item, rarity) &&
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
      const used = selectionTotalsV1(state).cost;
      if (used >= rarity.budget || forcedKeys.has(category) || mandatory.has(category)) return;
      if (category === "beak" && !beakAttempt) return;
      const current = state[category];
      const upgrades = CATEGORIES[category].filter(item =>
        !item.focal &&
        item.id !== "brow-tint" &&
        item.cost > Number(current?.cost || 0) &&
        isTierEligibleV1(item, rarity) &&
        canApply(category, item)
      );
      if (!upgrades.length) return;
      apply(category, weighted(upgrades, categoryRandom(normalized, resolvedVersion, "upgrade-" + category)));
    });

    const totals = selectionTotalsV1(state);
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
      version: V1_VERSION,
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

  function rarityLevelV2(id) {
    return V2_RARITIES.find(item => item.id === id)?.level ?? -1;
  }

  function isTierEligibleV2(option, rarity) {
    return rarity.level >= rarityLevelV2(option.minRarity || "common") && option.enabled !== false && !option.campOnly;
  }

  function exclusionsAllowV2(state, category, candidate) {
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

  function selectionTotalsV2(state) {
    let cost = 0;
    let focalCount = 0;
    let heroCount = 0;
    let supportCount = 0;
    CATEGORY_KEYS.forEach(key => {
      const option = state[key];
      cost += Number(option?.cost || 0);
      if (option?.focal) focalCount += 1;
      if (option?.hero) heroCount += 1;
      if (V2_SUPPORT_KEYS.includes(key) && Number(option?.cost || 0) > 0 && !option?.hero) supportCount += 1;
    });
    const ringTreatmentCount = Number(state.ringMode?.cost || 0) > 0 ? 1 : 0;
    return {
      cost,
      focalCount,
      heroCount,
      supportCount,
      treatmentCount: ringTreatmentCount + heroCount + supportCount
    };
  }

  function prismOrderForSeed(seed) {
    const digest = hashWords(normalizeSeed(seed) + ":prism-order");
    const permutation = parseInt(digest.slice(0, 8), 16) % 24;
    const pool = ["highlight", "beam", "focal", "ring"];
    const order = [];
    let cursor = permutation;
    const factorials = [1, 1, 2, 6, 24];
    for (let remaining = pool.length; remaining > 0; remaining -= 1) {
      const divisor = factorials[remaining - 1];
      const index = Math.floor(cursor / divisor);
      cursor %= divisor;
      order.push(pool.splice(index, 1)[0]);
    }
    return deepFreeze({ permutation, tokens: deepFreeze(order) });
  }

  function finalizeTraitsV2(normalized, state, palette, rarity, repairs, freestyle = false) {
    const totals = selectionTotalsV2(state);
    const prism = prismOrderForSeed(normalized);
    const prismColours = prism.tokens.map(token => palette.tokens[token]);
    const ringColours = state.ringMode.multicolor
      ? prismColours
      : [palette.tokens.ring, palette.tokens.ring, palette.tokens.ring, palette.tokens.ring];
    const rings = deepFreeze({
      id: state.ringMode.id,
      name: state.ringMode.multicolor ? palette.name + " Festival Prism" : palette.name + " Portal",
      colors: deepFreeze(ringColours.slice()),
      multicolor: state.ringMode.multicolor
    });
    const selectionIds = {};
    CATEGORY_KEYS.forEach(key => { selectionIds[key] = state[key].id; });
    selectionIds.palette = palette.id;

    return deepFreeze({
      version: V2_VERSION,
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
      heroCount: totals.heroCount,
      supportCount: totals.supportCount,
      treatmentCount: totals.treatmentCount,
      prismPermutation: prism.permutation,
      prismOrder: prism.tokens,
      selectionIds: deepFreeze(selectionIds),
      repairs: deepFreeze(repairs.slice()),
      ...(freestyle ? { freestyle: true } : {})
    });
  }

  function resolveFreestyleTraitsV2(seed, config, version) {
    const normalized = normalizeSeed(seed);
    const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : config;
    const original = resolveTraitsV2(normalized, {}, version);
    const repairs = [];
    const requestedRarity = config.rarity !== undefined ? config.rarity : overrides.rarity;
    let rarity = findByIdOrName(V2_RARITIES, requestedRarity) || original.rarity;
    if (requestedRarity && !findByIdOrName(V2_RARITIES, requestedRarity)) {
      repairs.push("Unknown rarity override was replaced with the original rarity.");
    }

    let palette = original.palette;
    const requestedPalette = overrides.palette || overrides.face;
    if (requestedPalette) {
      const candidate = findByIdOrName(V2_PALETTES, requestedPalette);
      if (candidate && candidate.enabled !== false) palette = candidate;
      else repairs.push("Unknown or disabled palette override was replaced with the original palette.");
    }

    const state = {};
    CATEGORY_KEYS.forEach(category => { state[category] = original[category]; });
    CATEGORY_KEYS.forEach(category => {
      const legacyKey = category === "direction" ? "ringDirection" : category;
      const supplied = overrides[category] !== undefined ? overrides[category] : overrides[legacyKey];
      if (supplied === undefined || supplied === null || supplied === "" || String(supplied).toLowerCase() === "auto") return;
      const candidate = findByIdOrName(V2_CATEGORIES[category], supplied);
      if (candidate && candidate.enabled !== false) state[category] = candidate;
      else repairs.push("Unknown or disabled " + category + " override was replaced with the original choice.");
    });
    return finalizeTraitsV2(normalized, state, palette, rarity, repairs, true);
  }

  function resolveTraitsV2(seed, options, version) {
    const resolvedVersion = version === undefined ? V2_VERSION : Number(version);
    if (resolvedVersion !== V2_VERSION) throw new Error("Unsupported Hex Owl version: " + version);
    const normalized = normalizeSeed(seed);
    const config = options && typeof options === "object" ? options : {};
    if (config.freestyle === true) return resolveFreestyleTraitsV2(normalized, config, resolvedVersion);
    const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : config;
    const repairs = [];
    const forcedKeys = new Set();
    const requestedRarity = config.rarity !== undefined ? config.rarity : overrides.rarity;
    let rarity = findByIdOrName(V2_RARITIES, requestedRarity);
    if (!rarity) {
      rarity = weighted(V2_RARITIES, categoryRandom(normalized, resolvedVersion, "rarity"));
      if (requestedRarity && String(requestedRarity).toLowerCase() !== "auto") {
        repairs.push("Unknown rarity override was replaced with the seeded rarity.");
      }
    }

    const state = {
      ringMode: V2_RING_MODES[0],
      ringStyle: V2_RING_STYLES[0],
      direction: V2_DIRECTIONS[0],
      brow: V2_BROWS[0],
      eyes: V2_EYES[0],
      beak: V2_BEAKS[0],
      marking: V2_MARKINGS[0],
      accessory: V2_ACCESSORIES[0],
      aura: V2_AURAS[0]
    };
    let palette = weighted(V2_PUBLIC_PALETTES, categoryRandom(normalized, resolvedVersion, "palette"));
    const mandatory = new Set();

    if (rarity.id === "legendary") {
      state.ringMode = findByIdOrName(V2_RING_MODES, "festival-prism");
      mandatory.add("ringMode");
    }

    function canApply(category, candidate) {
      if (!candidate || !isTierEligibleV2(candidate, rarity)) return false;
      if (!exclusionsAllowV2(state, category, candidate)) return false;
      const prior = state[category];
      state[category] = candidate;
      const totals = selectionTotalsV2(state);
      state[category] = prior;
      return totals.cost <= rarity.budget &&
        totals.focalCount <= rarity.focalCap &&
        totals.heroCount <= rarity.focalCap &&
        totals.supportCount <= rarity.supportCap &&
        totals.treatmentCount <= rarity.treatmentCap;
    }

    function apply(category, candidate) {
      if (!canApply(category, candidate)) return false;
      state[category] = candidate;
      return true;
    }

    const requestedPalette = overrides.palette || overrides.face;
    const paletteOverride = findByIdOrName(V2_PALETTES, requestedPalette);
    if (paletteOverride && paletteOverride.enabled !== false && !paletteOverride.campOnly) {
      palette = paletteOverride;
      forcedKeys.add("palette");
    } else if (requestedPalette && String(requestedPalette).toLowerCase() !== "auto") {
      repairs.push(paletteOverride
        ? paletteOverride.name + " requires a camp provenance mint and was replaced."
        : "Unknown palette override was replaced with the seeded palette.");
    }

    CATEGORY_KEYS.forEach(category => {
      const legacyKey = category === "direction" ? "ringDirection" : category;
      const supplied = overrides[category] !== undefined ? overrides[category] : overrides[legacyKey];
      if (supplied === undefined || supplied === null || supplied === "" || String(supplied).toLowerCase() === "auto") return;
      const candidate = findByIdOrName(V2_CATEGORIES[category], supplied);
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
      state.direction = weighted(V2_DIRECTIONS, categoryRandom(normalized, resolvedVersion, "direction"));
    }

    if (rarity.focalCap > 0 && selectionTotalsV2(state).heroCount === 0) {
      const hero = weighted(V2_HERO_POOL, categoryRandom(normalized, resolvedVersion, "hero"));
      const candidate = hero.id === "aura"
        ? weighted(V2_AURAS.filter(item => item.hero), categoryRandom(normalized, resolvedVersion, "hero-aura"))
        : findByIdOrName(V2_CATEGORIES[hero.category], hero.id);
      const replaced = state[hero.category];
      if (apply(hero.category, candidate) && forcedKeys.has(hero.category) && replaced.id !== candidate.id) {
        repairs.push(replaced.name + " was replaced by the required seeded hero " + candidate.name + ".");
      }
    }

    const supportOrder = V2_SUPPORT_ORDERS[
      Math.floor(roll(normalized, resolvedVersion, "support-order") * V2_SUPPORT_ORDERS.length) % V2_SUPPORT_ORDERS.length
    ];
    supportOrder.forEach(category => {
      if (selectionTotalsV2(state).supportCount >= rarity.supportCap) return;
      if (forcedKeys.has(category) || state[category]?.hero) return;
      const choices = V2_CATEGORIES[category].filter(item =>
        !item.hero &&
        isTierEligibleV2(item, rarity) &&
        exclusionsAllowV2(state, category, item)
      );
      const candidate = weighted(choices, categoryRandom(normalized, resolvedVersion, "support-" + category));
      if (candidate) apply(category, candidate);
    });

    return finalizeTraitsV2(normalized, state, palette, rarity, repairs);
  }

  function selectTraitsV2(seed) {
    return resolveTraitsV2(seed, {}, V2_VERSION);
  }

  function selectionTotalsV3(state) {
    let cost = 0;
    let heroCount = 0;
    let supportCount = 0;
    V3_COST_KEYS.forEach(key => {
      const option = state[key];
      cost += Number(option?.cost || 0);
      if (option?.hero) heroCount += 1;
      if (V3_SUPPORT_KEYS.includes(key) && Number(option?.cost || 0) > 0 && !option?.hero) supportCount += 1;
    });
    const treatmentCount = 1 + heroCount + supportCount;
    return { cost, focalCount: heroCount, heroCount, supportCount, treatmentCount };
  }

  function finalizeTraitsV3(normalized, state, palette, issues, repairs) {
    const totals = selectionTotalsV3(state);
    const selectionIds = { palette: palette.id };
    V3_CATEGORY_KEYS.forEach(key => { selectionIds[key] = state[key].id; });
    selectionIds.accessory = V2_ACCESSORIES[0].id;
    const rings = deepFreeze({
      id: state.ringMode.id,
      name: state.ringMode.name,
      colors: deepFreeze([palette.tokens.ring, palette.tokens.ring, palette.tokens.ring, palette.tokens.ring]),
      multicolor: false
    });
    const heroes = [];
    if (state.aura.hero) heroes.push(state.aura.name);
    if (state.marking.hero) heroes.push(state.marking.name);
    return deepFreeze({
      version: CAMP_VERSION,
      seed: normalized,
      tier: V3_TIER,
      rarity: V3_TIER,
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
      accessory: V2_ACCESSORIES[0],
      aura: state.aura,
      heroes: deepFreeze(heroes),
      cost: totals.cost,
      budget: V3_TIER.budget,
      focalCount: totals.focalCount,
      focalCap: V3_TIER.focalCap,
      heroCount: totals.heroCount,
      supportCount: totals.supportCount,
      treatmentCount: totals.treatmentCount,
      selectionIds: deepFreeze(selectionIds),
      issues: deepFreeze(issues.slice()),
      repairs: deepFreeze(repairs.slice())
    });
  }

  function resolveTraitsV3(seed, options, version) {
    const resolvedVersion = version === undefined ? CAMP_VERSION : Number(version);
    if (resolvedVersion !== CAMP_VERSION) throw new Error("Unsupported Hex Owl version: " + version);
    const normalized = normalizeSeed(seed);
    const config = options && typeof options === "object" ? options : {};
    const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : config;
    const issues = [];
    const repairs = [];
    const forced = new Set();
    const state = {
      ringMode: V3_RING_MODES[0],
      ringStyle: V3_RING_STYLES[0],
      direction: V3_DIRECTIONS[0],
      brow: V3_BROWS[0],
      eyes: V3_EYES[0],
      beak: V3_BEAKS[0],
      marking: V3_MARKINGS[0],
      aura: V3_AURAS[0]
    };

    let palette = findByIdOrName(V3_PALETTES, overrides.palette || overrides.face);
    if (palette) {
      forced.add("palette");
    } else {
      if ((overrides.palette || overrides.face) && String(overrides.palette || overrides.face).toLowerCase() !== "auto") {
        const message = "Unknown palette override was replaced with the seeded palette.";
        issues.push(message);
        repairs.push(message);
      }
      palette = weighted(V3_PALETTES, categoryRandom(normalized, resolvedVersion, "palette"));
    }

    const requestedDirection = overrides.direction !== undefined ? overrides.direction : overrides.ringDirection;
    let direction = findByIdOrName(V3_DIRECTIONS, requestedDirection);
    if (direction) {
      forced.add("direction");
    } else {
      if (requestedDirection && String(requestedDirection).toLowerCase() !== "auto") {
        const message = "Unknown direction override was replaced with the seeded direction.";
        issues.push(message);
        repairs.push(message);
      }
      direction = roll(normalized, resolvedVersion, "direction") < 0.5 ? V3_DIRECTIONS[0] : V3_DIRECTIONS[1];
    }
    state.direction = direction;

    ["ringMode", "ringStyle", "brow", "eyes", "beak", "marking", "aura"].forEach(category => {
      const supplied = overrides[category];
      if (supplied === undefined || supplied === null || supplied === "" || String(supplied).toLowerCase() === "auto") return;
      const candidate = findByIdOrName(V3_CATEGORIES[category], supplied);
      if (!candidate) {
        const message = "Unknown " + category + " override was ignored.";
        issues.push(message);
        repairs.push(message);
        return;
      }
      state[category] = candidate;
      forced.add(category);
    });

    if (!forced.has("ringMode")) {
      state.ringMode = weighted(V3_RING_MODES, categoryRandom(normalized, resolvedVersion, "ring-mode"));
    }

    let heroCategories = ["aura", "marking"].filter(category => state[category].hero);
    if (heroCategories.length < V3_TIER.heroFloor) {
      const first = weighted(V3_HERO_POOL.filter(entry => !forced.has(entry.category)), categoryRandom(normalized, resolvedVersion, "hero-1"));
      if (first) {
        state[first.category] = findByIdOrName(V3_CATEGORIES[first.category], first.id);
        heroCategories.push(first.category);
      }
    }
    if (heroCategories.length === 1 && roll(normalized, resolvedVersion, "hero-second") < 0.12) {
      const second = weighted(
        V3_HERO_POOL.filter(entry => entry.category !== heroCategories[0] && !forced.has(entry.category)),
        categoryRandom(normalized, resolvedVersion, "hero-2")
      );
      if (second) {
        const prior = state[second.category];
        state[second.category] = findByIdOrName(V3_CATEGORIES[second.category], second.id);
        if (selectionTotalsV3(state).cost > V3_TIER.budget) state[second.category] = prior;
        else heroCategories.push(second.category);
      }
    }

    const supportOrder = V3_SUPPORT_ORDERS[
      Math.floor(roll(normalized, resolvedVersion, "support-order") * V3_SUPPORT_ORDERS.length) % V3_SUPPORT_ORDERS.length
    ];
    supportOrder.forEach(category => {
      if (forced.has(category) || state[category].hero || Number(state[category].cost || 0) > 0) return;
      if (selectionTotalsV3(state).supportCount >= V3_TIER.supportCap) return;
      const candidate = weighted(
        V3_CATEGORIES[category].filter(item => Number(item.cost) > 0 && !item.hero),
        categoryRandom(normalized, resolvedVersion, "support-" + category)
      );
      if (!candidate) return;
      const prior = state[category];
      state[category] = candidate;
      if (selectionTotalsV3(state).cost > V3_TIER.budget) state[category] = prior;
    });

    const totals = selectionTotalsV3(state);
    if (totals.cost > V3_TIER.budget) issues.push("Trait cost exceeds the tier budget.");
    if (totals.heroCount > V3_TIER.focalCap) issues.push("Hero trait count exceeds the tier cap.");
    if (totals.heroCount < V3_TIER.heroFloor) issues.push("A camp Owl carries at least one hero trait.");
    if (totals.supportCount > V3_TIER.supportCap) issues.push("Support trait count exceeds the tier cap.");
    return finalizeTraitsV3(normalized, state, palette, issues, repairs);
  }

  function selectTraitsV3(seed) {
    return resolveTraitsV3(seed, {}, CAMP_VERSION);
  }

  function selectTraitsV1(seed) {
    return resolveTraitsV1(seed, {}, V1_VERSION);
  }

  function validateTraitsV1(traits) {
    const issues = [];
    if (!traits || typeof traits !== "object") {
      return deepFreeze({ valid: false, issues: ["Traits are missing."], repairs: [] });
    }
    const freestyle = traits.freestyle === true;
    const rarity = findByIdOrName(RARITIES, traits.rarity);
    if (!rarity) issues.push("Rarity is not in the V1 manifest.");
    const palette = findByIdOrName(PALETTES, traits.palette || traits.face);
    if (!palette) {
      issues.push("Palette is not in the V1 manifest.");
    } else if (palette.enabled === false || (!freestyle && palette.campOnly)) {
      issues.push(palette.name + " is camp-only and excluded from ordinary generation.");
    }
    const chosen = [];
    CATEGORY_KEYS.forEach(category => {
      const supplied = traits[category] || (category === "direction" ? traits.ringDirection : null);
      const option = findByIdOrName(CATEGORIES[category], supplied);
      if (!option) {
        issues.push(category + " is not in the V1 manifest.");
      } else {
        chosen.push({ category, option });
        if (option.enabled === false) issues.push(option.name + " is disabled.");
        else if (!freestyle && rarity && !isTierEligibleV1(option, rarity)) issues.push(option.name + " is not eligible for " + rarity.name + ".");
        if (!freestyle && option.campOnly) issues.push(option.name + " is camp-only and excluded from ordinary generation.");
      }
    });
    const computedCost = chosen.reduce((sum, item) => sum + Number(item.option.cost || 0), 0);
    const computedFocals = chosen.reduce((sum, item) => sum + (item.option.focal ? 1 : 0), 0);
    if (!freestyle) {
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
    }
    return deepFreeze({
      valid: issues.length === 0,
      issues,
      repairs: Array.isArray(traits.repairs) ? traits.repairs.slice() : [],
      computedCost,
      computedFocals
    });
  }

  function validateTraitsV2(traits) {
    const issues = [];
    if (!traits || typeof traits !== "object") {
      return deepFreeze({ valid: false, issues: ["Traits are missing."], repairs: [] });
    }
    const freestyle = traits.freestyle === true;
    const rarity = findByIdOrName(V2_RARITIES, traits.rarity);
    if (!rarity) issues.push("Rarity is not in the V2 manifest.");
    const palette = findByIdOrName(V2_PALETTES, traits.palette || traits.face);
    if (!palette) {
      issues.push("Palette is not in the V2 manifest.");
    } else if (palette.enabled === false || (!freestyle && palette.campOnly)) {
      issues.push(palette.name + " is camp-only and excluded from ordinary generation.");
    }
    const chosen = [];
    CATEGORY_KEYS.forEach(category => {
      const supplied = traits[category] || (category === "direction" ? traits.ringDirection : null);
      const option = findByIdOrName(V2_CATEGORIES[category], supplied);
      if (!option) {
        issues.push(category + " is not in the V2 manifest.");
      } else {
        chosen.push({ category, option });
        if (option.enabled === false) issues.push(option.name + " is disabled.");
        else if (!freestyle && rarity && !isTierEligibleV2(option, rarity)) issues.push(option.name + " is not eligible for " + rarity.name + ".");
      }
    });
    const computedCost = chosen.reduce((sum, item) => sum + Number(item.option.cost || 0), 0);
    const computedFocals = chosen.reduce((sum, item) => sum + (item.option.focal ? 1 : 0), 0);
    const computedHeroes = chosen.reduce((sum, item) => sum + (item.option.hero ? 1 : 0), 0);
    const computedSupports = chosen.reduce((sum, item) =>
      sum + (V2_SUPPORT_KEYS.includes(item.category) && Number(item.option.cost || 0) > 0 && !item.option.hero ? 1 : 0), 0);
    const ringTreatments = chosen.some(item => item.category === "ringMode" && Number(item.option.cost || 0) > 0) ? 1 : 0;
    const computedTreatments = ringTreatments + computedHeroes + computedSupports;
    if (!freestyle) {
      if (rarity && computedCost > rarity.budget) issues.push("Trait cost exceeds the rarity budget.");
      if (rarity && computedFocals > rarity.focalCap) issues.push("Hero trait count exceeds the rarity cap.");
      if (rarity?.id === "common" && computedHeroes !== 0) issues.push("Common cannot carry a hero treatment.");
      if (rarity && rarity.id !== "common" && computedHeroes !== 1) issues.push(rarity.name + " requires exactly one hero treatment.");
      if (rarity && computedSupports > rarity.supportCap) issues.push("Support treatment count exceeds the rarity cap.");
      if (rarity && computedTreatments > rarity.treatmentCap) issues.push("Visible treatment count exceeds the rarity cap.");
      for (let index = 0; index < chosen.length; index += 1) {
        for (let other = index + 1; other < chosen.length; other += 1) {
          const left = chosen[index].option;
          const right = chosen[other].option;
          if ((left.excludes || []).includes(right.id) || (right.excludes || []).includes(left.id)) {
            issues.push(left.name + " conflicts with " + right.name + ".");
          }
        }
      }
      const ringMode = findByIdOrName(V2_RING_MODES, traits.ringMode);
      if (rarity?.id === "legendary" && ringMode?.id !== "festival-prism") issues.push("Legendary requires palette-linked multicolour portal rings.");
      if (rarity && rarity.id !== "legendary" && ringMode?.multicolor) issues.push("Multicolour portal rings are Legendary-only.");
    }
    const prismOrder = Array.isArray(traits.prismOrder) ? traits.prismOrder : [];
    if (prismOrder.length !== 4 || new Set(prismOrder).size !== 4 || prismOrder.some(token => !["highlight", "beam", "focal", "ring"].includes(token))) {
      issues.push("Prism band order is invalid.");
    }
    return deepFreeze({
      valid: issues.length === 0,
      issues,
      repairs: Array.isArray(traits.repairs) ? traits.repairs.slice() : [],
      computedCost,
      computedFocals,
      computedHeroes,
      computedSupports,
      computedTreatments
    });
  }

  function validateTraitsV3(traits) {
    const issues = [];
    if (!traits || typeof traits !== "object") {
      return deepFreeze({ valid: false, issues: ["Traits are missing."], repairs: [] });
    }
    const rarity = findByIdOrName([V3_TIER], traits.rarity || traits.tier);
    if (!rarity) issues.push("Rarity is not the Camp Hexadecibel tier.");
    const palette = findByIdOrName(V3_PALETTES, traits.palette || traits.face);
    if (!palette) issues.push("Palette is not in the V3 camp manifest.");
    const chosen = [];
    V3_CATEGORY_KEYS.forEach(category => {
      const supplied = traits[category] || (category === "direction" ? traits.ringDirection : null);
      const option = findByIdOrName(V3_CATEGORIES[category], supplied);
      if (!option) issues.push(category + " is not in the V3 camp manifest.");
      else chosen.push({ category, option });
    });
    const state = Object.fromEntries(chosen.map(item => [item.category, item.option]));
    const totals = selectionTotalsV3(state);
    if (state.ringMode?.id !== "hexadecibel-vortex") issues.push("Camp Hexadecibel requires the Hexadecibel Vortex.");
    if (totals.cost > V3_TIER.budget) issues.push("Trait cost exceeds the tier budget.");
    if (totals.heroCount > V3_TIER.focalCap) issues.push("Hero trait count exceeds the tier cap.");
    if (totals.heroCount < V3_TIER.heroFloor) issues.push("Camp Hexadecibel requires at least one hero trait.");
    if (totals.supportCount > V3_TIER.supportCap) issues.push("Support trait count exceeds the tier cap.");
    if (totals.treatmentCount > V3_TIER.treatmentCap) issues.push("Visible treatment count exceeds the tier cap.");
    return deepFreeze({
      valid: issues.length === 0,
      issues,
      repairs: Array.isArray(traits.repairs) ? traits.repairs.slice() : [],
      computedCost: totals.cost,
      computedFocals: totals.focalCount,
      computedHeroes: totals.heroCount,
      computedSupports: totals.supportCount,
      computedTreatments: totals.treatmentCount
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

  function auraSvgV2(traits, ids) {
    const tokens = traits.palette.tokens;
    if (traits.aura.id === "sound-waves") {
      const wave = (radius, width, opacity) => {
        const dx = Number((0.906 * radius).toFixed(2));
        const dy = Number((0.423 * radius).toFixed(2));
        const coordinate = value => String(Number(value.toFixed(2)));
        return '<path d="M' + coordinate(50 + dx) + " " + coordinate(50 + dy) + " A" + radius + " " + radius + " 0 0 0 " + coordinate(50 + dx) + " " + coordinate(50 - dy) +
          " M" + coordinate(50 - dx) + " " + coordinate(50 + dy) + " A" + radius + " " + radius + " 0 0 1 " + coordinate(50 - dx) + " " + coordinate(50 - dy) +
          '" fill="none" stroke="' + tokens.focal + '" stroke-width="' + width + '" stroke-linecap="round" opacity="' + opacity + '"/>';
      };
      return "<g>" + wave(42.5, 1.0, 1) + wave(45.5, 0.8, 0.65) + wave(48.5, 0.6, 0.38) + "</g>";
    }
    if (traits.aura.id === "shooting-star") {
      return '<g stroke-linecap="round"><path d="M68 24 L87 9" stroke="' + tokens.beam + '" stroke-width="3" opacity=".2" fill="none"/>' +
        '<path d="M68 24 L87 9" stroke="' + tokens.focal + '" stroke-width="1.1" fill="none"/>' +
        '<circle cx="87" cy="9" r="2.6" fill="' + tokens.focal + '" opacity=".3" stroke="none"/><circle cx="87" cy="9" r="1.5" fill="' + tokens.focal + '" stroke="none"/>' +
        '<path d="M13 76l.95 2.2 2.2.95-2.2.95L13 83l-.95-2.2-2.2-.95 2.2-.95z" fill="' + tokens.focal + '" opacity=".8" stroke="none"/></g>';
    }
    return auraSvg(traits, ids);
  }

  const HEX_DIRECTIONS = deepFreeze([
    [0, -1],
    [-0.8660254037844386, -0.5],
    [-0.8660254037844386, 0.5],
    [0, 1],
    [0.8660254037844386, 0.5],
    [0.8660254037844386, -0.5]
  ]);

  function hexPoints(cx, cy, radius) {
    return HEX_DIRECTIONS.map(([x, y]) =>
      (cx + radius * x).toFixed(2) + "," + (cy + radius * y).toFixed(2)
    ).join(" ");
  }

  function browSvgV2(traits) {
    const tokens = traits.palette.tokens;
    const use = (part, colour, opacity) =>
      '<use href="#' + BROW_MARK_IDS[part] + '" fill="' + colour + '" opacity="' + (opacity === undefined ? "1" : opacity) + '" transform="' + OWL_TRANSFORM + '"/>';
    if (traits.brow.id === "crown-gem") return use("gem", tokens.focal);
    // The supplied highlight is a filled brow subpath, not a stroke. The V2
    // handoff supplies no thinner replacement geometry, so only its explicit
    // shadow-opacity fix can be applied without inventing art.
    if (traits.brow.id === "brow-echo") return use("lower", tokens.shadow) + use("upper", tokens.highlight, ".94");
    if (traits.brow.id === "brow-tint") return use("middle", tokens.focal, ".96") + use("upper", tokens.highlight, ".88");
    if (traits.brow.id === "moonstone-crest") {
      const pale = ["website-gold", "website-green", "website-pink"].includes(traits.palette.familyId);
      return use("upper", pale ? tokens.shadow : tokens.highlight) + use("gem", "#fefdf0");
    }
    if (traits.brow.id === "twin-gems") {
      return '<g fill="' + tokens.focal + '"><path d="M31 42.9 L32.15 44.05 L31 45.2 L29.85 44.05 Z"/><path d="M69 42.9 L70.15 44.05 L69 45.2 L67.85 44.05 Z"/></g>';
    }
    if (traits.brow.id === "dusk-fade") return use("upper", tokens.highlight) + use("lower", tokens.shadow, ".85");
    if (traits.brow.id === "third-eye") {
      return '<polygon points="' + hexPoints(50, 46.6, 1.9) + '" fill="none" stroke="' + tokens.focal + '" stroke-width=".52"/>' +
        '<circle cx="50" cy="46.6" r=".6" fill="' + tokens.focal + '"/>';
    }
    if (traits.brow.id === "three-band-prism") {
      const colours = traits.prismOrder.map(token => tokens[token]);
      return use("upper", colours[0]) + use("lower", colours[1]) + use("middle", colours[2]) + use("gem", colours[3]);
    }
    return "";
  }

  function facialDetailsSvgV2(traits) {
    const tokens = traits.palette.tokens;
    if (traits.marking.id === "moon-freckles") {
      return '<g fill="' + tokens.highlight + '" opacity=".9"><circle cx="39.2" cy="64.4" r=".78"/><circle cx="41.1" cy="65.7" r=".66"/><circle cx="42.4" cy="67.1" r=".54"/><circle cx="60.8" cy="64.4" r=".78"/><circle cx="58.9" cy="65.7" r=".66"/><circle cx="57.6" cy="67.1" r=".54"/></g>';
    }
    if (traits.marking.id === "ember-comet") {
      return '<g fill="' + tokens.focal + '"><circle cx="38.6" cy="63.7" r=".8"/><circle cx="40.4" cy="65.3" r=".6"/><circle cx="41.9" cy="66.8" r=".45"/><circle cx="61.4" cy="63.7" r=".8"/><circle cx="59.6" cy="65.3" r=".6"/><circle cx="58.1" cy="66.8" r=".45"/></g>';
    }
    if (traits.marking.id === "diamond-dust") {
      return '<g fill="' + tokens.highlight + '"><path d="M39.3 63.9l.8 1.2-.8 1.2-.8-1.2zM41.6 66.2l.65.95-.65.95-.65-.95zM60.7 63.9l.8 1.2-.8 1.2-.8-1.2zM58.4 66.2l.65.95-.65.95-.65-.95z"/></g>';
    }
    if (traits.marking.id === "festival-stripes") {
      return '<g fill="none" stroke-linecap="round" stroke-width=".8"><path d="M36.6 62.9 l4.8 .9 M63.4 62.9 l-4.8 .9" stroke="' + tokens.focal + '"/>' +
        '<path d="M36.9 64.7 l4.6 .85 M63.1 64.7 l-4.6 .85" stroke="' + tokens.highlight + '"/>' +
        '<path d="M37.2 66.5 l4.4 .8 M62.8 66.5 l-4.4 .8" stroke="' + tokens.focal + '"/></g>';
    }
    if (traits.marking.id === "hex-studs") {
      return '<g fill="none" stroke="' + tokens.focal + '" stroke-width=".34"><polygon points="' + hexPoints(39.8, 65.2, 1.05) + '"/><polygon points="' + hexPoints(60.2, 65.2, 1.05) + '"/></g>';
    }
    if (traits.marking.id === "cheek-crescents") {
      return '<path d="M37.4 63.8 q2.4 2.0 4.8 0 M57.8 63.8 q2.4 2.0 4.8 0" fill="none" stroke="' + tokens.highlight + '" stroke-width=".5" stroke-linecap="round"/>';
    }
    return "";
  }

  function beakSvgV2(traits) {
    const tokens = traits.palette.tokens;
    if (traits.beak.id === "amber-shard") return beakSvg(traits);
    if (traits.beak.id === "moonstone-facet") {
      return '<g transform="translate(0 -4.2384)" data-beak-bottom="60.5116"><path d="M48.6 61.1 L50 60.2 L51.4 61.1 L50 64.75 z" fill="' + tokens.highlight + '"/><path d="M48.6 61.1 L51.4 61.1 M50 60.2 v.9" stroke="' + tokens.shadow + '" stroke-width=".22" opacity=".55"/></g>';
    }
    if (traits.beak.id === "bold-chevron") {
      return '<g transform="translate(0 -4.2484)" data-beak-bottom="60.2516"><path d="M48.7 60.5 L50 61.7 L51.3 60.5 M48.95 62.4 L50 64.5 L51.05 62.4" fill="none" stroke="' + tokens.focal + '" stroke-width=".95" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
    if (traits.beak.id === "ember-tip") {
      return '<g transform="translate(0 -4.2384)" data-beak-bottom="60.4616"><path d="M50 60.1 v1.6" stroke="' + tokens.focal + '" stroke-width=".5" stroke-linecap="round"/><circle cx="50" cy="63.35" r="1.35" fill="' + tokens.focal + '" opacity=".28"/><circle cx="50" cy="63.35" r=".85" fill="' + tokens.focal + '"/></g>';
    }
    return "";
  }

  function eyesSvgV2(traits, ids) {
    if (traits.eyes.id === "original-eyes" || traits.eyes.id === "pupil-lasers") return "";
    const tokens = traits.palette.tokens;
    const wells = (left, right) => '<ellipse cx="35.5" cy="54.15" rx="5.5" ry="4.35" fill="' + left + '"/><ellipse cx="64.5" cy="54.15" rx="5.5" ry="4.35" fill="' + (right || left) + '"/>';
    let contents = "";
    if (traits.eyes.id === "festival-eye-wells") contents = wells(tokens.focal);
    if (traits.eyes.id === "electric-eye-wells") contents = wells(tokens.highlight);
    if (traits.eyes.id === "midnight-eye-wells") {
      contents = wells(tokens.shadow) + '<g fill="none" stroke="' + tokens.highlight + '" stroke-width=".5"><ellipse cx="35.5" cy="54.15" rx="5.1" ry="3.95"/><ellipse cx="64.5" cy="54.15" rx="5.1" ry="3.95"/></g>';
    }
    if (traits.eyes.id === "sleepy-lids") {
      contents = wells(tokens.focal) + '<path d="M30.27 52.8 A5.5 4.35 0 0 1 40.73 52.8 Z M59.27 52.8 A5.5 4.35 0 0 1 69.73 52.8 Z" fill="' + tokens.shadow + '"/>';
    }
    if (traits.eyes.id === "heterochroma-wells") contents = wells(tokens.focal, tokens.highlight);
    if (traits.eyes.id === "radiant-gaze") {
      contents = '<ellipse cx="35.5" cy="54.15" rx="5.5" ry="4.35" fill="url(#' + ids.gazeLeft + ')"/><ellipse cx="64.5" cy="54.15" rx="5.5" ry="4.35" fill="url(#' + ids.gazeRight + ')"/>';
    }
    return '<g data-eye-treatment="' + traits.eyes.id + '">' + contents + "</g>";
  }

  function renderResolvedV1(traits) {
    const validation = validateTraitsV1(traits);
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

  function renderResolvedV2(traits) {
    const validation = validateTraitsV2(traits);
    if (!validation.valid) throw new Error("Invalid Hex Owl traits: " + validation.issues.join(" "));
    const selectionSignature = ["v2", "palette"].concat(CATEGORY_KEYS)
      .map(key => key === "v2" ? key : traits.selectionIds[key])
      .concat([String(traits.prismPermutation)])
      .join("|");
    const idRoot = "hex-owl-v2-" + traits.seed.slice(0, 12) + "-" + hashWords(selectionSignature).slice(0, 8);
    const ids = {
      safe: idRoot + "-safe",
      glow: idRoot + "-glow",
      gazeLeft: idRoot + "-gaze-left",
      gazeRight: idRoot + "-gaze-right"
    };
    const tokens = traits.palette.tokens;
    const gazeGradient = id => '<radialGradient id="' + id + '"><stop offset="0" stop-color="' + tokens.highlight + '"/><stop offset=".45" stop-color="' + tokens.focal + '"/><stop offset="1" stop-color="' + tokens.focal + '" stop-opacity=".12"/></radialGradient>';
    const definitions =
      '<defs><clipPath id="' + ids.safe + '"><polygon points="' + V2_GEOMETRY.safeZones.innerPortal.points + '"/></clipPath>' +
      '<radialGradient id="' + ids.glow + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="' + tokens.focal + '" stop-opacity="0"/><stop offset=".52" stop-color="' + tokens.focal + '" stop-opacity="0"/><stop offset=".70" stop-color="' + tokens.focal + '" stop-opacity=".50"/><stop offset=".85" stop-color="' + tokens.ring + '" stop-opacity=".62"/><stop offset="1" stop-color="' + tokens.beam + '" stop-opacity="0"/></radialGradient>' +
      gazeGradient(ids.gazeLeft) + gazeGradient(ids.gazeRight) + "</defs>";
    const backdrop =
      '<ellipse cx="50" cy="53.5" rx="26.7" ry="24.8" fill="#090716"/>' +
      '<path d="M29 50q4-18 21-27 17 9 21 27z" fill="#090716"/>';
    const base = '<use href="#' + SHARED_MARK_ID + '" fill="' + tokens.face + '" transform="' + OWL_TRANSFORM + '"/>';
    const clipped = ' clip-path="url(#' + ids.safe + ')"';
    const body =
      layer("background", '<rect width="100" height="100" rx="10" fill="#090716"/>') +
      layer("aura", auraSvgV2(traits, ids), ' data-aura="' + traits.aura.id + '"') +
      layer("laser-outer", laserSegmentSvg(traits, "outer"), ' data-crossing-exception="' + (traits.eyes.id === "pupil-lasers" ? "laser" : "none") + '"') +
      layer("portal-rings", ringsSvg(traits), ' data-direction="' + traits.direction.id + '" data-prism-permutation="' + traits.prismPermutation + '"') +
      layer("owl-backdrop", backdrop) +
      layer("eyes", eyesSvgV2(traits, ids), clipped) +
      layer("owl-base", base) +
      layer("brows", browSvgV2(traits), clipped) +
      layer("facial-details", facialDetailsSvgV2(traits), clipped) +
      layer("beak", beakSvgV2(traits), clipped) +
      layer("accessories", "", clipped) +
      layer("laser-inner", laserSegmentSvg(traits, "inner"), ' data-origin="exact-pupils"');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Algorithmically generated Hex Owl" preserveAspectRatio="xMidYMid meet" data-hex-owl-version="2" data-rarity="' + traits.rarity.id + '" data-cost="' + traits.cost + '" data-heroes="' + traits.heroCount + '" data-supports="' + traits.supportCount + '">' +
      '<title>Hex Owl, ' + traits.rarity.name + ' 2026 V2 edition</title>' +
      '<desc>Exact Shambhala Owl anatomy inside four measured portal rings. Traits are deterministically selected from the frozen V2 manifest.</desc>' +
      definitions + body + "</svg>";
  }

  const V3_HEX_DIRECTIONS = deepFreeze([
    [0, -1],
    [0.8660254037844386, -0.5],
    [0.8660254037844386, 0.5],
    [0, 1],
    [-0.8660254037844386, 0.5],
    [-0.8660254037844386, -0.5]
  ]);
  const V3_ROTATIONS = deepFreeze({
    0: [1, 0],
    10: [0.984807753012208, 0.17364817766693033],
    20: [0.9396926207859084, 0.3420201433256687],
    30: [0.8660254037844386, 0.5],
    40: [0.766044443118978, 0.6427876096865394],
    50: [0.6427876096865394, 0.766044443118978],
    60: [0.5, 0.8660254037844386]
  });
  const V3_BEACON_DIRECTIONS = deepFreeze([
    [0.5, -0.8660254037844386], [0.8660254037844386, -0.5], [1, 0],
    [0.8660254037844386, 0.5], [0.5, 0.8660254037844386], [0, 1],
    [-0.5, 0.8660254037844386], [-0.8660254037844386, 0.5], [-1, 0],
    [-0.8660254037844386, -0.5], [-0.5, -0.8660254037844386], [0, -1]
  ]);

  function unitVectorV3(turn) {
    const pi = 3.141592653589793;
    const halfPi = 1.5707963267948966;
    let angle = Number(turn) * 6.283185307179586;
    if (angle > pi) angle -= 6.283185307179586;
    let cosineSign = 1;
    if (angle > halfPi) {
      angle = pi - angle;
      cosineSign = -1;
    } else if (angle < -halfPi) {
      angle = -pi - angle;
      cosineSign = -1;
    }
    const squared = angle * angle;
    const sine = angle * (1 + squared * (-1 / 6 + squared * (1 / 120 + squared * (-1 / 5040 + squared * (1 / 362880 + squared * (-1 / 39916800 + squared / 6227020800))))));
    const cosine = cosineSign * (1 + squared * (-1 / 2 + squared * (1 / 24 + squared * (-1 / 720 + squared * (1 / 40320 + squared * (-1 / 3628800 + squared / 479001600))))));
    return [cosine, sine];
  }

  function hexPointsV3(cx, cy, radius, rotation) {
    const basis = V3_ROTATIONS[Math.abs(rotation)] || V3_ROTATIONS[0];
    const sine = rotation < 0 ? -basis[1] : basis[1];
    return V3_HEX_DIRECTIONS.map(([x, y]) => {
      const rotatedX = x * basis[0] - y * sine;
      const rotatedY = x * sine + y * basis[0];
      return (cx + radius * rotatedX).toFixed(4) + "," + (cy + radius * rotatedY).toFixed(4);
    }).join(" ");
  }

  function auraSvgV3(traits, ids) {
    const tokens = traits.palette.tokens;
    if (traits.aura.id === "radial-glow") {
      return '<circle cx="50" cy="50" r="41" fill="none" stroke="' + tokens.ring + '" stroke-width="8" opacity=".10"/>' +
        '<circle cx="50" cy="50" r="41" fill="none" stroke="' + tokens.ring + '" stroke-width="3.5" opacity=".18"/>';
    }
    if (traits.aura.id === "stardust") {
      const random = categoryRandom(traits.seed, CAMP_VERSION, "stardust-field");
      let dots = "";
      for (let index = 0; index < 16; index += 1) {
        const direction = unitVectorV3(random());
        const radius = 40 + random() * 8;
        dots += '<circle cx="' + (50 + radius * direction[0]).toFixed(2) + '" cy="' + (50 + radius * direction[1]).toFixed(2) +
          '" r="' + (0.3 + random() * 0.35).toFixed(2) + '" fill="' + tokens.highlight + '" opacity="' + (0.45 + random() * 0.45).toFixed(2) + '"/>';
      }
      return dots;
    }
    if (traits.aura.id === "camp-beacon") {
      let rays = '<circle cx="50" cy="50" r="49.5" fill="url(#' + ids.beacon + ')"/>';
      for (let index = 0; index < 12; index += 1) {
        const direction = V3_BEACON_DIRECTIONS[index];
        const long = index % 2 === 0;
        const inner = long ? 45.2 : 46.4;
        const outer = long ? 49.3 : 48.3;
        rays += '<line x1="' + (50 + inner * direction[0]).toFixed(2) + '" y1="' + (50 + inner * direction[1]).toFixed(2) +
          '" x2="' + (50 + outer * direction[0]).toFixed(2) + '" y2="' + (50 + outer * direction[1]).toFixed(2) +
          '" stroke="' + tokens.beam + '" stroke-width="' + (long ? 0.7 : 0.45) + '" stroke-linecap="round" opacity="' + (long ? 0.6 : 0.32) + '"/>';
      }
      return rays;
    }
    return "";
  }

  function ringsSvgV3(traits) {
    const tokens = traits.palette.tokens;
    const direction = traits.direction.id === "counter-clockwise" ? -1 : 1;
    return GEOMETRY.rings.map((ring, index) => {
      const width = (ring.strokeWidth * traits.ringStyle.widthFactor).toFixed(3);
      const dash = traits.ringStyle.dash ? ' stroke-dasharray="' + traits.ringStyle.dash + '"' : "";
      const radii = traits.ringStyle.double ? [ring.radius + 0.42, ring.radius - 0.42] : [ring.radius];
      return radii.map((radius, lineIndex) => {
        const opacity = lineIndex === 0 ? [0.55, 0.68, 0.82, 0.95][index] : Number(([0.55, 0.68, 0.82, 0.95][index] * 0.8).toFixed(2));
        const rotation = 30 + direction * index * 10;
        return '<polygon data-ring="' + ring.id + '" data-rotation="' + rotation + '" data-radius="' + radius.toFixed(2) +
          '" points="' + hexPointsV3(50, 50, radius, rotation) + '" fill="none" stroke="' + tokens.ring +
          '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round"' + dash + ' opacity="' + opacity + '"/>';
      }).join("");
    }).join("");
  }

  function eyesSvgV3(traits, ids) {
    if (traits.eyes.id === "original-eyes") return "";
    const gradient = traits.eyes.id === "festival-eye-wells" ? ids.festivalWell : ids.uvWell;
    return '<circle cx="34.8890" cy="52.4455" r="4.6" fill="url(#' + gradient + ')"/>' +
      '<circle cx="65.1840" cy="52.4455" r="4.6" fill="url(#' + gradient + ')"/>';
  }

  function honeycombSvgV3(traits, ids) {
    if (traits.marking.id !== "uv-honeycomb") return "";
    const tokens = traits.palette.tokens;
    const random = categoryRandom(traits.seed, CAMP_VERSION, "honeycomb-cells");
    const cellRadius = 2.55;
    const xStep = cellRadius * 1.7320508075688772;
    const yStep = cellRadius * 1.5;
    let cells = "";
    for (let row = -10; row <= 10; row += 1) {
      const cy = 50 + row * yStep;
      if (Math.abs(cy - 50) > 25.5) continue;
      const offset = row % 2 !== 0 ? xStep / 2 : 0;
      for (let column = -7; column <= 7; column += 1) {
        const cx = 50 + column * xStep + offset;
        if (Math.hypot(cx - 50, cy - 50) > 24.4) continue;
        const charged = random() < 0.14;
        cells += '<polygon points="' + hexPointsV3(cx, cy, cellRadius - 0.3, 30) + '" fill="' + (charged ? tokens.beam : "none") +
          '"' + (charged ? ' fill-opacity=".2"' : "") + ' stroke="' + tokens.beam + '" stroke-width="' + (charged ? ".26" : ".2") +
          '" stroke-linejoin="round" opacity="' + (charged ? ".75" : ".38") + '"/>';
      }
    }
    return '<g mask="url(#' + ids.combMask + ')">' + cells + "</g>";
  }

  function browSvgV3(traits) {
    const tokens = traits.palette.tokens;
    if (traits.brow.id === "crown-gem") {
      return '<polygon points="50,24.35 51.25,25.9 50,27.45 48.75,25.9" fill="' + tokens.focal + '"/>';
    }
    if (traits.brow.id === "hex-crest") {
      return '<polygon points="' + hexPointsV3(50, 25.9, 1.95, 30) + '" fill="none" stroke="' + tokens.focal + '" stroke-width=".34" stroke-linejoin="round"/>' +
        '<polygon points="' + hexPointsV3(50, 25.9, 1.15, 40) + '" fill="none" stroke="' + tokens.highlight + '" stroke-width=".28" stroke-linejoin="round" opacity=".92"/>';
    }
    return "";
  }

  function facialDetailsSvgV3(traits) {
    if (traits.marking.id !== "moon-freckles" && traits.marking.id !== "hexlace-freckles") return "";
    const tokens = traits.palette.tokens;
    const offsets = [[-1.7, -0.5, 0.85], [0.1, 0.9, 0.6], [1.8, -0.1, 0.75]];
    const centres = [[41.4, 65.4], [58.6, 65.4]];
    return centres.map(centre => offsets.map(offset => {
      const cx = centre[0] + offset[0];
      const cy = centre[1] + offset[1];
      if (traits.marking.id === "moon-freckles") {
        return '<circle cx="' + cx + '" cy="' + cy + '" r=".45" fill="' + tokens.highlight + '" opacity=".85"/>';
      }
      return '<polygon points="' + hexPointsV3(cx, cy, offset[2], 30) + '" fill="none" stroke="' + tokens.highlight + '" stroke-width=".22" stroke-linejoin="round" opacity=".85"/>';
    }).join("")).join("");
  }

  function beakSvgV3(traits) {
    const tokens = traits.palette.tokens;
    if (traits.beak.id === "amber-shard") {
      return '<polygon points="50,55.95 51.15,56.55 51.15,59.45 50,60.3 48.85,59.45 48.85,56.55" fill="#f5bf4f" opacity=".95"/>' +
        '<line x1="50" y1="55.95" x2="50" y2="60.3" stroke="' + tokens.shadow + '" stroke-width=".18" opacity=".55"/>';
    }
    if (traits.beak.id === "hex-facet") {
      let spokes = "";
      [[1, 0], [-0.5, 0.8660254037844386], [-0.5, -0.8660254037844386]].forEach(direction => {
        spokes += '<line x1="50" y1="58.15" x2="' + (50 + 1.9 * direction[0]).toFixed(3) + '" y2="' + (58.15 + 1.9 * direction[1]).toFixed(3) +
          '" stroke="' + tokens.highlight + '" stroke-width=".2" opacity=".8"/>';
      });
      return '<circle cx="50" cy="58.15" r="3.1" fill="' + tokens.beam + '" opacity=".14"/>' +
        '<polygon points="' + hexPointsV3(50, 58.15, 1.9, 30) + '" fill="#0b0c15" fill-opacity=".55" stroke="' + tokens.focal + '" stroke-width=".3" stroke-linejoin="round"/>' +
        spokes + '<circle cx="50" cy="58.15" r=".34" fill="' + tokens.beam + '"/>';
    }
    return "";
  }

  function renderResolvedV3(traits) {
    const signature = ["v3", "palette"].concat(V3_CATEGORY_KEYS)
      .map(key => key === "v3" ? key : traits.selectionIds[key])
      .join("|");
    const idRoot = "hex-owl-v3-" + traits.seed.slice(0, 12) + "-" + hashWords(signature).slice(0, 8);
    const ids = {
      background: idRoot + "-background",
      beacon: idRoot + "-beacon",
      vortexGlow: idRoot + "-vortex-glow",
      backdrop: idRoot + "-backdrop",
      festivalWell: idRoot + "-festival-well",
      uvWell: idRoot + "-uv-well",
      combFade: idRoot + "-comb-fade",
      combMask: idRoot + "-comb-mask"
    };
    const tokens = traits.palette.tokens;
    const definitions = '<defs>' +
      '<radialGradient id="' + ids.background + '" cx="30%" cy="20%" r="85%"><stop offset="0%" stop-color="' + tokens.shadow + '" stop-opacity=".5"/><stop offset="100%" stop-color="' + tokens.shadow + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + ids.beacon + '"><stop offset="55%" stop-color="' + tokens.beam + '" stop-opacity="0"/><stop offset="88%" stop-color="' + tokens.beam + '" stop-opacity=".14"/><stop offset="100%" stop-color="' + tokens.beam + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + ids.vortexGlow + '"><stop offset="0%" stop-color="' + tokens.ring + '" stop-opacity=".13"/><stop offset="100%" stop-color="' + tokens.ring + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + ids.backdrop + '"><stop offset="0%" stop-color="' + tokens.face + '" stop-opacity=".15"/><stop offset="100%" stop-color="' + tokens.face + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + ids.festivalWell + '"><stop offset="0%" stop-color="' + tokens.focal + '"/><stop offset="62%" stop-color="' + tokens.focal + '" stop-opacity=".55"/><stop offset="100%" stop-color="' + tokens.shadow + '"/></radialGradient>' +
      '<radialGradient id="' + ids.uvWell + '"><stop offset="0%" stop-color="' + tokens.beam + '"/><stop offset="62%" stop-color="' + tokens.beam + '" stop-opacity=".55"/><stop offset="100%" stop-color="' + tokens.shadow + '"/></radialGradient>' +
      '<radialGradient id="' + ids.combFade + '"><stop offset="0%" stop-color="#fff"/><stop offset="58%" stop-color="#fff"/><stop offset="100%" stop-color="#fff" stop-opacity=".12"/></radialGradient>' +
      '<mask id="' + ids.combMask + '"><circle cx="50" cy="50" r="26" fill="url(#' + ids.combFade + ')"/></mask></defs>';
    const body =
      layer("background", '<rect width="100" height="100" fill="#0b0c15"/><rect width="100" height="100" fill="url(#' + ids.background + ')"/>') +
      layer("aura", auraSvgV3(traits, ids), ' data-aura="' + traits.aura.id + '"') +
      layer("portal-rings", ringsSvgV3(traits), ' data-direction="' + traits.direction.id + '"') +
      layer("ring-glow", '<circle cx="50" cy="50" r="30" fill="url(#' + ids.vortexGlow + ')"/>') +
      layer("owl-backdrop", '<circle cx="50" cy="50" r="27.5" fill="url(#' + ids.backdrop + ')"/>') +
      layer("base-disc", '<circle cx="50" cy="50" r="26.4" fill="#0b0c15"/>') +
      layer("eyes", eyesSvgV3(traits, ids)) +
      layer("owl-base", '<use href="#' + SHARED_MARK_ID + '" fill="' + tokens.face + '" transform="' + OWL_TRANSFORM + '"/>') +
      layer("honeycomb", honeycombSvgV3(traits, ids)) +
      layer("brows", browSvgV3(traits)) +
      layer("facial-details", facialDetailsSvgV3(traits)) +
      layer("beak", beakSvgV3(traits));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Camp Hexadecibel Owl" preserveAspectRatio="xMidYMid meet" data-hex-owl-version="3" data-rarity="camp-hexadecibel" data-cost="' + traits.cost + '" data-heroes="' + traits.heroCount + '" data-supports="' + traits.supportCount + '">' +
      '<title>Camp Hexadecibel Owl, 2026 V3 edition</title><desc>Provenance-only Hex Owl with UV traits and the mandatory Hexadecibel Vortex.</desc>' +
      definitions + body + "</svg>";
  }

  function checkedIdentity(value) {
    const source = value && typeof value === "object" ? value : { version: value };
    const resolved = source.version === undefined ? VERSION : Number(source.version);
    if (!SPECS[resolved]) throw new Error("Unsupported Hex Owl version: " + source.version);
    return {
      version: resolved,
      tier: source.tier === CAMP_TIER ? CAMP_TIER : PUBLIC_TIER,
      campAccess: source.campAccess === true
    };
  }

  function checkedVersion(value) {
    return checkedIdentity(value).version;
  }

  function requestedTier(options, identity) {
    const config = options && typeof options === "object" ? options : {};
    const overrides = config.overrides && typeof config.overrides === "object" ? config.overrides : config;
    const supplied = config.rarity !== undefined ? config.rarity : overrides.rarity;
    const rarity = supplied && typeof supplied === "object" ? supplied.id : supplied;
    if (String(rarity || "").toLowerCase() === CAMP_TIER) return CAMP_TIER;
    if (rarity !== undefined && rarity !== null && rarity !== "" && String(rarity).toLowerCase() !== "auto") return PUBLIC_TIER;
    return identity.tier;
  }

  function wrapCurrentTraits(traits, tier) {
    return deepFreeze({ ...traits, version: VERSION, tier });
  }

  function resolveTraitsV4(seed, options, identity) {
    const tier = requestedTier(options, identity);
    return tier === CAMP_TIER
      ? wrapCurrentTraits(resolveTraitsV3(seed, options, CAMP_VERSION), CAMP_TIER)
      : wrapCurrentTraits(resolveTraitsV2(seed, options, V2_VERSION), PUBLIC_TIER);
  }

  function resolveTraits(seed, options, version) {
    const identity = checkedIdentity(version === undefined ? options : version);
    if (identity.version === V1_VERSION) return resolveTraitsV1(seed, options, V1_VERSION);
    if (identity.version === V2_VERSION) return resolveTraitsV2(seed, options, V2_VERSION);
    if (identity.version === CAMP_VERSION) return resolveTraitsV3(seed, options, CAMP_VERSION);
    return resolveTraitsV4(seed, options, identity);
  }

  function selectTraits(seed, version) {
    const identity = checkedIdentity(version);
    if (identity.version === V1_VERSION) return selectTraitsV1(seed);
    if (identity.version === V2_VERSION) return selectTraitsV2(seed);
    if (identity.version === CAMP_VERSION) return selectTraitsV3(seed);
    return identity.tier === CAMP_TIER
      ? wrapCurrentTraits(selectTraitsV3(seed), CAMP_TIER)
      : wrapCurrentTraits(selectTraitsV2(seed), PUBLIC_TIER);
  }

  function validateTraits(traits, version) {
    const identity = checkedIdentity(version === undefined ? traits : version);
    if (identity.version === V1_VERSION) return validateTraitsV1(traits);
    if (identity.version === V2_VERSION) return validateTraitsV2(traits);
    if (identity.version === CAMP_VERSION) return validateTraitsV3(traits);
    return requestedTier(traits, identity) === CAMP_TIER ? validateTraitsV3(traits) : validateTraitsV2(traits);
  }

  function renderResolvedV4(traits) {
    const tier = requestedTier(traits, checkedIdentity(traits));
    const legacyTraits = { ...traits, version: tier === CAMP_TIER ? CAMP_VERSION : V2_VERSION };
    const svg = tier === CAMP_TIER ? renderResolvedV3(legacyTraits) : renderResolvedV2(legacyTraits);
    return svg.replace(/data-hex-owl-version="[23]"/, 'data-hex-owl-version="4"');
  }

  function renderResolved(traits) {
    const resolvedVersion = checkedVersion(traits);
    if (resolvedVersion === V1_VERSION) return renderResolvedV1(traits);
    if (resolvedVersion === V2_VERSION) return renderResolvedV2(traits);
    if (resolvedVersion === CAMP_VERSION) return renderResolvedV3(traits);
    return renderResolvedV4(traits);
  }

  function renderWithTraits(seed, traitsOrOptions, version) {
    const identity = checkedIdentity(version === undefined ? traitsOrOptions : version);
    let traits = traitsOrOptions;
    if (!traits || typeof traits !== "object" || !traits.palette || !traits.rarity || !traits.selectionIds) {
      traits = resolveTraits(seed, traitsOrOptions || {}, identity);
    } else {
      const forced = {};
      Object.keys(traits.selectionIds || {}).forEach(key => { forced[key] = traits.selectionIds[key]; });
      traits = resolveTraits(seed, { rarity: traits.rarity.id, overrides: forced, freestyle: traits.freestyle === true }, identity);
    }
    return renderResolved(traits);
  }

  function renderSvg(seed, version) {
    const identity = checkedIdentity(version);
    return renderResolved(selectTraits(seed, identity));
  }

  function traitNames(seed, version) {
    const traits = selectTraits(seed, checkedIdentity(version));
    return deepFreeze({
      "Eye style": traits.eyes.name,
      "Owl colour": traits.palette.name,
      ...(traits.accessory ? { Accessory: traits.accessory.name } : {}),
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

  function spec(version) {
    return SPECS[checkedVersion(version)];
  }

  function catalogue(version) {
    const identity = checkedIdentity(version);
    if (identity.version === VERSION && identity.campAccess) return V4_CAMP_CATALOGUE;
    return SPECS[identity.version].catalogue;
  }

  const API = deepFreeze({
    VERSION,
    CAMP_VERSION,
    PUBLIC_TIER,
    CAMP_TIER,
    SPEC: V4_SPEC,
    CAMP_SPEC: V3_SPEC,
    SPECS,
    normalizeSeed,
    randomSeed,
    selectTraits,
    resolveTraits,
    validateTraits,
    renderSvg,
    renderWithTraits,
    traitNames,
    spec,
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
