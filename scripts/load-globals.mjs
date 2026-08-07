// Copyright (c) 2026 Jace Jacques. All rights reserved.
// Proprietary and confidential. Unauthorized copying, modification, or
// distribution of this file, via any medium, is strictly prohibited.
// See LICENSE at the repository root.

import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function createScriptContext(extraGlobals = {}) {
  return { window: {}, ...extraGlobals };
}

export function loadScriptInto(context, relativePath) {
  const source = fs.readFileSync(root + relativePath, "utf8");
  vm.runInNewContext(source, context);
  return context.window;
}

export function loadGlobals(relativePaths, options = {}) {
  const paths = Array.isArray(relativePaths) ? relativePaths : [relativePaths];
  const context = createScriptContext(options.context || {});
  for (const relativePath of paths) {
    loadScriptInto(context, relativePath);
  }
  return context.window;
}

export function parseAsClassicScript(source, filename = "<anonymous>") {
  new vm.Script(source, { filename });
}
