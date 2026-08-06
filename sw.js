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

const CACHE_NAME = 'qbank-shell-v1';
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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached); // offline -> fall back to cache
      return cached || network; // cache-first, but refresh in background
    })
  );
});
