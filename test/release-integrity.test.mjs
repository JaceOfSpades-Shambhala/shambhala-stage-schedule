import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, root), "utf8");

test("release assets and service-worker precache use one version and include both fonts", async () => {
  const [html, serviceWorker, css, manifest] = await Promise.all([
    read("index.html"), read("sw.js"), read("styles.css"), read("manifest.webmanifest")
  ]);
  for (const source of [html, serviceWorker, css, manifest]) assert.match(source, /v=46|v46/);
  assert.match(serviceWorker, /InterVariable\.woff2\?v=46/);
  assert.match(serviceWorker, /InterVariable-Italic\.woff2\?v=46/);
  assert.match(css, /InterVariable\.woff2\?v=46/);
  assert.match(css, /InterVariable-Italic\.woff2\?v=46/);
  for (const source of [html, serviceWorker, css, manifest]) assert.doesNotMatch(source, /v=45|v45|v=41/);
});

test("schedule filters use ordinary toggle buttons rather than an incomplete tabs pattern", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.doesNotMatch(html, /role="tablist"|role="tabpanel"/);
  assert.doesNotMatch(app, /setAttribute\("role", "tab"\)/);
  assert.match(app, /aria-pressed/);
});
