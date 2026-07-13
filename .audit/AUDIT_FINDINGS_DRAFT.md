# Repository Audit Findings Draft

This file is the persistent evidence ledger. Finding IDs are stable and will never be reused or renumbered.

## Confirmed findings

### AUDIT-001 — Giveaway ownership arbitration is non-atomic and can select the wrong scanner

- Severity: High.
- Confidence: Confirmed.
- Category: Reliability; authorization race; remotely triggerable by holders of a valid giveaway claim URL.
- Affected files/symbols: `worker/src/index.js:246-252` and `worker/src/index.js:259-289`, especially the KV read at line 267, acceptance decision at lines 274-280, and independent `auth:` / `claim:` writes at lines 281-287; `hexlaces.js:465-503` and `hexlaces.js:685-710`; `test/worker-rate-limit.test.mjs:54-85`.
- Evidence: The Worker reads an eventually consistent KV claim record, decides whether the request wins, and then writes two independent KV keys without serialization or a transaction. Cloudflare documents that concurrent writes to a KV key can overwrite one another, reads/writes are eventually consistent across locations, and KV is not appropriate for atomic read/write decisions. A deterministic barrier harness against the actual Worker forced two claims to read the same unowned record before either write completed. Both responses were `{ok:true, accepted:true}`; the later scan (`scannedAt: 2000`) became the final credential/claim state over the earlier scan (`scannedAt: 1000`). A second normal-flow failure exists immediately after giveaway creation: another edge can transiently read the new `claim:` key as missing, the Worker returns 409, and the client treats 409 as terminal by deleting the pending identity/token after already stripping the claim URL. A third harness proved ownership can revert even after the earlier scan correctly takes over: a stale edge returned the former owner's `auth:` value to that former owner's PUT, and lines 343-344 rewrote the stale credential; the PUT returned 200 and final authorization flipped back to the later scanner. The existing tests use sequential, immediately consistent memory storage and cannot expose these failures.
- Reproduction/trigger: (1) Create a claimable list, submit two valid claim requests concurrently with different write keys and scan times, pause both KV reads before releasing either request, then inspect both responses and final `auth:` / `claim:` values. (2) After create succeeds, model delayed visibility of the new `claim:` key for the recipient's first request; observe 409 and client-side removal of the only pending claim state. (3) Let a later scan claim, then an earlier scan take over; make the old owner issue a PUT from an edge returning stale `auth:` and observe the update path renew the stale credential.
- Realistic user impact: Two festival phones reconnecting at nearly the same time can both be told they own the giveaway, while only one key ultimately controls it. The later scanner can win, the rightful owner can lose publishing access, and independent writes can leave claim metadata and authorization credentials inconsistent. Even a single intended recipient can silently lose a freshly created claim simply by redeeming from another network edge too soon. A correct earlier-scan takeover can later be undone by the former owner's ordinary background publish, causing ownership to ping-pong.
- Recommended correction: Route giveaway creation, claims, authorization checks, and owner updates for each `readId` through the same strongly consistent per-Hexlace coordination unit (for example, a Durable Object). Store claim and authorization state transactionally and never renew a credential merely because an eventual KV read returned it. As interim client defense, treat a fresh 409/missing-claim response as retryable for a bounded period and preserve the token/state rather than silently deleting it.
- Recommended verification test: Add Worker-runtime integration tests that (a) release two competing claims from a shared read barrier and assert exactly the earliest scan is accepted, (b) delay first visibility, (c) inject cross-key write failure, and (d) attempt a stale-auth PUT after takeover and prove it cannot authorize or revert ownership. Assert the client retains a fresh pending claim on transient 409.
- Current status: Confirmed; include in final report.

### AUDIT-002 — Concurrent owner updates bypass revision protection and silently lose saved-list changes

- Severity: High.
- Confidence: Confirmed.
- Category: Data integrity; reliability; remote concurrency.
- Affected files/symbols: `worker/src/index.js:317-345`, especially the revision read/check at lines 329-340 and later KV writes at lines 341-344; `hexlaces.js:322-386`, `hexlaces.js:506-515`, and `hexlaces.js:784-807`; `test/worker-rate-limit.test.mjs:146-179`.
- Evidence: Revision validation is a non-atomic KV read-then-write. A deterministic barrier harness ran two authenticated `PUT` requests with `revision: 1` after forcing both to read the same current record. Both returned HTTP 200 with `revision: 2`, but the final list contained only the second request's data. Cloudflare's current KV documentation states that reads are eventually consistent, concurrent writes overwrite, and atomic transactions are not supported. Client code has no single-flight publish guard: reconnect/foreground/interval paths can call `publish` while the four-second debounce timer remains pending, making same-device concurrency plausible and potentially producing a false conflict from the stale request snapshot. The existing test verifies only a sequential stale write after the first update is already visible.
- Reproduction/trigger: Create one list at revision 1, send two authenticated updates concurrently from separate tabs/devices with revision 1, force both KV reads to finish before either list write, release the barrier, and read the final list. Client-side, edit while offline and reconnect shortly before the pending debounce fires with the first PUT still delayed.
- Realistic user impact: Concurrent tabs, a Safari-to-installed-PWA handoff, or two owner contexts can both report a successful publish while one set of saved changes disappears. Across Cloudflare locations, a stale revision can persist long enough to make this possible even without near-simultaneous execution.
- Recommended correction: Move per-list mutation and revision compare-and-write into strongly consistent per-`readId` storage/coordination and make revision validation plus data write one atomic operation. Also serialize client publishing, cancel/merge timers, and apply responses to the latest stored identity. Preserve explicit conflict responses; do not treat debounce as concurrency control.
- Recommended verification test: Add concurrent `Promise.all` owner-update coverage in the Worker runtime asserting one success and one 409, then verify final data and revision. Add delayed client tests for reconnect-before-debounce, edits during an in-flight write, and two tabs.
- Current status: Confirmed; include in final report.

### AUDIT-003 — KV-backed rate limiting can reject legitimate bursts far below configured limits

