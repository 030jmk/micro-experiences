const CACHE_NAME = 'vestaboard-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://appkitcdn.pwc.com/appkit4/cdn/styles/4.10.3/themes/appkit.orange.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Don't cache API calls to Vestaboard
  if (url.hostname === 'rw.vestaboard.com' || url.port === '7000') {
    return;
  }

  // CDN assets: cache-first
  if (url.hostname === 'appkitcdn.pwc.com') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return resp;
        })
      )
    );
    return;
  }

  // App shell: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
