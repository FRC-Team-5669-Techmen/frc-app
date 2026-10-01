// The feedback system's rules (src/feedbackModel.js): statuses and the legacy
// mapping, the insert ladder that keeps a report saving while migration 0002
// waits to be pasted, the console's filters, and the bulk move / undo
// arithmetic.
//
// THE DRIFT GUARD at the bottom reads supabase/migrations/0002_feedback_console.sql
// and fails if its status CHECK, its RPC vocabulary, its legacy mapping or its
// two length caps stop agreeing with the JS. It reads the FILE, not the live
// database (same limit tests/vocabulary-drift.test.js states).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  BUILD_MAX, DEFAULT_FILTER, LEGACY_STATUSES, LEGACY_TO_STATUS, STATUSES, STATUS_TO_LEGACY,
  STORED_STATUSES, TRIED_MAX, applyMove, applyRestore, buildReport, describeFilter,
  facetOptions, filterReports, foldIntoMessage, laMinute, exportStamp, moveSummary,
  nextAttempt, normStatus, statusCounts, statusesFor, submitReport, summarizeUserAgent,
  typeOf, undoFrom, undoLabel, undoSummary,
} from '../src/feedbackModel.js'

const SAM = { full_name: 'Sam Student', nickname: null }
const RILEY = { full_name: 'Riley Student', nickname: 'Ry' }
const rows = [
  { id: 'a', member_id: 'm1', author: SAM, category: 'bug', status: 'new', route: '/schedule', message: 'Calendar is blank', image_paths: ['report/m1/1.png'], created_at: '2026-09-03T23:19:00Z' },
  { id: 'b', member_id: 'm2', author: RILEY, category: 'idea', status: 'open', route: '/jobs', message: 'Sort jobs by due date', tried: 'scrolled a lot', image_paths: [], created_at: '2026-09-04T17:00:00Z' },
  { id: 'c', member_id: 'm1', author: SAM, category: null, status: 'reviewed', route: '/schedule', message: 'Type should be optional', image_paths: [], created_at: '2026-09-05T17:00:00Z' },
  { id: 'd', member_id: 'm2', author: RILEY, category: 'feedback', status: 'spam', route: '/hours', message: 'asdf', image_paths: [], created_at: '2026-09-06T17:00:00Z' },
  { id: 'e', member_id: 'm1', author: SAM, category: 'bug', status: 'dismissed', route: '/hours', message: 'Hours look wrong', image_paths: ['report/m1/2.png', 'report/m1/3.png'], created_at: '2026-09-07T17:00:00Z' },
]

describe('statuses', () => {
  test('legacy values read as the new vocabulary, one to one', () => {
    expect(normStatus('open')).toBe('new')
    expect(normStatus('reviewed')).toBe('seen')
    expect(normStatus('dismissed')).toBe('wont_do')
    for (const s of STATUSES) expect(normStatus(s)).toBe(s)
  })

  test('an unknown value is passed through, never silently re-filed', () => {
    expect(normStatus('archived')).toBe('archived')
  })

  test('the pre-0002 write map is the exact inverse of the read map', () => {
    for (const [legacy, canonical] of Object.entries(LEGACY_TO_STATUS)) {
      expect(STATUS_TO_LEGACY[canonical]).toBe(legacy)
    }
    expect(Object.keys(STATUS_TO_LEGACY).sort()).toEqual(Object.values(LEGACY_TO_STATUS).sort())
  })

  test('before 0002 only the three statuses with a legacy spelling are offered; after, all six', () => {
    expect(statusesFor(false)).toEqual(['new', 'seen', 'wont_do'])
    expect(statusesFor(true)).toEqual(STATUSES)
  })

  test('counts fold legacy rows into the new tabs', () => {
    expect(statusCounts(rows)).toEqual({ new: 2, seen: 1, in_progress: 0, done: 0, wont_do: 1, spam: 1 })
  })
})

describe('types', () => {
  test('no type and the old neutral "feedback" both read as General', () => {
    expect(typeOf({ category: null })).toBe('general')
    expect(typeOf({ category: 'feedback' })).toBe('general')
    expect(typeOf({ category: 'bug' })).toBe('bug')
    expect(typeOf({ category: 'idea' })).toBe('idea')
  })
})

