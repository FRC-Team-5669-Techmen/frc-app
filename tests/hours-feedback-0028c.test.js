// Ledger 0028c, two feedback reports from Mr. Pina:
//  - c4f9a940, /verify-hours "Approve all" (src/loggedHoursBulk.js, migration
//    0040): the confirmation states the count and the hours of exactly the
//    entries shown, and the result counts only the rows the database answers
//    as approved, naming every entry it did not approve.
//  - 37b5feee, /signouts and /display show which hours an open session counts
//    (src/categories.js sessionKind, src/presence.js computePresenceDetail).
// Each claim is driven both ways on the same fixture (CLAUDE.md, Verification
// standard).
import { beforeEach, describe, expect, it } from 'vitest'
import { summarizeEntries, approveAllLoggedHours, bulkResultText, fmtHoursNumber } from '../src/loggedHoursBulk.js'
import { _resetWriteVia } from '../src/writeVia.js'
import { sessionKind } from '../src/categories.js'
import { computePresence, computePresenceDetail } from '../src/presence.js'

function fakeClient({ rpc = {}, tables = {} } = {}) {
  const calls = []
  return {
    calls,
    rpc(name, args) {
      calls.push({ kind: 'rpc', name, args })
      const a = rpc[name]
      if (a === undefined) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } })
      return Promise.resolve(typeof a === 'function' ? a(args) : a)
    },
    from(table) {
      const chain = [{ table }]
      const q = {}
      for (const m of ['insert', 'update', 'upsert', 'delete', 'eq', 'in', 'match', 'select', 'single']) {
        q[m] = (...args) => { chain.push({ [m]: args }); return q }
      }
      q.then = (ok, bad) => {
        calls.push({ kind: 'table', chain })
        const t = tables[table]
        return Promise.resolve((typeof t === 'function' ? t(chain) : t) ?? { data: null, error: null }).then(ok, bad)
      }
      return q
    },
  }
}

const E = (id, hours, who) => ({ id, hours, member: { nickname: who } })
const SHOWN = [E('a', 2, 'Sam'), E('b', '1.50', 'Sam'), E('c', 4, 'Riley')]
const nameOf = (e) => e.member.nickname

beforeEach(() => _resetWriteVia())

describe('Approve all: the confirmation', () => {
  it('states the count and the hours of the entries shown', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => E(`e${i}`, i < 6 ? 2.5 : 2.75, 'x'))
    expect(summarizeEntries(twelve).question).toBe('Approve 12 entries, 31.5 hours?')
    expect(summarizeEntries(SHOWN)).toMatchObject({ count: 3, hours: 7.5, ids: ['a', 'b', 'c'], question: 'Approve 3 entries, 7.5 hours?' })
  })
  it('singular forms, and numeric strings from PostgREST are summed as numbers', () => {
    expect(summarizeEntries([E('a', '1.00', 'x')]).question).toBe('Approve 1 entry, 1 hour?')
    expect(fmtHoursNumber('31.50')).toBe('31.5')
    expect(fmtHoursNumber(0.1 + 0.2)).toBe('0.3')
  })
})

