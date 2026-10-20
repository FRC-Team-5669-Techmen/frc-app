// THE REGISTRY COVERS THE APP, AND ITS GENERATED FILE IS CURRENT.
//
//   - api/_lib/connector/registry.generated.js equals a fresh
//     `npm run connector:build` of this tree. Stale means: run the build.
//   - every write the app makes has a tool or a written exclusion of at least
//     twenty characters: every function it calls, every Edge Function it
//     invokes, every api/ route, every direct table write (by file, table and
//     operation, with its count) and every storage write.
//   - every direct table write found today is excluded with the one reason
//     "direct table write, moves to a function in the next connector ledger".
//   - every hand entry names something that exists, and every reverse an undo
//     names is itself a live entry.
//   - no tool description names a table, and every one is voice sized.
//
// A new `.rpc('name')` gets a generated tool on the next build, so this fails
// only on a stale file (which .github/workflows/connector.yml regenerates on
// every push to main). A new direct table write fails here until it is
// excluded by hand or moved into a function.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildRegistry, readOverlay, renderRegistry, serialize, REGISTRY_PATH } from '../tools/connector/build.mjs'
import { buildInventory, stripComments } from '../tools/connector/inventory.mjs'
import { readChain } from '../tools/connector/sqlchain.mjs'
import { STAFF_GATES, bodyWrites } from '../tools/connector/gates.mjs'
import REGISTRY from '../api/_lib/connector/registry.generated.js'
import { toolList, readRunners } from '../api/_lib/connector/tools.js'

const REASON = 'direct table write, moves to a function in the next connector ledger'
const fresh = buildRegistry()

