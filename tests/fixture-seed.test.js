// Fixture seeds are typed: 0 seed problems in every migration state.
//
// The browser loads core plus every src/dev/fixture/features/*.js through
// plugins.js and seeds them through the engine; /_fixture shows any row a real
// table would refuse (a non-uuid id in a uuid column, an explicit null in a NOT
// NULL column, a value outside an enum CHECK, an unknown column). This drives
// the SAME plugin list through the same engine under node, so a plugin that
// seeds a row Postgres would refuse fails here rather than on a screen nobody
// opens.
//
// The engine can only type the tables in schema.js (the frozen SQL). A table a
// migration creates is untyped there, so the last block reads each numbered
// migration's own CREATE TABLE for its uuid columns and holds the seeded rows
// to them: `id: 'fx-da-1'` in a uuid column is a seed Postgres refuses with
// 22P02, whichever file created the table.
//
// Every "nothing reported" is paired with a planted row that must be reported.

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createEngine, migrationApplied, normMigration, uuid } from '../src/dev/fixture/engine.js'
import { SCHEMA } from '../src/dev/fixture/schema.js'
import { CORE_IDS } from '../src/dev/fixture/seed.js'
import { IDS, PERSONAS, resolvePersona } from '../src/dev/fixture/personas.js'
import core from '../src/dev/fixture/core.js'
import { FEATURES, PLUGINS } from '../src/dev/fixture/plugins.js'

const NOW = new Date('2026-10-01T16:00:00-07:00') // a Thursday afternoon in LA
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Seed exactly as client.js reseed() does: the same ids, the same clock shape.
function seed(plugins, migrations) {
  const store = { db: {} }
  const engine = createEngine({
    schema: SCHEMA,
    plugins,
    store,
    now: () => NOW,
    context: () => ({ user: { id: PERSONAS.student.id }, persona: resolvePersona('student', store.db), migrations }),
  })
  const problems = engine.seedAll({ ids: { ...IDS, ...CORE_IDS }, now: NOW, uuid })
  return { problems, db: store.db }
}

const MIGRATIONS = [...new Set(FEATURES.map((f) => normMigration(f.migration)).filter(Boolean))].sort()
const STATES = ['all', 'none', ...MIGRATIONS.map((m) => [m])]

describe('the plugin list', () => {
  it('is every file in features/, after core, as the browser loads it', () => {
    const files = readdirSync(new URL('../src/dev/fixture/features/', import.meta.url))
      .filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort()
    expect(files.length).toBeGreaterThan(0)
    expect(FEATURES.map((f) => f.name)).toEqual(files)
    expect(PLUGINS[0]).toBe(core)
    expect(PLUGINS.length).toBe(files.length + 1)
    // Each one seeds something: an empty seed would make the clean result below
    // say nothing about that plugin.
    for (const f of FEATURES) {
      if (typeof f.seed !== 'function') continue
      const tables = f.seed({ ids: { ...IDS, ...CORE_IDS }, now: NOW, uuid }) ?? {}
      expect(Object.values(tables).flat().length, `${f.name} seeds no rows`).toBeGreaterThan(0)
    }
  })
})

