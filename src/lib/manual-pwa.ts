/** PWA leve só para o Manual do Proprietário (atalho na tela inicial). */

export type ManualInstallKind = 'prompt' | 'ios' | 'manual' | 'installed' | 'unsupported'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let listening = false

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return mq || iosStandalone
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const webkit = /WebKit/.test(ua)
  const chromeIos = /CriOS|FxiOS|EdgiOS/.test(ua)
  return iOS && webkit && !chromeIos
}

export function ensureInstallPromptListener() {
  if (typeof window === 'undefined' || listening) return
  listening = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    window.dispatchEvent(new CustomEvent('cp-manual-install-available'))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new CustomEvent('cp-manual-installed'))
  })
}

export function getManualInstallKind(): ManualInstallKind {
  if (typeof window === 'undefined') return 'unsupported'
  if (isStandaloneDisplay()) return 'installed'
  if (deferredPrompt) return 'prompt'
  if (isIosSafari()) return 'ios'
  // Android Chrome sem evento ainda, ou desktop — mostra instrução genérica
  if (/Android/i.test(navigator.userAgent)) return 'manual'
  return 'manual'
}

export async function promptManualInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  const ev = deferredPrompt
  deferredPrompt = null
  await ev.prompt()
  const { outcome } = await ev.userChoice
  return outcome
}

export async function registerManualServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/manual-sw.js', { scope: '/' })
  } catch {
    /* ignore — instalação pode falhar em HTTP não-local */
  }
}

/** Injeta manifest dinâmico com start_url do manual atual (token). */
export function applyManualManifest(opts: {
  token: string
  bikeLabel: string
  lojaNome?: string | null
}): () => void {
  const startUrl = `${window.location.origin}${window.location.pathname}?manual=${encodeURIComponent(opts.token)}`
  const shortName = opts.bikeLabel.length > 12 ? opts.bikeLabel.slice(0, 11) + '…' : opts.bikeLabel
  const name = `Manual · ${opts.bikeLabel}`
  const description = opts.lojaNome
    ? `Manual do Proprietário — ${opts.lojaNome}`
    : 'Manual do Proprietário da sua bicicleta'

  const manifest = {
    id: startUrl,
    name,
    short_name: shortName || 'Manual',
    description,
    start_url: startUrl,
    scope: `${window.location.origin}${window.location.pathname}`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f6f7f9',
    theme_color: '#0f766e',
    lang: 'pt-BR',
    icons: [
      {
        src: `${window.location.origin}/icons/manual-icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${window.location.origin}/icons/manual-icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: `${window.location.origin}/manual-icon.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }

  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  let link = document.querySelector<HTMLLinkElement>('link[data-cp-manual-manifest]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'manifest'
    link.setAttribute('data-cp-manual-manifest', '1')
    document.head.appendChild(link)
  } else if (link.href.startsWith('blob:')) {
    URL.revokeObjectURL(link.href)
  }
  link.href = url

  const metas: Array<[string, string]> = [
    ['theme-color', '#0f766e'],
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-status-bar-style', 'default'],
    ['apple-mobile-web-app-title', shortName || 'Manual'],
    ['mobile-web-app-capable', 'yes'],
  ]

  const created: HTMLElement[] = []
  for (const [nameAttr, content] of metas) {
    let el = document.querySelector<HTMLMetaElement>(`meta[data-cp-manual-meta="${nameAttr}"]`)
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('data-cp-manual-meta', nameAttr)
      if (nameAttr === 'theme-color') el.name = 'theme-color'
      else el.name = nameAttr
      document.head.appendChild(el)
      created.push(el)
    }
    el.content = content
  }

  let appleIcon = document.querySelector<HTMLLinkElement>('link[data-cp-manual-apple-icon]')
  if (!appleIcon) {
    appleIcon = document.createElement('link')
    appleIcon.rel = 'apple-touch-icon'
    appleIcon.setAttribute('data-cp-manual-apple-icon', '1')
    document.head.appendChild(appleIcon)
    created.push(appleIcon)
  }
  appleIcon.href = `${window.location.origin}/icons/manual-icon-192.png`

  const prevTitle = document.title
  document.title = name

  return () => {
    if (link?.href.startsWith('blob:')) URL.revokeObjectURL(link.href)
    link?.remove()
    appleIcon?.remove()
    document.querySelectorAll('[data-cp-manual-meta]').forEach((n) => n.remove())
    document.title = prevTitle
  }
}
