// 优化的Service Worker - 支持多层缓存策略
const CACHE_NAME_STATIC = 'christmas-tree-static-v2';
const CACHE_NAME_DYNAMIC = 'christmas-tree-dynamic-v2';
const CACHE_NAME_MEDIAPIPE = 'christmas-tree-mediapipe-v2';

// 静态资源 - 长期缓存
const STATIC_URLS = [
    './',
    './index.html',
    './favicon.ico',
    './sw.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js',
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap'
];

// MediaPipe文件 - 按需缓存
const MEDIAPIPE_URLS = [
    './wasm/vision_wasm_internal.wasm',
    './wasm/vision_wasm_internal.js',
    './wasm/hand_landmarker.task'
];

// 音频文件 - 条件缓存
const AUDIO_URLS = [
    './christmas-443109.mp3'
];

// 网络优先的资源（CDN资源）
const NETWORK_FIRST_URLS = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm'
];

// Install event - 缓存静态资源
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        Promise.all([
            // 缓存静态资源
            caches.open(CACHE_NAME_STATIC)
                .then((cache) => {
                    console.log('Caching static files...');
                    return cache.addAll(STATIC_URLS);
                }),

            // 预缓存MediaPipe文件（可选）
            caches.open(CACHE_NAME_MEDIAPIPE)
                .then((cache) => {
                    console.log('Pre-caching MediaPipe files...');
                    // 只在网络条件好的时候预缓存
                    return navigator.onLine ?
                        cache.addAll(MEDIAPIPE_URLS).catch(() => {
                            console.log('MediaPipe预缓存跳过（离线或网络慢）');
                        }) :
                        Promise.resolve();
                })
        ])
        .then(() => {
            console.log('Service Worker installation completed');
            return self.skipWaiting();
        })
        .catch((error) => {
            console.error('Service Worker installation failed:', error);
        })
    );
});

// Activate event - 清理旧缓存
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 删除旧版本的缓存
                    if (cacheName !== CACHE_NAME_STATIC &&
                        cacheName !== CACHE_NAME_DYNAMIC &&
                        cacheName !== CACHE_NAME_MEDIAPIPE) {
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

// 优化的Fetch event
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // 网络优先策略 - CDN资源
    if (NETWORK_FIRST_URLS.some(networkUrl => url.includes(networkUrl))) {
        event.respondWith(networkFirstStrategy(event.request));
        return;
    }

    // 缓存优先策略 - 静态资源
    if (STATIC_URLS.some(staticUrl => url.includes(staticUrl))) {
        event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME_STATIC));
        return;
    }

    // 缓存优先策略 - MediaPipe文件
    if (MEDIAPIPE_URLS.some(mediaUrl => url.includes(mediaUrl))) {
        event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME_MEDIAPIPE));
        return;
    }

    // 音频文件 - 条件缓存
    if (AUDIO_URLS.some(audioUrl => url.includes(audioUrl))) {
        event.respondWith(audioCacheStrategy(event.request));
        return;
    }

    // 动态资源 - 网络优先但缓存备用
    if (url.startsWith(self.location.origin) ||
        url.includes('fonts.googleapis.com') ||
        url.includes('fonts.gstatic.com')) {
        event.respondWith(networkFirstCacheFallbackStrategy(event.request));
        return;
    }
});

// 缓存优先策略
function cacheFirstStrategy(request, cacheName) {
    return caches.match(request)
        .then((response) => {
            if (response) {
                console.log('Serving from cache:', request.url);
                return response;
            }

            return fetch(request).then((response) => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(cacheName)
                    .then((cache) => {
                        cache.put(request, responseToCache);
                    });

                return response;
            });
        })
        .catch((error) => {
            console.error('Cache first strategy failed:', error);
        });
}

// 网络优先策略
function networkFirstStrategy(request) {
    return fetch(request)
        .then((response) => {
            if (response && response.status === 200) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME_DYNAMIC)
                    .then((cache) => {
                        cache.put(request, responseToCache);
                    });
                return response;
            }
        })
        .catch(() => {
            // 网络失败，回退到缓存
            return caches.match(request);
        });
}

// 网络优先但缓存备用策略
function networkFirstCacheFallbackStrategy(request) {
    return fetch(request)
        .then((response) => {
            if (response && response.status === 200) {
                // 成功获取，缓存起来
                const responseToCache = response.clone();
                caches.open(CACHE_NAME_DYNAMIC)
                    .then((cache) => {
                        cache.put(request, responseToCache);
                    });
                return response;
            }
        })
        .catch(() => {
            // 网络失败，尝试从缓存获取
            return caches.match(request);
        });
}

// 音频文件缓存策略 - 只在用户交互后缓存
function audioCacheStrategy(request) {
    return caches.match(request)
        .then((response) => {
            if (response) {
                return response;
            }

            // 检查是否应该缓存音频（用户已交互）
            return fetch(request).then((response) => {
                if (response && response.status === 200) {
                    // 延迟缓存音频文件，避免阻塞初始加载
                    setTimeout(() => {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME_DYNAMIC)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                            });
                    }, 1000);

                    return response;
                }
                return response;
            });
        });
}
