/** Web Push opt-in do Manual do Proprietário. */

import { supabase } from './supabaseClient'

export type ManualPushStatus =
  | 'unsupported'
  | 'denied'
  | 'prompt'
  | 'active'
  | 'inactive'
  | 'missing_vapid'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

export function vapidPublicKey(): string | null {
  const key = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
  return key || null
}

export function isManualPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

async function getManualRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration('/')
    if (existing) return existing
    return await navigator.serviceWorker.register('/manual-sw.js', { scope: '/' })
  } catch {
    return null
  }
}

function subscriptionKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const json = sub.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return null
  return { endpoint, p256dh, auth }
}

export async function getManualPushStatus(): Promise<ManualPushStatus> {
  if (!isManualPushSupported()) return 'unsupported'
  if (!vapidPublicKey()) return 'missing_vapid'
  if (Notification.permission === 'denied') return 'denied'

  const reg = await getManualRegistration()
  if (!reg) return 'unsupported'

  const sub = await reg.pushManager.getSubscription()
  if (sub) return 'active'
  if (Notification.permission === 'granted') return 'inactive'
  return 'prompt'
}

export async function ativarManualPush(token: string): Promise<ManualPushStatus> {
  if (!isManualPushSupported()) return 'unsupported'
  const vapid = vapidPublicKey()
  if (!vapid) return 'missing_vapid'

  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'prompt'

  const reg = await getManualRegistration()
  if (!reg) return 'unsupported'

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    })
  }

  const keys = subscriptionKeys(sub)
  if (!keys) throw new Error('Não foi possível ler a assinatura push.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('manual_push_registrar', {
    p_token: token,
    p_endpoint: keys.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : null,
  })
  if (error) throw new Error(error.message ?? 'Erro ao registrar notificações.')

  return 'active'
}

export async function desativarManualPush(token: string): Promise<ManualPushStatus> {
  if (!isManualPushSupported()) return 'unsupported'

  const reg = await getManualRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null

  if (sub) {
    const endpoint = sub.endpoint
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('manual_push_desativar', {
        p_token: token,
        p_endpoint: endpoint,
      })
    } catch {
      /* segue para unsubscribe local */
    }
    try {
      await sub.unsubscribe()
    } catch {
      /* ignore */
    }
  }

  return 'inactive'
}

export async function atualizarBadgeManual(count: number): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (typeof nav.setAppBadge !== 'function') return
    if (count > 0) await nav.setAppBadge(count)
    else if (typeof nav.clearAppBadge === 'function') await nav.clearAppBadge()
  } catch {
    /* ignore */
  }
}
