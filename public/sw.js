/* global self, caches, fetch, URL, Response */
// Offline support. Caches immutable application assets only — never user data, which
// lives in IndexedDB. A new version installs in the background and waits; the page asks the user to
// reload when they are ready (after pausing and saving), then sends SKIP_WAITING.
const PREFIX = 'ca-studio-app-';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch('precache.json', { cache: 'no-cache' });
      const manifest = await res.json();
      const cache = await caches.open(PREFIX + manifest.id);
      await cache.addAll(manifest.files.map((f) => new URL(f, self.registration.scope).href));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch('precache.json', { cache: 'no-cache' }).catch(() => null);
      const current = res && res.ok ? PREFIX + (await res.json()).id : null;
      const keys = await caches.keys();
      // Keep the cache this worker installed; drop older app versions. Never touch other caches.
      const mine = keys.filter((k) => k.startsWith(PREFIX));
      const keep = current && mine.includes(current) ? current : mine[mine.length - 1];
      await Promise.all(mine.filter((k) => k !== keep).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function fromCache(request) {
  const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX));
  for (const k of keys.reverse()) {
    const hit = await (await caches.open(k)).match(request, { ignoreSearch: true });
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/precache.json') || url.pathname.endsWith('/sw.js') || url.pathname === '/healthz') return;
  if (req.mode === 'navigate') {
    // Network first so a deployed update is seen; fall back to the cached app shell offline.
    event.respondWith(fetch(req).catch(async () => (await fromCache(new URL('index.html', self.registration.scope).href)) || Response.error()));
    return;
  }
  event.respondWith((async () => (await fromCache(req)) || fetch(req))());
});
