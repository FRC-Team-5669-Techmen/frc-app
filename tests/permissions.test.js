// src/permissions.js is the client's MIRROR of the rules
// supabase/migrations/0004_member_permissions.sql enforces in RLS. Two kinds of
// test live here:
//
//   1. The rules themselves (who may create, who may edit which event), each
//      driven BOTH ways on the same fixture -- a "may not" assertion alone is
//      satisfied by a function that returns false for everybody.
//   2. Drift between the mirror and the migration: the capability vocabulary
//      and the shape of the three holder policies are read out of the SQL file,
//      so editing one side without the other fails here instead of in front of
//      a student whose form the server then refuses.
//
// WHAT THIS CANNOT SEE: the live database. It reads the migration FILE; whether
// that file has been pasted into the SQL editor is the apply path's problem
// (supabase/migrations/README.md). The RLS boundary itself is proved by
// 0004_member_permissions_rls_test.sql, run by hand.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CAP_EVENTS_CREATE, CAPABILITIES, STAFF_ROLES,
  rolesFrom, isStaffRoles, capabilityLabel, hasCapability,
  canCreateEvents, canSetMandatory, canEditEvent, editableSeriesEvents,
  silentlyRefused, eventWriteMessage, grantsByMember,
  loadMyCapabilities, loadAllGrants, setCapability,
} from '../src/permissions.js'

const MIGRATION = readFileSync(
  new URL('../supabase/migrations/0004_member_permissions.sql', import.meta.url), 'utf8')

const HOLDER = 'hhhhhhhh-0000-0000-0000-000000000001'
const OTHER  = 'oooooooo-0000-0000-0000-000000000002'
const STAFF  = 'ssssssss-0000-0000-0000-000000000003'

const ev = (over = {}) => ({ id: 'e1', created_by: HOLDER, mandatory: false, series_id: null, ...over })

describe('who may create events', () => {
  it('staff may, with no grant at all, for every staff role', () => {
    for (const r of STAFF_ROLES) expect(canCreateEvents([r], [])).toBe(true)
  })

  it('a student may only while holding events.create -- same student, both ways', () => {
    expect(canCreateEvents(['student'], [CAP_EVENTS_CREATE])).toBe(true)
    expect(canCreateEvents(['student'], [])).toBe(false)
    expect(canCreateEvents(['student'], undefined)).toBe(false)
  })

  it('reads a Set as well as an array, and ignores other capabilities', () => {
    expect(canCreateEvents(['student'], new Set([CAP_EVENTS_CREATE]))).toBe(true)
    expect(canCreateEvents(['student'], new Set(['jobs.close']))).toBe(false)
    expect(hasCapability(['student'], [CAP_EVENTS_CREATE], 'jobs.close')).toBe(false)
    expect(hasCapability(['mentor'], [], 'jobs.close')).toBe(true)
  })

  it('a parent is not staff; a grant is what an admin chose, so it counts', () => {
    expect(isStaffRoles(['parent'])).toBe(false)
    expect(canCreateEvents(['parent'], [])).toBe(false)
    expect(canCreateEvents(['parent'], [CAP_EVENTS_CREATE])).toBe(true)
  })

  it('mandatory stays staff-only, holder or not', () => {
    expect(canSetMandatory(['student'])).toBe(false)
    expect(canSetMandatory(['lead'])).toBe(true)
  })
})

