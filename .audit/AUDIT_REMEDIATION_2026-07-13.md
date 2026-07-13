# Audit remediation — 2026-07-13

This records the post-audit disposition. It distinguishes low-risk corrections
implemented in v48 from changes that alter storage architecture, network use,
data lifecycle, or user workflow and therefore require an explicit decision.

## Implemented without changing core behavior

- **AUDIT-005/006/032:** optional service-worker assets have a bounded install
  wait; periodic background refresh updates schedule files only; cache cleanup
  is limited to this app's cache prefix; navigations and `index.html` are not
  written into the runtime cache.
- **AUDIT-008:** expired set and location pings are redacted from API reads
  without a cleanup write. Missing remote Hexlaces visibly label retained rows
  as cached.
- **AUDIT-009/028:** request bodies are capped while streaming and unexpected
  backend exceptions return a generic 500 instead of leaking details as a 400.
- **AUDIT-013:** general conflicts require at least 15 minutes of overlap. The
  compact Now/Up next grouping keeps its separate 20-minute start window.
- **AUDIT-014:** every final-stage endpoint is explicitly inferred from the
  supplied PDF. Sunday AMP's Afternoon Saloon transcription is corrected from
  4:30 AM to 4:30 PM.
- **AUDIT-016/017/018:** schedule versions accept either quote style, day URLs
  are canonical, foreground time-boundary changes update the selected day,
  toggle styling matches `aria-pressed`, focus survives rerenders, and the full
  schedule is no longer an oversized live region.
- **AUDIT-019:** Pagoda and Village keep the official palette's hues with
  lighter accessible accents (measured contrast is 5.9:1 and 6.4:1).
- **AUDIT-020:** clearing the full set list requires confirmation. Removing one
  set, ping, or collected friend offers a brief Undo; transient removals are
  held back from Hexlace publishing during the undo window.
- **AUDIT-021 (device-only portion):** friend polling stays unchanged. A render
  signature avoids the duplicate twice-per-minute friend-list reconstruction,
  and closed friends do not construct their hidden set rows until opened;
  server reads and offline refresh behavior are not reduced.
- **AUDIT-022/023/024/025/026/030/031:** exact v48 release references are
  enforced; preview parsing is shared and strict; link IDs are validated; iPad
  desktop-mode detection and CSS fallbacks are present; claim navigations are
  not runtime-cached; copy failures are honest; QR codes are labelled; a manual
  share URL is visible; stage artwork reserves stable space.
- **AUDIT-029:** README, handoff, updating, testing, deployment, version, ping,
  schedule-source, and schedule-end-time documentation are aligned.

## Implemented after the storage-architecture decision

- **AUDIT-001/002/003/004:** a per-Hexlace Durable Object now serializes create,
  claim selection, authorization, revision compare-and-write, and updates. The
  earliest browser-recorded scan may take ownership for seven days after the
  first successful claim; ownership then locks. Atomic Durable Objects also
  replace eventually consistent KV rate-limit counters. KV remains the public
  friend/ping snapshot, and existing records migrate lazily on first mutation.
- **AUDIT-007:** new handoff tickets are strongly consistent and redemption is
  idempotent for a stable installed-client redemption ID. A dropped response can
  be retried by the same installed app, while a different consumer is rejected.
  A previously prepared ticket can be installed offline; creating or refreshing
  the ticket needs internet. Safari remains the primary iOS handoff path pending
  real-device checks of third-party browsers' cross-context cookie transfer.

Offline first-scan ordering still trusts the browser-recorded time; no server can
independently prove which disconnected phone scanned a static NFC URL first.

## Implemented after the recovery-flow decision

- **AUDIT-012:** the app requests durable browser storage when supported and
  continues to preserve retryable local changes. A compact, single-use
  connection code in My Hexlace can authorize an installed app when iOS does
  not copy the automatic handoff cookie. The handoff copies access rather than
  revoking the browser, so both contexts retain the same name, sets, collected
  friends, and ping while online. An encrypted backup/QR recovery workflow was
  intentionally rejected as too cumbersome for festival use.

## Deferred because behavior, data, or deployment would change

- **AUDIT-010:** a separate staging Worker/KV/DO environment remains deferred;
  it would add a second deployment/data environment and ongoing release steps.
- **AUDIT-011:** general create/update idempotency remains deferred. Handoff
  redemption itself is idempotent because retry safety is required there.
- **AUDIT-015:** automatic migration of saved/published sets after schedule edits
  is deferred unless a reliable official schedule feed is found. Stable source
  IDs should be used if that feed supplies them; otherwise schedule entries use
  an artist/day/start/stage-derived identity so repeat performances stay unique.
- **AUDIT-021 (network portion):** polling/backoff/lazy friend fetch changes were
  not made because friend presence and pings are a priority feature.
- **AUDIT-027:** the retention disclosure is visible. A destructive authenticated
  delete API was intentionally not added: Clear means synchronizing an empty set
  list, not deleting the Hexlace identity or its ownership.

## Verification

- 39 Node tests pass, followed by schedule validation. Durable Object tests
  cover concurrent earliest-scan claims and owner updates, the seven-day lock,
  lazy KV migration, and retry-safe handoff redemption.
- JavaScript syntax checks pass for the app, planner, Hexlaces, undo,
  schedule metadata, service worker, and Worker.
- Browser checks at 390x844 and 1280x900 found no horizontal overflow or console
  errors. They verified Sunday 4:30 PM, focus preservation, and the PDF-derived
  Living Room final endpoint at 9:30 AM.
- Pagoda/Village foreground contrast was calculated against both page and
  selected-button backgrounds and exceeds WCAG AA normal-text contrast.
- Wrangler 4.108.0 dry-run bundles both SQLite-backed Durable Object classes,
  their migration, and the existing KV binding successfully.
