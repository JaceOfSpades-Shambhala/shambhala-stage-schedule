# 002 — Reusable vm loader + browser-script syntax guard — log

## Round 1 — plan written

Follows spec 001 on the same branch (`claude/loop-test`). 001 is pushed and open
as PR #14 against `main`, deliberately unmerged so both specs merge together as
one deploy.

User direction: build the vm loader as a reusable `scripts/load-globals.mjs`
rather than inline in the test, because that helper is the first concrete piece
the festival-platform extraction needs.

### Research done before writing

- Located `docs/festival-platform-extraction.md` (not previously read). Line 256
  names the exact artifact: "Extract the helper into `scripts/load-globals.mjs`
  so schedule and stages share one copy of it." The user's instruction is
  grounded in a documented plan, and the helper API was designed to serve it.
- Read `scripts/build-pages.mjs` and confirmed `scripts/pages-manifest.mjs` is an
  explicit **allowlist**, so a new `scripts/*.mjs` is excluded from the Pages
  artifact by default. No manifest change needed — and the spec forbids one.
- Extracted the real script list from `index.html`: 17 tags, `camp-location.js`
  through `install.js`, each with `?v=78`.
- Confirmed the repo-root resolution convention at `build-pages.mjs:24`
  (`fileURLToPath(new URL("../", import.meta.url))`).

### Two findings that changed the design

**1. The obvious design does not work.** The natural spec — "execute `app.js` and
`planner.js` in a vm and assert their globals appear" — was tested in a scratch
script outside the repo and **fails**:

```
app.js: THREW ReferenceError: document is not defined
planner.js: THREW ReferenceError: document is not defined
```

Both touch the DOM at load time. Executing them would require a DOM stub that
must grow whenever those files touch a new browser API, generating false
failures unrelated to the bug being caught. Rejected.

**2. Parse-without-execute is the right mechanism.** Verified:

```
new vm.Script("export function bar(){}")      -> SyntaxError: Unexpected token 'export'
new vm.Script('document.getElementById("x")') -> compiles, does not execute
app.js, planner.js, qrcode.js, camp-location.js, schedule-data.js,
  hexlaces.js, sw.js                          -> all parse as classic scripts OK
```

So `new vm.Script(...)` catches the exact bug class, needs no stubs, has nothing
to maintain, and covers **all 17** browser scripts rather than the two that
prompted this.

### The trap found in `validate-schedule.mjs`

Refactoring `loadSchedule()` to the helper looked trivial until I read it
closely. Lines 23–28 read `SCHEDULE_VERSION` *between* the two file loads:

```js
vm.runInNewContext(read("schedule-data.js"), context);
const dataVersion = context.window.SCHEDULE_VERSION;   // intermediate
vm.runInNewContext(read("schedule-metadata.js"), context);
assert.equal(context.window.SCHEDULE_VERSION, dataVersion, "...");
```

The assertion checks the two files declare the *same* version. Collapsing this
into one `loadGlobals(["schedule-data.js","schedule-metadata.js"])` call would
capture `dataVersion` after both loads, making the assertion compare a value to
itself — it would pass unconditionally and **silently stop protecting
anything**, with no test failure to reveal it.

This is precisely the mistake a competent executor makes when handed "refactor
this to use the new helper." It drove the API design: the helper exposes
`createScriptContext` + `loadScriptInto` as separate primitives so a caller can
interleave reads between loads, with `loadGlobals` as sugar for the simple case.
The spec calls the trap out explicitly under a **Critical** heading.

### Design decisions recorded

- **Four exports**, not one: `createScriptContext`, `loadScriptInto`,
  `loadGlobals`, `parseAsClassicScript`. The first two are the primitives the
  `validate-schedule.mjs` sequencing requires; the third is convenience; the
  fourth is the syntax guard.
- **Path resolution changes from CWD-relative to repo-root-relative.** Identical
  behaviour under `npm test` (run from root), correct from anywhere else. Called
  out in the spec as deliberate rather than incidental.
- **File list derived from `index.html`, not hardcoded**, so scripts added later
  are covered automatically — with a `length >= 15` guard so a stale regex fails
  loudly instead of passing vacuously.
- **Negative self-check test** proves the guard actually rejects `export` and
  `import`, using string literals only. Rejected the alternative of temporarily
  writing a bad `export` into `planner.js` to prove the test fires: having the
  executor edit a source file it is otherwise forbidden to touch is a bad
  instruction to give, and a rollback that fails would leave the tree broken.
- **The other 10 vm-using test files are explicitly out of scope.** They have
  bespoke contexts (`hex-owl.test.mjs` stubs `TextEncoder`/`crypto`,
  `service-worker.test.mjs` builds a whole `caches` harness). Migrating them is
  future work, not this spec.