- Severity: High.
- Confidence: Confirmed.
- Category: Core-feature reliability; abuse/cost control.
- Affected files/symbols: `worker/src/index.js:41-48`, `worker/src/index.js:82-110`, all write-like endpoint calls to `enforceRateLimit`, and the broad error conversion at `worker/src/index.js:347-348`; `test/worker-rate-limit.test.mjs:39-52`.
- Evidence: Every allowed request performs a read and then rewrites one five-minute KV bucket (`checkRateLimit`, lines 87-93). Cloudflare documents a maximum of one write per second to the same KV key; additional writes can throw 429. The application advertises 120 create/claim requests per five minutes per shared IP, yet two legitimate requests from one festival carrier-NAT IP inside one second target the same KV key. A KV model enforcing the documented platform limit produced HTTP 201 for the first create and the Worker's generic HTTP 400 error for the second at only 2/120. KV eventual consistency also makes the read/increment/write counter stale and bypassable, so the limiter is both over-restrictive for legitimate bursts and unreliable against abuse. The current memory-KV test has no platform write limit or consistency model.
- Reproduction/trigger: Model the documented one-write-per-second/same-key behavior, send two same-IP creates or claims within a second, and observe the second bucket write fail despite the configured counter being below its limit. Similar collisions affect IP update buckets and per-list update buckets.
- Realistic user impact: At a crowded festival, unrelated users behind one carrier or hotspot can see sharing, claiming, handoff, or publishing fail unpredictably during normal bursts. Failures are surfaced as request errors rather than the intended retryable rate-limit response. Attackers can still exploit stale counters to exceed intended controls and increase Worker/KV usage.
- Recommended correction: Replace the KV counter with a platform rate-limiting facility or a strongly consistent per-bucket coordinator; design shared-NAT keys and thresholds explicitly. Convert limiter-storage failure to a stable retryable response without exposing raw platform errors.
- Recommended verification test: Add a platform-faithful limiter test for two sub-second requests, concurrent increments, shared-IP traffic, and failure mapping; load-test the selected replacement at configured thresholds.
- Current status: Confirmed; include in final report.

### AUDIT-004 — Concurrent iOS handoff redemption defeats one-time-use enforcement

- Severity: Medium.
- Confidence: Confirmed.
- Category: Security; privacy; authorization replay.
- Affected files/symbols: `worker/src/index.js:205-226`, especially KV get/delete/credential reads at lines 216-226; `test/worker-rate-limit.test.mjs:250-295`.
- Evidence: Redemption reads the token mapping, deletes it, then fetches and returns the owner's write key. These are not one atomic consume operation. A deterministic barrier harness sent two redeems before either delete became authoritative; both returned HTTP 200 with the write credential. Eventual deletion visibility across KV locations creates the same risk. The existing test performs the replay only after the first sequential redemption has completed.
- Reproduction/trigger: Obtain a valid opaque handoff token, submit two redemption requests concurrently while both reads see the token mapping, then inspect both responses.
- Realistic user impact: Anyone already possessing or intercepting the 24-hour transfer token can race the intended installed PWA and obtain a second copy of the owner's write credential, despite the documented one-time guarantee. Token entropy makes opportunistic guessing impractical, limiting severity.
- Recommended correction: Consume each token through strongly consistent transactional state so only one request can transition it from unused to used before credentials are returned. Consider binding the transfer to additional context only if it does not break the iOS install flow.
- Recommended verification test: Add a concurrent redemption test asserting exactly one HTTP 200 and one HTTP 410, then exercise cross-location delayed-deletion behavior.
- Current status: Confirmed; include in final report.

### AUDIT-005 — A hanging optional asset can prevent the service worker from ever becoming offline-ready

- Severity: High.
- Confidence: Confirmed.
- Category: Offline reliability; performance under degraded networks.
- Affected files/symbols: `sw.js:3-50`, especially atomic `cache.addAll(CORE_ASSETS)` at line 47 and `Promise.all(OPTIONAL_ASSETS.map(...))` at line 48; `test/service-worker.test.mjs:43-81` and `test/service-worker.test.mjs:97-103`.
- Evidence: The install event's `waitUntil` awaits every optional `cache.add`. Rejections are caught, but a fetch promise that never settles keeps the entire install promise pending and prevents `skipWaiting`/activation. A VM test using the actual service worker with one `cache.add('./stage-names/amp.png?v=47')` promise that never resolves remained `pending-after-50ms`; all core precaching had completed. The declared precache is about 1.7 MB raw, including roughly 818 KB of optional assets. In addition, `CORE_ASSETS` treats QR, Hexlace, install, and both font files as atomic schedule requirements; rejecting only `qrcode.js` reproduced a full install rejection. The existing optional-asset test models only a prompt rejection of one stage image, not a stall or failure of a nonessential core-classified asset.
- Reproduction/trigger: Load `sw.js` in the existing VM harness, let `cache.addAll(CORE_ASSETS)` resolve, make one optional `cache.add` return a never-settling promise, dispatch `install`, and race the captured install promise against a timer. The timer wins indefinitely.
- Realistic user impact: On the exact slow/intermittent festival connection described by the product contract, a user may see the page once but never acquire an active offline service worker. When signal disappears, the core schedule can fail to reload even though all essential assets were already available. Updates can also remain stuck in the installing state.
- Recommended correction: Define a minimal functional schedule shell and keep only that set fail-closed. Runtime-cache decorative art, QR/Hexlace/install enhancements, and system-font-replaceable fonts; never make activation depend indefinitely on them. At minimum, bound each optional request with an abort/timeout and settle it independently.
- Recommended verification test: Extend the VM install harness with never-settling optional requests and individual failures of QR, Hexlace, install, and font assets; assert installation completes within the bound and the HTML/CSS/data schedule reloads offline. Add a throttled real-browser first-load/offline test.
- Current status: Confirmed; include in final report.

### AUDIT-006 — An old Android background-sync worker can cache a mixed release that fails offline

