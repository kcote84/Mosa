importScripts('/share-inbox-worker.js');
const CACHE = 'mosa-shell-v3';
const SHELL = ['/', '/manifest.webmanifest', '/assets/mosa-mascot.png', '/assets/icon-192.png', '/assets/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mosa-shell-') && k !== CACHE).map(k => caches.delete(k)))),
  self.MosaShareInbox.cleanup().catch(() => {})
]).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.origin === location.origin && url.pathname === '/share-target') {
    event.respondWith(self.MosaShareInbox.receive(event.request)); return;
  }
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
