# Shambhala 2026 NFC Stage Schedule

A static, phone-friendly, offline-first schedule site for seven Shambhala stage necklaces. Each NFC tag opens its matching stage from a short URL hash. The core schedule site has no build step, accounts, or analytics; the optional **Hexlaces** live set-list sharing feature is backed by a single tiny Cloudflare Worker + KV store (source in `worker/`).

Live site:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/
```

The authoritative deployed version is the `<!-- vNN -->` comment at the top of `<body>` in `index.html` (v29 at the time of writing). Release history and full developer docs live in [HANDOFF.md](HANDOFF.md); festival-time schedule editing is documented in [UPDATING.md](UPDATING.md).

## Current features

Schedule and planning:

- Stage and day filtering across seven stages, with automatic current-day selection and a Today marker (calendar-accurate, independent of stage)
- Global artist search across all stages and days
- Stage-specific Now Playing card using Salmo, BC time, with up-next and starts-in timing, current-set highlight, and early-morning rollover (a Friday-list 2:00 AM set counts as Saturday morning but stays in Friday's schedule)
- My Set List planner (phone-local): tap-to-add, collapsible day groups (current day open by default), a live "Now / Up next from your sets" block, overlap flagging between saved sets (inferred set lengths, 20-minute tolerance), Share button (native share sheet with clipboard fallback), 100-set cap
- Smooth stage/day transitions (View Transitions API, progressive)

Hexlaces (live set-list sharing):

- Every sharer gets a permanent read-only link (`?f=<id>`) carried on their NFC tag and shown as an always-visible QR; opening it collects their live list into a "Hexlaces Collected" panel that auto-refreshes (open/foreground/every 5 min) and stays readable offline
- Editable display name; publishing is automatic and debounced, queued while offline
- Giveaway tags with claim tokens: opening one quietly records the local scan time, works offline, and lets the earliest scan own the Hexlace once signal returns
- Android can write tags in-app (Web NFC); iOS writes tags once with the NFC Tools app

Infrastructure:

- Offline browsing after first online load (network-first service worker with a 3.5 s slow-network fallback to cache)
- "Update available — tap to refresh" banner for both schedule edits and app releases (checked every 5 min via ETag revalidation)
- Periodic Background Sync on installed Android PWAs refreshes the schedule while the app is closed
- Add to Home Screen button, pendant-based app icons, Open Graph preview metadata

## Stable NFC URLs

Do not change these stage hash IDs unless the NFC tags are being rewritten.

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#amp
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#fractal-forest
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#grove
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#living-room
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#pagoda
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#secret-garden
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#village
```

Personal Hexlace tags use `?f=<readId>` (plus `&claim=<token>` on unclaimed giveaway tags). All URLs fit comfortably on NTAG213 tags.

## Files

- `index.html` — page structure and the authoritative `<!-- vNN -->` release marker
- `styles.css` — mobile-first styling (note the global `[hidden]` rule; keep it)
- `schedule-data.js` — schedule data (`window.SCHEDULE_DATA`) and the `SCHEDULE_VERSION` stamp that drives the update banner
- `scripts/validate-schedule.mjs` — schedule safety check for day/stage IDs, time format, duplicate rows, empty stage arrays, and overnight rollover order
- `app.js` — tabs, search, Now Playing, preview mode, update checks, service-worker registration
- `planner.js` — My Set List planner, overlap detection, day grouping
- `hexlaces.js` — live sharing: identity, publishing, collecting, claims
- `qrcode.js` — vendored qrcode-generator 1.4.4 (pinned)
- `install.js` — Add to Home Screen behavior
- `sw.js` — service worker (offline cache, network timeout, periodic background sync)
- `camp-location.js` — easy-to-edit camp coordinates for the header Google Maps link
- `manifest.webmanifest`, icons — installable app metadata
- `worker/src/index.js` + root `wrangler.jsonc` — the Hexlaces API (Cloudflare Worker + KV). The config intentionally lives at the repo root; see HANDOFF.md “Gotchas”
- `UPDATING.md` — how to push schedule changes during the festival
- `HANDOFF.md` — full developer handoff: setup, deploy pipelines, release discipline, API reference, gotchas, roadmap

## Updating camp coordinates from a phone

Edit only `camp-location.js` in GitHub:

```js
window.CAMP_LOCATION = {
  latitude: "49.123456",
  longitude: "-117.123456",
  googleMapsUrl: ""
};
```

If `googleMapsUrl` is filled in, it wins over latitude/longitude. After committing, open the site once while online so phones cache the new file.

## Testing Now Playing before the festival

Use the `preview` parameter to pretend the festival-local time is the value in the URL:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/?preview=2026-07-24T23:30#amp
```

Expected: Friday auto-selected, `PEEKABOO` now playing, `RUSKO` up next, PEEKABOO row highlighted.

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/?preview=2026-07-24T21:45#pagoda
```

Expected: `JUSTIN MARTIN` now playing.

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/?preview=2026-07-23T10:00#amp
```

Expected: Thursday auto-selected, `Next: VCTRE`, `Starts in 2 hr`.

Do not put `preview=...` in NFC tag URLs.

## Data model

`schedule-data.js` stores all schedule data in `window.SCHEDULE_DATA`:

```js
{ "Friday": { "amp": [["11:00 PM", "PEEKABOO"]] } }
```

Stage IDs: `amp`, `fractal-forest`, `grove`, `living-room`, `pagoda`, `secret-garden`, `village`. Days: `Thursday`–`Sunday`, mapped in `app.js` to calendar dates 2026-07-23 through 2026-07-26; post-midnight sets stay in the previous evening's list and roll over internally.

My Set List and Hexlace identity/collection live in browser localStorage (no accounts). Published Hexlace lists live in Cloudflare KV with a 60-day TTL; the full API surface is documented in HANDOFF.md.

## Testing

```bash
npm test
```

This runs the date-mapping tests and validates `schedule-data.js`. Use `npm run validate:schedule` when you only want the schedule data check.

## Publishing and releases

GitHub Pages publishes `main` automatically (allow a minute or two, and note the 10-minute HTTP cache). **Schedule-only edits during the festival do not bump versions** — see [UPDATING.md](UPDATING.md). Code releases bump the `?v=NN` scheme across `index.html` / `sw.js` / `app.js` / `manifest.webmanifest` — exact checklist and commands in [HANDOFF.md](HANDOFF.md). The Worker deploys separately via `wrangler deploy` from the repo root; after any push, health-check the API as described in HANDOFF.md.

## Working from another computer

Clone this repo and follow the setup section of [HANDOFF.md](HANDOFF.md) — it covers tooling, the two one-time logins (`gh auth login`, `wrangler login`), deploy verification, and every gotcha that has actually bitten this project.

## Important note

This is a fan-made guide. Verify important plans against the official festival schedule/app, especially if the festival announces schedule changes.