- Severity: High.
- Confidence: Confirmed.
- Category: Offline/update reliability; deployment compatibility.
- Affected files/symbols: `sw.js:1-42`, `sw.js:62-80`, `sw.js:90-100`, especially `REFRESH_ASSETS` at line 66, `refreshSchedule` at lines 68-75, and automatic same-origin cache writes at lines 92-96; `app.js:468-490` and `app.js:515-528`; `test/release-integrity.test.mjs:8-18`.
- Evidence: Each service worker owns a release-specific cache, but periodic sync refreshes every non-binary asset, including unversioned `./` / `index.html` and release-versioned JavaScript/CSS URLs. Query strings are cache keys, not immutable deployed artifacts on this static host: after v48 deploy, an old v47 worker fetching `app.js?v=47` receives current v48 bytes and stores them under the old key, while fetching `./` stores v48 HTML that requests `?v=48`. A VM cache/server simulation using the actual service worker produced a cached shell referencing `app.js?v=48`, confirmed the old app key existed, and confirmed the new app key did not. The foreground app-version probe creates the same mixed state: old app code fetches new `index.html`, and the old service worker automatically stores that response into its v47 cache before showing the banner. Offline navigation then loads HTML whose requested assets are absent. Current integrity tests check only that the checked-in release references one number; they do not simulate two releases.
- Reproduction/trigger: Install/cache v47; keep the v47 worker active; simulate deployment of v48 content; either dispatch `periodicsync` or run the foreground `checkForScheduleUpdate` probe; go offline and load the cached root or `/index.html`. Observe v48 HTML request `?v=48` assets not present in `stage-schedule-v47`.
- Realistic user impact: An installed Android PWA granted Periodic Background Sync can be silently corrupted while closed. Its next field launch can fail precisely when offline, defeating the documented schedule-refresh reliability path across a normal code release.
- Recommended correction: Restrict old-worker background refresh to release-compatible mutable data such as `schedule-data.js` (and only other explicitly compatible data files). Do not refresh HTML, service-worker code, or versioned application assets into an old cache. If background code releases are desired, stage and validate a complete new release cache atomically through the new service worker.
- Recommended verification test: Add a two-release service-worker integration test: populate a v47 cache, serve v48 bytes, run v47 periodic sync, go offline, and assert the v47 shell remains internally loadable. Separately verify schedule-only data can refresh safely.
- Current status: Confirmed; include in final report.

### AUDIT-007 — A dropped iOS handoff response permanently consumes the transfer before the PWA receives it

- Severity: High.
- Confidence: High confidence.
- Category: Data/ownership transfer reliability; iOS PWA compatibility.
- Affected files/symbols: `worker/src/index.js:205-226`, especially the transient-missing response at lines 217-218 and deletion at line 219 before credential reads/response; `hexlaces.js:17`, `hexlaces.js:222-285`; `hexlace-api.js:4-10`; `test/worker-rate-limit.test.mjs:282-295`.
- Evidence: The Worker deletes a valid transfer mapping before reading and returning the owner credentials. The client persists the identity only after the full response is received and aborts API calls after 12 seconds. If the Worker commits deletion but the response is delayed, interrupted, or lost, the PWA has no credentials; retrying the same cookie returns 410, after which the client clears it and instructs the user to install again. There is also a first-attempt failure from KV propagation: the Safari context creates a new ticket, but an immediately installed PWA on another edge can transiently read it as missing; the Worker maps that to permanent 410 and the client immediately deletes the copied cookie. Cookie creation and local identity persistence are not verified either, so blocked cookies or a failed `localStorage.setItem` can report a completed move without a recoverable installed identity. The existing sequential replay test directly proves post-consumption retry returns 410, but models immediate visibility and does not discard the first response.
- Reproduction/trigger: (1) Create a handoff, invoke redeem and allow the Worker to execute through deletion/credential lookup, discard or abort the response before the client stores it, then retry the identical token. (2) Model delayed visibility of a freshly written handoff key on the installed PWA's first redeem; observe 410 and cookie deletion even though the key becomes visible later.
- Realistic user impact: On unreliable festival connectivity, an iPhone user can permanently fail the Safari-to-Home-Screen ownership transfer during installation. This can occur before the first redemption or after a successful server consume whose response is lost. Safari's separate localStorage still holds the identity, but the already-installed PWA cannot receive it through the copied cookie; recovery can require reinstalling and repeating the flow.
- Recommended correction: Put handoff tickets in strongly consistent storage and design an idempotent or two-phase redemption protocol. A stable client redemption ID should allow the same installed context to retry and receive the identical transfer payload for a bounded period, while a different redemption ID cannot replay it. Treat not-yet-visible/transient storage states as retryable rather than permanent expiry; do not clear the only cookie on the first ambiguous failure.
- Recommended verification test: Add delayed-visibility-first-read and commit-then-drop-response tests. Retry with the same client redemption ID and assert the same identity is recovered; assert a different client ID is rejected and normal expiry still works.
- Current status: Confirmed code path; include in final report. A real iOS 17.2+ loss/retry device test remains required.

### AUDIT-008 — Shared ping/list freshness is enforced only cosmetically and can mislead or retain location history

- Severity: Medium.
- Confidence: Confirmed.
- Category: Privacy; stale-data communication.
- Affected files/symbols: `worker/src/index.js:130-149` and `worker/src/index.js:308-314`; `planner.js:189-200`; `hexlaces.js:167-173`, `hexlaces.js:506-523`, and `hexlaces.js:549-659`; documentation at `README.md:27` and `HANDOFF.md:104`.
- Evidence: The Worker accepts positive ping timeline keys without a current/festival bound and returns stored pings unchanged; client code merely stops rendering an expired ping and does not mark the owner dirty, remove it, or republish `null`. A direct Worker test created `{type:'camp',startKey:1,endKey:31}` and a later GET still returned it. Separately, when a collected list with cached sets later returns 404, `fetchEntry` marks `missing=true` but preserves the cached sets; `renderCollected` shows “expired or removed” only when there are no cached sets, so a nonempty expired list still looks usable/current.
- Reproduction/trigger: Publish a short location ping, advance beyond `endKey`, and GET the public list; then load a friend list successfully and make its next GET return 404 while cached sets remain.
- Realistic user impact: Anyone with the read link can retrieve historical camp/river/vendor or meetup data until another owner write or the 60-day list TTL, contrary to “pings expire automatically.” Friends can also plan from an expired/removed cached list without an explicit stale banner.
- Recommended correction: Validate ping times against the festival/current window, redact expired pings on GET, and schedule an owner-side null publish at expiry. Whenever `missing` is true, show a prominent expired/stale banner, suppress live ping treatment, and distinguish cached/offline data from current data.
- Recommended verification test: Assert GET returns `ping:null` after expiry; test client foreground/timer cleanup; test a 200 response with sets followed by 404 and network failure, verifying distinct stale/expired UI.
- Current status: Confirmed; include in final report.

### AUDIT-009 — The 20KB payload cap does not bound the request body before JSON parsing

