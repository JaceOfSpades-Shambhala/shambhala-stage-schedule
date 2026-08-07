# 001 — README: document the two module systems

## Goal

`README.md` contains a short "Module systems" section stating that browser
scripts communicate through `window` globals while Node and Worker code uses
ESM, so a developer reading only the README does not add an `export` to a
browser file and break the site.

## Context

This repository runs two module systems side by side. `index.html` loads 17
scripts with plain `<script src="...">` tags and contains no `type="module"`
(verified: `grep -c '<script src=' index.html` → 17, `grep -c 'type="module"'
index.html` → 0). `worker/src/*.js`, `scripts/*.mjs`, and `test/*.mjs` are ESM.

`AGENTS.md` already documents this for AI agents, but `README.md` — the human
developer entry point — does not. `README.md` is deliberately **not** published
to GitHub Pages (see the `mustNotPublish` list in
`test/pages-artifact.test.mjs:74`), so it is internal developer documentation and
is the right home for this.

This is a **documentation-only** change. No `.js`, `.css`, `.html`, or test file
is touched.

## Files to change

Exhaustive. Anything not listed here must not be touched.

- `README.md` — insert one new `## Module systems` section. No other part of the
  file changes.

## Changes

Insert the section **between the end of the `## Files` list and the
`## Updating camp coordinates from a phone` heading**.

Precisely: after the final bullet of the `## Files` list, which is the line

```
- `HANDOFF.md` — full developer handoff: setup, deploy pipelines, release discipline, API reference, gotchas, roadmap
```

and before the line

```
## Updating camp coordinates from a phone
```

Keep one blank line before and after the new section, matching the spacing used
between existing sections in the file.

Insert exactly this content:

````markdown
## Module systems

Two module systems coexist in this repository. Know which one a file is in
before editing it.

**Browser code uses globals.** `index.html` loads its scripts with plain
`<script src="...">` tags; there is no `type="module"` anywhere in it. Root-level
files such as `app.js`, `planner.js`, `schedule-data.js`, and `hexlaces.js`
communicate by assigning to and reading from `window`:

```js
// schedule-data.js
window.SCHEDULE_DATA = { ... };
// app.js, later
const data = window.SCHEDULE_DATA || {};
```

Adding an `export` statement to one of these root-level files is a syntax error
and will break the site.

**Node and Worker code uses ESM.** `worker/src/*.js`, `scripts/*.mjs`, and
`test/*.mjs` use `import`/`export`, and `package.json` sets `"type": "module"`.

To read a browser global from Node, use the `vm` pattern established in
`scripts/validate-schedule.mjs` rather than introducing a bundler:

```js
const context = { window: {} };
vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
```
````

Note: the ````` ```` ````` fence above delimits the content to insert. Insert the
markdown **inside** it, including the two inner ```` ```js ```` blocks. Do not
insert the outer four-backtick fence itself.

## Out of scope

- Do **not** bump the release version. `README.md` line 19 contains
  "authoritative deployed version ... v78" and is asserted by
  `test/release-integrity.test.mjs:19`. Leave that sentence byte-for-byte
  unchanged.
- Do **not** modify, reword, or reflow any other section of `README.md`,
  including `## Files`, `## Data model`, and
  `## Testing Now Playing before the festival`. The preview section is asserted
  verbatim by `test/release-integrity.test.mjs:233`.
- Do **not** add the live playground URL
  (`https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/hex-owl-playground.html`)
  anywhere. `test/hex-owl-playground.test.mjs:14` asserts it is absent.
- Do **not** edit any test file, any `.js` file, `AGENTS.md`, `HANDOFF.md`, or
  any other document.
- Do not add a table-of-contents entry or cross-link from other sections.

## Verification

```
npm test
```

Expected: 145 tests pass, 0 fail, followed by `Schedule validation passed.` —
identical to the pre-change baseline.

Behavioural checks, each of which would fail if the change were implemented
wrongly but plausibly:

```
git diff --stat
```

Expected: `README.md` is the only changed file, with insertions only and
`0 deletions`.

```
grep -n "## Module systems" README.md
```

Expected: exactly one match, positioned after the `## Files` section and before
`## Updating camp coordinates from a phone` (confirm with
`grep -n '^## ' README.md`).

```
grep -c 'authoritative deployed version' README.md
```

Expected: `1` — the v78 sentence survived untouched.

## Open questions

<!-- Codex fills this during plan review. -->
