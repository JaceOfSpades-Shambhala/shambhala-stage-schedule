const CACHE_NAME = "stage-schedule-v78";
const CACHE_PREFIX = "stage-schedule-v";
const NETWORK_TIMEOUT_MS = 3500;
const OPTIONAL_CACHE_TIMEOUT_MS = 5000;
const FRESHNESS_ASSET = "./schedule-freshness.json";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=78",
  "./camp-location.js?v=78",
  "./schedule-data.js?v=78",
  "./schedule-metadata.js?v=78",
  "./search-normalize.js?v=78",
  "./preview-time.js?v=78",
  "./app.js?v=78",
  "./undo.js?v=78",
  "./planner.js?v=78",
  "./qrcode.js?v=78",
  "./camp-access.js?v=78",
  "./hexlace-api.js?v=78",
  "./hexlace-giveaway.js?v=78",
  "./hexlace-compare.js?v=78",
  "./hex-owl.js?v=78",
  "./hex-owl-base.svg?v=78",
  "./hexadex.js?v=78",
  "./hexlaces.js?v=78",
  "./install.js?v=78",
  "./fonts/InterVariable.woff2?v=78"
];

// These enhance the shell but are not needed to navigate a saved schedule.
// Cache them opportunistically so one transient image failure cannot prevent
// the whole offline app from installing.
const OPTIONAL_ASSETS = [
  "./hex-owl-playground.html",
  "./fonts/InterVariable-Italic.woff2?v=78",
  "./wordmark.svg?v=78",
  "./stage-names/amp.png?v=78",
  "./stage-names/fractal-forest.png?v=78",
  "./stage-names/grove.png?v=78",
  "./stage-names/living-room.png?v=78",
  "./stage-names/pagoda.png?v=78",
  "./stage-names/secret-garden.png?v=78",
  "./stage-names/village.png?v=78",
  "./manifest.webmanifest",
  "./favicon.ico?v=78",
  "./favicon-32.png?v=78",
  "./favicon-16.png?v=78",
  "./apple-touch-icon.png?v=78",
  "./icon-192.png?v=78",
  "./icon-512.png?v=78"
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
const REFRESH_ASSETS = ["./schedule-data.js?v=78", "./schedule-metadata.js?v=78"];

function markScheduleFresh(cache, updatedAt = Date.now()) {
  return cache.put(FRESHNESS_ASSET, new Response(JSON.stringify({ updatedAt }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  }));
}

async function refreshSchedule() {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Fetch the data and its metadata as one release unit. Do not overwrite
    // either cached file, or advertise freshness, unless both downloads are
    // healthy; a partial refresh can pair new sets with stale status rules.
    const responses = await Promise.all(REFRESH_ASSETS.map(async asset => {
      const response = await fetch(asset, { cache: "reload" });
      if (!response?.ok) throw new Error(`Schedule refresh failed for ${asset}`);
      return response;
    }));
    await Promise.all(REFRESH_ASSETS.map((asset, index) => cache.put(asset, responses[index])));
    await markScheduleFresh(cache);
    return true;
  } catch {
    return false;
  }
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
  const requestUrl = new URL(request.url);
  const isScheduleAsset = requestUrl.origin === self.location.origin
    && /\/schedule-(?:data|metadata)\.js$/.test(requestUrl.pathname);
  if (isScheduleAsset) {
    const cachedScheduleAsset = await caches.match(request);
    const revalidating = request.cache === "no-cache" || request.cache === "reload";
    // Ordinary script loads use the matched pair installed or atomically
    // refreshed together. The app's explicit no-cache metadata probe may go
    // to the network; if its body changed, complete a paired refresh before
    // returning so tapping the update banner cannot reload into mixed data.
    if (cachedScheduleAsset && !revalidating) return cachedScheduleAsset;
    if (revalidating) {
      try {
        const probe = await fetch(request);
        if (probe?.ok) {
          const changed = !cachedScheduleAsset
            || await probe.clone().text() !== await cachedScheduleAsset.clone().text();
          if (changed && !await refreshSchedule() && cachedScheduleAsset) return cachedScheduleAsset;
          return probe;
        }
        if (cachedScheduleAsset) return cachedScheduleAsset;
        return probe;
      } catch {
        if (cachedScheduleAsset) return cachedScheduleAsset;
      }
    }
  }
  const network = fetch(request).then(response => {
    const url = new URL(request.url);
    const isAppDocument = request.mode === "navigate" || /\/(?:index\.html)?$/.test(url.pathname);
    if (response && response.ok && url.origin === self.location.origin && !isAppDocument && !isScheduleAsset) {
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
