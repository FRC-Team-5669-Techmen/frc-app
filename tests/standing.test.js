// src/standing.js and the one rule 0015 had to copy from the client.
//
// _member_hours in 0015_member_standing.sql re-states src/hoursUtils.js for a
// closed week (a cron cannot run the client). The drift block holds the two
// to the same cap and the same exclusions, with a doctored copy as the
// positive control so the parser is shown to see a change.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_SESSION_HOURS } from '../src/hoursUtils.js'
import { meetingShare, absenceProblem, ABSENCE_REASONS, fmtHours } from '../src/standing.js'

const SQL = readFileSync(new URL('../supabase/migrations/0015_member_standing.sql', import.meta.url), 'utf8')
const hoursFn = (sql) => {
  const at = sql.indexOf('create or replace function public._member_hours')
  return at < 0 ? '' : sql.slice(at, sql.indexOf('$fn$;', at))
}
const capHours = (body) => Number((body.match(/event_time \+ interval '(\d+) hours'\)/) ?? [])[1])

describe('drift: _member_hours against src/hoursUtils.js', () => {
  it('the cap is MAX_SESSION_HOURS', () => {
    expect(capHours(hoursFn(SQL))).toBe(MAX_SESSION_HOURS)
  })
  it('positive control: a doctored cap is seen', () => {
    const doctored = SQL.replace("event_time + interval '12 hours')", "event_time + interval '10 hours')")
    expect(capHours(hoursFn(doctored))).not.toBe(MAX_SESSION_HOURS)
  })
  it('FLL sessions and reviewed sessions are excluded, as the boards exclude them', () => {
    const body = hoursFn(SQL)
    expect(body).toContain("coalesce(category, 'build') <> 'volunteer'")
    expect(body).toContain("r.status in ('pending', 'voided')")
    expect(body).toContain("type = 'in' and ntype = 'out'")
  })
})

describe('meetingShare: never rounded, 3 lates are 1 absence', () => {
  it('7 of 9 is under 80 percent', () => {
    expect(meetingShare({ counted: 9, attended: 7, lates: 0, pct: 80 }).ok).toBe(false)
  })
  it('8 of 9 is over (positive control)', () => {
    expect(meetingShare({ counted: 9, attended: 8, lates: 0, pct: 80 }).ok).toBe(true)
  })
  it('three lates take one meeting away', () => {
    const r = meetingShare({ counted: 5, attended: 5, lates: 3, pct: 80 })
    expect(r.effective).toBe(4)
    expect(r.ok).toBe(true)
    expect(meetingShare({ counted: 5, attended: 5, lates: 6, pct: 80 }).ok).toBe(false)
  })
  it('no meetings yet reads null, not 0 percent', () => {
    expect(meetingShare({ counted: 0, attended: 0, lates: 0 })).toBe(null)
  })
})

describe('absenceProblem mirrors request_absence', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  const ev = (hours, extra = {}) => ({ id: 'e', kind: 'meeting', starts_at: new Date(now + hours * 3600000).toISOString(), mandatory: false, ...extra })
  it('24 hours ahead is fine, less is refused unless an emergency', () => {
    expect(absenceProblem(ev(30), { reason: 'medical', emergency: false }, now)).toBe(null)
    expect(absenceProblem(ev(6), { reason: 'medical', emergency: false }, now)).toMatch(/24 hours/)
    expect(absenceProblem(ev(6), { reason: 'illness', emergency: true }, now)).toBe(null)
  })
  it('a mandatory event takes only an emergency or a religious holiday 14 days ahead', () => {
    expect(absenceProblem(ev(48, { mandatory: true }), { reason: 'school_event', emergency: false }, now)).toMatch(/mandatory/)
    expect(absenceProblem(ev(15 * 24, { mandatory: true }), { reason: 'religious', emergency: false }, now)).toBe(null)
    expect(absenceProblem(ev(48, { kind: 'competition' }), { reason: 'religious', emergency: false }, now)).toMatch(/mandatory/)
  })
  it('a medical visit is excused ahead, never as an emergency (handbook Section 6, 0025)', () => {
    expect(absenceProblem(ev(1), { reason: 'medical', emergency: true }, now)).toMatch(/emergency/)
    expect(absenceProblem(ev(30), { reason: 'medical', emergency: false }, now)).toBe(null)
    // control: an emergency reason passes the same check
    expect(absenceProblem(ev(1), { reason: 'family_emergency', emergency: true }, now)).toBe(null)
  })
  it('an emergency needs an emergency reason', () => {
    expect(absenceProblem(ev(1), { reason: 'school_event', emergency: true }, now)).toMatch(/emergency/)
  })
  it('the reasons match the SQL check, and none of the never-excused ones is offered', () => {
    const check = SQL.match(/reason in \(([^)]*)\)\),\n\s*emergency/)[1].split(',').map((x) => x.trim().replace(/'/g, ''))
    expect(ABSENCE_REASONS.map((r) => r.key).sort()).toEqual(check.sort())
    expect(ABSENCE_REASONS.map((r) => r.key)).not.toContain('sports')
  })
})

describe('fmtHours', () => {
  it('reads hours and minutes', () => {
    expect(fmtHours(2.5)).toBe('2h 30m')
    expect(fmtHours(0)).toBe('0h')
  })
})
