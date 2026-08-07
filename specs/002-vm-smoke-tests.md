# 002 — Reusable vm loader + browser-script syntax guard

## Goal

`scripts/load-globals.mjs` exists as the single reusable implementation of the
`vm` bridge, and `npm test` fails if any script `index.html` loads stops being
valid classic-browser-script syntax — closing the gap where adding an `export`
to a browser file passes both `node --check` and `npm test` while breaking the
live site.

## Context

Spec 001 documented the two module systems. This closes the corresponding
enforcement gap.

**The gap, verified.** `package.json` sets `"type": "module"`, so `node --check`
parses root `.js` files as ESM and **passes** on a file containing `export`.
Nothing else catches it either:

- `test/release-integrity.test.mjs` only `read()`s `app.js` / `planner.js` as
  strings for regex assertions. It never executes them.
- `app.js`, `qrcode.js`, and `camp-location.js` are executed by nothing.
- `planner.js` **is** executed, by `test/helpers/planner-harness.mjs:126`, but
  through `await import("data:text/javascript;base64,...")` — an **ESM** module
  evaluation, in which `export` is perfectly legal. Verified directly: importing
  a data URL whose source contains `export function bar(){}` resolves
  successfully. `test/helpers/hexlaces-harness.mjs:110` uses the same data-URL
  mechanism for `hexlaces.js`, `hexadex.js`, `camp-access.js`, and
  `hexlace-api.js`, and is equally blind to `export`.

So no existing check rejects ESM syntax in a file that `index.html` loads with a
plain `<script src>` tag.

**Why not "execute the file and assert its globals".** Verified empirically:
`app.js` and `planner.js` both throw `ReferenceError: document is not defined`
in a bare `vm` context. Executing them would require a DOM stub that must grow
whenever those files touch a new browser API, producing false failures unrelated
to the bug being caught. Rejected.

**The mechanism.** `new vm.Script(source)` compiles source as a **classic script
without executing it**. Verified: it throws `SyntaxError: Unexpected token
'export'` on an ESM export, and compiles `document.getElementById("x")` without
error because nothing runs. That catches exactly the target bug class with no
stubs and nothing to maintain.

**Why `scripts/load-globals.mjs` specifically.**
`docs/festival-platform-extraction.md:256` names this exact file — "Extract the
helper into `scripts/load-globals.mjs` so schedule and stages share one copy of
it." This spec creates it and proves it against its first real consumer.

## Files to change

Exhaustive. Anything not listed here must not be touched.

- `scripts/load-globals.mjs` — **new file.** The reusable `vm` helper.
- `test/browser-script-syntax.test.mjs` — **new file.** Three tests.
- `scripts/validate-schedule.mjs` — **modify** its import block and the body of
  `loadSchedule()`. No other function is touched.

Creating `test/browser-script-syntax.test.mjs` is explicitly authorised by this
spec. No **existing** test file may be modified, including the two files under
`test/helpers/`.

## Changes

### 1. `scripts/load-globals.mjs` (new)

Begin with the exact 4-line copyright header used by `scripts/build-pages.mjs`
lines 1–4, copied verbatim.

Resolve the repo root with the house convention from `build-pages.mjs:24`:

```js
const root = fileURLToPath(new URL("../", import.meta.url));
```

All paths passed to this module are **repo-root-relative** (e.g.
`"schedule-data.js"`), resolved against `root`, and must work regardless of
`process.cwd()`. This is a deliberate behaviour change from
`validate-schedule.mjs`, which currently uses CWD-relative
`fs.readFileSync("schedule-data.js")`. Root-relative is identical when run from
the repo root (how `npm test` runs it) and correct from anywhere else. Test 3
below enforces it.

**Export exactly four functions. This list is authoritative:**

1. **`createScriptContext(extraGlobals = {})`** — returns a fresh object suitable
   as a `vm` context: `{ window: {}, ...extraGlobals }`. If `extraGlobals`
   contains `window`, it replaces the default `{}`.

2. **`loadScriptInto(context, relativePath)`** — reads the file at
   `root + relativePath` as UTF-8, runs it with
   `vm.runInNewContext(source, context)`, and returns `context.window`. Reusing
   one context across calls is how script-tag load order is replicated.

3. **`loadGlobals(relativePaths, options = {})`** — convenience wrapper.
   `relativePaths` is a string or an array of strings. Creates a context via
   `createScriptContext(options.context || {})`, calls `loadScriptInto` for each
   path **in array order**, and returns the resulting `window`.

4. **`parseAsClassicScript(source, filename = "<anonymous>")`** — calls
   `new vm.Script(source, { filename })` and returns nothing. It must **not**
   execute the source. Let the `SyntaxError` propagate uncaught; do not wrap,
   catch, or re-throw it. Note this takes **source text**, not a path.

### 2. `scripts/validate-schedule.mjs`

**Import block.** Add
`import { createScriptContext, loadScriptInto } from "./load-globals.mjs";`.
Then remove **both** `import fs from "node:fs";` (line 7) and
`import vm from "node:vm";` (line 8) — verified that lines 24 and 26 are the only
uses of either binding in the file, so both become unused. Leave
`import assert from "node:assert/strict";` (line 6) alone.

**`loadSchedule()` body.** Replace only the context construction and the two
`vm.runInNewContext(...)` calls with `createScriptContext()` and
`loadScriptInto(context, ...)`.

**Critical — do not collapse this into a single `loadGlobals([...])` call.**
The existing code reads `SCHEDULE_VERSION` *between* the two loads:

```js
vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
const dataVersion = context.window.SCHEDULE_VERSION;   // <-- intermediate read
vm.runInNewContext(fs.readFileSync("schedule-metadata.js", "utf8"), context);
assert.equal(context.window.SCHEDULE_VERSION, dataVersion, "...");
```

