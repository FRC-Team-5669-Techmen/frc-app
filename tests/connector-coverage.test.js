// THE REGISTRY COVERS THE APP, AND ITS GENERATED FILE IS CURRENT.
//
//   - api/_lib/connector/registry.generated.js equals a fresh
//     `npm run connector:build` of this tree. Stale means: run the build.
//   - every write the app makes has a tool or a written exclusion of at least
//     twenty characters: every function it calls, every Edge Function it
//     invokes, every api/ route, every direct table write (by file, table and
//     operation, with its count) and every storage write.
//   - there is NO direct table write anywhere under src/ or api/ outside
//     src/writeVia.js (the one fallback helper) and the fixture engine: since
//     ledger 0014 every page write goes through a database function, and a
//     new direct write fails here whatever exclusions.yaml says. A planted
//     write in a copy of the tree is the positive control.
//   - every writeVia call names a function the SQL chain creates, with
//     argument names its signature has (a typo would answer PGRST202, fall
//     back to the direct write forever and never reach Claude).
//   - every hand entry names something that exists, and every reverse an undo
//     names is itself a live entry.
//   - no tool description names a table, and every one is voice sized.
//
// A new `.rpc('name')` or writeVia call gets a generated tool on the next
// build, so this fails only on a stale file (which
// .github/workflows/connector.yml regenerates on every push to main). A new
// direct table write fails here until it is moved into a function.
import { describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildRegistry, readOverlay, renderRegistry, serialize, REGISTRY_PATH } from '../tools/connector/build.mjs'
import { buildInventory, stripComments } from '../tools/connector/inventory.mjs'
import { readChain, chainFiles } from '../tools/connector/sqlchain.mjs'
import { STAFF_GATES, bodyWrites } from '../tools/connector/gates.mjs'
import REGISTRY from '../api/_lib/connector/registry.generated.js'
import { toolList, readRunners } from '../api/_lib/connector/tools.js'

