import { describe, it, expect } from 'vitest'
import {
  CERT_STATUSES, NOT_SYNCED_LINE,
  normEmail, effectiveStatus, isHeld, statusLabel, viewModeFor,
  resolvePageState, groupCatalog, holderCounts, holdersFor,
  ownCertifications, groupByHolder, syncSummary, fmtDate, fmtDateTime,
  readAllPages, pageOf, PAGE_ROWS,
} from '../src/ideaCerts.js'

// The fixed instant every test evaluates at: 2026-10-01 12:00 in Los Angeles.
const NOW = Date.parse('2026-10-01T19:00:00Z')

const cert = (code, category, sort_order, level = 1, extra = {}) => ({
  code, name: `${code} name`, level, category, sort_order,
  definition: null, allows: null, does_not_allow: null, prerequisites: [], renewal: null, active: true,
  ...extra,
})

const holder = (serial, email, code, status, extra = {}) => ({
  serial, email, holder_name: extra.holder_name ?? email.split('@')[0], code, status,
  awarded_at: '2026-09-01T17:00:00Z', awarded_by_name: 'Test Mentor', expires_at: null,
  ...extra,
})

const CATALOG = [
  cert('WELD-2', 'Mechanical', 3, 2),
  cert('SAFE-1', 'Safety', 1, 1),
  cert('MECH-1', 'Mechanical', 2, 1),
  cert('SAFE-2', 'Safety', 4, 2),
]

describe('effectiveStatus / isHeld: only active, unexpired rows are held', () => {
  it('active with no expiry is held', () => {
    const h = holder('S1', 'a@x.test', 'SAFE-1', 'active')
    expect(effectiveStatus(h, NOW)).toBe('active')
    expect(isHeld(h, NOW)).toBe(true)
  })

  it('suspended, revoked and expired are shown as such and never held', () => {
    for (const s of ['suspended', 'revoked', 'expired']) {
      const h = holder('S1', 'a@x.test', 'SAFE-1', s)
      expect(effectiveStatus(h, NOW)).toBe(s)
      expect(isHeld(h, NOW)).toBe(false)
    }
  })

  it('an active row past its expiry reads expired before IDEA resyncs it', () => {
    const lapsed = holder('S1', 'a@x.test', 'SAFE-1', 'active', { expires_at: '2026-09-30T00:00:00Z' })
    expect(effectiveStatus(lapsed, NOW)).toBe('expired')
    expect(isHeld(lapsed, NOW)).toBe(false)
    // Positive control: the same row with a future expiry is held, so the
    // expiry comparison is what decided it, not something else about the row.
    const current = { ...lapsed, expires_at: '2027-09-30T00:00:00Z' }
    expect(effectiveStatus(current, NOW)).toBe('active')
    expect(isHeld(current, NOW)).toBe(true)
  })

  it('expiry is inclusive: expiring exactly now is no longer held', () => {
    const edge = holder('S1', 'a@x.test', 'SAFE-1', 'active', { expires_at: new Date(NOW).toISOString() })
    expect(isHeld(edge, NOW)).toBe(false)
    expect(isHeld(edge, NOW - 1)).toBe(true)
  })

  it('an unknown status is not held and labels as Unknown', () => {
    const h = holder('S1', 'a@x.test', 'SAFE-1', 'pending')
    expect(effectiveStatus(h, NOW)).toBe('unknown')
    expect(isHeld(h, NOW)).toBe(false)
    expect(statusLabel('unknown')).toBe('Unknown')
  })

  it('labels every legal status', () => {
    expect(CERT_STATUSES.map(statusLabel)).toEqual(['Active', 'Suspended', 'Revoked', 'Expired'])
  })
})

describe('resolvePageState', () => {
  it('a missing table (migration not applied) is not_set_up, by code', () => {
    expect(resolvePageState({ catalogError: { code: 'PGRST205' } })).toBe('not_set_up')
    expect(resolvePageState({ catalogError: { code: '42P01' } })).toBe('not_set_up')
    expect(resolvePageState({ catalog: CATALOG, holdersError: { code: 'PGRST205' } })).toBe('not_set_up')
  })

  it('a real failure is an error, never hidden behind the calm line', () => {
    expect(resolvePageState({ catalogError: { code: '42501', message: 'permission denied' } })).toBe('error')
    expect(resolvePageState({ catalog: CATALOG, holdersError: { code: '08006' } })).toBe('error')
    // The message is never read: a reworded "does not exist" with a
    // permission code is still an error.
    expect(resolvePageState({ catalogError: { code: '42501', message: 'relation does not exist' } })).toBe('error')
  })

  it('applied but empty is not_synced; with rows it is ready', () => {
    expect(resolvePageState({ catalog: [] })).toBe('not_synced')
    expect(resolvePageState({})).toBe('not_synced')
    // Positive control: the same call with a catalog is ready.
    expect(resolvePageState({ catalog: CATALOG })).toBe('ready')
    // A catalog with nobody holding anything is synced, not empty.
    expect(resolvePageState({ catalog: CATALOG, holdersError: null })).toBe('ready')
  })

  it('the not-synced line names IDEA Classroom', () => {
    expect(NOT_SYNCED_LINE).toMatch(/IDEA Classroom/)
    expect(NOT_SYNCED_LINE).toMatch(/synced/)
  })
})

