/**
 * Week-ahead schedule post: window math, subteam attribution, rendering.
 *
 * Pure. No network, no Supabase, no env. The handler in
 * api/discord-week-ahead.js does the I/O and calls in here, so the rendering
 * can be exercised without credentials.
 *
 * Every time the team reads is America/Los_Angeles regardless of where the
 * function ran, which is why the timeZone is pinned on every formatter and why
 * calendar arithmetic runs on day keys rather than on local Date methods.
 *
 * NOTE ON DASHES: generated copy uses "to" and plain periods. No em dashes
 * anywhere in this file, including template strings.
 */

import { SUBTEAMS } from '../../src/subteams.js'

const LA = 'America/Los_Angeles'

// Discord rejects a message content longer than this.
const DISCORD_CONTENT_LIMIT = 2000

// ─────────────────────────────────────────────────────────────────────────────
// LA calendar helpers
//
// A "day key" is 'YYYY-MM-DD' in LA time, the same shape SchedulePage.dayKey
// produces. Arithmetic on a key goes through Date.UTC because a key encodes a
// pure calendar fact (which day, which weekday) with no instant attached, so
// UTC math on it can never drift across a DST changeover.
// ─────────────────────────────────────────────────────────────────────────────

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: LA, year: 'numeric', month: '2-digit', day: '2-digit',
})

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LA, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LA, hour: 'numeric', minute: '2-digit',
})

const timeZoneFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LA, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})

const dayLabelFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
})

/** The LA calendar day an instant falls on, as 'YYYY-MM-DD'. */
export const laDayKey = value => dayKeyFmt.format(new Date(value))

/** Minutes to add to a UTC instant to get LA wall-clock time (negative in LA). */
function laOffsetMinutes(date) {
  const p = {}
  for (const part of partsFmt.formatToParts(date)) p[part.type] = part.value
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  const whole = Math.floor(date.getTime() / 1000) * 1000
  return (wall - whole) / 60000
}

/** Midnight at the start of an LA calendar day, as a UTC instant. */
export function laDayStartUTC(key) {
  const [y, m, d] = key.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0)
  // Two passes: the first offset is sampled at the wrong instant on a DST
  // changeover day, the second is sampled at the corrected one.
  let instant = new Date(wall)
  for (let i = 0; i < 2; i++) instant = new Date(wall - laOffsetMinutes(instant) * 60000)
  return instant
}

