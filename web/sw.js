// Offline support for the installed app. vite.config.ts fills in VERSION and PRECACHE at build time
// and emits this as sw.js next to index.html, so it controls only the app's own folder.
// The app shell is cached on install; anything else from this origin is cached the first time it loads.
const VERSION = __VERSION__
const PRECACHE = __PRECACHE__
const CACHE = `calmlist-${VERSION}`
const SCOPE = new URL('./', location.href).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('calmlist-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Sync, AI providers, model downloads and the API stay on the network.
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return

  // Pages: the network first, so a new deploy shows up at once; the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((cache) => cache.put('./', res.clone()))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  // Built files have content hashes in their names, so a cached copy never goes stale.
  event.respondWith(
    caches.match(req).then((hit) =>
      hit ??
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      }),
    ),
  )
})