describe('viewModeFor: the app-wide parent rule', () => {
  it('parent-only is the parent view; parent who is staff is staff', () => {
    expect(viewModeFor({ isParent: true })).toBe('parent')
    expect(viewModeFor({ isParent: true, isStaff: true })).toBe('staff')
    expect(viewModeFor({ isStaff: true })).toBe('staff')
    expect(viewModeFor({})).toBe('member')
  })
})

describe('groupCatalog', () => {
  it('groups by category, ordered by IDEA sort_order top to bottom', () => {
    const groups = groupCatalog(CATALOG)
    expect(groups.map(g => g.category)).toEqual(['Safety', 'Mechanical'])
    expect(groups[0].certs.map(c => c.code)).toEqual(['SAFE-1', 'SAFE-2'])
    expect(groups[1].certs.map(c => c.code)).toEqual(['MECH-1', 'WELD-2'])
  })

  it('every certification lands in exactly one group, none dropped', () => {
    const groups = groupCatalog(CATALOG)
    expect(groups.flatMap(g => g.certs).map(c => c.code).sort()).toEqual(CATALOG.map(c => c.code).sort())
    expect(groupCatalog([])).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = [...CATALOG]
    groupCatalog(input)
    expect(input.map(c => c.code)).toEqual(CATALOG.map(c => c.code))
  })
})

describe('holderCounts: counts only people who hold it', () => {
  const HOLDERS = [
    holder('S1', 'ann@x.test', 'SAFE-1', 'active'),
    holder('S2', 'bob@x.test', 'SAFE-1', 'active'),
    holder('S3', 'cat@x.test', 'SAFE-1', 'suspended'),
    holder('S4', 'dee@x.test', 'SAFE-1', 'revoked'),
    holder('S5', 'eve@x.test', 'SAFE-1', 'expired'),
    holder('S6', 'fay@x.test', 'SAFE-1', 'active', { expires_at: '2026-01-01T00:00:00Z' }),
    // Re-awarded: two active serials for one person count once.
    holder('S7', 'ann@x.test', 'SAFE-1', 'active'),
    holder('S8', 'gus@x.test', 'MECH-1', 'revoked'),
  ]

  it('active, unexpired, distinct people only', () => {
    const counts = holderCounts(HOLDERS, NOW)
    expect(counts.get('SAFE-1')).toBe(2)
  })

  it('a certification nobody holds has no count, and the same rows made active do count', () => {
    expect(holderCounts(HOLDERS, NOW).get('MECH-1')).toBeUndefined()
    // Positive control: flip every row active and unexpired.
    const allActive = HOLDERS.map(h => ({ ...h, status: 'active', expires_at: null }))
    const counts = holderCounts(allActive, NOW)
    expect(counts.get('SAFE-1')).toBe(6)
    expect(counts.get('MECH-1')).toBe(1)
  })
})

describe('holdersFor', () => {
  it('lists every row for the code, held first, statuses shown', () => {
    const rows = holdersFor('SAFE-1', [
      holder('S1', 'zed@x.test', 'SAFE-1', 'revoked', { holder_name: 'Zed' }),
      holder('S2', 'amy@x.test', 'SAFE-1', 'active', { holder_name: 'Amy' }),
      holder('S3', 'bea@x.test', 'SAFE-1', 'suspended', { holder_name: 'Bea' }),
      holder('S4', 'cal@x.test', 'MECH-1', 'active', { holder_name: 'Cal' }),
    ], NOW)
    expect(rows.map(r => [r.serial, r.effective, r.held])).toEqual([
      ['S2', 'active', true],
      ['S3', 'suspended', false],
      ['S1', 'revoked', false],
    ])
  })
})

