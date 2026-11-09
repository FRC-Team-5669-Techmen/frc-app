import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parentServiceRows, parentServiceCsv } from '../src/parentService'
import { scoutTally } from '../src/scouting/scoutTally'
import { verifiedShopHours, rotationSuggestions } from '../src/rotationSuggestions'
const event = { id: 'event', title: 'Fictional event', timezone: 'America/Los_Angeles' }
const season = { id: 'season', name: 'Test season', start_date: '2026-01-01', end_date: '2026-12-31' }
const record = (kind, id, match, team, payload = {}, extra = {}) => ({ id, kind, event_id: 'event', member_id: 'scout', match_key: match, team_number: team, payload, ...extra })
describe('named parents', () => {
  const parents = [{ id: 'one', name: '=Guardian One', student: 'Fictional Student', school_id: 'S001', sessions: [
    { starts_at: '2026-10-01T16:00:00Z', ends_at: '2026-10-01T18:30:00Z' }, { starts_at: '2026-10-02T16:00:00Z', ends_at: '2026-10-02T17:00:00Z' }] },
    { id: 'two', name: 'Guardian Two', student: 'Fictional Student', school_id: 'S001', sessions: [{ starts_at: '2026-10-01T16:00:00Z', ends_at: '2026-10-01T17:00:00Z' }] }]
  it('keeps two parents and exact intervals/totals separate with school IDs', () => {
    const rows = parentServiceRows(parents, event)
    expect(rows.map(r => [r.parent, r.hours, r.total, r.school_id])).toEqual([['=Guardian One', '2.50', '3.50', 'S001'], ['=Guardian One', '1.00', '3.50', 'S001'], ['Guardian Two', '1.00', '1.00', 'S001']])
    expect(rows[0].start).toBe('9:00 AM'); expect(rows[0].date).toBe('2026-10-01')
    const csv = parentServiceCsv(parents, event); expect(csv[0]).toBe('\ufeff'); expect(csv).toContain("'=Guardian One"); expect(csv).toContain('Student school ID')
  })
})
describe('scouting lead tally', () => {
  const rows = [record('observation', 'one', 'qm1', 1), record('observation', 'two', '2026test_qm1', 2), record('observation', 'pending', 'qm2', 3, {}, { localStatus: 'queued' }),
    record('observation', 'prior', 'qm3', 4, { source_scope: 'external' }), record('observation', 'unverified', 'qm4', 4, { source: 'video' }), record('observation', 'other-event', 'qm5', 5, {}, { event_id: 'other' }),
    record('assignment', 'a', 'qm1', 1, { assignee: 'scout', status: 'assigned' }), record('assignment', 'gap', 'qm2', 3, { assignee: 'scout', status: 'assigned' }), record('assignment', 'cancel', 'qm9', 3, { assignee: 'scout', status: 'cancelled' })]
  it('counts current confirmed distinct matches and only missing assigned robots', () => {
    const tally = scoutTally(rows, [{ id: 'scout', name: 'Scout' }, { id: 'zero', name: 'No work' }], 'event')
    expect(tally.find(r => r.id === 'scout')).toMatchObject({ matches: 1, robot: 1, super: 0, assignments: 2, gaps: [{ id: 'gap', match: 'qm2', target: 'Team 3' }] })
    expect(tally.find(r => r.id === 'zero')).toMatchObject({ matches: 0, gaps: [] })
  })
  it('names scouts from the real roster profile shape', () => { expect(scoutTally(rows, [{ id: 'scout', full_name: 'Fictional Scout', nickname: 'Scout Nick' }], 'event').find(r => r.id === 'scout').name).toBe('Scout Nick') })
  it('requires all three super robots while counting a super match once', () => {
    const superRows = [record('assignment', 'super', 'qm7', null, { role: 'super', alliance: 'red', teams: [1, 2, 3], status: 'assigned', assignee: 'scout' }), ...[1, 2].map(t => record('observation', `s${t}`, 'qm7', t, { role: 'super' }))]
    expect(scoutTally(superRows, [], 'event')[0]).toMatchObject({ matches: 1, super: 1, gaps: [{ id: 'super' }] })
    expect(scoutTally([...superRows, record('observation', 's3', 'qm7', 3, { role: 'super' })], [], 'event')[0].gaps).toEqual([])
  })
})
describe('verified hours and advisory rotation', () => {
  const attendance = [
    { id: 'in', type: 'in', category: 'build', event_time: '2026-10-01T16:00:00Z', pauses: [{ start: '2026-10-01T17:00:00Z', end: '2026-10-01T18:00:00Z' }] },
    { id: 'out', type: 'out', event_time: '2026-10-01T20:00:00Z' },
  ]
  it('counts approved closed Build hours with pauses and verified Build logs only', () => {
    expect(verifiedShopHours({ attendance, verified_outs: ['out'], logs: [{ type: 'build', hours: 2, date: '2026-10-02' }, { type: 'competition', hours: 100, date: '2026-10-02' }] }, season)).toBe(5)
    expect(verifiedShopHours({ attendance }, season)).toBe(0)
    expect(verifiedShopHours({ attendance, verified_outs: ['out'], reviews: [{ checkout_id: 'out', status: 'voided' }] }, season)).toBe(0)
    expect(verifiedShopHours({ attendance: attendance.slice(0, 1), verified_outs: ['out'] }, season)).toBe(0)
  })
  const member = (id, flags = {}) => ({ id, name: id, attendance: [], logs: [], ...flags })
  const slot = (id, hour, needs) => ({ id, day: '2026-10-01', label: id, starts_at: `2026-10-01T${hour}:00:00Z`, ends_at: `2026-10-01T${hour}:30:00Z`, needs, requests: [] })
  it('pairs a newer member with two distinct designated strong people without modifying the board', () => {
    const board = { slots: [slot('pit', '10', { pit_crew: 1 })] }, copy = JSON.stringify(board)
    const data = { season, members: [member('new', { newer: true }), member('strong1', { strong: true }), member('strong2', { strong: true })] }
    const plan = rotationSuggestions(board, data)
    expect(plan.suggestions.map(s => s.member.id).sort()).toEqual(['new', 'strong1', 'strong2']); expect(plan.gaps).toEqual([])
    expect(plan.suggestions.every(s => s.reason.length > 20)).toBe(true); expect(JSON.stringify(board)).toBe(copy)
    expect(rotationSuggestions(board, { ...data, members: data.members.slice(0, 2) }).suggestions.some(s => s.member.id === 'new')).toBe(false)
    expect(rotationSuggestions(board, { ...data, members: data.members.slice(0, 2) }).gaps.length).toBeGreaterThan(0)
  })
  it('orders responsibility recommendations by verified hours and respects existing assignments', () => {
    const board = { slots: [slot('field', '10', { driver: 1 })] }
    const members = [member('low'), member('high', { logs: [{ type: 'build', hours: 10, date: '2026-10-01' }] })]
    expect(rotationSuggestions(board, { season, members }).suggestions[0].member.id).toBe('high')
    board.slots[0].requests = [{ member_id: 'low', role: 'driver', status: 'assigned' }]
    expect(rotationSuggestions(board, { season, members }).suggestions).toEqual([])
  })
})

