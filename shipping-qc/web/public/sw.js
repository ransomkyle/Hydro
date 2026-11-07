/* DAD Shipping QC service worker: lets the app shell open with no network. API data is cached by the app itself (IndexedDB). */
const CACHE = 'qc-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const html = await (await fetch('/', { cache: 'no-cache' })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
    // also precache what the stylesheets pull in (brand fonts), so the first offline load is fully styled
    const extra = [];
    for (const a of assets.filter((x) => x.endsWith('.css'))) {
      const css = await (await fetch(a)).text();
      extra.push(...[...css.matchAll(/url\((\/[^)]+)\)/g)].map((m) => m[1]));
    }
    await cache.addAll(['/', '/dad-logo.png', ...new Set([...assets, ...extra])]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        (await caches.open(CACHE)).put('/', res.clone());
        return res;
      } catch { return (await caches.match('/')) || Response.error(); }
    })());
    return;
  }
  // hashed build assets: cache-first
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});
