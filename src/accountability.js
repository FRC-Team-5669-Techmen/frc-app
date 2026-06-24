// Accountability / eligibility helpers — hour goals, anomaly detection, and the
// attendance-vs-hours split. Pure functions (no React/Supabase); builds on the
// session derivation in hoursUtils.
import { sessionsFromEvents } from './hoursUtils'
import { CATEGORIES } from './categories'

const ALL_CATEGORY_KEYS = CATEGORIES.map(c => c.key)
const fmtTs = iso => new Date(iso).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

// ── Attendance (separate from clocked hours) ─────────────────────────────────
// Meeting attendance is scoped as the count of distinct calendar days on which a
// member has at least one IN ("days present") — robust and decoupled from the
// schedule. This is intentionally NOT hours: a member can be present many days
// with few logged hours, or vice-versa, and the two are reported side by side.
export function daysPresent(events, { since = null, until = null } = {}) {
  const days = new Set()
  for (const e of events) {
    if (e.type !== 'in') continue
    const day = e.event_time.slice(0, 10)
    if (since && day < since) continue
    if (until && day > until) continue
    days.add(day)
  }
  return days.size
}

// ── Hour goals ───────────────────────────────────────────────────────────────
// Effective goal for a member in a season: their override row if present, else
// the team-default row (member_id null) for that season, else null.
export function effectiveGoal(goals, memberId, seasonId) {
  if (!goals || !seasonId) return null
  const inSeason = goals.filter(g => g.season_id === seasonId)
  return inSeason.find(g => g.member_id === memberId)
    ?? inSeason.find(g => g.member_id == null)
    ?? null
}

// The category keys a goal counts toward (null/empty subset → all six).
export function goalCategoryKeys(goal) {
  return goal?.categories?.length ? goal.categories : ALL_CATEGORY_KEYS
}

// Hours toward a goal from a per-season breakdown bucket ({build, outreach, …}).
export function hoursTowardGoal(stats, goal) {
  if (!stats) return 0
  return goalCategoryKeys(goal).reduce((s, k) => s + (stats[k] ?? 0), 0)
}

// ── Anomaly detection (advisory; never mutates / deletes) ────────────────────
// Returns [{ kind, label, detail, at, eventIds }] for one member's events.
//  - double_in : a check-in left open before another check-in (an orphan IN with
//                no OUT that isn't the currently-active session — covers both the
//                "orphan IN" and "two INs, no OUT between" cases, which are the
//                same event pattern under sequential pairing).
//  - overlap   : two derived sessions whose real clock intervals intersect.
//  - capped    : a session clamped by the forgot-to-sign-out cap (wasCapped).
//  - geofence  : an IN recorded with geo_ok = false while the member is not
//                currently geofence-exempt (checked in without location proof).
export function detectAnomalies(events, { exempt = false } = {}) {
  const out = []
  const sorted = [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))

  // double_in: an IN arrives while a prior IN is still open.
  let openIn = null
  for (const e of sorted) {
    if (e.type === 'in') {
      if (openIn) {
        out.push({
          kind: 'double_in',
          label: 'Two check-ins with no check-out between',
          detail: `Check-in at ${fmtTs(openIn.event_time)} was never closed before the next check-in at ${fmtTs(e.event_time)}.`,
          at: openIn.event_time,
          eventIds: [openIn.id, e.id],
        })
      }
      openIn = e
    } else if (e.type === 'out') {
      openIn = null
    }
  }
  // A trailing open IN is the currently-active session (or stale → caught by the
  // cap check below), so it is intentionally NOT flagged here.

  // Sessions for the cap + overlap checks.
  const sessions = sessionsFromEvents(events)
  for (const s of sessions) {
    if (s.wasCapped) {
      out.push({
        kind: 'capped',
        label: 'Session hit the max-length cap',
        detail: `Session from ${fmtTs(s.inTime.toISOString())} was clamped (likely a missed check-out).`,
        at: s.inTime.toISOString(),
        eventIds: [s.inId, s.outId].filter(Boolean),
      })
    }
  }
  // overlap: real clock intervals that intersect (sequential pairing makes this
  // rare, but manual entries / out-of-order data can produce it).
  const ranges = sessions.map(s => ({
    start: s.inTime.getTime(),
    end: (s.outTime ?? new Date()).getTime(),
    ids: [s.inId, s.outId].filter(Boolean),
    at: s.inTime.toISOString(),
  })).sort((a, b) => a.start - b.start)
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) {
      out.push({
        kind: 'overlap',
        label: 'Overlapping sessions',
        detail: `A session starting ${fmtTs(ranges[i].at)} overlaps the previous one.`,
        at: ranges[i].at,
        eventIds: [...new Set([...ranges[i - 1].ids, ...ranges[i].ids])],
      })
    }
  }

  // geofence: IN recorded without location proof for a non-exempt member.
  if (!exempt) {
    for (const e of sorted) {
      if (e.type === 'in' && e.geo_ok === false) {
        out.push({
          kind: 'geofence',
          label: 'Check-in outside the geofence (no exemption)',
          detail: `Check-in at ${fmtTs(e.event_time)} was recorded without a verified location and the member is not exempt.`,
          at: e.event_time,
          eventIds: [e.id],
        })
      }
    }
  }

  return out
}

export const ANOMALY_KINDS = ['double_in', 'overlap', 'capped', 'geofence']
