const CACHE = 'vr-matournee-v1-0';
const FILES = ['./', './index.html', './styles.css', './app.js', './news-config.js', './manifest.webmanifest', './assets/logo-vb-renaissance.png', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png', './assets/favicon-64.png'];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (event) => { if(event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return; event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))); });