function keyToUTC(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function utcToKey(dt) {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Shift a day key by n calendar days. */
export function addDayKey(key, n) {
  const dt = keyToUTC(key)
  dt.setUTCDate(dt.getUTCDate() + n)
  return utcToKey(dt)
}

/** Weekday of a day key. 0 = Sunday, matching Date.getDay(). */
export function dayKeyWeekday(key) {
  return keyToUTC(key).getUTCDay()
}

/** 'Mon Sep 7' for a day key. */
export function dayLabel(key) {
  return dayLabelFmt.format(keyToUTC(key))
}

/** Is this instant on a Sunday in America/Los_Angeles? */
export function isSundayInLA(now) {
  return dayKeyWeekday(laDayKey(now)) === 0
}

/**
 * The coming Monday-to-Sunday window, relative to an instant.
 *
 * Run on a Sunday evening this is tomorrow through the Sunday after, which is
 * the week the post is about. Returned as both day keys (for date-typed columns
 * and for display) and UTC instants (for timestamptz range filters).
 */
export function comingWeekWindow(now) {
  const today = laDayKey(now)
  const dow = dayKeyWeekday(today)
  // Days until the next Monday. Sunday (0) is 1 day out; every other day is
  // 8 - dow, which on a Monday gives 7, i.e. next Monday rather than today.
  const toMonday = dow === 0 ? 1 : 8 - dow
  const monday = addDayKey(today, toMonday)
  const sunday = addDayKey(monday, 6)
  return {
    monday,
    sunday,
    startUTC: laDayStartUTC(monday),
    endUTC: laDayStartUTC(addDayKey(sunday, 1)), // exclusive
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subteam attribution
//
// public.events has NO subteam column, so attribution has to be read out of the
// text staff already write. Two signals, in descending trust:
//
//   1. An explicit "Subteams: Mechanical, Electrical" line anywhere in title or
//      notes. That is a declaration, so it is taken as the whole answer and
//      nothing further is inferred for that event.
//   2. Otherwise a word-bounded match of the canonical vocabulary against the
//      TITLE ONLY.
//
// WHY THE TITLE ONLY. The nearest prior art,
// supabase/functions/discord-calendar/lib/render.js, matches over title + notes,
// but it matches a hand-curated alias list that deliberately contains no common
// English word. This matches the full 12-value vocabulary from src/subteams.js,
// which does: "Management", "Media", "Fabrication", "CAD". Run over notes prose
// that reads "Electrical runs wire management", it attributed the session to
// Management, which is simply false. A title names what a session IS; notes are
// prose, and a vocabulary word occurring in prose is not an assignment. Signal 1
// is the escape hatch for a session whose title cannot carry the names.
//
// Where the data names no subteam, nothing is claimed for it.
// ─────────────────────────────────────────────────────────────────────────────

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Longest first so "Business/Outreach" is matched before the "Outreach" inside
// it and "Drive Team" is never shadowed by a shorter partial.
const BY_LENGTH = [...SUBTEAMS].sort((a, b) => b.length - a.length)

const CANON_BY_LOWER = new Map(SUBTEAMS.map(s => [s.toLowerCase(), s]))

// "Subteams: A, B and C" up to the end of the line. Singular accepted.
const DECLARED_RE = /subteams?\s*:\s*([^\n\r]+)/i

/** Canonical subteam names this event names, in vocabulary order. */
export function namedSubteams(event) {
  const title = event?.title || ''
  const notes = event?.notes || ''
  const hit = new Set()

  const declared = DECLARED_RE.exec(`${title}\n${notes}`)
  if (declared) {
    for (const raw of declared[1].split(/,| and /i)) {
      // Strip leading and trailing punctuation. The capture runs to the end of
      // the line, so the last name carries the sentence period: "CAD, Media."
      // Interior punctuation is left alone, because "Business/Outreach" and
      // "Field & Pit" contain some.
      const canon = CANON_BY_LOWER.get(raw.trim().replace(/^\W+|\W+$/g, '').toLowerCase())
      if (canon) hit.add(canon)
    }
    // A declaration that named nothing canonical is still a declaration. Fall
    // through to the title match only when it produced no usable name at all.
    if (hit.size) return SUBTEAMS.filter(s => hit.has(s))
  }

  for (const name of BY_LENGTH) {
    // (?<![\w-]) ... (?![\w-]) keeps "CAD" out of "cadence" and "Media" out of
    // "multimedia", while still allowing the "/" and "&" inside some names.
    const re = new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`, 'i')
    if (re.test(title)) hit.add(name)
  }
  return SUBTEAMS.filter(s => hit.has(s))
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

/** "4:00 PM to 7:00 PM PDT", or a cross-day range with the end date spelled. */
function whenLine(event) {
  const start = new Date(event.starts_at)
  const end = event.ends_at ? new Date(event.ends_at) : null
  if (!end) return timeZoneFmt.format(start)
  if (laDayKey(start) === laDayKey(end)) {
    return `${timeFmt.format(start)} to ${timeZoneFmt.format(end)}`
  }
  return `${timeFmt.format(start)} to ${dayLabel(laDayKey(end))} ${timeZoneFmt.format(end)}`
}

/** Facts that hang off the event row: where, whether attendance is required. */
function factsLine(event) {
  const bits = []
  if (event.location) bits.push(event.location)
  if (event.mandatory) bits.push('Mandatory')
  if (event.rsvp_enabled) bits.push('RSVP requested')
  return bits.length ? bits.join('. ') + '.' : ''
}

function clampToDiscord(text) {
  if (text.length <= DISCORD_CONTENT_LIMIT) return text
  const tail = '\nPost truncated. Full schedule is in the app.'
  return text.slice(0, DISCORD_CONTENT_LIMIT - tail.length).trimEnd() + tail
}

/**
 * The whole message body.
 *
 * An empty window still renders: it states plainly that nothing is scheduled.
 * Silence would be indistinguishable from the job having failed.
 */
export function renderWeekAhead({ monday, sunday, events = [], deadlines = [] }) {
  const lines = []
  lines.push('**WEEK AHEAD**')
  lines.push(`${dayLabel(monday)} to ${dayLabel(sunday)}`)
  lines.push('')

  // ── SCHEDULE ──
  lines.push('**SCHEDULE**')
  if (!events.length) {
    lines.push('No team activity is scheduled this week.')
  } else {
    // Bucket by LA start day. An event that began before the window opened is
    // shown on the first day of the window, which is where it is relevant.
    const byDay = new Map()
    for (const ev of events) {
      const startKey = laDayKey(ev.starts_at)
      const key = startKey < monday ? monday : startKey
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(ev)
    }
    for (const key of [...byDay.keys()].sort()) {
      lines.push(dayLabel(key))
      for (const ev of byDay.get(key)) {
        lines.push(`  ${whenLine(ev)}  ${String(ev.kind || 'other').toUpperCase()}  ${ev.title}`)
        const facts = factsLine(ev)
        if (facts) lines.push(`  ${facts}`)
      }
    }
  }
  lines.push('')

  // ── SUBTEAMS ──
  // Only rendered when there is a week to describe. Where no event names a
  // subteam, that is said outright rather than left blank.
  if (events.length) {
    lines.push('**SUBTEAMS**')
    const byTeam = new Map()
    for (const ev of events) {
      for (const team of namedSubteams(ev)) {
        if (!byTeam.has(team)) byTeam.set(team, [])
        byTeam.get(team).push(ev)
      }
    }
    if (!byTeam.size) {
      lines.push('No subteam is named in this week of schedule data.')
    } else {
      for (const team of SUBTEAMS) {
        if (!byTeam.has(team)) continue
        const items = byTeam.get(team)
          .map(ev => `${ev.title} (${dayLabel(laDayKey(ev.starts_at))})`)
          .join(', ')
        lines.push(`${team}: ${items}`)
      }
    }
    lines.push('')
  }

  // ── DEADLINES ──
  lines.push('**DEADLINES**')
  if (!deadlines.length) {
    lines.push('No job deadlines fall in this week.')
  } else {
    for (const task of deadlines) {
      const tag = task.subteam ? `  [${task.subteam}]` : ''
      lines.push(`${dayLabel(task.due_date)}  ${task.title}${tag}`)
    }
  }

  return clampToDiscord(lines.join('\n').trimEnd())
}
