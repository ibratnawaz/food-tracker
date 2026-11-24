// Thali service worker: offline app shell + network-first API reads with cached fallback.
const VERSION = 'thali-v2';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // API: network first, fall back to the last good response so the app still reads offline.
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/export') return;
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION + '-api').then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.open(VERSION + '-api').then((c) => c.match(req)).then((hit) => hit ||
        new Response(JSON.stringify({ error: 'You’re offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))),
    );
    return;
  }

  // Navigations: serve the shell (SPA), refresh it in the background.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // Static: network first (fresh after updates), cache fallback when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)),
  );
});