### Expected test count

145 → **147** (two new tests). Recorded in the spec's Verification section so a
miscount is caught during review.

Spec written to `specs/002-vm-smoke-tests.md`. Shown to user before Phase 2.

## Round 1 — Codex plan review: CONCERNS

Verbatim response:

```
CONCERNS

1. The helper section says "Export exactly three functions," then defines four
   and later says "Four exports total." Which instruction is authoritative?

2. The spec restricts changes in `validate-schedule.mjs` to `loadSchedule()`,
   yet adding the helper import and removing `vm` necessarily changes the import
   block outside that function. It also overlooks that `fs` becomes unused.
   Should both `fs` and `vm` imports be removed?

3. The claim that `planner.js` is executed by no test is incorrect.
   `test/helpers/planner-harness.mjs` imports its source through a data-URL ESM
   module. The guard is still needed because that execution accepts ESM syntax,
   but the spec's codebase description should be corrected.

4. The prescribed script-discovery regex only matches double-quoted tags with
   `src` as the first attribute. A future `<script defer src="new.js">` or
   single-quoted tag would be silently omitted while the `>= 15` assertion still
   passes. Is that markup shape intended as a permanent invariant, or should
   discovery verify every script source?

5. `git diff --stat` does not show untracked files, so it cannot produce the
   stated result containing the two new files unless they have already been
   staged. The verification command or expected result is incorrect.

6. Root-relative loading is a stated behavioral change, but every proposed
   automated test and verification command runs from the repository root. A
   mistakenly CWD-relative implementation could pass them all. Should the plan
   include a test or command executed from another working directory?
```

Tokens used: 77,730.

## Round 2 — resolutions

All six accepted. None rejected. Two were errors of mine, and I want that on the
record plainly.

**1. Three-vs-four exports — my drafting error.** Straight contradiction inside
one section. Fixed: the section now reads "Export exactly four functions. This
list is authoritative:" followed by a single numbered list. The contradictory
sentence and the trailing parenthetical are both gone.

**2. Import block + unused `fs` — correct, and I had missed `fs` entirely.**
I verified: `grep -n '^import\|fs\.\|vm\.' scripts/validate-schedule.mjs` shows
`fs.` and `vm.` each appear only at lines 24 and 26. Both bindings become unused.
The spec now names the import block as an explicitly permitted edit site,
instructs removal of **both** imports by line number, and says to leave the
`assert` import alone. "Files to change" and "Out of scope" were reworded to
match — previously they said `loadSchedule()` only, which as Codex pointed out
was impossible to satisfy.

**3. `planner.js` execution — I was wrong, and my original evidence was bad.**
My Phase-1 analysis grepped `test/*.mjs` with the pattern `\.\./[a-z0-9-]+\.js`.
That misses `test/helpers/*.mjs`, which reference `../../planner.js` with a
second `../`. So my "executed by no test" claim was produced by a grep too narrow
to see the counterexample. `test/helpers/planner-harness.mjs:126` does execute
`planner.js`, and `test/helpers/hexlaces-harness.mjs:110` does the same for
`hexlaces.js`, `hexadex.js`, `camp-access.js`, and `hexlace-api.js`.

The conclusion survives, but only because of a fact I then verified rather than
assumed: data-URL imports are **ESM** evaluations, so `export` is legal there.
Confirmed directly —

```
import('data:text/javascript;base64,' + btoa('export function bar(){}'))
  -> resolves successfully
```

So the harness executes `planner.js` and still cannot catch the bug. The Context
section has been rewritten to state this accurately instead of the false "no
test executes it" claim, and now names the harness files and line numbers.

**4. Regex fragility — accepted.** The current markup is uniform (verified: 17
`<script` tags, all 17 matching `<script src="`, no inline scripts), but Codex is
right that the narrow pattern would silently skip a future
`<script defer src=...>` while `>= 15` still passed. Discovery is now specified
as a five-step process: match all script tags, keep those with a `src`, extract
the value allowing either quote style and any attribute order, skip absolute
URLs, strip the query. Plus a new guard: every tag kept at step 2 **must** yield
a value at step 3, else fail with "a <script> tag with src did not match the
extraction pattern." That converts a silent omission into a loud failure.

**5. `git diff --stat` and untracked files — correct, my error.** New files are
untracked at review time, so the stated expectation was unachievable. Verification
now uses `git status --short` for the full picture (with `M` and `??` entries
spelled out) and keeps `git diff --stat` with the corrected expectation of
exactly one file. The reason is noted inline so it does not get "fixed" back.

**6. Root-relative unverifiable from root — the best concern of the six.** Every
check I had written ran from the repo root, where CWD-relative and root-relative
are indistinguishable. The spec asserted a behaviour change that nothing could
detect.

