// tools/apply-migration.mjs: which files the Migrate workflow applies, in what
// order, and what it refuses -- without a database. The database half is
// tools/sql-harness/migrate-e2e.mjs (bootstrap, 0027 and 0028 applied for
// real, a second run applying nothing, stop at the first failure).
//
// Every exclusion below is paired with the inclusion it must not swallow: a
// selector that returned [] would pass every "is not selected" assertion on
// its own.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  BASELINE,
  BASELINE_THROUGH,
  bootstrapSql,
  clientConfig,
  managesOwnTransaction,
  redact,
  selectPending,
} from '../tools/apply-migration.mjs'

const MIG = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const onDisk = readdirSync(MIG).map((f) => `supabase/migrations/${f}`)
const versions = (ms) => ms.map((m) => m.version)

describe('selectPending: ordering', () => {
  test('files come back in number order whatever order they are listed in', () => {
    const { all } = selectPending([
      'supabase/migrations/0010_c.sql',
      'supabase/migrations/0002_a.sql',
      'supabase/migrations/0100_d.sql',
      'supabase/migrations/0009_b.sql',
    ])
    expect(versions(all)).toEqual(['0002', '0009', '0010', '0100'])
  })

  test('pending keeps that order and drops only what is recorded', () => {
    const files = ['supabase/migrations/0003_c.sql', 'supabase/migrations/0001_a.sql', 'supabase/migrations/0002_b.sql']
    expect(versions(selectPending(files, ['0002']).pending)).toEqual(['0001', '0003'])
    // positive control: nothing recorded means everything is pending
    expect(versions(selectPending(files, []).pending)).toEqual(['0001', '0002', '0003'])
    // and everything recorded means nothing is
    expect(selectPending(files, ['0001', '0002', '0003']).pending).toEqual([])
  })

  test('two files claiming one number is a refusal, not a guess', () => {
    expect(() => selectPending(['supabase/migrations/0029_a.sql', 'supabase/migrations/0029_b.sql'])).toThrow(/two migrations claim number 0029/)
    // positive control: distinct numbers are fine
    expect(() => selectPending(['supabase/migrations/0029_a.sql', 'supabase/migrations/0030_b.sql'])).not.toThrow()
  })

  test('a pending file numbered below a recorded one is flagged and still applied', () => {
    const r = selectPending(['supabase/migrations/0027_a.sql', 'supabase/migrations/0028_b.sql'], ['0028'])
    expect(versions(r.pending)).toEqual(['0027'])
    expect(versions(r.outOfOrder)).toEqual(['0027'])
    // positive control: in-order pending is not flagged
    expect(selectPending(['supabase/migrations/0029_c.sql'], ['0028']).outOfOrder).toEqual([])
  })
})

describe('selectPending: test files are never applied', () => {
  test('an _rls_test.sql is excluded and its migration is not', () => {
    const { all } = selectPending([
      'supabase/migrations/0027_scouting_match_fields.sql',
      'supabase/migrations/0027_scouting_match_fields_rls_test.sql',
    ])
    expect(all.map((m) => m.file)).toEqual(['supabase/migrations/0027_scouting_match_fields.sql'])
  })

  test('on the real tree: every _rls_test.sql is out, every numbered non-test file is in', () => {
    const { all } = selectPending(onDisk)
    const tests = onDisk.filter((f) => f.endsWith('_rls_test.sql'))
    const migrations = onDisk.filter((f) => /\/\d{4}_[a-z0-9_]+\.sql$/.test(f) && !f.endsWith('_rls_test.sql'))
    expect(tests.length).toBeGreaterThan(20)
    expect(all.filter((m) => m.file.endsWith('_rls_test.sql'))).toEqual([])
    expect(all.map((m) => m.file)).toEqual([...migrations].sort())
    expect(all.length).toBeGreaterThanOrEqual(28)
  })
})

describe('selectPending: frozen files are never applied', () => {
  const frozen = [
    'supabase/feedback.sql',
    'supabase/feedback_rls_test.sql',
    'supabase/push_notifications.sql',
    'sql/forgotten_checkout.sql',
    'platform_migration.sql',
    'platform_foundation.sql',
    'supabase/migrations/archive/0099_nested.sql',
    'docs/feedback/2026-10-01/MARK_DONE.sql',
    'supabase/migrations/README.md',
    'supabase/migrations/0099-not-snake.sql',
  ]
  test('nothing outside supabase/migrations/NNNN_name.sql is selected', () => {
    expect(selectPending(frozen).all).toEqual([])
  })
  test('positive control: the same list plus one real migration selects exactly that one', () => {
    const { all } = selectPending([...frozen, 'supabase/migrations/0029_driver_leaderboard.sql'])
    expect(all).toEqual([{ version: '0029', name: 'driver_leaderboard', file: 'supabase/migrations/0029_driver_leaderboard.sql' }])
  })
  test('the real frozen files on disk are not selected', () => {
    const root = fileURLToPath(new URL('../supabase/', import.meta.url))
    const frozenOnDisk = readdirSync(root).filter((f) => f.endsWith('.sql')).map((f) => `supabase/${f}`)
    expect(frozenOnDisk.length).toBeGreaterThan(50)
    expect(selectPending(frozenOnDisk).all).toEqual([])
  })
})

