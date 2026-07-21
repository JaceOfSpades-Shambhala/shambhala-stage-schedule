# Correctness audit — shared-state race bugs (working notes)

**Status: IN PROGRESS — all 4 research passes complete, triaging + fixing.**
This file is the resumability anchor for this audit. If this session gets
interrupted, a fresh session should:

1. `git log --oneline` on this branch to see exactly which commits already
   landed.
2. Read this file top to bottom — the Findings Ledger is the source of
   truth for what's confirmed, fixed, or still open.
3. Resume from the first `[ ]` item in "Final steps not yet done".
4. Delete this file (fold its content into the final PR description)
   before the PR is opened.

## Task

Full correctness audit for the bug class behind the v73 fix: two
independent flows silently sharing mutable state (localStorage key, event,
debounce timer, or — as it turned out — a server-side idempotency cache
key with no expiry) under an unenforced single-writer/single-cause
assumption. Deliverable: severity-ranked findings; fix high-confidence/
low-risk ones with real behavioral regression tests where feasible (this
codebase has zero test dependencies and hexlaces.js is an unexported IIFE
— see "Test strategy" below for how that constraint is being handled);
flag ambiguous/architectural ones for the user; one release-version bump
at the end if any fix touches a cached client asset; PR opened, not
merged.

Branch: `claude/unclaimed-hexlaces-removal-bug-sc7fgl` (restarted from
`main` — the v73 fix is already merged; this is fresh follow-up work).

## Research agents — all 4 complete and incorporated

| # | Scope | Status |
|---|---|---|
| 1 | Cross-file map: events/localStorage/timers | done, incorporated |
| 2 | Deep audit: hexlaces.js + undo.js + install.js | done, incorporated |
| 3 | Deep audit: worker/src (durable-objects.js + index.js) | done, incorporated |
| 4 | Deep audit: planner/hex-owl/hexadex/camp-access/app.js + sw.js version-skew | done, incorporated |

