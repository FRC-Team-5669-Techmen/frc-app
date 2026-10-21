import { describe, it, expect, beforeEach } from 'vitest'
import { ScoutingStore, createScoutingStore } from '../src/scouting/storage.js'
import { syncScoutingQueue, loadScoutingEvent, readScoutingPages } from '../src/scouting/client.js'
import { _resetWriteVia } from '../src/writeVia.js'

// Deterministic transactional stand-in, not a claim about real browser IDB.
// Browser durability is separately exercised by the fixture E2E.
function backend() {
  let tail = Promise.resolve(), data = { operations: new Map(), drafts: new Map(), cache: new Map() }
  return {
    fail: false,
    transaction(names, mode, fn) {
      const task = tail.then(async () => {
        if (this.fail) throw new Error('disk full')
        const work = structuredClone(data)
        const result = await fn({
          get: async (s, k) => structuredClone(work[s].get(k)),
          put: async (s, v) => work[s].set(v.key, structuredClone(v)),
          remove: async (s, k) => work[s].delete(k),
          all: async s => structuredClone([...work[s].values()]),
        })
        if (mode === 'readwrite') data = work
        return structuredClone(result)
      })
      tail = task.catch(() => {})
      return task
    },
  }
}
function fixture() {
  const db = backend(); let time = 1000, n = 0
  const options = { now: () => time, uuid: () => `uuid-${++n}` }
  return { db, store: new ScoutingStore(db, options), another: () => new ScoutingStore(db, options), advance: t => { time += t } }
}
const record = { id: 'record-1', kind: 'observation', team_number: 5669, match_key: 'qm1', payload: { answers: { trench: 'did_not_see' }, source: 'live' }, version: 0 }
function client(rpc) {
  return { auth: { getSession: async () => ({ data: { session: { user: { id: 'member-a' } } } }) }, rpc }
}
const reply = args => ({ id: args.p_id, event_id: args.p_event, member_id: 'member-a', kind: args.p_kind, payload: args.p_payload, version: args.p_expected_version + 1 })
beforeEach(() => _resetWriteVia())
describe('durable scouting operation model', () => {
  it('has no memory fallback when IndexedDB is unavailable', async () => {
    await expect(createScoutingStore({ indexedDB: null })).rejects.toMatchObject({ code: 'LOCAL_STORAGE_UNAVAILABLE' })
    expect(await fixture().store.enqueue('member-a', 'event-a', record)).toMatchObject({ status: 'local' })
  })
  it('isolates actors and events and snapshots the payload', async () => {
    const { store, another } = fixture(), input = structuredClone(record)
    const operation = await store.enqueue('member-a', 'event-a', input)
    input.payload.answers.trench = 'no'; operation.args.p_payload.answers.trench = 'yes'
    expect((await another().listQueue('member-a', 'event-a'))[0].args.p_payload.answers.trench).toBe('did_not_see')
    expect(await store.listQueue('member-b', 'event-a')).toEqual([])
    expect(await store.listQueue('member-a', 'event-b')).toEqual([])
    expect(await store.listQueue('member-a', 'event-a')).toHaveLength(1)
  })
  it('does not acknowledge a write when durable storage fails', async () => {
    const { db, store } = fixture(); db.fail = true
    await expect(store.enqueue('member-a', 'event-a', record)).rejects.toThrow('disk full')
    db.fail = false
    expect(await store.listQueue('member-a', 'event-a')).toEqual([])
    await store.enqueue('member-a', 'event-a', record)
    expect(await store.listQueue('member-a', 'event-a')).toHaveLength(1)
  })
  it('allows only one active operation on a record even across two tabs', async () => {
    const { store, another } = fixture()
    const results = await Promise.allSettled([store.enqueue('member-a', 'event-a', record), another().enqueue('member-a', 'event-a', record)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')[0].reason.code).toBe('PENDING_RECORD')
    await store.enqueue('member-a', 'event-a', { ...record, id: 'record-2' })
    expect(await store.listQueue('member-a', 'event-a')).toHaveLength(2)
  })
  it('uses atomic leases and rejects stale completion after interruption', async () => {
    const { store, another, advance } = fixture(), op = await store.enqueue('member-a', 'event-a', record)
    const [a, b] = await Promise.all([store.claim('member-a', 'event-a', op.id), another().claim('member-a', 'event-a', op.id)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    const first = a || b
    advance(30001)
    const recovered = await another().claim('member-a', 'event-a', op.id)
    expect(recovered.args).toEqual(op.args)
    expect(recovered.lease).not.toBe(first.lease)
    expect(await store.finish('member-a', 'event-a', op.id, first.lease, { status: 'synced' })).toBe(false)
    expect(await store.finish('member-a', 'event-a', op.id, recovered.lease, { status: 'synced', result: reply(op.args) })).toBe(true)
  })
  it('keeps draft and cache scopes separate through reopening and deletion', async () => {
    const { store, another } = fixture()
    await store.saveDraft('member-a', 'event-a', 'observation', { notes: 'robot obscured' })
    await store.putCache('member-a', 'event-a', { records: [record] })
    expect(await another().getDraft('member-a', 'event-a', 'observation')).toEqual({ notes: 'robot obscured' })
    expect(await store.getDraft('member-b', 'event-a', 'observation')).toBeNull()
    expect(await store.getCache('member-b', 'event-a')).toBeNull()
    expect((await store.getCache('member-a', 'event-a')).value.records).toHaveLength(1)
    await store.deleteDraft('member-a', 'event-a', 'observation')
    expect(await store.getDraft('member-a', 'event-a', 'observation')).toBeNull()
    expect(await store.getCache('member-a', 'event-a')).not.toBeNull()
  })
})
describe('queue synchronization and explicit failure states', () => {
  it('retries an interrupted response with exactly the same operation and body', async () => {
    const { store, another } = fixture(); await store.enqueue('member-a', 'event-a', record)
    const seen = [], logical = new Map(); let drop = true
    const api = client(async (name, args) => {
      seen.push(structuredClone(args)); logical.set(args.p_operation, reply(args))
      if (drop) { drop = false; throw new Error('connection dropped after commit') }
      return { data: logical.get(args.p_operation), error: null }
    })
    let result = await syncScoutingQueue({ store, client: api, memberId: 'member-a', eventId: 'event-a' })
    expect(result[0]).toMatchObject({ status: 'failed', retryable: true })
    result = await syncScoutingQueue({ store: another(), client: api, memberId: 'member-a', eventId: 'event-a' })
    expect(result[0]).toMatchObject({ status: 'synced', result: { version: 1 } })
    expect(logical.size).toBe(1); expect(seen[1]).toEqual(seen[0])
  })
  it('never treats a missing RPC or unconfirmed response as synchronized', async () => {
    const { store } = fixture(); await store.enqueue('member-a', 'event-a', record)
    const api = client(async () => ({ data: null, error: { code: 'PGRST202' } }))
    const result = await syncScoutingQueue({ store, client: api, memberId: 'member-a', eventId: 'event-a' })
    expect(result[0]).toMatchObject({ status: 'failed', error: { code: 'PGRST202' } })
    _resetWriteVia(); api.rpc = async (name, args) => ({ data: reply(args), error: null })
    expect((await syncScoutingQueue({ store, client: api, memberId: 'member-a', eventId: 'event-a' }))[0].status).toBe('synced')
  })
  it('preserves conflicting proposals and requires deliberate resolution', async () => {
    const { store } = fixture(); const op = await store.enqueue('member-a', 'event-a', { ...record, version: 2 }); let calls = 0
    const api = client(async () => { calls++; return { error: { code: '40001', message: 'The record changed.' } } })
    const args = { store, client: api, memberId: 'member-a', eventId: 'event-a' }
    expect((await syncScoutingQueue(args))[0].status).toBe('conflict')
    await syncScoutingQueue(args); expect(calls).toBe(1)
    await expect(store.retry('member-a', 'event-a', op.id)).rejects.toMatchObject({ code: 'RETRY_REFUSED' })
    expect((await store.listQueue('member-a', 'event-a'))[0].args.p_payload).toEqual(record.payload)
    await store.discard('member-a', 'event-a', op.id)
    const replacement = await store.enqueue('member-a', 'event-a', { ...record, version: 3 })
    expect(replacement.id).not.toBe(op.id); expect(replacement.args.p_expected_version).toBe(3)
  })
  it('never sends another account queue and resumes for the original account', async () => {
    const { store } = fixture(); await store.enqueue('member-a', 'event-a', record); let calls = 0
    const api = client(async (n, a) => { calls++; return { data: reply(a) } })
    api.auth.getSession = async () => ({ data: { session: { user: { id: 'member-b' } } } })
    await syncScoutingQueue({ store, client: api, memberId: 'member-a', eventId: 'event-a' }); expect(calls).toBe(0)
    api.auth = client().auth
    await syncScoutingQueue({ store, client: api, memberId: 'member-a', eventId: 'event-a' }); expect(calls).toBe(1)
  })
  it('keeps data synchronized even when notification transport is uncertain', async () => {
    const { store } = fixture(); await store.enqueue('member-a', 'event-a', { ...record, kind: 'message', payload: { text: 'Check intake', request_delivery: true } })
    let sends = 0
    const api = client(async (n, a) => ({ data: reply(a) }))
    api.functions = { invoke: async () => { sends++; throw new Error('network dropped') } }
    const args = { store, client: api, memberId: 'member-a', eventId: 'event-a' }
    const result = await syncScoutingQueue(args)
    expect(result[0]).toMatchObject({ status: 'synced', delivery: { status: 'uncertain' } })
    await syncScoutingQueue(args); expect(sends).toBe(1)
  })
  it('retains successful cache after API failure and fails closed on access denial', async () => {
    const { store } = fixture(); let failure = null
    const api = client()
    api.from = table => ({ select: () => {
      const data = table === 'scouting_records' ? [record] : []
      const q = { eq: () => q, order: () => q, range: async () => failure ? { error: failure } : { data, count: data.length } }
      return q
    } })
    const args = { store, client: api, memberId: 'member-a', eventId: 'event-a' }
    expect((await loadScoutingEvent(args)).records).toHaveLength(1)
    failure = { message: 'offline' }
    expect(await loadScoutingEvent(args)).toMatchObject({ offline: true, records: [record] })
    failure = { code: '42501', message: 'Denied' }
    expect(await loadScoutingEvent(args)).toMatchObject({ offline: false, records: [] })
    expect((await store.getCache('member-a', 'event-a')).value.records).toHaveLength(1)
  })
})

describe('complete paginated reads', () => {
  function paged(rows, cap = 500) {
    const ranges = []
    const api = { from: () => ({ select: () => {
      const q = { order: () => q, eq: () => q, range: async (from, to) => {
        ranges.push([from, to]); return { data: rows.slice(from, Math.min(to + 1, from + cap)), count: rows.length }
      } }; return q
    } }) }
    return { api, ranges }
  }
  it('loads 1201 rows even when the server caps each page below our requested size', async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i).padStart(5, '0') }))
    const { api, ranges } = paged(rows, 100)
    expect(await readScoutingPages(api, 'scouting_records')).toEqual(rows)
    expect(ranges).toHaveLength(13)
    expect(await readScoutingPages(paged([]).api, 'scouting_records')).toEqual([])
  })
  it('refuses an explicit cap breach and a silent truncated result', async () => {
    const rows = [{ id: '1' }, { id: '2' }]
    await expect(readScoutingPages(paged(rows).api, 'scouting_records', { limit: 1 })).rejects.toMatchObject({ code: 'DATA_LIMIT' })
    const api = { from: () => ({ select: () => {
      const q = { order: () => q, range: async () => ({ data: [], count: 4 }) }; return q
    } }) }
    await expect(readScoutingPages(api, 'scouting_records')).rejects.toMatchObject({ code: 'INCOMPLETE_DATA' })
    expect(await readScoutingPages(paged(rows).api, 'scouting_records', { limit: 2 })).toHaveLength(2)
  })
  it('detects changed row counts and repeated pages', async () => {
    let count = 0
    const api = { from: () => ({ select: () => {
      const q = { order: () => q, range: async () => ({ data: [{ id: String(++count) }], count: count + 1 }) }; return q
    } }) }
    await expect(readScoutingPages(api, 'scouting_records')).rejects.toMatchObject({ code: 'DATA_CHANGED' })
    const repeated = { from: () => ({ select: () => {
      const q = { order: () => q, range: async () => ({ data: [{ id: 'same' }], count: 2 }) }; return q
    } }) }
    await expect(readScoutingPages(repeated, 'scouting_records')).rejects.toMatchObject({ code: 'DATA_CHANGED' })
  })
})
