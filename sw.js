const CACHE_NAME = "stage-schedule-v25";
const NETWORK_TIMEOUT_MS = 3500;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=25",
  "./camp-location.js?v=25",
  "./schedule-data.js?v=25",
  "./app.js?v=25",
  "./planner.js?v=25",
  "./qrcode.js?v=25",
  "./hexlaces.js?v=25",
  "./install.js?v=25",
  "./manifest.webmanifest",
  "./favicon.ico?v=25",
  "./favicon-32.png?v=25",
  "./favicon-16.png?v=25",
  "./apple-touch-icon.png?v=25",
  "./icon-192.png?v=25",
  "./icon-512.png?v=25"
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
const REFRESH_ASSETS = ASSETS.filter(asset => !/\.(png|ico)(\?|$)/.test(asset));

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