- Severity: Medium.
- Confidence: Confirmed.
- Category: Remote abuse/cost; Worker resource safety.
- Affected files/symbols: `worker/src/index.js:152-175`, `worker/src/index.js:231-256`, and `worker/src/index.js:328-343`.
- Evidence: `request.json()` buffers and parses the entire body before unknown fields are discarded and the cleaned stored blob is checked against `MAX_BYTES`. A 1,048,615-byte JSON request containing a 1 MiB ignored property returned HTTP 201 and wrote a list. The public create route and broken rate limiter make repeated oversized parsing reachable.
- Reproduction/trigger: POST valid list fields plus a large ignored string property; repeat using a chunked/streamed body without a trustworthy `Content-Length`.
- Realistic user impact: Distributed callers can consume Worker memory/CPU and paid requests with bodies far larger than the documented cap, risking latency, isolate failures, or cost. The stored record remains small, hiding the abusive input from normal tests.
- Recommended correction: Require an accepted JSON content type; reject declared sizes above a small ceiling before parsing; stream/count bodies without a length and abort above the ceiling; return 413 without KV writes.
- Recommended verification test: Fixed-length and chunked oversized-body tests must return 413, avoid JSON normalization/KV writes, and preserve normal 20KB cleaned-payload behavior.
- Current status: Confirmed; include in final report.

### AUDIT-010 — Local/device testing is hardwired and documented to write to production

- Severity: Medium.
- Confidence: Confirmed.
- Category: Environment safety; privacy; abuse/cost; release process.
- Affected files/symbols: hardcoded `API_BASE` at `hexlaces.js:10`; production-only `wrangler.jsonc:7-14`; `HANDOFF.md:77`.
- Evidence: The static client always calls the production Worker. Running `wrangler dev` does not redirect it, and the handoff explicitly says production test lists are “fine.” Normal device/E2E tests therefore create production lists, claim/auth/rate keys, and possibly personal names/sets; there is no staging namespace or explicit opt-in.
- Reproduction/trigger: Serve the repository locally, start sharing or create a giveaway, and inspect the destination URL in the client source/network configuration.
- Realistic user impact: Developers can contaminate production data, consume paid quota/rate headroom, or accidentally expose test personal data. The audit itself could not safely execute end-to-end write flows under the prompt's production-data constraint.
- Recommended correction: Add explicit local/staging API configuration and a separate non-production namespace/Worker; make production writes an intentional release-only opt-in. Update `HANDOFF.md` and device tests accordingly.
- Recommended verification test: E2E tests must fail closed if a non-production build points at the production hostname; CI should verify staging and production bindings remain distinct.
- Current status: Confirmed; include in final report.

### AUDIT-011 — Create and update operations are not idempotent after a committed response is lost

- Severity: Medium.
- Confidence: High confidence.
- Category: Reliability; cost; retry semantics.
- Affected files/symbols: `worker/src/index.js:231-256` and `worker/src/index.js:329-345`; `hexlaces.js:332-379` and `hexlaces.js:441-455`; `hexlace-api.js:4-10`.
- Evidence: Every create generates fresh IDs and state, while the clients abort after 12 seconds and offer/retry without an operation key. A server-committed create whose response is lost becomes an orphan and retry creates another. For PUT, a committed response loss leaves the client at the old revision, so its retry receives a misleading 409 even when no other app changed the list.
- Reproduction/trigger: Let the Worker commit a create or update, discard the response before the client processes it, then retry the same user operation.
- Realistic user impact: Weak festival connectivity can create orphan public records/rate usage or false conflict UI; users may repeatedly create giveaways/identities without knowing which link is authoritative.
- Recommended correction: Generate stable client operation IDs and persist idempotent results/body hashes for a bounded period. The same operation retry should return the same create credentials or update result; a genuinely different body should conflict explicitly.
- Recommended verification test: Commit-then-drop-response tests for normal create, giveaway create, and PUT; assert retry returns the original result and produces no extra list/auth/claim writes.
- Current status: High-confidence code path; include in final report.

### AUDIT-012 — Irreplaceable local state has unchecked persistence failures and no recovery path

- Severity: Medium.
- Confidence: Confirmed for write-failure handling; moderate for OS eviction likelihood.
- Category: Local data integrity; storage compatibility.
- Affected files/symbols: `hexlaces.js:103-156`, `hexlaces.js:229-285`, `hexlaces.js:332-342`, `hexlaces.js:457-463`, and `hexlaces.js:685-710`; local planner storage at `planner.js:158-182`; no `navigator.storage.persist()` usage repository-wide.
- Evidence: `saveIdentity` and `saveCollected` swallow all storage exceptions and return no success signal. Callers can report success after creating a remote list but losing its only write key; `claimHexlace` returns true even if persistence failed, after which the incoming credential-bearing URL is stripped; handoff clears recovery state before verifying the installed identity was stored. Cookie writes are not read back. Separately, the planner, only write credential, and offline cache remain best-effort browser storage with no persistence request, export, or account recovery.
- Reproduction/trigger: Make `localStorage.setItem` throw or fail read-after-write; block cookies during handoff; simulate browser site-data eviction after sharing is enabled.
- Realistic user impact: A user can lose saved sets, fail an invisible claim, orphan a published list, or permanently lose the only credential able to update it while the UI reports success. Storage pressure/eviction can remove both offline shell and ownership.
- Recommended correction: Make persistence helpers return and verify success; preflight storage/cookies before irreversible remote actions; retain/recover tokens until identity is durably read back; request persistent storage after a meaningful action/installation where supported; provide an explicit encrypted/exportable recovery mechanism or clear no-recovery warning.
- Recommended verification test: Browser tests with throwing/disabled/quota-limited storage, blocked cookies, read-after-write failure, simulated eviction, and restored/reopened installed contexts.
- Current status: Confirmed handling defect; include in final report. Real low-storage iOS/Android testing remains required.

### AUDIT-013 — The documented 20-minute planner overlap tolerance is not implemented

- Severity: Medium.
- Confidence: Confirmed.
- Category: Planner usability; documentation contract.
- Affected files/symbols: `planner.js:260-290`; `README.md:20`; `HANDOFF.md:101`.
- Evidence: `findOverlaps` flags every overlap greater than zero instead of applying the documented tolerance. A schedule-data probe found 131 cross-stage inferred overlap pairs between 1 and 19 minutes; for example, Thursday FOXY MORON and PRAYER HANDZ produce a 15-minute warning.
- Reproduction/trigger: Save any two inferred sets overlapping by 1-19 minutes and open the conflict view.
- Realistic user impact: The planner produces noisy conflicts for plausible walking/changeover tolerance, reducing trust and obscuring material collisions in crowded festival use.
- Recommended correction: Implement and name the threshold explicitly, including an intentional rule for exactly 20 minutes, and keep documentation/test values synchronized.
- Recommended verification test: Unit/integration coverage at 0, 1, 19, 20, and 21 minutes plus a current schedule example.
- Current status: Confirmed; include in final report.

