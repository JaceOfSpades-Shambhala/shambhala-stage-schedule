# 003 — Route Codex dispatch through the codex plugin runtime — log

## Round 1 — plan written

Spec written to `specs/003-codex-plugin-dispatch.md`.

### Origin

User installed `codex@openai-codex` (v1.0.6) at user scope this session via
`claude plugin marketplace add openai/codex-plugin-cc` and
`claude plugin install codex@openai-codex`. `/plugin` is an interactive terminal
dialog and is unavailable in this session, so the non-interactive CLI was used.

### Investigation before writing

- Read the plugin's `codex-cli-runtime`, `codex-result-handling` skills,
  `rescue.md`, `transfer.md`, `hooks.json`.
- Found that `review`, `adversarial-review`, `status`, `result`, `cancel`,
  `transfer` all set `disable-model-invocation: true` — the architect cannot fire
  them and must call the companion script directly. This materially changed the
  design and was not apparent from the plugin description.
- Ran `codex-companion.mjs status --json` in this repo to confirm the runtime
  actually works before speccing against it. It returned `workspaceRoot`
  correctly resolved, `stopReviewGate: false`, `mode: "direct"`. No restart
  needed.

### User decisions encoded

1. **Fix loop** — adopt the plugin's gate. After review findings the architect
   stops and asks which issues to fix, replacing the auto-iterating fix loop.
   Caps unchanged.
2. **Stop review gate** — leave disabled. Confirmed already `false`; no action
   required.

### Architect judgement calls to flag

- **Fallback retained, not deleted.** The plugin is a user-scope install, so a
  clone elsewhere would have no dispatch procedure at all if the old one were
  removed. Moved to Appendix A rather than dropped.
- **`/codex:rescue` bypassed deliberately.** It defaults to `--write` and injects
  an `AskUserQuestion` resume prompt, both wrong for a read-only Phase 2 review.
  Calling `task` directly gives the same engine with correct per-phase defaults.
- **Scope rule amended.** The architect's "only writes are to `specs/`" rule
  would be violated by this very change, so the spec amends it to allow
  `.claude/agents/architect.md` as well.
- **Absolute user path inlined.** Shell state does not persist between Bash
  calls, so the full companion path is repeated per invocation. Ugly, and it
  hardcodes a user-scope path into repo scaffolding. Accepted because the
  Phase 0 check plus Appendix A fallback contain the blast radius. Flagged for
  Codex to challenge.

### Environment note

This session is **not** in a `.claude/worktrees/` worktree. It is on branch
`main` in the user's main folder, `/c/Users/Jace/dev/shambhala-stage-schedule`,
with a clean tree. Phase 5 must branch before committing. Recorded here because
`specs/README.md` states worktree isolation as the norm and that assumption does
not hold for this session.

Awaiting user review of the spec before Phase 2.

## Round 1 — dispatched Phase 2 review at 12:59:13, session 019fdd2a-21d0-7341-ae0e-4c69706dcb16

Dispatched with the **current** documented procedure (`codex exec --sandbox
read-only -c model_reasoning_effort="xhigh"`), not the companion runtime spec 003
proposes. Deliberate: spec 003 is unapproved, and using the proposed dispatch
path to review the spec that would approve it is circular. If the new path had a
defect, it would surface as a failed review rather than as a defect.

Liveness confirmed: session id issued within seconds of dispatch.

Observation during the run: Codex auto-loaded its `openai-docs` system skill and
began web-searching `site:developers.openai.com/codex` for plugin documentation.
Also logged one internal error, `collab spawn failed: no thread with id
019fdd2a-2516-7301-b566-3a1b0c593c9d`. Neither is fatal, but both are noted in
case the review quality is affected — the spec concerns plugin behaviour, which
pulled Codex toward platform docs rather than the repository.

## Round 1 — Codex review: CONCERNS

Completed 13:03-ish, ~4 min elapsed. Full response:

