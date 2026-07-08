# Developer Handoff — Shambhala 2026 Stage Schedule + Hexlaces

Everything needed to continue this project from any computer. Written 2026-07-05, current release **v30**.

## What this is

A fan-made, offline-first PWA for Shambhala 2026 in Salmo, BC. The main festival is July 24-27; this guide covers Thursday programming on July 23 and runs through the Sunday-night sets that continue into Monday morning. It is reached via NFC necklace links and QR codes. Two halves:

1. **Static site** (this repo, deployed by GitHub Pages on push to `main`): stage schedules, a personal set-list planner with overlap detection, live now/next tracking, install-to-home-screen, service-worker offline support, and an update banner.
2. **"Hexlaces" live set-list sharing**: each person's NFC tag/QR carries a permanent read-only link (`?f=<readId>`). A tiny Cloudflare Worker + KV store (source in `worker/src/index.js`, config in root `wrangler.jsonc`) hosts published set lists. A secret write key held only in the owner's localStorage publishes changes; giveaway tags add a claim token so a recipient can take ownership offline. The browser records the local scan time and the Worker gives ownership to the earliest recorded scan, even if another phone reaches the server first.

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
| `worker/src/index.js` | `wrangler deploy` from **repo root** | `curl <API>/` |

**After ANY push, health-check the API:** `curl https://shambhala-setlists.hexadecibel.workers.dev/` must return `Shambhala set-list sharing API.` — if it returns HTML, a Cloudflare git-build clobbered the worker (see Gotchas); rerun `wrangler deploy` to restore, no data is lost.

**Verify a site deploy** (Pages caches 10 min; use a cache-buster):
```bash
curl -s "https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/index.html?cb=$(date +%s)" | grep -o "<!-- v[0-9]* -->"
```

## Release discipline (IMPORTANT)

Every site release bumps ONE version number everywhere (currently 30). The pieces that must stay in sync:

- `index.html`: every `?v=NN` and the `<!-- vNN -->` body comment (the update banner compares this marker!)
- `sw.js`: `CACHE_NAME = "stage-schedule-vNN"` and every `?v=NN` in `ASSETS`
- `app.js`: `SCHEDULE_ASSET = "schedule-data.js?v=NN"` and the `sw.js?v=NN` registration
- `manifest.webmanifest`: icon `?v=NN`

The sed incantation used for bumps (adjust numbers):
```bash
sed -i 's/?v=30/?v=31/g; s/<!-- v30 -->/<!-- v31 -->/' index.html
sed -i 's/sw\.js?v=30/sw.js?v=31/; s/schedule-data\.js?v=30/schedule-data.js?v=31/' app.js
sed -i 's/stage-schedule-v30/stage-schedule-v31/; s/?v=30/?v=31/g' sw.js
```

**Schedule-only edits during the festival do NOT bump `?v=`** — edit `schedule-data.js`, change its `SCHEDULE_VERSION` string, commit. Full instructions in [UPDATING.md](UPDATING.md). Open PWAs poll every 5 min and show a "tap to refresh" banner for both schedule and app updates.

## Local testing

Serve the repo folder over localhost (any static server; a PowerShell `HttpListener` one-liner was used historically — port matters only for consistency). localhost is a secure context, so the service worker runs. Useful tricks:

- **Automated checks:** `npm test` runs the date-mapping tests plus `scripts/validate-schedule.mjs`.
- **Schedule validation:** `npm run validate:schedule` checks day/stage IDs, time format, blank artists, duplicate rows, empty stage arrays, and overnight rollover order. It intentionally does not fail on artist spelling/capitalization differences.
- **Time travel:** `?preview=2026-07-24T21:30` pins "now" (Salmo time) — drives now-playing, Today marker, planner day-collapse, up-next.
- **Seed a set list:** localStorage key `shambhala-2026-my-set-list` = array of `{day, stageId, time, artist}`.
- **Identity/collection:** `shambhala-2026-hexlace-identity` (`{readId, writeKey, name, pendingClaim?, claimScannedAt?, silentClaim?, dirty?, lastPublished?}`) and `shambhala-2026-hexlaces-collected` (array).
- The client hits the **production** API — fine (test lists auto-expire in 60 days), or run `wrangler dev` for a local worker.

## API surface (worker/src/index.js)

