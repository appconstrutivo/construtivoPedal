/* Service worker do Manual do Proprietário — cache leve + Web Push + badge. */

const CACHE = 'cp-manual-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  event.respondWith(
    fetch(req)
      .then((res) => {
        const url = new URL(req.url)
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        return caches.match('/')
      }),
  )
})

async function aplicarBadge(count) {
  try {
    if (typeof self.navigator?.setAppBadge === 'function') {
      const n = Number(count) || 0
      if (n > 0) await self.navigator.setAppBadge(n)
      else if (typeof self.navigator.clearAppBadge === 'function') await self.navigator.clearAppBadge()
    }
  } catch {
    /* iOS / browsers sem suporte */
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {
        title: 'Revisão da bicicleta',
        body: 'Há uma atualização no Manual do Proprietário.',
        url: '/',
        badgeCount: 0,
      }
      try {
        if (event.data) {
          const parsed = event.data.json()
          data = { ...data, ...parsed }
        }
      } catch {
        try {
          const text = event.data?.text()
          if (text) data.body = text
        } catch {
          /* ignore */
        }
      }

      await aplicarBadge(data.badgeCount)

      await self.registration.showNotification(data.title || 'Construtivo Pedal', {
        body: data.body || '',
        icon: '/icons/manual-icon-192.png',
        badge: '/icons/manual-icon-192.png',
        data: { url: data.url || '/' },
        tag: data.tag || 'manual-revisao',
        renotify: true,
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target)
              return
            } catch {
              /* navigate pode falhar em alguns browsers */
            }
          }
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })(),
  )
})
