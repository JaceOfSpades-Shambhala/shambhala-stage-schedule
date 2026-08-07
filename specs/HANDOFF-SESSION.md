# Session handoff — 2026-08-07

Written for the next architect (Claude) and executor (Codex) resuming this work
on a different machine. Read this file completely before taking any action. The
specs, logs, and audit in this directory are the state; this conversation does
not transfer and nothing in it is needed beyond what is recorded here.

**Context you must internalise first: the user's trust in this framework is
damaged, for cause.** The architect made five verification-authoring errors in
one session, and a comprehensive audit (`specs/AUDIT.md`) judged the framework
"salvageable, but not sound." Read the "Known error classes" section below
before writing or reviewing any spec.

## Where you are

- **Branch:** `claude/phase4-review-gate`. Continue work here, not from `main`.
- **`main`** is at `0df0c26`, untouched by this session, and matches
  `origin/main`.
- Commit `a01ed41` implemented spec 003: the Phase 4 review gate. This means
  `.claude/agents/architect.md` **on this branch** contains the gate (present
  findings, stop, ask the user which to fix; red `npm test` blocks Phase 5
  unconditionally). `main`'s copy does not. A session started from `main` loses
  the gate.
- Tests at `a01ed41`: **148/148 pass** plus `Schedule validation passed.`
- **Merging this branch to `main` is a production deploy.** This branch is
  currently docs/framework only, but the rule stands regardless.

## Live critical issues — read before running anything

From `specs/AUDIT.md` (authoritative). Verdict: application architecture sound;
review/verification control plane is not. Both of the user's concerns confirmed,
the second understated.

1. **C1 — `scripts/build-pages.mjs` recursively deletes whatever path it is
   given.** `node scripts/build-pages.mjs ..` resolves to the repository's
   parent and deletes it. This travels with the repo and is live on every
   machine. **Do not run this script with any argument until spec 005 lands.**
2. **C2 — permission rules bypass the human gates.** On the previous machine,
   `.claude/settings.local.json` had grown to 63 auto-allow entries including
   `git push *`, `git checkout *`, `gh pr *`, and broad `node -e`. That file is
   gitignored and machine-local: **the machine you are on now has its own copy
   with its own contents. Audit it before trusting any permission gate**, and
   expect spec 006's specifics (entry lists, counts) to need re-grounding
   against the local file.
3. **C3 — v78 cache staleness.** Commit `34bb2d4` withdrew
   `hex-owl-playground.html` from the site and the service-worker asset list,
   but the cache name is still `stage-schedule-v78`, so installed clients can
   keep serving the withdrawn file. Fix drafted as spec 007. Merging that fix is
   a production release (v79) by design.

Audit items 4–12 (CI hardening, framework redesign, log evidence standards,
Pages allowlist, documentation consolidation, and more) are **deferred pending
user review**. Do not start them unprompted.

## In-flight: specs 005, 006, 007 — drafted, reviewed, NOT revised, NOT implemented

The user approved proceeding on audit items 1–3, with Codex implementing. The
architect drafted:

- `specs/005-build-pages-destination-guard.md` — C1 fix
- `specs/006-narrow-permission-rules.md` — C2 fix
- `specs/007-release-v79-bump.md` — C3 fix

A combined Codex review returned **ten concerns**: `specs/005-007.review.md`.
That file is authoritative and every point must be answered before
implementation. The worst findings, so you do not rediscover them:

- Spec 005's verification ran the real script against `..` — a check whose
  failure mode is deleting the user's dev directory — and its `; echo "exit=$?"`
  suffix masked the exit status. Never verify a destructive guard by invoking
  it; test a pure resolver against disposable fixtures.
- Importing from `build-pages.mjs` executes its top-level `rm`/`mkdir`/copy
  body. Any test importing it must first make the CLI body import-safe.
- Spec 006 used `deny` where Claude Code's tracked **`ask`** rules are the
  correct mechanism (force approval without making the command impossible), and
  its arithmetic assumed 41 local allow entries when the file had 63 — it grows
  as prompts are approved, so never hardcode its counts.
- Spec 007 would have rewritten `HANDOFF.md`'s historical v78 release note to
  v79, falsifying history, and reported `git grep -c` line counts as occurrence
  counts throughout.

