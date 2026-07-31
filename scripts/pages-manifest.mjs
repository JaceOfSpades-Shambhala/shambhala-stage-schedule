// Copyright (c) 2026 Jace Jacques. All rights reserved.
// Proprietary and confidential. Unauthorized copying, modification, or
// distribution of this file, via any medium, is strictly prohibited.
// See LICENSE at the repository root.

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
  // Published deliberately: the terms should be readable at the point someone
  // would copy from the deployed site, not only in the repository.
  "LICENSE",

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
  "icon-512.png"
];

export const PAGES_DIRS = [
  "fonts",
  "stage-names"
];

// Cache Storage keys the service worker synthesises at runtime. These look like
// asset paths but are never network resources, so they must not be published
// and must not be treated as dangling references.
//
// schedule-freshness.json is written by markScheduleFresh() in sw.js, which
// constructs a Response in memory and cache.put()s it under this key; app.js
// reads it back with caches.match(), never fetch(). It backs the FRESH /
// UPDATED N MIN AGO / OFFLINE indicator, and app.js falls back to the cached
// schedule-metadata.js date header when the key is absent.
export const SYNTHETIC_CACHE_KEYS = [
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
