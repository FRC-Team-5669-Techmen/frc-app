// The IDEA certifications contract has three copies of the same field names,
// and nothing else keeps them in step:
//
//   supabase/migrations/0001_idea_certifications_mirror.sql   the tables and
//       the key lists idea_cert_sync() validates against (c_cat_keys,
//       c_hold_keys, c_statuses)
//   docs/IDEA_CERTIFICATIONS_SYNC.md   the contract the IDEA side is built
//       against: two field tables and a worked example
//   src/ideaCerts.js   the page's select lists and CERT_STATUSES
//
// A field renamed in one and not the others is the failure this file exists
// to catch: the IDEA side would send a key the function refuses, or the page
// would select a column that does not exist (42703, which the page reads as
// "not set up yet" and would show the calm line forever).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CERT_STATUSES, CATALOG_SELECT, HOLDER_SELECT, SYNC_LOG_SELECT,
  ownCertifications, holderCounts,
} from '../src/ideaCerts.js'
import fixture from '../src/dev/fixture/features/a.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const SQL = read('../supabase/migrations/0001_idea_certifications_mirror.sql')
const DOC = read('../docs/IDEA_CERTIFICATIONS_SYNC.md')

// Strip -- comments so a column named in prose cannot be mistaken for one.
const SQL_CODE = SQL.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')

function sqlArray(name) {
  const m = SQL_CODE.match(new RegExp(`${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`))
  if (!m) return null
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

function tableColumns(table) {
  const m = SQL_CODE.match(new RegExp(`create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`))
  if (!m) return null
  return m[1].split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.split(/\s+/)[0])
}

function docTableKeys(heading) {
  const start = DOC.indexOf(heading)
  if (start < 0) return null
  const rest = DOC.slice(start + heading.length)
  const end = rest.search(/\n#{2,3} /)
  const section = end < 0 ? rest : rest.slice(0, end)
  return [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map(m => m[1])
}

function workedExample() {
  const blocks = [...DOC.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1])
  const ex = blocks.filter(b => b.includes('"catalog"'))
  return ex.length === 1 ? JSON.parse(ex[0]) : null
}

const split = (s) => s.split(',').map(x => x.trim())
const sorted = (a) => [...a].sort()

// The comparison every check below goes through, so its own negative control
// (further down) covers all of them.
function sameSet(a, b) {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
}

const CAT_KEYS = sqlArray('c_cat_keys')
const HOLD_KEYS = sqlArray('c_hold_keys')
const STATUSES = sqlArray('c_statuses')
const CAT_COLS = tableColumns('idea_cert_catalog')
const HOLD_COLS = tableColumns('idea_cert_holders')
const LOG_COLS = tableColumns('idea_cert_sync_log')
const EXAMPLE = workedExample()

describe('the parsers found something (so no check below passes vacuously)', () => {
  it('reads the SQL key lists, columns, the doc tables and the example', () => {
    expect(CAT_KEYS).toHaveLength(11)
    expect(HOLD_KEYS).toHaveLength(8)
    expect(STATUSES).toHaveLength(4)
    expect(CAT_COLS).toHaveLength(12)
    expect(HOLD_COLS).toHaveLength(9)
    expect(LOG_COLS).toHaveLength(7)
    expect(docTableKeys('### A catalog entry')).toHaveLength(11)
    expect(docTableKeys('### A holder row')).toHaveLength(8)
    expect(EXAMPLE).not.toBeNull()
    expect(EXAMPLE.catalog.length).toBeGreaterThan(0)
    expect(EXAMPLE.holders.length).toBeGreaterThan(0)
  })
})

describe('SQL: what the function validates is what the tables store', () => {
  it('catalog keys are the catalog columns minus synced_at', () => {
    expect(sameSet(CAT_KEYS, CAT_COLS.filter(c => c !== 'synced_at'))).toBe(true)
  })
  it('holder keys are the holder columns minus synced_at', () => {
    expect(sameSet(HOLD_KEYS, HOLD_COLS.filter(c => c !== 'synced_at'))).toBe(true)
  })
  it('the status list in the function matches the table CHECK and the client', () => {
    const check = SQL_CODE.match(/status\s+text\s+not null check \(status in \(([^)]*)\)\)/)
    expect(check).not.toBeNull()
    const checkList = [...check[1].matchAll(/'([^']+)'/g)].map(x => x[1])
    expect(STATUSES).toEqual(checkList)
    expect(STATUSES).toEqual([...CERT_STATUSES])
  })
})