// Compile the actual source with its real pure dependencies, then widen each
// invisible exclusion. A permissive result must disagree with the fixed oracle.
import { displayName } from '../src/names'
import { isCurrentEvidence, matchIdentity } from '../src/scouting/provenance'
import { isSuperNote } from '../src/scouting/superscout'
import { sessionsFromEvents, breakdownFromSessions } from '../src/hoursUtils'
import { ROLE_ORDER, roleLabel, statusOf } from '../src/roleBoard'
import { ROLE_PLACE, MAX_IN_A_ROW } from '../src/roleRules'
function compile(source, name, deps) {
  return new Function(...Object.keys(deps), source.replace(/^import .*$/gm, '').replace(/\bexport /g, '') + `\nreturn ${name}`)(...Object.values(deps))
}
it('catches permissive scout-tally mutations for event, confirmation, provenance, robot and super completeness', () => {
  const source = readFileSync(new URL('../src/scouting/scoutTally.js', import.meta.url), 'utf8')
  const records = [record('observation', 'real', 'qm1', 1), record('observation', 'pending', 'qm2', 2, {}, { localStatus: 'queued' }), record('observation', 'prior', 'qm3', 3, { source_scope: 'external' }), record('observation', 'other', 'qm4', 4, {}, { event_id: 'other' }), record('assignment', 'wrongRobot', 'qm1', 5, { assignee: 'scout', status: 'assigned' }), record('assignment', 'super', 'qm5', null, { role: 'super', alliance: 'red', teams: [1, 2, 3], assignee: 'scout', status: 'assigned' }), record('observation', 'superone', 'qm5', 1, { role: 'super' })]
  const deps = { isCurrentEvidence, matchIdentity, isSuperNote, displayName }
  const baseline = compile(source, 'scoutTally', deps)(records, [], 'event')
  expect(baseline[0]).toMatchObject({ matches: 2, gaps: [{ id: 'wrongRobot' }, { id: 'super' }] })
  const mutations = [['r.event_id === eventId', 'true'], ['!r.localStatus', 'true'], ['isCurrentEvidence(r)', 'true'], ['o.team_number === team', 'true'], ['targets.every(', 'targets.some(']]
  for (const [from, to] of mutations) { expect(source).toContain(from); expect(compile(source.replace(from, to), 'scoutTally', deps)(records, [], 'event')).not.toEqual(baseline) }
})
it('catches unverified and excluded sessions being used for hour ordering', () => {
  const source = readFileSync(new URL('../src/rotationSuggestions.js', import.meta.url), 'utf8')
  const deps = { sessionsFromEvents, breakdownFromSessions, ROLE_ORDER, roleLabel, statusOf, ROLE_PLACE, MAX_IN_A_ROW }
  const attendance = [{ id: 'i', type: 'in', category: 'build', event_time: '2026-10-01T10:00:00Z' }, { id: 'o', type: 'out', event_time: '2026-10-01T12:00:00Z' }]
  expect(verifiedShopHours({ attendance }, season)).toBe(0)
  expect(compile(source.replace('!s.open &&', '!s.open ||'), 'verifiedShopHours', deps)({ attendance }, season)).toBe(2)
  const voided = { attendance, verified_outs: ['o'], reviews: [{ checkout_id: 'o', status: 'voided' }] }
  expect(verifiedShopHours(voided, season)).toBe(0)
  expect(compile(source.replace('[], excluded)', '[], null)'), 'verifiedShopHours', deps)(voided, season)).toBe(2)
})
