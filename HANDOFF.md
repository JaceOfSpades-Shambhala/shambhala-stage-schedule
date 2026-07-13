# Developer Handoff — Shambhala 2026 Stage Schedule + Hexlaces

Everything needed to continue this project from any computer. Written 2026-07-05, current release **v48**.

## What this is

A fan-made, offline-first PWA for Shambhala 2026 in Salmo, BC. The main festival is July 24-27; this guide covers Thursday programming on July 23 and runs through the Sunday-night sets that continue into Monday morning. It is reached via NFC necklace links and QR codes. Two halves:

1. **Static site** (this repo, deployed by GitHub Pages on push to `main`): stage schedules, a personal set-list planner with overlap detection, live now/next tracking, install-to-home-screen, service-worker offline support, and an update banner.
2. **"Hexlaces" live set-list sharing**: each person's NFC tag/QR carries a permanent read-only link (`?f=<readId>`). A Cloudflare Worker uses per-Hexlace Durable Objects for ownership/mutations and KV for public friend-list snapshots (source in `worker/src`, config in root `wrangler.jsonc`). A secret write key held only in the owner's localStorage publishes changes; giveaway tags add a claim token so a recipient can take ownership offline. The browser records the local scan time and the Worker gives ownership to the earliest recorded scan, even if another phone reaches the server first.

**Live site:** https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/
**API:** https://shambhala-setlists.hexadecibel.workers.dev (Cloudflare account: jsj715@gmail.com, worker `shambhala-setlists`, KV namespace `LISTS` = `61bdc52caedc49c0acefbd5ae92cb5fe`)

## New machine setup

```bash
# 1. Tooling
winget install Git.Git GitHub.cli OpenJS.NodeJS.LTS   # (or brew/apt equivalents)
npm install -g wrangler

# 2. Auth (one-time, interactive browser logins — no tokens to copy around)
gh auth login          # GitHub: JaceOfSpades-Shambhala
wrangler login         # Cloudflare: jsj715@gmail.com

# 3. Code
gh repo clone JaceOfSpades-Shambhala/shambhala-stage-schedule
```

On Windows/PowerShell, if scripts are blocked: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## The two deploy pipelines

| What changed | How it ships | Verify |
|---|---|---|
| Site files (html/js/css) | `git push` → GitHub Pages workflow (~1 min) | see below |
| `worker/src/index.js` | GitHub Actions deploys on `main` | `curl <API>/health` returns this commit SHA |

**After ANY push, health-check the API:** `curl https://shambhala-setlists.hexadecibel.workers.dev/` must return `Shambhala set-list sharing API.` — if it returns HTML, a Cloudflare git-build clobbered the worker (see Gotchas); rerun `wrangler deploy` to restore, no data is lost.

**CI prerequisite:** add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Scope the token only to deploy this Worker in that account; never commit either value. GitHub Actions deploys with `BUILD_SHA=$GITHUB_SHA` and checks `/health` after the Pages release.

**Verify a site deploy** (Pages caches 10 min; use a cache-buster):
```bash
curl -s "https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/index.html?cb=$(date +%s)" | grep -o "<!-- v[0-9]* -->"
```

## Release discipline (IMPORTANT)

Every site release bumps ONE version number everywhere (v48 at the time of writing). The pieces that must stay in sync:

- `index.html`: every `?v=NN` and the `<!-- vNN -->` body comment (the update banner compares this marker!)
- `sw.js`: `CACHE_NAME = "stage-schedule-vNN"` and every `?v=NN` in `ASSETS`
- `app.js`: `SCHEDULE_ASSET = "schedule-metadata.js?v=NN"` and the `sw.js?v=NN` registration
- `manifest.webmanifest`: icon `?v=NN`

The sed incantation used for bumps (adjust numbers):
```bash
sed -i 's/?v=47/?v=48/g; s/<!-- v47 -->/<!-- v48 -->/' index.html
sed -i 's/sw\.js?v=47/sw.js?v=48/; s/schedule-metadata\.js?v=47/schedule-metadata.js?v=48/' app.js
sed -i 's/stage-schedule-v47/stage-schedule-v48/; s/?v=47/?v=48/g' sw.js
```

**Schedule-only edits during the festival do NOT bump `?v=`** — edit `schedule-data.js` and/or `schedule-metadata.js`, change the metadata `SCHEDULE_VERSION` string, and commit. Full instructions are in [UPDATING.md](UPDATING.md). Open PWAs poll every 5 min and show a "tap to refresh" banner for both schedule and app updates.

## Local testing

