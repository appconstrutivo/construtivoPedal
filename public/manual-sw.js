/* Service worker mínimo — habilita "Adicionar à tela inicial" no Android/Chrome.
   Escopo: apenas o Manual do Proprietário (páginas com ?manual=). */

const CACHE = 'cp-manual-v1'

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
        // Cache leve só da shell (HTML/JS/CSS) — dados do manual vêm da rede/RPC
        if (res.ok && (url.origin === self.location.origin)) {
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
