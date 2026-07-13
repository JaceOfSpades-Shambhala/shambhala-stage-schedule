import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");

test("release assets and service-worker precache use one version and include both fonts", async () => {
  const [html, serviceWorker, css, manifest, app, readme, handoff] = await Promise.all([
    read("index.html"), read("sw.js"), read("styles.css"), read("manifest.webmanifest"),
    read("app.js"), read("README.md"), read("HANDOFF.md")
  ]);
  const releaseSources = [html, serviceWorker, css, manifest, app];
  const referencedVersions = new Set(releaseSources.flatMap(source => [...source.matchAll(/\?v=(\d+)/g)].map(match => match[1])));
  assert.deepEqual([...referencedVersions], ["49"], "Every release asset query must use exactly v49.");
  assert.equal(html.match(/<!--\s*v(\d+)\s*-->/)?.[1], "49", "The Pages release marker must be v49.");
  assert.equal(serviceWorker.match(/stage-schedule-v(\d+)/)?.[1], "49", "The service-worker cache must be v49.");
  assert.match(readme, /authoritative deployed version[^\n]*\bv49\b/i);
  assert.match(handoff, /current release \*\*v49\*\*/i);
  assert.match(handoff, /release bumps ONE version number everywhere \(v49 at the time of writing\)/);
  assert.match(serviceWorker, /InterVariable\.woff2\?v=49/);
  assert.match(serviceWorker, /InterVariable-Italic\.woff2\?v=49/);
  assert.match(css, /InterVariable\.woff2\?v=49/);
  assert.match(css, /InterVariable-Italic\.woff2\?v=49/);
  assert.match(serviceWorker, /schedule-metadata\.js\?v=49/);
  assert.match(serviceWorker, /undo\.js\?v=49/);
});

test("schedule and overlap policy stay explicit", async () => {
  const [metadata, planner, app] = await Promise.all([read("schedule-metadata.js"), read("planner.js"), read("app.js")]);
  assert.match(metadata, /SCHEDULE_VERSION\s*=\s*"[^"]+"/);
  assert.match(metadata, /SCHEDULE_FINAL_END_TIMES/);
  assert.match(metadata, /https:\/\/www\.shambhalamusicfestival\.com\/lineup/);
  assert.match(planner, /MIN_OVERLAP_MINUTES\s*=\s*15/);
  assert.match(planner, /LIVE_GROUP_WINDOW_MINUTES\s*=\s*20/);
  assert.match(planner, /overlapMinutes\(a, b\)\s*>=\s*MIN_OVERLAP_MINUTES/);
  assert.match(app, /timeline\.push\(\{ day, stageId,/);
  assert.match(planner, /window\.confirm\(`Are you sure you want to clear all/);
  assert.match(planner, /window\.showUndo/);
});

test("deployment checks verify the exact Pages marker and deployed Worker revision", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /expected_marker=\$\(grep -oE '<!-- v\[0-9\]\+ -->' index\.html\)/);
  assert.match(workflow, /grep -Fx "\$expected_marker"/);
  assert.match(workflow, /wrangler@4 deploy --var BUILD_SHA:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /\.build == \$sha/);
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
  assert.match(config, /"new_sqlite_classes": \["HexlaceCoordinator", "RateLimitCoordinator"\]/);
  assert.match(coordinator, /CLAIM_CONTENTION_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(hexlaces, /HANDOFF_REDEMPTION_KEY/);
  assert.match(hexlaces, /friends: friendIds\(\)/);
  assert.match(hexlaces, /\/lists\/\$\{identity\.readId\}\/owner/);
  assert.match(worker, /parts\[2\] === "connect-code"/);
  assert.match(worker, /Collected friend ids are deliberately excluded from the public route/);
  assert.match(html, /id="hexlace-connect-app"/);
  assert.match(html, /id="hexlace-bring-over"/);
  assert.match(hexlaces, /if \(group\.open\) populateSetRows\(\)/);
});
