// Every way a student checks out, end to end as far as a node test can reach:
//
//   1. the dashboard Check Out button  -> src/attendanceCheckout.js
//   2. tapping the shop tag again      -> CheckinPage -> nextNfcAction
//   3. tapping the volunteer tag again -> VolunteerCheckinPage -> nextNfcAction
//
// and every place that decides "checked in" (HomePage, both tag routes,
// presence.js) is shown to read src/attendanceState.js rather than keep its own
// copy of the rule. The rule itself is tested in tests/attendance-state.test.js;
// this file holds the WIRING and the dashboard write.
//
// The rendered pages are not reachable from node (no DOM, see vitest.config.js);
// the browser expectations for them are written into the b2 lane report and the
// fixture plugin at src/dev/fixture/features/b2.js.

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  DASHBOARD_CHECKOUT_ROW, checkOutFromDashboard, checkoutFailureText, dashboardCheckoutRow,
} from '../src/attendanceCheckout.js'
import { currentStatus, nextNfcAction } from '../src/attendanceState.js'
import { isCheckedIn } from '../src/hoursUtils.js'
import b2Fixture, { B2_IDS } from '../src/dev/fixture/features/b2.js'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

// A stand-in for the one supabase-js call the dashboard makes:
// client.from('attendance_events').insert(row) -> { error }
function fakeClient(result) {
  const calls = []
  return {
    calls,
    from(table) {
      return {
        insert(row) {
          calls.push({ table, row })
          return Promise.resolve(result)
        },
      }
    },
  }
}

describe('dashboard Check Out', () => {
  test('writes exactly the shape that works against the database today', () => {
    // Unchanged from HomePage.jsx@89896ca:134-136. A new column or a newly
    // allowed value here would need a migration first; this pins that it does not.
    expect(dashboardCheckoutRow('u1')).toEqual({
      user_id: 'u1', type: 'out', location: 'button', method: null,
    })
    expect(Object.keys(DASHBOARD_CHECKOUT_ROW).sort()).toEqual(['location', 'method', 'type'])
  })

  test('a rejected insert is REPORTED, not swallowed', async () => {
    const client = fakeClient({ data: null, error: { code: '23514', message: 'violates check constraint' } })
    const r = await checkOutFromDashboard(client, 'u1')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/not recorded/i)
    expect(r.message).toContain('23514')
    expect(client.calls).toEqual([{ table: 'attendance_events', row: dashboardCheckoutRow('u1') }])
  })

  test('positive control: a clean insert reports success and no message', async () => {
    const client = fakeClient({ data: null, error: null })
    const r = await checkOutFromDashboard(client, 'u1')
    expect(r).toEqual({ ok: true, message: null })
    expect(client.calls).toHaveLength(1)
  })

  test('a network failure (the promise rejects) is reported too', async () => {
    const client = { from: () => ({ insert: () => Promise.reject(new TypeError('Load failed')) }) }
    const r = await checkOutFromDashboard(client, 'u1')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/not recorded/i)
  })

  test('the failure text names the code when there is one and never the raw message', () => {
    expect(checkoutFailureText({ code: '42501', message: 'new row violates row-level security policy' }))
      .toBe('Check-out was not recorded (42501). Try again, or tap your tag.')
    expect(checkoutFailureText({ message: 'Load failed' }))
      .toBe('Check-out was not recorded. Try again, or tap your tag.')
    expect(checkoutFailureText(null)).toBe('Check-out was not recorded. Try again, or tap your tag.')
  })
})

