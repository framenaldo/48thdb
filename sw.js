/* 48thDb service worker.
 *
 * The point of caching here is that the site opens without a connection. The
 * trap is the other half of that bargain: a cache-first page would keep serving
 * the copy it already has, so a deploy would reach nobody until they cleared
 * their browser. The page itself is therefore fetched from the network first
 * and only falls back to the cache when the network cannot answer.
 */

const VERSION = 'v11';
const PAGES = `48thdb-pages-${VERSION}`;
const ASSETS = `48thdb-assets-${VERSION}`;

// Hosts whose responses are safe to keep: versioned font files and pinned SDK
// builds. Firestore is deliberately absent — its traffic is live data on its
// own transport, and caching it would serve stale members and events.
const CACHEABLE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',
];

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close, so a fix is not held hostage by a forgotten open tab.
  self.skipWaiting();
  event.waitUntil(
    caches.open(PAGES).then(cache => cache.addAll(['./', './index.html']).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => n.startsWith('48thdb-') && n !== PAGES && n !== ASSETS)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** The page: network first, cache as a safety net. */
async function pageFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put('./index.html', fresh.clone());
    return fresh;
  } catch (err) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

/** Fonts and pinned SDKs: serve what we have, refresh it in the background. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

/* Our own assets: serve what we have, then refresh it for next time.
 *
 * These used to be cache-first, on the reasoning that a changed icon would come
 * with a version bump. It did not: a poster was replaced in place, the bump was
 * forgotten, and every installed app kept serving the old picture with no way
 * back short of clearing data. Revalidating costs one background request and
 * removes that whole class of mistake — a replaced file heals itself on the
 * next visit whether or not anyone remembered the version.
 */
async function assetFresh(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(res => { if (res && res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

/** Data that changes daily: network first, the last good copy offline. */
async function dataFirst(request) {
  const cache = await caches.open(ASSETS);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') { event.respondWith(pageFirst(request)); return; }

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;   // never serve the worker from cache
    // Who is on air is asked for again every couple of minutes, each time with a
    // fresh ?t= so the CDN cannot answer from its own copy. Kept, every one of
    // those would be a new cache entry that nothing ever asks for again, so
    // these go straight to the network and are never stored.
    if (/\/data\/(live-now|iam-live)\.json$/.test(url.pathname)) return;
    // the rest of data/ is rebuilt daily; yesterday's copy is only for when there is no network
    if (url.pathname.includes('/data/')) { event.respondWith(dataFirst(request)); return; }
    event.respondWith(assetFresh(request));
    return;
  }

  if (CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Everything else, Firestore included, goes straight to the network.
});