describe('the doc names exactly the keys the function validates', () => {
  it('the field tables', () => {
    expect(sameSet(docTableKeys('### A catalog entry'), CAT_KEYS)).toBe(true)
    expect(sameSet(docTableKeys('### A holder row'), HOLD_KEYS)).toBe(true)
  })

  it('the worked example: top level, every catalog entry, every holder', () => {
    expect(sameSet(Object.keys(EXAMPLE), ['source_revision', 'catalog', 'holders'])).toBe(true)
    for (const c of EXAMPLE.catalog) expect(sameSet(Object.keys(c), CAT_KEYS)).toBe(true)
    for (const h of EXAMPLE.holders) expect(sameSet(Object.keys(h), HOLD_KEYS)).toBe(true)
  })

  it('the worked example obeys the rules the function enforces', () => {
    const codes = EXAMPLE.catalog.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    const serials = EXAMPLE.holders.map(h => h.serial)
    expect(new Set(serials).size).toBe(serials.length)
    for (const c of EXAMPLE.catalog) for (const p of c.prerequisites) expect(codes).toContain(p)
    for (const h of EXAMPLE.holders) {
      expect(codes).toContain(h.code)
      expect(h.email).toBe(h.email.toLowerCase())
      expect(CERT_STATUSES).toContain(h.status)
      expect(h.awarded_at).toMatch(/(Z|[+-]\d{2}:?\d{2})$/)
    }
  })

  it('the doc names the RPC and the anon-key call, and carries no project ref', () => {
    expect(DOC).toContain('/rest/v1/rpc/idea_cert_sync')
    expect(DOC).toContain('"p_secret"')
    expect(DOC).toContain('"p_snapshot"')
    expect(SQL_CODE).toMatch(/function public\.idea_cert_sync\(p_secret text, p_snapshot jsonb\)/)
    expect(DOC).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/)
  })
})

describe('the page selects only columns that exist', () => {
  it('catalog, holders and the sync log', () => {
    for (const c of split(CATALOG_SELECT)) expect(CAT_COLS).toContain(c)
    for (const c of split(HOLDER_SELECT)) expect(HOLD_COLS).toContain(c)
    for (const c of split(SYNC_LOG_SELECT)) expect(LOG_COLS).toContain(c)
  })
})