**Pending user decision — ask before proceeding:** the architect proposed that
Codex write the revised 005–007 specs (it authored the audit and found every
defect in the drafts) with the architect reviewing — an inversion of the normal
roles — and that verification sections become executable `node:test` files
rather than hand-written shell assertions. The user has not yet chosen. Present
the options; do not pick unilaterally.

## Parked: spec 004 — do not implement as-is

`specs/004-codex-plugin-dispatch.md` reroutes Codex dispatch through the
`codex@openai-codex` plugin's companion runtime. It is parked because the audit
(finding M3) judged it still under-specified after three review rounds, and it
is machine-dependent:

- It requires the plugin at user scope:
  `claude plugin marketplace add openai/codex-plugin-cc` then
  `claude plugin install codex@openai-codex` (v1.0.6 at time of writing).
- Its paths assume `$USERPROFILE/.claude/plugins/...` — verify on the new
  machine.
- Its permission entry targets the machine-local settings file.

Specs 005–007 do not need the plugin; they use plain `codex exec`.

## Decisions the user has already made — do not re-ask

1. Adopt the plugin's Phase 4 review gate — shipped as spec 003.
2. Leave the plugin's stop-time review gate disabled.
3. Split the original combined spec 003 into 003 (gate) + 004 (dispatch).
4. Audit items 1–3 proceed now; items 4–12 wait for the user's review.
5. Raw dispatch transcripts (`specs/*.dispatch.log`) are not committed; curated
   `.log.md` files are the record.

## Known error classes — the reason trust was lost. Do not repeat them.

From `specs/AUDIT.md` and the session logs, all committed by the architect:

1. Requiring a file to contain a literal string while asserting that string's
   count is zero.
2. Prescribing verbatim prose in which a phrase wraps across lines, plus a
   line-based grep that can only match it unwrapped.
3. Verifying "what this round changed" with `git diff` against `HEAD`, which
   conflates it with all uncommitted work.
4. Checks that report success when the underlying command failed — errors to
   stderr with empty stdout read as a pass; trailing `; echo` masking exit
   codes.
5. Reporting `grep -c` line counts as occurrence counts, and arithmetic errors
   in asserted totals (including against a settings file that grows over time).

Operational lessons, equally binding:

- **Never combine a heredoc and a `codex exec` dispatch in one Bash call, and
  always redirect stdin: `codex exec ... < /dev/null`.** The heredoc consumes
  stdin and Codex blocks forever waiting for EOF — this caused two identical
  startup wedges before being diagnosed.
- Liveness-check a dispatch by matching the newest
  `~/.codex/sessions/.../rollout-*.jsonl` against the dispatched session id.
  Do not use `find -newermt` time windows: they measure from when the check
  runs and produced a false wedge signal on a healthy run.
- Codex's machine-local memory may reference stale checkout paths from other
  machines. Specs must remain fully self-contained; never rely on Codex
  remembering anything.

## What does not transfer to this machine

- **This conversation.** Everything needed is in `specs/`.
- **The Codex plugin** (user-scope install; only needed for parked spec 004).
- **`.claude/settings.local.json`** — machine-local; audit the local copy.
- **Raw dispatch transcripts** — left uncommitted on the previous machine.
- **`~/.codex` sessions and memory.**

Environment on the previous machine, for reference: `codex-cli 0.147.0`,
Claude Code `2.1.220`, reviews run at `model_reasoning_effort=xhigh`,
implementation at `medium`.

## How to resume

1. Fetch and check out `claude/phase4-review-gate`.
2. Run Phase 0 preflight per `.claude/agents/architect.md`.
3. Read, in order: `specs/AUDIT.md`, `specs/005-007.review.md`, then specs
   005/006/007.
4. Confirm `npm test` is green (148/148 at handoff) before any new work.
5. Ask the user how to proceed on 005–007 (architect revises vs. Codex
   redrafts with architect review — see "Pending user decision" above).
6. Do not run `node scripts/build-pages.mjs` with any argument until 005 lands.
7. Audit this machine's `.claude/settings.local.json` before relying on any
   permission gate, and re-ground spec 006 against it.
