// src/writeVia.js: a page write goes through its database function, and falls
// back to the exact direct write it used to make while the function's
// migration has not been pasted (PGRST202 / 42883). Driven against a stand-in
// client that records every call the way supabase-js chains them.
import { beforeEach, describe, expect, it } from 'vitest'
import { writeVia, runDirect, _resetWriteVia } from '../src/writeVia.js'

function fakeClient({ rpc = {}, tables = {} } = {}) {
  const calls = []
  const client = {
    calls,
    rpc(name, args) {
      calls.push({ kind: 'rpc', name, args })
      const a = rpc[name]
      if (a === undefined) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } })
      return Promise.resolve(typeof a === 'function' ? a(args) : a)
    },
    from(table) {
      const chain = [{ table }]
      const answer = () => {
        calls.push({ kind: 'table', chain })
        const t = tables[table]
        const a = typeof t === 'function' ? t(chain) : t
        return a ?? { data: null, error: null }
      }
      const q = {}
      for (const m of ['insert', 'update', 'upsert', 'delete', 'eq', 'in', 'match', 'select', 'single']) {
        q[m] = (...args) => { chain.push({ [m]: args }); return q }
      }
      q.then = (ok, bad) => Promise.resolve(answer()).then(ok, bad)
      return q
    },
  }
  return client
}

beforeEach(() => _resetWriteVia())

describe('writeVia', () => {
  it('POSITIVE CONTROL: with the function present, only the function runs and its answer comes back', async () => {
    const c = fakeClient({ rpc: { do_it: { data: { id: 'x' }, error: null } } })
    const r = await writeVia(c, 'do_it', { p_a: 1 }, { table: 't', op: 'insert', values: { a: 1 } })
    expect(r).toEqual({ data: { id: 'x' }, error: null, via: 'function' })
    expect(c.calls).toEqual([{ kind: 'rpc', name: 'do_it', args: { p_a: 1 } }])
  })

  it('with the function missing, the direct write runs exactly as the page wrote it', async () => {
    const c = fakeClient({ tables: { events: { data: [{ id: 'e1' }], error: null } } })
    const r = await writeVia(c, 'schedule_delete_event', { p_event: 'e1' },
      { table: 'events', op: 'delete', eq: { id: 'e1' }, select: 'id' })
    expect(r).toEqual({ data: [{ id: 'e1' }], error: null, via: 'direct' })
    expect(c.calls[1]).toEqual({ kind: 'table', chain: [{ table: 'events' }, { delete: [] }, { eq: ['id', 'e1'] }, { select: ['id'] }] })
  })

  it('42883 counts as missing too; any other error is answered and the direct write never runs', async () => {
    const c = fakeClient({ rpc: { a: { data: null, error: { code: '42883' } }, b: { data: null, error: { code: '42501', message: 'no' } } } })
    expect((await writeVia(c, 'a', {}, { table: 't', op: 'delete', eq: { id: 1 } })).via).toBe('direct')
    const r = await writeVia(c, 'b', {}, { table: 't', op: 'delete', eq: { id: 1 } })
    expect(r).toEqual({ data: null, error: { code: '42501', message: 'no' }, via: 'function' })
    expect(c.calls.filter((x) => x.kind === 'table')).toHaveLength(1)
  })

  it('a missing function is asked once per page load, not on every write', async () => {
    const c = fakeClient()
    await writeVia(c, 'gone', {}, { table: 't', op: 'insert', values: {} })
    await writeVia(c, 'gone', {}, { table: 't', op: 'insert', values: {} })
    expect(c.calls.filter((x) => x.kind === 'rpc')).toHaveLength(1)
    expect(c.calls.filter((x) => x.kind === 'table')).toHaveLength(2)
  })

  it('upsert and insert carry their options; filters apply in order; single comes last', async () => {
    const c = fakeClient()
    await runDirect(c, [
      { table: 'event_signups', op: 'upsert', values: { a: 1 }, options: { onConflict: 'event_id,member_id' } },
      { table: 'tasks', op: 'insert', values: { t: 1 }, select: 'id', single: true },
      { table: 'hub_food_needs', op: 'update', values: { starter: false }, in: { id: ['n1', 'n2'] } },
      { table: 'event_signups', op: 'delete', match: { event_id: 'e', member_id: 'm' } },
    ])
    expect(c.calls.map((x) => x.chain)).toEqual([
      [{ table: 'event_signups' }, { upsert: [{ a: 1 }, { onConflict: 'event_id,member_id' }] }],
      [{ table: 'tasks' }, { insert: [{ t: 1 }] }, { select: ['id'] }, { single: [] }],
      [{ table: 'hub_food_needs' }, { update: [{ starter: false }] }, { in: ['id', ['n1', 'n2']] }],
      [{ table: 'event_signups' }, { delete: [] }, { match: [{ event_id: 'e', member_id: 'm' }] }],
    ])
  })

  it('a later step can read an earlier one, a null step is skipped, and result shapes the data', async () => {
    const c = fakeClient({ tables: { tasks: { data: { id: 'T1' }, error: null }, task_required_skills: { data: null, error: null } } })
    const r = await runDirect(c, {
      steps: [
        { table: 'tasks', op: 'insert', values: { title: 'x' }, select: 'id', single: true },
        () => null,
        (ctx) => ({ table: 'task_required_skills', op: 'insert', values: [{ task_id: ctx.results[0].data.id, skill_id: 's' }] }),
      ],
      result: (ctx) => ctx.results[0].data.id,
    })
    expect(r).toEqual({ data: 'T1', error: null, via: 'direct' })
    expect(c.calls[1].chain[1]).toEqual({ insert: [[{ task_id: 'T1', skill_id: 's' }]] })
  })

  it('the first error stops the sequence, unless the step says keepGoing; the first error is answered', async () => {
    const boom = { data: null, error: { code: '42501', message: 'first' } }
    const c = fakeClient({ tables: { a: boom, b: { data: null, error: { code: 'x', message: 'second' } }, c: { data: null, error: null } } })
    const stop = await runDirect(c, [{ table: 'a', op: 'update', values: {} }, { table: 'c', op: 'update', values: {} }])
    expect(stop.error.message).toBe('first')
    expect(c.calls.map((x) => x.chain[0].table)).toEqual(['a'])
    c.calls.length = 0
    const go = await runDirect(c, [{ table: 'a', op: 'update', values: {}, keepGoing: true }, { table: 'b', op: 'update', values: {}, keepGoing: true }, { table: 'c', op: 'update', values: {} }])
    expect(go.error.message).toBe('first')
    expect(c.calls.map((x) => x.chain[0].table)).toEqual(['a', 'b', 'c'])
  })

  it('ignoreError: a failure the page never read is not answered and stops nothing', async () => {
    const c = fakeClient({ tables: { a: { data: null, error: { code: '42501', message: 'ignored' } }, c: { data: 'ok', error: null } } })
    const r = await runDirect(c, [{ table: 'a', op: 'delete', eq: { id: 1 }, ignoreError: true }, { table: 'c', op: 'insert', values: {} }])
    expect(r).toEqual({ data: 'ok', error: null, via: 'direct' })
    expect(c.calls.map((x) => x.chain[0].table)).toEqual(['a', 'c'])
  })
})