### AUDIT-014 — A day's final set row shows the next programming day's first set as its end

- Severity: Medium.
- Confidence: Confirmed.
- Category: Schedule accuracy; UI consistency.
- Affected files/symbols: correct day-boundary status logic at `app.js:127-139`; row rendering at `app.js:342-378`.
- Evidence: `getNowPlayingStatus` correctly returns `final` when the next timeline item belongs to a different programming day, but `renderSchedule` blindly uses `timeline[index + 1]` as the end. At `?preview=2026-07-24T02:00#amp`, Thursday's 1:00 AM LONGWALKSHORTDOCK row says `ON NOW - ENDS 5:00 PM` and uses an approximately 16-hour progress span, while the top card correctly says no end time is listed.
- Reproduction/trigger: Preview any final listed set whose next global timeline entry is on the next programming day.
- Realistic user impact: Users receive a plainly wrong end time and contradictory live status during an overnight set.
- Recommended correction: Use the next entry only when it belongs to the same programming day; otherwise show the same “no listed end time” semantics as the top card.
- Recommended verification test: Cover the final set of every stage/day transition, including stages absent on the next day.
- Current status: Confirmed; include in final report.

### AUDIT-015 — Schedule edits leave saved/published planner entries silently stale

- Severity: Medium.
- Confidence: Confirmed code path.
- Category: Schedule/data integrity; stale-data communication.
- Affected files/symbols: `planner.js:142-165`, `planner.js:267-272`, and planner rendering around `planner.js:707-748`; publishing triggers at `hexlaces.js:784-785`.
- Evidence: Saved sets are keyed by exact day/stage/time/artist. After a festival edit, unmatched items remain displayed and sorted through a fallback, but live/overlap logic drops them without a stale marker. Tapping the updated row can add a second copy. Merely receiving new schedule data does not dispatch `setlist-changed`, so a published Hexlace may continue sharing obsolete time/stage/name data.
- Reproduction/trigger: Save a set, then change its time, artist, stage, or remove it in `schedule-data.js`; reload with the old localStorage value.
- Realistic user impact: A user can confidently follow an outdated saved time while the live schedule has changed, and friends can continue receiving the stale plan—the exact failure schedule updates are meant to prevent.
- Recommended correction: Store schedule-version context, reconcile unambiguous edits, mark unresolved entries visibly stale, and require user confirmation for ambiguous migrations; mark the sharing identity dirty after reconciliation.
- Recommended verification test: Moved time, renamed artist, changed stage, removal, duplicate/ambiguous match, and friend-publication migration tests.
- Current status: Confirmed; include in final report.

### AUDIT-016 — A valid single-quoted schedule version passes validation but disables update banners

- Severity: Medium.
- Confidence: Confirmed.
- Category: Festival update operations; documentation/tooling contract.
- Affected files/symbols: source parser at `app.js:476-481`; validator at `scripts/validate-schedule.mjs:17-22`; instructions at `UPDATING.md:20-29`.
- Evidence: The validator executes `schedule-data.js` and accepts any truthy `window.SCHEDULE_VERSION`, but the update checker extracts only a double-quoted literal with `/SCHEDULE_VERSION\s*=\s*"([^"]+)"/`. Valid JavaScript such as `window.SCHEDULE_VERSION = 'new time';` passes validation yet the banner parser returns `null`. The instructions say the exact text does not matter and do not mandate double quotes.
- Reproduction/trigger: Use a single-quoted version assignment, run the schedule validator, then run the update-check extraction against that source.
- Realistic user impact: A festival-time schedule correction can deploy successfully while already-open phones never announce it, leaving stale set times in use.
- Recommended correction: Enforce the exact literal format in validation or move the version to structured JSON/metadata read without source-code regex parsing.
- Recommended verification test: Single/double quotes, escaped quotes, non-ASCII text, missing value, and changed/unchanged version cases.
- Current status: Confirmed; include in final report.

### AUDIT-017 — Foregrounding across the 10 AM programming-day boundary leaves the selected day and Today marker stale

- Severity: Medium.
- Confidence: High confidence.
- Category: Schedule/day rollover; multi-day mobile lifecycle.
- Affected files/symbols: initial selection at `app.js:142-172`; Today marker creation at `app.js:197-230`; foreground/timer paths at `app.js:420-428` and `app.js:501-514`.
- Evidence: Automatic day selection and the Today marker are computed only during initial `render()` or explicit stage/day interaction. The foreground listener and 30-second timer call `renderLiveStatus()`, which rebuilds the schedule/live card but never updates tabs or `appState.day`. A page opened on Friday therefore remains on Friday after the clock passes Saturday 10:00 AM, and its Friday button can still carry the stale Today marker while the live card uses Saturday time.
- Reproduction/trigger: Leave the app open/backgrounded from one programming day to after 10:00 AM the next calendar day, then foreground it without reloading or manually changing filters.
- Realistic user impact: On a live multi-day festival morning, users can be shown yesterday's schedule and Today marker while assuming the automatic day selection remained current.
- Recommended correction: Track whether the day selection is automatic or user-pinned. On foreground and day-boundary timer transitions, always refresh Today markers and advance only an automatic/current selection; preserve deliberate historical/future selection.
- Recommended verification test: Fake-clock lifecycle coverage for 09:59→10:00 on Friday/Saturday/Sunday/Monday, both auto-selected and manually pinned days, plus foreground after midnight before 10:00.
- Current status: High-confidence code path; include in final report.

### AUDIT-018 — Filter state and dynamic control transitions have broken visual/focus feedback