describe('who may edit or delete an event', () => {
  it('staff may edit any event, anyone\'s, mandatory or not', () => {
    for (const e of [ev(), ev({ created_by: OTHER }), ev({ mandatory: true }), ev({ created_by: null })]) {
      expect(canEditEvent(e, { id: STAFF }, ['mentor'], [])).toBe(true)
    }
  })

  it('a holder may edit their own non-mandatory event -- and not once revoked', () => {
    expect(canEditEvent(ev(), { id: HOLDER }, ['student'], [CAP_EVENTS_CREATE])).toBe(true)
    expect(canEditEvent(ev(), { id: HOLDER }, ['student'], [])).toBe(false)
  })

  it('a holder may NOT edit someone else\'s event, the same holder who may edit their own', () => {
    const caps = [CAP_EVENTS_CREATE]
    expect(canEditEvent(ev({ created_by: HOLDER }), { id: HOLDER }, ['student'], caps)).toBe(true)
    expect(canEditEvent(ev({ created_by: OTHER }), { id: HOLDER }, ['student'], caps)).toBe(false)
    expect(canEditEvent(ev({ created_by: null }), { id: HOLDER }, ['student'], caps)).toBe(false)
  })

  it('a holder may NOT edit their own event once staff marked it mandatory', () => {
    const caps = [CAP_EVENTS_CREATE]
    expect(canEditEvent(ev({ mandatory: false }), { id: HOLDER }, ['student'], caps)).toBe(true)
    expect(canEditEvent(ev({ mandatory: true }), { id: HOLDER }, ['student'], caps)).toBe(false)
  })

  it('accepts a bare id for the user, and refuses with no user or no event', () => {
    expect(canEditEvent(ev(), HOLDER, ['student'], [CAP_EVENTS_CREATE])).toBe(true)
    expect(canEditEvent(ev(), null, ['student'], [CAP_EVENTS_CREATE])).toBe(false)
    expect(canEditEvent(null, { id: HOLDER }, ['student'], [CAP_EVENTS_CREATE])).toBe(false)
  })

  it('in a mixed series a holder can change only their own rows; staff the whole series', () => {
    const series = [
      ev({ id: 'a', series_id: 'S' }),
      ev({ id: 'b', series_id: 'S', created_by: OTHER }),
      ev({ id: 'c', series_id: 'S' }),
      ev({ id: 'd', series_id: 'T' }),
    ]
    const holderIds = editableSeriesEvents(series, 'S', { id: HOLDER }, ['student'], [CAP_EVENTS_CREATE]).map(e => e.id)
    const staffIds  = editableSeriesEvents(series, 'S', { id: STAFF }, ['admin'], []).map(e => e.id)
    expect(holderIds).toEqual(['a', 'c'])
    expect(staffIds).toEqual(['a', 'b', 'c'])
    expect(editableSeriesEvents(series, null, { id: STAFF }, ['admin'], [])).toEqual([])
  })
})

describe('small helpers', () => {
  it('rolesFrom turns the hasRole function into the role list', () => {
    expect(rolesFrom(r => r === 'student' || r === 'parent')).toEqual(['student', 'parent'])
    expect(rolesFrom(() => false)).toEqual([])
    expect(rolesFrom(undefined)).toEqual([])
  })

  it('silentlyRefused is true only for an empty row list with no error', () => {
    expect(silentlyRefused({ data: [], error: null })).toBe(true)
    expect(silentlyRefused({ data: [{ id: 'e1' }], error: null })).toBe(false)
    expect(silentlyRefused({ data: null, error: null })).toBe(false)
    expect(silentlyRefused({ data: [], error: { code: '42501' } })).toBe(false)
  })

  it('eventWriteMessage turns a 42501 into words and passes anything else through', () => {
    expect(eventWriteMessage({ code: '42501', message: 'new row violates row-level security policy' }))
      .toMatch(/do not have permission/)
    expect(eventWriteMessage({ code: '23514', message: 'violates check constraint' })).toBe('violates check constraint')
    expect(eventWriteMessage(null)).toBe('')
  })

  it('grantsByMember groups, dedupes and sorts; empty in, empty out', () => {
    expect(grantsByMember([
      { member_id: 'm1', capability: 'z.b' },
      { member_id: 'm1', capability: CAP_EVENTS_CREATE },
      { member_id: 'm1', capability: CAP_EVENTS_CREATE },
      { member_id: 'm2', capability: CAP_EVENTS_CREATE },
      { member_id: null, capability: CAP_EVENTS_CREATE },
    ])).toEqual({ m1: [CAP_EVENTS_CREATE, 'z.b'], m2: [CAP_EVENTS_CREATE] })
    expect(grantsByMember([])).toEqual({})
  })

  it('capabilityLabel knows events.create and echoes an unknown key', () => {
    expect(capabilityLabel(CAP_EVENTS_CREATE)).toBe('Can add calendar events')
    expect(capabilityLabel('nope.nope')).toBe('nope.nope')
  })
})

