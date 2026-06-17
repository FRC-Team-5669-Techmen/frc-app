// Custom service worker (vite-plugin-pwa injectManifest mode).
// Preserves the previous generateSW behavior — precache via __WB_MANIFEST and
// auto-update on reload — and adds Web Push handling.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// Auto-update: activate the new SW immediately so a reload picks it up, matching
// the prior registerType:'autoUpdate' behavior. (Incognito still shows the true
// current version — the documented stale-cache testing flow is unchanged.)
self.skipWaiting()
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ── Web Push ──────────────────────────────────────────────────────────────
// Payload shape (from the send-push Edge Function):
//   { title, body, url, tag, icon }
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} }
  catch { payload = { body: event.data && event.data.text() } }

  const title = payload.title || 'Techmen · 5669'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag,                       // replaces a same-tag notification on device
    data: { url: payload.url || '/dashboard' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsArr) {
      if ('focus' in client) {
        if ('navigate' in client) { try { await client.navigate(url) } catch { /* cross-origin */ } }
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
