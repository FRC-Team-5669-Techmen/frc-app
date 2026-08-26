/**
 * Weekly week-ahead schedule post to Discord.
 *
 * Runs on a Vercel cron, posts once, pings nobody. This exists so routine
 * schedule information stops arriving as a same-day server-wide mention: the
 * post carries allowed_mentions { parse: [] }, which is the hard guarantee.
 * The wording is not the guarantee. Discord will not resolve @everyone, @here,
 * a role or a user out of this content even if one of those strings ends up in
 * an event title.
 *
 * CADENCE IS ENFORCED HERE, NOT IN THE CRON EXPRESSION.
 * Vercel Hobby crons are daily-granularity only: a day-of-week field in the
 * schedule is not honoured on that plan. So vercel.json fires this every day at
 * 01:00 UTC (which is 5 PM or 6 PM the previous day in LA, either side of DST,
 * so it always lands on the previous LA calendar day in the evening) and the
 * function no-ops on every day that is not Sunday in America/Los_Angeles.
 *
 * SECRETS. CRON_SECRET and DISCORD_WEBHOOK_URL are never logged, echoed, or
 * returned, in full or in part. Anything that leaves this function through a
 * response body or console goes through scrub() first, which removes any
 * occurrence of either value.
 *
 * Env:
 *   CRON_SECRET              required. Vercel sends it as `Authorization: Bearer`
 *                            on scheduled invocations when it is set.
 *   SUPABASE_URL             required.
 *   SUPABASE_SERVICE_ROLE_KEY required.
 *   DISCORD_WEBHOOK_URL      required for the live path only. ?dry=1 does not
 *                            need it.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { comingWeekWindow, isSundayInLA, renderWeekAhead } from './_lib/weekAhead.js'

/**
 * Strip any secret value out of a string before it is logged or returned.
 * Belt and braces: nothing in this file deliberately interpolates a secret, and
 * this makes an accidental one impossible to observe.
 */
function scrub(value) {
  let out = typeof value === 'string' ? value : String(value ?? '')
  for (const name of ['CRON_SECRET', 'DISCORD_WEBHOOK_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const secret = process.env[name]
    if (secret && secret.length > 3) out = out.split(secret).join(`[${name} redacted]`)
  }
  return out
}

/**
 * Bearer check against CRON_SECRET.
 *
 * Compared as sha256 digests so the comparison is both constant-time and
 * independent of the length of what was supplied. No branch here reads or
 * reports any part of the secret.
 */
function authorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  const digest = s => createHash('sha256').update(s, 'utf8').digest()
  return timingSafeEqual(digest(header.slice(prefix.length)), digest(secret))
}

const firstParam = value => (Array.isArray(value) ? value[0] : value)

export default async function handler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return
  }

  const query = req.query || {}
  const dry = firstParam(query.dry) === '1'

  // ?at= forces the instant the Sunday gate and the window are evaluated at.
  // Gated to the dry path so it can never shift which week gets posted for
  // real. It exists so the renderer can be exercised on any day of the week.
  let now = new Date()
  const at = firstParam(query.at)
  if (dry && at) {
    const forced = new Date(at)
    if (Number.isNaN(forced.getTime())) {
      res.status(400).json({ ok: false, error: 'at is not a parsable date' })
      return
    }
    now = forced
  }

  if (!isSundayInLA(now)) {
    res.status(200).json({
      ok: true,
      posted: false,
      reason: 'not Sunday in America/Los_Angeles, weekly cadence enforced in-function',
    })
    return
  }

  const window = comingWeekWindow(now)

  // Server-side credential: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
  // public.events is `select to authenticated using (true)` with no anon
  // policy, so the anon key cannot read the schedule at all, and a cron has no
  // user session to be authenticated as. Service role is what every other
  // server-side reader in this repo uses (calendar-feed, cron-notify,
  // discord-calendar, parent-response) and is correct here for the same reason.
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    res.status(500).json({ ok: false, error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set' })
    return
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const [eventsResult, deadlinesResult] = await Promise.all([
    // Overlap, not start-inside: a competition that opened on the Sunday before
    // still runs during this week and belongs in the post.
    supabase.from('events')
      .select('id, title, kind, starts_at, ends_at, location, notes, mandatory, rsvp_enabled')
      .lt('starts_at', window.endUTC.toISOString())
      .gte('ends_at', window.startUTC.toISOString())
      .order('starts_at', { ascending: true }),
    // tasks.due_date is a date column already in LA calendar terms, so it is
    // filtered on the window day keys directly. Only jobs still available carry
    // a live deadline; 'closed' and 'completed' do not.
    supabase.from('tasks')
      .select('id, title, due_date, subteam, status')
      .eq('status', 'open')
      .gte('due_date', window.monday)
      .lte('due_date', window.sunday)
      .order('due_date', { ascending: true }),
  ])

  if (eventsResult.error || deadlinesResult.error) {
    const detail = scrub((eventsResult.error || deadlinesResult.error).message)
    console.error('week-ahead: schedule query failed:', detail)
    res.status(500).json({ ok: false, error: 'schedule query failed', detail })
    return
  }

  const content = renderWeekAhead({
    monday: window.monday,
    sunday: window.sunday,
    events: eventsResult.data || [],
    deadlines: deadlinesResult.data || [],
  })

  if (dry) {
    res.status(200).json({
      ok: true,
      posted: false,
      dry: true,
      week: { monday: window.monday, sunday: window.sunday },
      counts: { events: (eventsResult.data || []).length, deadlines: (deadlinesResult.data || []).length },
      content,
    })
    return
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL
  if (!webhook) {
    res.status(500).json({ ok: false, error: 'DISCORD_WEBHOOK_URL is not set' })
    return
  }

  const discordResponse = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content,
      // The hard guarantee. An empty parse list means Discord resolves no
      // mention of any kind out of this content.
      allowed_mentions: { parse: [] },
    }),
  })

  if (!discordResponse.ok) {
    const body = scrub(await discordResponse.text().catch(() => ''))
    console.error('week-ahead: discord webhook rejected the post:', discordResponse.status, body.slice(0, 300))
    res.status(502).json({ ok: false, error: 'discord rejected the post', status: discordResponse.status })
    return
  }

  console.log(`week-ahead: posted ${window.monday} to ${window.sunday}, ${(eventsResult.data || []).length} events, ${(deadlinesResult.data || []).length} deadlines`)
  res.status(200).json({
    ok: true,
    posted: true,
    week: { monday: window.monday, sunday: window.sunday },
    counts: { events: (eventsResult.data || []).length, deadlines: (deadlinesResult.data || []).length },
  })
}