describe('the baseline: 0001 to 0026, applied by hand, never replayed', () => {
  test('it is exactly 0001..0026, contiguous', () => {
    expect(BASELINE_THROUGH).toBe('0026')
    expect(BASELINE.map(([v]) => v)).toEqual(Array.from({ length: 26 }, (_, i) => String(i + 1).padStart(4, '0')))
  })

  test('every baseline entry names a real file of exactly that name', () => {
    const real = new Map(selectPending(onDisk).all.map((m) => [m.version, m.name]))
    for (const [v, n] of BASELINE) expect(real.get(v), `baseline ${v}`).toBe(n)
  })

  test('on the real tree, with only the baseline recorded, 0027 and 0028 are first in line and nothing at or below 0026 is', () => {
    const { pending } = selectPending(onDisk, BASELINE.map(([v]) => v))
    expect(versions(pending).slice(0, 2)).toEqual(['0027', '0028'])
    expect(pending.every((m) => m.version > '0026')).toBe(true)
    // positive control: with nothing recorded, 0001 would be first
    expect(selectPending(onDisk, []).pending[0].version).toBe('0001')
  })

  test('the bootstrap creates the table idea-app uses and inserts every baseline row, idempotently', () => {
    const sql = bootstrapSql()
    expect(sql).toMatch(/create schema if not exists supabase_migrations/)
    expect(sql).toMatch(/create table if not exists supabase_migrations\.schema_migrations \(\s*version text not null primary key,\s*statements text\[\],\s*name text/)
    expect(sql).toMatch(/on conflict \(version\) do nothing/)
    for (const [v, n] of BASELINE) expect(sql).toContain(`('${v}', '${n}')`)
    expect(sql).not.toContain("('0027'")
    expect(sql).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })
})

describe('managesOwnTransaction', () => {
  test('0002 opens its own transaction; 0026 and 0027 do not', () => {
    const read = (f) => readFileSync(`${MIG}${f}`, 'utf8')
    expect(managesOwnTransaction(read('0002_feedback_console.sql'))).toBe(true)
    expect(managesOwnTransaction(read('0026_battery_log.sql'))).toBe(false)
    expect(managesOwnTransaction(read('0027_scouting_match_fields.sql'))).toBe(false)
  })
  test('a plpgsql begin, or one in a comment or a string, is not a transaction', () => {
    expect(managesOwnTransaction("create function f() returns void language plpgsql as $fn$ begin; end; $fn$;")).toBe(false)
    expect(managesOwnTransaction("do $$ begin perform 1; end $$;")).toBe(false)
    expect(managesOwnTransaction('-- begin;\n/* commit; */ select 1;')).toBe(false)
    expect(managesOwnTransaction("select 'begin;';")).toBe(false)
    // positive controls
    expect(managesOwnTransaction('begin;\ncreate table t (id int);\ncommit;')).toBe(true)
    expect(managesOwnTransaction('create index concurrently i on t (id);')).toBe(true)
  })
})

describe('the connection string is never printed', () => {
  const url = 'postgresql://postgres.abcd:hunter2%21xyz@aws-1-us-west-1.pooler.supabase.com:5432/postgres'
  test('the whole string and its password, encoded or not, are redacted', () => {
    const out = redact(`failed for ${url}; password hunter2!xyz; raw hunter2%21xyz`, url)
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain(url)
    expect(out.match(/\[redacted\]/g)).toHaveLength(3)
  })
  test('positive control: text without the secret is unchanged', () => {
    expect(redact('database "x" does not exist', url)).toBe('database "x" does not exist')
    expect(redact('anything', '')).toBe('anything')
  })
})

describe('clientConfig: TLS is decided here, not by sslmode in the URL', () => {
  test('a Supabase pooler URL gets TLS without chain verification, and sslmode is stripped', () => {
    const c = clientConfig('postgresql://u:p@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require')
    expect(c.ssl).toEqual({ rejectUnauthorized: false })
    expect(c.connectionString).not.toMatch(/sslmode/)
  })
  test('a local socket gets none; sslmode=disable gets none', () => {
    expect(clientConfig('postgresql://postgres@localhost/frc?host=%2Ftmp%2Fx&port=54331').ssl).toBe(false)
    expect(clientConfig('postgresql://u:p@db.example.com:5432/postgres?sslmode=disable').ssl).toBe(false)
  })
})
