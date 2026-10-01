// The lane-f fixture plugin (src/dev/fixture/features/f.js), driven directly.
//
// Its has_capability handler must answer the way public.has_capability() in
// 0004 does: staff, or a holder whose profile is APPROVED. (Nothing in the
// client calls that RPC today -- the schedule decides whether to offer
// "+ New event" from the member_permissions rows, src/permissions.js -- so
// this pins the handler for the first caller that does.) Each case is driven both ways on the same person, so a handler
// that answers false (or true) for everybody fails.

import { describe, expect, test } from 'vitest'
import plugin from '../src/dev/fixture/features/f.js'

const ids = { admin: 'A', mentor: 'M', student: 'S1', student2: 'S2' }
const now = new Date('2026-10-01T19:00:00Z')

function store({ holderApproved = true } = {}) {
  const seed = plugin.seed({ ids, now })
  return {
    tables: {
      member_permissions: seed.member_permissions.map(r => ({ ...r })),
      profiles: [
        { id: 'S1', approved: holderApproved },
        { id: 'S2', approved: true },
        { id: 'M', approved: true },
      ],
    },
  }
}

const ask = (db, id, persona = {}) => plugin.rpcs.has_capability({
  args: { p_capability: 'events.create' }, db, user: { id }, persona,
}).data

describe('fixture has_capability mirrors 0004', () => {
  test('the seed grants the student, and nobody else', () => {
    const grants = plugin.seed({ ids, now }).member_permissions
    expect(grants.map(g => [g.member_id, g.capability])).toEqual([['S1', 'events.create']])
  })

  test('an approved holder has it; the same holder unapproved does not', () => {
    expect(ask(store(), 'S1')).toBe(true)
    expect(ask(store({ holderApproved: false }), 'S1')).toBe(false)
  })

  test('a non-holder does not, approved or not; staff do with no grant at all', () => {
    expect(ask(store(), 'S2')).toBe(false)
    expect(ask(store(), 'M', { isStaff: true })).toBe(true)
    expect(ask(store({ holderApproved: false }), 'M', { isStaff: true })).toBe(true)
  })

  test('a holder with no profile row in the store is refused, as the SQL join refuses', () => {
    const db = store()
    db.tables.profiles = db.tables.profiles.filter(p => p.id !== 'S1')
    expect(ask(db, 'S1')).toBe(false)
  })
})
