/**
 * Service Worker - Carte Topographique 3D Interactive
 * Projet Rando Zaghfouland - ITZER (Moyen Atlas, Maroc)
 * Cache complet hors-ligne (Offline PWA)
 */

const CACHE_NAME = 'itzer-3d-v3.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './web_data.js',
  './textures_data.js',
  './zone_rando.geojson',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './lib/three.min.js',
  './lib/OrbitControls.js',
  './lib/chart.min.js',
  './lib/maplibre-gl.js',
  './lib/maplibre-gl.css',
  './lib/qrcode.min.js',
  './satellite_route_z12.jpg',
  './satellite_z12.jpg',
  './topomap_contours_z12.jpg',
  './slope_map_z12.jpg',
  './hillshade_z12.jpg',
  './osm_z12.jpg'
];

// 1. Install Event: Cache Core Assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching offline hiking assets');
        return cache.addAll(PRECACHE_ASSETS).catch(err => {
          console.warn('[SW] Some precache assets failed to load:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-First for core code assets, Cache-First for heavy textures/libs
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // External APIs (e.g. Open-Meteo) -> Network-First with fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Core code assets (HTML, CSS, JS) -> Network-First so users instantly receive updates
  const isCoreAsset = url.pathname.endsWith('.html') ||
                      url.pathname.endsWith('.css') ||
                      url.pathname.endsWith('.js') ||
                      url.pathname.endsWith('.json') ||
                      url.pathname === '/' ||
                      url.pathname.endsWith('/');

  if (isCoreAsset) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Heavy media/textures/libraries -> Cache-First with background update
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache for next load
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => { /* Offline, no problem */ });
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(err => {
        // If navigation request fails, return cached index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });
    })
  );
});
