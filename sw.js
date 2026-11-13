/* 48thDb service worker.
 *
 * The point of caching here is that the site opens without a connection. The
 * trap is the other half of that bargain: a cache-first page would keep serving
 * the copy it already has, so a deploy would reach nobody until they cleared
 * their browser. The page itself is therefore fetched from the network first
 * and only falls back to the cache when the network cannot answer.
 */

const VERSION = 'v16';
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

/* The page: still the network's word first — but the word asked for is a few bytes, not the page.
 *
 * The page is some 700 KB over the wire and the host sends no validator with it, so every visit used to download all of
 * it again, changed or not. Each deploy now stamps the page with its build (<meta name="build">, a hash of the file) and
 * publishes the same stamp as /version.txt. A visit asks for version.txt (never cached); when it names the build of the
 * copy kept here, that copy is the page and nothing else is downloaded. Any doubt — no answer in three seconds, an answer
 * that is not a stamp, a different stamp, no copy — and the page is fetched from the network exactly as before, so a
 * deploy still reaches everyone on their next visit. The stamp kept is read out of the page that was kept, never from
 * version.txt, so the two cannot disagree. */
const STAMP = /^[0-9a-f]{16,64}$/;
const appRoute = (path) => !/\.[a-z0-9]+$/i.test(path) && !/^\/(m|p)\//.test(path) && path !== '/privacy';
async function liveBuild() {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000);
  try {
    const res = await fetch('/version.txt?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
    const v = res.ok ? (await res.text()).trim() : '';
    return STAMP.test(v) ? v : '';
  } catch (err) { return ''; } finally { clearTimeout(t); }
}
async function keepPage(cache, fresh) {
  const copy = fresh.clone(), text = await fresh.clone().text();
  const m = /<meta name="build" content="([0-9a-f]{16,64})">/.exec(text.slice(0, 2000));
  await cache.put('./index.html', copy);
  if (m) await cache.put('./build', new Response(m[1])); else await cache.delete('./build');
}
async function pageFirst(request) {
  const cache = await caches.open(PAGES);
  const path = new URL(request.url).pathname;
  const app = path === '/' || path === '/index.html' || appRoute(path);
  try {
    if (app) {
      const [kept, stamp, live] = await Promise.all([cache.match('./index.html'), cache.match('./build').then(r => r ? r.text() : ''), liveBuild()]);
      if (kept && live && stamp === live) return kept;
    }
    const fresh = await fetch(request);
    // only the app itself is the offline copy — not /m/<id> or /p/<id>, which are pages of their own
    if (fresh && fresh.ok && !fresh.redirected && app && /text\/html/.test(fresh.headers.get('content-type') || '')) await keepPage(cache, fresh).catch(() => {});
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
/* The host answers an address with no file behind it with the site's page
 * (status 200), so the clean addresses work. That is never an image or data,
 * and must not be kept as one. */
const real = (request, res) => res && res.ok && !(/text\/html/.test(res.headers.get('content-type') || '') && !/\.html?$|\/$/.test(new URL(request.url).pathname));

async function assetFresh(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(res => { if (real(request, res)) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

/** Data that changes daily: network first, the last good copy offline. */
async function dataFirst(request) {
  const cache = await caches.open(ASSETS);
  try {
    const fresh = await fetch(request);
    if (real(request, fresh)) cache.put(request, fresh.clone());
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
    // the poster clips are fetched once, to be shared; a phone need not keep them
    if (url.pathname.endsWith('.mp4')) return;
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

/* ---- push: "starting soon" notifications (worker/push.js) ----
 * The wake-up from the push service carries nothing. Ask the Worker for the message queued for this browser and
 * show it; if that cannot be reached, still show something — a push must always end in a notification. */
const PUSH_API = 'https://api.48thdb.com/push/msg';
async function pushKey(endpoint) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(d)].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function showPush() {
  let m = { title: '48thDb', body: 'มีอะไรใหม่ในเว็บ', url: '/' };
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) {
      const res = await fetch(PUSH_API, { method: 'POST', body: JSON.stringify({ k: await pushKey(sub.endpoint) }) });
      if (res.ok) m = { ...m, ...(await res.json()) };
    }
  } catch (err) { /* the default above */ }
  return self.registration.showNotification(m.title, {
    body: m.body, icon: '/icon4-192.png', badge: '/icon4-192.png', tag: m.tag || '48thdb', data: { url: m.url || '/' },
  });
}
self.addEventListener('push', (event) => { event.waitUntil(showPush()); });
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (c.url.startsWith(self.location.origin) && 'focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* stays where it is */ } } return; }
    await self.clients.openWindow(url);
  })());
});