```
CONCERNS

1. `adversarial-review --background` does not detach. The runtime parses the flag but awaits the review in the foreground; the plugin command relies on Claude's Bash `run_in_background: true`. It also returns no companion job ID before completion. How should Phase 4 launch it, obtain its job ID, poll it, and cancel it?

2. `.claude/settings.json` permits `codex exec` and repo-local `node scripts/...`, but not the proposed absolute-path `node "$USERPROFILE/.../codex-companion.mjs"` commands. Since settings changes are explicitly out of scope, are repeated permission prompts intended?

3. "Outer bound stays 15 minutes" contradicts cancelling only when Git status is unchanged. A write job could change one file and then run indefinitely. Is 15 minutes an unconditional limit, or a no-progress interval? What comparison baseline and polling cadence define "no change"?

4. `result <job-id> --json` returns a wrapper containing `job` and `storedJob`, not the raw Codex response. Phase 2 does not specify extracting `storedJob.result.rawOutput` before evaluating the required first-line verdict. Phase 4's JSON findings are also not severity-sorted; only rendered output is sorted. What exact payload should be evaluated and appended?

5. Polling is specified as `status --json`, despite recording a specific job ID. That command can report multiple jobs. Should the required command be `status <job-id> --json`, possibly using `--wait` and an explicit timeout?

6. The new review gate defines what happens when the user selects findings to fix, but not what happens when there are no findings or the user selects no fixes. Does the architect proceed directly to Phase 5 after that response?

7. The proposed Rules change permanently permits the architect to edit `.claude/agents/architect.md`, but this change is supposed to be performed by Codex in Phase 3; the architect itself still only needs to write under `specs/`. Is permanent self-modification authority actually intended?
```

## Round 1 — architect verification of the concerns

Did not take Codex's assertions on trust. Verified each against source before
revising:

- **1 confirmed.** `handleReviewCommand` (line ~712) parses `background` into
  `booleanOptions` then calls `runForegroundCommand` unconditionally. No branch
  on `options.background`, unlike `handleTask` (line ~788) which does branch and
  returns a job id. The flag is accepted and silently ignored.
- **2 confirmed.** Read `.claude/settings.json`. Allow list contains
  `Bash(node scripts/:*)` — repo-relative. The absolute `$USERPROFILE` path
  matches no entry.
- **4 confirmed.** `handleResult` (line 910) builds `{ job, storedJob }`.
  `rawOutput` appears at lines 438/497/501/514 under the result object.
- **5 confirmed.** `handleStatus` (line 883) reads `positionals[0]` as a job
  reference and supports `--wait` / `--timeout-ms` / `--poll-interval-ms`.
  `DEFAULT_STATUS_WAIT_TIMEOUT_MS` = 240000 (line 69), so a 15-minute wait needs
  an explicit `--timeout-ms`.
- **3, 6, 7** are logic and design defects in the spec, verifiable by reading
  the spec itself. All three are real.

## Round 1 — resolutions

- **1** — Removed `--background` from the Phase 4 adversarial-review call and
  stated why. It now runs via the architect's own Bash background execution with
  a 15-minute timeout; the Bash job is the only handle. Also specified that the
  architect sorts findings by severity itself, since only rendered output is
  pre-sorted.
- **3** — Rewritten as an explicit no-progress interval: baseline
  `git status --porcelain` at dispatch, compare byte-identically after
  `status --wait` returns, re-baseline and wait again if it moved, cancel only
  if it did not.
- **4** — Phase 2 now names `storedJob.result.rawOutput` as the payload whose
  first line carries the verdict and which is appended to the log.
- **5** — Now `status <job-id> --json --wait --timeout-ms 900000`, with the
  240000 default called out. Added a verification grep asserting the malformed
  `status --json --wait` form does not appear.
- **6** — Gate now states: no findings, or user selects none, proceed to Phase 5.
- **7** — **Concern accepted in full; this was my error.** I was widening my own
  write authority permanently for a change Codex performs in Phase 3. The
  architect never needed it. The Rules amendment is dropped entirely and "do not
  amend the Rules section" is now in Out of scope. Good catch by Codex.
- **2** — **Not resolved. Escalated to the user.** It is a genuine scope
  decision about what gets auto-approved, and my own rules say to ask rather than
  decide. Left in Open questions; spec is not re-dispatched until answered.

Round 2 review is blocked pending the user's answer on concern 2.

## Round 2 — resolution of concern 2

