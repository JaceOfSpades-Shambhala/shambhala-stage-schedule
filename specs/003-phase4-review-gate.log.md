# 003 — Phase 4 stops and asks before any fix round — log

## Round 1 — plan written

Split out of the original spec 003, which bundled this change with a full rewrite
of Codex dispatch. That combined spec went three negotiation rounds and drew 17
concerns — **every one against the dispatch machinery, none against this
change.** At the 3-round cap the user chose to split rather than raise the cap.

The dispatch rewrite is now `specs/004-codex-plugin-dispatch.md`, carrying the
four unresolved Round 3 concerns and a fresh round budget. Its history lives in
`specs/004-codex-plugin-dispatch.log.md`, which is the original combined log
renamed; rounds 1–3 there refer to the combined spec.

This spec contains only the uncontested part: the Phase 4 review gate the user
chose to adopt from the plugin's `codex-result-handling` skill.

Scope is deliberately narrow — two files, one paragraph replacement each, with
exact before-and-after text given so there is nothing to infer.

Ordering matters: **003 must be implemented before 004.** Spec 004's
verification asserts `grep -c "stop and present every finding"` returns `1`,
which only holds once this spec has landed. That is intentional, and it makes an
out-of-order implementation fail loudly rather than silently.

Awaiting Phase 2 review.

## Round 1 — Codex review: CONCERNS

```
CONCERNS

1. If the user selects multiple issues, should they be combined into one `fixN` spec per review round, or should each issue receive a separate fix spec? The numbering, Phase 3 sequencing, and three-fix-round cap are ambiguous.

2. "If the user selects none, go to Phase 5" conflicts with Phase 5's existing precondition, "Once the review is clean." Should declining fixes authorize committing known bugs, failed tests, or spec deviations, or should the workflow stop without committing?

3. If the user selects only some findings, should the unselected findings be treated as permanently accepted, or presented again during the next Phase 4 review? The proposed text does not define this.

4. The verification does not check the requested `specs/README.md` wording or most of the new Phase 4 behavior. `npm test` does not cover either changed file, and the greps would still pass if the user-question, selection handling, or Phase 5 transition were implemented incorrectly.
```

These are better concerns than any raised against the dispatch spec. All four are
about semantics the gate introduces, not about machinery.

## Round 1 — resolutions

- **2 — the serious one, and my error.** Adding a gate created a state the old
  flow could not reach: a finding the user declines to fix. My text sent that
  state to Phase 5, whose precondition is "Once the review is clean" — so as
  written it authorised committing known-broken code. Resolved by separating two
  things the original text conflated: a **finding** may be accepted as-is by the
  user, but a **failing `npm test`** may not. Declining all findings now requires
  an explicit second question before any commit, and stops without committing if
  the answer is no. Phase 5's precondition changes from "Once the review is
  clean" to "Once Phase 4 authorises the commit", which is the honest
  description of the new gate.
- **1** — One fix spec per round covering every selected issue. `N` counts fix
  rounds, not issues, which keeps the 3-fix-round cap meaningful. Stated
  explicitly in the replacement text.
- **3** — A declined finding is recorded once and not raised again; new findings
  from a fix round are presented normally. Prevents the gate turning into a
  repeated prompt for something the user already dismissed.
- **4 — fair hit on my verification.** `npm test` genuinely proves nothing here,
  since neither changed file is covered by tests, and my three greps would pass
  against a half-implemented gate. Verification now greps for each distinct
  behaviour separately: numbering rule, test-suite bar, declined-finding
  handling, the new Phase 5 precondition, the absence of the old one, and the
  README wording. The `npm test` step is retained but explicitly labelled as
  only proving no collateral breakage.