- Severity: Medium.
- Confidence: Confirmed from source.
- Category: Accessibility; keyboard/switch control; mobile usability.
- Affected files/symbols: `app.js:197-230` sets `aria-pressed`; `styles.css:81-87` styles only `aria-selected`; Hexlace editor transitions at `hexlaces.js:388-399` and `hexlaces.js:760-766`; ping picker transitions at `planner.js:795-809`.
- Evidence: Stage/day buttons expose correct pressed semantics, but the selected CSS selector never matches, so all choices look unselected. Activating a filter destroys and recreates the focused buttons. Saving/canceling the name editor hides the focused control without restoring focus; choosing a ping location hides that focused button and reveals duration controls without moving focus.
- Reproduction/trigger: Navigate by keyboard/switch control, activate a stage/day, Save/Cancel in the name editor, and choose a ping location. Inspect the selected computed styles and `document.activeElement` after each transition.
- Realistic user impact: Rushed users under glare cannot see which filter is active, while keyboard, VoiceOver, and switch-control users can lose their place and restart navigation.
- Recommended correction: Style `[aria-pressed="true"]`; update existing filter buttons rather than replacing them or restore focus to the equivalent control; explicitly move focus to the next meaningful control after editor/picker transitions.
- Recommended verification test: Browser tests for computed selected styles and focus after Enter/Space activation, Save, Cancel, location, and duration selection; repeat manually with iOS VoiceOver and Android TalkBack.
- Current status: Confirmed source mismatch; browser/AT behavior requires device validation.

### AUDIT-019 — Pagoda and Village accent text fails WCAG 2.2 AA contrast

- Severity: Medium.
- Confidence: Confirmed by relative-luminance calculation.
- Category: Accessibility; WCAG 1.4.3; sunlight readability.
- Affected files/symbols: theme colors at `styles.css:278-280`, used for small text/chips at `styles.css:86-87`, `styles.css:233`, `styles.css:241`, and `styles.css:262`.
- Evidence: Pagoda `#5a68c8` measures approximately 3.54-3.73:1 against the app backgrounds and 3.74:1 for dark text on the accent. Village `#8a6bc0` measures approximately 4.12-4.34:1 and 4.36:1 in the inverse direction. The affected text is below the large-text threshold and requires 4.5:1.
- Reproduction/trigger: Select Pagoda or Village and inspect Today, poster-day, current-time, and live subtext colors against their actual backgrounds.
- Realistic user impact: Low-vision users and anyone viewing a phone in bright sun can miss current/selected timing information.
- Recommended correction: Introduce separate accessible accent-for-text/chip tokens or adjust these accents so every text/background direction meets 4.5:1 without relying on font weight.
- Recommended verification test: Automated contrast assertions for every stage theme/state and real-device sunlight/night review.
- Current status: Confirmed; include in final report.

### AUDIT-020 — Clear erases and republishes the entire planner without confirmation or undo

- Severity: Medium.
- Confidence: Confirmed.
- Category: Destructive mobile UX; data integrity.
- Affected files/symbols: Clear beside Share at `index.html:92-95`; handler at `planner.js:816-827`; `setlist-changed` publication at `planner.js:171-182` and `hexlaces.js:322-330`, `hexlaces.js:784`.
- Evidence: One click calls `saveSets([])` immediately. That dispatches `setlist-changed`, and a sharing identity publishes the empty list after the four-second debounce. There is no confirmation, undo state, or cancellation of the remote publish.
- Reproduction/trigger: Save several sets, enable sharing, then tap Clear once.
- Realistic user impact: An accidental festival tap can erase up to 100 local choices and propagate the blank list to friends before the user recovers.
- Recommended correction: Add an accessible confirmation or short undo window that also cancels/defers publication; preserve the previous list until the destructive action commits.
- Recommended verification test: Cancel/confirm/undo, offline undo, reconnect, multiple tabs, and sharing-enabled propagation tests.
- Current status: Confirmed; include in final report.

### AUDIT-021 — Periodic full-DOM rebuilds and unbounded friend polling waste battery and may spam live regions

- Severity: Medium.
- Confidence: High for load scaling; moderate for screen-reader announcement behavior.
- Category: Performance; battery; accessibility.
- Affected files/symbols: live regions at `index.html:44-52` and `index.html:80-84`; 30-second schedule rebuild at `app.js:326-379` and `app.js:512`; friend rendering/polling at `hexlaces.js:549-680` and `hexlaces.js:803-808`.
- Evidence: The full polite schedule and atomic live card are cleared/recreated every 30 seconds even when text is unchanged. Collected friends are unbounded, all due entries fetch concurrently every five minutes, and all set rows are rebuilt every 30 seconds even inside closed `<details>`. Twenty friends yield 240 API reads/hour and, at the 100-set cap, up to 2,000 hidden rows rebuilt 120 times/hour.
- Reproduction/trigger: Seed 20 collected friends with 100 sets each, run fake timers for an hour, keep groups closed, and monitor network/DOM mutation/live-region announcements.
- Realistic user impact: Radio wakeups, weak-signal timeouts, jank, battery drain, Worker cost, and repeated VoiceOver/TalkBack announcements can materially harm all-day festival use.
- Recommended correction: Pause/back off while hidden/offline, cap/stagger concurrency, render friend rows lazily when expanded, and mutate live/status nodes only when accessible text changes. Remove `aria-live` from the entire schedule in favor of a concise result/status element.
- Recommended verification test: Fake-timer browser integration with 20 friends asserting bounded concurrency, no hidden polling/closed-detail row creation, stable focus, and no unchanged AT announcement over several minutes.
- Current status: High-confidence source finding; actual battery/CWV/AT impact requires browser/device measurement.

### AUDIT-022 — Release-integrity tests can pass a mixed asset version and omit `app.js`

- Severity: Medium.
- Confidence: Confirmed from test logic.
- Category: Deployment/release safety; test coverage.
- Affected files/symbols: `test/release-integrity.test.mjs:8-18`; release contract at `HANDOFF.md:50-62`; live marker-only validation in `.github/workflows/pages.yml` release-health job.
- Evidence: The test reads HTML, service worker, CSS, and manifest, but not `app.js`, even though `app.js` contains both the schedule asset and service-worker registration versions. It asserts only that each source contains the expected literal and bans a manually selected list of old literals; a file containing the expected version plus an unexpected newer version can pass. The deployed health check validates only the HTML marker, not referenced asset consistency.
- Reproduction/trigger: During a version bump, update the test's expected number and the files it reads but leave `app.js` at the prior version, or leave a second unexpected version reference in a source not on the ban list.
- Realistic user impact: CI and post-deploy health can be green while HTML, service-worker cache keys, schedule asset, and registration point at incompatible releases, causing stale updates or offline failure.
- Recommended correction: Parse every version-bearing file, collect every `?v=NN`, cache name, marker, registration, and icon reference, and assert the set contains exactly one expected number. Post-deploy, fetch and verify the referenced core assets/version set as well as the marker.
- Recommended verification test: Mutation tests that introduce one mismatched number into each file—including `app.js`—and assert CI fails; simulate a cache-busted live HTML plus each referenced asset.
- Current status: Confirmed; include in final report.