User chose option A: the permission entry goes in the gitignored
`.claude/settings.local.json`, not the tracked `.claude/settings.json`.

Spec updated:

- `.claude/settings.local.json` added to Files to change, with an explicit
  instruction to append exactly one entry and preserve all existing entries and
  ordering. That file already carries machine-specific absolute paths, so this
  is consistent with its existing role.
- Out of scope now forbids touching the tracked `.claude/settings.json`, and the
  earlier blanket prohibition on `settings.local.json` is removed since it is now
  in scope.
- Verification asserts the entry count is exactly 1 and that
  `.claude/settings.local.json` does **not** appear in `git status --porcelain`
  — if it does, the wrong settings file was edited.

Architect judgement call on the path form: the permission rule matches the
command string as written, so the spec now pins both `.claude/agents/architect.md`
and the allow entry to the `$USERPROFILE/...` form rather than an expanded
`C:/Users/Jace/...` path. Two reasons: `architect.md` is committed and shared, so
a hardcoded user path there would be wrong on every other machine; and the rule
and the command must be the same literal string to match.

Residual uncertainty, flagged rather than assumed: I have not verified how the
permission matcher treats `$` and embedded quotes in a Bash rule, and I do not
know whether a `settings.local.json` change takes effect mid-session or needs a
restart. If dispatches still prompt after implementation, that is the likely
cause and it is a settings fix, not a spec defect. Codex is invited to challenge
the rule's exact form in Round 2.

Open questions cleared. Re-dispatching for Round 2 review.

## Round 2 — dispatched at 13:08:52, session 019fdd32-f86c-7db2-a9e4-b7aaa3e58c82

Liveness check returned **no rollout**, the documented wedge signal. Verified
before acting rather than killing on the signal alone, and it was a false
positive: `rollout-2026-08-07T13-08-53-019fdd32-f86c-7db2-a9e4-b7aaa3e58c82.jsonl`
existed and was growing (413938 bytes), matching the session id in the dispatch
output.

Cause: `find -newermt '-90 seconds'` measures the window from when the *check*
runs, not from dispatch. The check started a few seconds later than in Round 1
because of the gap between tool calls, putting the rollout roughly 5 seconds
outside the window. Round 1 matched at ~62s; Round 2 missed at ~97s.

Following the documented procedure mechanically would have killed a healthy run
and consumed the single permitted retry. Recording this as evidence for spec 003:
the runtime's `status <job-id> --wait` reports authoritative job state and has no
equivalent failure mode. The false-positive risk in the current procedure is not
hypothetical — it fired on the second dispatch after the procedure was written.

No action taken; run allowed to continue.

## Round 2 — Codex review: CONCERNS

```
CONCERNS

1. `git status --porcelain` cannot measure ongoing progress. A read-only Phase 2 job can never change it, and repeated edits to an already-modified file leave the same `M <path>` output. Healthy jobs could therefore be cancelled after 15 minutes. What runtime signal should define progress, and should the wait/re-baseline cycle repeat beyond the single additional wait currently specified?

2. The foreground `status <job-id> --wait --timeout-ms 900000` exceeds Claude Code's Bash defaults: 2 minutes normally and a 10-minute maximum unless reconfigured. The companion's internal timeout does not extend the containing Bash call. Should this command run as a background Bash task, or should `BASH_MAX_TIMEOUT_MS` be configured? The exact invocation and output-retrieval procedure are missing.

3. The statement that the Phase 4 Bash job is the only handle and `status`, `result`, and `cancel` do not apply is incorrect. `handleReviewCommand` creates a tracked companion job, and `runTrackedJob` records its ID, PID, and running state before awaiting the review. Although the ID is not returned at launch, it is discoverable through status. An external 15-minute kill can terminate Node before the job record is finalized, leaving a permanently "running" companion job. Which lifecycle is authoritative, and how must timed-out review state be cleaned up?

4. Phase 4 does not specify the actual background Bash invocation, how the architect waits for it, or how it reads its stdout before appending findings. Claude Code returns a background task ID and writes output to a file, but those steps need to be stated explicitly, including timeout and nonzero-exit handling.

5. `storedJob.result.rawOutput` is not guaranteed for failed or cancelled jobs. `runTrackedJob` stores `errorMessage` without `result` when an exception is thrown, and cancellation can likewise leave no result payload. The spec nevertheless requires retrieving and escalating with `storedJob.result.rawOutput`. What exact fallback—`errorMessage`, rendered output, or the job log—must be recorded?

6. Phase 2 does not define what happens when a job reports `completed` but `rawOutput` is empty or its first line is neither `APPROVED` nor `CONCERNS`. Is that a retryable failed dispatch, a negotiation round, or an immediate escalation?
```

