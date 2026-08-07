# 003 — Phase 4 stops and asks before any fix round

## Goal

After presenting review findings, the architect stops and asks the user which
issues to fix, instead of deciding on its own and starting a fix round.

## Context

The `codex@openai-codex` plugin's `codex-result-handling` skill states: "After
presenting review findings, STOP. Do not make any code changes... You MUST
explicitly ask the user which issues, if any, they want fixed before touching a
single file. Auto-applying fixes from a review is strictly forbidden, even if the
fix is obvious."

The architect's Phase 4 currently contradicts this: it writes a fix spec and
returns to Phase 3 without asking. The user chose to adopt the plugin's gate.

This spec was split out of an earlier, larger spec 003 that also rewrote Codex
dispatch. That dispatch rewrite is now spec 004. This spec contains only the
review gate.

The gate introduces states the old flow could not reach — a finding the user
declines, a partial selection, a red suite with nothing selected. The replacement
text below is written as a complete decision table so that every combination has
exactly one defined outcome.

## Files to change

- `.claude/agents/architect.md` — the Phase 4 fix-loop paragraphs, and the
  one-line precondition at the top of Phase 5
- `specs/README.md` — the Phase 4 line of the loop table only

## Changes

### `.claude/agents/architect.md` — Phase 4

In `## Phase 4 — Review`, replace these two paragraphs (currently lines
199–205):

```
If there are bugs, deviations, or missing pieces: write `specs/NNN-slug-fixN.md`
describing precisely what is wrong and what correct looks like, then return to
Phase 3. **Do not fix the code yourself.** If you are hand-patching Codex's
output, the spec was underspecified — fix the spec instead, because that is what
compounds.

**Cap: 3 fix rounds.** Then stop and surface it to the user.
```

with exactly:

```
Then handle the findings as below. Do not begin a fix round on your own
judgement, even when a fix looks obvious.

**If `npm test` is failing, Phase 5 is unreachable.** Present the findings and
require a fix selection that covers the failure, or stop. Do not ask whether to
commit anyway — there is no commit to authorise. The user may accept a known
finding; they may not authorise committing a red test suite.

Otherwise, with the suite green:

- **No findings** — go to Phase 5 without asking anything.
- **Findings exist** — **stop and present every finding to the user**, and ask
  which issues, if any, they want fixed.
  - **None selected** — ask explicitly whether to commit anyway.
    If yes, go to Phase 5. If no, stop without committing.

**Whenever the user selects one or more issues, red suite or green** — write a
single `specs/NNN-slug-fixN.md` covering every selected issue, describing
precisely what is wrong and what correct looks like. Return to Phase 3,
dispatching that fix spec in place of `specs/NNN-slug.md`. `N` counts fix
rounds, not issues: one fix spec per round, however many issues it covers.

Every finding the user does not select is declined: record it in the log as
accepted-as-is, treat it as authorised for the eventual commit, and
do not raise it again in later rounds. New findings from a fix round are
presented normally.

**Do not fix the code yourself.** If you are hand-patching Codex's output, the
spec was underspecified — fix the spec instead, because that is what compounds.

**Cap: 3 fix rounds.** Then stop and surface it to the user.
```

Change nothing else in Phase 4. The five numbered verification steps, and the
instruction to append findings to the log, stay exactly as they are.

### `.claude/agents/architect.md` — Phase 5

In `## Phase 5 — Commit for user review`, replace this single line (currently
line 209):

```
Once the review is clean:
```

with exactly:

```
Once Phase 4 authorises the commit:
```

This is the only change to Phase 5. Leave the rest of the section untouched.

### `specs/README.md`

In the loop code block, replace these two lines (currently lines 13–14):

```
4. REVIEW      Claude reads the diff, runs the tests    → fix specs if needed
               (max 3 fix rounds)
```

with exactly:

```
4. REVIEW      Claude reads the diff, runs the tests    → stops, asks you
               which issues to fix      (max 3 fix rounds)
```

The arrow is the existing UTF-8 `→`; preserve it, the surrounding lines, and the
block's alignment.

## Out of scope

- Do not edit Phase 3. The fix-round dispatch instruction lives inside the Phase
  4 text above; Phase 3's own body belongs to spec 004.
- Do not change anything about how Codex is dispatched. Phases 0 and 2, the
  `# Dispatching Codex` section, and `## When Codex wedges` in `specs/README.md`
  all belong to spec 004.
- Do not change any part of Phase 5 other than the single line named above.
- Do not modify `.claude/settings.json` or `.claude/settings.local.json`.
- Do not modify `AGENTS.md`, any application code, test, or workflow file.
- Do not change the architect's Rules section.
- Do not change the 3-round negotiation cap or the 3-fix-round cap.
- Do not add an adversarial-review step.

## Verification

```
npm test
```

Expected: all tests pass, unchanged. No application code is touched, so this
proves only that nothing broke collaterally; the greps below carry the real
verification.

```
git status --porcelain
```

Expected: exactly two modified files, `.claude/agents/architect.md` and
`specs/README.md`, plus untracked files under `specs/`.

Each grep below must return exactly `1`, and each covers one distinct branch of
the decision table:

```
grep -c "Phase 5 is unreachable" .claude/agents/architect.md
grep -c "go to Phase 5 without asking anything" .claude/agents/architect.md
grep -c "stop and present every finding" .claude/agents/architect.md
grep -c "dispatching that fix spec in place of" .claude/agents/architect.md
grep -c "red suite or green" .claude/agents/architect.md
grep -c "If yes, go to Phase 5. If no, stop without committing." .claude/agents/architect.md
grep -c "one fix spec per round" .claude/agents/architect.md
grep -c "do not raise it again in later rounds" .claude/agents/architect.md
grep -c "may not authorise committing a red test suite" .claude/agents/architect.md
grep -c "Once Phase 4 authorises the commit:" .claude/agents/architect.md
grep -c "Cap: 3 fix rounds" .claude/agents/architect.md
grep -c "stops, asks you" specs/README.md
```

These must return exactly `0`:

```
grep -c "Once the review is clean" .claude/agents/architect.md
grep -c -e "codex-companion" -e "adversarial-review" .claude/agents/architect.md
```

The first confirms the old precondition was replaced rather than supplemented.
The second confirms spec 004's scope did not leak in.

## Open questions
