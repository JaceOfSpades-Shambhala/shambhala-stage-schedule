# Shambhala 2026 NFC Stage Schedule

A small, static, phone-friendly schedule page that opens a selected stage from a URL hash. It needs no database, login, or paid hosting.

## Files

- `index.html` - webpage structure
- `styles.css` - phone-friendly styling
- `schedule-data.js` - the set-time data; edit this file if set times change
- `app.js` - stage/day tabs, search, copy-link button, and URL handling
- `sw.js` - caches the page after its first successful load for offline use

## Publish it with GitHub Pages

1. Create a new GitHub repository. Suggested name: `shambhala-stage-schedule`.
2. Upload every file in this folder to the repository root.
3. In the GitHub repository, open **Settings** > **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then save.
6. GitHub will display the live site address, typically:

   `https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/`

GitHub may need a few minutes to publish the first version.

## NFC tag URLs

Use the published address plus the matching stage hash. The day is optional; including it lets the tag open to a specific day as well.

```text
https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/#amp
https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/#fractal-forest
https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/#grove
https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/#living-room
https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/#pagoda
https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/#village
```

To open a particular day, add `?day=Friday` before the hash:

```text
https://YOUR-GITHUB-USERNAME.github.io/shambhala-stage-schedule/?day=Friday#amp
```

Each URL is far below a 504-byte NFC-tag limit.

## Updating set times

Open `schedule-data.js` in GitHub, choose the pencil/edit icon, update the relevant time or artist, then commit the change. GitHub Pages will republish the page automatically.

## Important note

This is a fan-made guide. Verify important plans against the official festival schedule/app, especially if the festival announces schedule changes.