describe('Approve all: what is reported approved', () => {
  it('POSITIVE CONTROL: all three answered, all three counted, one call carrying every id', async () => {
    const c = fakeClient({ rpc: { staff_approve_logged_hours: ({ p_entries }) => ({ data: p_entries.map((id) => ({ id, hours: SHOWN.find((e) => e.id === id).hours })), error: null }) } })
    const r = await approveAllLoggedHours(c, ['a', 'b', 'c'], 'me')
    expect([r.approvedIds.size, r.approvedHours, r.error]).toEqual([3, 7.5, null])
    expect(c.calls).toEqual([{ kind: 'rpc', name: 'staff_approve_logged_hours', args: { p_entries: ['a', 'b', 'c'] } }])
    expect(bulkResultText(SHOWN, r, nameOf)).toEqual({ ok: true, text: 'Approved 3 entries, 7.5 hours.' })
  })

  it('two of three answered: 2 counted (not the 3 asked), and the third is named', async () => {
    const c = fakeClient({ rpc: { staff_approve_logged_hours: { data: [{ id: 'a', hours: 2 }, { id: 'c', hours: 4 }], error: null } } })
    const r = await approveAllLoggedHours(c, ['a', 'b', 'c'], 'me')
    expect([r.approvedIds.size, r.approvedHours]).toEqual([2, 6])
    expect(bulkResultText(SHOWN, r, nameOf)).toEqual({ ok: false, text: 'Approved 2 entries, 6 hours. 1 not approved: Sam 1.5h.' })
  })

  it('a row the page did not ask for is never counted (1 against the 2 answered)', async () => {
    const c = fakeClient({ rpc: { staff_approve_logged_hours: { data: [{ id: 'a', hours: 2 }, { id: 'zz', hours: 9 }], error: null } } })
    const r = await approveAllLoggedHours(c, ['a', 'b'], 'me')
    expect([r.approvedIds.size, r.approvedHours, r.approvedIds.has('zz')]).toEqual([1, 2, false])
  })

  it('a failed call reports nothing approved and says so; the same entries succeed on a working call', async () => {
    const bad = fakeClient({ rpc: { staff_approve_logged_hours: { data: null, error: { code: '42501', message: 'Only staff can approve hours' } } } })
    const r = await approveAllLoggedHours(bad, ['a', 'b', 'c'], 'me')
    expect([r.approvedIds.size, r.approvedHours]).toEqual([0, 0])
    const t = bulkResultText(SHOWN, r, nameOf)
    expect(t).toEqual({ ok: false, text: 'Not approved (42501): Only staff can approve hours. Nothing changed.' })
    expect(t.text).not.toMatch(/Approved \d/)
    const good = fakeClient({ rpc: { staff_approve_logged_hours: { data: [{ id: 'a', hours: 2 }, { id: 'b', hours: 1.5 }, { id: 'c', hours: 4 }], error: null } } })
    expect(bulkResultText(SHOWN, await approveAllLoggedHours(good, ['a', 'b', 'c'], 'me'), nameOf).text).toMatch(/^Approved 3 entries/)
  })

  it('before 0040: one direct UPDATE of still-pending listed rows, counted from what it RETURNS', async () => {
    const now = new Date('2026-10-28T20:00:00Z')
    const c = fakeClient({ tables: { logged_hours: { data: [{ id: 'b', hours: '1.50' }], error: null } } })
    const r = await approveAllLoggedHours(c, ['a', 'b', 'a'], 'me', now)
    const direct = c.calls.filter((x) => x.kind === 'table')
    expect(direct).toHaveLength(1)
    expect(direct[0].chain).toEqual([
      { table: 'logged_hours' },
      { update: [{ status: 'verified', verified_by: 'me', verified_at: now.toISOString() }] },
      { eq: ['status', 'pending'] },
      { in: ['id', ['a', 'b']] },
      { select: ['id, hours'] },
    ])
    expect([r.approvedIds.size, r.approvedHours, r.approvedIds.has('a')]).toEqual([1, 1.5, false])
  })

  it('an empty list makes no call at all (0 calls, against 1 for a list of one)', async () => {
    const c = fakeClient({ rpc: { staff_approve_logged_hours: { data: [{ id: 'a', hours: 2 }], error: null } } })
    expect((await approveAllLoggedHours(c, [], 'me')).approvedIds.size).toBe(0)
    expect(c.calls).toHaveLength(0)
    expect((await approveAllLoggedHours(c, ['a'], 'me')).approvedIds.size).toBe(1)
    expect(c.calls).toHaveLength(1)
  })
})

describe('which hours an open session counts', () => {
  it('build reads FRC, volunteer reads FLL volunteer, legacy rows read FRC', () => {
    expect(sessionKind('build').label).toBe('FRC')
    expect(sessionKind('volunteer').label).toBe('FLL volunteer')
    expect([sessionKind(null).label, sessionKind('normal').label, sessionKind(undefined).key]).toEqual(['FRC', 'FRC', 'build'])
    expect([sessionKind('outreach').label, sessionKind('competition').label]).toEqual(['Outreach', 'Competition'])
    expect(sessionKind('volunteer').color).toBe('var(--hr-volunteer)')
  })

  const NOW = Date.parse('2026-10-01T23:00:00Z') // 4:00 PM in Los Angeles
  const at = (minAgo) => new Date(NOW - minAgo * 60_000).toISOString()
  const EVENTS = [
    { user_id: 'frc', type: 'in', event_time: at(60), category: 'build' },
    { user_id: 'fll', type: 'in', event_time: at(45), category: 'volunteer' },
    { user_id: 'gone', type: 'in', event_time: at(120), category: 'volunteer' },
    { user_id: 'gone', type: 'out', event_time: at(30), category: null },
    // switch_to_fll (0014): the build session closed, the FLL one opened 1 ms later.
    { user_id: 'switched', type: 'in', event_time: at(90), category: 'build' },
    { user_id: 'switched', type: 'out', event_time: at(20), category: null },
    { user_id: 'switched', type: 'in', event_time: new Date(Date.parse(at(20)) + 1).toISOString(), category: 'volunteer' },
  ]

  it('each signed-in member carries the kind of the IN that opened the session; a signed-out member carries none', () => {
    const d = computePresenceDetail(EVENTS, NOW)
    expect([...d.keys()].sort()).toEqual(['fll', 'frc', 'switched'])
    expect(d.has('gone')).toBe(false)
    expect(Object.fromEntries([...d].map(([k, v]) => [k, v.kind.label]))).toEqual({ frc: 'FRC', fll: 'FLL volunteer', switched: 'FLL volunteer' })
    expect(d.get('frc').since).toBe(at(60))
    expect(d.get('switched').since).toBe(new Date(Date.parse(at(20)) + 1).toISOString())
  })

  it('the kind follows the data: flipping the FLL IN to build flips its label (and back)', () => {
    const flipped = EVENTS.map((e) => (e.user_id === 'fll' ? { ...e, category: 'build' } : e))
    expect(computePresenceDetail(flipped, NOW).get('fll').kind.label).toBe('FRC')
    expect(computePresenceDetail(EVENTS, NOW).get('fll').kind.label).toBe('FLL volunteer')
  })

  it('computePresence keeps its old shape for the callers that only need the time', () => {
    const p = computePresence(EVENTS, NOW)
    expect(p).toEqual(new Map([['frc', at(60)], ['fll', at(45)], ['switched', new Date(Date.parse(at(20)) + 1).toISOString()]]))
  })
})
