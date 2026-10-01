// The "is this member checked in right now?" rule, and what a tap on the NFC tag
// does about it. ONE rule, in src/attendanceState.js, read by the dashboard
// (HomePage), both tag routes (CheckinPage, VolunteerCheckinPage) and the
// presence board / glance / parent view (presence.js computePresence).
//
// THE REPORT this suite reproduces (feedback row, 2026-09-08 3:32 PM, iPhone,
// Chrome iOS): "I have been checking in, but every single time I try to check
// out it sent me to the check-in portal." The check-in portal is CheckinPage's
// confirm screen ("Tap to confirm your check-in"), which the tag route renders
// whenever it decides the member is NOT checked in.
//
// EVERY DEFECT CASE CARRIES ITS OWN POSITIVE CONTROL. `legacyNfcAction` below is
// the rule as it shipped at 89896ca (CheckinPage.jsx:125-147), transcribed, so
// each defect fixture is shown to reproduce the wrong answer under the old rule
// AND the right one under the shipped module. A fixture that the old rule
// already got right would prove nothing, and the suite says so by failing.
//
// Times are written in the exact shape PostgREST returns a timestamptz
// ("2026-09-08T22:15:03.123456+00:00"): microseconds and a +00:00 offset.

// Zone-independent on purpose: the shipped module names America/Los_Angeles
// itself, and the legacy control below pins "the phone" to Los Angeles rather
// than reading the zone of whatever machine runs the suite. So
// `TZ=UTC npx vitest run tests/attendance-state.test.js` passes too.

import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import {
  ARRIVAL_HANDLED, DUPLICATE_WINDOW_MS, STATUS_LOOKBACK_MS,
  currentStatus, eventMs, isDuplicateTap, isRevisit, latestEvent, nextNfcAction,
  readLocalTap, receiptHolds, recordLocalTap, statusWindowStartISO, whenForeground,
} from '../src/attendanceState.js'
import { computePresence, presenceSinceISO } from '../src/presence.js'
import { MAX_SESSION_MS, laDateKey } from '../src/hoursUtils.js'

// ── fixtures ────────────────────────────────────────────────────────────────
// Every date used here is inside Pacific DAYLIGHT time (UTC-7), asserted below,
// so a wall-clock string converts to UTC by adding seven hours.
const PDT_MS = 7 * 60 * 60 * 1000
/** '2026-09-08 15:15' (Los Angeles wall clock) -> epoch ms */
const la = (wall) => Date.parse(`${wall.replace(' ', 'T')}:00.000Z`) + PDT_MS
/** epoch ms -> the PostgREST timestamptz shape, microseconds included */
const pg = (ms) => new Date(ms).toISOString().replace('Z', '456+00:00')
/** Los Angeles midnight of the day containing `ms` (PDT dates only, as above) */
const laMidnight = (ms) => la(`${new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })} 00:00`)
let seq = 0
const ev = (type, wall, over = {}) => ({
  id: `e${++seq}`, user_id: 'u1', type, event_time: pg(la(wall)), category: 'build', ...over,
})

describe('fixture sanity', () => {
  test('the wall-clock helper lands on the Los Angeles wall clock it names', () => {
    const fmt = (ms) => new Date(ms).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    expect(fmt(la('2026-09-08 15:15'))).toBe('09/08/2026, 15:15')
    expect(fmt(la('2026-09-08 23:30'))).toBe('09/08/2026, 23:30')
    expect(fmt(la('2026-09-09 00:30'))).toBe('09/09/2026, 00:30')
  })

  test('the PostgREST microsecond shape parses to the millisecond', () => {
    const e = ev('in', '2026-09-08 15:15')
    expect(e.event_time).toBe('2026-09-08T22:15:00.000456+00:00')
    expect(eventMs(e)).toBe(Date.UTC(2026, 8, 8, 22, 15, 0, 0))
    // and an unparseable time is ignored rather than treated as the newest event
    expect(eventMs({ event_time: 'not a time' })).toBeNaN()
    expect(latestEvent([{ type: 'out', event_time: 'garbage' }, e])).toBe(e)
  })
})