// A fake of the slice of the Supabase client these loaders touch. It records
// what was asked so the tests can see the query shape, not only the answer.
function fakeClient({ rows = [], error = null, rpcError = null, throws = false } = {}) {
  const calls = []
  const query = {
    select(cols) { calls.push(['select', cols]); return query },
    eq(col, val) { calls.push(['eq', col, val]); return query },
    then(resolve, reject) {
      if (throws) return Promise.reject(new Error('network down')).then(resolve, reject)
      return Promise.resolve(error ? { data: null, error } : { data: rows, error: null }).then(resolve, reject)
    },
  }
  return {
    calls,
    from(table) { calls.push(['from', table]); return query },
    async rpc(fn, args) {
      calls.push(['rpc', fn, args])
      if (throws) throw new Error('network down')
      return { data: null, error: rpcError }
    },
  }
}

describe('loadMyCapabilities (the schedule\'s lookup)', () => {
  it('loads the caller\'s own grants, filtered by their id', async () => {
    const c = fakeClient({ rows: [{ capability: CAP_EVENTS_CREATE }, { capability: CAP_EVENTS_CREATE }] })
    const r = await loadMyCapabilities(c, HOLDER)
    expect(r).toEqual({ capabilities: [CAP_EVENTS_CREATE], state: 'ok', error: null })
    expect(c.calls).toContainEqual(['from', 'member_permissions'])
    expect(c.calls).toContainEqual(['eq', 'member_id', HOLDER])
  })

  // The pre-migration state, paired with the loaded one above: the SAME
  // function that returns a capability when the table answers returns none,
  // with state 'missing', when the table is not there.
  it('0004 not applied (PGRST205 / 42P01): no capabilities, state missing, no throw', async () => {
    for (const code of ['PGRST205', '42P01']) {
      const r = await loadMyCapabilities(fakeClient({ error: { code, message: 'x' } }), HOLDER)
      expect(r.capabilities).toEqual([])
      expect(r.state).toBe('missing')
    }
  })

  it('any other failure: no capabilities, state error (fail closed), never missing', async () => {
    const r = await loadMyCapabilities(fakeClient({ error: { code: '42501', message: 'denied' } }), HOLDER)
    expect(r).toMatchObject({ capabilities: [], state: 'error' })
    const t = await loadMyCapabilities(fakeClient({ throws: true }), HOLDER)
    expect(t).toMatchObject({ capabilities: [], state: 'error' })
  })

  it('no member id asks nothing', async () => {
    const c = fakeClient({ rows: [{ capability: CAP_EVENTS_CREATE }] })
    expect((await loadMyCapabilities(c, null)).capabilities).toEqual([])
    expect(c.calls).toEqual([])
  })
})

