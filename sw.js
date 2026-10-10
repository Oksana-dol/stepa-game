// The local shell and available prototype media are cached; planned media remain explicitly incomplete.
const PREFIX = 'stepa-shell-v3-';
const READY = '/__stepa_ready__';
self.addEventListener('install', () => { /* Update waits until existing pages close. */ });
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
 if (event.data?.type !== 'PREPARE') return;
 event.waitUntil((async () => {
  try {
   const response = await fetch('/offline-list.json', { cache: 'no-store' });
   if (!response.ok) throw new Error('List unavailable');
   const files = await response.json();
   const manifestResponse = await fetch('/content/assets-manifest.json', { cache: 'no-store' });
   const manifest = manifestResponse.ok ? await manifestResponse.json() : { images: [] };
   const available = new Set(files);
   const missing = (manifest.images || []).filter(item => !available.has('/' + item.path.replace(/^public\//, ''))).map(item => item.path);
   const cacheName = PREFIX + Date.now();
   const cache = await caches.open(cacheName);
   // Download and verify everything before exposing the cache as ready.
   const downloaded = await Promise.all(files.map(async url => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing resource: ' + url);
    const body = await response.clone().arrayBuffer();
    if (!body.byteLength) throw new Error('Empty resource: ' + url);
    return [url, response];
   }));
   for (const [url, response] of downloaded) await cache.put(url, response);
   await cache.put('/', await cache.match('/index.html'));
   await cache.put(READY, new Response('ready'));
   for (const key of await caches.keys()) {
    if (key.startsWith(PREFIX) && key !== cacheName) await caches.delete(key);
   }
   event.ports[0]?.postMessage({ ok: true, missing });
  } catch (error) { event.ports[0]?.postMessage({ ok: false, error: String(error) }); }
 })());
});
self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
 event.respondWith((async () => {
  try { return await fetch(event.request); }
  catch {
   const cacheNames = (await caches.keys()).filter(key => key.startsWith(PREFIX)).sort().reverse();
   for (const name of cacheNames) {
    const cache = await caches.open(name);
    if (!(await cache.match(READY))) continue;
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
   }
   return new Response('Материал не сохранён для работы без сети', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
 })());
});