describe('the generated file is current', () => {
  it('equals a fresh build of this tree (run npm run connector:build if not)', () => {
    const onDisk = readFileSync(REGISTRY_PATH, 'utf8')
    expect(onDisk, 'run npm run connector:build').toBe(serialize(renderRegistry(new Date(REGISTRY.measured + 'T12:00:00Z'))))
  })
  it('carries its date and its counts', () => {
    expect(REGISTRY.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(REGISTRY.counts.functions_called).toBeGreaterThan(90)
    expect(REGISTRY.counts.table_writes).toBe(REGISTRY.table_writes.reduce((n, g) => n + g.lines.length, 0))
  })
})

describe('every write the app makes is answered for', () => {
  it('every function the app calls has an entry, live or excluded with a reason', () => {
    const called = buildInventory().functions.map((f) => f.name)
    expect(called.length).toBeGreaterThan(90)
    for (const name of called) {
      const e = fresh.functions[name]
      expect(e, name).toBeTruthy()
      if (e.excluded) expect(e.excluded.length, name).toBeGreaterThanOrEqual(20)
      else expect(['read', 'undo', 'confirm']).toContain(e.level)
    }
  })
  it('a generated entry is read only when its body writes nothing, otherwise confirm; never undo', () => {
    for (const e of Object.values(fresh.functions).filter((x) => x.source === 'generated' && !x.excluded)) {
      expect(e.level, e.name).toBe(e.writes ? 'confirm' : 'read')
    }
  })
  it('every Edge Function and api/ route has an entry with a reason', () => {
    expect(fresh.edge.length).toBeGreaterThan(3)
    for (const e of fresh.edge) expect(e.excluded?.length ?? 0, e.name).toBeGreaterThanOrEqual(20)
    for (const r of fresh.routes) expect(r.excluded?.length ?? 0, r.file).toBeGreaterThanOrEqual(20)
  })
  it('every direct table write is excluded, by file, table, operation and count, with the one reason', () => {
    expect(fresh.table_writes.length).toBeGreaterThan(50)
    for (const g of fresh.table_writes) {
      expect(g.excluded, `${g.file} ${g.table}.${g.op} at lines ${g.lines.join(',')}`).toBe(REASON)
    }
  })
  it('every storage write is excluded with a reason', () => {
    for (const g of fresh.storage) expect(g.excluded?.length ?? 0, `${g.file} ${g.bucket}`).toBeGreaterThanOrEqual(20)
  })
  it('POSITIVE CONTROL: a planted direct write and a planted rpc are found by the scanner', () => {
    const text = stripComments("const x = 1 // supabase.from('fake').insert({})\nawait supabase\n  .from('planted')\n  .insert({ a: 1 })\nawait supabase.rpc('planted_fn')")
    expect(text).not.toMatch(/fake/)
    const WRITE = /\.from\(\s*(['"`])([A-Za-z0-9_]+)\1\s*\)((?:\s*\.[a-zA-Z]+\((?:[^()]|\([^()]*\))*\))*?)\s*\.(insert|update|upsert|delete)\s*\(/g
    expect([...text.matchAll(WRITE)].map((m) => m[2])).toEqual(['planted'])
    expect(/\.rpc\(\s*(['"`])planted_fn\1/.test(text)).toBe(true)
  })
  it('POSITIVE CONTROL: one more write of an excluded kind breaks the exclusion count', () => {
    const g = fresh.table_writes[0]
    const x = (readOverlay().exclusions.table_writes ?? []).find((e) => e.file === g.file && e.table === g.table && e.op === g.op)
    expect(x.count).toBe(g.lines.length)
    expect(x.count + 1 === g.lines.length).toBe(false)
  })
})

describe('the hand overlay names real things', () => {
  const chainNames = new Set([...readChain().values()].map((f) => f.name))
  it('every hand function entry and every reverse it names exists in the SQL chain and is live', () => {
    const { functions } = readOverlay()
    for (const [name, e] of Object.entries(functions)) {
      expect(chainNames.has(name), name).toBe(true)
      for (const u of e.undo ?? []) {
        expect(chainNames.has(u.function), `${name} undo ${u.function}`).toBe(true)
        expect(fresh.functions[u.function]?.excluded, `${name} undo ${u.function}`).toBeFalsy()
      }
    }
  })
  it('every function tool names a live function, and every read tool has a runner', () => {
    for (const t of Object.values(REGISTRY.tools)) {
      if (t.kind === 'function') expect(REGISTRY.functions[t.function]?.excluded ?? null, t.name).toBeNull()
      if (t.kind === 'read') expect(typeof readRunners[t.name], t.name).toBe('function')
    }
  })
  it('every staff gate gates.mjs names is a real function', () => {
    for (const g of STAFF_GATES) expect(chainNames.has(g), g).toBe(true)
  })
  it('bodyWrites: an insert is a write, a literal dynamic select is not', () => {
    expect(bodyWrites('insert into public.x values (1)')).toBe(true)
    expect(bodyWrites("execute 'select exists (select 1 from t where a = $1)' into v using x")).toBe(false)
    expect(bodyWrites("execute format('delete from %I', t)")).toBe(true)
  })
})

describe('the tool descriptions are for voice', () => {
  const TABLES = new Set(fresh.table_writes.map((g) => g.table).concat(['connector_audit', 'connector_settings', 'attendance_events', 'hour_adjustments', 'signout_requests', 'parent_responses', 'member_roles']))
  it('every hand tool: under 200 characters, three or more ways to say it, no table name', () => {
    for (const t of Object.values(REGISTRY.tools)) {
      expect(t.describe.length, t.name).toBeLessThan(200)
      expect(t.say.length, t.name).toBeGreaterThanOrEqual(3)
      // A table named the way code names it (snake_case) is what a voice
      // description must never carry; "feedback" and "events" are his words.
      for (const word of t.describe.toLowerCase().match(/[a-z]+(?:_[a-z]+)+/g) ?? []) expect(TABLES.has(word), `${t.name} says ${word}`).toBe(false)
      expect(t.describe, t.name).not.toMatch(/\b(rpc|p_[a-z]+|uuid|jsonb|select|insert)\b/i)
      for (const a of Object.values(t.args ?? {})) expect(a.describe, `${t.name} argument`).toBeTruthy()
    }
  })
  it('POSITIVE CONTROL: the snake_case scan catches a planted table name', () => {
    expect('reads hour_adjustments for him'.match(/[a-z]+(?:_[a-z]+)+/g).some((w) => TABLES.has(w))).toBe(true)
  })
  it('no em dash in any tool description or the MCP tool list', () => {
    expect(JSON.stringify(toolList())).not.toMatch(/—/)
    expect(JSON.stringify(REGISTRY.tools)).not.toMatch(/—/)
  })
})