// The rule as it shipped at 89896ca, CheckinPage.jsx:125-147: read the latest
// event since device-local midnight (an error reads as "no rows"), a 60 s
// duplicate window on device-clock-minus-server-time, then toggle. It had no
// notion of HOW the page was reached, so every mount toggled.
function legacyNfcAction(events, now) {
  // `new Date(); setHours(0, 0, 0, 0)` on a phone set to Los Angeles time
  const startOfToday = new Date(laMidnight(now))
  const recent = (events ?? [])
    .filter(e => new Date(e.event_time) >= startOfToday)
    .sort((a, b) => new Date(b.event_time) - new Date(a.event_time))
    .slice(0, 1)
  const lastEvent = recent[0]
  if (lastEvent && now - new Date(lastEvent.event_time) < 60_000) return 'duplicate'
  return lastEvent?.type === 'in' ? 'check_out' : 'check_in'
}

// ── the everyday flows: unchanged, and identical under both rules ───────────
describe('the everyday flows (no regression)', () => {
  const NOW = la('2026-09-08 18:00')

  test('no events at all: not checked in, the tag offers check-in', () => {
    expect(currentStatus([], NOW)).toMatchObject({ known: true, checkedIn: false, since: null })
    expect(nextNfcAction([], NOW).action).toBe('check_in')
    expect(legacyNfcAction([], NOW)).toBe('check_in')
  })

  test('checked in at 3:15 PM, tapping at 6:00 PM checks OUT automatically', () => {
    const evs = [ev('in', '2026-09-08 15:15')]
    expect(currentStatus(evs, NOW)).toMatchObject({ checkedIn: true, since: evs[0].event_time })
    expect(nextNfcAction(evs, NOW).action).toBe('check_out')
    expect(legacyNfcAction(evs, NOW)).toBe('check_out')
  })

  test('check-in, check-out, check-in again and check-out again on the same day', () => {
    const inA = ev('in', '2026-09-08 15:15')
    const outA = ev('out', '2026-09-08 17:00')
    const inB = ev('in', '2026-09-08 18:00')
    const outB = ev('out', '2026-09-08 20:30')
    const steps = [
      // [ledger so far, tap time, expected action, checked in?]
      [[], '2026-09-08 15:15', 'check_in', false],
      [[inA], '2026-09-08 17:00', 'check_out', true],
      [[inA, outA], '2026-09-08 18:00', 'check_in', false],
      [[inA, outA, inB], '2026-09-08 20:30', 'check_out', true],
      [[inA, outA, inB, outB], '2026-09-08 21:00', 'check_in', false],
    ]
    for (const [ledger, wall, action, checkedIn] of steps) {
      const now = la(wall)
      expect(nextNfcAction(ledger, now).action, wall).toBe(action)
      expect(currentStatus(ledger, now).checkedIn, wall).toBe(checkedIn)
      expect(legacyNfcAction(ledger, now), wall).toBe(action)
    }
  })

  test('order of the input does not matter (the dashboard reads newest-first)', () => {
    const evs = [ev('in', '2026-09-08 15:15'), ev('out', '2026-09-08 16:00'), ev('in', '2026-09-08 16:30')]
    const asc = currentStatus(evs, NOW)
    const desc = currentStatus([...evs].reverse(), NOW)
    expect(desc).toEqual(asc)
    expect(asc.checkedIn).toBe(true)
    expect(asc.since).toBe(evs[2].event_time)
  })

  test('a repeat tap inside 60 s is a duplicate; at 61 s it toggles', () => {
    const evs = [ev('in', '2026-09-08 15:15')]
    const t = eventMs(evs[0])
    expect(nextNfcAction(evs, t + 30_000).action).toBe('duplicate')
    expect(legacyNfcAction(evs, t + 30_000)).toBe('duplicate')
    // positive control: the same ledger just past the window toggles
    expect(nextNfcAction(evs, t + DUPLICATE_WINDOW_MS + 1_000).action).toBe('check_out')
    expect(legacyNfcAction(evs, t + DUPLICATE_WINDOW_MS + 1_000)).toBe('check_out')
  })

  test('a fresh tap still checks out on its own: the fast path keeps zero taps', () => {
    const evs = [ev('in', '2026-09-08 15:15')]
    expect(nextNfcAction(evs, NOW, { revisit: false }).action).toBe('check_out')
  })
})