describe('loadAllGrants and setCapability (the roster)', () => {
  it('groups every grant by member; missing table is state missing', async () => {
    const ok = await loadAllGrants(fakeClient({ rows: [{ member_id: HOLDER, capability: CAP_EVENTS_CREATE }] }))
    expect(ok).toEqual({ byMember: { [HOLDER]: [CAP_EVENTS_CREATE] }, state: 'ok', error: null })
    const missing = await loadAllGrants(fakeClient({ error: { code: 'PGRST205' } }))
    expect(missing).toMatchObject({ byMember: {}, state: 'missing' })
    const other = await loadAllGrants(fakeClient({ error: { code: '500' } }))
    expect(other.state).toBe('error')
  })

  it('grant and revoke call the matching admin RPC with the member and the key', async () => {
    const g = fakeClient()
    expect(await setCapability(g, HOLDER, CAP_EVENTS_CREATE, true)).toEqual({ ok: true, state: 'ok', error: null })
    expect(g.calls).toEqual([['rpc', 'admin_grant_capability', { p_member: HOLDER, p_capability: CAP_EVENTS_CREATE }]])
    const r = fakeClient()
    await setCapability(r, HOLDER, CAP_EVENTS_CREATE, false)
    expect(r.calls[0][1]).toBe('admin_revoke_capability')
  })

  it('classifies a refusal: missing function, not an admin, anything else', async () => {
    expect((await setCapability(fakeClient({ rpcError: { code: 'PGRST202' } }), HOLDER, CAP_EVENTS_CREATE, true)).state).toBe('missing')
    expect((await setCapability(fakeClient({ rpcError: { code: '42501' } }), HOLDER, CAP_EVENTS_CREATE, true)).state).toBe('denied')
    expect((await setCapability(fakeClient({ rpcError: { code: '22023' } }), HOLDER, CAP_EVENTS_CREATE, true)).state).toBe('error')
    expect((await setCapability(fakeClient({ throws: true }), HOLDER, CAP_EVENTS_CREATE, true)).state).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Drift: the mirror against the migration file.

// The (key, label) pairs inserted into public.capabilities.
function seededCapabilities(sql) {
  const m = sql.match(/insert into public\.capabilities \(key, label, description\) values([\s\S]*?)on conflict/i)
  if (!m) return null
  return [...m[1].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'/g)].map(x => ({ key: x[1], label: x[2] }))
}

// Every "create policy ... on public.events" the migration makes: name, command, body.
function eventPolicies(sql) {
  return [...sql.matchAll(/create policy "([^"]+)"\s+on public\.events for (\w+) to authenticated([\s\S]*?);/gi)]
    .map(x => ({ name: x[1], cmd: x[2].toLowerCase(), body: x[3] }))
}

describe('drift: src/permissions.js against 0004_member_permissions.sql', () => {
  it('the parsers find what is there (positive control) and notice a doctored copy', () => {
    const seeded = seededCapabilities(MIGRATION)
    expect(seeded?.length).toBeGreaterThan(0)
    const doctored = MIGRATION.replace("'Can add calendar events'", "'Can add events'")
    expect(seededCapabilities(doctored)).not.toEqual(seeded)
    expect(eventPolicies(MIGRATION).length).toBe(3)
  })

  it('every capability seeded in SQL is in CAPABILITIES with the same label, and vice versa', () => {
    const seeded = seededCapabilities(MIGRATION)
    const mirror = CAPABILITIES.map(c => ({ key: c.key, label: c.label }))
    expect(mirror).toEqual(seeded)
  })

  it('the three holder policies pin the rules canEditEvent mirrors', () => {
    const byCmd = Object.fromEntries(eventPolicies(MIGRATION).map(p => [p.cmd, p]))
    expect(Object.keys(byCmd).sort()).toEqual(['delete', 'insert', 'update'])
    for (const p of Object.values(byCmd)) {
      expect(p.body).toContain(`public.has_capability('${CAP_EVENTS_CREATE}')`)
      expect(p.body).toContain('created_by = auth.uid()')
      expect(p.body).toContain('mandatory = false')
    }
    // ...and the staff policy is NOT re-created (or dropped) by this file.
    expect(MIGRATION).not.toMatch(/(drop|create) policy (if exists )?"events writable by staff"/i)
  })

  // The two rules the client does not mirror (it never sends a foreign
  // series_id, and an unapproved account never reaches the app shell) are
  // still pinned here, so deleting one from the migration fails a test.
  it('insert and update keep a holder\'s event out of a series somebody else\'s events are in; delete needs no such clause', () => {
    const byCmd = Object.fromEntries(eventPolicies(MIGRATION).map(p => [p.cmd, p]))
    expect(byCmd.insert.body).toContain('public.events_series_is_own(series_id)')
    expect(byCmd.update.body.split(/with check/i)[1]).toContain('public.events_series_is_own(series_id)')
    expect(byCmd.delete.body).not.toContain('events_series_is_own')
    // Positive control: the parser notices the clause removed from a copy.
    const doctored = MIGRATION.replace(/\n\s*and public\.events_series_is_own\(series_id\)/g, '')
    for (const p of eventPolicies(doctored)) expect(p.body).not.toContain('events_series_is_own')
  })

  it('has_capability() grants a holder only while their profile is approved, and leaves the staff path alone', () => {
    const fn = (sql) => sql.match(/create or replace function public\.has_capability\(p_capability text\)[\s\S]*?\$fn\$([\s\S]*?)\$fn\$/i)?.[1] ?? null
    const body = fn(MIGRATION)
    expect(body).not.toBeNull()
    expect(body).toMatch(/join public\.profiles p on p\.id = mp\.member_id/)
    expect(body).toMatch(/and p\.approved\b/)
    expect(body).toMatch(/select public\.is_staff\(\)\s+or exists/)
    // Positive control: a copy without the approval clause is noticed.
    expect(fn(MIGRATION.replace(/\s+and p\.approved\)/, ')'))).not.toMatch(/and p\.approved\b/)
  })
})
