# AGENTS.md

Instructions for any AI agent working in this repository. Read this fully before
acting.

## Project

A vanilla-JavaScript progressive web app showing festival stage set times, with a
Cloudflare Worker backend for set-list sharing and the Hexlace/Hex Owl
collectible system. Deployed to GitHub Pages; the Worker deploys to Cloudflare.

**No framework. No bundler. No dependencies.** `package.json` contains scripts
only. Do not introduce a build tool, a package dependency, or a framework unless
a spec explicitly instructs it.

## Commands

```
npm test                   # node --test && node scripts/validate-schedule.mjs
npm run validate:schedule  # schedule data validation only
node --check <file>        # syntax check a single file
node scripts/build-pages.mjs dist   # stage the Pages artifact locally
```

Run `npm test` before reporting any work complete. No exceptions.

## Two module systems — know which you are in

**Browser code uses globals.** `index.html` loads ~17 scripts with plain
`<script src="...">` tags. There is no `type="module"` anywhere in `index.html`.
Files communicate by assigning to and reading from `window`:

```js
// schedule-data.js
window.SCHEDULE_DATA = { ... };
// app.js, later
const data = window.SCHEDULE_DATA || {};
```

Adding an `export` statement to any root-level `.js` file loaded by a script tag
is a **syntax error** and will break the site.

**Node and Worker code uses ESM.** `worker/src/*.js`, `scripts/*.mjs` and
`test/*.mjs` use `import`/`export`. `package.json` has `"type": "module"`.

**To read browser globals from Node**, use the `vm` pattern already established
in `scripts/validate-schedule.mjs`:

```js
const context = { window: {} };
vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
```

Do not introduce a bundler to bridge these two worlds. The `vm` pattern is the
house convention.

## Rules

### Never edit tests to make them pass

`test/release-integrity.test.mjs` asserts on exact code shapes — specific regex
patterns against `planner.js`, `styles.css`, `app.js` and others. A refactor will
break these assertions.

**When a test fails, fix the code, not the test.** If you believe a test
assertion is genuinely wrong or obsolete, stop and report it. Do not change it on
your own judgement. These assertions encode deliberate decisions and several
guard against regressions that previously shipped.

### Release version bumps touch multiple files at once

The current release is **v79**. Every asset reference uses `?v=79`, and
`test/release-integrity.test.mjs` hardcodes `79` in its assertions.

A version bump must change **all** of these together:

- `index.html` — the `<!-- v79 -->` marker and every `?v=` query
- `sw.js` — the `stage-schedule-v79` cache name and every `?v=` query
- `styles.css` — font `?v=` queries
- `manifest.webmanifest`, `app.js`, `hex-owl.js`, `hex-owl-playground.html`
- `README.md` — "authoritative deployed version ... v79"
- `HANDOFF.md` — current release references plus a new history entry
- `AGENTS.md`, `docs/AGENT-LOOP-SETUP.md`, `docs/festival-platform-extraction.md`
- `test/release-integrity.test.mjs` — the assertions themselves
- `test/service-worker.test.mjs` — exact precache and refresh asset queries

Miss one and `npm test` fails. Only bump the version when a spec tells you to.

### Stay inside the spec

Implement exactly what the spec in `specs/` describes. Do not refactor adjacent
code, rename things, reformat, or "improve" what you touch. A diff containing
changes the spec did not ask for will be rejected and reverted.

### Never assume — ask

If a spec is ambiguous, incomplete, contradicts the codebase, or would require a
judgement call you were not given, **stop and report the question**. Do not pick
an interpretation and proceed. A returned question costs one round trip; a wrong
guess costs several and may ship a bug.

This applies to plan review as well as implementation. When asked to review a
spec, be genuinely critical — surface every ambiguity you find, including ones
you could plausibly guess your way past.

### Scope of writes

Do not modify: `LICENSE`, per-file copyright headers, `.github/workflows/`,
`wrangler.jsonc`, or anything under `.audit/` unless a spec names the file
explicitly.

Never run `git push`, `wrangler deploy`, or any deploy command. Deployment is
handled by CI on merge to `main`.

## Code style

- 2-space indent, double-quoted strings, semicolons — match surrounding code
- Every source file carries a copyright header; preserve it
- Stage IDs are kebab-case: `amp`, `fractal-forest`, `grove`, `living-room`,
  `pagoda`, `secret-garden`, `village`
- Times are `h:mm AM/PM` (see `TIME_PATTERN` in `scripts/validate-schedule.mjs`)
