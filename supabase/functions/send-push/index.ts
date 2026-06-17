// Edge Function: send-push
// Immediate sender. Called server-to-server (the task_claims trigger via pg_net)
// with a shared secret. Body: { targets: [{ member_id, category, kind, ref_id,
// title, body, url }] }. Deploy with "Enforce JWT" OFF (it authenticates via the
// x-push-secret header, not a user JWT).
//
// Self-contained (push core inlined) so it deploys via the Dashboard editor.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// ── Push core ───────────────────────────────────────────────────────────────
function configureVapid() {
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:techmen@boscotech.edu',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
}

// HH:MM (24h) in the shop's timezone.
function laHourMinute(now = new Date()): string {
  return now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles',
  })
}

function inQuietHours(prefs: any, now = new Date()): boolean {
  const qh = prefs?.quiet_hours
  if (!qh?.start || !qh?.end) return false
  const t = laHourMinute(now)
  return qh.start <= qh.end ? (t >= qh.start && t < qh.end) : (t >= qh.start || t < qh.end)
}

// target: { member_id, category, kind, ref_id, title, body, url }
async function sendToMember(admin: any, target: any) {
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
    }
  }
  return { sent }
}

// ── HTTP entry ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  try {
    const { targets } = await req.json().catch(() => ({ targets: [] }))
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    configureVapid()

    const results = []
    for (const t of targets ?? []) results.push(await sendToMember(admin, t))
    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-push] error', String(err))
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
