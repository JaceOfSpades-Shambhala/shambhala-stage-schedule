# 003-fix1 — Reflow one sentence so its verification grep can match

Status: historical and superseded by the current architect workflow.

## Goal

`grep -c "do not raise it again in later rounds" .claude/agents/architect.md`
returns `1` instead of `0`, without changing a single word of the text.

## Context

Spec 003 was implemented correctly and verbatim. Its verification, however, is
self-contradictory: the prescribed replacement text wraps the phrase `do not
raise it again in later rounds` across two lines, while the prescribed check is a
line-based `grep` that can only match it unwrapped. Both requirements cannot
hold.

Codex identified this during implementation and stopped to ask rather than
choosing for itself, which was correct — the contradiction was the author's to
resolve. The user chose to fix the wrap rather than accept the failing check.

**Only whitespace changes.** No word is added, removed, or reordered in either
file. The rendered Markdown is identical, because a single newline inside a
paragraph does not affect Markdown output.

## Files to change

- `.claude/agents/architect.md` — rewrap one sentence in Phase 4
- `specs/003-phase4-review-gate.md` — rewrap the same sentence inside the
  prescribed replacement block, so the spec continues to describe the file
  accurately

## Changes

### `.claude/agents/architect.md`

In `## Phase 4 — Review`, find this paragraph:

```
Every finding the user does not select is declined: record it in the log as
accepted-as-is, treat it as authorised for the eventual commit, and do not raise
it again in later rounds. New findings from a fix round are presented normally.
```

Replace it with exactly:

```
Every finding the user does not select is declined: record it in the log as
accepted-as-is, treat it as authorised for the eventual commit, and
do not raise it again in later rounds. New findings from a fix round are
presented normally.
```

The paragraph becomes four lines instead of three. Nothing else in Phase 4
changes.

### `specs/003-phase4-review-gate.md`

The same paragraph appears once inside the fenced replacement block under the
heading `### .claude/agents/architect.md — Phase 4`, introduced by the words
`with exactly:`. Apply the identical rewrap there, so the spec's prescribed text
matches what the file actually contains.

Change nothing else in that spec — not its Goal, Context, Out of scope, or
Verification sections.

## Out of scope

- Do not change any word, punctuation mark, or emphasis marker. Whitespace only.
- Do not rewrap, reflow, or reformat any other paragraph in either file, however
  ragged it looks.
- Do not touch `specs/README.md`, which spec 003 already changed correctly.
- Do not modify `specs/003-phase4-review-gate.log.md` or any `.review.md` or
  `.dispatch.log` file.
- Do not modify `AGENTS.md`, any application code, test, or workflow file.
- Do not start on spec 004.

## Verification

```
grep -c "do not raise it again in later rounds" .claude/agents/architect.md
```

Expected: `1`. This is the whole point of the change.

```
grep -c "do not raise it again in later rounds" specs/003-phase4-review-gate.md
```

Expected: `1`. Confirms the spec was rewrapped to match.

```
git diff --stat
```

Expected: `.claude/agents/architect.md` and `specs/003-phase4-review-gate.md` are
the only changes beyond untracked spec artifacts, and `specs/README.md` is
**not** listed as changed by this fix round.

```
git diff --ignore-all-space -- .claude/agents/architect.md
```

Expected: **empty output**. This is the strongest check in this spec — it proves
the edit was whitespace-only. Any non-empty result means a word changed and the
fix must be rejected.

```
npm test
```

Expected: 148/148 pass, plus `Schedule validation passed.` — unchanged.

Finally, all of spec 003's original verification greps must still hold: the ten
`must be 1` checks now all return `1`, and the two `must be 0` checks still
return `0`.

## Open questions
