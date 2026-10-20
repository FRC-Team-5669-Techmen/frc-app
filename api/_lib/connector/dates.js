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
