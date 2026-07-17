# Updating the schedule during the festival

Set times change on-site. Here's how to push a fix so it reaches everyone's phones.

## The two schedule files

Base start times live in **`schedule-data.js`**. Source notes, final-set endpoints, runtime schedule corrections, cancellation overlays, and the matching version stamp live in **`schedule-metadata.js`**. Change the relevant data and always bump both version strings; GitHub Pages redeploys in about a minute.

### 1. Edit the set

Find the stage and set inside `window.SCHEDULE_DATA`. Each entry is `["TIME", "ARTIST"]`, e.g.:

```js
"Friday": { "amp": [ ["11:00 PM", "PEEKABOO"], ["12:00 AM", "RUSKO"], ... ] }
```

- Times are 12-hour with `AM`/`PM` (e.g. `"9:45 PM"`). Keep each stage's list in start-time order.
- After-midnight sets stay under the day they belong to (Friday's 2 AM set lives in `"Friday"`), listed after the late-evening ones — the app rolls the date forward automatically.

### Mark a cancellation without breaking saved sets

Keep the original schedule row and artist name unchanged. Add a record to `window.SCHEDULE_CANCELLATIONS` in `schedule-metadata.js` using the same festival day, stage id, time, and artist:

```js
{
  day: "Friday",
  stageId: "amp",
  time: "12:00 AM",
  artist: "RUSKO",
  source: "https://artist-announcement.example/"
}
```

The app will show a Cancelled badge, exclude the slot from live/up-next and new saves, suppress its pings, and retain any existing My Set List entry so it can still be removed normally. Do not rename the artist to include “cancelled” or delete the row; either change would break the exact identity used by previously saved sets.

### 2. Bump the version stamp — this is what triggers the refresh

Use the same new string at the top of both `schedule-data.js` and `schedule-metadata.js`:

```js
window.SCHEDULE_VERSION = "July 24, 11:15 PM - Rusko pushed to midnight";
```

Change both copies **every time you edit**. Put something human and specific; the exact text doesn't matter, only that it's different from before. The app compares this string against the copy each phone already has and shows an "Update available - tap to refresh" banner when they differ. **If you forget to change it, phones won't know anything changed.** Validation fails if the two files disagree.

Do **not** change the `?v=NN` numbers in `index.html` / `sw.js` for a normal in-festival data edit — those are for full releases and would force every phone to re-download everything.

### 3. Commit and push

From the repo:

```bash
git add schedule-data.js schedule-metadata.js
git commit -m "schedule: Rusko moved to midnight"
git push
```

On a phone with bad signal, the GitHub mobile app or the web editor (`github.com/JaceOfSpades-Shambhala/shambhala-stage-schedule/edit/main/schedule-data.js`) works too — a one-line edit commits even on one bar.

## How it reaches people (three ways, no action needed from them)

1. **Open app, has signal** → the app re-checks every 5 minutes and on foreground; the update banner appears, one tap reloads.
2. **Installed to home screen (Android)** → Periodic Background Sync refreshes the cached schedule in the background when the OS allows, so it's already current next open — even if that open is offline.
3. **Offline** → they keep the last schedule that reached their phone; it updates the moment they get a sliver of signal.

## Tip: an off-site helper is your best reliability play

Signal at Salmo is rough. If you text one line ("Rusko → midnight, AMP") to a friend off-site, they can make the commit far faster than you loading github.com in a field. Consider designating one before the gates open.
