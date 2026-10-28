// "Do this now" (src/doThisNow.js, ledger 0017): only what is open, each with
// a place to do it, nothing at all when nothing is open.
import { describe, it, expect } from 'vitest'
import { doThisNow } from '../src/doThisNow.js'
import { nextShift, shiftEnd } from '../src/roleBoard.js'

const NOW = Date.parse('2026-10-24T18:00:00Z')
const onboarding = (done) => ({ done: false, due: '2026-11-10', items: [
  { key: 'first_registration', done: done.includes('first_registration') }, { key: 'discord', done: done.includes('discord') },
  { key: 'groupme', done: true }, { key: 'safe1', done: false }, { key: 'student_signed', done: done.includes('student_signed') }, { key: 'buddy', done: false } ] })

describe('do this now', () => {
  it('nothing open gives an empty list (Home shows nothing)', () => {
    expect(doThisNow({ now: NOW })).toEqual([])
    expect(doThisNow({ onboarding: { done: true, items: [{ key: 'discord', done: false }] }, survey: { answered: true }, now: NOW })).toEqual([])
  })
  it('open member checklist items appear, each linked; staff-only and record-only steps do not', () => {
    const items = doThisNow({ onboarding: onboarding(['discord']), now: NOW })
    expect(items.map((i) => i.key)).toEqual(['onboarding:first_registration', 'onboarding:student_signed'])
    expect(items.find((i) => i.key === 'onboarding:student_signed').to).toBe('/handbook')
    expect(items.find((i) => i.key === 'onboarding:first_registration').title).toMatch(/FIRST/)
  })
  it('FIRST registration done removes it (both directions)', () => {
    expect(doThisNow({ onboarding: onboarding(['first_registration']), now: NOW }).some((i) => i.key === 'onboarding:first_registration')).toBe(false)
  })
  it('an unread family sign-up reminder appears once per trip, with its notice to clear; a read one does not', () => {
    const notices = [
      { id: 'n1', kind: 'signup', title: 'Family sign-up needed: Beach Blitz 2026', created_at: '2026-10-22T18:00:00Z', read_at: null },
      { id: 'n2', kind: 'signup', title: 'Family sign-up needed: Beach Blitz 2026', created_at: '2026-10-23T18:00:00Z', read_at: null },
      { id: 'n3', kind: 'signup', title: 'Family sign-up needed: Old Trip', created_at: '2026-10-21T18:00:00Z', read_at: '2026-10-21T19:00:00Z' },
      { id: 'n4', kind: 'roster', title: 'Your role at Beach Blitz', created_at: '2026-10-22T18:00:00Z', read_at: null },
    ]
    const items = doThisNow({ notices, now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ title: 'Family sign-up for Beach Blitz 2026', to: '/trips', notice: 'n1', tone: 'urgent' })
  })
  it('a sent-back sign-out comes first; an unanswered survey last', () => {
    const items = doThisNow({ sentBack: { reason: 'Sweep the floor' }, survey: { answered: false, title: 'Week 8' }, onboarding: onboarding([]), now: NOW })
    expect(items[0]).toMatchObject({ key: 'signout', tone: 'urgent' })
    expect(items.at(-1)).toMatchObject({ key: 'survey', to: '/survey' })
  })
  it('a checklist due within three days is urgent', () => {
    const soon = { ...onboarding([]), due: '2026-10-25' }
    expect(doThisNow({ onboarding: soon, now: NOW })[0].tone).toBe('urgent')
    expect(doThisNow({ onboarding: onboarding([]), now: NOW })[0].tone).toBe('todo')
  })

  it('an upcoming event with unfilled role slots appears and opens its board; a fully covered one does not', () => {
    const items = doThisNow({ roleBoards: [{ event_id: 'e1', title: 'Beach Blitz', unfilled: 12, mine: 0 }, { event_id: 'e2', title: 'Covered', unfilled: 0 }], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ to: '/roles/e1', tone: 'urgent' })
    expect(doThisNow({ roleBoards: [{ event_id: 'e1', title: 'Beach Blitz', unfilled: 3, mine: 2 }], now: NOW })[0].tone).toBe('todo')
  })

  it('Meet a team (0035) shows with the slot time and opens the event; nothing owed shows nothing', () => {
    const later = { label: 'Qualifications 3', starts_at: '2026-10-24T20:00:00Z', ends_at: '2026-10-24T21:15:00Z', status: 'assigned' }
    const items = doThisNow({ meetTeam: [{ event_id: 'e1', title: 'Beach Blitz', slot: later }], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: 'meet:e1', title: 'Meet a team', to: '/meet/e1', tone: 'todo' })
    expect(items[0].detail).toContain('Your slot: Oct 24, 1:00 PM')
    // Once the slot has started, or with no slot at all, it is urgent.
    expect(doThisNow({ meetTeam: [{ event_id: 'e1', title: 'Beach Blitz', slot: { ...later, starts_at: '2026-10-24T17:00:00Z' } }], now: NOW })[0].tone).toBe('urgent')
    expect(doThisNow({ meetTeam: [{ event_id: 'e1', title: 'Beach Blitz', slot: null }], now: NOW })[0]).toMatchObject({ tone: 'urgent', detail: 'Talk to another team at Beach Blitz, then log it.' })
    expect(doThisNow({ meetTeam: [], now: NOW })).toHaveLength(0)
  })
})

describe('my shift now or next (ledger 0029)', () => {
  const at = (h, m = 0) => Date.UTC(2026, 9, 31, h + 7, m)
  const iso = (ms) => new Date(ms).toISOString()
  const shifts = [
    { slotId: 'a', label: 'Qualifications 1', role: 'scout', status: 'assigned', starts_at: iso(at(9, 35)), ends_at: iso(at(10, 45)) },
    { slotId: 'b', label: 'Qualifications 3', role: 'pit_crew', status: 'assigned', starts_at: iso(at(13)), ends_at: iso(at(14, 15)) },
    { slotId: 'c', label: 'Alliance selection', role: 'team_captain', status: 'assigned', starts_at: iso(at(16)), ends_at: null },
  ]
  it('before the first: Next, the earliest one; during it: Now; between: the next; after all: nothing', () => {
    expect(nextShift(shifts, at(8))).toMatchObject({ slotId: 'a', now: false })
    expect(nextShift(shifts, at(10))).toMatchObject({ slotId: 'a', now: true })
    expect(nextShift(shifts, at(11))).toMatchObject({ slotId: 'b', now: false })
    expect(nextShift(shifts, at(16, 30))).toMatchObject({ slotId: 'c', now: true })
    expect(nextShift(shifts, at(17, 1))).toBe(null)
    expect(shiftEnd(shifts[2])).toBe(at(17))
  })
  it('Home shows Now as urgent and Next as a to-do, linking the role board; none without shifts', () => {
    const now = doThisNow({ myShifts: [{ ...nextShift(shifts, at(10)), event_id: 'ev', title: 'Beach Blitz 2026' }] })
    expect(now).toEqual([expect.objectContaining({ key: 'shift:ev', title: 'Now: Scout', tone: 'urgent', to: '/roles/ev' })])
    expect(now[0].detail).toMatch(/^Qualifications 1 until 10:45/)
    const next = doThisNow({ myShifts: [{ ...nextShift(shifts, at(11)), event_id: 'ev', title: 'Beach Blitz 2026' }] })
    expect(next).toEqual([expect.objectContaining({ title: 'Next: Pit crew', tone: 'todo' })])
    expect(doThisNow({ myShifts: [] }).filter((i) => i.key.startsWith('shift:'))).toHaveLength(0)
  })
})
