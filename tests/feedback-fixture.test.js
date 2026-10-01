// The lane-c fixture plugin (src/dev/fixture/features/c.js), driven directly.
//
// The fixture ENGINE is built elsewhere, so this cannot test the plugin inside
// it. What it can test is that the plugin keeps the contract's shape, that its
// two RPC handlers refuse exactly whom the SQL refuses (with the admin as the
// positive control), and that its seed is in the vocabulary the database
// actually stores.

import { describe, expect, test } from 'vitest'
import plugin from '../src/dev/fixture/features/c.js'
import { LEGACY_STATUSES, normStatus } from '../src/feedbackModel.js'

const ids = { admin: 'A', mentor: 'M', student: 'S1', student2: 'S2', parent: 'P' }
const now = new Date('2026-10-01T19:00:00Z')
const admin = { key: 'admin', isAdmin: true }
const student = { key: 'student', isAdmin: false }
const fresh = () => ({ feedback: plugin.seed({ ids, now }).feedback.map(r => ({ ...r })) })

describe('contract shape', () => {
  test('declares migration 0002, its two RPCs and its two columns', () => {
    expect(plugin.migration).toBe('0002')
    expect(plugin.creates.rpcs.sort()).toEqual(['feedback_restore_status', 'feedback_set_status'])
    expect(plugin.creates.columns).toEqual({ feedback: ['tried', 'build'] })
    expect(Object.keys(plugin.rpcs).sort()).toEqual(['feedback_restore_status', 'feedback_set_status'])
  })

  test('both embeds resolve, by alias and by FK hint', () => {
    expect(plugin.relations['feedback.author'].local).toBe('member_id')
    expect(plugin.relations['feedback.feedback_member_id_fkey'].local).toBe('member_id')
    expect(plugin.relations['feedback.reviewer'].local).toBe('reviewed_by')
    expect(plugin.relations['feedback.feedback_reviewed_by_fkey'].local).toBe('reviewed_by')
  })

  test('reports are visible to an admin only (the positive control is the admin)', () => {
    expect(plugin.visible.feedback({ persona: admin })).toBe(true)
    expect(plugin.visible.feedback({ persona: student })).toBe(false)
    expect(plugin.visible.feedback({ persona: { roles: ['mentor'] } })).toBe(false)
    expect(plugin.visible.feedback({ persona: { roles: ['mentor', 'admin'] } })).toBe(true)
  })
})

describe('seed', () => {
  const rows = plugin.seed({ ids, now }).feedback

  test('eight reports, every status a value the PRE-0002 database stores', () => {
    expect(rows).toHaveLength(8)
    for (const r of rows) expect(LEGACY_STATUSES).toContain(r.status)
    expect(rows.map(r => normStatus(r.status)).sort()).toEqual(['new', 'new', 'new', 'new', 'seen', 'seen', 'wont_do', 'wont_do'])
  })

  test('covers bug, idea, no type and the old neutral type, with and without screenshots', () => {
    expect(new Set(rows.map(r => r.category))).toEqual(new Set(['bug', 'idea', null, 'feedback']))
    expect(rows.filter(r => r.image_paths.length).length).toBe(2)
    expect(rows.filter(r => !r.image_paths.length).length).toBe(6)
  })

  test('uses the persona ids it is handed, and is relative to the fixture clock', () => {
    expect(new Set(rows.map(r => r.member_id))).toEqual(new Set(['A', 'M', 'S1', 'S2']))
    expect(rows.every(r => Date.parse(r.created_at) < now.getTime())).toBe(true)
  })

  test('is deterministic: no side effects, same input same rows', () => {
    expect(plugin.seed({ ids, now })).toEqual(plugin.seed({ ids, now }))
  })
})

describe('rpc handlers', () => {
  const set = plugin.rpcs.feedback_set_status
  const restore = plugin.rpcs.feedback_restore_status

  test('a student and a signed-out caller are refused with 42501, and nothing moves', () => {
    const db = fresh()
    const before = db.feedback.map(r => r.status)
    const all = db.feedback.map(r => r.id)
    expect(set({ args: { p_ids: all, p_status: 'spam' }, db, user: { id: 'S1' }, persona: student, now }).error.code).toBe('42501')
    expect(set({ args: { p_ids: all, p_status: 'spam' }, db, user: null, persona: null, now }).error.code).toBe('42501')
    expect(restore({ args: { p_items: [], p_from: 'spam' }, db, user: { id: 'S1' }, persona: student }).error.code).toBe('42501')
    expect(db.feedback.map(r => r.status)).toEqual(before)
  })

  test('the admin moves, gets the previous state back, and the undo restores it exactly (positive control)', () => {
    const db = fresh()
    const [r1, , , , r5] = db.feedback
    const r5Stamp = r5.reviewed_at   // read before the move mutates the row
    const res = set({ args: { p_ids: [r1.id, r5.id], p_status: 'done' }, db, user: { id: 'A' }, persona: admin, now })
    expect(res.error).toBeNull()
    expect(res.data).toEqual([
      { id: r1.id, previous_status: 'open', previous_reviewed_by: null, previous_reviewed_at: null },
      { id: r5.id, previous_status: 'reviewed', previous_reviewed_by: 'A', previous_reviewed_at: r5Stamp },
    ])
    expect(db.feedback[0]).toMatchObject({ status: 'done', reviewed_by: 'A', reviewed_at: '2026-10-01T19:00:00.000Z' })
    const items = res.data.map(c => ({ id: c.id, status: c.previous_status, reviewed_by: c.previous_reviewed_by, reviewed_at: c.previous_reviewed_at }))
    const back = restore({ args: { p_items: items, p_from: 'done' }, db, user: { id: 'A' }, persona: admin })
    expect(back.data.map(d => d.status)).toEqual(['open', 'reviewed'])
    expect(db.feedback[0]).toMatchObject({ status: 'open', reviewed_by: null, reviewed_at: null })
  })

  test('a stale undo never overwrites a later move', () => {
    const db = fresh()
    const r = db.feedback[0]
    const moved = set({ args: { p_ids: [r.id], p_status: 'spam' }, db, user: { id: 'A' }, persona: admin, now })
    set({ args: { p_ids: [r.id], p_status: 'in_progress' }, db, user: { id: 'A' }, persona: admin, now })
    const items = moved.data.map(c => ({ id: c.id, status: c.previous_status }))
    expect(restore({ args: { p_items: items, p_from: 'spam' }, db, user: { id: 'A' }, persona: admin }).data).toEqual([])
    expect(r.status).toBe('in_progress')
  })

  test('only the six new statuses go through the move, as in the SQL', () => {
    const db = fresh()
    expect(set({ args: { p_ids: [db.feedback[0].id], p_status: 'reviewed' }, db, user: { id: 'A' }, persona: admin, now }).error.code).toBe('22023')
    expect(set({ args: { p_ids: [db.feedback[0].id], p_status: 'seen' }, db, user: { id: 'A' }, persona: admin, now }).error).toBeNull()
  })
})
