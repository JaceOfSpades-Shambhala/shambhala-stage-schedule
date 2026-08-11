# 007 — Release v79 cache rotation and exact Pages revision proof

Status: implemented locally on 2026-08-11; pending review and commit. Not pushed
or deployed.

## Outcome

The PWA uses a new v79 cache, purging the withdrawn playground from existing v78
installations, and the live Pages check can prove the exact deployed commit.

## Files changed

- `index.html`, `sw.js`, `styles.css`, `manifest.webmanifest`, `app.js`
- `hex-owl.js`, `hex-owl-playground.html`
- `README.md`, `HANDOFF.md`, `AGENTS.md`
- `docs/AGENT-LOOP-SETUP.md`, `docs/festival-platform-extraction.md`
- `test/release-integrity.test.mjs`, `test/service-worker.test.mjs`
- `.github/workflows/pages.yml`

## Implementation

- Changed current release-coupled asset queries, HTML marker, assertions, and
  cache namespace from 78 to 79.
- Preserved the historical v78 release entry and added a separate v79 entry.
- The Pages artifact now contains `release-sha.txt`, stamped from `GITHUB_SHA`
  after staging. The live health job fetches it with a cache-busting query and
  requires an exact match before succeeding.
- `AGENTS.md` now lists the previously omitted service-worker test and current
  documentation references for future coordinated bumps.
- The local-only playground remains excluded from the Pages artifact and
  service-worker precache.

## Verification

- `npm.cmd test`: 149 passed, 0 failed, schedule validation passed.
- Focused release, service-worker, and builder tests: 14 passed, 0 failed.
- Browser/global and Node syntax checks passed.
- No push, merge, workflow run, Worker deploy, or Pages deploy was performed.