- `POST /lists` `{name, sets}` → `{readId, writeKey}`; with `claimable:true` → `{readId, claimToken}` (no write key stored — unwritable until claimed)
- `GET /lists/:readId` → `{name, sets, updated}`
- `PUT /lists/:readId` + header `X-Write-Key` → update (name changes ride along)
- `POST /lists/:readId/claim` `{claimToken, writeKey, scannedAt}` → registers the CLAIMER's locally-generated key when this is the earliest recorded scan; returns `{ok:true, accepted:false}` for later scans without changing ownership.
- Caps: 100 sets, 20KB, name ≤ 60 chars. TTL 60 days from last write. CORS `*`.
- Write-like endpoints have generous KV-backed rate limits: create and claim each allow 80 requests per 5 minutes per client IP; updates allow 300 requests per 5 minutes per client IP plus 180 successful updates per 5 minutes per list. Reads are not rate-limited.

## Gotchas that already bit us (read before touching)

1. **Cloudflare git-build clobber:** a dashboard git integration connected to this repo once auto-deployed the repo root as *static assets* over the API worker on push (all sharing 404'd). The root `wrangler.jsonc` exists to disarm this — any auto-build now deploys the API correctly. Don't move it back into `worker/`. Ideally disconnect the build: dash → Workers & Pages → shambhala-setlists → Settings → Build.
2. **`[hidden]` vs CSS:** author `display:` rules override the `hidden` attribute. `styles.css` has a global `[hidden]{display:none!important}` — keep it.
3. **`decodeURIComponent` throws on malformed hashes** (mis-written tags, truncated links) — always use the `safeDecode*` helpers in app.js/planner.js, never raw decode on URL parts.
4. **GitHub Pages deploys occasionally fail transiently** ("Deployment failed, try again later") — `gh run rerun <id>` fixes it. Always confirm the live version marker after pushing.
5. **CRLF warnings on commit are noise** (OneDrive/Windows working copy, LF in repo). When diffing local vs live, strip `\r`.
6. **iOS storage split:** Safari and the installed PWA have separate localStorage. Identities/collections live where they were created — do everything in the installed app.
7. **Stray "hexadecibel" worker** (a static duplicate of the site) may still exist on the Cloudflare account — safe to delete; NEVER delete `shambhala-setlists`.

## Design decisions worth knowing

- Set end times aren't published; a set's inferred end = next set on the same stage, capped at 90 min. Overlaps under 20 min aren't flagged.
- Claiming is intentionally invisible to the end user: opening a claim URL with no existing identity stores a silent local reservation. The Worker keeps the claim token metadata and lets the earliest local `scannedAt` own the Hexlace, so an accidental later tap cannot permanently steal a tag just because it had signal first.
- Publishing debounces 4s after each planner change; queued offline (`dirty` flag) and flushed on online/foreground/5-min tick. Workers Paid is enabled for write headroom; the Worker still rate-limits writes to protect against retry loops and abuse.
- All remote strings render via `textContent` — keep it that way (XSS surface is friend names/artists from the API).

## Open items / roadmap

- [ ] Disconnect the Cloudflare git build (dashboard) — or consciously keep it as worker CI
- [ ] Delete stray `hexadecibel` worker (dashboard or `wrangler delete --name hexadecibel`)
- [ ] Optional hardening: Cloudflare WAF rate-limit rule on POST/PUT if Worker-side limits are not enough; `<meta>` CSP
- [ ] Real-phone field test: NFC tap-to-collect, giveaway claim handoff, Android "Write my tag"
- [ ] Phase 2: friends' lists refreshed by periodic background sync (needs IndexedDB handoff to the SW); overlay friends' picks onto the schedule views
- [ ] Write camp pendants with each person's `?f=` link before the festival (NFC Tools app, or Android in-app button)

## Version history (condensed)

v15–16 pre-existing site → v17 SW network-timeout + schedule version stamp + update banner → v18 up-next-from-my-sets, Share button, View Transitions → v19 overlap flagging → v20 planner declutter (live now/next block, collapsible days, 20-min tolerance) → v21 Today-marker fix → v22 periodic background sync + UPDATING.md → v23 Hexlaces (worker + client) → v24 Hexlace panel declutter + `[hidden]` fix → v25 app-release detection in update banner → v26 audit fixes (crash-proof hash, offline-safe claims, 100-set cap, storage guards, ETag checks, worker hardening) → v28 morning-day consistency, collapsed inactive Hexlaces, date-mapping tests, schedule validation, and Worker-side write rate limits → v29 invisible Hexlace claim reservations with earliest-scan ownership → v30 disabled browser View Transitions after intermittent stuck snapshot overlays.
