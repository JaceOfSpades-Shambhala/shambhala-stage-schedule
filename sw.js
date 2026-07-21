const CACHE_NAME = "stage-schedule-v74";
const CACHE_PREFIX = "stage-schedule-v";
const NETWORK_TIMEOUT_MS = 3500;
const OPTIONAL_CACHE_TIMEOUT_MS = 5000;
const FRESHNESS_ASSET = "./schedule-freshness.json";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./hex-owl-playground.html",
  "./styles.css?v=74",
  "./camp-location.js?v=74",
  "./schedule-data.js?v=74",
  "./schedule-metadata.js?v=74",
  "./search-normalize.js?v=74",
  "./preview-time.js?v=74",
  "./app.js?v=74",
  "./undo.js?v=74",
  "./planner.js?v=74",
  "./qrcode.js?v=74",
  "./camp-access.js?v=74",
  "./hexlace-api.js?v=74",
  "./hexlace-giveaway.js?v=74",
  "./hexlace-compare.js?v=74",
  "./hex-owl.js?v=74",
  "./hex-owl-base.svg?v=74",
  "./hexadex.js?v=74",
  "./hexlaces.js?v=74",
  "./install.js?v=74",
  "./fonts/InterVariable.woff2?v=74",
  "./fonts/InterVariable-Italic.woff2?v=74"
];

// These enhance the shell but are not needed to navigate a saved schedule.
// Cache them opportunistically so one transient image failure cannot prevent
// the whole offline app from installing.
const OPTIONAL_ASSETS = [
  "./wordmark.svg?v=74",
  "./stage-names/amp.png?v=74",
  "./stage-names/fractal-forest.png?v=74",
  "./stage-names/grove.png?v=74",
  "./stage-names/living-room.png?v=74",
  "./stage-names/pagoda.png?v=74",
  "./stage-names/secret-garden.png?v=74",
  "./stage-names/village.png?v=74",
  "./manifest.webmanifest",
  "./favicon.ico?v=74",
  "./favicon-32.png?v=74",
  "./favicon-16.png?v=74",
  "./apple-touch-icon.png?v=74",
  "./icon-192.png?v=74",
  "./icon-512.png?v=74"
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
    await markScheduleFresh(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Periodic Background Sync (Chrome/Android, installed PWAs): when the OS grants
// the app a background window, refresh the schedule so the cache is already
// fresh next time it opens - even if it opens offline. Only the small text/data
// files are refreshed; the icons are skipped to spare festival bandwidth.
const REFRESH_ASSETS = ["./schedule-data.js?v=74", "./schedule-metadata.js?v=74"];

function markScheduleFresh(cache, updatedAt = Date.now()) {
  return cache.put(FRESHNESS_ASSET, new Response(JSON.stringify({ updatedAt }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  }));
}

async function refreshSchedule() {
  const cache = await caches.open(CACHE_NAME);
  const refreshed = await Promise.all(REFRESH_ASSETS.map(async asset => {
    try {
      const response = await fetch(asset, { cache: "reload" });
      if (response && response.ok) {
        await cache.put(asset, response);
        return true;
      }
    } catch {}
    return false;
  }));
  if (refreshed.some(Boolean)) await markScheduleFresh(cache);
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
      const isScheduleAsset = /\/schedule-(?:data|metadata)\.js$/.test(url.pathname);
      event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
        await cache.put(request, copy);
        if (isScheduleAsset) await markScheduleFresh(cache);
      }));
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
