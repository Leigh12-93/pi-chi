const SW_VERSION = '1.0.1'
const CACHE_NAME = 'pi-chi-v' + SW_VERSION
const PRECACHE = ['/', '/icons/icon-192.png', '/icons/icon-512.png']
const MAX_STATIC_ENTRIES = 50

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('pi-chi-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => {
      // Notify all clients that SW updated
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }))
      })
    })
  )
  self.clients.claim()
})

// Evict oldest cache entries when over limit
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)))
  }
}

self.addEventListener('fetch', (e) => {
  // Network-first for navigation and API, cache-first for static assets
  if (e.request.mode === 'navigate' || e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')))
    return
  }
  if (e.request.url.match(/\.(js|css|png|svg|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then(r => {
        if (r) return r
        return fetch(e.request).then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, clone)
            trimCache(CACHE_NAME, MAX_STATIC_ENTRIES)
          })
          return response
        })
      })
    )
    return
  }
  e.respondWith(fetch(e.request))
})
