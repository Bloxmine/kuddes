/*
 * Kuddes service worker. Makes the site installable and quick to start:
 *  - built files (/assets/…, hashed) and icons: from the cache, fetched once;
 *  - pages: from the network, with the last app shell as fallback, and an
 *    offline page when there's nothing at all;
 *  - /api, /uploads and the rest: straight to the network, never cached,
 *    so nobody's private data ends up in a cache.
 */
const VERSION = 'kuddes-v1'
const SHELL = `${VERSION}-shell`
const STATIC = `${VERSION}-static`
const PRECACHE = ['/offline.html', '/offline.css', '/kuddes-logo.png', '/favicon.svg', '/pwa/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isStatic = (url) => url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/smileys/') || url.pathname.startsWith('/sounds/') || url.pathname.startsWith('/pwa/')

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Pages: network first; offline, the cached app shell or the offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL).then((cache) => cache.put('/', copy))
          }
          return response
        })
        .catch(async () => (await caches.match('/', { cacheName: SHELL })) ?? (await caches.match('/offline.html'))),
    )
    return
  }

  // Hashed build files and icons never change: cache first
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
  }
  // Everything else (API, uploads, BuddyPoke): the browser handles it as usual
})

// A browser notification (src/lib/browserNotify.ts) was clicked: to that page, in an open tab if there is one
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) {
        // The page goes there itself, without reloading (useBrowserNotifications)
        open.postMessage({ kuddes: 'navigate', url })
        return open.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
