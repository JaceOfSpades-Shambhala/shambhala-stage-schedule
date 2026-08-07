# 004 — Route Codex dispatch through the codex plugin runtime

## Goal

The architect dispatches Codex through the `codex@openai-codex` plugin's
companion runtime and its job control, instead of hand-rolled `codex exec` calls
with rollout-file polling and `taskkill`.

## Context

The `codex@openai-codex` plugin (v1.0.6) is installed at user scope. It ships a
runtime at:

```
$USERPROFILE/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs
```

Referred to below as **COMPANION**. Write it inline on every invocation, in the
`$USERPROFILE` form above — shell state does not persist between Bash calls, and
the permission rule added by this spec matches that literal string. Do not
substitute an expanded absolute path in `.claude/agents/architect.md`; that file
is committed and shared, so a `C:/Users/<name>/` path would be wrong elsewhere.

This spec was split from an earlier spec 003. Phase 4's review gate shipped
separately as spec 003; only dispatch remains here.

### Runtime behaviours, confirmed by reading the source

- `handleTask` honours `--background` and returns a job id. `handleReviewCommand`
  parses `--background` but calls `runForegroundCommand` unconditionally — the
  flag is accepted and ignored.
- `ensureCodexAvailable` and request validation run **before** `buildTaskJob`, so
  a dispatch can fail synchronously with no job id and no stored record.
- A background job's status begins at `queued`, then `running`. Both are active
  and cancellable.
- `runTrackedJob` (`lib/tracked-jobs.mjs:142`) writes `status: "running"` with a
  live pid before awaiting. On resolve it writes `result` **and** `rendered` for
  both outcomes — `completed` when `exitStatus === 0`, `failed` otherwise
  (`tracked-jobs.mjs:156,167`). Only the thrown-error `catch` path writes
  `errorMessage` with no `result`. So `rawOutput` may be present on a `failed`
  job and must not be keyed to `completed`.
- Killing the Node process externally skips both paths and strands a record
  permanently at `running`.
- `handleResult` returns `{ job, storedJob }`; reply text is at
  `storedJob.result.rawOutput`.
- `handleStatus` takes a positional job id. `--wait` defaults to 240000ms, but
  Claude Code's Bash tool caps one call at 600000ms, so a 15-minute wait cannot
  complete in a single call. Poll instead.

### Other constraints

1. **The plugin's slash commands are not model-invocable.** `review`,
   `adversarial-review`, `status`, `result`, `cancel`, `transfer` all set
   `disable-model-invocation: true`, so the architect calls COMPANION directly.
   `rescue` is bypassed: it defaults to `--write` and injects an
   `AskUserQuestion` resume prompt, both wrong for a read-only spec review.
2. **The plugin is a user-scope install, not a repo dependency.** A clone
   elsewhere will not have it, so the legacy `codex exec` path is retained as a
   documented fallback rather than deleted.

## Files to change

- `.claude/agents/architect.md` — Phase 0; replace the dispatch section; Phases 2
  and 3; add Appendix A
- `specs/README.md` — replace the `## When Codex wedges` section
- `.claude/settings.local.json` — add one permission entry

## Changes

### `.claude/settings.local.json`

Gitignored (`.gitignore:4`) and machine-local, which is why the permission
belongs here and not in the tracked `.claude/settings.json`.

Append exactly one string to the existing `permissions.allow` array, preserving
every existing entry, the order, and the 2-space formatting:

```
Bash(node "$USERPROFILE/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs" *)
```

Add nothing else; do not deduplicate, reorder, or add a `deny` block.

### `.claude/agents/architect.md`

**Phase 0 preflight (line 18).** Add a check that COMPANION exists. If absent,
the architect uses Appendix A and records that in the log. A missing plugin is
not a stop condition; a missing `AGENTS.md` or `specs/TEMPLATE.md` still is.

**Replace `# Dispatching Codex (Phases 2 and 3)` (lines 45–132)** with a section
of the same name specifying this procedure:

1. Dispatch with `task --background`. If the command exits non-zero or prints no
   job id, that is a **synchronous dispatch failure**: no job exists, so there is
   nothing to poll, retrieve, or cancel. Record its stderr in the log, retry once
   per step 8, then escalate.
2. On success, record the job id in the log as
   `## Round N — dispatched <phase> at <HH:MM:SS>, job <id>`.
3. Poll `node "<COMPANION>" status <job-id> --json`, reading `job.status`. Run
   the poll loop as a background Bash task at a 15-second interval, bounded by
   `timeout 900`. Do not pass a wait flag to `status`; its 240000ms default is
   too short and a longer one exceeds Claude Code's 600000ms Bash ceiling.
4. `job.status` is authoritative. `queued` and `running` are both active — keep
   polling. `completed`, `failed`, and `cancelled` are all terminal.