Serve the repo folder over localhost (any static server; a PowerShell `HttpListener` one-liner was used historically — port matters only for consistency). localhost is a secure context, so the service worker runs. Useful tricks:

- **Automated checks:** `npm test` runs all Node tests, enforces the exact current release version across deploy assets and these current-version references, then runs `scripts/validate-schedule.mjs`.
- **Schedule validation:** `npm run validate:schedule` checks day/stage IDs, time format, blank artists, duplicate rows, empty stage arrays, overnight rollover order, source metadata, every final-set endpoint, and the corrected Sunday AMP afternoon time. It intentionally does not fail on artist spelling/capitalization differences.
- **Time travel:** `?preview=2026-07-24T21:30` pins "now" (Salmo time) — drives now-playing, the Today marker, and planner up-next.
- Planner day groups remain collapsed by default; preview mode does not expand them.
- **Seed a set list:** localStorage key `shambhala-2026-my-set-list` = array of `{day, stageId, time, artist}`.
- **Seed a ping:** localStorage key `shambhala-2026-ping` = `{type:"camp"|"river"|"vendors", startKey, endKey}` or `{type:"set", day, stageId, time, artist, startKey, endKey}`. Keys are Salmo-local timeline minutes (`date serial * 1440 + minutes`).
- **Identity/collection:** `shambhala-2026-hexlace-identity` (`{readId, writeKey, name, pendingClaim?, claimScannedAt?, silentClaim?, dirty?, lastPublished?}`) and `shambhala-2026-hexlaces-collected` (array).
- The client hits the **production** API — fine (test lists auto-expire in 60 days), or run `wrangler dev` for a local worker.

## API surface (worker/src/index.js)

- `POST /lists` `{name, sets, ping}` → `{readId, writeKey}`; with `claimable:true` → `{readId, claimToken}` (no write key stored — unwritable until claimed)
- `GET /lists/:readId` → `{name, sets, ping, updated}`; expired pings are returned as `null` without a KV cleanup write
- `PUT /lists/:readId` + header `X-Write-Key` → update (name changes ride along)
- `POST /lists/:readId/claim` `{claimToken, writeKey, scannedAt}` → registers the CLAIMER's locally-generated key when this is the earliest recorded scan; returns `{ok:true, accepted:false}` for later scans without changing ownership. A per-Hexlace Durable Object serializes claims and honours earlier-scan takeovers for **seven days after the first successful claim**; after that, ownership locks permanently.
- `POST /lists/:readId/handoff` + header `X-Write-Key` → creates an opaque transfer ticket with a 24-hour TTL; `POST /handoffs/redeem` accepts a stable `redemptionId` and returns the existing identity, saved sets, and ping. Retrying the same ticket/redemption ID after a dropped response returns the same identity, while a different redemption ID is rejected.
- `POST /lists/:readId/connect-code` + header `X-Write-Key` → creates a copy/paste-friendly 24-hour fallback code. It uses the same retry-safe redemption path and copies ownership; it does not rotate the write key or revoke the browser.
- `GET /lists/:readId/owner` + header `X-Write-Key` → returns private owner state for browser/PWA synchronization, including collected-friend ids. Ordinary public `GET /lists/:readId` responses never expose those ids.
- Caps: 100 sets, 20KB, name ≤ 60 chars. TTL 60 days from last write. CORS `*`.
- Write-like endpoints have Durable Object-backed atomic rate limits sized for shared festival NAT: create and claim each allow 120 requests per 5 minutes per client IP; updates allow 450 requests per 5 minutes per client IP plus 180 successful updates per 5 minutes per list (per-list, so NAT-independent). Reads are not rate-limited.
- Durable Objects are authoritative for creation, ownership, revision compare-and-write, updates, handoffs, and rate limits. KV remains the public read snapshot used by friend and ping polling. Existing KV-only records migrate lazily on the first coordinated mutation, without a bulk migration or visible user step.

## Gotchas that already bit us (read before touching)

