// The Los Angeles calendar days an event covers. A competition is ONE event
// spanning its days (rosters and the role board read it that way), so the
// schedule shows it on every day, not just the day it starts.
// An event ending exactly at midnight does not cover the next day.

const TZ = 'America/Los_Angeles'

export function laDayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

function nextKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return dt.toISOString().slice(0, 10)
}

export function eventDayKeys(ev) {
  const first = laDayKey(ev.starts_at)
  if (!ev.ends_at) return [first]
  // One millisecond before the end, so a midnight end stays on the prior day.
  const endMs = new Date(ev.ends_at).getTime()
  const last = laDayKey(new Date(Math.max(endMs - 1, new Date(ev.starts_at).getTime())).toISOString())
  const keys = [first]
  let k = first
  for (let i = 0; i < 31 && k < last; i++) { k = nextKey(k); keys.push(k) }
  return keys
}

export function isMultiDay(ev) {
  return eventDayKeys(ev).length > 1
}
