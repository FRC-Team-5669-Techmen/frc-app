// Edge Function: cron-notify
// Batched/scheduled sender, invoked by pg_cron (via pg_net) with a shared secret.
// Body: { job: 'event_reminder' | 'parent_digest' | 'shop_status' }.
// Deploy with "Enforce JWT" OFF.
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
function laHourMinute(now = new Date()): string {
  return now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles',
  })
}
function laDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}
function laMidnightISO(now = new Date()): string {
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
async function sendToMember(admin: any, target: any) {
  const { data: prof } = await admin
    .from('profiles').select('notification_prefs').eq('id', target.member_id).maybeSingle()
  const prefs = prof?.notification_prefs ?? {}
  if (prefs.enabled === false) return { skipped: 'disabled' }
  if (target.category && prefs[target.category] === false) return { skipped: 'category-off' }
  if (inQuietHours(prefs)) return { skipped: 'quiet-hours' }

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

// ── Batched jobs ────────────────────────────────────────────────────────────
const fmtDur = (ms: number) => {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60)
  return h === 0 ? `${m}m` : `${h}h ${m % 60}m`
}
function dayHoursMs(evs: any[]) {
  let total = 0, inT: number | null = null
  for (const e of [...evs].sort((a, b) => +new Date(a.event_time) - +new Date(b.event_time))) {
    if (e.type === 'in') inT = +new Date(e.event_time)
    else if (e.type === 'out' && inT != null) { total += +new Date(e.event_time) - inT; inT = null }
  }
  if (inT != null) total += Date.now() - inT
  return total
}
const isIn = (evs: any[]) =>
  [...evs].sort((a, b) => +new Date(a.event_time) - +new Date(b.event_time)).at(-1)?.type === 'in'

async function eventReminders(admin: any) {
  const now = new Date()
  const in24 = new Date(now.getTime() + 24 * 3600_000)
  const { data: events } = await admin
    .from('events').select('id, title, starts_at, mandatory')
    .gte('starts_at', now.toISOString()).lte('starts_at', in24.toISOString())
  if (!events || events.length === 0) return
  const ids = events.map((e: any) => e.id)

  const perMember = new Map<string, Set<string>>()
  const add = (mid: string, eid: string) => {
    if (!perMember.has(mid)) perMember.set(mid, new Set())
    perMember.get(mid)!.add(eid)
  }

  const { data: signups } = await admin
    .from('event_signups').select('event_id, member_id, response')
    .in('event_id', ids).in('response', ['going', 'maybe'])
  for (const su of signups ?? []) add(su.member_id, su.event_id)

  const mandatory = events.filter((e: any) => e.mandatory)
  if (mandatory.length) {
    const { data: active } = await admin.from('profiles').select('id').eq('status', 'active')
    for (const a of active ?? []) for (const e of mandatory) add(a.id, e.id)
  }

  const ref = `event:${laDate(now)}`
  for (const [member_id, evIds] of perMember) {
    const evs = events.filter((e: any) => evIds.has(e.id))
      .sort((a: any, b: any) => +new Date(a.starts_at) - +new Date(b.starts_at))
    const body = evs.length === 1
      ? `${evs[0].title} is coming up in the next 24 hours.`
      : `You have ${evs.length} events in the next 24 hours, starting with ${evs[0].title}.`
    await sendToMember(admin, {
      member_id, category: 'event_reminder', kind: 'event_reminder', ref_id: ref,
      title: 'Upcoming events', body, url: '/schedule',
    })
  }
}

async function parentDigest(admin: any) {
  const now = new Date()
  const { data: parents } = await admin.from('member_roles').select('member_id').eq('role', 'parent')
  const parentIds = [...new Set((parents ?? []).map((p: any) => p.member_id))]
  if (parentIds.length === 0) return

  const { data: links } = await admin
    .from('guardian_links').select('parent_id, student_id').in('parent_id', parentIds)
  const studentIds = [...new Set((links ?? []).map((l: any) => l.student_id))]
  if (studentIds.length === 0) return

  const startToday = laMidnightISO(now)
  const [{ data: profs }, { data: evRows }] = await Promise.all([
    admin.from('profiles').select('id, full_name').in('id', studentIds),
    admin.from('attendance_events').select('user_id, type, event_time').in('user_id', studentIds).gte('event_time', startToday),
  ])
  const nameById: Record<string, string> = {}
  for (const p of profs ?? []) nameById[p.id] = p.full_name || 'Your student'
  const byStudent: Record<string, any[]> = {}
  for (const e of evRows ?? []) (byStudent[e.user_id] ??= []).push(e)

  const ref = `digest:${laDate(now)}`
  for (const pid of parentIds) {
    const myStudents = (links ?? []).filter((l: any) => l.parent_id === pid).map((l: any) => l.student_id)
    const parts = myStudents.map((sid: string) => {
      const evs = byStudent[sid] ?? []
      if (evs.length === 0) return `${nameById[sid]}: no check-in today`
      return `${nameById[sid]}: ${fmtDur(dayHoursMs(evs))}${isIn(evs) ? ', in now' : ''}`
    })
    if (parts.length === 0) continue
    await sendToMember(admin, {
      member_id: pid, category: 'parent_digest', kind: 'parent_digest', ref_id: ref,
      title: 'Today at the shop', body: parts.join(' · '), url: '/dashboard',
    })
  }
}

async function shopStatus(admin: any) {
  const now = new Date()
  const WINDOW = 15 * 60_000
  const { data: builds } = await admin
    .from('events').select('starts_at, ends_at').eq('kind', 'build').gte('ends_at', laMidnightISO(now))
  let t: { type: 'opened' | 'closed'; at: string } | null = null
  for (const b of builds ?? []) {
    const s = +new Date(b.starts_at), e = +new Date(b.ends_at), n = now.getTime()
    if (n - s >= 0 && n - s < WINDOW) t = { type: 'opened', at: b.starts_at }
    if (n - e >= 0 && n - e < WINDOW) t = { type: 'closed', at: b.ends_at }
  }
  if (!t) return

  const { data: rows } = await admin.from('profiles').select('id, notification_prefs').eq('status', 'active')
  for (const r of rows ?? []) {
    const p = r.notification_prefs ?? {}
    if (p.enabled === false || p.shop_status !== true) continue
    await sendToMember(admin, {
      member_id: r.id, category: 'shop_status', kind: 'shop_status', ref_id: `shop:${t.at}:${t.type}`,
      title: t.type === 'opened' ? 'Shop is open' : 'Shop is closed',
      body: t.type === 'opened' ? 'The shop just opened.' : 'The shop just closed for now.',
      url: '/schedule',
    })
  }
}

// ── HTTP entry ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  try {
    const { job } = await req.json().catch(() => ({}))
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    configureVapid()

    if (job === 'event_reminder') await eventReminders(admin)
    else if (job === 'parent_digest') await parentDigest(admin)
    else if (job === 'shop_status') await shopStatus(admin)
    else return new Response('unknown job', { status: 400 })

    return new Response(JSON.stringify({ ok: true, job }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[cron-notify] error', String(err))
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
