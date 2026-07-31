// Copyright (c) 2026 Jace Jacques. All rights reserved.
// Proprietary and confidential. Unauthorized copying, modification, or
// distribution of this file, via any medium, is strictly prohibited.
// See LICENSE at the repository root.

// Stage the public GitHub Pages artifact into dist/.
//
// The workflow used to upload the repository root, which published HANDOFF.md,
// TESTING.md, CAMP-ACCESS.md, the .audit/ security findings, the test suite,
// and the Worker source to the open web. This copies only what the allowlist in
// pages-manifest.mjs names.
//
// Usage: node scripts/build-pages.mjs [outDir]   (default: dist)

import { cp, mkdir, rm, stat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAGES_FILES,
  PAGES_DIRS,
  PROHIBITED_PATTERNS
} from "./pages-manifest.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = join(root, process.argv[2] || "dist");

const exists = async path => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const walk = async (dir, base = dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(relative(base, full));
  }
  return out;
};

// Fail before copying anything if the allowlist names something that is gone.
// A renamed asset should break the build, not silently ship a broken site.
const missing = [];
for (const file of [...PAGES_FILES, ...PAGES_DIRS]) {
  if (!(await exists(join(root, file)))) missing.push(file);
}
if (missing.length) {
  console.error("Allowlisted paths are missing from the repository:");
  for (const file of missing) console.error(`  - ${file}`);
  console.error("\nUpdate scripts/pages-manifest.mjs if these were renamed or removed.");
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of PAGES_FILES) {
  await cp(join(root, file), join(outDir, file));
}
for (const dir of PAGES_DIRS) {
  await cp(join(root, dir), join(outDir, dir), { recursive: true });
}

// Belt and braces: assert nothing prohibited landed in the artifact, even if
// the allowlist was edited carelessly.
const staged = await walk(outDir);
const leaked = staged.filter(file =>
  PROHIBITED_PATTERNS.some(pattern => pattern.test(file.split("\\").join("/")))
);
if (leaked.length) {
  console.error("Prohibited files reached the Pages artifact:");
  for (const file of leaked) console.error(`  - ${file}`);
  process.exit(1);
}

console.log(`Staged ${staged.length} files into ${relative(root, outDir) || "."}/`);
