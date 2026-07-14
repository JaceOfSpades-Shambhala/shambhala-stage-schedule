# Release test checklist

Run `npm test` first. It covers schedule dates, payload validation, claim/handoff
sequences, transliteration, preview validation, request timeouts, service-worker
HTTP-error fallback, exact release asset/documentation versions, and filter semantics.

The following need a real browser or device, so they remain a short release
checklist rather than fragile simulated tests.

## Browser and offline

1. Open the site at 390px wide and at desktop width. Switch every stage and day;
   verify no clipped controls or horizontal scrolling.
2. Use Tab and Enter/Space through the stage and day filter buttons. Verify the
   selected button exposes `aria-pressed="true"` and the schedule updates.
3. Search `torbjorn` and confirm the `TORBJØRN` result appears. Try a normal
   accented name such as `beyonce` as well.
4. Load once online, then use browser offline mode. Reload and confirm the shell,
   schedule, both Inter font faces, and saved/planned data remain available.
5. With the browser network override returning HTTP 500 for `index.html` or a
   core asset, confirm the cached response is shown. With no cache, confirm the
   server error is shown instead of a blank screen.
6. Enter invalid `preview` query values (for example `2026-07-99T25:99`) and
   confirm the app uses the normal local-time display. Verify a valid late-night
   preview such as `2026-07-27T02:00` still works.

## Hexlaces and devices

1. In a throttled/offline browser, start sharing, rename, edit a set, and create
   a giveaway. Confirm each action remains queued locally and the UI becomes
   retryable after reconnecting; requests should resolve or fail visibly within
   12 seconds.
2. Put malformed JSON in each `shambhala-2026-*` localStorage item, reload, and
   confirm the page stays usable and treats the affected local data as empty.
3. On an NFC-capable Android device, write and read a normal Hexlace tag and a
   giveaway tag. On iOS, verify share/copy and the installed-app handoff flow.
4. Open a shared QR/link in a second phone or browser and verify the owner's
   list is readable but cannot be edited without its local write key.
5. Remove one saved set, one ping, and one collected friend. Verify Undo restores
   each one and that a shared Hexlace does not publish the transient deletion.
6. On iOS/iPadOS, test Safari and one alternate browser. Confirm the install
   instructions work, and confirm an already-prepared handoff can install
   offline while a new owner handoff clearly asks for internet access.
7. After automatic handoff, edit the setlist and collected friends once in
   Safari and once in the Home Screen app. Confirm both contexts retain access
   and pull the same name, sets, ping, and friend collection while online.
8. With an installed app that has no Hexlace identity, create **Connect installed
   app** code in Safari, enter it through **Bring over my Hexlace**, and confirm
   that the code copies ownership without disabling edits in Safari.
9. Scan one giveaway first on phone A while it is offline, then scan and publish
   from phone B while it is online. Reconnect phone A within seven days and
   confirm A becomes the owner and can publish without a revision-conflict loop.
10. With two owned Hexlaces that each have a Hex Owl online, enter **Trade Hexlaces** on both phones and
    tap each physical tag to the other phone. Confirm that neither a one-sided
    tap nor one confirmation changes ownership; after both confirm, verify each
    phone publishes its saved sets to the tag it received and displays the Owl
    attached to that received Hexlace. Confirm there is no option to keep the
    previous Owl. Repeat with one phone offline and confirm the trade option is
    not shown.
11. Release an owned Hexlace, verify the releasing phone keeps its saved sets,
    profile, and Hex Owl, then scan the unchanged physical tag on an unowned
    phone and confirm it can be named and claimed. Release and reclaim on the
    original profile and verify the exact Owl seed/number returns rather than a
    new one being assigned.
12. Create a display name with no saved sets and confirm no Hex Owl appears.
    Save one set, publish, and confirm exactly one Owl appears. Rename the user,
    reload, transfer into the installed app, and confirm the SVG and number stay
    identical at 48px, 64px, and the full My Hexlace size.
13. Open `hex-owl-playground.html`, generate at least 24 random Owls, and check
    that every variation contains the exact supplied Owl anatomy: the layered
    chevron brow ridge, swept eye sockets, crescent-derived pupils, and rounded
    lower face must remain unchanged beneath accessories and colour overlays.
    Confirm ordinary portal rings are one colour, ring halos never appear,
    accessories do not touch the Owl edges, rare Owls sparkle, and multi-colour
    portal palettes occur only on legendary Owls. Check both twist directions:
    the outer ring must be flat-topped and the inner ring vertically sided.
14. Tap a physical Hexlace and confirm its Owl appears once in the Hexadex with
    name, number, collection date, and only broad `Shambhala 2026` context. Tap
    it again to confirm deduplication. Open the ordinary QR/share URL and confirm
    the set list is collected but the Owl is not. Repeat offline and verify the
    tap queues, survives reload, and syncs once online.
15. Rewrite one legacy `?f=<id>` physical Hexlace using **Write my tag**. Confirm
    old set-list sharing still works before the rewrite and tap-only Hexadex/trade
    behavior begins only after the new `&tap=` URL is written.

## Deployment

GitHub Actions now reports three visible checks: `Validate Worker deployment`,
`Deploy GitHub Pages`, and `Verify live release and Hexlace API`. Treat the
release as incomplete if any check is red. Before every commit/push, run
`npm test`; its release-integrity test must report a single exact version that
matches the `index.html` marker, service-worker cache, assets, README, and handoff.
Before a Worker release, also run `wrangler deploy --dry-run` and confirm the
`HEXLACES`, `RATE_LIMITS`, `HEX_OWL_PROFILES`, `OWL_NUMBERS`, and `LISTS`
bindings are all listed, with the v2 SQLite Durable Object migration included.