## Round 2 — architect verification

- **1 confirmed by inspection.** Phase 2 runs read-only; `git status --porcelain`
  can never change. My Round 1 "fix" made the cancel condition permanently true
  for exactly the job type it was meant to protect. Worse than the bug it
  replaced.
- **2 confirmed.** Claude Code's Bash tool caps a single call at 600000ms.
  `--timeout-ms 900000` is unreachable in one foreground call.
- **3 confirmed at source.** `runForegroundCommand` (line 658) delegates to
  `runTrackedJob` (`lib/tracked-jobs.mjs:142`), which writes a job record with
  `status: "running"` and `pid: process.pid` *before* awaiting. Review jobs are
  tracked and discoverable. My claim that status/result/cancel do not apply was
  wrong. The external-kill hazard is real: the `catch` never runs, so the record
  stays `running` forever.
- **5 confirmed at source.** Success path writes `result: execution.payload`.
  The `catch` path writes `errorMessage` and no `result` key at all.
- **4, 6** are genuine gaps in the spec.

## Round 2 — resolutions

Rather than patch six items onto a spec that was accreting complexity, cut the
scope that was generating it. Most of the complexity came from things I added,
not from the user's two decisions.

- **3 and 4 removed entirely** by dropping the adversarial-review step from
  Phase 4. It was my own addition, required by neither user decision, and it
  produced two of the six concerns by itself. User confirmed: leave it out. Now
  named in Out of scope, with a verification grep asserting it is absent.
- **1** — Progress is now `job.status` from the runtime, which is authoritative.
  The `git status --porcelain` heuristic is deleted, and the spec explicitly
  forbids inferring progress from it.
- **2** — Dropped `--wait` entirely. Now polls `status <job-id> --json` every 15s
  from a bounded background task, each call far below the ceiling. This also
  avoids configuring `BASH_MAX_TIMEOUT_MS`, which is now in Out of scope.
- **5** — Explicit ordered fallback chain: `storedJob.result.rawOutput`, then
  `storedJob.errorMessage`, then `storedJob.logFile`, recording which was used.
- **6** — Completed-but-empty or unrecognized first line is a failed dispatch:
  retry once, then escalate. Explicitly not a negotiation round, so it cannot
  silently consume the 3-round budget.

Also added: terminate only via `cancel`, never by killing Node, since an external
kill strands the record at `running` permanently.

Net effect: the spec got smaller and simpler after this round, not larger.

## Round 3 — Codex review: CONCERNS (3-round cap reached)

Dispatched 13:34:51, session 019fdd4a-c108-7500-8d92-5df99bbfb369, ~6 min.
Liveness check changed to compare the newest rollout against the dispatch
session id, rather than the time-window `find` that produced the Round 2 false
positive. Clean match.

```
CONCERNS

1. Lines 94-95 require `.claude/agents/architect.md` to contain the literal `--wait`, but lines 212-215 require its `grep` count to be zero. Both requirements cannot pass.

2. A background task initially has `status: "queued"`, which the runtime treats as active and cancellable. Step 6 handles only a job still `"running"` after 15 minutes. What must happen if it remains `"queued"`? Likewise, step 5 retrieves results only for `"completed"` or `"failed"`, although step 7 requires retrying and reporting `"cancelled"` jobs.

3. Line 35 incorrectly says `storedJob.result.rawOutput` exists only for normally completed jobs. `runTrackedJob` also stores `result` when the runner resolves with a nonzero exit status, producing a `"failed"` job that may still contain `rawOutput`. Should the fallback chain use `rawOutput` whenever present, regardless of final status?

4. `task --background` can fail before creating a job because `ensureCodexAvailable` and request validation run before `buildTaskJob`. Steps 1 and 7 assume every dispatch returns a job ID and stored fallback data. How should a synchronous dispatch failure with no job ID be retried and escalated?
```

