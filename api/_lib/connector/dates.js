// Los Angeles calendar dates for the connector's reads.
//
// DUPLICATED ON PURPOSE, AND GATED: `laDateKey` and `laMidnightMs` are copied
// from src/hoursUtils.js, which a Vercel function cannot import (its own
// imports carry no file extension, which Node ESM refuses).
// tests/connector-engine.test.js holds both copies equal across both 2026 DST
// changes and every hour of a sample year. Change one, change both.

const LA_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' })
export function laDateKey(t) {
  const p = {}
  for (const { type, value } of LA_DATE.formatToParts(new Date(t))) p[type] = value
  return `${p.year}-${p.month}-${p.day}`
}

export function laMidnightMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  for (const hourUtc of [7, 8]) {
    const t = Date.UTC(y, m - 1, d, hourUtc)
    if (laDateKey(t) === dateStr && laDateKey(t - 1) !== dateStr) return t
  }
  return Date.UTC(y, m - 1, d, 8)
}

/** YYYY-MM-DD plus n days. */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const LA_CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })
const LA_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' })
export const laClock = (t) => (t ? LA_CLOCK.format(new Date(t)) : null)
export const laDay = (t) => (t ? LA_DAY.format(new Date(t)) : null)

/**
 * A wall-clock time he said, read as Los Angeles time, as an ISO instant.
 * "2026-10-24 09:00", "2026-10-24T09:00" or with seconds; a value that
 * already carries Z or an offset is taken as given. null when it is not a
 * time, or names an hour the clocks skip (the spring change).
 */
export function laWallToIso(value) {
  const s = String(value ?? '').trim()
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s) && /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const t = Date.parse(s.replace(' ', 'T'))
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (!m) return null
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null
  const want = `${m[1]}-${m[2]}-${m[3]} ${String(h).padStart(2, '0')}:${m[5]}`
  for (const offsetH of [7, 8]) {
    const t = Date.UTC(y, mo - 1, d, h + offsetH, mi, se)
    if (laWall(t) === want) return new Date(t).toISOString()
  }
  return null
}

const LA_WALL = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function laWall(t) {
  const p = {}
  for (const { type, value } of LA_WALL.formatToParts(new Date(t))) p[type] = value
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}
