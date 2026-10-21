import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createScoutingStore } from '../src/scouting/storage.js'
import { buildEventArchive } from '../src/scouting/backup.js'
import { parseRecoveryArchive, recoveryOperations, requestFingerprint, MAX_RECOVERY_BYTES } from '../src/scouting/recovery.js'
import { syncScoutingQueue } from '../src/scouting/client.js'
import { _resetWriteVia } from '../src/writeVia.js'

const MEMBER = '10000000-0000-4000-8000-000000000001', OTHER = '10000000-0000-4000-8000-000000000002'
const EVENT = '16000000-0000-4000-8000-000000000001'
const make = (indexedDB = new IDBFactory(), dbName = 'recovery') => createScoutingStore({ indexedDB, dbName })
const observation = { kind: 'observation', team_number: 5669, match_key: 'qm10', payload: { source: 'live', answers: { trench: 'did_not_see', bump: 'no' }, notes: 'View blocked; no intake answer recorded.' } }
async function archiveFrom(store) {
  return buildEventArchive({ memberId: MEMBER, eventId: EVENT, snapshot: {}, local: await store.exportBackup(MEMBER, EVENT) })
}
async function sample() {
  const source = await make()
  try { await source.enqueue(MEMBER, EVENT, observation); return await archiveFrom(source) }
  finally { source.close() }
}
const fakeClient = rpc => ({ auth: { getSession: async () => ({ data: { session: { user: { id: MEMBER } } } }) }, rpc })
beforeEach(() => _resetWriteVia())