5. Do not infer progress from `git status --porcelain`. A Phase 2 job is
   read-only and can never change it.
6. On any terminal status, retrieve with `result <job-id> --json` and use this
   fallback chain, in order:
   - `storedJob.result.rawOutput` whenever it is present and non-empty,
     regardless of whether the status is `completed`, `failed`, or `cancelled`
   - `storedJob.errorMessage`
   - the contents of `storedJob.logFile`
   Append whichever was found to the log, naming which one it was.
7. If `job.status` is still `queued` or `running` after 15 minutes, terminate it
   with `cancel <job-id> --json` and treat it as a failed dispatch. Never kill
   the Node process directly; an external kill strands the record at `running`.
8. Retry a failed, cancelled, or synchronously-failed dispatch exactly once, then
   escalate with elapsed time, the job id if one exists, and whatever the
   fallback chain yielded.
9. The runtime owns liveness. Do not use `find` on `~/.codex/sessions`, `ps -W`,
   or `taskkill`.
10. Never implement the spec yourself to route around a failed Codex run.

**Phase 2 (lines 157–162).** Replace the `codex exec` command with:

```
node "<COMPANION>" task --background --fresh --effort xhigh "<prompt>"
```

Omitting `--write` is what makes the run read-only; state that. Prompt text
unchanged. Replace the `-o specs/NNN-slug.review.md` behaviour: append the
retrieved output to `specs/NNN-slug.log.md` and read the verdict from its first
line. If that output is empty, or its first line is neither `APPROVED` nor
`CONCERNS`, treat it as a failed dispatch per step 8. It is not a negotiation
round and does not consume one of the 3 rounds.

**Phase 3 (lines 178–183).** Replace the `codex exec` command with:

```
node "<COMPANION>" task --background --write --fresh --effort medium "<prompt>"
```

Prompt text unchanged.

**Do not modify Phase 4.** Spec 003 rewrote it; leave it exactly as found.

**Do not change the Rules section.** The architect's writes remain limited to
`specs/`; Codex performs this edit in Phase 3.

**Add `# Appendix A — Fallback when the plugin is absent`** at the end,
containing the current dispatch procedure moved verbatim: the `timeout 15m codex
exec` form, the rollout-file liveness check, the `ps -W` / `taskkill //PID` kill
procedure, and the stall-detection rules. Introduce it with one line stating it
applies only when the Phase 0 COMPANION check fails, and one line warning that
the rollout-file check measures its window from when the check runs, so a check
started late can report a false wedge on a healthy run.

### `specs/README.md`

Replace the `## When Codex wedges` section (lines 45–54) with `## How Codex is
dispatched`: the architect dispatches through the plugin's companion runtime,
polls `status <job-id>`, retrieves with `result`, and terminates with `cancel`;
the runtime owns liveness, replacing rollout-polling and `taskkill`; if the
plugin is absent the architect falls back per Appendix A. Keep the closing
cross-reference to `.claude/agents/architect.md`.

## Out of scope

- Do not modify Phase 4 of `.claude/agents/architect.md` or the loop table in
  `specs/README.md`. Both belong to spec 003.
- Do not add an adversarial-review step anywhere.
- Do not enable the stop-time review gate or call `setup --enable-review-gate`.
- Do not modify `AGENTS.md`, any application code, test, or workflow file.
- Do not modify the tracked `.claude/settings.json`.
- Do not set or reference `BASH_MAX_TIMEOUT_MS`.
- Do not commit anything under `.claude/plugins/`.
- Do not change the 3-round negotiation cap or the 3-fix-round cap.
- Do not amend the architect's Rules section.
- Do not delete the fallback procedure — it moves to Appendix A intact.

## Verification

```
npm test
```

Expected: all tests pass, unchanged. No application code is touched.

```
git status --porcelain
```

Expected: modifications limited to `.claude/agents/architect.md`,
`specs/README.md`, and files under `specs/`. `.claude/settings.local.json` must
**not** appear — it is gitignored, so if it does, the wrong settings file was
edited.

```
node -e "const p=require('./.claude/settings.local.json').permissions.allow; console.log(p.filter(x=>x.includes('codex-companion')).length)"
```

Expected: `1`. `0` means not added; `2` or more means duplicated.

```
grep -c "taskkill" .claude/agents/architect.md
```

Expected: non-zero, every occurrence inside Appendix A. Zero means the fallback
was deleted rather than moved.

```
grep -c -e "adversarial-review" -e "BASH_MAX_TIMEOUT_MS" .claude/agents/architect.md
```

Expected: `0`. Both are explicitly excluded.

```
grep -c "stop and present every finding" .claude/agents/architect.md
```

Expected: `1`. Spec 003's Phase 4 gate must still be intact and untouched.

## Open questions
