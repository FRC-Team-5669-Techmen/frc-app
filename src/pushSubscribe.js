// Turning web push on for this device: permission, the push subscription,
// and saving it (push_subscribe). One copy, used by Notifications in the
// profile and by My schedule's "Turn on" (ledger 0033).
import { supabase } from './supabase'
import { writeVia } from './writeVia'

export const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushSupported = () => typeof window !== 'undefined' &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/** This device's push subscription, or null. */
export async function currentSubscription() {
  if (!pushSupported()) return null
  // serviceWorker.ready never settles where no worker registers (dev): give up after 3 s.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000))
  try { return await Promise.race([navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()), timeout]) } catch { return null }
}

/** Ask, subscribe and save. Answers { ok: true } or { ok: false, message }. */
export async function subscribePush(uid) {
  if (!VAPID_PUBLIC) return { ok: false, message: 'Push is not configured on the server yet.' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, message: 'Notifications permission was not granted.' }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) })
  const json = sub.toJSON()
  const subRow = { endpoint: json.endpoint, member_id: uid, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent }
  const { error } = await writeVia(supabase, 'push_subscribe',
    { p_endpoint: subRow.endpoint, p_p256dh: subRow.p256dh, p_auth: subRow.auth, p_user_agent: subRow.user_agent },
    { table: 'push_subscriptions', op: 'upsert', values: subRow, options: { onConflict: 'endpoint' } })
  return error ? { ok: false, message: error.message } : { ok: true }
}
