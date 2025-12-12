// Service Worker for caching MediaPipe WASM files
const CACHE_NAME = 'mediapipe-cache-v1';
const CACHE_URLS = [
    './wasm/vision_wasm_internal.wasm',
    './wasm/vision_wasm_internal.js',
    './wasm/hand_landmarker.task'
];

// Install event - cache MediaPipe files
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching MediaPipe files...');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                console.log('MediaPipe files cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Failed to cache MediaPipe files:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Fetch event - serve cached files
self.addEventListener('fetch', (event) => {
    // Only cache MediaPipe files
    if (CACHE_URLS.some(url => event.request.url.includes(url))) {
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    // Return cached version or fetch from network
                    if (response) {
                        console.log('Serving from cache:', event.request.url);
                        return response;
                    }

                    return fetch(event.request).then((response) => {
                        // Don't cache if response is not ok
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response for caching
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    });
                })
                .catch((error) => {
                    console.error('Fetch failed:', error);
                    // If both cache and network fail, you might want to serve a fallback
                })
        );
    }
});
