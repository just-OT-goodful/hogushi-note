// Service Worker：アプリ本体をキャッシュしてオフラインでも開けるようにする
// 取得方式は「キャッシュを先に返し、裏で最新を確認して更新」。更新は次回起動時に反映されます。
// 構成ファイルを増減したら ASSETS を更新し、VERSION を上げてください。
const VERSION = 'v4';
const CACHE = `selfcare-${VERSION}`;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/data.js', 'js/store.js', 'js/ui.js', 'js/figure.js', 'js/charts.js', 'js/reminder.js',
  'js/views/home.js', 'js/views/library.js', 'js/views/exercise.js', 'js/views/records.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

// ブラウザの通常キャッシュ（GitHub Pages は10分）を経由せず、常にサーバーから最新を取得して保存する
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((a) => fetch(a, { cache: 'reload' }).then((res) => {
        if (!res.ok) throw new Error(`${a}: ${res.status}`);
        return c.put(a, res);
      }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 他サイト（YouTube 等）・動画のRange要求・GET以外はそのまま通す
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    const res = await fresh;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
