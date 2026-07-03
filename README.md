# Shambhala 2026 NFC Stage Schedule

A small, static, phone-friendly schedule page for seven Shambhala stage necklaces. Each NFC tag opens its matching stage from a short URL hash. The site has no build step, backend, database, accounts, analytics, or external API dependency.

Live site:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/
```

Current deployed version: `v16`

Rollback point before the custom set-list experiment: `2490e3b9b08138d549f9ec10174ca6c4a818961c` or branch `rollback-before-set-list`.

## Current features

- Stage and day filtering across seven stages, including Secret Garden
- Automatic current schedule-day selection when no `?day=` is provided
- Subtle Today marker on the current schedule-day tab
- Global artist search across all stages and days
- Offline browsing after the site has been opened online once
- Stage-specific Now Playing card using Salmo, BC / Pacific time
- Early-morning rollover support, so Friday-list 2:00 AM sets are treated as Saturday morning while still belonging to Friday's schedule
- Current set highlight in the schedule list
- Up-next and starts-in timing in the Now Playing card
- Camp Hexadecibel link under the stage heading that can open Google Maps to camp coordinates
- Phone-local My Set List planner with tap-to-add, remove, clear, and copy controls
- Installable app icons (favicon, apple-touch-icon, manifest icons) based on the Camp Hexadecibel pendant
- Open Graph preview card metadata for links shared in chat apps
- An Add to Home Screen button (Android/Chrome install prompt, manual Share instructions on iOS Safari)

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

Each URL is far below a 504-byte NFC-tag limit.

## Files

- `index.html` - page structure, header text, script/style version query strings
- `styles.css` - mobile-first styling
- `schedule-data.js` - schedule data in `window.SCHEDULE_DATA`
- `app.js` - tabs, search, Now Playing, preview mode, current-day selection, camp link behavior, URL handling, and the site's single service worker registration
- `planner.js` - phone-local My Set List feature
- `camp-location.js` - easy-to-edit camp coordinates for the header Google Maps link
- `install.js` - Add to Home Screen button behavior (Android/Chrome install prompt, iOS Safari hint)
- `sw.js` - service worker cache for offline use
- `manifest.webmanifest` - installable app metadata, including icons
- `favicon.ico`, `favicon-16.png`, `favicon-32.png` - browser tab / bookmark icons
- `apple-touch-icon.png` - iOS home-screen icon (180x180, opaque background)
- `icon-192.png`, `icon-512.png` - manifest install icons

## Updating camp coordinates from a phone

When Camp Hexadecibel has its actual location, edit only `camp-location.js` in GitHub.

Change these values:

```js
window.CAMP_LOCATION = {
  latitude: "49.123456",
  longitude: "-117.123456",
  googleMapsUrl: ""
};
```

If `googleMapsUrl` is filled in, it wins over latitude/longitude. Otherwise the site builds a Google Maps coordinate link from `latitude` and `longitude`.

After committing the change, open the site once while online so the phone caches the new location file.

## Testing Now Playing before the festival

Use the `preview` parameter. It pretends the festival-local time is the value in the URL without changing the device clock.

Expected active-set tests:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/?preview=2026-07-24T23:30#amp
```

Expected: Friday is auto-selected, `PEEKABOO` is now playing, `RUSKO` is up next, and the PEEKABOO row is highlighted.

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/?preview=2026-07-24T21:45#pagoda
```

Expected: Friday is auto-selected and `JUSTIN MARTIN` is now playing.

Expected upcoming-set test:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/?preview=2026-07-23T10:00#amp
```

Expected: Thursday is auto-selected, `Next: VCTRE`, and `Starts in 2 hr`.

Secret Garden test:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/?preview=2026-07-24T21:30#secret-garden
```

Expected: Friday is auto-selected and `CHACHO` is now playing.

Do not put `preview=...` in NFC tag URLs.

## My Set List behavior

The My Set List planner is stored in the phone browser's local storage. It does not sync between devices, does not require an account, and remains available offline as long as the browser keeps the site's local data.

Selected sets are sorted by festival timeline, including post-midnight rollover inside each schedule day. Use `Copy` for a text version that can be sent in chat, or screenshot the My Set List panel directly.

## Offline cache rules

The site uses a network-first service worker. While online, it tries to fetch fresh same-origin files and update the cache. While offline, it falls back to the saved copy.

When changing `index.html`, `styles.css`, `app.js`, `planner.js`, `install.js`, `schedule-data.js`, `camp-location.js`, `sw.js`, or any icon file:

1. Bump the asset query strings in `index.html`, for example `?v=17`.
2. Bump the service worker registration in `app.js` to the same version, for example `sw.js?v=17`. The service worker is registered once, from `app.js` only.
3. Bump `CACHE_NAME` in `sw.js`, for example `stage-schedule-v17`.
4. Update the cached asset query strings in `sw.js` to the same version.
5. Open the site once while online after publishing so the device receives the new cache.

Current cache name:

```js
const CACHE_NAME = "stage-schedule-v16";
```

## Schedule data model

`schedule-data.js` stores all schedule data in `window.SCHEDULE_DATA`.

Structure:

```js
{
  "Friday": {
    "amp": [["11:00 PM", "PEEKABOO"]]
  }
}
```

Stage IDs:

```text
amp
fractal-forest
grove
living-room
pagoda
secret-garden
village
```

Schedule days are `Thursday`, `Friday`, `Saturday`, and `Sunday`.

## Festival date mapping

`app.js` maps schedule labels to the calendar date where that schedule day starts:

```js
Thursday: "2026-07-23"
Friday: "2026-07-24"
Saturday: "2026-07-25"
Sunday: "2026-07-26"
```

This is intentional. The source schedule treats post-midnight sets as part of the previous evening's schedule list. The app detects time rollover inside each day list, so a Friday-list 2:00 AM set becomes Saturday morning internally while still being labeled as Friday's schedule.

## Working from another computer

Use GitHub as the source of truth. Local `Downloads` folders and uncommitted edits do not sync between PCs.

Recommended handoff flow:

1. Commit changes to `main` before switching computers.
2. On the other PC, open or clone this GitHub repo.
3. Make sure the ChatGPT Codex Connector is installed for this repo if Codex needs to publish changes directly.
4. Start a new Codex thread with this README as the project handoff.

## Publishing

GitHub Pages publishes from the `main` branch. Most edits can be made directly in GitHub's web editor and committed to `main`.

Important: the published site may take a minute or two to update after a commit.

## Important note

This is a fan-made guide. Verify important plans against the official festival schedule/app, especially if the festival announces schedule changes.
