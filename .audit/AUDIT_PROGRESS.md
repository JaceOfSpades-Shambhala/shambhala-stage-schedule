# Repository Audit Progress

## 1. Audit status

- Current phase: Audit complete; findings reconciled and final report ready for delivery.
- Last completed action: Re-ran the full test suite (27/27 pass plus schedule validation), verified the final working-tree state, and reconciled all findings/hypotheses/false positives.
- Next exact action: None for the audit. If remediation is authorized later, start with AUDIT-001/002/003 Worker state design and AUDIT-005/006 offline cache design without modifying stable NFC URL formats.
- Latest checkpoint: 2026-07-10T16:16:45-04:00.

## 2. Repository state

- Repository: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Branch: `codex/apply-b67e055`
- Commit SHA: `1770f1ea00b9d86df77366b835d09999204177b9`
- Initial working tree clean: No.
- Audit target: The current working tree, including the pre-existing application changes listed below, atop the recorded commit.
- Pre-existing modified files: `.github/workflows/pages.yml`, `HANDOFF.md`, `README.md`, `app.js`, `hexlaces.js`, `index.html`, `manifest.webmanifest`, `styles.css`, `sw.js`, `test/release-integrity.test.mjs`, `test/service-worker.test.mjs`, `test/worker-rate-limit.test.mjs`, `worker/src/index.js`.
- Pre-existing untracked files: `hexlace-giveaway.js`, `test/hexlace-giveaway.test.mjs`.
- Changes produced by the audit: `.audit/AUDIT_PROGRESS.md`, `.audit/AUDIT_FINDINGS_DRAFT.md`, and `.audit/AUDIT_COMMAND_LOG.md` only.
- Environment: Windows PowerShell 5.1.26100.8655; Git 2.55.0.windows.2; Node v24.18.0; npm 11.16.0.
- Important constraint: Pre-existing user changes must not be discarded, overwritten, staged, or committed.
- Final working-tree verification: All pre-existing application modifications/untracked files remain; the audit added only `.audit/`. Nothing was staged, committed, pushed, deployed, or written to production KV.

## 3. Completed areas

- Read the complete audit prompt.
- Located the real nested Git checkout.
- Recorded the initial branch, commit, working-tree state, and environment versions.
- Loaded the applicable Cloudflare Worker, browser-testing, and web-performance audit guidance.
- Inventoried the complete repository outside `.git`, `node_modules`, and `.audit`.
- Read `package.json`, the Pages/Worker GitHub Actions workflow, `wrangler.jsonc`, `README.md`, `HANDOFF.md`, `UPDATING.md`, `TESTING.md`, and `manifest.webmanifest`.
- Ran `npm test`: 27/27 tests passed and schedule validation passed.
- Ran the standalone schedule validator: passed.
- Ran `node --check` on all 22 JavaScript/module files: passed.
- Ran `git diff --check`: passed, with expected Windows LF-to-CRLF warnings only.
- Verified the globally installed Wrangler reports version 4.108.0; its default log location is blocked by the filesystem sandbox, so subsequent Wrangler checks must redirect logs and run in scratch space.
- Completed an approved isolated Wrangler 4.108.0 dry-run in a disposable scratch copy: pass, 14.75 KiB bundle / 4.18 KiB gzip, `LISTS` binding resolved, no deployment.
- Reviewed every application/configuration/test/document file; inspected vendored QR provenance and asset dimensions/weights.
- Exercised deterministic Worker concurrency/consistency harnesses against the actual Worker module: claim race, stale-auth reversal, revision race, handoff replay, documented KV write-rate behavior, stale pings, and oversized request bodies.
- Exercised service-worker VM scenarios: rejected/hanging precache assets and old-worker/new-release cache mixing.
- Reviewed schedule/day/time/preview boundaries, stable NFC hashes, URL sizes, local storage, update/version behavior, privacy surfaces, deployment workflow, compatibility, accessibility, performance, and test gaps.
- Verified all seven stable stage hashes and measured personal/giveaway URLs at approximately 77/96 UTF-8 bytes.
- Completed static WCAG/UI review, contrast calculations, asset/precache inventory, static ID/reference checks, and feature-degradation review.
- Checked public deployment read-only: Pages returned HTTP 200, `max-age=600`, ETag, and live marker v46; Worker root returned 200, while `/health` returned 404 because the current v47 working tree is not the deployed revision.
- Checked the official 2026 festival web source: the official site directs set-time users to the mobile app and does not expose a machine-comparable stage-time source, so transcription accuracy remains externally unverified.
- Re-ran `npm.cmd test` at finalization: 27 passed, 0 failed, schedule validation passed.

