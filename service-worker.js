/**
 * ==========================================================================
 * Weather Dashboard - Progressive Web Application Service Worker
 * Phase 21: PWA Implementation (App Shell, Cache Versioning, Update Lifecycle)
 * ==========================================================================
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE_NAME = `weather-dashboard-static-${CACHE_VERSION}`;

/**
 * Core static application shell assets cached for offline execution.
 * Only immutable static files, icons, and local vendor bundles are cached.
 */
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './vendor/chart.umd.min.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

/**
 * External API domains that must NEVER be cached in Service Worker storage.
 * - Prevents showing stale weather data as live observations.
 * - Prevents caching weather/air-quality forecasts indefinitely.
 * - Prevents storing sensitive GPS geolocation coordinates from reverse geocoding.
 */
const BYPASS_API_HOSTS = [
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'api.bigdatacloud.net'
];

/**
 * 1. Service Worker Installation
 * Pre-caches the static application shell.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => {
        console.warn('[ServiceWorker] Pre-caching static assets failed:', err);
      })
  );
});

/**
 * 2. Service Worker Activation & Cache Versioning
 * Purges obsolete caches from earlier versions and claims clients.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

/**
 * 3. Update Lifecycle Handling
 * Responds to client message asking waiting worker to activate immediately.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * 4. Request Routing & Fetch Interception
 */
self.addEventListener('fetch', (event) => {
  // Only handle GET requests; bypass everything else
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Critical Constraint: API Bypass
  // External weather, air-quality, and reverse-geocoding requests ALWAYS bypass SW cache
  // to prevent stale data representation and protect sensitive geolocation coordinates.
  // Returning without calling event.respondWith() allows the browser's default network pipeline
  // to process the request directly without Service Worker interference.
  const isBypassApi = BYPASS_API_HOSTS.some((host) => url.hostname.includes(host));
  if (isBypassApi) {
    return;
  }

  // Navigation requests: Network-first falling back to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('./index.html') || await caches.match('./');
          if (cachedIndex) return cachedIndex;
          return new Response('Offline - Weather Dashboard App Shell Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Same-origin static asset requests: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failure: cached response (if available) will be served
          return null;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
