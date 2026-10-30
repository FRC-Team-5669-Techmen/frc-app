// My schedule (src/mySchedule.js, ledger 0033) and its agreement with the
// push reminders in 0043 (_role_place).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDays, defaultDay, nowNext, placeOf, PLACE_WORDS } from '../src/mySchedule.js'
import { ROLE_PLACE } from '../src/roleRules.js'

const COMP = { id: 'c', title: 'Beach Blitz 2026', kind: 'competition', starts_at: '2026-10-31T00:00:00Z', ends_at: '2026-11-02T01:30:00Z' }
const at = (day, hh, mm = 0) => new Date(`2026-${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-07:00`).toISOString()
const shifts = [
  { slotId: 'q1', label: 'Quals 1', starts_at: at('10-31', 9, 35), ends_at: at('10-31', 10, 30), role: 'scout', status: 'assigned' },
  { slotId: 'q1', label: 'Quals 1', starts_at: at('10-31', 9, 35), ends_at: at('10-31', 10, 30), role: 'pit_crew', status: 'assigned' },
  { slotId: 'q2', label: 'Quals 2', starts_at: at('10-31', 10, 30), ends_at: at('10-31', 11, 30), role: 'driver', status: 'backup' },
  { slotId: 'x', label: 'Asked only', starts_at: at('10-31', 13), role: 'scout', status: 'asked' },
]
const rides = [{ date: '2026-10-31', run: 'to', car_id: 'car', description: 'Sienna', driver: 'Platas', leave_by: at('10-31', 6, 30), meet_place: 'Front lot' }]
const events = [COMP, { id: 'e1', title: 'Beach Blitz: qualification matches', kind: 'other', starts_at: at('10-31', 9, 35), ends_at: at('10-31', 12), location: 'CVHS' }]

describe('buildDays', () => {
  const days = buildDays({ competition: COMP, events, shifts, rides })
  it('one entry per competition day, empty days included', () => {
    expect(days.map((d) => d.key)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
    expect(days[0].items).toEqual([])
  })
  it('two roles in one slot are one card; a backup is its own card; an ask is not shown', () => {
    const st = days[1].items.filter((i) => i.kind === 'station')
    expect(st).toHaveLength(2)
    expect(st[0]).toMatchObject({ title: 'Scout + Pit crew', detail: 'Quals 1', status: 'assigned', where: 'Stands and Pit' })
    expect(st[1]).toMatchObject({ title: 'Driver', status: 'backup', note: expect.stringMatching(/Backup/) })
  })
  it('the ride comes first, the team block is named without the event prefix, the competition itself is left out', () => {
    expect(days[1].items[0]).toMatchObject({ kind: 'ride', title: 'Ride to the venue', detail: 'Platas · Sienna', where: 'Front lot' })
    expect(days[1].items.find((i) => i.kind === 'team')).toMatchObject({ title: 'Qualification matches' })
    expect(days.flatMap((d) => d.items).some((i) => i.id.startsWith('event:c:'))).toBe(false)
  })
  it('with no competition there are no days', () => { expect(buildDays({ competition: null })).toEqual([]) })
})

describe('nowNext and defaultDay', () => {
  const days = buildDays({ competition: COMP, events, shifts, rides })
  it('before anything: next is the ride, with minutes to go; team blocks never count as mine', () => {
    const n = nowNext(days, Date.parse(at('10-31', 6, 10)))
    expect(n.now).toBe(null)
    expect(n.next.kind).toBe('ride')
    expect(n.minutesToNext).toBe(20)
  })
  it('during Quals 1 it is now, and Quals 2 is next; after the last, nothing', () => {
    const n = nowNext(days, Date.parse(at('10-31', 10)))
    expect(n.now.detail).toBe('Quals 1')
    expect(n.next.detail).toBe('Quals 2')
    expect(nowNext(days, Date.parse(at('11-01', 20)))).toMatchObject({ now: null, next: null })
  })
  it('opens on today during the competition, else its next day', () => {
    expect(defaultDay(days, Date.parse(at('10-31', 12)))).toBe('2026-10-31')
    expect(defaultDay(days, Date.parse(at('10-29', 12)))).toBe('2026-10-30')
  })
})

describe('the page and the push say the same place', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0043_my_schedule.sql', import.meta.url), 'utf8')
  const body = sql.slice(sql.indexOf('function public._role_place'))
  const sqlPlace = (role) => {
    for (const m of body.matchAll(/when p_role in \(([^)]*)\) then '([^']*)'/g)) if (m[1].split(',').map((x) => x.trim().replace(/'/g, '')).includes(role)) return m[2]
    return 'your assignment'
  }
  const toWords = { 'the field (drive team queue)': PLACE_WORDS.field, 'the stands': PLACE_WORDS.stands, 'the pit': PLACE_WORDS.pit, 'your assignment': null }
  it('every role in ROLE_PLACE lands in the same place in both (positive control: at least 10 roles compared)', () => {
    const roles = Object.keys(ROLE_PLACE)
    expect(roles.length).toBeGreaterThanOrEqual(10)
    for (const r of roles) {
      const fromSql = toWords[sqlPlace(r)]
      if (fromSql === null) expect(ROLE_PLACE[r]).toBe('roaming')
      else expect(placeOf(r), r).toBe(fromSql)
    }
  })
})