// ── wiring: one rule, read everywhere ───────────────────────────────────────
// The inline decisions as they shipped at 89896ca. Each is matched against the
// CURRENT source (must be absent) and against the legacy snippet it was copied
// from (must be present) -- the second half is the positive control proving the
// pattern can match at all.
const LEGACY = {
  'CheckinPage.jsx': [
    ["toggle on the last event since midnight", /lastEvent\?\.type === 'in' \? 'out' : 'in'/,
      "const newType = lastEvent?.type === 'in' ? 'out' : 'in'"],
    ['status read bounded at device-local midnight', /\.gte\('event_time', startOfToday\.toISOString\(\)\)/,
      ".gte('event_time', startOfToday.toISOString())"],
    ['status read that discards its error', /const \{ data: recent \} = await supabase/,
      'const { data: recent } = await supabase'],
  ],
  'VolunteerCheckinPage.jsx': [
    ['open-session test on the last event since midnight', /const openSession = lastEvent\?\.type === 'in'/,
      "const openSession = lastEvent?.type === 'in'"],
    ['status read bounded at device-local midnight', /\.gte\('event_time', startOfToday\.toISOString\(\)\)/,
      ".gte('event_time', startOfToday.toISOString())"],
    ['status read that discards its error', /const \{ data: recent \} = await supabase/,
      'const { data: recent } = await supabase'],
  ],
  // Team Hours' In/Out pill read hoursUtils.isCheckedIn (the last event, ever)
  // until 9543e90, so an IN left open two days ago read In there and Not
  // checked in on the member's own tile.
  'HoursBoard.jsx': [
    ['In/Out pill from hoursUtils.isCheckedIn', /isCheckedIn\(/,
      'checkedIn: isCheckedIn(eventMap[p.id] ?? []),'],
  ],
  'HomePage.jsx': [
    ['isIn from the last event since midnight', /const isIn = lastToday\?\.type === 'in'/,
      "const isIn = lastToday?.type === 'in'"],
    ['check-out insert whose result is discarded', /await supabase\.from\('attendance_events'\)\.insert\(\{\s*user_id: uid, type: 'out'/,
      "await supabase.from('attendance_events').insert({\n      user_id: uid, type: 'out', location: 'button', method: null,\n    })"],
  ],
}

describe('every surface reads the shared rule', () => {
  for (const [file, patterns] of Object.entries(LEGACY)) {
    for (const [what, re, legacySnippet] of patterns) {
      test(`${file}: no ${what}`, () => {
        expect(re.test(legacySnippet), `pattern must match the legacy text (control)`).toBe(true)
        expect(re.test(src(file)), `${file} still carries it`).toBe(false)
      })
    }
  }

  test('both tag routes and the dashboard import the shared modules', () => {
    for (const f of ['CheckinPage.jsx', 'VolunteerCheckinPage.jsx', 'HomePage.jsx']) {
      expect(src(f), f).toMatch(/from '\.\/attendanceState'/)
    }
    expect(src('HomePage.jsx')).toMatch(/from '\.\/attendanceCheckout'/)
    expect(src('CheckinPage.jsx')).toMatch(/nextNfcAction\(/)
    expect(src('VolunteerCheckinPage.jsx')).toMatch(/nextNfcAction\(/)
    expect(src('HomePage.jsx')).toMatch(/currentStatus\(/)
  })

  test("Team Hours' In/Out pill reads currentStatus, and that changes what it shows", () => {
    expect(src('HoursBoard.jsx')).toMatch(/from '\.\/attendanceState'/)
    expect(src('HoursBoard.jsx')).toMatch(/checkedIn: currentStatus\(eventMap\[p\.id\] \?\? \[\]\)\.checkedIn/)
    // The difference, on rows: a two-day-old IN left open is In to the old
    // rule and a forgotten check-out to the shared one ...
    const now = Date.parse('2026-10-01T16:00:00-07:00')
    const stale = [{ type: 'in', event_time: new Date(now - 49 * 3600_000).toISOString() }]
    expect(isCheckedIn(stale)).toBe(true)
    expect(currentStatus(stale, now).checkedIn).toBe(false)
    // ... and positive control: an IN from an hour ago is In to both.
    const fresh = [{ type: 'in', event_time: new Date(now - 3600_000).toISOString() }]
    expect(isCheckedIn(fresh)).toBe(true)
    expect(currentStatus(fresh, now).checkedIn).toBe(true)
  })

  test('presence.js delegates to currentStatus', () => {
    const p = src('presence.js')
    expect(p).toMatch(/from '\.\/attendanceState'/)
    expect(p).toMatch(/currentStatus\(/)
  })

  test('the tag routes stay light: nothing from the dashboard, nav, widget or push code', () => {
    const HEAVY = /from '\.\/(HomePage|NavBar|FeedbackWidget|NotificationsPanel|useGlance|GlanceCard|shopStatus|ProtectedLayout)'/
    expect(HEAVY.test("import NavBar from './NavBar'"), 'control').toBe(true)
    for (const f of ['CheckinPage.jsx', 'VolunteerCheckinPage.jsx', 'attendanceState.js']) {
      expect(HEAVY.test(src(f)), f).toBe(false)
    }
    // and the shared modules are pure: no React, no Supabase client
    for (const f of ['attendanceState.js', 'attendanceCheckout.js']) {
      expect(src(f), f).not.toMatch(/from 'react'|from '\.\/supabase'|@supabase/)
    }
  })

  test('the geofence still gates check-in on both tag routes, and never check-out', () => {
    const shop = src('CheckinPage.jsx')
    const vol = src('VolunteerCheckinPage.jsx')
    expect(shop).toMatch(/verifyAtShop\(\)/)
    expect(vol).toMatch(/verifyAtFLL\(\)/)
    // the geofence call sits inside confirmCheckin and nowhere else
    for (const [s, fn] of [[shop, 'verifyAtShop'], [vol, 'verifyAtFLL']]) {
      expect(s.split(`${fn}()`).length - 1).toBe(1)
      const confirmBody = s.slice(s.indexOf('async function confirmCheckin'), s.indexOf(`${fn}()`))
      expect(confirmBody.length).toBeGreaterThan(0)
      expect(confirmBody).not.toMatch(/\n\s{2}async function (?!confirmCheckin)/)
    }
  })
})

// ── the fixture plugin seeds what the browser test needs ────────────────────
describe('src/dev/fixture/features/b2.js', () => {
  const ids = { student: 'stu-1', student2: 'stu-2' }
  const rowsFor = (now, who) => b2Fixture.seed({ ids, now }).attendance_events.filter(e => e.user_id === who)

  test('declares no migration, so mig:all and mig:none must look the same', () => {
    expect(b2Fixture.migration).toBe(null)
    expect(b2Fixture.creates).toEqual({})
  })

  test('student is checked in (the reported state) and a fresh tap checks out', () => {
    const now = Date.parse('2026-10-01T22:15:00Z') // 3:15 PM in Los Angeles
    const rows = rowsFor(now, 'stu-1')
    expect(rows.every(r => /\.\d{6}\+00:00$/.test(r.event_time))).toBe(true) // PostgREST shape
    expect(currentStatus(rows, now).checkedIn).toBe(true)
    expect(nextNfcAction(rows, now).action).toBe('check_out')
    // positive control: the same seed minus its open IN is not checked in
    expect(currentStatus(rows.filter(r => r.id !== B2_IDS.s1InOpen), now).checkedIn).toBe(false)
  })

  test('student2: checked in across midnight when the clock allows, else stale and NOT checked in', () => {
    const early = Date.parse('2026-10-01T08:30:00Z') // 1:30 AM in Los Angeles
    const late = Date.parse('2026-10-01T22:15:00Z')  // 3:15 PM in Los Angeles
    const a = rowsFor(early, 'stu-2')
    const b = rowsFor(late, 'stu-2')
    expect(a.some(r => r.id === B2_IDS.s2InMidnight)).toBe(true)
    expect(currentStatus(a, early).checkedIn).toBe(true)
    expect(b.some(r => r.id === B2_IDS.s2InMidnight)).toBe(false)
    expect(currentStatus(b, late)).toMatchObject({ checkedIn: false, stale: true })
  })

  test('accepts the fixture clock as a Date as well as epoch ms', () => {
    const ms = Date.parse('2026-10-01T22:15:00Z')
    expect(b2Fixture.seed({ ids, now: new Date(ms) })).toEqual(b2Fixture.seed({ ids, now: ms }))
  })
})
