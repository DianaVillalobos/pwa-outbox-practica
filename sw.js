const CACHE_VERSION = 'v1';

self.addEventListener(
    'install',
    (event) => {
        console.log('SW ha sido instalado')
        //self.skipWaiting();
        event.waitUntil(
            caches.open(CACHE_VERSION)
                .then((cache) => {
                    return cache.addAll([
                        './',
                        './index.html',
                        './styles.css',
                        './db-helper.js',
                        './app.js',
                        './manifest.json'
                    ]);
                })
        )
    }
);

self.addEventListener(
    'activate',
    (event) => {
        console.log('SW ha sido activado')
        event.waitUntil(
            caches.keys()
                .then((keys) => {
                    return Promise.all(
                        keys.map((key) => {
                            if (key !== CACHE_VERSION) {
                                return caches.delete(key);
                            }
                        }),
                    );
                })
        );
    }
);

self.addEventListener(
    'fetch',
    (event) => {
        // AGREGADO: los POST no se cachean, pasan directo a la red
        // (si fallan, los rescata el patrón Outbox en app.js)
        if (event.request.method !== 'GET') return;

        console.log('SW ha interceptado la petición')
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    return response || fetch(event.request);
                }),
        );
    }
);