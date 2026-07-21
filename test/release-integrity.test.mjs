import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");

test("release assets and service-worker precache use one version and include both fonts", async () => {
  const [html, serviceWorker, css, manifest, app, readme, handoff, hexOwl, playground] = await Promise.all([
    read("index.html"), read("sw.js"), read("styles.css"), read("manifest.webmanifest"),
    read("app.js"), read("README.md"), read("HANDOFF.md"), read("hex-owl.js"),
    read("hex-owl-playground.html")
  ]);
  const releaseSources = [html, serviceWorker, css, manifest, app, hexOwl, playground];
  const referencedVersions = new Set(releaseSources.flatMap(source => [...source.matchAll(/\?v=(\d+)/g)].map(match => match[1])));
  assert.deepEqual([...referencedVersions], ["75"], "Every release asset query must use exactly v75.");
  assert.equal(html.match(/<!--\s*v(\d+)\s*-->/)?.[1], "75", "The Pages release marker must be v75.");
  assert.equal(serviceWorker.match(/stage-schedule-v(\d+)/)?.[1], "75", "The service-worker cache must be v75.");
  assert.match(readme, /authoritative deployed version[^\n]*\bv75\b/i);
  assert.match(handoff, /current release \*\*v75\*\*/i);
  assert.match(handoff, /release bumps ONE version number everywhere \(v75 at the time of writing\)/);
  assert.match(serviceWorker, /InterVariable\.woff2\?v=75/);
  assert.match(serviceWorker, /InterVariable-Italic\.woff2\?v=75/);
  assert.match(css, /InterVariable\.woff2\?v=75/);
  assert.match(css, /InterVariable-Italic\.woff2\?v=75/);
  assert.match(serviceWorker, /schedule-metadata\.js\?v=75/);
  assert.match(serviceWorker, /undo\.js\?v=75/);
  assert.match(serviceWorker, /camp-access\.js\?v=75/);
  assert.match(serviceWorker, /hexlace-compare\.js\?v=75/);
  assert.match(serviceWorker, /hex-owl\.js\?v=75/);
  assert.match(serviceWorker, /hex-owl-base\.svg\?v=75/);
  assert.match(serviceWorker, /hex-owl-playground\.html/);
  assert.match(serviceWorker, /hexadex\.js\?v=75/);
  assert.match(hexOwl, /hex-owl-base\.svg\?v=75/);
  assert.match(playground, /hex-owl\.js\?v=75/);
});