## 4. Partially completed areas

- No repository area remains unaudited at source level.
- Browser/device-only execution remains unavailable: real iOS/Android NFC, installed-PWA lifecycle, VoiceOver/TalkBack, viewport/reflow, safe areas, storage eviction, and measured CWV/battery behavior require hardware/browser follow-up.
- Official artist/time transcription could not be independently compared because the current official source is app-only/not machine-readable from this environment.

## 5. Audit-area completion

| Audit section | Status | Notes |
|---|---|---|
| 1. Establish the architecture | Completed | Static PWA, client state, service worker, Worker/KV, trust boundaries, and release flow mapped. |
| 2. Run all available checks | Completed | Tests/validator/syntax/diff/Wrangler dry-run passed; browser/hardware checks recorded as blocked. |
| 3. Schedule and time logic | Completed | Source/tests/boundaries reviewed; official transcription comparison blocked. |
| 4. NFC and URL routing | Completed | Seven hashes, query handling, malformed routes, and tag lengths reviewed; device NFC blocked. |
| 5. Offline-first behaviour | Completed | Install/runtime/update/cache/periodic-sync logic and VM edge cases reviewed. |
| 6. Local storage and data integrity | Completed | Corruption/quota/eviction/concurrency/reconciliation paths reviewed. |
| 7. Hexlaces and Cloudflare Worker | Completed | All endpoints/config/auth/claims/handoff/rate/TTL/error paths reviewed and adversarially exercised. |
| 8. Privacy | Completed | Local/remote/URL/IP/ping/retention/third-party data mapped. |
| 9. UI and user experience | Completed | Source/static review complete; requested interactive viewport checks blocked. |
| 10. Accessibility | Completed | WCAG-oriented source/contrast/semantic review complete; AT/device automation blocked. |
| 11. Performance and battery | Completed | Asset/timer/network/DOM analysis complete; trace/CWV/battery measurement blocked. |
| 12. Compatibility | Completed | Feature detection/fallbacks/iOS/Android/browser degradation reviewed; devices blocked. |
| 13. Deployment and release safety | Completed | CI/docs/config/versioning/live public revisions and dry-run reviewed. |
| 14. Code quality and maintainability | Completed | Modules/globals/error handling/parsing/vendor/config reviewed. |
| 15. Test coverage | Completed | Existing tests mapped and prioritized gaps documented. |

## 6. Confirmed findings index

