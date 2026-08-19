/* AgriGuard Service Worker — offline support for low-connectivity areas.
 * Strategy:
 *  - API GET requests: network-first, cache the latest good response, fall back to cache when offline.
 *  - Hashed build assets (/assets/*): cache-first (immutable content hashes).
 *  - Everything else (incl. page navigations): network-first with cache fallback.
 * Network-first everywhere keeps dev HMR and data fresh; the cache only serves as an offline fallback.
 *
 * On total failure we resolve with a synthetic 503 Response instead of rejecting —
 * respondWith() rejections spam the console with "Uncaught (in promise)" errors and
 * break the FetchEvent contract. A clean 503 lets axios/fetch handle it as a normal
 * error response and keeps the offline fallback logic in the app working.
 */

const SW_VERSION = 'agriguard-v2';
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

function offlineResponse() {
  return new Response(
    JSON.stringify({ error: 'offline', detail: 'Network unreachable and no cached copy available.' }),
    {
      status: 503,
      statusText: 'Service Unavailable (offline)',
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) => cache.addAll(['/', '/index.html']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(SW_VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && (response.status === 200 || response.status === 0)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Offline navigation fallback → serve the app shell
    if (request.mode === 'navigate') {
      const shell = await cache.match('/index.html');
      if (shell) return shell;
    }
    return offlineResponse();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return offlineResponse();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never intercept Vite dev plumbing or HMR
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules') || url.pathname.startsWith('/src/')) return;

  // API data: freshest possible, cached for offline
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // Content-hashed build assets: safe to cache aggressively
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Map tiles & fonts: cache-first with generous reuse (big win on 2G)
  if (
    url.hostname.includes('tile') ||
    url.hostname.includes('arcgis') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic')
  ) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});
