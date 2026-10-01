// America/Los_Angeles wall-clock helpers for fixture seeds, with no library.
// Seeds are written relative to the fixture clock ("3 days ago at 3:30 PM LA")
// so every route renders a believable week whatever day it is opened.

export const TZ = 'America/Los_Angeles'

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function laParts(date) {
  const o = {}
  for (const { type, value } of fmt.formatToParts(date)) o[type] = value
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute, ss: +o.second }
}

// 'YYYY-MM-DD' of `date` in LA.
export function laDate(date) {
  const p = laParts(date)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

// The instant that reads `ymd hh:mm` on an LA wall clock. Two passes settle the
// offset across a DST boundary.
export function laInstant(ymd, hh = 0, mm = 0) {
  const [y, m, d] = ymd.split('-').map(Number)
  const want = Date.UTC(y, m - 1, d, hh, mm)
  let t = want
  for (let i = 0; i < 2; i += 1) {
    const p = laParts(new Date(t))
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm)
    t += want - seen
  }
  return new Date(t)
}

// 'YYYY-MM-DD' `days` LA calendar days from `date` (negative = past).
export function laAddDays(date, days) {
  const [y, m, d] = laDate(date).split('-').map(Number)
  const u = new Date(Date.UTC(y, m - 1, d + days, 12))
  return u.toISOString().slice(0, 10)
}

// Day of week (0 = Sunday) of an LA 'YYYY-MM-DD'.
export function dow(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}

// An instant `days` from now at an LA wall time.
export function laAt(now, days, hh, mm = 0) {
  return laInstant(laAddDays(now, days), hh, mm)
}