const fresh = buildRegistry()
const ROOT = new URL('..', import.meta.url).pathname

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
  it('NO direct table write anywhere under src/ or api/, outside src/writeVia.js and the fixture engine', () => {
    const found = buildInventory().table_writes.map((w) => `${w.file}:${w.line} ${w.table}.${w.op}`)
    expect(found, 'move each into a database function and call it through writeVia (src/writeVia.js)').toEqual([])
    expect(fresh.table_writes).toEqual([])
    expect(readOverlay().exclusions.table_writes ?? [], 'a direct write cannot be excluded').toEqual([])
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
  it('POSITIVE CONTROL: writes planted in a copy of the tree are found, every shape, and the two exempt places stay exempt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw-plant-'))
    try {
      for (const x of ['src', 'api', 'supabase', 'sql', 'platform_migration.sql']) if (existsSync(join(ROOT, x))) cpSync(join(ROOT, x), join(dir, x), { recursive: true })
      const plant = [
        "async function planted(t) {",
        "  await supabase.from('events').delete().eq('id', 1)",
        "  await supabase.from(t).update({ a: 1 }).eq('id', 2)",
        "  await supabase",
        "    .from('tasks')",
        "    .eq('a', 1)",
        "    .upsert({})",
        "  const q = supabase.from('positions')",
        "  await q.delete()",
        "  await other.insert({})",
        "}",
      ].join('\n')
      const page = join(dir, 'src/SquadPage.jsx')
      writeFileSync(page, readFileSync(page, 'utf8') + '\n' + plant + '\n')
      for (const f of ['src/writeVia.js', 'src/dev/fixture/engine.js']) writeFileSync(join(dir, f), readFileSync(join(dir, f), 'utf8') + '\n' + plant + '\n')
      const found = buildInventory(dir).table_writes
      expect(new Set(found.map((w) => w.file))).toEqual(new Set(['src/SquadPage.jsx']))
      const ops = found.map((w) => `${w.table}.${w.op}`)
      for (const want of ['events.delete', 't.update', 'tasks.upsert', '(builder).delete', '(any).insert']) expect(ops, want).toContain(want)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Every writeVia(client, 'fn', { p_x: ... }) in src/: the function exists in
  // the SQL chain, and the literal argument names are its own, with every
  // argument that has no default given.
  const viaCalls = () => {
    const out = []
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [join(d, e.name)] : []))
    for (const file of walk(join(ROOT, 'src')).filter((f) => !f.includes('/src/dev/'))) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const m of text.matchAll(/writeVia\(\s*[\w$.]+\s*,\s*'([a-z0-9_]+)'\s*,\s*/g)) {
        let i = m.index + m[0].length
        let keys = null
        if (text[i] === '{') {
          let depth = 0; let j = i; const top = []
          let cur = ''
          for (; j < text.length; j += 1) {
            const c = text[j]
            if ('{[('.includes(c)) depth += 1
            if ('}])'.includes(c)) depth -= 1
            if (depth === 1 && c === ',') { top.push(cur); cur = ''; continue }
            if (depth === 0) break
            if (!(depth === 1 && c === '{' && cur === '' && j === i)) cur += c
          }
          top.push(cur)
          keys = top.map((s) => s.trim()).filter(Boolean).map((s) => /^([A-Za-z_$][\w$]*)/.exec(s)?.[1]).filter(Boolean)
        }
        out.push({ file: file.slice(ROOT.length), fn: m[1], keys })
      }
    }
    return out
  }
  it('every writeVia call names a real function with its own argument names', () => {
    const calls = viaCalls()
    expect(calls.length).toBeGreaterThan(60)
    const chain = [...readChain().values()]
    for (const c of calls) {
      const forms = chain.filter((f) => f.name === c.fn)
      expect(forms.length, `${c.file}: ${c.fn} is not created by any SQL file`).toBeGreaterThan(0)
      if (!c.keys) continue
      const ok = forms.some((f) => c.keys.every((k) => f.args.some((a) => a.name === k)) && f.args.every((a) => a.has_default || c.keys.includes(a.name)))
      expect(ok, `${c.file}: ${c.fn}(${c.keys.join(', ')}) does not fit ${forms.map((f) => f.args.map((a) => a.name).join(', ')).join(' | ')}`).toBe(true)
    }
  })
  it('the attendance write (built by src/attendanceRecord.js, not a literal) fits attendance_record too', async () => {
    const { attendanceArgs } = await import('../src/attendanceRecord.js')
    const f = [...readChain().values()].find((x) => x.name === 'attendance_record')
    const keys = Object.keys(attendanceArgs({ type: 'in' }))
    expect(keys.sort()).toEqual(f.args.map((a) => a.name).sort())
  })
  it('create_event offers exactly the schedule page event kinds', () => {
    const page = readFileSync(join(ROOT, 'src/SchedulePage.jsx'), 'utf8')
    const kinds = JSON.parse(/const KINDS = (\[[^\]]*\])/.exec(page)[1].replace(/'/g, '"'))
    expect(REGISTRY.tools.create_event.args.kind.enum).toEqual(kinds)
  })
  it('POSITIVE CONTROL: the argument check catches a misspelt argument and a missing one', () => {
    const chain = [...readChain().values()]
    const f = chain.find((x) => x.name === 'staff_delete_job')
    const fits = (keys) => keys.every((k) => f.args.some((a) => a.name === k)) && f.args.every((a) => a.has_default || keys.includes(a.name))
    expect(fits(['p_task'])).toBe(true)
    expect(fits(['p_taks'])).toBe(false)
    expect(fits([])).toBe(false)
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
  // Every table any SQL file creates (the page writes that used to name them are gone).
  const TABLES = new Set(chainFiles().flatMap((f) => [...readFileSync(join(ROOT, f), 'utf8').matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase())).concat(['profiles', 'attendance_events']))  // the two the Supabase project started with
  it('POSITIVE CONTROL: the table list is the schema', () => {
    for (const t of ['logged_hours', 'event_signups', 'hub_food_needs', 'connector_audit']) expect(TABLES.has(t), t).toBe(true)
  })
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