// ── the defects ─────────────────────────────────────────────────────────────
// Each row: the fixture, the shipped answer, and the answer the 89896ca rule
// gave. The legacy column is asserted too: it is what makes each row a test of
// the defect rather than of a fixture that never exercised it.
describe('defects that read to a student as "it sent me to the check-in portal"', () => {
  test('ROOT CAUSE: re-entering a /checkin page that already acted toggles again', () => {
    // 3:15 PM tag tap -> confirm -> checked in. The tab stays on /checkin. At
    // 4:00 PM the same history entry is shown again: an iOS back-swipe from
    // /dashboard (the success screen's own "VIEW STATUS" link pushed it), or
    // Chrome iOS reloading the evicted tab when it is brought back.
    const evs = [ev('in', '2026-09-08 15:15')]
    const now = la('2026-09-08 16:00')
    expect(legacyNfcAction(evs, now)).toBe('check_out') // the silent 4:00 PM check-out
    const revisit = nextNfcAction(evs, now, { revisit: true })
    expect(revisit.action).toBe('confirm_check_out') // shown, never written
    expect(revisit.status.checkedIn).toBe(true)

    // ...and the student's REAL check-out tap at 6:00 PM, after that silent
    // 4:00 PM OUT, lands on the check-in confirm screen: the reported symptom.
    const afterSilentOut = [...evs, ev('out', '2026-09-08 16:00', { method: 'nfc' })]
    expect(legacyNfcAction(afterSilentOut, la('2026-09-08 18:00'))).toBe('check_in')
    // With the fix the 4:00 PM revisit wrote nothing, so the 6:00 PM tap is a
    // check-out, exactly as the student meant it.
    expect(nextNfcAction(evs, la('2026-09-08 18:00')).action).toBe('check_out')
  })

  test('a revisit when NOT checked in still offers check-in (nothing auto-writes either way)', () => {
    const evs = [ev('in', '2026-09-08 15:15'), ev('out', '2026-09-08 17:00')]
    expect(nextNfcAction(evs, la('2026-09-08 17:30'), { revisit: true }).action).toBe('check_in')
  })

  test('a failed status read is UNKNOWN, never "not checked in"', () => {
    const now = la('2026-09-08 18:00')
    // CheckinPage.jsx:128 discarded the read's error; `recent` was undefined and
    // the member was offered check-in.
    expect(legacyNfcAction(undefined, now)).toBe('check_in')
    expect(nextNfcAction(null, now).action).toBe('unknown')
    expect(nextNfcAction(undefined, now).action).toBe('unknown')
    expect(currentStatus(null, now)).toMatchObject({ known: false, checkedIn: false })
    // positive control: an EMPTY read is a real answer and offers check-in
    expect(nextNfcAction([], now).action).toBe('check_in')
  })

  test('a session open across midnight is still checked in', () => {
    const evs = [ev('in', '2026-09-08 23:30')]
    const now = la('2026-09-09 00:30')
    expect(legacyNfcAction(evs, now)).toBe('check_in') // "today" started at midnight
    expect(currentStatus(evs, now)).toMatchObject({ checkedIn: true, since: evs[0].event_time })
    expect(nextNfcAction(evs, now).action).toBe('check_out')
  })

  test('a stale IN (not today and older than the session cap) is NOT checked in', () => {
    // A forgotten check-out from two days ago must not make today's first tap a
    // check-out. Same answer as before: this is the boundary the cross-midnight
    // fix must not cross.
    const evs = [ev('in', '2026-09-07 15:15')]
    const now = la('2026-09-09 15:15')
    expect(currentStatus(evs, now)).toMatchObject({ checkedIn: false, stale: true, since: null })
    expect(nextNfcAction(evs, now).action).toBe('check_in')
    expect(legacyNfcAction(evs, now)).toBe('check_in')
  })

  test('a long same-day session past the cap still counts (a full Saturday is not cut off)', () => {
    const evs = [ev('in', '2026-09-12 08:00')]
    const now = la('2026-09-12 20:30')
    expect(now - eventMs(evs[0])).toBeGreaterThan(MAX_SESSION_MS)
    expect(currentStatus(evs, now).checkedIn).toBe(true)
    expect(nextNfcAction(evs, now).action).toBe('check_out')
    expect(legacyNfcAction(evs, now)).toBe('check_out')
  })

  test('the duplicate window survives a phone clock running ahead of the server', () => {
    // Server stamped the IN at 3:15:00. The phone's clock reads 2 minutes fast,
    // so the device recorded that same tap at 3:17:00 by its own clock. A second
    // accidental tap 20 s later reads 3:17:20 on the device.
    const evs = [ev('in', '2026-09-08 15:15')]
    const tap = la('2026-09-08 15:17')
    const now = tap + 20_000
    expect(legacyNfcAction(evs, now)).toBe('check_out') // server age 2m20s: guard bypassed
    const localTap = { type: 'in', at: tap }
    const r = nextNfcAction(evs, now, { localTap })
    expect(r.action).toBe('duplicate')
    expect(r.duplicate.type).toBe('in')
    // positive control: the same device record 61 s old no longer blocks
    expect(nextNfcAction(evs, tap + DUPLICATE_WINDOW_MS + 1_000, { localTap }).action).toBe('check_out')
    expect(isDuplicateTap(evs[0], now, null)).toBe(false)
    expect(isDuplicateTap(evs[0], now, localTap)).toBe(true)
  })

  test('a phone clock running BEHIND still treats a just-made event as a duplicate', () => {
    const evs = [ev('in', '2026-09-08 15:15')]
    const now = eventMs(evs[0]) - 90_000 // device 90 s behind
    expect(nextNfcAction(evs, now).action).toBe('duplicate')
    expect(legacyNfcAction(evs, now)).toBe('duplicate')
  })
})

