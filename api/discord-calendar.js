// Vercel serverless function — hourly cron entrypoint for Discord calendar
// posting. See api/README.md for env vars, schedule, and operations.
//
// Schedule lives in vercel.json ("crons"). Vercel calls this with GET and, when
// CRON_SECRET is set, an `Authorization: Bearer <CRON_SECRET>` header.
//
// SECURITY: DISCORD_BOT_TOKEN is read here from process.env and never leaves the
// server. It is not VITE_-prefixed, so Vite cannot inline it (only VITE_* reach
// import.meta.env), and nothing under api/ is part of the client build — Vite
// bundles from index.html + src/, while Vercel builds api/* as separate
// serverless functions. `npm run build && grep -r DISCORD_BOT_TOKEN dist/`
// returns nothing; that check is written up in the README.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import { createDiscord } from './_lib/discord.js'
import { runCalendarSync } from './_lib/calendarSync.js'

const env = (name, fallback = undefined) => process.env[name] ?? fallback

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'method not allowed' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  // The function URL is public, so CRON_SECRET is REQUIRED. Without it the
  // endpoint refuses to run rather than defaulting to open — an open endpoint
  // here can spam the whole server.
  const secret = env('CRON_SECRET')
  if (!secret) {
    return res.status(500).json({ error: 'CRON_SECRET is not set; refusing to run' })
  }
  const auth = req.headers.authorization || ''
  if (!constantTimeEquals(auth, `Bearer ${secret}`)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  // ── Config ────────────────────────────────────────────────────────────────
  const token = env('DISCORD_BOT_TOKEN')
  const guildId = env('DISCORD_GUILD_ID')
  const supabaseUrl = env('SUPABASE_URL', env('VITE_SUPABASE_URL'))
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')

  const missing = [
    !token && 'DISCORD_BOT_TOKEN',
    !guildId && 'DISCORD_GUILD_ID',
    !supabaseUrl && 'SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)
  if (missing.length) {
    return res.status(500).json({ error: `missing env: ${missing.join(', ')}` })
  }

  // Report-only is the DEFAULT. Only the literal string 'live' turns on writes,
  // so a typo, an empty value, or a forgotten variable all fail safe.
  let reportOnly = env('DISCORD_CALENDAR_MODE', 'report').trim().toLowerCase() !== 'live'

  // A query param may only DOWNGRADE to report-only (for a manual dry run
  // against a live deployment). It can never turn posting on — that decision
  // belongs to the environment variable alone.
  const url = new URL(req.url, 'http://localhost')
  if (url.searchParams.get('mode') === 'report') reportOnly = true

  const horizonDays = Math.max(1, Math.min(90, Number(env('DISCORD_CALENDAR_HORIZON_DAYS', 14)) || 14))

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const runId = randomUUID()
  const discord = createDiscord({ token })

  let summary
  try {
    summary = await runCalendarSync({
      supabase,
      discord,
      now: new Date(),
      config: {
        runId,
        reportOnly,
        guildId,
        calendarChannel: env('DISCORD_CALENDAR_CHANNEL', 'calendar'),
        announceChannel: env('DISCORD_ANNOUNCE_CHANNEL', 'announcements'),
        horizonDays,
      },
    })
  } catch (err) {
    // runCalendarSync catches its own errors; this is the belt-and-braces path.
    console.error('[discord-calendar] fatal', err)
    return res.status(500).json({ run_id: runId, error: err.message })
  }

  const ok = !summary.fatal
  return res.status(ok ? 200 : 500).json({
    ok,
    mode: reportOnly ? 'report-only' : 'live',
    ...summary,
  })
}
