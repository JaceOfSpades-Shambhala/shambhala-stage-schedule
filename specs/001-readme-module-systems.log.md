# 001 — README: document the two module systems — log

## Round 1 — plan written

Branch cut at user request before planning: `claude/loop-test`, from `main` at
`71f39c4`. Note this session runs in the **main checkout**
(`C:/Users/Jace/dev/shambhala-stage-schedule`), not under `.claude/worktrees/`.

Task as given: add a short "Module systems" section to `README.md` explaining
that browser scripts use `window` globals while Node/Worker code uses ESM,
matching `AGENTS.md`. Documentation only, no code changes.

### Reading done before writing the spec

- `AGENTS.md` in full.
- `README.md` in full (173 lines).
- `specs/TEMPLATE.md`, `specs/README.md`.
- Grepped `test/` for `README` — found three test files asserting on it.
- Read `test/pages-artifact.test.mjs:55-89` and the `readme` assertions in
  `test/release-integrity.test.mjs`.

### Constraints discovered

`README.md` is asserted on by three test files. Any edit must preserve:

1. `test/release-integrity.test.mjs:19` —
   `/authoritative deployed version[^\n]*\bv78\b/i` (README.md line 19).
2. `test/release-integrity.test.mjs:233` —
   ``/PEEKABOO` now playing, `TRUTH` up next/``.
3. `test/hex-owl-playground.test.mjs:14` — the live playground URL must **not**
   appear; `:15-16` require `hex-owl-playground.html` and `/not deployed/i` to
   remain present.

Also noted: `test/pages-artifact.test.mjs:74` lists `README.md` under
`mustNotPublish`, so the README is internal developer documentation and never
ships to Pages. That supports putting developer-facing module-system guidance
there.

These constraints are encoded in the spec's Out of scope section rather than
left to the executor to rediscover.

### Facts verified against the codebase

- `grep -c '<script src=' index.html` → `17`
- `grep -c 'type="module"' index.html` → `0`

Both confirm AGENTS.md's description, so the README wording can state them
without hedging. I deliberately avoided writing the count "17" into the README
text itself, since that number will drift as scripts are added; the spec's
Context records it as evidence instead.

### Baseline

`npm test` run before any change: **145 pass, 0 fail**, then
`Schedule validation passed.` This is the number the Verification section
expects afterwards.

### Judgement calls made

- **Placement**: after the `## Files` inventory, before
  `## Updating camp coordinates from a phone`. Rationale: the reader has just
  seen the file list, so explaining how those files interoperate follows
  naturally. Flagged to the user for confirmation.
- **Content**: mirrors `AGENTS.md` §"Two module systems — know which you are in",
  condensed, including the `vm` pattern and the explicit warning that adding
  `export` to a root-level file is a syntax error.

Spec written to `specs/001-readme-module-systems.md`. Shown to user before
Phase 2 review.

## Round 1 — Codex plan review

Command:

```
codex exec --sandbox read-only "Read specs/001-readme-module-systems.md and the
code it references. Do NOT implement anything and do NOT edit any file. Review
the plan critically. Reply with exactly 'APPROVED' on the first line ..."
```

Verbatim response:

```
APPROVED
```

Tokens used: 38,123. Codex additionally ran `npm test` during review: 145 pass,
0 fail, `Schedule validation passed.` — matching the architect's baseline.

No concerns raised, so no spec revisions. Proceeding to Phase 3.

### Scope decision recorded before implementation

While answering a user question about the `vm` bridge pattern, I investigated how
widely it is used and found a genuine coverage gap:

- `runInNewContext` is used in 11 files (10 of 21 `test/*.mjs`, plus
  `scripts/validate-schedule.mjs`).
- Root-level `.js` files with **no** vm execution anywhere: `app.js`,
  `planner.js`, `qrcode.js` (vendored), `camp-location.js` (config literal).
- Verified empirically in a scratch dir outside the repo: with
  `"type": "module"` in `package.json`, `node --check` **passes** on a file
  containing `export`. So the AGENTS.md syntax check does not catch the exact
  mistake this README section warns about.
- `test/release-integrity.test.mjs` only `read()`s `app.js` / `planner.js` as
  strings for regex assertions; it never executes them, so an added `export`
  would not trip it.

Consequence: adding an `export` to `app.js` or `planner.js` passes
`node --check`, passes `npm test`, and breaks the live site.

This gap was **deliberately not folded into spec 001**, which is
documentation-only. Expanding an approved spec mid-flight is out of process. User
chose to close the gap in a separate spec afterwards; `002-vm-smoke-tests.md`
will be drafted once 001 is committed and the tree is clean.

## Round 1 — Codex implementation report

```
Implemented the spec exactly in README.md.
- Diff: 31 insertions, 0 deletions
- No test or source files modified
- User-provided untracked spec/log preserved
- npm test: 145 passed, 0 failed
- Schedule validation passed
- git diff --check: passed
```

Tokens used: 28,174.

## Round 1 — architect review (independent verification)

Codex's summary was not taken as evidence. Verified directly:

| Check | Result |
|---|---|
| `git diff` read line by line | Matches spec verbatim. Inserted text is byte-identical to the spec's content block. |
| Outer four-backtick fence NOT inserted | Correct — only the inner ```js blocks appear. |
| `git diff --stat` | `README.md \| 31 +++++`, 1 file changed, 31 insertions(+), **0 deletions** |
| `git status` | Only `README.md` modified. No unexpected new/deleted files. |
| Files outside spec's declared list | None touched. |
| `npm test` (run by architect) | 145 pass, 0 fail, `Schedule validation passed.` — identical to baseline |

Spec Verification section, each command run:

- `grep -c "^## Module systems$" README.md` → `1` ✅
- `grep -n '^## ' README.md` → `## Module systems` at line 100, between `## Files`
  (79) and `## Updating camp coordinates from a phone` (131) ✅ placement correct
- `grep -c 'authoritative deployed version' README.md` → `1` ✅ v78 sentence intact
- live playground URL → absent ✅

Note: `git diff` emitted a benign `LF will be replaced by CRLF` warning, which is
this repo's existing autocrlf behaviour on Windows and not caused by this change.
Confirmed harmless by the 0-deletion diff — no wholesale line-ending rewrite
occurred.

**Findings: none. No fix spec required.** Proceeding to Phase 5 commit.