describe('the volunteer tag (category-aware, same rule underneath)', () => {
  const NOW = la('2026-09-08 18:00')
  test('an open volunteer session checks out; an open build session offers the switch', () => {
    const vol = [ev('in', '2026-09-08 15:15', { category: 'volunteer' })]
    const build = [ev('in', '2026-09-08 15:15', { category: 'build' })]
    expect(nextNfcAction(vol, NOW, { category: 'volunteer' }).action).toBe('check_out')
    expect(nextNfcAction(build, NOW, { category: 'volunteer' }).action).toBe('switch')
    expect(nextNfcAction([], NOW, { category: 'volunteer' }).action).toBe('check_in')
    // the shop tag (no category) checks out either kind of open session
    expect(nextNfcAction(build, NOW).action).toBe('check_out')
    expect(nextNfcAction(vol, NOW).action).toBe('check_out')
  })

  test('a revisit of an open volunteer session asks before checking out', () => {
    const vol = [ev('in', '2026-09-08 15:15', { category: 'volunteer' })]
    expect(nextNfcAction(vol, NOW, { category: 'volunteer', revisit: true }).action).toBe('confirm_check_out')
  })

  test('a volunteer session open across midnight checks out, not in', () => {
    const vol = [ev('in', '2026-09-08 23:30', { category: 'volunteer' })]
    const now = la('2026-09-09 00:30')
    expect(nextNfcAction(vol, now, { category: 'volunteer' }).action).toBe('check_out')
  })
})

