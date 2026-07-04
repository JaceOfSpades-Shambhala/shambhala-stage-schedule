# Updating the schedule during the festival

Set times change on-site. Here's how to push a fix so it reaches everyone's phones.

## The one file you edit

All set times live in **`schedule-data.js`**. You change a time (or artist, or add/remove a set), bump the version stamp, and commit. GitHub Pages redeploys in about a minute.

### 1. Edit the set

Find the stage and set inside `window.SCHEDULE_DATA`. Each entry is `["TIME", "ARTIST"]`, e.g.:

```js
"Friday": { "amp": [ ["11:00 PM", "PEEKABOO"], ["12:00 AM", "RUSKO"], ... ] }
```

- Times are 12-hour with `AM`/`PM` (e.g. `"9:45 PM"`). Keep each stage's list in start-time order.
- After-midnight sets stay under the day they belong to (Friday's 2 AM set lives in `"Friday"`), listed after the late-evening ones — the app rolls the date forward automatically.

### 2. Bump the version stamp — this is what triggers the refresh

At the top of `schedule-data.js`:

```js
window.SCHEDULE_VERSION = "July 24, 11:15 PM - Rusko pushed to midnight";
```

Change this string **every time you edit**. Put something human and specific; the exact text doesn't matter, only that it's different from before. The app compares this string against the copy each phone already has and shows a "Schedule updated - tap to refresh" banner when they differ. **If you forget to change it, phones won't know anything changed.**

Do **not** change the `?v=NN` numbers in `index.html` / `sw.js` for a normal in-festival data edit — those are for full releases and would force every phone to re-download everything.

### 3. Commit and push

From the repo:

```bash
git add schedule-data.js
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
