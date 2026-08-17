/* 世桜アプリ（デモ）Service Worker
   ネットワーク優先（オンライン時は常に最新を取得／オフライン時のみキャッシュ）。
   → iPhone等でも更新が即反映される。オフラインでも起動可能。 */
const CACHE = 'yosakura-taiken-v40';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/logo-full.png', './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先：オンラインなら最新を取得しキャッシュ更新、失敗時のみキャッシュへフォールバック。
// 同一オリジン（アプリ本体＝app.js/styles.css/index.html等）はHTTPキャッシュを無視して常に最新を取得
// → GitHub Pagesの10分キャッシュ等による「古い画面が残る」を防ぐ。
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  const doFetch = sameOrigin ? fetch(req, { cache: 'no-store' }) : fetch(req);
  e.respondWith(
    doFetch.then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
  );
});