| Finding ID | Title | Severity | Confidence | Affected files | Draft heading |
|---|---|---|---|---|---|
| AUDIT-001 | Giveaway ownership arbitration is non-atomic and can select the wrong scanner | High | Confirmed | `worker/src/index.js`, `test/worker-rate-limit.test.mjs` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-001--giveaway-ownership-arbitration-is-non-atomic-and-can-select-the-wrong-scanner` |
| AUDIT-002 | Concurrent owner updates bypass revision protection and silently lose saved-list changes | High | Confirmed | `worker/src/index.js`, `test/worker-rate-limit.test.mjs` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-002--concurrent-owner-updates-bypass-revision-protection-and-silently-lose-saved-list-changes` |
| AUDIT-003 | KV-backed rate limiting can reject legitimate bursts far below configured limits | High | Confirmed | `worker/src/index.js`, `test/worker-rate-limit.test.mjs` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-003--kv-backed-rate-limiting-can-reject-legitimate-bursts-far-below-configured-limits` |
| AUDIT-004 | Concurrent iOS handoff redemption defeats one-time-use enforcement | Medium | Confirmed | `worker/src/index.js`, `test/worker-rate-limit.test.mjs` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-004--concurrent-ios-handoff-redemption-defeats-one-time-use-enforcement` |
| AUDIT-005 | A hanging optional asset can prevent the service worker from ever becoming offline-ready | High | Confirmed | `sw.js`, `test/service-worker.test.mjs` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-005--a-hanging-optional-asset-can-prevent-the-service-worker-from-ever-becoming-offline-ready` |
| AUDIT-006 | An old Android background-sync worker can cache a mixed release that fails offline | High | Confirmed | `sw.js`, `app.js`, `test/release-integrity.test.mjs` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-006--an-old-android-background-sync-worker-can-cache-a-mixed-release-that-fails-offline` |
| AUDIT-007 | A dropped iOS handoff response permanently consumes the transfer before the PWA receives it | High | High confidence | `worker/src/index.js`, `hexlaces.js`, `hexlace-api.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-007--a-dropped-ios-handoff-response-permanently-consumes-the-transfer-before-the-pwa-receives-it` |
| AUDIT-008 | Shared ping/list freshness is enforced only cosmetically and can mislead or retain location history | Medium | Confirmed | `worker/src/index.js`, `planner.js`, `hexlaces.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-008--shared-pinglist-freshness-is-enforced-only-cosmetically-and-can-mislead-or-retain-location-history` |
| AUDIT-009 | The 20KB payload cap does not bound the request body before JSON parsing | Medium | Confirmed | `worker/src/index.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-009--the-20kb-payload-cap-does-not-bound-the-request-body-before-json-parsing` |
| AUDIT-010 | Local/device testing is hardwired and documented to write to production | Medium | Confirmed | `hexlaces.js`, `wrangler.jsonc`, `HANDOFF.md` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-010--localdevice-testing-is-hardwired-and-documented-to-write-to-production` |
| AUDIT-011 | Create and update operations are not idempotent after a committed response is lost | Medium | High confidence | Worker/client request paths | `AUDIT_FINDINGS_DRAFT.md#AUDIT-011--create-and-update-operations-are-not-idempotent-after-a-committed-response-is-lost` |
| AUDIT-012 | Irreplaceable local state has unchecked persistence failures and no recovery path | Medium | Confirmed/Moderate | `hexlaces.js`, `planner.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-012--irreplaceable-local-state-has-unchecked-persistence-failures-and-no-recovery-path` |
| AUDIT-013 | The documented 20-minute planner overlap tolerance is not implemented | Medium | Confirmed | `planner.js`, docs | `AUDIT_FINDINGS_DRAFT.md#AUDIT-013--the-documented-20-minute-planner-overlap-tolerance-is-not-implemented` |
| AUDIT-014 | A day's final set row shows the next programming day's first set as its end | Medium | Confirmed | `app.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-014--a-days-final-set-row-shows-the-next-programming-days-first-set-as-its-end` |
| AUDIT-015 | Schedule edits leave saved/published planner entries silently stale | Medium | Confirmed | `planner.js`, `hexlaces.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-015--schedule-edits-leave-savedpublished-planner-entries-silently-stale` |
| AUDIT-016 | A valid single-quoted schedule version passes validation but disables update banners | Medium | Confirmed | `app.js`, validator, docs | `AUDIT_FINDINGS_DRAFT.md#AUDIT-016--a-valid-single-quoted-schedule-version-passes-validation-but-disables-update-banners` |
| AUDIT-017 | Foregrounding across the 10 AM programming-day boundary leaves the selected day and Today marker stale | Medium | High confidence | `app.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-017--foregrounding-across-the-10-am-programming-day-boundary-leaves-the-selected-day-and-today-marker-stale` |
| AUDIT-018 | Filter state and dynamic control transitions have broken visual/focus feedback | Medium | Confirmed | `app.js`, `styles.css`, `hexlaces.js`, `planner.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-018--filter-state-and-dynamic-control-transitions-have-broken-visualfocus-feedback` |
| AUDIT-019 | Pagoda and Village accent text fails WCAG 2.2 AA contrast | Medium | Confirmed | `styles.css` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-019--pagoda-and-village-accent-text-fails-wcag-22-aa-contrast` |
| AUDIT-020 | Clear erases and republishes the entire planner without confirmation or undo | Medium | Confirmed | `index.html`, `planner.js`, `hexlaces.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-020--clear-erases-and-republishes-the-entire-planner-without-confirmation-or-undo` |
| AUDIT-021 | Periodic full-DOM rebuilds and unbounded friend polling waste battery and may spam live regions | Medium | High/Moderate | `index.html`, `app.js`, `hexlaces.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-021--periodic-full-dom-rebuilds-and-unbounded-friend-polling-waste-battery-and-may-spam-live-regions` |
| AUDIT-022 | Release-integrity tests can pass a mixed asset version and omit `app.js` | Medium | Confirmed | release test/workflow/docs | `AUDIT_FINDINGS_DRAFT.md#AUDIT-022--release-integrity-tests-can-pass-a-mixed-asset-version-and-omit-appjs` |
| AUDIT-023 | Planner preview parsing accepts impossible values rejected by the rest of the app | Low | Confirmed | `planner.js`, `preview-time.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-023--planner-preview-parsing-accepts-impossible-values-rejected-by-the-rest-of-the-app` |
| AUDIT-024 | URL normalization leaves misleading days and accepts unbounded friend identifiers client-side | Low | High confidence | `app.js`, `hexlaces.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-024--url-normalization-leaves-misleading-days-and-accepts-unbounded-friend-identifiers-client-side` |
| AUDIT-025 | Compatibility fallbacks miss older color engines and common iPad user agents | Low | High confidence | `styles.css`, `install.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-025--compatibility-fallbacks-miss-older-color-engines-and-common-ipad-user-agents` |
| AUDIT-026 | Claim credentials persist in navigation/cache/history surfaces after UI scrubbing | Low | Confirmed | `sw.js`, `hexlaces.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-026--claim-credentials-persist-in-navigationcachehistory-surfaces-after-ui-scrubbing` |
| AUDIT-027 | Sharing retention/deletion and transient IP storage are not disclosed in the UI | Low | Confirmed | Worker/UI | `AUDIT_FINDINGS_DRAFT.md#AUDIT-027--sharing-retentiondeletion-and-transient-ip-storage-are-not-disclosed-in-the-ui` |
| AUDIT-028 | Catch-all Worker errors leak provider details and misclassify internal failures as client 400s | Low | Confirmed | `worker/src/index.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-028--catch-all-worker-errors-leak-provider-details-and-misclassify-internal-failures-as-client-400s` |
| AUDIT-029 | Handoff/testing documentation is internally stale | Low | Confirmed | docs/workflow | `AUDIT_FINDINGS_DRAFT.md#AUDIT-029--handofftesting-documentation-is-internally-stale` |
| AUDIT-030 | Clipboard and QR fallbacks can report inaccessible or false success | Low | Confirmed | `planner.js`, `hexlaces.js`, `index.html` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-030--clipboard-and-qr-fallbacks-can-report-inaccessible-or-false-success` |
| AUDIT-031 | Stage art has no stable reserved box and can cause a large layout shift | Low | High confidence | `index.html`, `app.js`, `styles.css` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-031--stage-art-has-no-stable-reserved-box-and-can-cause-a-large-layout-shift` |
| AUDIT-032 | Service-worker cleanup can delete unrelated caches on the shared Pages origin | Low | Moderate/Conditional | `sw.js` | `AUDIT_FINDINGS_DRAFT.md#AUDIT-032--service-worker-cleanup-can-delete-unrelated-caches-on-the-shared-pages-origin` |