describe('ownCertifications: matched by lowercased email only', () => {
  const HOLDERS = [
    holder('S1', 'sam.student@boscotech.edu', 'SAFE-1', 'active'),
    holder('S2', 'sam.student@boscotech.edu', 'MECH-1', 'revoked'),
    holder('S3', 'other.student@boscotech.edu', 'SAFE-1', 'active'),
  ]

  it('a mixed-case session email still matches the lowercased mirror', () => {
    const mine = ownCertifications(HOLDERS, '  Sam.Student@BoscoTech.edu ', NOW)
    expect(mine.map(r => r.serial)).toEqual(['S1', 'S2'])
    expect(mine.map(r => r.held)).toEqual([true, false])
  })

  it('never returns someone else\'s rows, and nothing for no email', () => {
    expect(ownCertifications(HOLDERS, 'nobody@boscotech.edu', NOW)).toEqual([])
    expect(ownCertifications(HOLDERS, '', NOW)).toEqual([])
    expect(ownCertifications(HOLDERS, undefined, NOW)).toEqual([])
    // Positive control: the other student's own email finds exactly theirs.
    expect(ownCertifications(HOLDERS, 'other.student@boscotech.edu', NOW).map(r => r.serial)).toEqual(['S3'])
  })

  it('normEmail lowercases and trims, and is safe on non-strings', () => {
    expect(normEmail(' A@B.Test ')).toBe('a@b.test')
    expect(normEmail(null)).toBe('')
    expect(normEmail(42)).toBe('')
  })
})

describe('groupByHolder (the parent view)', () => {
  it('one block per person, with held count excluding non-active rows', () => {
    const groups = groupByHolder([
      holder('S1', 'kid@boscotech.edu', 'SAFE-1', 'active', { holder_name: 'Kid One' }),
      holder('S2', 'kid@boscotech.edu', 'MECH-1', 'expired', { holder_name: 'Kid One' }),
      holder('S3', 'Kid@BoscoTech.edu', 'WELD-2', 'active', { holder_name: 'Kid One', expires_at: '2026-02-01T00:00:00Z' }),
    ], NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].heldCount).toBe(1)
    expect(groups[0].rows.map(r => [r.code, r.effective])).toEqual([
      ['SAFE-1', 'active'], ['MECH-1', 'expired'], ['WELD-2', 'expired'],
    ])
  })

  it('no rows, no blocks', () => {
    expect(groupByHolder([], NOW)).toEqual([])
  })
})

describe('syncSummary', () => {
  it('names the last accepted sync and flags a refused latest attempt', () => {
    const s = syncSummary([
      { id: 1, received_at: '2026-09-30T10:00:00Z', ok: true },
      { id: 3, received_at: '2026-09-30T12:00:00Z', ok: false, error: '1 problem(s): x' },
      { id: 2, received_at: '2026-09-30T11:00:00Z', ok: true },
    ])
    expect(s.lastOk.id).toBe(2)
    expect(s.lastAttempt.id).toBe(3)
    expect(s.failing).toBe(true)
  })

  it('not failing when the latest attempt was accepted; empty log is neither', () => {
    const s = syncSummary([
      { id: 1, received_at: '2026-09-30T10:00:00Z', ok: false },
      { id: 2, received_at: '2026-09-30T11:00:00Z', ok: true },
    ])
    expect(s.failing).toBe(false)
    expect(s.lastOk.id).toBe(2)
    expect(syncSummary([])).toEqual({ lastOk: null, lastAttempt: null, failing: false })
  })
})

describe('dates render in America/Los_Angeles', () => {
  it('an instant just after midnight UTC is still the previous day in LA', () => {
    expect(fmtDate('2026-10-01T03:00:00Z')).toBe('Sep 30, 2026')
    expect(fmtDate('2026-10-01T19:00:00Z')).toBe('Oct 1, 2026')
    expect(fmtDateTime('2026-10-01T19:00:00Z')).toMatch(/Oct 1, 2026.*12:00\s?PM/)
  })

  it('missing or bad input renders nothing rather than "Invalid Date"', () => {
    expect(fmtDate(null)).toBe('')
    expect(fmtDate('not a date')).toBe('')
    expect(fmtDateTime(undefined)).toBe('')
  })
})

// A stand-in for one supabase-js table that ENFORCES PostgREST's row cap: any
// one response holds at most `cap` rows, and the truncation comes back with no
// error, exactly as the real server answers. It records the shape of every
// request so a test can see which builder calls went out.
function cappedTable(rows, { cap = 1000, failOnRequest = null } = {}) {
  const requests = []
  const query = () => {
    const q = { orderBy: null, offset: 0, limit: null, ops: [] }
    const b = {
      order(col) { q.orderBy = col; q.ops.push('order'); return b },
      limit(n) { q.limit = n; q.ops.push('limit'); return b },
      range(from, to) { q.offset = from; q.limit = to - from + 1; q.ops.push('range'); return b },
      then(resolve, reject) {
        requests.push({ ...q, ops: [...q.ops] })
        if (failOnRequest === requests.length) {
          return Promise.resolve({ data: null, error: { code: '08006', message: 'connection lost' } }).then(resolve, reject)
        }
        let out = [...rows]
        if (q.orderBy) out.sort((a, z) => (a[q.orderBy] < z[q.orderBy] ? -1 : a[q.orderBy] > z[q.orderBy] ? 1 : 0))
        out = out.slice(q.offset).slice(0, Math.min(q.limit ?? Infinity, cap))
        return Promise.resolve({ data: out, error: null }).then(resolve, reject)
      },
    }
    return b
  }
  return { query, requests }
}

