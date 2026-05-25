/* ===========================================
   中新地 飲食店ガイド — Service Worker
   - 静的ファイル: network-first + cache fallback (オフライン対応)
   - API リクエスト: pass-through (常にネット最新)
   - 古いキャッシュは activate 時に削除
   =========================================== */
const CACHE = 'nakashinchi-v33';

const ASSETS = [
  './',
  './index.html',
  './config.js',
  './api-client.js',
  './line-auth.js',
  './favorites.js',
  './pin-modal.js',
  './pwa-register.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS).catch(() => null)
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // 外部 API (Cloudflare Worker) は常にネットワーク (キャッシュしない)
  if (url.hostname.endsWith('.workers.dev')) return;

  // Google Fonts などサードパーティもそのまま通す
  if (url.origin !== self.location.origin) return;

  // 同一オリジンの GET: network-first → 失敗時 cache → 失敗時 404
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || new Response('offline', { status: 503 }))
      )
  );
});
