# Shambhala 2026 NFC Stage Schedule

A static, phone-friendly, offline-first schedule site for seven Shambhala stage necklaces. Each NFC tag opens its matching stage from a short URL hash. The core schedule site has no build step, accounts, or analytics; the optional **Hexlaces** live set-list sharing feature is backed by a Cloudflare Worker, Durable Objects, and KV public snapshots (source in `worker/`).

Live site:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/
```

Hex Owl visual playground: [open the live playground](https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/hex-owl-playground.html). It is a standalone developer tool for previewing deterministic Owl seeds, traits, palettes, and contact sheets.

The authoritative deployed version is the `<!-- vNN -->` comment at the top of `<body>` in `index.html` (v78 at the time of writing). Release history and full developer docs live in [HANDOFF.md](HANDOFF.md); festival-time schedule editing is documented in [UPDATING.md](UPDATING.md).

## Current features

Schedule and planning:

- Stage and day filtering across seven stages, with automatic current-day selection and a Today marker (calendar-accurate, independent of stage)
- Global artist search below the selected schedule, with the same ended/current/up-next treatments as ordinary stage rows
- Compact stage-specific Now Playing display using Salmo, BC time, with a cached-data freshness state, time remaining, and early-morning rollover (a Friday-list 2:00 AM set counts as Saturday morning but stays in Friday's schedule)
- My Set List planner (phone-local): tap-to-add, a collapsible planner with collapsible day groups, palette-linked current-set rows, compact row-level up-next timing, visible overlap buttons, centralized QR/link sharing, and a 100-set cap
- Fast stage/day switching without browser snapshot transitions

Hexlaces (live set-list sharing):

- Every sharer gets a permanent read-only link (`?f=<id>`) carried on their NFC tag and available with its QR from the My Set List Share dialog; opening it collects their live list into a collapsible Friends panel that auto-refreshes (open/foreground/every 5 min) and stays readable offline
- The editable display name is prompted prominently above the list before sharing; publishing is automatic and debounced, queued while offline
- Passive pings live in one My Ping picker: choose camp, river, vendors, or enter saved-set selection mode and tap the meeting set; pings expire automatically and never send notifications
- Giveaway tags with claim tokens: opening one quietly records the local scan time, works offline, and lets the earliest scan own the Hexlace once signal returns (contention closes seven days after the first claim)
- My Hexlace can be released for the next scanner without erasing the owner's saved sets; people who want to exchange tags can release them and claim each other's physical Hexlace
- A named profile with at least one saved set receives one deterministic, numbered Hex Owl. The renderer reuses the exact supplied Shambhala Owl vector as one cached base, then adds lightweight deterministic SVG traits; changing a display name never changes the Owl
- Verified camp members and admins can freely customize their own Hex Owl from dropdowns covering every currently enabled trait, without rarity, weight, mandatory-language, or combination limits; the immutable original and a live customized preview are shown side by side
- Release temporarily separates a Hexlace from its profile: the profile retains its Owl while the tag becomes unclaimed, so reclaiming does not mint a replacement
- Tap-specific physical Hexlace URLs add Owls to a private, multi-year Hexadex with broad festival/year context only. Shared links and QR codes still collect set lists but cannot collect Owls
- On iOS 17.2+, a claimed Hexlace, saved sets, and collected-friend ids follow into a newly installed Home Screen app through a retry-safe 24-hour handoff; a compact connection code inside My Hexlace is the fallback when iOS does not copy the automatic cookie
- Safari and the installed app retain the same ownership secret and periodically pull authenticated owner state, so online edits synchronize without revoking either context; collected-friend ids remain private and their public lists are fetched normally
- Android can write tags in-app (Web NFC); iOS writes tags once with the NFC Tools app

Infrastructure:

- Offline browsing after first online load (network-first service worker with a 3.5 s slow-network fallback to cache)
- "Update available — tap to refresh" banner for both schedule edits and app releases (checked every 5 min via ETag revalidation)
- Periodic Background Sync on installed Android PWAs refreshes the schedule while the app is closed
- Add to Home Screen button, pendant-based app icons, Open Graph preview metadata

## Browser support

The primary mobile targets are Safari/Home Screen on iPhone and iPad, plus
Chrome and Firefox on Android. Ordinary schedule, QR, collection, offline, and
sharing features use standards-based APIs with feature detection. Web NFC tag
writing appears only where `NDEFReader` is available (normally Chrome on
Android). Safari is the supported iOS ownership-handoff path; alternate iOS
browsers can offer Add to Home Screen, but their install-time cookie transfer
must be checked on a real device before being treated as equivalent.

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

Shared links and QR codes use `?f=<readId>`. Physical Hexlaces use `?f=<readId>&tap=<token>`; an unclaimed tag also carries `&claim=<token>`. The tap token is required for Hexadex collection, so an ordinary shared link cannot impersonate a physical tap. All URLs fit comfortably on NTAG213 tags.

## Files

- `index.html` — page structure and the authoritative `<!-- vNN -->` release marker
- `styles.css` — mobile-first styling (note the global `[hidden]` rule; keep it)
- `schedule-data.js` — transcribed schedule start times (`window.SCHEDULE_DATA`)
- `schedule-metadata.js` — source provenance, the update-banner `SCHEDULE_VERSION`, PDF-derived final-set end times, and documented schedule corrections
- `scripts/validate-schedule.mjs` — schedule safety check for day/stage IDs, time format, duplicate rows, empty stage arrays, and overnight rollover order
- `app.js` — tabs, search, Now Playing, preview mode, update checks, service-worker registration
- `planner.js` — My Set List planner, overlap detection, day grouping
- `hexlaces.js` — live sharing: identity, publishing, collecting, claims, releases, pings, and friend comparison
- `hex-owl-base.svg` / `hex-owl.js` / `hex-owl-playground.html` — exact supplied Owl vector, frozen deterministic overlay renderer, and standalone seed/trait gallery
- `hexadex.js` — private profile cache, tap-only collection queue, Hexadex grid, and reveal UI
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

Expected: Friday auto-selected, `PEEKABOO` now playing, `TRUTH` up next, PEEKABOO row highlighted.

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

`schedule-data.js` stores all schedule start times in `window.SCHEDULE_DATA`; `schedule-metadata.js` records the source and the inferred final-set endpoints in `window.SCHEDULE_SOURCE` and `window.SCHEDULE_FINAL_END_TIMES`:

```js
{ "Friday": { "amp": [["11:00 PM", "PEEKABOO"]] } }
```

Stage IDs: `amp`, `fractal-forest`, `grove`, `living-room`, `pagoda`, `secret-garden`, `village`. Days: `Thursday`–`Sunday`, mapped in `app.js` to calendar dates 2026-07-23 through 2026-07-26; post-midnight sets stay in the previous evening's list and roll over internally.

My Set List and local Hexlace credentials live in browser localStorage (no login account). Per-profile Durable Objects privately retain Hex Owl assignment and paged Hexadex entries across release, app handoff, device transfer, and future festival years. Per-Hexlace Durable Objects serialize ownership and mutations; physical Hexlace records are durable, while browser-only share identities and KV public snapshots use a rolling 60-day TTL. Existing KV-only Hexlaces migrate lazily on their next qualifying publish. Accountless camp member/admin access and the admin Hex Owl trait framework are documented in [CAMP-ACCESS.md](CAMP-ACCESS.md). The full API surface is documented in HANDOFF.md.

## Testing

```bash
npm test
```

This runs the complete test suite, enforces one exact release version across deploy assets/docs, and validates the schedule data, metadata, inferred final endpoints, and Sunday AMP correction. Use `npm run validate:schedule` when you only want the schedule checks.

See [TESTING.md](TESTING.md) for the browser/device release checklist, including offline, accessibility, storage-recovery, NFC, QR, install, and sharing flows.

## Publishing and releases

Current releases are gated by GitHub Actions: tests pass, the Worker deploys with the commit SHA, Pages deploys, and both live revisions are checked. The manual Worker command below is a recovery path only.

GitHub Pages publishes `main` automatically (allow a minute or two, and note the 10-minute HTTP cache). **Schedule-only edits during the festival do not bump versions** — see [UPDATING.md](UPDATING.md). Code releases bump the `?v=NN` scheme across `index.html` / `sw.js` / `app.js` / `manifest.webmanifest` — exact checklist and commands in [HANDOFF.md](HANDOFF.md). The Worker deploys separately via `wrangler deploy` from the repo root; after any push, health-check the API as described in HANDOFF.md.

## Working from another computer

Clone this repo and follow the setup section of [HANDOFF.md](HANDOFF.md) — it covers tooling, the two one-time logins (`gh auth login`, `wrangler login`), deploy verification, and every gotcha that has actually bitten this project.

## Important note

This is a fan-made guide. Verify important plans against the official festival schedule/app, especially if the festival announces schedule changes.
