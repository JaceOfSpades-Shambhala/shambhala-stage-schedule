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
  assert.deepEqual([...referencedVersions], ["65"], "Every release asset query must use exactly v65.");
  assert.equal(html.match(/<!--\s*v(\d+)\s*-->/)?.[1], "65", "The Pages release marker must be v65.");
  assert.equal(serviceWorker.match(/stage-schedule-v(\d+)/)?.[1], "65", "The service-worker cache must be v65.");
  assert.match(readme, /authoritative deployed version[^\n]*\bv65\b/i);
  assert.match(handoff, /current release \*\*v65\*\*/i);
  assert.match(handoff, /release bumps ONE version number everywhere \(v65 at the time of writing\)/);
  assert.match(serviceWorker, /InterVariable\.woff2\?v=65/);
  assert.match(serviceWorker, /InterVariable-Italic\.woff2\?v=65/);
  assert.match(css, /InterVariable\.woff2\?v=65/);
  assert.match(css, /InterVariable-Italic\.woff2\?v=65/);
  assert.match(serviceWorker, /schedule-metadata\.js\?v=65/);
  assert.match(serviceWorker, /undo\.js\?v=65/);
  assert.match(serviceWorker, /camp-access\.js\?v=65/);
  assert.match(serviceWorker, /hexlace-compare\.js\?v=65/);
  assert.match(serviceWorker, /hex-owl\.js\?v=65/);
  assert.match(serviceWorker, /hex-owl-base\.svg\?v=65/);
  assert.match(serviceWorker, /hex-owl-playground\.html/);
  assert.match(serviceWorker, /hexadex\.js\?v=65/);
  assert.match(hexOwl, /hex-owl-base\.svg\?v=65/);
  assert.match(playground, /hex-owl\.js\?v=65/);
});