describe('buildReport', () => {
  const base = { memberId: 'm1', message: '  It broke  ', route: '/schedule', viewport: '390x844', userAgent: 'UA' }

  test('a report with no type stores NULL, and an empty tried names no column', () => {
    const p = buildReport({ ...base, tried: '   ', build: 'abc1234' })
    expect(p.category).toBeNull()
    expect('tried' in p).toBe(false)
    expect(p.build).toBe('abc1234')
    expect(p.message).toBe('It broke')
  })

  test('a typed report with tried carries both (positive control)', () => {
    const p = buildReport({ ...base, type: 'bug', tried: ' reloaded ', build: 'dev' })
    expect(p.category).toBe('bug')
    expect(p.tried).toBe('reloaded')
  })

  test('only bug and idea are types; anything else is no type', () => {
    expect(buildReport({ ...base, type: 'feedback' }).category).toBeNull()
  })

  test('the build stamp is capped to the CHECK', () => {
    expect(buildReport({ ...base, build: 'x'.repeat(100) }).build).toHaveLength(BUILD_MAX)
  })
})

describe('the insert ladder', () => {
  // A fake that answers the way PostgREST does against the PRE-0002 table:
  // a payload naming tried/build is PGRST204 before the database sees it, and
  // a NULL category trips the old NOT NULL (23502).
  const pre0002 = () => {
    const seen = []
    const insert = async (p) => {
      seen.push(p)
      if ('tried' in p || 'build' in p) return { error: { code: 'PGRST204', message: "Could not find the 'build' column" } }
      if (p.category == null) return { error: { code: '23502', message: 'null value in column "category"' } }
      return { error: null }
    }
    return { insert, seen }
  }
  const post0002 = () => {
    const seen = []
    return { seen, insert: async (p) => { seen.push(p); return { error: null } } }
  }

  test('before 0002: an untyped report with tried and build still saves, and nothing it said is lost', async () => {
    const fake = pre0002()
    const payload = buildReport({ memberId: 'm1', message: 'Type should be optional', tried: 'looked for a skip button', build: 'abc1234' })
    const out = await submitReport(fake.insert, payload)
    expect(out.error).toBeNull()
    expect(out.steps).toEqual(['columns', 'type'])
    expect(fake.seen).toHaveLength(3)
    const saved = fake.seen[2]
    expect(saved.category).toBe('feedback')
    expect(saved.message).toContain('Type should be optional')
    expect(saved.message).toContain('What I tried:\nlooked for a skip button')
    expect(saved.message).toContain('Build: abc1234')
    expect('tried' in saved || 'build' in saved).toBe(false)
  })

  test('before 0002: a typed report needs only the column rung', async () => {
    const fake = pre0002()
    const out = await submitReport(fake.insert, buildReport({ memberId: 'm1', type: 'bug', message: 'x', build: 'dev' }))
    expect(out.error).toBeNull()
    expect(out.steps).toEqual(['columns'])
    expect(fake.seen[1].category).toBe('bug')
  })

  test('after 0002 (positive control): one insert, wide shape, no type stays NULL, nothing folded', async () => {
    const fake = post0002()
    const out = await submitReport(fake.insert, buildReport({ memberId: 'm1', message: 'x', tried: 't', build: 'abc1234' }))
    expect(out.error).toBeNull()
    expect(out.steps).toEqual([])
    expect(fake.seen).toHaveLength(1)
    expect(fake.seen[0]).toMatchObject({ category: null, tried: 't', build: 'abc1234', message: 'x' })
  })

  test('a refusal no rung can fix is returned at once, not retried', async () => {
    const seen = []
    const insert = async (p) => { seen.push(p); return { error: { code: '42501', message: 'new row violates row-level security policy' } } }
    const out = await submitReport(insert, buildReport({ memberId: 'm1', message: 'x', build: 'dev' }))
    expect(out.error.code).toBe('42501')
    expect(seen).toHaveLength(1)
  })

  test('the type rung only fires for a report that HAS no type', () => {
    expect(nextAttempt({ category: 'bug', message: 'x' }, { code: '23514' })).toBeNull()
    expect(nextAttempt({ category: null, message: 'x' }, { code: '23514' }).payload.category).toBe('feedback')
  })

  test('the column rung is matched on the code, never the message', () => {
    const p = { category: 'bug', message: 'x', build: 'dev' }
    expect(nextAttempt(p, { code: 'XX000', message: 'column build does not exist' })).toBeNull()
    expect(nextAttempt(p, { code: '42703', message: 'whatever' }).reason).toBe('columns')
  })

  test('folding states each answer under its own label, and only the ones given', () => {
    expect(foldIntoMessage('m', {})).toBe('m')
    expect(foldIntoMessage('m', { tried: 't' })).toBe('m\n\nWhat I tried:\nt')
    expect(foldIntoMessage('m', { build: 'b' })).toBe('m\n\nBuild: b')
  })
})