describe('seed problems', () => {
  for (const state of STATES) {
    const label = Array.isArray(state) ? `mig ${state.join(',')}` : `mig ${state}`
    it(`core + every feature seeds 0 problems under ${label}`, () => {
      const { problems, db } = seed(PLUGINS, state)
      expect(problems).toEqual([])
      expect(db.attendance_events.length).toBeGreaterThan(0)
    })
  }

  it('reports a planted bad row (positive control for every clean result above)', () => {
    const planted = {
      name: 'planted',
      migration: null,
      // One defect per row (a row is judged up to its first refusal, as an
      // INSERT is): a non-uuid id, an explicit null in NOT NULL category, a
      // type the CHECK refuses, and a non-uuid reference in session_reviews.
      seed: ({ ids }) => ({
        attendance_events: [
          { id: 'planted-in', user_id: ids.student, type: 'in', event_time: NOW.toISOString() },
          { user_id: ids.student, type: 'out', event_time: NOW.toISOString(), category: null },
          { user_id: ids.student, type: 'sideways', event_time: NOW.toISOString() },
        ],
        session_reviews: [{ id: uuid(), user_id: ids.student, checkin_id: 'planted-in', checkout_id: uuid(), status: 'pending' }],
      }),
    }
    for (const state of ['all', 'none']) {
      const { problems } = seed([...PLUGINS, planted], state)
      const text = problems.map((p) => p.problem).join('\n')
      expect(text).toMatch(/invalid input syntax for type uuid: "planted-in"/)
      expect(text).toMatch(/null value in column "category" of relation "attendance_events"/)
      expect(text).toMatch(/attendance_events_type_check/)
      expect(problems.filter((p) => p.table === 'session_reviews').map((p) => p.problem)).toContain('invalid input syntax for type uuid: "planted-in"')
    }
  })

  it('judges a value a feature migration makes legal as legal (alters), and the same value without it as a problem', () => {
    // features/c.js: 0002 drops NOT NULL on feedback.category. Its seed has an
    // untyped report; with the alters declaration it is not a problem, and
    // the same plugin with alters removed reports exactly that row.
    const c = FEATURES.find((f) => f.name === 'c')
    expect(c?.alters?.feedback?.category?.nullable).toBe(true)
    const untyped = c.seed({ ids: { ...IDS, ...CORE_IDS }, now: NOW, uuid }).feedback.filter((r) => r.category === null)
    expect(untyped.length).toBeGreaterThan(0)
    const withoutAlters = PLUGINS.map((p) => (p === c ? { ...c, alters: undefined } : p))
    const { problems } = seed(withoutAlters, 'all')
    expect(problems.filter((p) => p.table === 'feedback' && /category/.test(p.problem)).length).toBe(untyped.length)
  })
})

// ── uuid columns of the tables a numbered migration creates ─────────────────

// { table: Set(uuid column) } from every CREATE TABLE in supabase/migrations/
// NNNN_*.sql (never an _rls_test file). Column lines read `name  uuid ...`.
function migrationUuidColumns() {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const out = {}
  for (const f of readdirSync(dir).filter((n) => /^\d{4}_.*\.sql$/.test(n) && !/_rls_test\.sql$/.test(n))) {
    const sql = readFileSync(new URL(f, dir), 'utf8')
    for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const cols = out[m[1]] ?? (out[m[1]] = new Set())
      for (const line of m[2].split('\n')) {
        const col = line.match(/^\s*(\w+)\s+uuid\b/)
        if (col) cols.add(col[1])
      }
    }
  }
  return out
}

function uuidViolations(db, uuidCols) {
  const bad = []
  for (const [table, cols] of Object.entries(uuidCols)) {
    for (const row of db[table] ?? []) {
      for (const c of cols) {
        if (row[c] != null && !UUID.test(String(row[c]))) bad.push(`${table}.${c} = ${JSON.stringify(row[c])}`)
      }
    }
  }
  return bad
}

describe('rows in tables a migration creates', () => {
  const uuidCols = migrationUuidColumns()

  it('finds the uuid columns it checks (so a clean result is not an empty check)', () => {
    expect(uuidCols.discord_announcements?.has('id')).toBe(true)
    expect(uuidCols.discord_announce_roles?.has('id')).toBe(true)
    expect(uuidCols.member_permissions?.has('member_id')).toBe(true)
    // ...and only uuid columns: a text snowflake column is not one.
    expect(uuidCols.discord_announce_roles?.has('role_id')).toBe(false)
  })

  it('every seeded uuid column in those tables holds a uuid', () => {
    const { db } = seed(PLUGINS, 'all')
    const seeded = Object.keys(uuidCols).filter((t) => (db[t] ?? []).length > 0)
    expect(seeded.length).toBeGreaterThan(0)
    expect(uuidViolations(db, uuidCols)).toEqual([])
  })

  it('reports a planted non-uuid id in one of them (positive control)', () => {
    const planted = {
      name: 'planted-feature',
      migration: '0003',
      seed: () => ({ discord_announcements: [{ id: 'fx-da-1', request_id: uuid() }] }),
    }
    const { db } = seed([...PLUGINS, planted], 'all')
    expect(uuidViolations(db, uuidCols)).toEqual(['discord_announcements.id = "fx-da-1"'])
  })

  it('every migration a plugin names is a real file, applied or not by the controls', () => {
    const files = readdirSync(new URL('../supabase/migrations/', import.meta.url))
    for (const m of MIGRATIONS) {
      expect(files.some((f) => f.startsWith(`${m}_`) && !f.endsWith('_rls_test.sql')), `no migration file for ${m}`).toBe(true)
      expect(migrationApplied(m, 'all')).toBe(true)
      expect(migrationApplied(m, 'none')).toBe(false)
    }
  })
})