describe('reviewed pending-save recovery (IndexedDB emulation)', () => {
  it('holds a recovered save through export/reopen/sync, then sends the original request only after review', async () => {
    const backup = await sample(), indexedDB = new IDBFactory(), target = await make(indexedDB), op = backup.pending[0]
    try {
      const parsed = parseRecoveryArchive(JSON.stringify(backup), MEMBER, EVENT)
      expect(await target.previewRecovery(MEMBER, EVENT, parsed)).toMatchObject([{ id: op.id, state: 'ready' }])
      expect(await target.listQueue(MEMBER, EVENT)).toEqual([])
      const restored = await target.restoreRecovery(MEMBER, EVENT, parsed, [op.id])
      expect(restored[0]).toMatchObject({ id: op.id, record_id: op.record_id, args: op.args, status: 'recovered', result: null })
      expect(restored[0].args.p_payload.answers).toEqual({ trench: 'did_not_see', bump: 'no' })
      expect(restored[0].args.p_payload.answers).not.toHaveProperty('ground_intake')
      const rpc = vi.fn(async (name, args) => ({ data: { id: args.p_id, event_id: args.p_event, version: 1 } }))
      const client = fakeClient(rpc)
      await syncScoutingQueue({ store: target, client, memberId: MEMBER, eventId: EVENT })
      expect(rpc).not.toHaveBeenCalled()
      expect(await target.claim(MEMBER, EVENT, op.id)).toBeNull()
      const reexport = await archiveFrom(target)
      expect(reexport.pending[0].status).toBe('recovered')
      expect(reexport.records).toEqual([])
      target.close()
      const reopened = await make(indexedDB)
      try {
        expect((await reopened.listQueue(MEMBER, EVENT))[0].status).toBe('recovered')
        await reopened.releaseRecovered(MEMBER, EVENT, op.id)
        await syncScoutingQueue({ store: reopened, client, memberId: MEMBER, eventId: EVENT })
        expect(rpc).toHaveBeenCalledExactlyOnceWith('scouting_save', op.args)
        expect((await reopened.listQueue(MEMBER, EVENT))[0]).toMatchObject({ status: 'synced', id: op.id })
      } finally { reopened.close() }
    } finally { target.close() }
  })

  it('skips an identical existing operation without downgrading its synchronized receipt', async () => {
    const target = await make()
    try {
      const op = await target.enqueue(MEMBER, EVENT, observation), archive = await archiveFrom(target)
      const claim = await target.claim(MEMBER, EVENT, op.id)
      await target.finish(MEMBER, EVENT, op.id, claim.lease, { status: 'synced', result: { id: op.record_id, event_id: EVENT, version: 2 } })
      const before = await target.listQueue(MEMBER, EVENT)
      expect(await target.previewRecovery(MEMBER, EVENT, archive)).toMatchObject([{ state: 'existing' }])
      expect(await target.restoreRecovery(MEMBER, EVENT, archive, [op.id])).toEqual([])
      expect(await target.listQueue(MEMBER, EVENT)).toEqual(before)
      archive.device_backup.operations[0].args.p_payload.notes = 'Changed under the old save ID'
      expect(await target.previewRecovery(MEMBER, EVENT, archive)).toMatchObject([{ state: 'blocked' }])
      await expect(target.restoreRecovery(MEMBER, EVENT, archive, [op.id])).rejects.toMatchObject({ code: 'RECOVERY_COLLISION' })
      expect(await target.listQueue(MEMBER, EVENT)).toEqual(before)
    } finally { target.close() }
  })

  it('rechecks a preview atomically against another tab and rolls back unrelated selected rows', async () => {
    const indexedDB = new IDBFactory(), target = await make(indexedDB), other = await make(indexedDB), source = await make()
    try {
      const a = await source.enqueue(MEMBER, EVENT, observation), b = await source.enqueue(MEMBER, EVENT, { ...observation, match_key: 'qm11' })
      const archive = await archiveFrom(source)
      expect((await target.previewRecovery(MEMBER, EVENT, archive)).every(row => row.state === 'ready')).toBe(true)
      const newer = await other.enqueue(MEMBER, EVENT, { ...observation, id: a.record_id, version: 1 })
      await expect(target.restoreRecovery(MEMBER, EVENT, archive, [a.id, b.id])).rejects.toMatchObject({ code: 'RECOVERY_COLLISION' })
      expect((await target.listQueue(MEMBER, EVENT)).map(row => row.id)).toEqual([newer.id])
      const preview = await target.previewRecovery(MEMBER, EVENT, archive)
      expect(preview.find(row => row.id === a.id).state).toBe('blocked'); expect(preview.find(row => row.id === b.id).state).toBe('ready')
      expect(await target.restoreRecovery(MEMBER, EVENT, archive, [b.id])).toHaveLength(1)
    } finally { target.close(); other.close(); source.close() }
  })

  it('rolls back the complete selection on a storage failure and succeeds with the same IDs after repair', async () => {
    const target = await make(), source = await make()
    try {
      await source.enqueue(MEMBER, EVENT, observation); await source.enqueue(MEMBER, EVENT, { ...observation, match_key: 'qm11' })
      const archive = await archiveFrom(source), ids = archive.pending.map(row => row.id)
      const transaction = target.backend.transaction.bind(target.backend)
      const fault = vi.spyOn(target.backend, 'transaction').mockImplementation((names, mode, fn) => transaction(names, mode, tx => fn({ ...tx,
        put: async (...args) => { await tx.put(...args); throw new Error('Injected disk quota failure') },
      })))
      await expect(target.restoreRecovery(MEMBER, EVENT, archive, ids)).rejects.toThrow('disk quota')
      fault.mockRestore()
      expect(await target.listQueue(MEMBER, EVENT)).toEqual([])
      expect((await target.restoreRecovery(MEMBER, EVENT, archive, ids)).map(row => row.id)).toEqual(ids)
    } finally { target.close(); source.close() }
  })

  it('imports no archive cache, claimed receipts, manager hints or drafts', async () => {
    const target = await make(), archive = await sample()
    try {
      archive.device_backup.cache = { key: `${MEMBER}:${EVENT}`, value: { records: [{ id: 'forged' }], event: { id: EVENT }, members: [] } }
      archive.device_backup.drafts = [{ draft_key: 'eligible-scouts', value: { manager: true } }]
      archive.device_backup.operations[0].result = { id: 'forged-result', version: 100 }
      archive.records = [{ id: 'forged-record', kind: 'team' }]
      await target.restoreRecovery(MEMBER, EVENT, archive, [archive.pending[0].id])
      expect(await target.getCache(MEMBER, EVENT)).toBeNull()
      expect(await target.getDraft(MEMBER, EVENT, 'eligible-scouts')).toBeNull()
      expect((await target.listQueue(MEMBER, EVENT))[0]).toMatchObject({ status: 'recovered', result: null })
      expect(await target.listQueue(OTHER, EVENT)).toEqual([])
      await expect(target.releaseRecovered(OTHER, EVENT, archive.pending[0].id)).rejects.toMatchObject({ code: 'RECOVERY_REFUSED' })
      await target.releaseRecovered(MEMBER, EVENT, archive.pending[0].id)
      expect((await target.listQueue(MEMBER, EVENT))[0].status).toBe('local')
    } finally { target.close() }
  })

  it('concurrent recovery inserts one held copy; a second release cannot rewrite a save', async () => {
    const indexedDB = new IDBFactory(), a = await make(indexedDB), b = await make(indexedDB), archive = await sample(), id = archive.pending[0].id
    try {
      const results = await Promise.all([a.restoreRecovery(MEMBER, EVENT, archive, [id]), b.restoreRecovery(MEMBER, EVENT, archive, [id])])
      expect(results.map(rows => rows.length).sort()).toEqual([0, 1])
      expect(await a.listQueue(MEMBER, EVENT)).toHaveLength(1)
      await a.releaseRecovered(MEMBER, EVENT, id)
      await expect(b.releaseRecovered(MEMBER, EVENT, id)).rejects.toMatchObject({ code: 'RECOVERY_REFUSED' })
      expect((await a.listQueue(MEMBER, EVENT))[0].args).toEqual(archive.pending[0].args)
    } finally { a.close(); b.close() }
  })

  it('uses the server receipt after a committed response was lost before the backup', async () => {
    const source = await make(), target = await make(), receipts = new Map(), bodies = [], id = (await source.enqueue(MEMBER, EVENT, observation)).id
    const rpc = vi.fn(async (name, args) => {
      bodies.push(structuredClone(args))
      if (!receipts.has(args.p_operation)) receipts.set(args.p_operation, { id: args.p_id, event_id: args.p_event, version: 1 })
      if (bodies.length === 1) throw new Error('Response lost after commit (simulated)')
      return { data: receipts.get(args.p_operation) }
    })
    try {
      await syncScoutingQueue({ store: source, client: fakeClient(rpc), memberId: MEMBER, eventId: EVENT })
      const archive = await archiveFrom(source)
      expect(archive.pending[0].status).toBe('failed')
      await target.restoreRecovery(MEMBER, EVENT, archive, [id])
      await target.releaseRecovered(MEMBER, EVENT, id)
      await syncScoutingQueue({ store: target, client: fakeClient(rpc), memberId: MEMBER, eventId: EVENT })
      expect(receipts.size).toBe(1); expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0])
      expect((await target.listQueue(MEMBER, EVENT))[0].status).toBe('synced')
    } finally { source.close(); target.close() }
  })

  it('retains a server conflict and never changes the expected version during recovery', async () => {
    const source = await make(), target = await make()
    try {
      const op = await source.enqueue(MEMBER, EVENT, { ...observation, version: 1 }), archive = await archiveFrom(source)
      await target.restoreRecovery(MEMBER, EVENT, archive, [op.id]); await target.releaseRecovered(MEMBER, EVENT, op.id)
      const rpc = vi.fn(async () => ({ error: { code: '40001', message: 'The server is now at version 2.' } }))
      await syncScoutingQueue({ store: target, client: fakeClient(rpc), memberId: MEMBER, eventId: EVENT })
      expect((await target.listQueue(MEMBER, EVENT))[0]).toMatchObject({ status: 'conflict', args: { p_expected_version: 1 }, retryable: false })
      await syncScoutingQueue({ store: target, client: fakeClient(rpc), memberId: MEMBER, eventId: EVENT })
      expect(rpc).toHaveBeenCalledTimes(1)
    } finally { source.close(); target.close() }
  })

  it('does not release a held notification or mistake a backup for delivery confirmation', async () => {
    const source = await make(), target = await make()
    try {
      const op = await source.enqueue(MEMBER, EVENT, { kind: 'message', team_number: 5669, payload: { text: 'Check intake', status: 'open', request_delivery: true } })
      const archive = await archiveFrom(source), invoke = vi.fn(async () => ({ data: { status: 'not_configured' } }))
      const rpc = vi.fn(async (name, args) => ({ data: { id: args.p_id, event_id: args.p_event, version: 1, kind: args.p_kind, payload: args.p_payload } })), client = { ...fakeClient(rpc), functions: { invoke } }
      await target.restoreRecovery(MEMBER, EVENT, archive, [op.id])
      await syncScoutingQueue({ store: target, client, memberId: MEMBER, eventId: EVENT })
      expect(rpc).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalled()
      await target.releaseRecovered(MEMBER, EVENT, op.id)
      await syncScoutingQueue({ store: target, client, memberId: MEMBER, eventId: EVENT })
      expect(rpc).toHaveBeenCalledTimes(1); expect(invoke).toHaveBeenCalledTimes(1)
      expect((await target.listQueue(MEMBER, EVENT))[0]).toMatchObject({ status: 'synced', delivery: { status: 'not_configured' } })
    } finally { source.close(); target.close() }
  })
})

