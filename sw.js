const CACHE_NAME = "stage-schedule-v61";
const CACHE_PREFIX = "stage-schedule-v";
const NETWORK_TIMEOUT_MS = 3500;
const OPTIONAL_CACHE_TIMEOUT_MS = 5000;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./hex-owl-playground.html",
  "./styles.css?v=61",
  "./camp-location.js?v=61",
  "./schedule-data.js?v=61",
  "./schedule-metadata.js?v=61",
  "./search-normalize.js?v=61",
  "./preview-time.js?v=61",
  "./app.js?v=61",
  "./undo.js?v=61",
  "./planner.js?v=61",
  "./qrcode.js?v=61",
  "./hexlace-api.js?v=61",
  "./hexlace-giveaway.js?v=61",
  "./hexlace-compare.js?v=61",
  "./hex-owl.js?v=61",
  "./hex-owl-base.svg?v=61",
  "./hexadex.js?v=61",
  "./hexlaces.js?v=61",
  "./install.js?v=61",
  "./fonts/InterVariable.woff2?v=61",
  "./fonts/InterVariable-Italic.woff2?v=61"
];

// These enhance the shell but are not needed to navigate a saved schedule.
// Cache them opportunistically so one transient image failure cannot prevent
// the whole offline app from installing.
const OPTIONAL_ASSETS = [
  "./wordmark.svg?v=61",
  "./stage-names/amp.png?v=61",
  "./stage-names/fractal-forest.png?v=61",
  "./stage-names/grove.png?v=61",
  "./stage-names/living-room.png?v=61",
  "./stage-names/pagoda.png?v=61",
  "./stage-names/secret-garden.png?v=61",
  "./stage-names/village.png?v=61",
  "./manifest.webmanifest",
  "./favicon.ico?v=61",
  "./favicon-32.png?v=61",
  "./favicon-16.png?v=61",
  "./apple-touch-icon.png?v=61",
  "./icon-192.png?v=61",
  "./icon-512.png?v=61"
];
const ASSETS = [...CORE_ASSETS, ...OPTIONAL_ASSETS];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await Promise.all(OPTIONAL_ASSETS.map(asset => Promise.race([
      cache.add(asset).catch(() => null),
      new Promise(resolve => setTimeout(resolve, OPTIONAL_CACHE_TIMEOUT_MS))
    ])));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// Periodic Background Sync (Chrome/Android, installed PWAs): when the OS grants
// the app a background window, refresh the schedule so the cache is already
// fresh next time it opens - even if it opens offline. Only the small text/data
// files are refreshed; the icons are skipped to spare festival bandwidth.
const REFRESH_ASSETS = ["./schedule-data.js?v=61", "./schedule-metadata.js?v=61"];

async function refreshSchedule() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(REFRESH_ASSETS.map(async asset => {
    try {
      const response = await fetch(asset, { cache: "reload" });
      if (response && response.ok) await cache.put(asset, response);
    } catch {}
  }));
}

self.addEventListener("periodicsync", event => {
  if (event.tag === "refresh-schedule") event.waitUntil(refreshSchedule());
});

// Prefer fresh files while online, but never leave a slow festival connection
// hanging: after NETWORK_TIMEOUT_MS the cached copy is served while the fetch
// keeps running in the background so the cache still picks up fresh files.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(respond(event));
});

async function respond(event) {
  const request = event.request;
  const network = fetch(request).then(response => {
    const url = new URL(request.url);
    const isAppDocument = request.mode === "navigate" || /\/(?:index\.html)?$/.test(url.pathname);
    if (response && response.ok && url.origin === self.location.origin && !isAppDocument) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
    }
    return response;
  });
  const settled = network.catch(() => null);
  event.waitUntil(settled);

  const response = await Promise.race([
    settled,
    new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS))
  ]);
  // A fast server/CDN error is no more useful offline than a failed request.
  // Preserve it only when there is no cached response to fall back to.
  if (response?.ok) return response;

  const cached = await caches.match(request);
  if (cached) return cached;
  if (request.mode === "navigate") {
    const shell = await caches.match("./");
    if (shell) return shell;
  }

  // Nothing cached yet (likely a first visit): let the slow network finish.
  const late = await settled;
  return late || response || Response.error();
}
