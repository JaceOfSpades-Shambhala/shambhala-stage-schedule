// The single source of truth for what GitHub Pages publishes.
//
// This is an ALLOWLIST on purpose. Anything not named here stays private by
// default, so adding a new internal note, audit, or scratch file can never
// publish it by accident. Adding a new *public* asset is a deliberate edit to
// this file, and test/pages-artifact.test.mjs will fail if a runtime reference
// points at something that was never allowlisted.
//
// Derived from the authoritative runtime references:
//   - sw.js CORE_ASSETS / OPTIONAL_ASSETS
//   - index.html <script>/<link> tags
//   - manifest.webmanifest icons
//   - styles.css @font-face sources

export const PAGES_FILES = [
  // Shell
  ".nojekyll",
  "index.html",
  "styles.css",
  "sw.js",
  "manifest.webmanifest",

  // Application modules (sw.js CORE_ASSETS)
  "app.js",
  "camp-access.js",
  "camp-location.js",
  "hex-owl.js",
  "hexadex.js",
  "hexlace-api.js",
  "hexlace-compare.js",
  "hexlace-giveaway.js",
  "hexlaces.js",
  "install.js",
  "planner.js",
  "preview-time.js",
  "qrcode.js",
  "schedule-data.js",
  "schedule-metadata.js",
  "search-normalize.js",
  "undo.js",

  // Artwork and icons
  "hex-owl-base.svg",
  "wordmark.svg",
  "apple-touch-icon.png",
  "favicon-16.png",
  "favicon-32.png",
  "favicon.ico",
  "icon-192.png",
  "icon-512.png",

  // Standalone Owl trait/seed gallery. Linked publicly from README and cached
  // as an OPTIONAL_ASSET. Kept public for now: the trait catalogue it renders
  // already ships in hex-owl.js, which is a CORE asset, so withholding the
  // page would not withhold the data.
  "hex-owl-playground.html"
];

export const PAGES_DIRS = [
  "fonts",
  "stage-names"
];

// Referenced at runtime but intentionally absent from the repository.
// sw.js:5 and app.js:575 point at ./schedule-freshness.json, which nothing
// generates; both call sites already tolerate the 404 through the freshness
// fallback path. Listed here so the artifact test does not flag a dangling
// reference that predates the Pages boundary and is unrelated to it.
export const KNOWN_ABSENT_REFERENCES = [
  "schedule-freshness.json"
];

// Paths that must never reach the published artifact. The build allowlist
// already excludes them; this is a redundant assertion so a careless edit to
// PAGES_FILES/PAGES_DIRS fails loudly in CI rather than silently republishing.
export const PROHIBITED_PATTERNS = [
  /^\.audit\//,
  /^\.github\//,
  /^test\//,
  /^scripts\//,
  /^worker\//,
  /^node_modules\//,
  /^\.git\//,
  /^wrangler\.jsonc$/,
  /^package(-lock)?\.json$/,
  /\.md$/i,
  /\.test\.mjs$/
];
