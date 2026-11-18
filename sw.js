// Bump this on every change to the app's files: a changed sw.js is what makes installed copies update.
// Pushing only 5x5-data.json needs no bump.
const CACHE = '5x5-v13';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's HTTP cache, so the new version never caches a stale file.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache straight away, refresh the cache in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Workout data always comes straight from the network so a pushed backup shows up at once.
  if (url.pathname.endsWith('/5x5-data.json')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
