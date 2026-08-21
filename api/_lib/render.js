// Message rendering for the Discord calendar cron: America/Los_Angeles time
// formatting, embed construction, subteam-role matching, and the content hash
// that decides whether a posted message needs editing.
//
// Pure — no network, no database, no process.env. Everything it needs is an
// argument, which is what makes it testable and what keeps the bot token out.

import { createHash } from 'node:crypto'

export const LA = 'America/Los_Angeles'

// ─────────────────────────────────────────────────────────────────────────────
// Subteam → Discord role
//
// public.events has NO subteam column, so "when the event names one" is taken
// literally: we look for a subteam name in the event's title and notes. No
// schema was invented for this.
//
// Left side  = what staff might type (the src/subteams.js vocabulary plus the
//              obvious spellings of it).
// Right side = the Discord role name from scripts/discord/SERVER_SPEC.md section 3.
//              Resolved to a snowflake by name at runtime; if the guild has no
//              such role, no ping happens and the run logs why.
//
// Fabrication, Robot Construction, and Field & Pit are app subteams with NO
// Discord counterpart in the spec. They are deliberately absent: inventing a
// mapping (Fabrication -> @Mechanical) would ping people the event never named.
// Add a row here only when the matching role is actually created in the guild.
// ─────────────────────────────────────────────────────────────────────────────
export const SUBTEAM_ROLE_ALIASES = {
  'mechanical':        'Mechanical',
  'electrical':        'Electrical',
  'programming':       'Programming',
  'cad':               'CAD',
  'business/outreach': 'Business/Media',
  'business/media':    'Business/Media',
  'business & media':  'Business/Media',
  'media':             'Business/Media',
  'scouting':          'Scouting',
  'drive team':        'Drive Team',
  'drive-team':        'Drive Team',
}

// Longest alias first so "business/outreach" wins over "media" inside the same
// string and "drive team" is never shadowed by a shorter partial.
const ALIASES_BY_LENGTH = Object.keys(SUBTEAM_ROLE_ALIASES).sort((a, b) => b.length - a.length)

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Which Discord role names does this event name?
 * Word-bounded and case-insensitive over title + notes. Returns canonical role
 * names (deduped, in the order matched) — resolution to IDs happens elsewhere.
 */
export function namedSubteamRoles(event) {
  const haystack = `${event?.title || ''}\n${event?.notes || ''}`.toLowerCase()
  const out = []
  for (const alias of ALIASES_BY_LENGTH) {
    // (?<![\w-]) ... (?![\w-]) keeps "cad" from matching inside "cadence" and
    // "media" from matching inside "multimedia", while still allowing the "/"
    // and "&" that live inside some alias names.
    const re = new RegExp(`(?<![\\w-])${escapeRe(alias)}(?![\\w-])`, 'i')
    if (!re.test(haystack)) continue
    const role = SUBTEAM_ROLE_ALIASES[alias]
    if (!out.includes(role)) out.push(role)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// America/Los_Angeles formatting
// Every time the team sees is rendered in LA regardless of where the serverless
// function ran, which is why the timeZone is pinned on every formatter.
// ─────────────────────────────────────────────────────────────────────────────
const dayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LA, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LA, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})
const timeNoZoneFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LA, hour: 'numeric', minute: '2-digit',
})
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: LA, year: 'numeric', month: '2-digit', day: '2-digit',
})

export const laDayKey = value => dayKeyFmt.format(new Date(value))

/** "Sat, Sep 12, 2026 - 9:00 AM to 2:00 PM PDT", or a full range across days. */
export function formatWhen(startsAt, endsAt) {
  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : null
  if (!end) return `${dayFmt.format(start)} · ${timeFmt.format(start)}`
  if (laDayKey(start) === laDayKey(end)) {
    return `${dayFmt.format(start)} · ${timeNoZoneFmt.format(start)} – ${timeFmt.format(end)}`
  }
  return `${dayFmt.format(start)} · ${timeFmt.format(start)}\n→ ${dayFmt.format(end)} · ${timeFmt.format(end)}`
}

