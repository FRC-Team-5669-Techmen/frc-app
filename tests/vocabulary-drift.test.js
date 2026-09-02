// THE VOCABULARY DRIFT GUARD.
//
// Three vocabularies in this repo are stated in more than one place, and in all
// three the second place is SQL that is applied BY HAND. When they disagree the
// failure is not a red build: it is a member picking a value the form offers and
// the database rejecting the insert, in front of them, mid-application. That is
// the silent-regression shape a test is for.
//
//   1. `src/subteams.js` SUBTEAMS  vs  the two `..._subteam_values_chk`
//      CHECK constraints. CLAUDE.md: "Widening the vocabulary means widening
//      BOTH CHECKs in one pass" -- and the two earlier migration files were
//      extended to match so re-running one cannot silently revert the addition,
//      which means there are now FOUR executable copies to keep in step.
//   2. `src/categories.js` CATEGORIES  vs  the `attendance_events.category`
//      CHECK, reduced from six values to four by
//      `supabase/categories_reduce_event_kind.sql`.
//   3. The event-kind list, which CLAUDE.md records as duplicated across four
//      sites "with nothing enforcing agreement". This is that enforcement for
//      the two that are machine-readable from here.
//
// WHAT THIS CANNOT SEE, stated so the green tick is not read as more than it is:
// it reads the repo's SQL FILES, not the live database. A file that was never
// pasted into the SQL editor is invisible to it. That gap is the apply path
// itself (see `supabase/migrations/README.md`), not something a test can close.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { SUBTEAMS, isSubteam } from '../src/subteams.js'
import { CATEGORIES, normAttendanceCategory, loggedTypeToCategory } from '../src/categories.js'

const SQL_DIR = fileURLToPath(new URL('../supabase/', import.meta.url))
const sql = (f) => readFileSync(join(SQL_DIR, f), 'utf8')
const sqlFiles = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'))

/**
 * Every quoted string inside the `check (...)` body of a named constraint, for
 * each EXECUTABLE occurrence of it (a commented-out block is skipped -- those
 * are the "here is what this replaced" notes several of these files carry).
 */
function checkValueSets(source, constraintName) {
  const sets = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(`add constraint ${constraintName}`)) continue
    if (lines[i].trimStart().startsWith('--')) continue // documentation, not SQL
    // Read forward to the statement's terminating semicolon at depth 0.
    let depth = 0
    let body = ''
    let started = false
    for (let j = i; j < lines.length; j += 1) {
      const line = lines[j]
      if (line.trimStart().startsWith('--')) continue
      body += line + '\n'
      for (const ch of line) {
        if (ch === '(') { depth += 1; started = true }
        else if (ch === ')') depth -= 1
      }
      if (started && depth === 0 && line.includes(';')) break
    }
    sets.push(new Set([...body.matchAll(/'([^']+)'/g)].map((m) => m[1])))
  }
  return sets
}

describe('subteam vocabulary: the client list and every CHECK agree', () => {
  const FILES = ['member_applications.sql', 'subteams_vocabulary.sql', 'subteams_tasks_constraint.sql', 'subteams_add_strategy_management.sql']
  const NAMES = ['member_applications_subteam_values_chk', 'tasks_subteam_values_chk']

  test('the client list is the 12 canonical values, in order', () => {
    expect(SUBTEAMS).toEqual([
      'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication', 'Media',
      'Business/Outreach', 'Drive Team', 'Robot Construction', 'Field & Pit',
      'Strategy and Scouting', 'Management',
    ])
  })

  test('every executable CHECK offers exactly the client list, no more and no less', () => {
    const want = new Set(SUBTEAMS)
    let checked = 0
    for (const f of FILES) {
      const src = sql(f)
      for (const name of NAMES) {
        for (const values of checkValueSets(src, name)) {
          checked += 1
          const missing = [...want].filter((v) => !values.has(v))
          const extra = [...values].filter((v) => !want.has(v))
          expect(missing, `${f} / ${name} rejects a value the form offers`).toEqual([])
          expect(extra, `${f} / ${name} accepts a value the form does not offer`).toEqual([])
        }
      }
    }
    // A parser that matched nothing would pass the loop above vacuously.
    expect(checked, 'no executable subteam CHECK was found -- the parser missed them').toBeGreaterThanOrEqual(4)
  })

  test('POSITIVE CONTROL: the comparison detects a one-value drift', () => {
    const want = new Set(SUBTEAMS)
    const drifted = new Set([...SUBTEAMS].filter((v) => v !== 'Management'))
    expect([...want].filter((v) => !drifted.has(v))).toEqual(['Management'])
  })

  test('POSITIVE CONTROL: the CHECK parser skips commented-out documentation', () => {
    // subteams_add_strategy_management.sql opens with a commented copy of the
    // OLD 10-value constraint. A parser that read it would report a drift on a
    // correct tree, which is the false positive that gets a check deleted.
    const src = sql('subteams_add_strategy_management.sql')
    expect(src).toMatch(/--\s+add constraint member_applications_subteam_values_chk/)
    for (const values of checkValueSets(src, 'member_applications_subteam_values_chk')) {
      expect(values.has('Management')).toBe(true)
    }
  })

  test('isSubteam is case-insensitive and refuses a non-member', () => {
    expect(isSubteam('mechanical')).toBe(true)
    expect(isSubteam('Field & Pit')).toBe(true)
    expect(isSubteam('Pit Crew')).toBe(false)
    expect(isSubteam(null)).toBe(false)
  })
})