// ── one rule everywhere: presence agrees with the dashboard's status ────────
describe('presence (board, glance, parent view) agrees with currentStatus', () => {
  const NOW = la('2026-09-09 00:30')
  const ledger = [
    // u1: open across midnight -> present
    { id: 'a', user_id: 'u1', type: 'in', event_time: pg(la('2026-09-08 23:30')) },
    // u2: checked in and out today -> absent
    { id: 'b', user_id: 'u2', type: 'in', event_time: pg(la('2026-09-09 00:05')) },
    { id: 'c', user_id: 'u2', type: 'out', event_time: pg(la('2026-09-09 00:20')) },
    // u3: open but stale (two days old) -> absent
    { id: 'd', user_id: 'u3', type: 'in', event_time: pg(la('2026-09-07 15:00')) },
    // u4: open, today -> present
    { id: 'e', user_id: 'u4', type: 'in', event_time: pg(la('2026-09-09 00:10')) },
  ]

  test('every member: present exactly when currentStatus says checked in', () => {
    const present = computePresence(ledger, NOW)
    const users = [...new Set(ledger.map(e => e.user_id))]
    for (const u of users) {
      const s = currentStatus(ledger.filter(e => e.user_id === u), NOW)
      expect(present.has(u), u).toBe(s.checkedIn)
      if (s.checkedIn) expect(present.get(u), u).toBe(s.since)
    }
    // both directions, counted: two present, two absent
    expect([...present.keys()].sort()).toEqual(['u1', 'u4'])
    expect(users.filter(u => !present.has(u)).sort()).toEqual(['u2', 'u3'])
  })

  test('statusWindowStartISO reaches back far enough for every event the rule counts', () => {
    // just after midnight: must include yesterday 11:30 PM
    expect(statusWindowStartISO(NOW) <= pg(la('2026-09-08 23:30'))).toBe(true)
    // late on a long Saturday: must include 8:00 AM the same day
    const sat = la('2026-09-12 23:59')
    expect(Date.parse(statusWindowStartISO(sat))).toBeLessThanOrEqual(la('2026-09-12 00:00'))
    expect(Date.parse(statusWindowStartISO(sat))).toBe(sat - STATUS_LOOKBACK_MS)
  })
})

// ── arrival: a fresh tap vs. a re-shown page ────────────────────────────────
describe('arrival marker', () => {
  test('only the marker this module writes reads as a revisit', () => {
    expect(isRevisit(ARRIVAL_HANDLED)).toBe(true)
    expect(isRevisit({ ...ARRIVAL_HANDLED, other: 1 })).toBe(true)
    // positive controls the other way: a fresh arrival carries no state at all
    expect(isRevisit(null)).toBe(false)
    expect(isRevisit(undefined)).toBe(false)
    expect(isRevisit({})).toBe(false)
    expect(isRevisit({ techmenCheckin: 'something-else' })).toBe(false)
  })
})

// ── a receipt left on screen: re-read on return, never turned into a prompt ─
// The tag routes re-read when a tab comes back after a minute away. A receipt
// ("CHECKED OUT · 6:00 PM") whose status still holds must stay up: re-deriving
// the screen from the status alone turns a check-out receipt into "Tap to
// confirm your check-in", which is the reported screen appearing on its own.
describe('receipt screens re-read on return', () => {
  const inA = ev('in', '2026-09-08 15:15')
  const outA = ev('out', '2026-09-08 18:00')
  const at = la('2026-09-08 18:05')

  test('a check-out receipt stays up while the member is still checked out', () => {
    const next = nextNfcAction([inA, outA], at, { revisit: true })
    // control: the re-read on its own would put up the check-in prompt
    expect(next.action).toBe('check_in')
    expect(receiptHolds(next, 'out')).toBe(true)
    // the other way: checked back in from another tab, so the receipt is stale
    const inB = ev('in', '2026-09-08 18:02')
    expect(receiptHolds(nextNfcAction([inA, outA, inB], at, { revisit: true }), 'out')).toBe(false)
  })

  test('a check-in receipt stays up while the session is open, and not once it is closed or stale', () => {
    const open = nextNfcAction([inA], at, { revisit: true })
    expect(open.action).toBe('confirm_check_out') // what the re-read alone would show
    expect(receiptHolds(open, 'in')).toBe(true)
    expect(receiptHolds(nextNfcAction([inA, outA], at, { revisit: true }), 'in')).toBe(false)
    const nextDay = la('2026-09-10 09:00') // the IN is two days old: a forgotten check-out
    expect(receiptHolds(nextNfcAction([inA], nextDay, { revisit: true }), 'in')).toBe(false)
  })

  test('the volunteer receipt does not hold over a different open session (the switch case)', () => {
    const vol = ev('in', '2026-09-08 15:15', { category: 'volunteer' })
    // the volunteer session was closed (6:00) and a BUILD session opened (6:02)
    const build = ev('in', '2026-09-08 18:02', { category: 'build' })
    expect(receiptHolds(nextNfcAction([vol], at, { category: 'volunteer', revisit: true }), 'in')).toBe(true)
    const switched = nextNfcAction([vol, outA, build], at, { category: 'volunteer', revisit: true })
    expect(switched).toMatchObject({ action: 'switch', status: { checkedIn: true } })
    expect(receiptHolds(switched, 'in')).toBe(false)
  })

  test('a failed re-read leaves a receipt alone; a non-receipt is never held', () => {
    expect(receiptHolds(nextNfcAction(null, at, { revisit: true }), 'out')).toBe(true)
    expect(receiptHolds(nextNfcAction([inA, outA], at, { revisit: true }), null)).toBe(false)
    expect(receiptHolds(nextNfcAction([inA, outA], at, { revisit: true }), 'sideways')).toBe(false)
  })
})

