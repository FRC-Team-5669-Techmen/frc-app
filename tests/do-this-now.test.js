// "Do this now" (src/doThisNow.js, ledger 0017): only what is open, each with
// a place to do it, nothing at all when nothing is open.
import { describe, it, expect } from 'vitest'
import { doThisNow } from '../src/doThisNow.js'

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
})
