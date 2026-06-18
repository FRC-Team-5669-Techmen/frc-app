// Supabase Edge Function: calendar-feed
//
// Serves the team schedule as a valid iCalendar (.ics) document so members can
// subscribe in Apple Calendar / Google Calendar and have it stay in sync.
//
// This is a CAPABILITY URL: there is no JWT. The unguessable ?token= (a member's
// profiles.calendar_token, see supabase/calendar_token.sql) is the only secret,
// so this function MUST be deployed with JWT verification OFF:
//
//   supabase functions deploy calendar-feed --no-verify-jwt
//
// (or toggle "Verify JWT" off in the Dashboard editor). Self-contained / single
// file so it deploys via the Dashboard editor like send-push / cron-notify.
//
// Query params:
//   token  (required)  – a profiles.calendar_token. No match → 401.
//   scope  = 'mine' (default) → events the member RSVP'd "going" to PLUS every
//                                shop-open session (kind in SHOP_OPEN_KINDS),
//                                mirroring the Phase 1 "My events" filter.
//          = 'all'            → every event.
// Events from 30 days ago forward are included either way.
//
// Uses only auto-injected env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The
// service role bypasses RLS + the calendar_token column revoke, which is why the
// token can be looked up and the events read here but never from a client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Mirror of src/shopStatus.js SHOP_OPEN_KINDS — the kinds that open the shop.
const SHOP_OPEN_KINDS = ['build']

const CAL_NAME = 'Techmen 5669'
const TZID = 'America/Los_Angeles'
const UID_DOMAIN = 'frc-app.techmen5669'

// timestamptz → iCalendar UTC basic form: YYYYMMDDTHHMMSSZ
function toICSDate(value: string | number | Date): string {
  const d = new Date(value)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

// RFC 5545 §3.3.11: escape backslash, semicolon, comma, and newline in TEXT.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// RFC 5545 §3.1: fold lines at 75 octets. Continuation lines begin with a
// single space, and we never split a multi-byte UTF-8 character across a fold.
function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const segments: string[] = []
  let cur = ''
  let bytes = 0
  let first = true
  for (const ch of line) {            // for..of iterates by code point
    const b = enc.encode(ch).length
    const limit = first ? 75 : 74     // continuation lines carry a leading space
    if (bytes + b > limit) {
      segments.push(cur)
      cur = ''
      bytes = 0
      first = false
    }
    cur += ch
    bytes += b
  }
  segments.push(cur)
  return segments.join('\r\n ')
}

function plain(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    })
  }

  const url = new URL(req.url)
  const token = (url.searchParams.get('token') ?? '').trim()
  const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'mine'
  if (!token) return plain('Missing token', 401)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Authenticate by capability token.
  const { data: member, error: memberErr } = await admin
    .from('profiles')
    .select('id')
    .eq('calendar_token', token)
    .maybeSingle()
  if (memberErr || !member) return plain('Invalid token', 401)

  // Events from 30 days ago forward.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: events, error: evErr } = await admin
    .from('events')
    .select('id, title, kind, starts_at, ends_at, location, notes, updated_at')
    .gte('starts_at', cutoff)
    .order('starts_at', { ascending: true })
  if (evErr) return plain('Failed to load events', 500)

  let rows = events ?? []
  if (scope === 'mine') {
    const { data: signups } = await admin
      .from('event_signups')
      .select('event_id')
      .eq('member_id', member.id)
      .eq('response', 'going')
    const going = new Set((signups ?? []).map((s) => s.event_id))
    rows = rows.filter((ev) => SHOP_OPEN_KINDS.includes(ev.kind) || going.has(ev.id))
  }

  const stamp = toICSDate(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${CAL_NAME}//Calendar//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${escapeText(CAL_NAME)}`,
    `X-WR-CALNAME:${escapeText(CAL_NAME)}`,
    `X-WR-TIMEZONE:${TZID}`,
  ]

  for (const ev of rows) {
    const descRaw = ev.notes ? `${ev.kind}\n\n${ev.notes}` : ev.kind
    const seq = ev.updated_at ? Math.floor(new Date(ev.updated_at).getTime() / 1000) : 0
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.id}@${UID_DOMAIN}`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${toICSDate(ev.starts_at)}`)
    lines.push(`DTEND:${toICSDate(ev.ends_at)}`)
    lines.push(`SUMMARY:${escapeText(ev.title ?? '')}`)
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`)
    lines.push(`DESCRIPTION:${escapeText(descRaw)}`)
    lines.push(`CATEGORIES:${escapeText((ev.kind ?? '').toUpperCase())}`)
    lines.push(`SEQUENCE:${seq}`)
    if (ev.updated_at) lines.push(`LAST-MODIFIED:${toICSDate(ev.updated_at)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  const body = lines.map(foldLine).join('\r\n') + '\r\n'
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="techmen5669.ics"',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
