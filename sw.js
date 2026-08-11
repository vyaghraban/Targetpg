// =====================================================================
// Service Worker — app-shell caching only.
//
// This ONLY caches the static shell (this HTML file, manifest, icons) so
// the app installs as a PWA and opens instantly / works offline for the
// UI itself. It deliberately does NOT cache anything from Supabase,
// Cloudinary, or the Cloudflare Worker — all of that always goes
// straight to the network, so your data (questions, images, auth) is
// never served stale from cache.
//
// Bump CACHE_NAME (e.g. 'qbank-shell-v2') any time you change index.html
// or the icons, so old installs pick up the update instead of being
// stuck on a cached copy.
// =====================================================================

const CACHE_NAME = 'qbank-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './favicon-32.png',
  './favicon.png',
  './icon-144.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests for same-origin shell files. Everything else
  // (Supabase API/auth, Cloudinary uploads, the Cloudflare Worker, any
  // third-party script) is left completely untouched and goes to the
  // network exactly as if there were no service worker at all.
  const isShellFile = url.origin === self.location.origin &&
    SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')) || (f === './' && url.pathname === '/'));

  if (event.request.method !== 'GET' || !isShellFile) return;

  // Cache-first, refreshing the cache in the background. Whatever happens,
  // this ALWAYS resolves to a real Response — respondWith() resolving to
  // undefined (which the old version of this file could do, if there was
  // no cached copy yet AND the network request failed at the same moment)
  // is what was causing the browser's hard "can't be reached" error page,
  // fixed only by clearing site data and forcing a fresh install.
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      // Return the cached copy immediately; update the cache quietly for
      // next time. Any network failure here is fine to ignore — the user
      // already has a valid page in front of them.
      fetch(event.request).then((res) => {
        if (res && res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(event.request);
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, res.clone());
      }
      return res;
    } catch (err) {
      // Nothing cached yet AND the network request failed (e.g. a brief
      // connectivity blip) — hand back a real, valid Response instead of
      // letting the browser show its own hard error page.
      return new Response(
        '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center;color:#444;"><h2>Connection hiccup</h2><p>Could not reach the server. Check your connection and reload.</p></body>',
        { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html' } }
      );
    }
  })());
});