describe('untrusted backup transport validation', () => {
  it.each([
    ['outer member', a => { a.exported_by = OTHER }],
    ['device event', a => { a.device_backup.event_id = OTHER }],
    ['operation actor', a => { a.device_backup.operations[0].args.p_actor = OTHER }],
    ['operation event', a => { a.device_backup.operations[0].args.p_event = OTHER }],
    ['operation identity', a => { a.device_backup.operations[0].args.p_operation = OTHER }],
    ['record identity', a => { a.device_backup.operations[0].args.p_id = OTHER }],
    ['storage key', a => { a.device_backup.operations[0].key = 'other' }],
    ['extra RPC parameter', a => { a.device_backup.operations[0].args.p_admin = true }],
    ['invalid kind', a => { a.device_backup.operations[0].args.p_kind = 'delete_everything' }],
    ['array payload', a => { a.device_backup.operations[0].args.p_payload = [] }],
    ['negative version', a => { a.device_backup.operations[0].args.p_expected_version = -1 }],
    ['repeated ID', a => { a.device_backup.operations.push(a.device_backup.operations[0]) }],
  ])('rejects %s before any local write, against a valid positive control', async (name, mutate) => {
    const archive = await sample(), target = await make()
    try {
      const invalid = structuredClone(archive); mutate(invalid)
      expect(() => parseRecoveryArchive(JSON.stringify(invalid), MEMBER, EVENT)).toThrow('Backup cannot be recovered')
      await expect(target.restoreRecovery(MEMBER, EVENT, invalid, [archive.pending[0].id])).rejects.toThrow()
      expect(await target.listQueue(MEMBER, EVENT)).toEqual([])
      expect(await target.restoreRecovery(MEMBER, EVENT, archive, [archive.pending[0].id])).toHaveLength(1)
    } finally { target.close() }
  })
  it('bounds files and nesting without interpreting absent, null and zero as equal', async () => {
    const archive = await sample()
    expect(() => parseRecoveryArchive('{bad', MEMBER, EVENT)).toThrow('valid JSON')
    expect(() => parseRecoveryArchive(' '.repeat(MAX_RECOVERY_BYTES + 1), MEMBER, EVENT)).toThrow('20 MB')
    expect(requestFingerprint({ a: 0, b: null })).toBe(requestFingerprint({ b: null, a: 0 }))
    expect(new Set([requestFingerprint({}), requestFingerprint({ a: null }), requestFingerprint({ a: 0 })]).size).toBe(3)
    let deep = {}; for (let i = 0; i < 35; i++) deep = { deeper: deep }
    archive.device_backup.operations[0].args.p_payload = deep
    expect(() => recoveryOperations(archive, MEMBER, EVENT)).toThrow('nested too deeply')
  })
})

