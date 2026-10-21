import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createScoutingStore } from '../src/scouting/storage.js'
import { buildEventArchive } from '../src/scouting/backup.js'
const record = { kind: 'observation', team_number: 5669, match_key: 'qm1', payload: { source: 'live', answers: { trench: 'did_not_see' } } }
const makeStore = () => createScoutingStore({ indexedDB: new IDBFactory() })

describe('portable event and device backup', () => {
  it('includes unsent operations, drafts, practice, receipts and cache without another account or event', async () => {
    const store = await makeStore()
    try {
      const op = await store.enqueue('member-a', 'event-a', record)
      await store.enqueue('member-b', 'event-a', record)
      await store.enqueue('member-a', 'event-b', record)
      await store.saveDraft('member-a', 'event-a', 'training:2026.1', { _activeMission: 2, _workbook: [{ notes: 'Visible failed attempt' }] })
      await store.saveDraft('member-a', 'event-a', 'form:observation:new', record)
      await store.saveDraft('member-a', 'event-a', 'nexus-pit-map-v1', { event_key: '2026dal', source: 'nexus', fetched_at: '2026-10-21T08:00:00Z', map: { size: {x:100,y:100}, pits: {} } })
      await store.saveDraft('member-b', 'event-a', 'private', { note: 'other member' })
      await store.saveDraft('member-a', 'event-b', 'private', { note: 'other event' })
      await store.putCache('member-a', 'event-a', { event: { id: 'event-a' }, records: [] })
      const backup = await store.exportBackup('member-a', 'event-a')
      expect(backup.operations).toHaveLength(1)
      expect(backup.operations[0].args).toEqual(op.args)
      expect(backup.drafts.map(d => d.draft_key).sort()).toEqual(['form:observation:new', 'nexus-pit-map-v1', 'training:2026.1'])
      expect(backup.drafts.find(d => d.draft_key === 'nexus-pit-map-v1').value.event_key).toBe('2026dal')
      expect(backup.cache.value.event.id).toBe('event-a')
      expect(JSON.stringify(backup)).not.toMatch(/other member|other event/)
      backup.operations[0].args.p_payload.answers.trench = 'no'
      expect((await store.listQueue('member-a', 'event-a'))[0].args.p_payload.answers.trench).toBe('did_not_see')
    } finally { store.close() }
  })
  it('retains a confirmed save when the following server refresh failed, and prefers a newer downloaded correction', async () => {
    const store = await makeStore()
    try {
      const op = await store.enqueue('member-a', 'event-a', record)
      const claimed = await store.claim('member-a', 'event-a', op.id)
      const receipt = { ...record, id: op.record_id, event_id: 'event-a', member_id: 'member-a', version: 1 }
      await store.finish('member-a', 'event-a', op.id, claimed.lease, { status: 'synced', result: receipt })
      const local = await store.exportBackup('member-a', 'event-a')
      const args = { memberId: 'member-a', eventId: 'event-a', local }
      const archive = buildEventArchive({ ...args, snapshot: { records: [], offline: true } })
      expect(archive.records).toEqual([receipt]); expect(archive.pending).toEqual([])
      expect(archive.device_backup.operations[0].id).toBe(op.id)
      const newer = { ...receipt, version: 2, payload: { answers: { trench: 'yes' } } }
      expect(buildEventArchive({ ...args, snapshot: { records: [newer] } }).records).toEqual([newer])
      expect(() => buildEventArchive({ ...args, memberId: 'other', snapshot: {} })).toThrow('another account')
    } finally { store.close() }
  })
  it('keeps pending failures distinct from synchronized evidence and does not modify the queue', async () => {
    const store = await makeStore()
    try {
      const op = await store.enqueue('a', 'e', record)
      const claim = await store.claim('a', 'e', op.id)
      await store.finish('a', 'e', op.id, claim.lease, { status: 'conflict', error: { code: '40001' } })
      const before = await store.listQueue('a', 'e')
      const archive = buildEventArchive({ memberId: 'a', eventId: 'e', snapshot: {}, local: await store.exportBackup('a', 'e') })
      expect(archive.records).toEqual([])
      expect(archive.pending[0]).toMatchObject({ id: op.id, status: 'conflict', args: op.args })
      expect(await store.listQueue('a', 'e')).toEqual(before)
    } finally { store.close() }
  })
})
