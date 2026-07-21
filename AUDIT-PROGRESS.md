# Correctness audit — shared-state race bugs (working notes)

**Status: IN PROGRESS.** This file is the resumability anchor for this audit.
If this session gets interrupted (usage-window cutoff, rate limit,
compaction), a fresh session should:

1. `git log --oneline` on this branch to see exactly which commits already
   landed.
2. Read this file top to bottom — the Findings Ledger below is the source
   of truth for what's confirmed, fixed, or still open.
3. Resume from the first `[ ]` item. Don't re-run research that already
   produced a report captured below — re-verify against current code
   instead, since earlier fixes on this branch may have changed line
   numbers.
4. Delete this file (fold its content into the final PR description)
   before the PR is opened, unless still mid-audit.

This file is scratch/working-notes, not shipped product documentation —
remove it from the tree once the PR is up.

## Task

Full correctness audit of this repo for the bug class behind the v73 fix:
two independent flows silently sharing mutable state (a localStorage key,
an event, a debounce timer) under an unenforced single-writer/single-cause
assumption. See the original ask for the full 9-point bug-class checklist
and the "coverage requirement" (every user-facing feature + the Worker).
Deliverable: severity-ranked findings list; fix high-confidence/low-risk
ones with real behavioral regression tests; flag ambiguous/architectural
ones for the user instead of guessing; one release-version bump at the end
if any fix touches a cached client asset; PR opened, not merged.

Branch: `claude/unclaimed-hexlaces-removal-bug-sc7fgl` (restarted from
`main` at `6a701a1` — the prior PR #5 for this branch, the v73 fix, is
already merged into main; this is fresh follow-up work on the same branch
name per harness convention, not a continuation of that diff).

## Research agents dispatched

Tracking which background research passes have been launched and whether
their reports have been incorporated into the Findings Ledger yet, so a
resumed session doesn't duplicate work or silently skip a pass whose
report arrived after a cutoff.

| # | Scope | Status | Report incorporated? |
|---|---|---|---|
| 1 | Cross-file map: every addEventListener/dispatchEvent, localStorage key, setTimeout/setInterval/clearTimeout across all client *.js | dispatched | no |
| 2 | Deep audit: hexlaces.js + undo.js + install.js | dispatched | no |
| 3 | Deep audit: worker/src/durable-objects.js + worker/src/index.js | dispatched | no |
| 4 | Deep audit: planner.js, hex-owl.js, hexadex.js, camp-access.js, app.js, sw.js version-skew | dispatched | no |

(If a resumed session finds a "dispatched" row with no incorporated report
and no corresponding notes below, treat that pass as lost and re-run it —
background agent results don't survive a session boundary on their own.)

## Findings Ledger

Legend: Severity = High/Medium/Low user impact. Confidence = Confirmed
(traced or reproduced) / Suspected (plausible, not yet traced). Status =
open / fixing / fixed+tested / flagged-for-user / rejected (with reason).

_Empty until research passes report back and are triaged._

| # | Area | File:Line | Severity | Confidence | Status | Summary |
|---|---|---|---|---|---|---|

## Fixes landed on this branch

_Commit SHA — one-line description — which Findings Ledger # it closes._

## Open questions for the user

_Anything architecturally significant or a judgment call, not a guessable
bug fix._

## Final steps not yet done

- [ ] All findings triaged
- [ ] All fix-now findings fixed + tested
- [ ] `npm test` green
- [ ] Release version bumped (if needed) per HANDOFF.md release discipline
- [ ] This file removed / folded into PR description
- [ ] PR opened (not merged)