test("schedule and overlap policy stay explicit", async () => {
  const [metadata, planner, app, hexlaces, styles] = await Promise.all([
    read("schedule-metadata.js"), read("planner.js"), read("app.js"), read("hexlaces.js"), read("styles.css")
  ]);
  assert.match(metadata, /SCHEDULE_VERSION\s*=\s*"[^"]+"/);
  assert.match(metadata, /SCHEDULE_FINAL_END_TIMES/);
  assert.match(metadata, /https:\/\/www\.shambhalamusicfestival\.com\/lineup/);
  assert.match(planner, /MIN_OVERLAP_MINUTES\s*=\s*15/);
  assert.match(planner, /overlapMinutes\(a, b\)\s*>=\s*MIN_OVERLAP_MINUTES/);
  assert.match(app, /timeline\.push\(\{ \.\.\.entry, cancelled: isCancelledSet\(entry\) \}\)/);
  assert.match(metadata, /SCHEDULE_CANCELLATIONS/);
  assert.match(app, /status\.type === "cancelled"/);
  assert.match(app, /badge\.textContent = "Cancelled"/);
  assert.match(planner, /planner-set-cancelled/);
  assert.match(planner, /entry\.match && !entry\.match\.cancelled/);
  assert.match(planner, /isCancelledSet\(item\) && !hasSet\(item\)/);
  assert.match(hexlaces, /ping\.type === "set" && isCancelledSet\(ping\)/);
  assert.match(styles, /\.cancelled-badge/);
  assert.match(planner, /window\.showUndo/);
  assert.match(planner, /if \(list === elements\.scheduleList\) row\.append\(button\)/);
  assert.match(styles, /#set-list\.timeline \.set-node \{ display: block; \}/);
  assert.doesNotMatch(styles, /(?<!search-results )\.set-next \{[^}]*box-shadow:/);
  assert.match(styles, /\.search-results \.set-next \{/);
  assert.match(styles, /\.overlap-badge \{[^}]*pointer-events: auto;/);
  assert.match(planner, /badge\.addEventListener\("click", event => \{[\s\S]*?toggleOverlap\(itemKey\)/);
  assert.match(planner, /Playing at \$\{stageName\} - Ends at \$\{formatTimelineTime\(current\.end\)\}/);
  assert.match(planner, /Up next \$\{formatStartsIn\(current\.match\.key - nowKey\)/);
  assert.match(styles, /\.planner-set-now \{[^}]*var\(--accent\)/);
  assert.doesNotMatch(planner, /renderUpNext|LIVE_GROUP_WINDOW_MINUTES/);
});

test("deployment checks verify the exact Pages marker and deployed Worker revision", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /expected_marker=\$\(grep -oE '<!-- v\[0-9\]\+ -->' index\.html\)/);
  assert.match(workflow, /grep -F "\$expected_marker"/);
  assert.match(workflow, /wrangler@4 deploy --var BUILD_SHA:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /\.build == \$sha/);
  assert.match(workflow, /for attempt in 1 2 3 4 5 6/);
  assert.match(workflow, /Worker revision has not propagated yet/);
  assert.match(workflow, /sleep 5/);
});

test("schedule filters use ordinary toggle buttons rather than an incomplete tabs pattern", async () => {
  const [html, app, install, styles] = await Promise.all([read("index.html"), read("app.js"), read("install.js"), read("styles.css")]);
  assert.doesNotMatch(html, /role="tablist"|role="tabpanel"/);
  assert.doesNotMatch(app, /setAttribute\("role", "tab"\)/);
  assert.match(app, /aria-pressed/);
  assert.doesNotMatch(html, /id="day-tabs"/);
  assert.match(html, /id="schedule-previous-day"/);
  assert.match(html, /id="schedule-next-day"/);
  assert.match(app, /function renderDayRail\(\)/);
  assert.match(app, /elements\.scheduleToday\.hidden = appState\.day !== currentScheduleDay/);
  assert.match(styles, /\.schedule-day-pill\.is-unavailable \{ visibility: hidden;/);
  assert.doesNotMatch(html, /<p class="control-label">(?:Stage|Day)<\/p>/);
  assert.ok(html.indexOf('id="stage-mark-header"') < html.indexOf('id="stage-tabs"'), "Stage art must sit between Now Playing and the stage controls.");
  assert.match(app, /observer\.observe\(elements\.nowPlaying\)/);
  assert.doesNotMatch(styles, /\.now-playing \{[^}]*position: sticky;/);
  assert.match(install, /platform === "MacIntel".*maxTouchPoints > 1/);
  assert.match(install, /beforeinstallprompt[\s\S]*button\.hidden = false/);
  assert.match(install, /Connect to the internet once before installing/);
  assert.match(install, /isFirefoxAndroid/);
  assert.match(install, /open the browser menu, tap Install/);
});

test("Hexlace coordination and closed-friend rendering safeguards stay enabled", async () => {
  const [config, coordinator, hexlaces, worker, html, css] = await Promise.all([
    read("wrangler.jsonc"), read("worker/src/durable-objects.js"), read("hexlaces.js"),
    read("worker/src/index.js"), read("index.html"), read("styles.css")
  ]);
  assert.match(config, /"name": "HEXLACES", "class_name": "HexlaceCoordinator"/);
  assert.match(config, /"name": "RATE_LIMITS", "class_name": "RateLimitCoordinator"/);
  assert.match(config, /"name": "HEX_OWL_PROFILES", "class_name": "HexOwlProfile"/);
  assert.match(config, /"name": "OWL_NUMBERS", "class_name": "OwlNumberAllocator"/);
  assert.match(config, /"name": "CAMP_ACCESS", "class_name": "CampAccessRegistry"/);
  assert.match(config, /"new_sqlite_classes": \["HexlaceCoordinator", "RateLimitCoordinator"\]/);
  assert.match(config, /"new_sqlite_classes": \["CampAccessRegistry"\]/);
  assert.match(coordinator, /CLAIM_CONTENTION_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(hexlaces, /HANDOFF_REDEMPTION_KEY/);
  assert.match(hexlaces, /friends: friendIds\(\)/);
  assert.match(hexlaces, /\/lists\/\$\{identity\.readId\}\/owner/);
  assert.match(worker, /parts\[2\] === "connect-code"/);
  assert.match(worker, /Collected friend ids are deliberately excluded from the public route/);
  assert.match(html, /id="hexlace-connect-app"/);
  assert.match(html, /id="hexlace-connect-section"[^>]*hidden/);
  assert.match(hexlaces, /elements\.connectSection\.hidden = !canConnectApp/);
  assert.match(hexlaces, /!isStandalone\(\).*navigator\.onLine !== false/);
  assert.match(html, /id="hexlace-bring-over"/);
  assert.doesNotMatch(html, /id="hexlace-compare-start"|id="hexlace-compare-prompt"/);
  assert.match(html, /id="hexlace-compare-dialog"/);
  assert.match(html, /id="hexlace-compare-previous"/);
  assert.match(html, /id="hexlace-compare-next"/);
  assert.match(hexlaces, /window\.HexlaceCompare\.sharedSets/);
  assert.match(hexlaces, /compareDayIndex = Math\.max\(0, days\.indexOf\(selectedComparisonDay\(\)\)\)/);
  assert.match(hexlaces, /dayGroup\.className = "planner-day hexlace-friend-day"/);
  assert.match(hexlaces, /`\$\{item\.time \|\| ""\} on \$\{day\} - \$\{stageLabel\(item\.stageId\)\}`/);
  assert.doesNotMatch(hexlaces, /compareSelecting|appendComparisonChoice/);
  assert.match(css, /\.planner-set\.hexlace-friend-set \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.hexlace-feedback:not\(:empty\) \{[^}]*position: fixed/);
  assert.match(html, /id="hexlace-admin-section"[^>]*hidden/);
  assert.doesNotMatch(html, /id="hexlace-swap-open"|id="hexlace-swap-dialog"|Trade Hexlaces/);
  assert.doesNotMatch(hexlaces, /loadTradeMode\(\) && tapToken/);
  assert.match(worker, /parts\[2\] === "release"/);
  assert.match(worker, /parts\[0\] === "profiles".*parts\[2\] === "hexadex"/);
  assert.match(html, /id="hexadex-open"/);
  assert.doesNotMatch(html, /id="hex-owl-card"/);
  assert.match(hexlaces, /params\.get\("tap"\)/);
  assert.match(hexlaces, /function shareUrl\(readId\)[\s\S]*\?f=\$\{readId\}/);
  assert.match(hexlaces, /writeTag\(tapUrl\(identity\.readId, identity\.tapToken\)\)/);
  assert.match(hexlaces, /if \(group\.open\) populateSetRows\(\)/);
});

test("ordinary schedule and footer copy stay concise", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  const footer = html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] || "";
  assert.doesNotMatch(html, /Unofficial guide|Made as a fan project|coarse location ping/);
  assert.doesNotMatch(app, /Unofficial guide/);
  assert.doesNotMatch(html, /class="offline-ready"/);
  assert.match(html, /id="schedule-freshness"/);
  assert.match(app, /FRESH_THRESHOLD_MS = 15 \* 60 \* 1000/);
  assert.match(html, /A fan project for Shambhala 2026/);
  assert.match(html, /class="hexlace-privacy">Sharing publishes your chosen name, saved sets, and optional ping\. It does not collect precise location\.<\/p>/);
  assert.doesNotMatch(html, /planner-ping-privacy/);
  assert.doesNotMatch(footer, /setlist sharing|precise location/);
  assert.match(app, /elements\.scheduleNote\.hidden = true/);
});

test("Hex Owl and Hexadex discovery UI stays wired to the chosen handoff", async () => {
  const [html, css, hexadex, hexlaces] = await Promise.all([
    read("index.html"), read("styles.css"), read("hexadex.js"), read("hexlaces.js")
  ]);
  assert.doesNotMatch(html, /id="hex-owl-card"|id="hex-owl-rarity"/);
  assert.match(html, /id="hexadex-avatar"/);
  assert.match(html, /id="hexadex-ghost-slots"/);
  assert.match(html, /<span class="control-label">Friends<\/span>[\s\S]*id="hexlace-count"[^>]*>0 Friends<\/span>/);
  assert.match(html, /id="planner-share-dialog"[\s\S]*id="hexlace-qr"[\s\S]*id="hexlace-share-link"/);
  assert.match(html, /id="planner-sharing-identity"[\s\S]*id="hexlace-rename"/);
  assert.match(html, /id="hexlace-enable"[^>]*>Set a username<\/button>/);
  assert.match(html, /class="hexlace-name-edit-label">Username<\/span>/);
  assert.doesNotMatch(html, /Sharing as|Set my sharing name/);
  assert.match(html, /<details id="planner"[^>]*planner-collapsible[\s\S]*<summary class="planner-heading hexlace-panel-summary">/);
  assert.ok(html.indexOf('</summary>') < html.indexOf('id="hexlace-enable"'));
  assert.doesNotMatch(html, /id="planner-clear"|Clear all|id="planner-up-next"|planner-live-now|planner-live-next/);
  assert.match(html, /class="hexlace-summary-title-row">[\s\S]*My Hexlace[\s\S]*id="hexlace-state"/);
  assert.doesNotMatch(html, /<summary><span><strong>(?:Share with friends|Connect the installed app|Manage Hexlace|Admin options)/);
  assert.match(html, /<h2 id="hexadex-dialog-title">Hexadex<\/h2>/);
  assert.match(html, /Gotta scan em all/);
  assert.match(html, /id="hexadex-detail-dialog"/);
  assert.match(hexlaces, /`\$\{entries\.length\} Friend\$\{entries\.length === 1 \? "" : "s"\}`/);
  assert.match(hexadex, /const DETAIL_TRAITS = \[[\s\S]*"Owl colour"[\s\S]*"Aura"/);
  assert.match(hexadex, /const HEXADEX_COLLECTION_SIZE = 7/);
  assert.match(hexadex, /\$\{found\} Hex Owl\$\{found === 1 \? "" : "s"\} found/);
  assert.match(hexadex, /function openDetail\(\{ owl, name = "", firstCollectedAt, context, isOwn = false \}\)/);
  assert.match(hexadex, /elements\.grid\.append\(ghostSlot\(\), ghostSlot\(true\)\)/);
  assert.match(hexadex, /Travels with your physical Hexlace, always\./);
  assert.match(css, /\.hexadex-detail-art \{[^}]*width: min\(15rem, 70vw\)[^}]*border-radius: 1rem/);
  assert.match(css, /\.hexadex-strip-art \{[^}]*width: 4\.2rem/);
  assert.match(css, /\.hexadex-ghost-slots \{[^}]*opacity: \.14/);
  assert.match(css, /body \{[\s\S]*background: radial-gradient\(circle at 50% -12%, color-mix\(in srgb, var\(--accent\) 13%, #17192b\) 0, #111321 38%, #090a12 100%\)/);
});
