// Supabase Edge Function: discord-calendar
//
// Hourly Discord calendar posting. Invoked by pg_cron (via pg_net) exactly like
// cron-notify — a shared secret in a custom header, NOT a user JWT — so it MUST
// be deployed with JWT verification off:
//
//   supabase functions deploy discord-calendar --no-verify-jwt
//
// Posts public.events into the guild: an embed per upcoming event in #calendar,
// and reminders in #announcements 24h and 2h ahead. Report-only by default.
//
// NOT single-file, unlike the other functions in this directory. The engine in
// ./lib/ is the same code the Node test harness runs
// (scripts/discord/calendar-sync.test.mjs), and duplicating it into one file to
// keep Dashboard-editor deploys working would mean two copies of the logic that
// guarantees nothing double-posts. Deploy this one with the CLI:
//
//   npx supabase functions deploy discord-calendar --no-verify-jwt
//
// The ./lib/*.js modules are plain ESM with explicit file extensions and no
// imports beyond `node:crypto`, so they run unchanged on both Deno and Node.
//
// SECURITY: DISCORD_BOT_TOKEN is a function secret read here from Deno.env. It
// never reaches the browser — the app bundle only sees VITE_-prefixed vars, and
// nothing in supabase/functions/ is part of the Vite build.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createDiscord } from './lib/discord.js'
import { runCalendarSync } from './lib/calendarSync.js'

Deno.serve(async (req) => {
  // Same gate as send-push / cron-notify: a shared secret the caller must know.
  // pg_cron supplies it from private.discord_calendar_config.hook_secret.
  if (req.headers.get('x-cron-secret') !== Deno.env.get('DISCORD_CRON_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))

    const token = Deno.env.get('DISCORD_BOT_TOKEN')
    const guildId = Deno.env.get('DISCORD_GUILD_ID')
    const missing = [
      !token && 'DISCORD_BOT_TOKEN',
      !guildId && 'DISCORD_GUILD_ID',
    ].filter(Boolean)
    if (missing.length) {
      return new Response(JSON.stringify({ error: `missing secrets: ${missing.join(', ')}` }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Report-only is the DEFAULT and is controlled exactly as before: only the
    // literal string 'live' enables writes, so a typo, an empty value, or a
    // missing secret all fail safe.
    let reportOnly = (Deno.env.get('DISCORD_CALENDAR_MODE') ?? 'report').trim().toLowerCase() !== 'live'
    // The request body may only DOWNGRADE to a dry run (for a manual check
    // against a live deployment). Nothing in a request can turn posting on.
    if (body?.mode === 'report') reportOnly = true

    const horizonDays = Math.max(1, Math.min(90,
      Number(Deno.env.get('DISCORD_CALENDAR_HORIZON_DAYS') ?? 14) || 14))

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const summary = await runCalendarSync({
      supabase: admin,
      discord: createDiscord({ token }),
      now: new Date(),
      config: {
        runId: crypto.randomUUID(),
        reportOnly,
        guildId,
        calendarChannel: Deno.env.get('DISCORD_CALENDAR_CHANNEL') ?? 'calendar',
        announceChannel: Deno.env.get('DISCORD_ANNOUNCE_CHANNEL') ?? 'announcements',
        horizonDays,
      },
    })

    const ok = !summary.fatal
    return new Response(
      JSON.stringify({ ok, mode: reportOnly ? 'report-only' : 'live', ...summary }),
      { status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[discord-calendar] error', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
