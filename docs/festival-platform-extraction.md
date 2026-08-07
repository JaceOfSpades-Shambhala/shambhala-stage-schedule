# Festival Platform — Extraction Guide

Turning the Shambhala app into a festival-agnostic base platform, as a new
private repo with a clean history.

---

## The shape of this

**Part A** creates the new repo. Mechanical, ~20 minutes, do it in one sitting.

**Part B** is the generalization — finding every Shambhala-specific touchpoint and
replacing it with a config layer. This is the actual work, and it's exactly the
kind of large mechanical refactor the Opus→Codex loop is built for.

Your original repo is never touched. It stays frozen on GitHub as the reference
implementation, and you can clone it again any time.

Part B has been written against the actual contents of `shambhala-stage-schedule`
— 86 tracked files, 173 commits, vanilla-JS PWA with a Cloudflare Worker backend.
The file paths and line counts below are real, not illustrative.

---

# Part A — Create the clean-slate repo

## A1. Create the empty private repo on GitHub

1. Go to **https://github.com/new**
2. **Repository name**: `festival-platform` (or whatever you prefer)
3. **Visibility**: **Private**
4. **Do not** tick "Add a README", "Add .gitignore", or "Choose a license" —
   you want it completely empty, otherwise your first push conflicts
5. Click **Create repository**
6. Leave the page open. You'll want the URL in step A5.

## A2. Clone into a new folder

```powershell
cd C:\Users\Jace\dev
git clone https://github.com/JaceOfSpades-Shambhala/shambhala-stage-schedule.git festival-platform
cd festival-platform
```

The last argument renames the folder on the way in, so you don't end up with a
directory called `shambhala-stage-schedule` that becomes your generic platform.

**Why clone rather than copy the folder?** A clone gives you exactly the files
Git tracks — `node_modules`, build output and anything else in `.gitignore` never
come along.

## A3. Sever the history

```powershell
Remove-Item -Recurse -Force .git
```

That single command turns the clone into an ordinary folder of files. No history,
no remote, no connection to the original.

**This is the point of no return for history** — and it's fine, because the
original is safe on GitHub. Cold feet? Delete the folder and redo A2.

Confirm:

```powershell
git status
```

You want *"fatal: not a git repository"*. Branch information means `.git` is still
there.

## A4. Strip the Shambhala content — before the first commit

**Order matters.** Anything present at commit 1 is in history permanently.
Anything deleted before commit 1 was never there.

Delete the festival-specific binaries and content now; do the code refactoring
later with Git as a safety net. Text references to "Shambhala" in history are a
minor cosmetic issue; the artwork and licensed content are the things worth
keeping out.

### The actual asset inventory

Small and manageable — 16 binary files total:

| Path | What it is | Action |
|---|---|---|
| `stage-names/*.png` (7) | Stage name artwork — amp, fractal-forest, grove, living-room, pagoda, secret-garden, village | Delete, keep the directory |
| `wordmark.svg` | Festival wordmark | Delete |
| `hex-owl-base.svg` | Collectible base artwork | Delete |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon*.png/.ico` | PWA and browser icons | Delete |
| `fonts/*.woff2` (2) + `fonts/OFL.txt` | **Check before deleting** | See below |
| `shared/3fae95f...` | Encrypted Hexlace documents | Delete |
| `.audit/` | Internal audit records | Delete |

**On the fonts:** `fonts/OFL.txt` means these ship under the SIL Open Font
License, which permits redistribution. If they're generic open fonts, keep them
(and keep `OFL.txt` — the licence requires the notice travel with the files). If
they were chosen as Shambhala brand fonts, they're a theming decision and belong
in the config layer regardless. Open `OFL.txt` and check which fonts they are
before deciding.

**On the licence:** `LICENSE` is a strict proprietary licence, © 2026 Jace
Jacques, and every source file carries a matching header. You own it, so
relicensing your own template is your call — but decide deliberately. "NO LICENSE
IS GRANTED" is aimed at the public GitHub Pages deployment; a private base
platform you reuse may want different wording, and the per-file headers reference
festival-specific context worth revisiting.

### Get the inventory refreshed

In the Claude Code tab, pointed at the new folder:

> Inventory this repo for Shambhala-specific content. I'm turning it into a
> festival-agnostic template. Categorise: (1) media assets and where referenced,
> (2) hardcoded festival identity — name, year, dates, URLs, (3) content data —
> stages, schedule, camp locations, (4) branding — colour values and fonts,
> where defined vs. hardcoded, (5) the hex owl / hexlace collectible subsystem
> and how much of it is mechanic vs. Shambhala identity, (6) Cloudflare Worker
> and deploy config. File paths and line numbers. Change nothing yet.

## A5. Initialize and push

Add a `.gitattributes` at the root **before** committing:

```
* text=auto
*.png binary
*.ico binary
*.woff2 binary
*.enc binary
*.svg text
```

Your files are currently CRLF on disk while Git's index holds LF. On Windows
that's invisible, but any tool reading the repo from Linux — CI, containers,
sandboxed agents — sees every file as modified. One line now prevents a class of
cross-platform churn that gets genuinely annoying later.

```powershell
git init
git add .
git commit -m "Initial commit: festival platform base, Shambhala content removed"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/festival-platform.git
git push -u origin main
```

| Command | What it does |
|---|---|
| `git init` | Creates a brand-new empty repo in this folder |
| `git add .` | Stages every file (respecting `.gitignore`) |
| `git commit` | Commit 1 — this is now your entire history |
| `git branch -M main` | Renames the default branch to `main` |
| `git remote add origin` | Points this repo at your new GitHub repo |
| `git push -u origin main` | Uploads it; `-u` sets the default for future pushes |

## A6. Verify before moving on

```powershell
git log --oneline
```

Exactly one commit. More than one means `.git` wasn't removed — go back to A3.

Then reload the GitHub page: files present, one commit, marked Private.

## A7. Add the agent scaffolding

Now do **Part 3** of the setup guide in this folder — `AGENTS.md`,
`.claude/agents/architect.md`, `.claude/settings.json`, `specs/`. Commit and push.

For `AGENTS.md`, the real build commands are:

```
- Test:              npm test          (node --test && node scripts/validate-schedule.mjs)
- Validate schedule: npm run validate:schedule
- Deploy worker:     wrangler deploy   (from repo root)
```

There's no build step and no dependencies — `package.json` contains only scripts.
Say so explicitly in `AGENTS.md`; an executor that assumes a bundler will invent
one.

---

# Part B — The generalization plan

## What the codebase actually looks like

Worth internalising before planning anything:

| Fact | Consequence |
|---|---|
| Vanilla JS, no framework, no build step. Scripts loaded via `<script src>` in `index.html`, state on `window.*` globals | Config layer must be a `window.*` global too. Don't let an agent introduce a bundler or framework config idiom. |
| Frontend is globals; `worker/` and `scripts/` are ESM `.mjs` | Any shared constant needs to work in **both** module systems. This is the central design problem of Part B. |
| `hex-owl.js` 2,654 lines · `hexlaces.js` 1,565 · `hexadex.js` 553 | The collectible subsystem is ~4,800 lines. `app.js` is 766. **The collectible system is the app.** |
| `schedule-data.js` is one line assigning `window.SCHEDULE_DATA` | Schedule is already data-driven. This step is 80% done. |
| Stage list duplicated in 8 places | Highest-value early target. Details below. |
| 75 hex colours in `styles.css`, 296 in JS | Theme extraction is big. Must be split across specs. |
| `?v=78` cache-bust on every script and asset, mirrored in `sw.js` | Every spec touching assets must keep this in sync or the PWA serves stale files. |
| Real test suite: `node --test` + `validate-schedule.mjs` | Your Verification sections can be genuine commands, not eyeballing. |

## The stage-list problem — start here

The seven stage IDs are hardcoded in **eight** separate places:

```
app.js:13                        { id: "secret-garden", label: "Secret Garden" }
planner.js:13                    (same array)
hexlaces.js:30                   (same array)
hex-owl.js:97                    { id, name, source: "app-stage", sourceHex: "#90cd8d" }
scripts/validate-schedule.mjs:17 (bare ID list)
worker/src/index.js:59           VALID_STAGE_IDS = new Set([...])
sw.js:47                         "./stage-names/secret-garden.png?v=78"
schedule-metadata.js             per-stage end times
```

Three different shapes across two module systems and a service worker cache
manifest. This is the single highest-leverage thing in the whole extraction: fix
it and adding a stage becomes a one-file edit; leave it and every later spec has
to touch eight files.

Note `hex-owl.js:97` carries `sourceHex` — a per-stage brand colour. Stage
identity and theming are already entangled, so spec 001 and the theme work will
overlap. Plan for that rather than being surprised by it.

**The design problem:** the frontend shares code via browser globals
(`window.*`, loaded by plain `<script src>` tags — confirmed, zero `type="module"`
in `index.html`), while `worker/`, `scripts/` and `test/` use ESM
(`import`/`export`). A file containing `export` is a syntax error in a plain
script tag; a file setting `window.X` throws in Node. With no bundler, one file
cannot naively serve both.

**The answer is already in your repo.** `scripts/validate-schedule.mjs:22`:

```js
function loadSchedule() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync("schedule-data.js", "utf8"), context);
  return context.window;
}
```

Node's built-in `vm` module fabricates an empty `window`, runs the browser file
inside it, and reads the values back. Browser file unchanged, consumed from Node,
no bundler, no duplication, no new dependency.

**Adopt that pattern.** One canonical `config/stages.js` written browser-style
(`window.STAGES = [...]`):

- **Browser** — script tag before `app.js`; `app.js`, `planner.js`,
  `hexlaces.js`, `hex-owl.js` all read `window.STAGES`.
- **Node scripts and tests** — load via `vm`. Extract the helper into
  `scripts/load-globals.mjs` so schedule and stages share one copy of it.

That's six of the eight sites, genuinely single-source.

**The two it can't reach.** Cloudflare Workers run in a V8 isolate without
`node:vm`, so `worker/src/index.js:59` can't read the canonical file at runtime.
Same for `sw.js`. For those two only, keep a copy and add
`test/stages-consistency.test.mjs` that loads the canonical file via `vm` and
asserts the Worker's `VALID_STAGE_IDS` and the sw cache list match. Drift then
fails `npm test` before it can ship.

**Final shape:** one canonical file + two test-enforced mirrors. Eight
hand-maintained copies become one source and two verified reflections.

*Rejected alternatives:* a JSON-plus-generator adds a build step you must
remember; duplicating all eight with tests is excessive when `vm` covers six; a
dual-mode `export`-plus-`window` file is a hard syntax error given no
`type="module"`; runtime `fetch()` of JSON makes startup async and complicates
service-worker offline caching for no gain.

## The target

A new festival launches by editing config, dropping in assets, and filling in
data. **Zero code changes.** If setting up festival #2 means touching `app.js`,
generalization isn't done.

And: **the shell must run and look finished with placeholder content.** Build a
complete fake festival — "Example Fest", three stages, a placeholder schedule,
one generic collectible. You'll be launching this constantly to check your work,
and a template that doesn't boot is a template you can't test.

## The spec sequence

**000 — Discovery.** Claude's job, not Codex's. Output: `specs/000-inventory.md`
with every touchpoint and file path. You've done a first pass in A4; redo it
properly with the agent scaffolding in place.

**001 — Stage single-source-of-truth.** Implement the decision above. All eight
sites read from one place.
*Verify:* add a fictional eighth stage to the source; it appears in app, planner,
hexlaces, worker validation, and the sw cache list. `npm test` passes.

**002 — Festival identity config.** `config/festival.js` — name, short name,
year, dates, timezone, official URL, `manifest.webmanifest` fields, worker name.
*Verify:* grep for "Shambhala" returns hits only in config and content data.

**003 — CSS theme tokens.** The 75 colours in `styles.css` become custom
properties in `:root`.
*Verify:* no raw hex literals in `styles.css`; app renders unchanged.

**004 — JS theme tokens.** The 296 JS hex literals. Separate spec from 003 —
they're different problems and a combined diff would be unreviewable.
*Verify:* JS reads from CSS custom properties or the theme config; no hex
literals outside it.

**005 — Schedule data contract.** Formalise the `SCHEDULE_DATA` schema, document
it, keep `validate-schedule.mjs` working against a placeholder schedule.
*Verify:* `npm run validate:schedule` passes on the Example Fest data.

**006–008 — The collectible subsystem.** ~4,800 lines across `hex-owl.js`,
`hexlaces.js`, `hexadex.js`, `hexlace-*.js`. This is the dominant piece of work
and needs its own sub-sequence:

- **006** — Separate mechanic from identity. What's a generic
  collect/scan/trade/compare system vs. what's specifically an owl?
- **007** — Artwork and naming to config. `hex-owl-base.svg` becomes a swappable
  asset slot; "owl"/"hexlace" naming becomes configurable vocabulary.
- **008** — Durable Object class renames. See the warning below.

**009 — Worker and deploy config.** `wrangler.jsonc` carries a live KV namespace
ID (`61bdc52c...`), the worker name `shambhala-setlists`, and five DO bindings.
Template these with documented placeholders plus a setup script.
*Verify:* a fresh deploy to a throwaway Cloudflare account works from the
documented steps alone.

**010 — Placeholder assets + Example Fest.** Every deleted asset replaced at
identical dimensions. `assets/README.md` documenting required files and sizes.
Keep the `?v=` convention and `sw.js` manifest in sync.
*Verify:* fresh clone → `npm test` → serve → app boots and looks intentional.

**011 — Licence and launch docs.** Relicence decision, per-file headers,
`SETUP.md` walking through a new festival end to end.
*Verify:* follow `SETUP.md` yourself for a fictional festival. Anything you have
to work out that isn't written down is a gap.

## Two things that will bite

**Durable Object renames are not free.** `wrangler.jsonc` declares
`HexOwlProfile`, `OwlNumberAllocator`, `HexlaceCoordinator`, `CampAccessRegistry`
across three tagged migrations (`v1`, `v2`, `v3`). Migrations are append-only,
and renaming a DO class in a *live* deployment requires a rename migration and
risks orphaning stored data. For a fresh template deployed to a new account this
is harmless — but do it as a deliberate spec (008) with the migration list
rewritten cleanly from `v1`, not as an incidental find-and-replace. An agent will
happily rename the class and leave the migrations inconsistent.

**Theme extraction is where judgement lives.** 371 colour literals, and the line
between "Shambhala brand colour" and "just how the UI looks" is a call only you
can make. `hex-owl.js`'s per-stage `sourceHex` values are the clearest example —
brand identity or functional stage-coding? Expect to make these decisions
yourself. An agent will guess confidently in whichever direction produces a
smaller diff.

## Why this codebase suits the loop

Repetitive, mechanical, spans many files with a consistent pattern, and — the
part that matters most — **has a real test suite**. `npm test` runs `node --test`
plus schedule validation, which means your specs can carry genuine verification
commands rather than "check it looks right."

That's the difference between a delegation loop that catches its own mistakes and
one that quietly accumulates them.
