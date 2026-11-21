/* Keeps a copy of the app on the phone so it opens without internet.
   App files: try the network first (so updates arrive), fall back to the saved copy when offline.
   The big payslip-reader files: saved the first time they are used, then served from the phone. */
var CACHE = 'bills-v2';
var CORE = ['./', 'index.html', 'styles.css', 'app.js', 'i18n.js', 'i18n-payslip.js', 'i18n-more.js', 'payslip.js',
  'manifest.json', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'vendor/tesseract/tesseract.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.url.indexOf('/vendor/') > -1) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
  }));
});