describe('the device-clock tap record', () => {
  function fakeStorage() {
    const m = new Map()
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }
  }
  const throwing = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }

  test('round-trips per member, and one member\'s tap never blocks another', () => {
    const s = fakeStorage()
    recordLocalTap(s, 'u1', 'in', 1000)
    expect(readLocalTap(s, 'u1')).toEqual({ type: 'in', at: 1000 })
    expect(readLocalTap(s, 'u2')).toBe(null)
  })

  test('blocked or garbage storage reads as no record and never throws', () => {
    expect(() => recordLocalTap(throwing, 'u1', 'in', 1000)).not.toThrow()
    expect(readLocalTap(throwing, 'u1')).toBe(null)
    expect(readLocalTap(null, 'u1')).toBe(null)
    const s = fakeStorage()
    s.setItem('techmen.lastTap.u1', '{not json')
    expect(readLocalTap(s, 'u1')).toBe(null)
    s.setItem('techmen.lastTap.u1', JSON.stringify({ type: 'sideways', at: 5 }))
    expect(readLocalTap(s, 'u1')).toBe(null)
    // positive control: a well-formed record in the same slot is read
    s.setItem('techmen.lastTap.u1', JSON.stringify({ type: 'out', at: 5 }))
    expect(readLocalTap(s, 'u1')).toEqual({ type: 'out', at: 5 })
  })
})

describe('whenForeground (no write from a hidden or prerendered page)', () => {
  function fakeDoc(state = {}) {
    const listeners = {}
    return {
      visibilityState: 'visible', prerendering: false, ...state,
      addEventListener: (t, f) => { (listeners[t] ??= new Set()).add(f) },
      removeEventListener: (t, f) => { listeners[t]?.delete(f) },
      fire(t) { for (const f of [...(listeners[t] ?? [])]) f() },
      count: () => Object.values(listeners).reduce((n, s) => n + s.size, 0),
    }
  }

  test('a visible page runs at once', () => {
    let ran = 0
    whenForeground(fakeDoc(), () => ran++)
    expect(ran).toBe(1)
  })

  test('a hidden page waits until it is shown, then runs exactly once', () => {
    const doc = fakeDoc({ visibilityState: 'hidden' })
    let ran = 0
    whenForeground(doc, () => ran++)
    expect(ran).toBe(0)
    doc.fire('visibilitychange')
    expect(ran).toBe(0) // still hidden
    doc.visibilityState = 'visible'
    doc.fire('visibilitychange')
    doc.fire('visibilitychange')
    expect(ran).toBe(1)
    expect(doc.count()).toBe(0)
  })

  test('a prerendered page waits for activation', () => {
    const doc = fakeDoc({ prerendering: true })
    let ran = 0
    whenForeground(doc, () => ran++)
    expect(ran).toBe(0)
    doc.prerendering = false
    doc.fire('prerenderingchange')
    expect(ran).toBe(1)
  })

  test('cancelling before it is shown means it never runs', () => {
    const doc = fakeDoc({ visibilityState: 'hidden' })
    let ran = 0
    const cancel = whenForeground(doc, () => ran++)
    cancel()
    doc.visibilityState = 'visible'
    doc.fire('visibilitychange')
    expect(ran).toBe(0)
    expect(doc.count()).toBe(0)
  })
})