const pad = (n) => String(n).padStart(5, '0')
// 2,345 holder rows; the member we look for sorts PAST the first 1000.
const MANY = Array.from({ length: 2345 }, (_, i) =>
  holder(`IDEA-${pad(i + 1)}`, `student${i % 800}@boscotech.edu`, i % 2 ? 'SAFE-1' : 'MECH-1', 'active'))
const LATE = holder('IDEA-90000', 'late.student@boscotech.edu', 'WELD-2', 'active')
const ROWS = [...MANY, LATE]

const readPaged = (table) =>
  readAllPages((from, size) => pageOf(table.query().order('serial'), from, size), 'serial')

describe('readAllPages: a mirror longer than one response is read whole', () => {
  it('positive control: the unpaged read really is truncated at 1000 with no error', async () => {
    const t = cappedTable(ROWS)
    const { data, error } = await t.query().order('serial')
    expect(error).toBeNull()
    expect(data).toHaveLength(1000)
    expect(ownCertifications(data, 'late.student@boscotech.edu', NOW)).toEqual([])
  })

  it('the paged read returns every row exactly once, and a late row is found', async () => {
    const t = cappedTable(ROWS)
    const { data, error } = await readPaged(t)
    expect(error).toBeNull()
    expect(data).toHaveLength(ROWS.length)
    expect(new Set(data.map(r => r.serial)).size).toBe(ROWS.length)
    expect(ownCertifications(data, 'late.student@boscotech.edu', NOW).map(r => r.serial)).toEqual(['IDEA-90000'])
    expect(holderCounts(data, NOW).get('WELD-2')).toBe(1)
    // Three requests: the first a plain limit, the later ones a range.
    expect(t.requests.map(r => r.ops.at(-1))).toEqual(['limit', 'range', 'range'])
    expect(t.requests.map(r => r.offset)).toEqual([0, PAGE_ROWS, 2 * PAGE_ROWS])
  })

  it('a table that fits in one page is asked for once, with .order().limit() only', async () => {
    const t = cappedTable(MANY.slice(0, 10))
    const { data } = await readPaged(t)
    expect(data).toHaveLength(10)
    expect(t.requests).toHaveLength(1)
    expect(t.requests[0].ops).toEqual(['order', 'limit'])
  })

  it('a failed later page fails the whole read rather than returning a partial list', async () => {
    const failing = await readPaged(cappedTable(ROWS, { failOnRequest: 2 }))
    expect(failing.data).toBeNull()
    expect(failing.error.code).toBe('08006')
    // Positive control: the same table without the failure reads whole.
    const fine = await readPaged(cappedTable(ROWS))
    expect(fine.error).toBeNull()
    expect(fine.data).toHaveLength(ROWS.length)
  })

  it('a row repeated across a page boundary (a sync landed mid-read) is kept once', async () => {
    const pages = [MANY.slice(0, 3), MANY.slice(2, 5)]
    let i = 0
    const { data } = await readAllPages(async () => ({ data: pages[i++] ?? [], error: null }), 'serial', { pageRows: 3 })
    expect(data.map(r => r.serial)).toEqual(MANY.slice(0, 5).map(r => r.serial))
  })

  it('an endless source stops at the page bound with an error, never a partial list', async () => {
    const endless = async (from, size) => ({ data: MANY.slice(0, size).map((r, k) => ({ ...r, serial: `X-${from + k}` })), error: null })
    const { data, error } = await readAllPages(endless, 'serial', { pageRows: 5, maxPages: 3 })
    expect(data).toBeNull()
    expect(error.code).toBe('TOO_MANY_PAGES')
    // Positive control: the same source with room for its rows ends normally
    // once a page comes back short.
    let calls = 0
    const finite = async (from, size) => ({ data: calls++ < 2 ? MANY.slice(from, from + size) : MANY.slice(from, from + 2), error: null })
    const ok = await readAllPages(finite, 'serial', { pageRows: 5, maxPages: 3 })
    expect(ok.error).toBeNull()
    expect(ok.data).toHaveLength(12)
  })
})
