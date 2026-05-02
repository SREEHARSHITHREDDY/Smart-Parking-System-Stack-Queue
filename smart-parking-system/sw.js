/* ═══════════════════════════════════════════
   Smart Parking System — Service Worker
   Day 29: PWA offline support
═══════════════════════════════════════════ */

const CACHE_NAME = 'smartparking-v3';

const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/app.js',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=JetBrains+Mono:wght@300;400;500;600&family=Rajdhani:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr/dist/jsQR.js',
];

// ── INSTALL — cache static assets ─────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW: some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE — clean old caches ───────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH — serve from cache, fallback network ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always fetch API calls from network — never cache them
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ success: false, message: 'You are offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // For everything else — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});