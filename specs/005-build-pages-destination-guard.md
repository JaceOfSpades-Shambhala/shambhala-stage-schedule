# 005 — Refuse to delete anything outside a safe build destination

## Goal

`node scripts/build-pages.mjs <arg>` exits non-zero without deleting anything
when `<arg>` resolves to the repository root, an ancestor of it, a path outside
it, or a source directory.

## Context

Audit finding C1. `scripts/build-pages.mjs:24` builds the output path directly
from an unvalidated argument, and line 59 recursively removes it:

```js
const outDir = join(root, process.argv[2] || "dist");
...
await rm(outDir, { recursive: true, force: true });
```

`join(root, "..")` resolves to the parent of the repository. `join(root, ".")`
resolves to the repository root. Both are then deleted recursively with
`force: true`. This was verified by path resolution only; the deletion was not
executed.

`.claude/settings.json:19` currently auto-allows `Bash(node scripts/:*)`, so this
is reachable with no human approval. That permission is narrowed by spec 006;
this spec fixes the script itself so it is safe regardless of permissions.

## Files to change

- `scripts/build-pages.mjs` — add and use a validated path resolver
- `test/build-pages-guard.test.mjs` — new test file covering the guard

## Changes

### `scripts/build-pages.mjs`

Add an exported function, placed immediately after the existing `root` constant
so it is above first use:

```js
export function resolveOutputDir(root, arg) {
```

Behaviour, in this order:

1. If `arg` is `undefined`, treat it as `"dist"`. If `arg` is an empty or
   whitespace-only string, throw `new Error("Refusing to build: empty output directory argument.")`.
2. Resolve with `path.resolve(root, arg)`.
3. Compute `path.relative(root, resolved)`. If it is `""`, throw
   `new Error("Refusing to build: output directory is the repository root.")`.
4. If that relative path starts with `".."` or `path.isAbsolute()` returns true
   for it, throw
   `new Error("Refusing to build: output directory is outside the repository.")`.
5. Take the first path segment of the relative path. If it appears in the
   reserved list below, throw
   `new Error("Refusing to build: output directory is a source directory.")`.
6. Otherwise return the resolved absolute path.

The reserved list is every entry of `PAGES_DIRS` imported from
`./pages-manifest.mjs`, plus exactly these names:

```
.git  .github  .claude  node_modules  scripts  test  worker  docs  shared  specs
```

Replace line 24 with a call to this function, wrapped so a rejection is fatal
before any filesystem mutation:

```js
let outDir;
try {
  outDir = resolveOutputDir(root, process.argv[2]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

Import `resolve`, `relative` and `isAbsolute` from `node:path` alongside the
existing `join` import if they are not already imported. Do not remove `join` if
it is still used elsewhere in the file.

Change nothing else. The existing manifest checks, the `rm`/`mkdir` calls, and
the copy loops all stay exactly as they are.

### `test/build-pages-guard.test.mjs` — new file

Use `node:test` and `node:assert/strict`, matching the style of the existing
files in `test/`. Import `resolveOutputDir` from `../scripts/build-pages.mjs`.

The test must never call `rm` or create directories. It only exercises the pure
resolver.

Assert that each of these **throws**, using the repository root as `root`:

- `".."`
- `"."`
- `""`
- `"   "`
- `"../outside"`
- `"scripts"`
- `"test"`
- `"worker"`
- `".git"`
- the first entry of `PAGES_DIRS`

Assert that each of these **returns a path inside the repository root**:

- `undefined` (the default, which must resolve to `dist`)
- `"dist"`
- `"build/out"`

For the accepted cases, assert that `path.relative(root, result)` neither starts
with `".."` nor is absolute.

## Out of scope

- Do not change `scripts/pages-manifest.mjs`, the allowlist, or the prohibited
  pattern list. Audit item 10 covers those separately.
- Do not change any other script, application file, or Worker file.
- Do not change `.claude/settings.json` or `.claude/settings.local.json`. Spec
  006 covers those.
- Do not bump the release version or touch any `?v=` reference.
- Do not modify any existing test file. Only the new one is added.

## Verification

Run each command and check its exit status explicitly. A command that fails to
run must not be read as a pass.

```
npm test
```

Expected: all previously passing tests still pass, **plus** the new guard tests.
The suite was 148 tests before this change; it must now be higher and report
`fail 0`.

The next four commands prove the guard rejects dangerous input. Each must print
its refusal message and exit non-zero. Run them exactly as written, from the
repository root:

```
node scripts/build-pages.mjs .. ; echo "exit=$?"
node scripts/build-pages.mjs . ; echo "exit=$?"
node scripts/build-pages.mjs scripts ; echo "exit=$?"
node scripts/build-pages.mjs "" ; echo "exit=$?"
```

Expected for all four: a message beginning `Refusing to build:` and `exit=1`.
Any `exit=0` is a failure. If the repository root still contains its files after
these runs, the guard held; if anything was deleted, the change is wrong.

Then confirm the normal path still works:

```
node scripts/build-pages.mjs dist ; echo "exit=$?"
```

Expected: `exit=0`, and `dist/` is created.

Finally confirm no other tracked file changed:

```
git status --porcelain
```

Expected: `scripts/build-pages.mjs` modified, `test/build-pages-guard.test.mjs`
added, `dist/` untracked or ignored, and nothing else beyond untracked files
under `specs/`.

## Open questions
