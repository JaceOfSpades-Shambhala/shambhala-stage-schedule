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
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAGES_FILES,
  PAGES_DIRS,
  PROHIBITED_PATTERNS
} from "./pages-manifest.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

const comparablePath = path => process.platform === "win32" ? path.toLowerCase() : path;

export function resolveOutputDir(rootDir, arg) {
  if (typeof arg === "string" && !arg.trim()) {
    throw new Error("Refusing to build: empty output directory argument.");
  }

  const outDir = resolve(rootDir, arg === undefined ? "dist" : arg);
  const allowedDir = resolve(rootDir, "dist");
  if (comparablePath(outDir) !== comparablePath(allowedDir)) {
    throw new Error("Refusing to build: only the repository dist directory is allowed.");
  }
  return outDir;
}

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

async function buildPages(arg) {
  const outDir = resolveOutputDir(root, arg);

  // Fail before copying anything if the allowlist names something that is gone.
  // A renamed asset should break the build, not silently ship a broken site.
  const missing = [];
  for (const file of [...PAGES_FILES, ...PAGES_DIRS]) {
    if (!(await exists(join(root, file)))) missing.push(file);
  }
  if (missing.length) {
    throw new Error([
      "Allowlisted paths are missing from the repository:",
      ...missing.map(file => `  - ${file}`),
      "",
      "Update scripts/pages-manifest.mjs if these were renamed or removed."
    ].join("\n"));
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
    throw new Error([
      "Prohibited files reached the Pages artifact:",
      ...leaked.map(file => `  - ${file}`)
    ].join("\n"));
  }

  console.log(`Staged ${staged.length} files into ${relative(root, outDir) || "."}/`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (comparablePath(invokedPath) === comparablePath(fileURLToPath(import.meta.url))) {
  try {
    await buildPages(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