describe('summarizeUserAgent', () => {
  test('reads the common phone and desktop browsers', () => {
    expect(summarizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS')
    expect(summarizeUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(summarizeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0')).toBe('Edge on Windows')
    expect(summarizeUserAgent('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')).toBe('Chrome on ChromeOS')
  })
  test('nothing recorded is null, not "unknown"', () => {
    expect(summarizeUserAgent('')).toBeNull()
    expect(summarizeUserAgent(null)).toBeNull()
  })
})

describe('filters', () => {
  const ids = list => list.map(r => r.id)

  test('the console opens on New, and a legacy "open" row is New', () => {
    expect(ids(filterReports(rows, DEFAULT_FILTER))).toEqual(['a', 'b'])
  })

  test('each facet narrows, and "all" turns it off (positive control)', () => {
    expect(ids(filterReports(rows, { status: 'all' }))).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(filterReports(rows, { status: 'all', type: 'bug' }))).toEqual(['a', 'e'])
    expect(ids(filterReports(rows, { status: 'all', type: 'general' }))).toEqual(['c', 'd'])
    expect(ids(filterReports(rows, { status: 'all', route: '/hours' }))).toEqual(['d', 'e'])
    expect(ids(filterReports(rows, { status: 'all', reporter: 'm2' }))).toEqual(['b', 'd'])
    expect(ids(filterReports(rows, { status: 'all', shots: 'with' }))).toEqual(['a', 'e'])
    expect(ids(filterReports(rows, { status: 'all', shots: 'without' }))).toEqual(['b', 'c', 'd'])
    expect(ids(filterReports(rows, { status: 'spam' }))).toEqual(['d'])
  })

  test('search covers the message, what they tried, the route and the reporter name', () => {
    expect(ids(filterReports(rows, { status: 'all', q: 'scrolled' }))).toEqual(['b'])
    expect(ids(filterReports(rows, { status: 'all', q: 'ry' }))).toEqual(['b', 'd'])
    expect(ids(filterReports(rows, { status: 'all', q: 'nothing matches this' }))).toEqual([])
  })

  test('facet pickers carry counts and never offer a value that matches nothing', () => {
    const f = facetOptions(rows)
    expect(f.routes).toEqual([{ route: '/hours', count: 2 }, { route: '/jobs', count: 1 }, { route: '/schedule', count: 2 }])
    expect(f.reporters.map(r => [r.name, r.count])).toEqual([['Ry', 2], ['Sam Student', 3]])
  })

  test('the filter in words names a reporter only when names travel with the export', () => {
    const f = { ...DEFAULT_FILTER, reporter: 'm1', route: '/schedule' }
    expect(describeFilter(f, { reporterLabel: 'Sam Student', names: true })).toContain('reporter Sam Student')
    const withheld = describeFilter(f, { reporterLabel: 'Sam Student', names: false })
    expect(withheld).toContain('one reporter (name withheld)')
    expect(withheld).not.toContain('Sam')
  })
})

describe('bulk move and undo', () => {
  test('the undo carries exactly what the RPC said each report had before', () => {
    const changed = [
      { id: 'a', previous_status: 'new', previous_reviewed_by: null, previous_reviewed_at: null },
      { id: 'c', previous_status: 'seen', previous_reviewed_by: 'admin', previous_reviewed_at: '2026-09-05T18:00:00+00:00' },
    ]
    const undo = undoFrom('done', changed)
    expect(undo.items).toEqual([
      { id: 'a', status: 'new', reviewed_by: null, reviewed_at: null },
      { id: 'c', status: 'seen', reviewed_by: 'admin', reviewed_at: '2026-09-05T18:00:00+00:00' },
    ])
    expect(undoLabel(undo)).toBe('Undo: back to where they were')
  })

  test('a report whose previous status already reads as the target is not "restored"', () => {
    expect(undoFrom('new', [{ id: 'b', previous_status: 'open' }])).toBeNull()
    expect(undoFrom('new', [{ id: 'c', previous_status: 'seen' }]).items).toHaveLength(1)
    expect(undoLabel(undoFrom('new', [{ id: 'c', previous_status: 'reviewed' }]))).toBe('Undo: back to Seen')
  })

  test('local rows follow the move and the restore exactly', () => {
    const moved = applyMove(rows, ['a', 'c'], 'done', { uid: 'admin', at: 'T' })
    expect(moved.find(r => r.id === 'a')).toMatchObject({ status: 'done', reviewed_by: 'admin', reviewed_at: 'T' })
    expect(moved.find(r => r.id === 'b')).toBe(rows[1])
    const undo = undoFrom('done', [{ id: 'a', previous_status: 'new' }, { id: 'c', previous_status: 'reviewed', previous_reviewed_by: 'x', previous_reviewed_at: 'Y' }])
    const back = applyRestore(moved, undo.items, ['a'])
    expect(back.find(r => r.id === 'a')).toMatchObject({ status: 'new', reviewed_by: null })
    expect(back.find(r => r.id === 'c').status).toBe('done')   // not restored: the database said so
  })

  test('moving to New clears the triage stamp', () => {
    const r = applyMove([{ id: 'x', status: 'seen', reviewed_by: 'a', reviewed_at: 'T' }], ['x'], 'new')[0]
    expect(r).toMatchObject({ status: 'new', reviewed_by: null, reviewed_at: null })
  })

  test('a summary names what moved, what was already there, and what did not move', () => {
    const requested = [rows[0], rows[1], { ...rows[2], status: 'done' }]
    const s = moveSummary('done', requested, ['a'])
    expect(s).toContain('Moved 1 report to Done: /schedule "Calendar is blank".')
    expect(s).toContain('1 already was Done.')
    expect(s).toContain('1 did not move')
    expect(s).toContain('/jobs "Sort jobs by due date"')
  })

  test('an undo summary says which reports did not go back', () => {
    const undo = { target: 'spam', items: [{ id: 'a', status: 'new' }, { id: 'b', status: 'open' }] }
    expect(undoSummary(undo, ['a', 'b'], rows)).toBe('Undid the move to Spam: 2 reports back where they were.')
    const partial = undoSummary(undo, ['a'], rows)
    expect(partial).toContain('1 report back where it was.')
    expect(partial).toContain('1 did not go back because it was changed again since: /jobs')
  })
})

describe('time', () => {
  test('Los Angeles wall clock, across daylight saving', () => {
    expect(laMinute('2026-09-03T23:19:00Z')).toBe('2026-09-03 16:19')     // PDT, UTC-7
    expect(laMinute('2026-12-03T23:19:00Z')).toBe('2026-12-03 15:19')     // PST, UTC-8
    expect(exportStamp('2026-10-01T21:05:31Z')).toBe('2026-10-01-1405')
  })
})

// ── Drift guard against the hand-applied SQL ─────────────────────────────────
const SQL = readFileSync(fileURLToPath(new URL('../supabase/migrations/0002_feedback_console.sql', import.meta.url)), 'utf8')
// Executable SQL only: every `--` comment stripped, so the header's prose
// (which quotes these values too) can never satisfy an assertion.
const EXEC = SQL.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const quoted = s => [...s.matchAll(/'([^']*)'/g)].map(m => m[1])

describe('drift: src/feedbackModel.js vs 0002_feedback_console.sql', () => {
  test('the status CHECK admits exactly STORED_STATUSES', () => {
    const m = EXEC.match(/add constraint feedback_status_chk\s+check \(status in \(([\s\S]*?)\)\);/)
    expect(m).not.toBeNull()
    expect(quoted(m[1]).sort()).toEqual([...STORED_STATUSES].sort())
  })

  test('feedback_set_status accepts exactly STATUSES, and no legacy value', () => {
    const m = EXEC.match(/if v_status not in \(([^)]*)\) then/)
    expect(m).not.toBeNull()
    expect(quoted(m[1])).toEqual([...STATUSES])
    for (const l of LEGACY_STATUSES) expect(quoted(m[1])).not.toContain(l)
  })

  test('the in-place mapping is LEGACY_TO_STATUS', () => {
    const pairs = [...EXEC.matchAll(/when '(\w+)'\s+then '(\w+)'/g)].map(m => [m[1], m[2]])
    expect(Object.fromEntries(pairs)).toEqual(LEGACY_TO_STATUS)
  })

  test('the two caps match the CHECKs', () => {
    expect(EXEC).toMatch(new RegExp(`length\\(tried\\) <= ${TRIED_MAX}\\)`))
    expect(EXEC).toMatch(new RegExp(`length\\(btrim\\(build\\)\\) between 1 and ${BUILD_MAX}\\)`))
  })

  test('POSITIVE CONTROL: the parser does find a value that IS in the CHECK, and would see a missing one', () => {
    const m = EXEC.match(/add constraint feedback_status_chk\s+check \(status in \(([\s\S]*?)\)\);/)
    const found = quoted(m[1])
    expect(found).toContain('spam')
    expect([...STORED_STATUSES, 'archived'].sort()).not.toEqual(found.sort())
  })
})