// ── one Los Angeles day key ─────────────────────────────────────────────────
// attendanceState.js used to carry its own one-liner for "the LA date of this
// instant", a second copy of hoursUtils.laDateKey (CLAUDE.md working
// convention 7: a second copy is the thing that quietly stops matching). It
// now imports laDateKey. The one-liner is kept HERE as the reference, and the
// two are shown identical over every hour of 2026 and minute by minute across
// both 2026 DST changes (Sun 2026-03-08 2:00 AM PST -> PDT, a 23 h day; Sun
// 2026-11-01 2:00 AM PDT -> PST, a 25 h day) before anything relies on it.
describe('the day key is hoursUtils.laDateKey, identical to the one-liner it replaced', () => {
  const oneLiner = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const MIN = 60_000
  const HOUR = 60 * MIN
  const SPRING = Date.parse('2026-03-08T10:00:00Z') // 2:00 AM PST becomes 3:00 AM PDT
  const FALL = Date.parse('2026-11-01T09:00:00Z')   // 2:00 AM PDT becomes 1:00 AM PST
  function instants() {
    const out = []
    // every hour of 2026, at :00 and at :59:59.999 (the last instant of an hour)
    for (let t = Date.parse('2026-01-01T00:00:00Z'); t < Date.parse('2027-01-01T00:00:00Z'); t += HOUR) out.push(t, t + HOUR - 1)
    // every minute from 30 h before to 30 h after each DST change: both
    // midnights of each changed day, and the changed hour itself
    for (const pivot of [SPRING, FALL]) {
      for (let t = pivot - 30 * HOUR; t <= pivot + 30 * HOUR; t += MIN) out.push(t, t - 1)
    }
    return out
  }

  test('identical on every instant sampled, both DST days included', () => {
    const all = instants()
    expect(all.length).toBeGreaterThan(30_000)
    const differ = all.filter((t) => laDateKey(t) !== oneLiner(t))
    expect(differ.map((t) => new Date(t).toISOString())).toEqual([])
    // The instants that matter on the changed days, named:
    expect(laDateKey(Date.parse('2026-03-09T06:59:59.999Z'))).toBe('2026-03-08') // 11:59:59 PM PDT, end of the 23 h day
    expect(laDateKey(Date.parse('2026-03-09T07:00:00Z'))).toBe('2026-03-09')
    expect(laDateKey(Date.parse('2026-11-02T07:59:59.999Z'))).toBe('2026-11-01') // 11:59:59 PM PST, end of the 25 h day
    expect(laDateKey(Date.parse('2026-11-02T08:00:00Z'))).toBe('2026-11-02')
  })

  test('positive control: the same comparison catches a key that is wrong (the UTC date)', () => {
    const utcKey = (ms) => new Date(ms).toISOString().slice(0, 10)
    const differ = instants().filter((t) => utcKey(t) !== oneLiner(t))
    expect(differ.length).toBeGreaterThan(1000)
  })

  test('currentStatus decides "today" on Los Angeles dates on both DST days', () => {
    // maxOpenMs 0 leaves the day key as the only thing that can say "still in".
    const only = { maxOpenMs: 0 }
    const at = (iso) => ({ id: 'x', user_id: 'u1', type: 'in', event_time: iso, category: 'build' })
    // 23 h day: in at 12:30 AM PST, still the same day at 11:30 PM PDT ...
    expect(currentStatus([at('2026-03-08T08:30:00Z')], Date.parse('2026-03-09T06:30:00Z'), only).checkedIn).toBe(true)
    // ... and not at 12:30 AM PDT the next morning (positive control)
    expect(currentStatus([at('2026-03-08T08:30:00Z')], Date.parse('2026-03-09T07:30:00Z'), only).checkedIn).toBe(false)
    // 25 h day: in at 12:30 AM PDT, still the same day at 11:30 PM PST ...
    expect(currentStatus([at('2026-11-01T07:30:00Z')], Date.parse('2026-11-02T07:30:00Z'), only).checkedIn).toBe(true)
    // ... and not at 12:30 AM PST the next morning (positive control)
    expect(currentStatus([at('2026-11-01T07:30:00Z')], Date.parse('2026-11-02T08:30:00Z'), only).checkedIn).toBe(false)
  })

  test('attendanceState.js imports laDateKey and keeps no copy of its own', () => {
    const src = readFileSync(new URL('../src/attendanceState.js', import.meta.url), 'utf8')
    const usesShared = (s) => /import\s*\{[^}]*\blaDateKey\b[^}]*\}\s*from\s*'\.\/hoursUtils'/.test(s)
      && !/toLocaleDateString\(/.test(s) && !/\bconst laDayKey\b/.test(s)
    expect(usesShared(src)).toBe(true)
    // the mutant: the old one-liner put back beside the import
    const mutant = src.replace(/\nexport function eventMs/, "\nconst laDayKey = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: LA })\nexport function eventMs")
    expect(mutant).not.toBe(src)
    expect(usesShared(mutant)).toBe(false)
  })
})

