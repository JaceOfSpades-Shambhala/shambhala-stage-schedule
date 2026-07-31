import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PAGES_FILES,
  PAGES_DIRS,
  SYNTHETIC_CACHE_KEYS,
  PROHIBITED_PATTERNS
} from "../scripts/pages-manifest.mjs";

const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");

const allowed = path =>
  PAGES_FILES.includes(path) ||
  PAGES_DIRS.some(dir => path.startsWith(`${dir}/`)) ||
  SYNTHETIC_CACHE_KEYS.includes(path);

// Normalize a runtime reference to a repository-relative path, or null when it
// is not a local asset (external URL, in-page anchor, data URI).
const normalize = raw => {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(value)) return null;
  return value.replace(/^\.\//, "").split("?")[0].split("#")[0] || null;
};

const collect = (source, pattern, group = 1) =>
  [...source.matchAll(pattern)].map(match => normalize(match[group])).filter(Boolean);

test("every runtime asset reference is published by the Pages allowlist", async () => {
  const [html, serviceWorker, css, manifest] = await Promise.all([
    read("index.html"), read("sw.js"), read("styles.css"), read("manifest.webmanifest")
  ]);

  const references = new Map([
    ["index.html", collect(html, /(?:src|href)="([^"]+)"/g)],
    // sw.js lists its precache entries as "./name.ext?v=NN" string literals.
    ["sw.js", collect(serviceWorker, /"(\.\/[^"]*)"/g)],
    ["styles.css", collect(css, /url\(\s*["']?([^"')]+)["']?\s*\)/g)],
    ["manifest.webmanifest", collect(manifest, /"src"\s*:\s*"([^"]+)"/g)]
  ]);

  for (const [source, paths] of references) {
    for (const path of new Set(paths)) {
      assert.ok(
        allowed(path),
        `${source} references "${path}", which scripts/pages-manifest.mjs does not publish. ` +
        `Add it to PAGES_FILES/PAGES_DIRS, or to SYNTHETIC_CACHE_KEYS if it is a Cache Storage ` +
        `key the service worker writes rather than a file it fetches.`
      );
    }
  }
});

test("the Pages allowlist never names an internal path", () => {
  for (const path of [...PAGES_FILES, ...PAGES_DIRS]) {
    for (const pattern of PROHIBITED_PATTERNS) {
      assert.ok(
        !pattern.test(path),
        `"${path}" is allowlisted for publication but matches the prohibited pattern ${pattern}.`
      );
    }
  }
});

test("previously published internal files stay out of the artifact", () => {
  // Regression guard for the files the old `path: .` upload served publicly.
  const mustNotPublish = [
    "HANDOFF.md",
    "TESTING.md",
    "UPDATING.md",
    "CAMP-ACCESS.md",
    "README.md",
    ".audit/AUDIT_FINDINGS_DRAFT.md",
    ".audit/AUDIT_COMMAND_LOG.md",
    ".audit/AUDIT_PROGRESS.md",
    "wrangler.jsonc",
    "package.json",
    "worker/src/index.js",
    "worker/src/durable-objects.js",
    "scripts/validate-schedule.mjs",
    // Developer tool. Retained in the repository for local trait work, but
    // deliberately not deployed — it exposes the seed/trait/palette system in
    // an explorable form.
    "hex-owl-playground.html"
  ];
  for (const path of mustNotPublish) {
    assert.ok(
      !PAGES_FILES.includes(path),
      `"${path}" must never be published by GitHub Pages.`
    );
    assert.ok(
      !PAGES_DIRS.some(dir => path.startsWith(`${dir}/`)),
      `"${path}" is published via the allowlisted directory it sits under.`
    );
  }
});