test("schedule and overlap policy stay explicit", async () => {
  const [metadata, planner, app, hexlaces, styles] = await Promise.all([
    read("schedule-metadata.js"), read("planner.js"), read("app.js"), read("hexlaces.js"), read("styles.css")
  ]);
  assert.match(metadata, /SCHEDULE_VERSION\s*=\s*"[^"]+"/);
  assert.match(metadata, /SCHEDULE_FINAL_END_TIMES/);
  assert.match(metadata, /https:\/\/www\.shambhalamusicfestival\.com\/lineup/);
  assert.match(planner, /MIN_OVERLAP_MINUTES\s*=\s*15/);
  assert.match(planner, /LIVE_GROUP_WINDOW_MINUTES\s*=\s*20/);
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
  assert.match(planner, /window\.confirm\(`Are you sure you want to clear all/);
  assert.match(planner, /window\.showUndo/);
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
  const [html, app, install] = await Promise.all([read("index.html"), read("app.js"), read("install.js")]);
  assert.doesNotMatch(html, /role="tablist"|role="tabpanel"/);
  assert.doesNotMatch(app, /setAttribute\("role", "tab"\)/);
  assert.match(app, /aria-pressed/);
  assert.match(install, /platform === "MacIntel".*maxTouchPoints > 1/);
  assert.match(install, /Connect to the internet once before installing/);
  assert.match(install, /isFirefoxAndroid/);
  assert.match(install, /open the browser menu, tap Install/);
});

test("Hexlace coordination and closed-friend rendering safeguards stay enabled", async () => {
  const [config, coordinator, hexlaces, worker, html] = await Promise.all([
    read("wrangler.jsonc"), read("worker/src/durable-objects.js"), read("hexlaces.js"),
    read("worker/src/index.js"), read("index.html")
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
  assert.match(html, /id="hexlace-compare-start"/);
  assert.match(html, /id="hexlace-compare-dialog"/);
  assert.match(html, /id="hexlace-compare-previous"/);
  assert.match(html, /id="hexlace-compare-next"/);
  assert.match(hexlaces, /window\.HexlaceCompare\.sharedSets/);
  assert.match(hexlaces, /compareDayIndex = Math\.max\(0, days\.indexOf\(selectedComparisonDay\(\)\)\)/);
  assert.match(html, /id="hexlace-swap-open"[^>]*hidden/);
  assert.match(html, /id="hexlace-admin-section"[^>]*hidden/);
  assert.match(hexlaces, /elements\.swapOpen\.hidden = navigator\.onLine === false \|\| !physical/);
  assert.match(coordinator, /trade\.targetReadId !== body\.requesterReadId/);
  assert.match(coordinator, /record\.trade\.confirmed/);
  assert.match(worker, /parts\[2\] === "release"/);
  assert.match(worker, /parts\[0\] === "profiles".*parts\[2\] === "hexadex"/);
  assert.match(html, /id="hexadex-open"/);
  assert.match(html, /id="hex-owl-card"/);
  assert.match(hexlaces, /params\.get\("tap"\)/);
  assert.match(hexlaces, /function shareUrl\(readId\)[\s\S]*\?f=\$\{readId\}/);
  assert.match(hexlaces, /writeTag\(tapUrl\(identity\.readId, identity\.tapToken\)\)/);
  assert.match(hexlaces, /body: JSON\.stringify\(\{ targetReadId, targetTapToken \}\)/);
  assert.match(hexlaces, /if \(group\.open\) populateSetRows\(\)/);
});

test("ordinary schedule and footer copy stay concise", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  const footer = html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] || "";
  assert.doesNotMatch(html, /Unofficial guide|Made as a fan project|coarse location ping/);
  assert.doesNotMatch(app, /Unofficial guide/);
  assert.match(html, /class="offline-ready">Offline ready after first online load</);
  assert.match(html, /A fan project for Shambhala 2026/);
  assert.match(html, /<section class="planner-ping"[\s\S]*?<\/section>\s*<p class="planner-ping-footer">Friends and setlist sharing use your display name, saved sets, and optional pings\. <strong>It does not collect precise location\.<\/strong><\/p>/);
  assert.doesNotMatch(html, /planner-ping-privacy/);
  assert.doesNotMatch(footer, /setlist sharing|precise location/);
  assert.match(app, /elements\.scheduleNote\.hidden = true/);
});

test("Hex Owl and Hexadex discovery UI stays wired to the chosen handoff", async () => {
  const [html, css, hexadex, hexlaces] = await Promise.all([
    read("index.html"), read("styles.css"), read("hexadex.js"), read("hexlaces.js")
  ]);
  assert.match(html, /<button id="hex-owl-card"[^>]*type="button"/);
  assert.match(html, /id="hex-owl-rarity"/);
  assert.match(html, /id="hexadex-avatar"/);
  assert.match(html, /<span class="control-label">Friends<\/span>[\s\S]*id="hexlace-count"[^>]*>0 Friends<\/span>/);
  assert.match(html, /<summary><strong>Share with friends<\/strong><\/summary>[\s\S]*class="hexlace-section-subheading">QR, link, display name/);
  assert.doesNotMatch(html, /<summary><span><strong>(?:Share with friends|Connect the installed app|Manage Hexlace|Admin options)/);
  assert.match(html, /<h2 id="hexadex-dialog-title">Hexadex<\/h2>/);
  assert.match(html, /Gotta scan em all/);
  assert.match(html, /id="hexadex-detail-dialog"/);
  assert.match(hexlaces, /`\$\{entries\.length\} Friend\$\{entries\.length === 1 \? "" : "s"\}`/);
  assert.match(hexadex, /const DETAIL_TRAITS = \[[\s\S]*"Owl colour"[\s\S]*"Aura"/);
  assert.match(hexadex, /function openDetail\(\{ owl, name = "", firstCollectedAt, context, isOwn = false \}\)/);
  assert.match(hexadex, /elements\.grid\.append\(ghostSlot\(\), ghostSlot\(true\)\)/);
  assert.match(hexadex, /Travels with your physical Hexlace, always\./);
  assert.match(css, /\.hexadex-detail-art \{[^}]*width: min\(15rem, 70vw\)[^}]*border-radius: 1rem/);
  assert.match(css, /body \{[^}]*background: radial-gradient\(circle at 30% -8%, color-mix\(in srgb, var\(--accent\) 15%, #14152a\) 0, #111321 46%, #090a12 100%\)/);
});