// Permissive source mutants prove the refusal oracle detects a removed scope
// guard, rather than merely passing because the recovery path is broken.
describe('recovery scope mutation controls', () => {
  it('catches removed account, event and immutable-operation binding guards', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../src/scouting/recovery.js', import.meta.url), 'utf8')
    const compile = code => new Function(`${code.replaceAll('export ', '')}; return recoveryOperations;`)()
    const backup = await sample()
    const cases = [
      ['archive.exported_by !== memberId', a => { a.exported_by = OTHER }],
      ['a.p_actor !== memberId', a => { a.device_backup.operations[0].args.p_actor = OTHER }],
      ['a.p_event !== eventId', a => { a.device_backup.operations[0].args.p_event = OTHER }],
      ['a.p_operation !== op.id', a => { a.device_backup.operations[0].args.p_operation = OTHER }],
    ]
    for (const [guard, change] of cases) {
      expect(source.includes(guard)).toBe(true)
      const invalid = structuredClone(backup); change(invalid)
      const oracle = validate => {
        if (validate(backup, MEMBER, EVENT).length !== 1) return false
        try { validate(invalid, MEMBER, EVENT); return false } catch { return true }
      }
      expect(oracle(compile(source)), guard).toBe(true)
      expect(oracle(compile(source.replace(guard, 'false'))), guard).toBe(false)
    }
  })
})