const KIND_COLORS = {
  build:        0xc9a227,
  meeting:      0x8a94a6,
  competition:  0xe05a2b,
  potluck:      0x5aa55a,
  outreach:     0x4a7fd1,
  volunteering: 0x8b5cb8,
  other:        0x6b7280,
}
const CANCELLED_COLOR = 0xb3261e

const KIND_LABELS = {
  build: 'Build session', meeting: 'Meeting', competition: 'Competition',
  potluck: 'Potluck', outreach: 'Outreach', volunteering: 'Volunteering', other: 'Event',
}

const clamp = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s)
const strike = s => (s ? `~~${s}~~` : s)

/**
 * The event embed. Carries exactly what was asked for: title, start and end in
 * America/Los_Angeles, location, description.
 *
 * Cancellation note: Discord does NOT render markdown in an embed *title*, only
 * in the description and field values. So a cancelled event gets the strike in
 * the description, the field values, and the message content — the title just
 * gets a plain "CANCELLED —" prefix. Relying on ~~title~~ alone would render as
 * literal tildes.
 */
export function eventEmbed(event, { cancelled = false } = {}) {
  const when = formatWhen(event.starts_at, event.ends_at)
  const where = event.location || '—'
  const desc = event.notes ? clamp(event.notes, 1000) : null

  const fields = [
    { name: 'When',  value: cancelled ? strike(when) : when },
    { name: 'Where', value: cancelled ? strike(where) : where, inline: false },
  ]

  const description = cancelled
    ? `**This event is cancelled.**${desc ? `\n\n${strike(desc)}` : ''}`
    : desc

  return {
    title: clamp(cancelled ? `CANCELLED — ${event.title}` : event.title, 256),
    ...(description ? { description } : {}),
    color: cancelled ? CANCELLED_COLOR : (KIND_COLORS[event.kind] ?? KIND_COLORS.other),
    fields,
    footer: { text: cancelled ? 'Cancelled' : (KIND_LABELS[event.kind] || 'Event') },
    // Sorts the embed by event start in clients that surface embed timestamps.
    timestamp: new Date(event.starts_at).toISOString(),
  }
}

/** #calendar post. Never pings anyone — allowed_mentions is empty on purpose. */
export function calendarMessage(event, { cancelled = false } = {}) {
  return {
    content: cancelled ? `~~${clamp(event.title, 180)}~~ — **CANCELLED**` : '',
    embeds: [eventEmbed(event, { cancelled })],
    allowed_mentions: { parse: [] },
  }
}

/**
 * #announcements reminder. `roleIds` are resolved snowflakes; allowed_mentions
 * is pinned to exactly those, so this can never ping @everyone or @here even if
 * an event title contains the literal text.
 */
export function reminderMessage(event, { lead, roleIds = [], cancelled = false } = {}) {
  const pings = roleIds.map(id => `<@&${id}>`).join(' ')
  const label = lead === '24h' ? 'Tomorrow' : 'Starting soon'
  const sub = lead === '24h' ? 'in about 24 hours' : 'in about 2 hours'
  const unix = Math.floor(new Date(event.starts_at).getTime() / 1000)

  const head = cancelled
    ? `**CANCELLED** — ~~${clamp(event.title, 180)}~~`
    : `**${label} — ${clamp(event.title, 180)}** (${sub}, <t:${unix}:R>)`

  return {
    content: [pings, head].filter(Boolean).join(' ').slice(0, 2000),
    embeds: [eventEmbed(event, { cancelled })],
    // parse: [] blocks @everyone/@here/@user entirely; only these role IDs ping.
    allowed_mentions: { parse: [], roles: roleIds.slice(0, 20) },
  }
}

/**
 * Hash of the payload we are about to send. Stored on the tracking row; when a
 * later run renders a different hash the message is EDITED, never reposted.
 * Key order is fixed by the builders above, so JSON.stringify is stable.
 */
export function payloadHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)
}