Scope grew by one line (Phase 5's precondition) as a direct consequence of
concern 2. Recorded because it is a real scope change, not a drafting tweak.

Re-dispatching for Round 2.

## Round 2 — Codex review: CONCERNS

```
CONCERNS

1. Phase 4 writes `specs/NNN-slug-fixN.md` and returns to Phase 3, but Phase 3's command names `specs/NNN-slug.md`. Should the replacement explicitly require dispatching the new fix spec instead of the original spec?

2. For a partial selection, the text does not explicitly classify every unselected finding as declined and accepted-as-is. Should those findings be logged as accepted, excluded from later rounds, and treated as authorized for the eventual commit?

3. If `npm test` is failing and the user selects no findings, one instruction says to ask whether to commit anyway, while the next says Phase 5 is blocked regardless of authorization. Should the architect skip that commit question and require a fix selection, or stop with no available transition?

4. "Then stop ... and ask which issues" is unconditional, but "No findings — go to Phase 5" implies no pause. Does a clean review proceed directly to Phase 5, or must the architect still stop for user confirmation?
```

## Round 2 — resolutions

Root cause of all four: I kept writing the gate as prose, and prose leaves
combinations undefined. Rewrote the replacement text as an explicit decision
table so every combination of (suite green/red) x (no findings / partial / none
selected) has exactly one outcome.

- **3 — a flat contradiction, mine.** With a red suite and nothing selected, my
  text both asked whether to commit anyway and declared Phase 5 blocked
  regardless. The question had no valid answer. Resolved by making the red-suite
  case the first branch and terminal: present findings, require a selection
  covering the failure, or stop. The commit question is never offered, because
  there is no commit to authorise.
- **1 — pre-existing gap my change made load-bearing.** Phase 3's dispatch names
  `specs/NNN-slug.md`, so a fix round would have re-dispatched the original spec.
  Fixed inside the Phase 4 text — "dispatching that fix spec in place of
  `specs/NNN-slug.md`" — deliberately *not* by editing Phase 3, which belongs to
  spec 004. Editing it here would collide with 004. Out of scope now says so
  explicitly.
- **2** — Every unselected finding is now explicitly declined: recorded as
  accepted-as-is, treated as authorised for the commit, and not raised again.
  Covers partial selection, which my previous text only handled for the
  select-none case.
- **4** — A clean review now goes to Phase 5 "without asking anything". The
  stop-and-ask applies only when findings exist, which removes the pointless
  confirmation prompt on a clean run.

Verification restructured to one grep per branch of the table — ten that must
return 1, two that must return 0 — so a partially-implemented gate cannot pass.

Round 3 of 3. If this does not converge, the loop requires escalating to the user
rather than weakening the spec.

## Round 3 — dispatched 13:57:52 — WEDGED, killed and retried

First Round 3 dispatch wedged at startup. Evidence:

- Dispatch output stopped at 48 bytes: the timestamp and
  `Reading additional input from stdin...`, with no banner, no model line, and
  no session id.
- **No session rollout was ever created.** Newest rollout at the time of the
  check was `13-52-22`, which belongs to Round 2. Round 2's rollout appeared
  within seconds of its dispatch; Round 3's never appeared at all.
- Process alive but idle for ~7 minutes (13:57:52 to 14:05).

This is the documented startup wedge, and the rollout-absence signal
distinguished it cleanly from a slow run. Note the contrast with the Round 2
false positive logged in `004-codex-plugin-dispatch.log.md`: there, a rollout
existed and the time-window `find` missed it. Here no rollout exists at all. The
presence-or-absence signal is reliable; the time-window form of it is not.

Killed via `ps -W` column 4 (WINPID 36200) and `taskkill //PID 36200 //F`.
Confirmed no Codex CLI process remained. Retrying once, as the procedure allows.

## Round 3 — root cause found: the wedge was self-inflicted

Both Round 3 dispatches wedged identically at 48 bytes. The retry wedging the
same way is what made it diagnosable — a random startup hang would not reproduce
exactly.

Correlation across every dispatch this session:

| Dispatch | Shape | Result |
|---|---|---|
| 004 rounds 1-3 | standalone `codex exec` | worked |
| 003 rounds 1-2 | standalone `codex exec` | worked |
| 003 round 3 | heredoc `cat >> log` + dispatch, one Bash call | wedged |
| 003 round 3 retry | same shape | wedged |

Five standalone, zero wedges. Two heredoc-combined, two wedges.

Mechanism: `codex exec` prints `Reading additional input from stdin...` on every
run, successful ones included — it appends piped stdin to the prompt when stdin
is not a TTY. In a plain background job stdin hits EOF immediately and it
proceeds. When the Bash call also contains a heredoc, the shell is reading the
script from stdin; the heredoc consumes from that stream and `codex exec`
inherits a stdin that never reaches EOF, so it blocks forever.

Verified: re-dispatched standalone with `< /dev/null`, identical spec and prompt.
Banner and session id `019fdd68-af6d-7cc3-9b1c-638b2ad31173` appeared within
seconds.

**Cause was my own command construction, not Codex.** I batched the log-append
and the dispatch into one Bash call to save a round trip, and that is what hung
it. Two wedges and roughly fifteen minutes, self-inflicted.

Corrections to the record this forces:

- The claim in `004-codex-plugin-dispatch.log.md` that these wedges are evidence
  for the companion runtime is **overstated**. This particular failure was mine.
  The Round 2 false positive logged there is still a genuine flaw in the
  time-window liveness check, and stands.
- `.claude/agents/architect.md` describes a 39-minute wedge on spec 002 as
  inherent Codex flakiness. That may have had the same cause. It is not
  established either way, and the file should not keep asserting a cause that has
  not been verified.

Rule going forward, to be encoded in spec 004: **never combine a heredoc with a
dispatch in the same Bash call, and always redirect stdin from `/dev/null`.**
This applies equally to the companion runtime, which is invoked the same way.

Retry count note: this third attempt is not a third retry of the same operation.
The first two were a broken invocation; this is the corrected one. Recorded
explicitly so the "retry once" rule is not quietly eroded.

## Round 3 — Codex review: CONCERNS (2) — cap reached

```
CONCERNS

1. In the red-suite branch, what happens after the user selects findings that cover the failure? The fix-spec and Phase 3 transition are defined only under "Otherwise, with the suite green," leaving red suite + valid selection without an outcome.

2. In the green-suite, findings-exist, none-selected branch, what happens if the user answers yes to "commit anyway"? The no outcome is explicit, but the yes outcome should explicitly authorize Phase 5.
```

Both are dangling transitions, not disagreements. My decision table defined the
red-suite entry condition but not its exit, and defined the "no" answer but not
the "yes".

## Round 3 — resolutions (applied, not yet re-reviewed)

- **1** — Hoisted the selection rule out of the green-only branch into a shared
  rule: "Whenever the user selects one or more issues, red suite or green".
  Red-suite-plus-selection now lands there instead of nowhere.
- **2** — "ask explicitly whether to commit anyway. If yes, go to Phase 5. If no,
  stop without committing."

Two verification greps added for the new strings.

Concern trend across the three rounds: 4 -> 4 -> 2, with no round disputing the
design and no round failing to find something real.

## Status: CAP REACHED, escalated to user

Three negotiation rounds is the cap. Per the loop the architect must not force
approval by weakening the spec, and must hand the decision to the user. Fixes are
applied but no fourth review has been dispatched.

Assessment for the user, stated fairly:

- There is no disagreement to arbitrate. Codex has never objected to the design
  of this change, only found undefined states.
- Every round found something real, which is evidence the reviewer is productive
  rather than thrashing.
- Against continuing: a ~40-line documentation change needing four rounds
  suggests the bottleneck is my spec drafting, not the size of the change.
  Splitting further is not available; this spec is already minimal.
- Risk of implementing without a fourth review is low but not zero: the target
  files are markdown, not executable code, and Phase 4 carries twelve
  verification greps that would catch a partial implementation.

## Round 4 — Codex review: APPROVED

Dispatched 14:31-ish, session 019fdd80-674c-7002-ab5e-79d09860a29a. Standalone
invocation with `< /dev/null`; session banner appeared within seconds, no wedge.

Verdict: `APPROVED` (8 bytes, first line only).

Concern trend across the negotiation: 4 -> 4 -> 2 -> 0. The user authorised the
fourth round after the cap; it converged.

Proceeding to Phase 3 implementation.

## Phase 3 — implementation report

Session 019fdd84-9689-74d2-8097-c51ed3a7e81f. Codex implemented both files, then
**paused and asked** rather than guessing, per AGENTS.md. It reported a spec
contradiction: the prescribed replacement text wraps `do not raise` /
`it again in later rounds` across two lines, while the prescribed verification
uses a line-based `grep` for the whole phrase, which therefore returns 0.

It offered two options and declined to choose. That is the process working
exactly as intended.

## Phase 4 — architect verification (independent)

Did not rely on Codex's summary.

- `git status --porcelain` — exactly two tracked files modified,
  `.claude/agents/architect.md` and `specs/README.md`. Nothing outside the
  declared file list. Untracked spec artifacts untouched.
- `git diff` — read every changed line. The replacement text matches the spec
  **verbatim**, including the line wrap in question. Phase 5's precondition line
  changed correctly. No refactoring, reformatting, or added scope.
- `npm test` — run by the architect: **148/148 pass**, 0 fail, plus
  `Schedule validation passed.`
- Spec verification battery: **11 of 12 required greps return 1; both forbidden
  greps return 0.**

Single failure:

```
grep -c "do not raise it again in later rounds" .claude/agents/architect.md  ->  0
```

## Phase 4 — finding

**Finding 1 — low severity. Author error, not an implementation defect.**

The implemented text is correct and matches the spec exactly. The spec is
self-contradictory: it demands verbatim text in which the phrase wraps, and also
a line-based grep that can only match it unwrapped. Both cannot hold.

This is the **second** occurrence of this exact error class in this session. The
first was the `--wait` contradiction Codex caught in round 3 of the dispatch spec
(see `004-codex-plugin-dispatch.log.md`). Recorded as a pattern in the
architect's spec drafting, not as a one-off: prescribing verbatim prose and
line-based greps over the same text needs the wrap points checked deliberately.

Resolution options put to the user per the gate. No fix round started.

## Fix round 1 — user selected Finding 1

User chose to fix rather than accept. Wrote `specs/003-phase4-review-gate-fix1.md`.

Scope is whitespace-only: rewrap one sentence so the phrase sits on a single
line, in both `.claude/agents/architect.md` and the prescribed replacement block
inside `specs/003-phase4-review-gate.md`. Spec 003 is updated alongside the file
deliberately — it is not yet committed, and leaving a spec that prescribes text
differing from what shipped would be a landmine for anyone reading it later.

The fix spec's strongest check is `git diff --ignore-all-space`, which must
produce **empty output**. That proves no word changed, which a grep alone cannot.

Dispatching fix1 to Phase 3, per the gate: the fix spec is dispatched in place of
the original spec.

## Fix round 1 — Phase 4 verification

**Implementation is correct.** Proven, not asserted:

- Extracted the Phase 4 region from the current file and compared it to the
  post-003 text word-by-word with all whitespace collapsed: **260 words on both
  sides, identical.** fix1 changed no word, only line wrapping.
- All twelve of spec 003's checks now hold: eleven `must be 1` return 1
  (including the previously failing `do not raise it again in later rounds`),
  and both `must be 0` return 0.
- `npm test` run by the architect: **148/148 pass**, plus
  `Schedule validation passed.`

**Two of fix1's own verification expectations were wrong. Both mine.**

- `grep -c "do not raise it again in later rounds" specs/003-phase4-review-gate.md`
  expected `1`, actual `2`. Correct answer is 2: line 78 is the prescribed text,
  line 168 is the Verification section's own grep command, which necessarily
  contains the phrase it searches for.
- `git diff --stat` was specified to show `specs/README.md` unchanged "by this
  fix round". It diffs against HEAD, which includes spec 003's legitimate README
  change, so it can never show that. The same mistake sank the
  `--ignore-all-space` check, which compares to HEAD rather than to the pre-fix
  state and was therefore guaranteed non-empty.

Neither is an implementation defect. Both are defects in checks I wrote.

## Pattern worth naming

Four verification-authoring errors in this session:

1. `--wait` — spec demanded text containing a string while asserting that
   string's count was 0 (caught by Codex, dispatch spec round 3)
2. the line-wrap grep — verbatim text wrapped a phrase a line-based grep had to
   match (caught by Codex during implementation)
3. `--ignore-all-space` against HEAD — conflated "changed by this round" with
   "changed versus committed state"
4. the `README` and spec-occurrence counts above — same conflation, plus not
   counting the verification line itself

Two distinct root causes: prescribing verbatim prose and line-based greps over
the same text without checking wrap points, and diffing against HEAD when the
question is what a single round changed.

Also recorded: one of my checks printed "EMPTY — whitespace-only confirmed" when
the underlying git command had failed, because the error went to stderr and the
empty-stdout test passed. A check that reports success when it fails to run is
worse than no check.

Findings against the deliverable: **none.** Proceeding to Phase 5.
