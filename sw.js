const CACHE_NAME = "stage-schedule-v45";
const NETWORK_TIMEOUT_MS = 3500;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=45",
  "./camp-location.js?v=45",
  "./schedule-data.js?v=45",
  "./app.js?v=45",
  "./planner.js?v=45",
  "./qrcode.js?v=45",
  "./hexlaces.js?v=45",
  "./install.js?v=45",
  "./wordmark.svg?v=45",
  "./fonts/InterVariable.woff2?v=45",
  "./stage-names/amp.png?v=45",
  "./stage-names/fractal-forest.png?v=45",
  "./stage-names/grove.png?v=45",
  "./stage-names/living-room.png?v=45",
  "./stage-names/pagoda.png?v=45",
  "./stage-names/secret-garden.png?v=45",
  "./stage-names/village.png?v=45",
  "./manifest.webmanifest",
  "./favicon.ico?v=45",
  "./favicon-32.png?v=45",
  "./favicon-16.png?v=45",
  "./apple-touch-icon.png?v=45",
  "./icon-192.png?v=45",
  "./icon-512.png?v=45"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// Periodic Background Sync (Chrome/Android, installed PWAs): when the OS grants
// the app a background window, refresh the schedule so the cache is already
// fresh next time it opens - even if it opens offline. Only the small text/data
// files are refreshed; the icons are skipped to spare festival bandwidth.
const REFRESH_ASSETS = ASSETS.filter(asset => !/\.(png|ico|svg|woff2)(\?|$)/.test(asset));

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
    if (response && response.ok && new URL(request.url).origin === self.location.origin) {
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
  if (response) return response;

  const cached = await caches.match(request);
  if (cached) return cached;
  if (request.mode === "navigate") {
    const shell = await caches.match("./");
    if (shell) return shell;
  }

  // Nothing cached yet (likely a first visit): let the slow network finish.
  const late = await settled;
  return late || Response.error();
}