1. **Cloudflare git-build clobber:** a dashboard git integration connected to this repo once auto-deployed the repo root as *static assets* over the API worker on push (all sharing 404'd). The root `wrangler.jsonc` exists to disarm this — any auto-build now deploys the API correctly. Don't move it back into `worker/`. Ideally disconnect the build: dash → Workers & Pages → shambhala-setlists → Settings → Build.
2. **`[hidden]` vs CSS:** author `display:` rules override the `hidden` attribute. `styles.css` has a global `[hidden]{display:none!important}` — keep it.
3. **`decodeURIComponent` throws on malformed hashes** (mis-written tags, truncated links) — always use the `safeDecode*` helpers in app.js/planner.js, never raw decode on URL parts.
4. **GitHub Pages deploys occasionally fail transiently** ("Deployment failed, try again later") — `gh run rerun <id>` fixes it. Always confirm the live version marker after pushing.
5. **CRLF warnings on commit are noise** (OneDrive/Windows working copy, LF in repo). When diffing local vs live, strip `\r`.
6. **iOS storage split:** the browser and installed PWA have separate localStorage. `hexlaces.js` uses a 24-hour cookie handoff to copy the owner identity, saved sets, ping, and collected-friend ids into a newly installed app. If iOS does not copy the cookie, My Hexlace can issue a 24-hour connection code for manual entry in the Home Screen app. Neither path revokes the browser. Both contexts pull authenticated owner state every two minutes while active/online; friend ids are private and cached friend details are fetched from their public Hexlaces. Creating or redeeming a transfer needs internet. Safari is the primary supported handoff path; third-party iOS browsers still require real-device checks.
7. **Stray "hexadecibel" worker** (a static duplicate of the site) may still exist on the Cloudflare account — safe to delete; NEVER delete `shambhala-setlists`.

## Design decisions worth knowing

- A set's working end is the next set on the same stage, capped at 90 minutes in the planner. Final-set endpoints are inferred from the printed PDF bars and recorded in `schedule-metadata.js`. General conflicts require at least 15 minutes of overlap; the compact "Now / Up next" grouping uses the intentional 20-minute start window.
- Claiming is intentionally invisible to the end user: opening a claim URL with no existing identity stores a silent local reservation. The Worker keeps the claim token metadata and lets the earliest local `scannedAt` own the Hexlace, so an accidental later tap cannot steal a tag just because it had signal first. Earlier-scan takeovers close seven days after the first claim, locking ownership.
- Publishing debounces 4s after each planner change; queued offline (`dirty` flag) and flushed on online/foreground/5-min tick. Workers Paid is enabled for write headroom; the Worker still rate-limits writes to protect against retry loops and abuse.
- Pings are passive and notification-free. Camp, river, and vendors pings last 30/60/90 minutes; set pings reference a saved set, change copy as its start approaches, and expire at the next same-day set on that stage (or the PDF-derived final endpoint). Only one ping is stored per person. Expired location and set pings may remain in the TTL-bound KV record until its next owner update, but API reads now redact them, so friends do not see stale pings and no cleanup write is required.
- All remote strings render via `textContent` — keep it that way (XSS surface is friend names/artists from the API).

## Open items / roadmap

- [ ] Disconnect the Cloudflare git build (dashboard) — or consciously keep it as worker CI
- [ ] Delete stray `hexadecibel` worker (dashboard or `wrangler delete --name hexadecibel`)
- [ ] Optional hardening: Cloudflare WAF rate-limit rule on POST/PUT if Worker-side limits are not enough; `<meta>` CSP
- [ ] Real-phone field test: NFC tap-to-collect, giveaway claim handoff, Android "Write my tag"
- [ ] Phase 2: friends' lists refreshed by periodic background sync (needs IndexedDB handoff to the SW); overlay friends' picks onto the schedule views
- [ ] Write camp pendants with each person's `?f=` link before the festival (NFC Tools app, or Android in-app button)

## Version history (condensed)

Latest: v48 adds copy-only browser/PWA Hexlace connection codes and private cross-context synchronization while retaining the audit-safe schedule, undo, accessibility, offline caching, and Worker fixes documented above.

v15–16 pre-existing site → v17 SW network-timeout + schedule version stamp + update banner → v18 up-next-from-my-sets, Share button, View Transitions → v19 overlap flagging → v20 planner declutter (live now/next block, collapsible days, 20-min tolerance) → v21 Today-marker fix → v22 periodic background sync + UPDATING.md → v23 Hexlaces (worker + client) → v24 Hexlace panel declutter + `[hidden]` fix → v25 app-release detection in update banner → v26 audit fixes (crash-proof hash, offline-safe claims, 100-set cap, storage guards, ETag checks, worker hardening) → v28 morning-day consistency, collapsed inactive Hexlaces, date-mapping tests, schedule validation, and Worker-side write rate limits → v29 invisible Hexlace claim reservations with earliest-scan ownership → v30 disabled browser View Transitions after intermittent stuck snapshot overlays → v31 cleaner live-status copy and collapsed Hexlace/planner sections by default → v32 fixed Friend's sets panel and changed schedule markers into a time-progress rail → v33 masked timeline markers to remove rail artifacts → v34 switched to segmented timeline rails without marker rings.
