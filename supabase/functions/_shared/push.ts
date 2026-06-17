// Shared push-send core. Used by send-push (immediate) and cron-notify (batched).
// Respects master enable, per-category opt-out, quiet hours, and the dedupe
// ledger; signs with VAPID; prunes expired subscriptions. Never logs key material.

import webpush from 'npm:web-push@3.6.7'

export function configureVapid() {
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:techmen@boscotech.edu',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
}

// HH:MM (24h) in the shop's timezone.
export function laHourMinute(now = new Date()): string {
  return now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles',
  })
}
// YYYY-MM-DD in the shop's timezone.
export function laDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}
// Instant of today's LA midnight, as a UTC ISO string (DST-safe).
export function laMidnightISO(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parseInt(p.find(x => x.type === t)?.value || '0', 10)
  const elapsed = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + now.getMilliseconds()
  return new Date(now.getTime() - elapsed).toISOString()
}

function inQuietHours(prefs: any, now = new Date()): boolean {
  const qh = prefs?.quiet_hours
  if (!qh?.start || !qh?.end) return false
  const t = laHourMinute(now)
  return qh.start <= qh.end ? (t >= qh.start && t < qh.end) : (t >= qh.start || t < qh.end)
}

// target: { member_id, category, kind, ref_id, title, body, url }
export async function sendToMember(admin: any, target: any) {
  const { data: prof } = await admin
    .from('profiles').select('notification_prefs').eq('id', target.member_id).maybeSingle()
  const prefs = prof?.notification_prefs ?? {}

  if (prefs.enabled === false) return { skipped: 'disabled' }
  if (target.category && prefs[target.category] === false) return { skipped: 'category-off' }
  if (inQuietHours(prefs)) return { skipped: 'quiet-hours' }

  // Atomic dedupe: claim the (member, kind, ref_id) slot. A unique violation
  // means it was already sent — skip without re-sending.
  const { error: dErr } = await admin
    .from('notifications_sent')
    .insert({ member_id: target.member_id, kind: target.kind, ref_id: target.ref_id })
  if (dErr) {
    if (dErr.code === '23505') return { skipped: 'duplicate' }
    throw dErr
  }

  const { data: subs } = await admin
    .from('push_subscriptions').select('endpoint, p256dh, auth').eq('member_id', target.member_id)
  if (!subs || subs.length === 0) return { skipped: 'no-subscription' }

  const payload = JSON.stringify({
    title: target.title, body: target.body, url: target.url,
    tag: `${target.kind}:${target.ref_id}`,
  })

  let sent = 0
  for (const s of subs) {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
    try {
      await webpush.sendNotification(subscription, payload)
      sent++
    } catch (err: any) {
      const code = err?.statusCode
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
      // Other errors: swallow; a bad endpoint shouldn't fail the batch.
    }
  }
  return { sent }
}
