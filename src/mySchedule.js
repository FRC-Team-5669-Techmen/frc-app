// My schedule (ledger 0033): one member's own day at a competition, from
// three sources, in time order per Los Angeles day:
//   - stations: their role board slots (assigned, and backup marked as such),
//   - rides: their seats in trip cars (my_schedule_rides, 0043),
//   - team blocks: the calendar events on that day (load-in, quals, lunch).
// Pure; MySchedulePage.jsx loads, this arranges. The push reminders (0043
// schedule_reminders_run) go out 10 minutes before an ASSIGNED station and
// 15 before a car leaves; REMIND_* say so on the page.
import { eventDayKeys, laDayKey } from './eventDays.js'
import { roleLabel } from './roleBoard.js'
import { ROLE_PLACE } from './roleRules.js'

export const REMIND_STATION_MIN = 10
export const REMIND_RIDE_MIN = 15

// Where a role happens, as a person reads it. 0043's _role_place says the
// same in the push; tests/my-schedule.test.js holds the two maps equal.
export const PLACE_WORDS = Object.freeze({ field: 'Field (drive team queue)', stands: 'Stands', pit: 'Pit', roaming: 'Around the venue' })
export const placeOf = (role) => PLACE_WORDS[ROLE_PLACE[role]] ?? 'Your assignment'

const ms = (iso) => Date.parse(iso)

/**
 * days: [{ key, label, items: [{ kind: 'station' | 'ride' | 'team', id, start, end,
 *   title, detail, where, status, roles }] }], every competition day, even empty.
 */
export function buildDays({ competition, events = [], shifts = [], rides = [] }) {
  if (!competition) return []
  const keys = eventDayKeys(competition)
  const byDay = new Map(keys.map((k) => [k, []]))
  // One station per slot: a member with two roles in one slot sees one card.
  const slots = new Map()
  for (const s of shifts) {
    if (!s.starts_at || !['assigned', 'backup'].includes(s.status)) continue
    const k = s.slotId ?? `${s.label}:${s.starts_at}`
    const cur = slots.get(k) ?? { kind: 'station', id: `slot:${k}`, start: s.starts_at, end: s.ends_at ?? null, title: '', detail: s.label, roles: [], places: new Set(), status: 'backup' }
    cur.roles.push({ role: s.role, status: s.status })
    cur.places.add(placeOf(s.role))
    if (s.status === 'assigned') cur.status = 'assigned'
    slots.set(k, cur)
  }
  for (const st of slots.values()) {
    const key = laDayKey(st.start)
    if (!byDay.has(key)) continue
    const mine = st.roles.filter((r) => r.status === 'assigned')
    const shown = (mine.length ? mine : st.roles).map((r) => roleLabel(r.role))
    byDay.get(key).push({ ...st, places: undefined, where: [...st.places].join(' and '), title: shown.join(' + '),
      note: st.status === 'backup' ? 'Backup: be ready if a mentor calls you in' : null })
  }
  for (const r of rides) {
    const key = r.date
    if (!byDay.has(key)) continue
    const when = r.leave_by ?? r.meet_at ?? null
    byDay.get(key).push({ kind: 'ride', id: `ride:${r.car_id}`, start: when, end: null,
      title: r.run === 'home' ? 'Ride home' : 'Ride to the venue',
      detail: [r.driver, r.description].filter(Boolean).join(' · '),
      where: r.run === 'to' && r.meet_place ? r.meet_place : null,
      status: r.arrived_at ? 'arrived' : r.left_at ? 'left' : 'planned', note: when ? null : 'Leave time not set yet' })
  }
  for (const e of events) {
    if (e.id === competition.id || !e.starts_at) continue
    for (const key of eventDayKeys(e)) {
      if (!byDay.has(key)) continue
      byDay.get(key).push({ kind: 'team', id: `event:${e.id}:${key}`, start: e.starts_at, end: e.ends_at ?? null,
        title: cap(e.title.replace(new RegExp(`^${escape(competition.title.split(' ')[0])}[^:]*:\\s*`, 'i'), '')),
        detail: e.notes ?? null, where: e.location ?? null, status: e.kind, kindLabel: e.kind === 'volunteering' ? 'Volunteering' : null })
    }
  }
  return keys.map((key) => ({
    key,
    label: new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    items: byDay.get(key).sort((a, b) => (ms(a.start) || Infinity) - (ms(b.start) || Infinity) || order(a) - order(b)),
  }))
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const order = (it) => ({ ride: 0, station: 1, team: 2 })[it.kind] ?? 3
const endOf = (it) => (it.end ? ms(it.end) : ms(it.start) + (it.kind === 'ride' ? 15 * 60e3 : 60 * 60e3))

/** What I am doing now and what is next (my own stations and rides only). */
export function nowNext(days, now = Date.now()) {
  const mine = days.flatMap((d) => d.items).filter((it) => it.kind !== 'team' && it.start && it.status !== 'arrived')
    .sort((a, b) => ms(a.start) - ms(b.start))
  const current = mine.find((it) => ms(it.start) <= now && endOf(it) > now) ?? null
  const next = mine.find((it) => ms(it.start) > now) ?? null
  return { now: current, next, minutesToNext: next ? Math.ceil((ms(next.start) - now) / 60e3) : null }
}

/** The day to open: today if the competition covers it, else its first day. */
export function defaultDay(days, now = Date.now()) {
  const today = laDayKey(new Date(now).toISOString())
  return days.find((d) => d.key === today)?.key ?? days.find((d) => d.key > today)?.key ?? days.at(-1)?.key ?? null
}