That assertion checks the two files declare the *same* version. If both files are
loaded before `dataVersion` is captured, `dataVersion` holds the final value and
the assertion compares a value to itself — it would pass unconditionally and
silently stop protecting anything. The intermediate read must stay exactly where
it is, between the two loads.

Every existing assertion in `loadSchedule()` keeps its current text and order.
Its return value stays `context.window`.

### 3. `test/browser-script-syntax.test.mjs` (new)

Same 4-line copyright header. Uses `node:test`, `node:assert/strict`,
`node:fs/promises`, `node:child_process`, `node:os`, and `parseAsClassicScript`
from `../scripts/load-globals.mjs`.

**Script discovery.** Derive the list from `index.html` rather than hardcoding
it, so scripts added later are covered automatically. Discovery must not depend
on attribute order or quote style:

1. Match every script tag: `/<script\b[^>]*>/g`.
2. Keep only tags containing a `src` attribute: `/\ssrc\s*=/`.
3. From each, extract the value with `/\ssrc\s*=\s*["']([^"']+)["']/`, accepting
   single or double quotes.
4. Skip any value matching `/^(https?:)?\/\//` (absolute or protocol-relative
   URLs are not local files).
5. Strip a trailing query string (`?v=78`) from each remaining value.

As of this spec `index.html` has 17 script tags, all with `src`, yielding 17
local paths from `camp-location.js` to `install.js`.

**Test 1 — `"every script index.html loads parses as a classic browser script"`**

Before parsing, two guards against vacuous success:

- Every tag kept at step 2 must yield a value at step 3. If any does not, fail
  with `"a <script> tag with src did not match the extraction pattern"`.
- The final list length must be `>= 15`, failing with
  `"index.html script discovery matched nothing - the regex is stale."`

Then for each path, read the file and call `parseAsClassicScript(source, path)`.
A `SyntaxError` fails the test, and the `filename` identifies which file broke.

**Test 2 — `"the classic-script guard rejects ESM syntax"`**

A self-check proving the guard works, using string literals only — do not write
to disk and do not modify any repo file:

- `assert.throws(() => parseAsClassicScript("export function bar() {}"), SyntaxError)`
- `assert.throws(() => parseAsClassicScript("import x from 'y';"), SyntaxError)`
- `assert.doesNotThrow(() => parseAsClassicScript("window.FOO = 1;"))`

**Test 3 — `"load-globals resolves paths from the repo root, not the cwd"`**

Locks in the root-relative contract. A CWD-relative implementation passes every
other check in this spec because they all run from the repo root, so this test
runs a child process from the OS temp directory. Use a `file://` URL for the
import so module resolution itself does not depend on cwd:

```js
const helper = new URL("../scripts/load-globals.mjs", import.meta.url).href;
const out = execFileSync(process.execPath, [
  "--input-type=module",
  "-e",
  `import { loadGlobals } from ${JSON.stringify(helper)};
   process.stdout.write(String(Boolean(loadGlobals("schedule-data.js").SCHEDULE_DATA)));`
], { cwd: tmpdir(), encoding: "utf8" });
assert.equal(out.trim(), "true");
```

This exact mechanism was verified working before this spec was written. If the
implementation reads CWD-relative paths, the child throws `ENOENT` and
`execFileSync` fails the test.

## Out of scope

- Do **not** bump the release version. No `?v=` value changes anywhere.
- Do **not** modify any existing test file, including `test/helpers/*.mjs`.
  `test/browser-script-syntax.test.mjs` is the only test file created.
- Do **not** modify `app.js`, `planner.js`, `qrcode.js`, `camp-location.js`, or
  any other root-level `.js` file. This spec adds a guard; it does not change the
  code being guarded.
- Do **not** refactor the other test files that use `vm` or the data-URL harness
  to consume the new helper. They have bespoke contexts and are future work.
- Do **not** add `scripts/load-globals.mjs` to `scripts/pages-manifest.mjs`. The
  Pages allowlist must not publish it.
- Do **not** change any assertion text, message, or order in
  `validate-schedule.mjs`, or any part of that file outside its import block and
  `loadSchedule()`.
- Do not add a DOM stub, a bundler, or any dependency. `package.json` gains
  nothing.

## Verification

```
npm test
```

Expected: **148 pass, 0 fail** (145 before this change, plus the 3 new tests),
followed by `Schedule validation passed.` All three new test names appear.

```
npm run validate:schedule
```

Expected: `Schedule validation passed.` — proves the refactored `loadSchedule()`
still works standalone.

```
node -e "import('./scripts/load-globals.mjs').then(m => console.log(Object.keys(m).sort().join(',')))"
```

Expected exactly:
`createScriptContext,loadGlobals,loadScriptInto,parseAsClassicScript`

```
node -e "import('./scripts/load-globals.mjs').then(m => console.log(m.loadGlobals(['schedule-data.js','schedule-metadata.js']).SCHEDULE_VERSION))"
```

Expected: a non-empty version string, proving multi-file shared-context loading
works from a caller other than `validate-schedule.mjs`.

```
git status --short
```

Expected: `M scripts/validate-schedule.mjs`, plus `??` entries for
`scripts/load-globals.mjs` and `test/browser-script-syntax.test.mjs`, plus the
untracked `specs/002-*` files. No other path appears. (`git diff --stat` alone is
insufficient here — it does not list untracked files.)

```
git diff --stat
```

Expected: exactly one file, `scripts/validate-schedule.mjs`.

## Open questions

Round 1 concerns resolved in the log; all six were addressed by revising the
sections above. No open questions remain.
