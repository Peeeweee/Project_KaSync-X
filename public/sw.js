const CACHE_NAME = 'kasync-shell-v2';
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];
const TRACKING_URLS = [
  '/hand_landmarker.task',
  '/wasm/vision_wasm_internal.js',
  '/wasm/vision_wasm_internal.wasm',
  '/wasm/vision_wasm_nosimd_internal.js',
  '/wasm/vision_wasm_nosimd_internal.wasm',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_URLS);

    const optionalUrls = [...TRACKING_URLS];
    try {
      const manifestResponse = await fetch('/.vite/manifest.json', { cache: 'no-store' });
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        let entryFile = null;
        Object.values(manifest).forEach(entry => {
          if (entry.file) optionalUrls.push(`/${entry.file}`);
          if (entry.isEntry) entryFile = entry.file;
          (entry.css || []).forEach(file => optionalUrls.push(`/${file}`));
          (entry.assets || []).forEach(file => optionalUrls.push(`/${file}`));
        });
        if (entryFile) {
          const entrySource = await (await fetch(`/${entryFile}`, { cache: 'no-store' })).text();
          for (const match of entrySource.matchAll(/assets\/handTracking\.worker-[a-zA-Z0-9_-]+\.js/g)) {
            optionalUrls.push(`/${match[0]}`);
          }
        }
      }
    } catch {
      // The shell still installs if an optional asset list is unavailable.
    }

    await Promise.allSettled([...new Set(optionalUrls)].map(url => cache.add(url)));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('kasync-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