// ── where the board and the glance start reading ────────────────────────────
// PresenceBoard (/display) and useGlance (the dashboard's "N checked in") used
// to read attendance from local midnight, so a member who checked in at
// 11:40 PM read present on their own tile and absent on the board. Both now
// read from presenceSinceISO(), the window the rule needs.
describe('presence queries start where the rule needs them', () => {
  const now = la('2026-10-01 00:30')
  const lateIn = { user_id: 'u1', type: 'in', event_time: pg(la('2026-09-30 23:40')) }
  const other = { user_id: 'u2', type: 'in', event_time: pg(la('2026-10-01 00:10')) }
  const windowed = (since) => [lateIn, other].filter((e) => e.event_time >= since)

  test('a session open across LA midnight is present from presenceSinceISO, absent from local midnight', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(now)
      expect(presenceSinceISO()).toBe(statusWindowStartISO(now))
      expect(computePresence(windowed(presenceSinceISO()), now).has('u1')).toBe(true)
      // positive control: the old window (LA midnight) drops the same member
      const midnight = new Date(laMidnight(now)).toISOString()
      expect(computePresence(windowed(midnight), now).has('u1')).toBe(false)
      // and both windows agree on a session opened after midnight
      expect(computePresence(windowed(midnight), now).has('u2')).toBe(true)
      expect(computePresence(windowed(presenceSinceISO()), now).has('u2')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  // The attendance_events line of each caller, read from source.
  const queryLine = (s) => s.split('\n').find((l) => l.includes(".from('attendance_events')")) ?? ''
  const readsWindow = (s) => /\.gte\('event_time', presenceSinceISO\(\)\)/.test(queryLine(s))
  for (const file of ['PresenceBoard.jsx', 'useGlance.js']) {
    test(`${file} reads attendance from presenceSinceISO()`, () => {
      const src = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
      expect(queryLine(src)).not.toBe('')
      expect(readsWindow(src)).toBe(true)
      // the mutant: the same line back on local midnight
      const mutant = src.replace(/(\.from\('attendance_events'\)[^\n]*\.gte\('event_time', )presenceSinceISO\(\)\)/, '$1startOfTodayISO())')
      expect(mutant).not.toBe(src)
      expect(readsWindow(mutant)).toBe(false)
    })
  }

  test("useGlance still bounds TODAY's schedule at local midnight (only presence moved)", () => {
    const src = readFileSync(new URL('../src/useGlance.js', import.meta.url), 'utf8')
    expect(src).toMatch(/\.from\('events'\)[^\n]*\n[^\n]*\.gte\('ends_at', todayISO\)/)
    expect(src).toMatch(/const todayISO = startOfTodayISO\(\)/)
  })
})
