const SHELL_CACHE = 'agrogis-shell-v1';
const RUNTIME_CACHE = 'agrogis-runtime-v1';
const SHELL_FILES = [
	'./',
	'./index.html',
	'./offline.html',
	'./manifest.json',
	'./css/style.css',
	'./assets/agrogis-icon.svg',
	'./assets/agrogis-192.png',
	'./assets/agrogis-512.png',
	'./js/app.js',
	'./js/core/state-store.js',
	'./js/components/event-bus.js',
	'./js/components/map-engine.js',
	'./js/services/api.js',
	'./js/services/auth.js',
	'./js/services/backend-api.js',
	'./js/services/circuit-breaker.js',
	'./js/services/offline-sync.js'
];
const CDN_HOSTS = new Set([
	'cdn.tailwindcss.com',
	'cdn.jsdelivr.net',
	'unpkg.com',
	'cdnjs.cloudflare.com',
	'fonts.googleapis.com',
	'fonts.gstatic.com'
]);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(SHELL_CACHE)
			.then((cache) => cache.addAll(SHELL_FILES))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		const cacheNames = await caches.keys();
		await Promise.all(cacheNames
			.filter((name) => name.startsWith('agrogis-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(name))
			.map((name) => caches.delete(name)));
		await self.clients.claim();
	})());
});

async function networkFirst(request, cacheName, fallbackUrl = null) {
	const cache = await caches.open(cacheName);
	try {
		const response = await fetch(request);
		if (response.ok || response.type === 'opaque') {
			try {
				await cache.put(request, response.clone());
			} catch {}
		}
		return response;
	} catch {
		const cachedResponse = await cache.match(request);
		if (cachedResponse) return cachedResponse;
		if (fallbackUrl) {
			const fallback = await caches.match(fallbackUrl);
			if (fallback) return fallback;
		}
		return Response.error();
	}
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) {
		if (CDN_HOSTS.has(url.hostname)) {
			event.respondWith(networkFirst(request, RUNTIME_CACHE));
		}
		return;
	}

	if (url.pathname.includes('/api/')) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(
			request,
			SHELL_CACHE,
			new URL('./offline.html', self.registration.scope).href
		));
		return;
	}

	event.respondWith(networkFirst(request, SHELL_CACHE));
});