### AUDIT-023 — Planner preview parsing accepts impossible values rejected by the rest of the app

- Severity: Low.
- Confidence: Confirmed.
- Category: Preview/time consistency.
- Affected files/symbols: loose parser at `planner.js:109-115`; strict shared parser at `preview-time.js:1-11` used by `app.js`/Hexlaces.
- Evidence/trigger: `?preview=2026-07-99T25:99` is rejected by the main schedule but accepted by planner calculations. Reproduction showed the shared parser returned `null` while the planner regex produced an impossible date/minute value.
- Impact: Test/preview URLs can make planner live/ping state disagree with Now Playing, complicating release verification.
- Correction/test: Use `window.parseSchedulePreview` everywhere; run all malformed/out-of-window cases through every time consumer.
- Current status: Confirmed.

### AUDIT-024 — URL normalization leaves misleading days and accepts unbounded friend identifiers client-side

- Severity: Low.
- Confidence: High confidence.
- Category: NFC/URL robustness; local resource use.
- Affected files/symbols: `app.js:164-179`; `hexlaces.js:685-716` and unbounded collection at `hexlaces.js:661-680`.
- Evidence/trigger: `?day=Thursday#village` falls back to Friday in UI but remains encoded as Thursday until another interaction. Incoming `f`/`claim` values are trimmed but not checked for the Worker's fixed alphabet/length before URL scrubbing, local persistence, and repeated polling.
- Impact: Copied/back-forward URLs can misstate visible state; malicious oversized IDs can consume localStorage and create repeated failing oversized fetches.
- Correction/test: Canonicalize the resolved initial day, validate IDs/tokens before any state change, cap collected entries, and matrix-test every stage/day plus malformed/duplicate/oversized parameters.
- Current status: High-confidence source path; oversized browser URL limits vary.

### AUDIT-025 — Compatibility fallbacks miss older color engines and common iPad user agents

- Severity: Low.
- Confidence: High confidence.
- Category: Graceful degradation; install discoverability.
- Affected files/symbols: `styles.css:33` and other `color-mix()`-only declarations; iOS detection at `install.js:9-40`.
- Evidence/trigger: Browsers without `color-mix()` drop the sole body background declaration, leaving white content/art on a default white canvas. Most iPads using the desktop-class Mac user agent do not match `/iphone|ipad|ipod/`, so manual install help remains hidden.
- Impact: Older/unrequired browsers can become unreadable, and some iPad users cannot discover Add to Home Screen guidance.
- Correction/test: Declare a solid dark background before the enhanced gradient; provide platform-neutral install help or robust touch-capable iPad detection; test Safari 16.1/older Chromium and current iPad Safari.
- Current status: Confirmed fallback gap; current mainstream engines support `color-mix()`.

### AUDIT-026 — Claim credentials persist in navigation/cache/history surfaces after UI scrubbing

- Severity: Low.
- Confidence: Confirmed for Cache Storage; broader log access not tested.
- Category: Privacy; locally exploitable capability leakage.
- Affected files/symbols: navigation caching at `sw.js:90-96`; late query cleanup at `hexlaces.js:685-693`; stable giveaway format documented in `README.md:53`.
- Evidence/trigger: The service worker caches a successful same-origin navigation under its original `?f=...&claim=...` Request before body scripts call `history.replaceState`. The initial navigation/query also exists in browser/network/CDN history by construction.
- Impact: Same-origin script compromise or local profile/cache access can recover the 60-day claim token; remote exploitability is limited and external links already use `noreferrer`.
- Correction/test: Never cache claim-bearing navigation keys, or normalize the cache key before `cache.put`; set a restrictive referrer policy and document the bearer-URL exposure. Preserve stable NFC compatibility unless a planned migration justifies a breaking format change.
- Current status: Confirmed local/cache issue.

### AUDIT-027 — Sharing retention/deletion and transient IP storage are not disclosed in the UI

- Severity: Low.
- Confidence: Confirmed.
- Category: Privacy; user control.
- Affected files/symbols: Worker routes/methods at `worker/src/index.js:21-25` and through line 351; rate keys at `worker/src/index.js:82-93`; sharing UI `index.html:152-175`.
- Evidence/trigger: There is no authenticated DELETE/stop-sharing route. Clearing browser data loses the key while the name/list remains retrievable for up to 60 days. Write-like rate-limit keys contain the sanitized client IP in plaintext for ten minutes. The sharing UI does not explain either retention or deletion limitation.
- Impact: Users cannot promptly revoke a shared list after losing local credentials and may not expect transient IP processing in a nominally analytics-free app.
- Correction/test: Add authenticated deletion/local cleanup, plain public-link/retention copy, and a privacy note for abuse-control IP data; prefer a secret-salted digest for IP buckets. Test deletion of list/auth/claim/handoff state.
- Current status: Confirmed.

### AUDIT-028 — Catch-all Worker errors leak provider details and misclassify internal failures as client 400s

- Severity: Low.
- Confidence: Confirmed.
- Category: Error handling; defense in depth.
- Affected files/symbols: `worker/src/index.js:347-349`.
- Evidence/trigger: All thrown values become `400 {error:String(message)}`. The modeled KV write-limit failure exposed `Error: KV PUT failed: 429 Too Many Requests` to the caller and made a platform/limiter failure look like invalid input.
- Impact: Clients cannot choose correct retry behavior, and internal provider details can leak.
- Correction/test: Use typed validation errors for 400; map storage/rate/transient failures to sanitized 429/503/500 responses and structured server logs without tokens/keys.
- Current status: Confirmed.

### AUDIT-029 — Handoff/testing documentation is internally stale

- Severity: Low.
- Confidence: Confirmed.
- Category: Documentation; release operations.
- Affected files/symbols: `HANDOFF.md:3`, `HANDOFF.md:50`, `HANDOFF.md:118`; `TESTING.md:42-44`; current workflow `.github/workflows/pages.yml`.
- Evidence/trigger: HANDOFF opens and ends at v45 while its release section says v47. TESTING says GitHub Actions exposes three checks although the workflow defines Worker validation, tests, Worker deploy, Pages deploy, and release health. README's test summary understates the now broader suite.
- Impact: A new maintainer can misjudge the current release or treat an incomplete CI run as complete.
- Correction/test: Generate release/version/check documentation from one source or validate it in CI; update the version history and exact required job list on every release.
- Current status: Confirmed.