Fixed with a third test that spawns a child process from `os.tmpdir()` and
imports the helper by `file://` URL, so module resolution does not depend on cwd
either. A CWD-relative implementation throws `ENOENT` in the child and fails the
test. I verified the mechanism works before specifying it, using
`scripts/pages-manifest.mjs` as a stand-in since the helper does not exist yet:

```
child-process-from-other-cwd mechanism -> true
```

Chose a permanent test over a one-off verification command because root-relative
resolution is a contract the extraction work will depend on from many call sites.

**Test count updated: 145 -> 148** (was 147 with two tests).

Re-submitting for round 2 review.

## Round 2 — Codex plan review

```
APPROVED
```

Tokens used: 86,785. Converged in 2 rounds, within the 3-round cap.

## Phase 3 — implementation dispatch

The standard Phase 3 instruction says "Do not edit test files." That would
contradict this spec, which requires creating
`test/browser-script-syntax.test.mjs`. The instruction was narrowed to permit
creating exactly that one file while still forbidding modification of any
existing test file.

## Phase 3 — first attempt HUNG (infrastructure, not the spec)

The first `codex exec --sandbox workspace-write` invocation wedged at startup.
Evidence gathered before intervening:

- Process alive 39 minutes (started 10:16:04, checked 10:55:17).
- Its captured output file stayed **0 bytes**, mtime 10:16.
- No repo files written; `git status` showed only the untracked `specs/002-*`.
- Decisive: grepping every rollout in `~/.codex/sessions/2026/08/07/` for the
  string `Implement specs/002-vm-smoke-tests.md` returned **nothing**. The task
  never created a session at all, so it was not "thinking slowly" — it never
  started.

Suspected cause: the `ERROR codex_models_manager::manager: failed to renew cache
TTL: missing field 'base_instructions'` warning that appeared non-fatally in both
plan-review runs.

Recovery: killed the process (`taskkill //PID 30880 //F` — note `ps -W` reports
the MSYS pid in column 1 and the Windows pid in column 4; the first attempt with
the MSYS pid failed with "process not found"). Confirmed the tree took no partial
writes, confirmed `codex --version` still responded, then re-ran the identical
prompt.

The retry created its session within seconds (11:04:37) and finished at 11:07 —
about 2.5 minutes. That contrast confirms the hang was a startup wedge, not
workload. **The spec was not changed between attempts**; no fix round was
consumed.

## Round 1 — Codex implementation report

```
Implemented specs/002-vm-smoke-tests.md within the authorized scope:
- Added scripts/load-globals.mjs
- Added test/browser-script-syntax.test.mjs
- Minimally updated scripts/validate-schedule.mjs
Verification:
- npm test: 148 passed, 0 failed
- Standalone schedule validation passed
- Exact four-function export surface confirmed
- Shared-context loading confirmed
- Syntax and git diff --check passed
- No existing test files or out-of-scope files modified
```

Tokens used: 49,802.

## Round 1 — architect review (independent verification)

Codex's summary was not taken as evidence. Verified directly:

| Check | Result |
|---|---|
| `npm test` (run by architect) | **148 pass, 0 fail** — matches the spec's predicted 145 + 3 |
| All three new test names present in output | ✅ |
| `git status` | `M scripts/validate-schedule.mjs` + 2 new files + specs. Nothing else. |
| Export surface | `createScriptContext,loadGlobals,loadScriptInto,parseAsClassicScript` — exactly four, as specified |
| Multi-file shared context | Returned a real `SCHEDULE_VERSION` string |
| `scripts/pages-manifest.mjs` | untouched — helper is not published to Pages |
| Existing test files | none modified, including `test/helpers/*` |
| Script discovery | 17 paths, `camp-location.js` → `install.js` |

**The trap was avoided.** `validate-schedule.mjs` keeps
`const dataVersion = context.window.SCHEDULE_VERSION;` between the two
`loadScriptInto` calls, so the same-version assertion still compares two distinct
reads rather than a value to itself. Both `fs` and `vm` imports were removed, as
concern 2 required.

**End-to-end proof the guard actually fires.** The spec's Test 2 proves the guard
rejects string literals; that does not prove it would reject a real file. I
verified the stronger claim without modifying any repo file, by reading each
file, appending an `export` in memory, and parsing:

```
planner.js clean: PASSES (correct)
planner.js +export: CAUGHT SyntaxError (correct)
app.js    clean: PASSES (correct)
app.js    +export: CAUGHT SyntaxError (correct)
```

That is the exact bug 002 exists to catch, now demonstrably caught.

**Findings: none. No fix spec required.** Proceeding to commit.
