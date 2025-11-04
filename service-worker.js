self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('ncdc-cache').then(cache => cache.addAll(['/','/index.html','/styles.css','/script.js'])));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(resp => resp || fetch(e.request)));
});