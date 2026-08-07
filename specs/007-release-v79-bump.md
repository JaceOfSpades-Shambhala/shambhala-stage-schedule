# 007 — Bump the release to v79 so withdrawn v78 assets are purged

## Goal

Every release-coupled reference reads `79` instead of `78`, so the service worker
adopts a new cache name and drops assets that were removed from the v78 asset
list.

## Context

Audit finding C3. Commit `34bb2d4` withdrew `hex-owl-playground.html` from the
published site and from the service worker's asset list, but `sw.js:6` still
reads `const CACHE_NAME = "stage-schedule-v78"`. Installation reopens the same
cache and adds current entries; activation deletes only caches whose name
differs. Nothing removes entries that disappeared from the list, so existing v78
installations can still serve the withdrawn playground from cache.

Changing the cache name is the mechanism that fixes this. The rest of the bump
exists because `test/release-integrity.test.mjs` enforces that every
release-coupled reference agrees; a partial bump fails the suite loudly, which is
the desired behaviour.

**`AGENTS.md`'s bump list is incomplete and will mislead the next bump.** It
names roughly ten files but omits `test/service-worker.test.mjs`, which hardcodes
13 `?v=78` references. This spec corrects that list as part of the change.

**This bump is a production release.** Merging it to `main` deploys v79. That is
the intended effect, not a side effect.

## Files to change

Replace the version in all fourteen files below. Counts are current occurrences
of `v78` or `?v=78`, given so a missed file is obvious.

Test-enforced by `test/release-integrity.test.mjs`:

- `index.html` (26) — the `<!-- v78 -->` marker and every `?v=` query
- `sw.js` (37) — the `stage-schedule-v78` cache name and every `?v=` query
- `styles.css` (2) — font queries
- `app.js` (4)
- `hex-owl.js` (1)
- `hex-owl-playground.html` (1)
- `manifest.webmanifest` (2)
- `README.md` (1) — "authoritative deployed version ... v78"
- `HANDOFF.md` (3)
- `test/release-integrity.test.mjs` (19) — the assertions themselves
- `test/service-worker.test.mjs` (13) — omitted from the AGENTS list

Not test-enforced, updated so documentation does not go stale:

- `AGENTS.md` (5)
- `docs/AGENT-LOOP-SETUP.md` (1)
- `docs/festival-platform-extraction.md` (2)

## Changes

In all fourteen files, change every release-coupled `78` to `79`:

- `?v=78` becomes `?v=79`
- `stage-schedule-v78` becomes `stage-schedule-v79`
- `<!-- v78 -->` becomes `<!-- v79 -->`
- prose reading `v78` becomes `v79`
- the string literals `"78"` in `test/release-integrity.test.mjs` become `"79"`,
  and its assertion messages that say `v78` become `v79`

Do not change any number that is not a release version. In particular, do not
alter image dimensions, timestamps, colour values, port numbers, or any `78`
appearing inside an unrelated identifier. If any occurrence is ambiguous, stop
and report it rather than guessing.

### Additional change to `AGENTS.md`

In the release-bump section, add `test/service-worker.test.mjs` to the list of
files that must change together, so the list is complete. Place it immediately
after the `test/release-integrity.test.mjs` bullet. Do not restructure or reword
the rest of that section beyond the version number itself.

## Out of scope

- Do not restore `hex-owl-playground.html` to the published site or to the
  service worker asset list. It stays withdrawn; only its own `?v=` reference is
  bumped.
- Do not change the service worker's caching logic, install/activate handlers, or
  fetch strategy. Only the cache name and asset query strings change.
- Do not change `.github/workflows/pages.yml`. The health-check weakness is audit
  item 4 and is deferred.
- Do not modify `scripts/build-pages.mjs`, `.claude/settings.json`, or
  `.claude/settings.local.json`. Specs 005 and 006 cover those.
- Do not touch anything under `specs/` or `shared/`.
- Do not add, remove, or rename any asset.

## Verification

```
npm test
```

Expected: `fail 0`. `test/release-integrity.test.mjs` is the real check here — it
asserts every release-coupled reference agrees, so a partial bump fails loudly.
`test/service-worker.test.mjs` must also pass, which it will only if its 13
hardcoded queries were updated.

```
git grep -n -e "v78" -e "?v=78" -- . ":(exclude)specs/*" ":(exclude)shared/*" ; echo "exit=$?"
```

Expected: no output and `exit=1` (git grep exits 1 when nothing matches). Any
printed line is a missed occurrence and a failure. `exit=0` means matches remain.

```
git grep -c "stage-schedule-v79" -- sw.js
```

Expected: `1`. This is the change that actually purges the stale cache.

```
node -e "const fs=require('fs'); const h=fs.readFileSync('index.html','utf8'); const m=h.match(/<!--\s*v(\d+)\s*-->/); if(!m||m[1]!=='79'){console.error('marker is',m&&m[1]);process.exit(1);} console.log('marker OK 79');"
```

Expected: `marker OK 79`. The Pages deployment health check reads this marker.

```
git status --porcelain
```

Expected: exactly the fourteen listed files modified, plus untracked files under
`specs/`. Any other modified file is out-of-scope work and a failure.

## Open questions