// The fixture plugin (src/dev/fixture/features/a.js) is the third consumer of
// these column names: the browser pass drives the real page against it, so a
// fixture row with a column the table lacks would test a page production
// never sees. Its derived numbers are also the browser test's expectations.
describe('the fixture plugin matches the migration', () => {
  const NOW_FX = Date.parse('2026-10-01T19:00:00Z')
  const seed = fixture.seed({ ids: {}, now: NOW_FX })

  it('declares migration 0001 and exactly the objects it creates', () => {
    expect(fixture.migration).toBe('0001')
    const created = [...SQL_CODE.matchAll(/create table if not exists public\.([a-z_]+)/g)].map(m => m[1])
    expect(sameSet(fixture.creates.tables, created)).toBe(true)
    expect(fixture.creates.rpcs).toEqual(['idea_cert_sync'])
  })

  it('every seeded row has exactly its table\'s columns', () => {
    expect(seed.idea_cert_catalog.length).toBeGreaterThan(0)
    expect(seed.idea_cert_holders.length).toBeGreaterThan(0)
    expect(seed.idea_cert_sync_log.length).toBeGreaterThan(0)
    for (const r of seed.idea_cert_catalog) expect(sameSet(Object.keys(r), CAT_COLS)).toBe(true)
    for (const r of seed.idea_cert_holders) expect(sameSet(Object.keys(r), HOLD_COLS)).toBe(true)
    for (const r of seed.idea_cert_sync_log) expect(sameSet(Object.keys(r), LOG_COLS)).toBe(true)
  })

  it('the seeded holders obey what idea_cert_sync would enforce', () => {
    const codes = seed.idea_cert_catalog.map(c => c.code)
    for (const h of seed.idea_cert_holders) {
      expect(codes).toContain(h.code)
      expect(CERT_STATUSES).toContain(h.status)
      expect(h.email).toBe(h.email.toLowerCase())
    }
    const serials = seed.idea_cert_holders.map(h => h.serial)
    expect(new Set(serials).size).toBe(serials.length)
  })

  it('the numbers the browser test expects', () => {
    const student = seed.idea_cert_holders.find(h => h.serial === 'IDEA-FX-0001').email
    const mine = ownCertifications(seed.idea_cert_holders, student, NOW_FX)
    expect(mine).toHaveLength(4)
    expect(mine.filter(r => r.held)).toHaveLength(2)
    expect(mine.find(r => r.serial === 'IDEA-FX-0004').effective).toBe('expired')
    const counts = holderCounts(seed.idea_cert_holders, NOW_FX)
    expect(Object.fromEntries(['SAFE-1', 'SAFE-2', 'MECH-1', 'MILL-2', 'WELD-3', 'ELEC-1']
      .map(c => [c, counts.get(c) ?? 0])))
      .toEqual({ 'SAFE-1': 3, 'SAFE-2': 0, 'MECH-1': 1, 'MILL-2': 1, 'WELD-3': 1, 'ELEC-1': 0 })
  })

  it('a parent-only persona sees only the linked student\'s rows; staff and members see all', () => {
    const rows = seed.idea_cert_holders
    const see = (persona) => rows.filter(row => fixture.visible.idea_cert_holders({ table: 'idea_cert_holders', row, persona }))
    const parentRows = see({ key: 'parent', roles: ['parent'], isStaff: false })
    expect(parentRows.map(r => r.serial).sort()).toEqual(['IDEA-FX-0001', 'IDEA-FX-0002', 'IDEA-FX-0003', 'IDEA-FX-0004'])
    // Positive controls: the same filter lets everyone else read every row,
    // and a parent who is also staff is staff.
    expect(see({ key: 'student', roles: ['student'], isStaff: false })).toHaveLength(rows.length)
    expect(see({ key: 'mentor', roles: ['mentor'], isStaff: true })).toHaveLength(rows.length)
    expect(see({ key: 'parent', roles: ['parent', 'mentor'], isStaff: true })).toHaveLength(rows.length)
  })

  it('the sync log is staff-only and the key table is never visible', () => {
    const log = seed.idea_cert_sync_log[0]
    expect(fixture.visible.idea_cert_sync_log({ row: log, persona: { isStaff: true } })).toBe(true)
    expect(fixture.visible.idea_cert_sync_log({ row: log, persona: { isStaff: false } })).toBe(false)
    expect(fixture.visible.idea_cert_sync_key({ row: {}, persona: { isStaff: true } })).toBe(false)
  })

  it('holder emails follow the engine\'s persona emails when it passes them', () => {
    const s = fixture.seed({ now: NOW_FX, emails: { student: 'Persona.Student@Fixture.Test' } })
    expect(s.idea_cert_holders.find(h => h.serial === 'IDEA-FX-0001').email).toBe('persona.student@fixture.test')
  })
})

describe('negative control: the comparison catches a drifted key', () => {
  it('one renamed, one dropped and one added key are each detected', () => {
    const renamed = CAT_KEYS.map(k => (k === 'does_not_allow' ? 'doesNotAllow' : k))
    const dropped = HOLD_KEYS.filter(k => k !== 'expires_at')
    const added = [...HOLD_KEYS, 'member_id']
    expect(sameSet(renamed, CAT_KEYS)).toBe(false)
    expect(sameSet(dropped, HOLD_KEYS)).toBe(false)
    expect(sameSet(added, HOLD_KEYS)).toBe(false)
    // And a select naming a column the table does not have is caught.
    expect(CAT_COLS).not.toContain('description')
  })
})