Full raw agent reports are NOT preserved anywhere durable (background
agent transcripts don't survive a session boundary) — the Findings Ledger
below is the complete distilled record. If something here is unclear to a
resuming session, re-verify against current code directly rather than
trying to recover the original agent output.

## Findings Ledger

Severity: Critical (data/ownership corruption) / High (silent data loss) /
Medium (confusing but recoverable) / Low (cosmetic). Confidence: Confirmed
(traced personally, not just by an agent) / Agent-confirmed (agent traced
it, I haven't independently re-verified the exact code yet) / Suspected.

| # | Area | File:Line | Severity | Confidence | Status |
|---|---|---|---|---|---|
| 1 | `pullOwnerState` overwrites fresh local sets/ping/friends with stale pre-fetch server snapshot if a local edit lands during its GET (same root cause as the v63/v73 bug, in a sibling function) | hexlaces.js:844-896 | High | Confirmed (independently found by 3 separate passes + my own trace) | dirty-recheck fixed; friends-union + deleted-identity refinement in progress |
| 2 | `syncFriendCollection`'s existing v73 dirty-recheck doesn't catch the identity being deleted (released) mid-fetch, only `dirty` | hexlaces.js:898-943 | Medium | Confirmed | fix in progress |
| 3 | `publish()` success path can resurrect a just-released identity if its PUT resolves after `releaseHexlace()` already cleared `IDENTITY_KEY` — permanent "Needs attention" state, no in-app recovery | hexlaces.js:623-674ish (exact lines TBD, reading now) | High | Agent-confirmed, verifying now | not started |
| 4 | `publish()` has no re-entrancy guard; when two concurrent publishes race, the loser's 409-conflict branch unconditionally `saveIdentity()`s its own stale copy over whatever the winner already correctly saved, producing a spurious recurring "changed in another app" prompt | hexlaces.js:623-674ish | Medium | Agent-confirmed, verifying now | not started |
| 5 | Hexadex tap-collection queue (`syncPending`) snapshots `PENDING_KEY` once, then unconditionally overwrites it at the end — a concurrently-queued tap from a second physical scan gets silently dropped if its own submit later fails | hexadex.js:442-482 | Medium-High (real data loss: a collected Owl can vanish permanently) | Agent-confirmed, not yet independently verified | not started |
| 6 | **[Worker, CRITICAL]** Trade idempotency cache key (`appliedTrades[tradeId]`) is derived only from the two tag IDs with no expiry/nonce. A second, later, legitimate trade between the same two physical tags replays the FIRST trade's stale cached result — permanently locking the current rightful owner of the coordinator tag out (write key silently reverted to a stale/orphaned one), while the target side keeps a tag its owner believed was just traded away | worker/src/durable-objects.js: startTrade ~458, settleTrade ~523-572, applyTrade ~574-603 | Critical | Confirmed (I traced it myself against the live code) | fix designed (per-attempt nonce), implementing |
| 7 | Camp-access revoke: `saveTraits`/`loadTraits` don't inspect `result.status` the way `refresh()` does, so a mid-session revoke shows misleading "check your signal" copy and leaves a non-functional admin editor open (server still correctly rejects the write — not a security issue) | camp-access.js:513-561 | Low-Medium (UX only) | Agent-confirmed | flagged, not fixing this pass |
| 8 | Trait-editor preview can silently discard an unsaved in-progress selection if the signature it's gated on changes while open | camp-access.js:406-418 | Low-Medium | Suspected | flagged, not fixing (design judgment call) |
| 9 | `undo.js` is a single global slot — a second `showUndo()` (any feature) silently cancels an earlier action's undo window before it expires | undo.js:29-36 | Low (not data-destructive; underlying action already committed either way) | Agent-confirmed | flagged, not fixing (design judgment call — multi-slot undo is a feature change) |
| 10 | Fail-closed mutex pattern (`preparingHandoff` etc.) misreports "you're offline" on a double-tap; `install.js` hint visibility can end up wrong after a double-tap on the install/handoff button | hexlaces.js:386, install.js:24-45 | Low (self-recovers on next tap) | Agent-confirmed | flagged, low priority |
| 11 | `self.clients.claim()` call in `activate` not wrapped in `event.waitUntil` | sw.js:68-75 | Low (no observed symptom) | Suspected | flagged, low priority, trivial to fix if time permits |
| 12 | **[Worker]** 3 of 4 Owl-write paths (`claim`, `update`, `initialize`) skip `normalizeOwl()` unlike `assignOwl()` — currently unreachable via the live API surface (every caller pre-normalizes via `cleanOwl` before it gets this far) but a latent defense-in-depth gap | worker/src/durable-objects.js: ~289, ~334, ~637-643 | Low (dormant) | Agent-confirmed | consider cheap consistency fix |
| 13 | **[Worker]** KV-only fallback paths (rate limit, claim, legacy handoff) are unguarded read-then-write; dormant because `wrangler.jsonc` always binds the Durable Objects that gate these branches | worker/src/index.js: ~322-326, ~874-896, ~622-634 | Would be Critical if live; dormant today | Agent-confirmed | note only, not fixing (no live path to test against) |
| 14 | **[Worker]** `RateLimitCoordinator.alarm()` bypasses its own class's serialization queue, unlike every other DO's `alarm()` | worker/src/durable-objects.js: ~1270-1273 | Low | Suspected (platform-level gating may already prevent it) | note only |
| 15 | Dead code: `recordTradeTap()` (hexlaces.js) has no call sites; `camp-access-changed` event is dispatched but has zero listeners anywhere | hexlaces.js:1030 area; camp-access.js:110,122 | n/a (code health, not correctness) | Confirmed via grep | note only, out of scope |
| 16 | Release-versioning (bug-class item 9): every `?v=` reference in the repo IS covered by release-integrity tests; `REFRESH_ASSETS`' static `?v=NN` is provably inert (freshness is content-based via `SCHEDULE_VERSION`, confirmed network-first); no update/reload race found | sw.js, app.js, test/release-integrity.test.mjs | n/a | Agent-confirmed, spot-checked | **audited clean, no action needed** |

## Test strategy for hexlaces.js fixes

hexlaces.js is a bare `(() => {...})()` IIFE with no exports, reading
`document.querySelector` at load time; the repo has zero npm dependencies
(no jsdom etc.) and every existing hexlaces.js test is a source-regex/
source-index-of check (weak — confirmed by reading test/hexlace-name-save.test.mjs
and test/hexlace-scan-collection.test.mjs). To actually execute the race
(not just pattern-match the fix's shape), building a minimal hand-rolled
DOM/localStorage/fetch shim in a shared test helper, then dynamically
`import()`-ing hexlaces.js against it and driving the race through real
public surface (localStorage + window events + a mocked fetch with
controlled resolution order) — this is real behavioral execution of the
actual shipped code, not a reimplementation. Building this once and
reusing it for all hexlaces.js-related fixes in this audit.

## Fixes landed on this branch

_Commit SHA — one-line description — which Findings Ledger # it closes._
(none committed yet this pass — pullOwnerState dirty-check is in the
working tree, uncommitted, pending the friends-union refinement before
committing as one coherent change)

## Open questions for the user

- **Finding 6 (trade replay corruption) + Finding 15 (dead trade UI):**
  the client-side trade UI appears to have no reachable entry point in
  the current `index.html` (per HANDOFF.md's own v70 changelog: "the
  standalone Owl card and user-facing trade flow are removed"), but the
  Worker's `/trade/*` endpoints are still live, undocumented-as-deprecated,
  and reachable directly (not gated by UI presence). Fixing the
  underlying idempotency-key bug is safe and strictly an improvement
  regardless of the feature's future, so it's being fixed either way —
  but whether the trade feature should be fully removed from the Worker,
  restored to the UI, or left as reachable-but-unadvertised is a product
  decision for the user, not something to guess at.
- **Finding 9 (undo single-slot) and Finding 8 (trait preview discard):**
  both are legitimate UX judgment calls, not obviously-correct bug fixes
  — flagged rather than changed.

## Final steps not yet done

- [ ] Finish Finding 1 refinement (friends-union + deleted-identity check) and commit
- [ ] Finding 2 (syncFriendCollection deleted-identity check) and commit
- [ ] Finding 3 (publish success path deleted-identity check) + regression test
- [ ] Finding 4 (publish conflict-branch stale-overwrite) — design minimal fix or flag
- [ ] Finding 5 (Hexadex syncPending drop) + regression test
- [ ] Finding 6 (Worker trade replay) — implement per-attempt nonce fix
- [ ] Finding 12 (Worker normalizeOwl consistency) — cheap fix if time permits
- [ ] Finding 11 (sw.js waitUntil) — trivial fix if time permits
- [ ] All fixes tested, `npm test` green
- [ ] Release version bumped (client-side fixes touch cached hexlaces.js/hexadex.js — needs a bump; Worker-only fixes don't)
- [ ] This file removed / folded into PR description
- [ ] PR opened (not merged), including the open questions above