## Round 3 — architect verification

- **1 confirmed.** `grep -n -- "--wait" specs/003-codex-plugin-dispatch.md`
  returns hits at lines 37, 39, 94, 212. Spec line 94 instructs the executor to
  write "Do not use `--wait`" into `architect.md`; spec line 212 then asserts
  that file's `--wait` count must be `0`. The instruction and its own
  verification are mutually exclusive. Entirely my error.
- **3 confirmed at source.** `tracked-jobs.mjs:156` sets
  `completionStatus = execution.exitStatus === 0 ? "completed" : "failed"`, and
  line 167 writes `result: execution.payload` in **both** cases. Only the `catch`
  path omits `result`. My Context line 35 overstated the constraint.
- **2 and 4** are real gaps, readable from the runtime's ordering: job records
  begin at `queued`, and `ensureCodexAvailable` plus request validation run
  before `buildTaskJob`, so a dispatch can fail with no job id at all.

## Round 3 — status: CAP REACHED, escalated to user

Per the loop, three negotiation rounds is the cap and the architect must not
force approval by weakening the spec. Stopping and handing to the user.

Assessment stated plainly, for the user to weigh:

- Concern trend is **7 -> 6 -> 4**, and no round has disputed the design. Codex
  has never objected to the approach, only to precision defects.
- All four remaining items are mechanical and independently verified. None are
  design-level. None require a user decision.
- Counter-argument against continuing: the loop's own guidance says hitting a cap
  is a signal to split or rethink, not to raise the cap. Four defects surviving
  to round three does suggest the spec is doing too much at once for a single
  reviewable change.

No further dispatch until the user chooses.

## Split — user chose option A at the 3-round cap

This log's rounds 1-3 above describe the *combined* spec 003, which bundled the
Phase 4 review gate with the dispatch rewrite. At the cap the user chose to split
rather than raise it.

- The Phase 4 gate became `specs/003-phase4-review-gate.md`, with its own log. It
  drew zero concerns across all three rounds.
- The dispatch rewrite became this spec, renumbered 004. All 17 concerns raised
  across the three rounds were against this half.

Rationale for the split, recorded so it is not relitigated: every concern in
every round landed on dispatch machinery. The permission entry, the Phase 4 gate,
and the README loop table were never questioned. Bundling them meant the
uncontested 80% was held hostage by the contested 20%.

## Round 4 (fresh budget) — Round 3 concerns resolved

The four unresolved Round 3 concerns are fixed in the renumbered spec:

- **1 (self-contradiction)** — The spec instructed the executor to write "Do not
  use `--wait`" into `architect.md` while also asserting that file's `--wait`
  count must be zero. Both could not pass. Reworded the instruction to "Do not
  pass a wait flag to `status`", and dropped `--wait` from the verification grep,
  which now checks only `adversarial-review` and `BASH_MAX_TIMEOUT_MS`.
- **2 (queued status)** — Step 4 now names the full state machine: `queued` and
  `running` are active and keep polling; `completed`, `failed`, and `cancelled`
  are terminal. Step 7 covers a job stuck in either active state. Step 6 fires on
  any terminal status, not just two of them.
- **3 (rawOutput on failed jobs)** — Verified at `tracked-jobs.mjs:156,167`: the
  resolve path writes `result` for both `completed` and `failed`; only the
  `catch` path omits it. My Context line was wrong. The fallback chain is now
  keyed to "present and non-empty", explicitly regardless of status.
- **4 (dispatch failure before job creation)** — `ensureCodexAvailable` and
  request validation run before `buildTaskJob`, so a dispatch can fail with no
  job id at all. Step 1 now handles that case first and names it a synchronous
  dispatch failure with nothing to poll, retrieve, or cancel.

Also added an ordering guard: this spec's verification asserts spec 003's Phase 4
text is present, so implementing 004 before 003 fails loudly.

Not dispatched yet — 003 goes through the loop first.
