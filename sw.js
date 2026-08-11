// =====================================================================
// Service Worker — icons/manifest caching ONLY. Deliberately does NOT
// intercept the main page (index.html) load at all.
//
// Why: intercepting the HTML navigation request is the highest-risk part
// of a service worker — any small bug in that path (a cache miss lining
// up with a slow network response, a stale cached entry, etc.) can make
// the browser show a hard "This site can't be reached" / ERR_FAILED
// error screen instead of your app, with no way to recover except
// clearing site data. That's exactly what kept happening.
//
// This version sidesteps the whole problem: the browser always loads
// index.html itself, natively, with its own robust network handling —
// never through this file. All this service worker does is cache the
// icon/manifest files (which is enough for "Add to Home Screen" /
// installability) and otherwise stay out of the way.
// =====================================================================

const CACHE_NAME = 'qbank-shell-v3';
const CACHE_FILES = [
  './manifest.json',
  './favicon-32.png',
  './favicon.png',
  './icon-144.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each file independently — if one is missing (404) or fails,
    // it's skipped rather than failing the whole install step (which is
    // what a single failed cache.addAll() would otherwise do).
    await Promise.all(CACHE_FILES.map(async (f) => {
      try {
        const res = await fetch(f, { cache: 'no-store' });
        if (res && res.ok) await cache.put(f, res);
      } catch (err) { /* skip — not fatal */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);

    // Only ever handle GET requests for the small set of cached icon/
    // manifest files, same-origin only. Everything else — including the
    // main HTML page, Supabase, Cloudinary, the Cloudflare Worker, any
    // script — is left completely untouched and goes straight to the
    // network exactly as if this service worker didn't exist.
    const isCacheable = event.request.method === 'GET' &&
      url.origin === self.location.origin &&
      CACHE_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')));

    if (!isCacheable) return;

    event.respondWith((async () => {
      try {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return await fetch(event.request);
      } catch (err) {
        // Absolute last resort — never let this handler produce an
        // unhandled rejection or an undefined response.
        return fetch(event.request);
      }
    })());
  } catch (err) {
    // If anything above throws unexpectedly, don't intercept at all —
    // let the browser handle the request natively.
  }
});
