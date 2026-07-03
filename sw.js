const CACHE_NAME = "stage-schedule-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=16",
  "./camp-location.js?v=16",
  "./schedule-data.js?v=16",
  "./app.js?v=16",
  "./planner.js?v=16",
  "./install.js?v=16",
  "./manifest.webmanifest",
  "./favicon.ico?v=16",
  "./favicon-32.png?v=16",
  "./favicon-16.png?v=16",
  "./apple-touch-icon.png?v=16",
  "./icon-192.png?v=16",
  "./icon-512.png?v=16"
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

// Prefer fresh files while online, but retain a complete cached copy for
// offline use after the first successful visit.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./");
        return Response.error();
      }))
  );
});