## 7. Open hypotheses

- Claimed giveaway URLs may fail to become ordinary post-lock collection links; product intent must distinguish contention losers from normal later friends.
- iOS NFC HTTP links may open Safari rather than the installed PWA, splitting collected friends across storage contexts.
- A still-connected Cloudflare dashboard Git build may race/overwrite the GitHub Actions deployment and its `BUILD_SHA`.
- Long same-day stage gaps may represent intentional programming or an incorrect continuous Now Playing model.
- Unlimited public reads may matter for paid usage; dashboard traffic/spend controls were unavailable.
- Post-festival fresh loads can select inconsistent historical days; desired closed-festival behavior is unspecified.
- Real viewport/reflow/safe-area issues may remain because no controllable browser/device was available.

## 8. Blocked or unavailable checks

- Direct `npm --version` through PowerShell resolved to `npm.ps1` and was blocked by the machine execution policy. `npm.cmd --version` worked and will be used for npm commands; this is an environment limitation, not an application finding.
- Wrangler 4.108.0 tried to write its diagnostic log under `C:\Users\Jace\AppData\Roaming\xdg.config\.wrangler\logs`, which this sandbox cannot modify. Redirect Wrangler logging to an audit scratch directory for the dry-run.
- Chrome DevTools performance tools were not configured; the in-app browser runtime reported no available browser. Lighthouse/CWV/axe/screenshots and interactive viewport checks could not run.
- No physical iOS/Android device was available for NFC, installed-PWA handoff, periodic sync, VoiceOver/TalkBack, storage eviction, or native share/clipboard testing.
- Production KV/user data was intentionally not accessed or mutated. Runtime semantics were tested with deterministic local harnesses grounded in current Cloudflare documentation.
- Cloudflare dashboard state, branch protection, account spend controls, deployment history, and the possible second Git integration were unavailable.
- The current official 2026 stage-time source is app-only/not machine-comparable from the public web page, so artist/time transcription accuracy was not independently proven.
- Public deployment is v46 and `/health` is absent; the audited v47 working tree is not live, so live checks do not validate the current code.

## 9. Resume instructions

1. The audit is complete. Read the original prompt and all three files in `.audit/` before relying on the checkpoint.
2. Verify `git rev-parse HEAD` still equals `1770f1ea00b9d86df77366b835d09999204177b9` and compare application-file status with the initial state above.
3. If the commit/working tree changed, revisit only affected findings and dependencies; do not restart unchanged sections.
4. If remediation is requested, address High findings first with tests before code, keep stable NFC hashes/personal URL formats, and preserve invisible claim UX.
5. Do not stage/commit/push `.audit/` unless explicitly instructed.
