// Give everyone a slot (0035, ledger 0026): src/meetTeam.js planMeetTeam, the
// fixture's copy of staff_meet_team_fill. The SQL copy is held to the same
// outcomes by 0035_meet_a_team_rls_test.sql checks 16 to 21.
import { describe, it, expect } from 'vitest'
import { planMeetTeam } from '../src/meetTeam.js'

const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 31, 16 + h, m)).toISOString()
const slot = (id, h, needed, assigned = 0) => ({ id, label: id, starts_at: at(h), ends_at: at(h + 1), position: h, needed, assigned })
const kids = (n) => Array.from({ length: n }, (_, i) => ({ member_id: `m${String(i + 1).padStart(2, '0')}`, name: `Kid ${String(i + 1).padStart(2, '0')}` }))
const loads = (plan) => plan.placed.reduce((m, p) => ({ ...m, [p.slot_id]: (m[p.slot_id] ?? 0) + 1 }), {})

describe('planMeetTeam', () => {
  it('places 30 students over 8 slots of 3 boxes evenly: 24 fill every box, the other 6 overflow one per slot at most', () => {
    const slots = Array.from({ length: 8 }, (_, i) => slot(`Q${i + 1}`, i, 3))
    const plan = planMeetTeam({ slots, students: kids(30), busy: [] })
    expect(plan.placed).toHaveLength(30)
    expect(plan.unplaced).toHaveLength(0)
    const l = Object.values(loads(plan))
    expect(l).toHaveLength(8)
    expect(Math.min(...l)).toBe(3)
    expect(Math.max(...l)).toBe(4)
  })

  it('never places a student in a slot overlapping one where they hold another role, and says why when every slot does', () => {
    const slots = [slot('Q1', 0, 2), slot('Q2', 1, 2), slot('Q3', 2, 2)]
    const busy = [{ member_id: 'm01', starts_at: at(0), ends_at: at(1) }, // m01 busy in Q1 only
      { member_id: 'm02', starts_at: at(0), ends_at: at(3) }] // m02 busy across all three
    const plan = planMeetTeam({ slots, students: kids(4), busy })
    const m01 = plan.placed.find((p) => p.member_id === 'm01')
    expect(m01).toBeTruthy()
    expect(m01.slot_id).not.toBe('Q1')
    expect(plan.placed.some((p) => p.member_id === 'm02')).toBe(false)
    expect(plan.unplaced).toEqual([{ member_id: 'm02', name: 'Kid 02', reason: 'Holds another role in every Meet a team slot.' }])
    // Positive control: without the busy rows m02 is placed and m01 can land in Q1.
    const free = planMeetTeam({ slots, students: kids(4), busy: [] })
    expect(free.placed.some((p) => p.member_id === 'm02')).toBe(true)
    expect(free.placed.find((p) => p.member_id === 'm01')?.slot_id).toBe('Q1')
  })

  it('a slot touching but not overlapping a busy one is free (10:00 end, 10:00 start)', () => {
    const plan = planMeetTeam({ slots: [slot('Q2', 1, 1)], students: kids(1), busy: [{ member_id: 'm01', starts_at: at(0), ends_at: at(1) }] })
    expect(plan.placed.map((p) => p.slot_id)).toEqual(['Q2'])
  })

  it('counts boxes already assigned: a slot that is full takes nobody while another has room', () => {
    const plan = planMeetTeam({ slots: [slot('Q1', 0, 2, 2), slot('Q2', 1, 2, 0)], students: kids(2), busy: [] })
    expect(plan.placed.map((p) => p.slot_id)).toEqual(['Q2', 'Q2'])
    // Positive control: with Q1 empty the two split.
    const split = planMeetTeam({ slots: [slot('Q1', 0, 2, 0), slot('Q2', 1, 2, 0)], students: kids(2), busy: [] })
    expect(Object.keys(loads(split)).sort()).toEqual(['Q1', 'Q2'])
  })

  it('spreads by fill, not by count: a 1-box slot fills before a 3-box slot takes its second', () => {
    const plan = planMeetTeam({ slots: [slot('Big', 0, 3), slot('Small', 1, 1)], students: kids(4), busy: [] })
    expect(loads(plan)).toEqual({ Big: 3, Small: 1 })
  })

  it('students with the fewest free slots go first, so a constrained one still gets a box', () => {
    const slots = [slot('Q1', 0, 1), slot('Q2', 1, 1)]
    // "Kid 01" sorts first by name, but Kid 02 can only do Q1.
    const busy = [{ member_id: 'm02', starts_at: at(1), ends_at: at(2) }]
    const plan = planMeetTeam({ slots, students: kids(2), busy })
    expect(plan.placed.find((p) => p.member_id === 'm02')?.slot_id).toBe('Q1')
    expect(plan.placed.find((p) => p.member_id === 'm01')?.slot_id).toBe('Q2')
  })

  it('no Meet a team boxes at all: everyone is reported, nobody placed', () => {
    const plan = planMeetTeam({ slots: [], students: kids(2), busy: [] })
    expect(plan.placed).toHaveLength(0)
    expect(plan.unplaced.map((u) => u.reason)).toEqual(['This event has no Meet a team boxes yet.', 'This event has no Meet a team boxes yet.'])
  })

  it('the same input gives the same plan (preview equals apply)', () => {
    const slots = Array.from({ length: 4 }, (_, i) => slot(`Q${i + 1}`, i, 3))
    const a = planMeetTeam({ slots, students: kids(13), busy: [] })
    const b = planMeetTeam({ slots, students: [...kids(13)].reverse(), busy: [] })
    expect(b).toEqual(a)
  })
})