describe('hour categories: the client list and the CHECK agree', () => {
  // THE FIRST VERSION OF THIS TEST MEASURED THE WRONG THING, and it is recorded
  // here rather than quietly fixed. A bare /category\s+in\s*\(...\)/ matched the
  // RE-TAGGING UPDATE further up the same file -- `where category in
  // ('fundraising', 'mentoring')` -- and reported those two retired values as
  // the constraint's vocabulary. It failed loudly, which is the only reason it
  // was caught; a file whose update happened to list the same four values would
  // have passed while asserting nothing about the CHECK. The pattern is anchored
  // on `add constraint ... check (...)` now.
  test('the four categories are what the CHECK constraint allows', () => {
    const src = sql('categories_reduce_event_kind.sql')
    const m = /add constraint attendance_events_category_check\s+check\s*\(\s*category in \(([^)]*)\)/i.exec(src)
    expect(m, 'no attendance_events_category_check found in categories_reduce_event_kind.sql').toBeTruthy()
    const values = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
    expect([...values].sort()).toEqual(CATEGORIES.map((c) => c.key).sort())
  })

  test('POSITIVE CONTROL: the anchored pattern does NOT match the re-tagging update', () => {
    // The update that produced the original false reading is still in the file.
    // If it were ever matched again this test says so directly.
    const src = sql('categories_reduce_event_kind.sql')
    expect(src).toMatch(/where category in \('fundraising', 'mentoring'\)/)
    const m = /add constraint attendance_events_category_check\s+check\s*\(\s*category in \(([^)]*)\)/i.exec(src)
    expect(m[1]).not.toMatch(/fundraising|mentoring/)
  })

  test('POSITIVE CONTROL: the two retired categories are gone from both sides', () => {
    // fundraising and mentoring were dropped and re-tagged to outreach. If the
    // assertion above were comparing two empty sets, this would still fail.
    expect(CATEGORIES.map((c) => c.key)).toEqual(['build', 'outreach', 'volunteer', 'competition'])
    expect(CATEGORIES.map((c) => c.key)).not.toContain('fundraising')
  })

  test('a legacy or unknown stored category normalizes into the four', () => {
    const keys = CATEGORIES.map((c) => c.key)
    for (const v of ['normal', null, undefined, '', 'fundraising', 'mentoring', 'nonsense']) {
      expect(keys).toContain(normAttendanceCategory(v))
    }
    expect(normAttendanceCategory('volunteer')).toBe('volunteer')
  })

  test('logged_hours.type folds into a category, volunteering included', () => {
    const keys = CATEGORIES.map((c) => c.key)
    expect(loggedTypeToCategory('volunteering')).toBe('volunteer')
    for (const t of ['volunteering', 'volunteer', 'outreach', 'competition']) {
      expect(keys).toContain(loggedTypeToCategory(t))
    }
  })
})

describe('the SQL corpus itself', () => {
  test('every .sql file that creates a policy also revokes or grants deliberately', () => {
    // Not a style rule: CLAUDE.md records that the bootstrap ALTER DEFAULT
    // PRIVILEGES grants `authenticated` everything on a new public table, so a
    // file that adds RLS policies without saying anything about grants leaves
    // a write path open that fails SILENTLY at 0 rows rather than raising.
    // Reported, not enforced as a hard gate: several older files predate the
    // finding. The assertion is that the NUMBER of such files has not grown.
    const offenders = sqlFiles.filter((f) => {
      const src = sql(f)
      return /create policy/i.test(src) && !/\b(revoke|grant)\b/i.test(src)
    })
    expect(offenders.length, `files creating policies with no grant/revoke: ${offenders.join(', ')}`).toBeLessThanOrEqual(14)
  })

  test('POSITIVE CONTROL: the scan reads real files and finds real policies', () => {
    expect(sqlFiles.length).toBeGreaterThan(40)
    expect(sqlFiles.filter((f) => /create policy/i.test(sql(f))).length).toBeGreaterThan(10)
  })
})
