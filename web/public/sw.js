const CACHE = 'mosa-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/assets/mosa-mascot.png', '/assets/icon-192.png', '/assets/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Private photos and API responses never enter a browser-wide service-worker cache.
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })).catch(() => caches.match('/'))); return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') caches.open(CACHE).then(c => c.put(event.request, response.clone()));
      return response;
    })));
  }
});