### AUDIT-030 — Clipboard and QR fallbacks can report inaccessible or false success

- Severity: Low.
- Confidence: Confirmed from source.
- Category: Accessibility; compatibility feedback.
- Affected files/symbols: planner fallback `planner.js:760-775`; Hexlace fallback `hexlaces.js:722-737`; QR rendering `hexlaces.js:87-93`; main QR container `index.html:155`.
- Evidence/trigger: Both fallbacks ignore the boolean result of `document.execCommand('copy')` and always announce success. The main generated QR SVG receives no title/description/accessible name and the raw owner URL is not shown, although a Share button provides an alternative.
- Impact: Permission-restricted browsers can tell users a link/list was copied when it was not, and screen-reader users receive no description for the QR itself.
- Correction/test: Check the fallback result and announce failure with manual-copy text; give QR output a meaningful accessible name and expose a selectable link. Test denied Clipboard API and `execCommand=false`.
- Current status: Confirmed.

### AUDIT-031 — Stage art has no stable reserved box and can cause a large layout shift

- Severity: Low.
- Confidence: High confidence; browser CLS not measured.
- Category: Mobile layout/performance.
- Affected files/symbols: initial image `index.html:71-78`; dynamic art `app.js:308-324`; sizing `styles.css:228-233`.
- Evidence/trigger: Art images have substantially different aspect ratios and dynamic replacements omit intrinsic width/height; at the same rendered width, measured heights differ by roughly 125 px between examples.
- Impact: Switching stages or loading art late can move the schedule enough to cause accidental taps on a crowded phone.
- Correction/test: Reserve a stable wrapper/aspect box and use `object-fit:contain`; measure CLS and tap stability at 320-430 px.
- Current status: High-confidence static finding.

### AUDIT-032 — Service-worker cleanup can delete unrelated caches on the shared Pages origin

- Severity: Low.
- Confidence: Moderate; impact depends on other PWAs under the same origin.
- Category: Cache isolation; compatibility.
- Affected files/symbols: `sw.js:53-60`.
- Evidence/trigger: Activation deletes every Cache Storage key except the current cache, not only `stage-schedule-*`. GitHub Pages projects under the same account share an origin even when service-worker scopes differ.
- Impact: If another project PWA uses Cache Storage on that origin, activating this app can erase its offline data.
- Correction/test: Delete only known `stage-schedule-` versions; seed an unrelated cache in the activation test and assert it survives.
- Current status: Conditional; retain as Low unless shared-origin usage is confirmed.

## Findings needing verification

### HYP-001 — Claimed giveaway URLs may not become ordinary collection links

After ownership locks, an identity-less friend tapping the permanent `?f=...&claim=...` URL still creates a silent claimant. An `{accepted:false}` result removes that local identity and returns without collecting the owner's list (`hexlaces.js:475-488`, `hexlaces.js:685-716`). This is a code-confirmed behavior but the product intent is ambiguous: prior direction intentionally avoided showing the winner's list to a contention loser. A real-device/product-decision test should distinguish an active contention loser from a normal post-lock tap before rating it.

### HYP-002 — iOS NFC may open Safari rather than the installed Home Screen app

HTTP(S) NFC links may route to the default browser. Safari and a Home Screen app have separate localStorage, while handoff transfers owner identity/sets/ping but not `COLLECTED_KEY`. If reproduced, a friend tapped through NFC is collected only in Safari, not the installed app. Requires current iPhone testing with the PWA installed.

### HYP-003 — A still-connected Cloudflare Git build could overwrite the verified Worker deployment

`HANDOFF.md` says a dashboard Git integration may still exist. The root config prevents the historic static-site clobber, but a second automatic deploy would not necessarily receive GitHub Actions' `BUILD_SHA` and could run after release-health succeeds. Dashboard/build-history access is needed to confirm and disconnect or explicitly coordinate it.

### HYP-004 — Long gaps may be displayed as continuous Now Playing sets

The current end model treats the next same-day stage entry as the end without a cap in the main live card (`app.js:127-136`). Friday Village 3:00-8:30 PM and Sunday Fractal 1:00-5:00 PM are examples. These may represent intentional takeovers/open programming, so verify the official source semantics before changing them.

### HYP-005 — Unlimited public reads may create avoidable paid usage

Every known read link invokes the Worker and one KV read; there is no read limiter or edge response cache. A valid link is intentionally public, so abuse is easy once a link is shared. Severity depends on Cloudflare dashboard traffic, spend controls, and expected sharing scale, none of which were available.

### HYP-006 — Post-festival fresh loads select inconsistent historical days

After Monday 10:00 AM, stages whose last set is outside the three-hour final window can fall back to their first available day (often Thursday), while stages with late Monday sets remain Sunday. This is code-derived but affects post-festival use; confirm the desired closed-festival state before rating.

### HYP-007 — Real viewport/reflow/safe-area defects may remain

The requested 320/360/375/390/430 px, landscape, 200% text, keyboard, installed-PWA safe-area, and screen-reader scenarios could not be driven because no browser runtime/device was available. Static review found plausible risks around the fixed update banner and compact 32-40 px festival controls, but they are not confirmed findings.

## Resolved false positives

- Wildcard CORS is compatible with intentionally public read links and header-held bearer write keys; it does not expose localStorage credentials by itself.
- Read IDs (~46.5 nominal bits), claim tokens (~69.7 bits), write keys (~139 bits), and handoff tokens (~279 bits) are generated with Web Crypto. Practical guessing/enumeration was not demonstrated.
- The committed KV namespace ID and account ID metadata are identifiers, not deploy credentials. No API token/secret file was found. The account email remains a minor privacy/documentation issue, not a credential leak.
- Direct client `scannedAt` trust permits a physical token holder to backdate a claim, but prior product direction explicitly accepted phone-clock manipulation to preserve offline earliest-scan semantics. It is recorded as an accepted trust assumption, not inflated into a remote vulnerability.
- Missing `nodejs_compat` is not a runtime defect for the current dependency-free Worker because it uses Web platform APIs only.
- No generic CSP finding is reported: remote strings use `textContent`, the QR generator is local, and no reachable injection path was found. A CSP remains optional defense in depth.
- No applicable published vulnerability was confirmed for the vendored, dependency-free `qrcode-generator` 1.4.4 during the advisory search; it remains outside automated dependency scanning and should retain provenance/license review.
