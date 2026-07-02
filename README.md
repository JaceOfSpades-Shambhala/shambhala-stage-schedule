# Shambhala 2026 NFC Stage Schedule

A small, static, phone-friendly schedule page for six Shambhala stage necklaces. Each NFC tag opens its matching stage from a short URL hash. The site has no build step, backend, database, accounts, analytics, or external API dependency.

Live site:

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/
```

Current deployed version: `v9`

## Current features

- Stage and day filtering
- Automatic current schedule-day selection when no `?day=` is provided
- Subtle Today marker on the current schedule-day tab
- Global artist search across all stages and days
- Offline browsing after the site has been opened online once
- Stage-specific Now Playing card using Salmo, BC / Pacific time
- Early-morning rollover support, so Friday-list 2:00 AM sets are treated as Saturday morning while still belonging to Friday's schedule
- Current set highlight in the schedule list
- Up-next and starts-in timing in the Now Playing card
- Camp Hexadecibel link under the stage heading that can open Google Maps to camp coordinates

## Stable NFC URLs

Do not change these stage hash IDs unless the NFC tags are being rewritten.

```text
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#amp
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#fractal-forest
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#grove
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#living-room
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#pagoda
https://jaceofspades-shambhala.github.io/shambhala-stage-schedule/#village
```

Each URL is far below a 504-byte NFC-tag limit.

## Files

- `index.html` - page structure, header text, script/style version query strings
- `styles.css` - mobile-first styling
- `schedule-data.js` - schedule data in `window.SCHEDULE_DATA`
- `app.js` - tabs, search, Now Playing, preview mode, current-day selection, camp link behavior, and URL handling
- `camp-location.js` - easy-to-edit camp coordinates for the header Google Maps link
- `sw.js` - service worker cache for offline use
- `manifest.webmanifest` - installable app metadata

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

Do not put `preview=...` in NFC tag URLs.

## Offline cache rules

The site uses a network-first service worker. While online, it tries to fetch fresh same-origin files and update the cache. While offline, it falls back to the saved copy.

When changing `index.html`, `styles.css`, `app.js`, `schedule-data.js`, `camp-location.js`, or `sw.js`:

1. Bump the asset query strings in `index.html`, for example `?v=10`.
2. Bump `CACHE_NAME` in `sw.js`, for example `stage-schedule-v10`.
3. Update the cached asset query strings in `sw.js` to the same version.
4. Open the site once while online after publishing so the device receives the new cache.

Current cache name:

```js
const CACHE_NAME = "stage-schedule-v9";
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
