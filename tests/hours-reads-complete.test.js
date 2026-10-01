// Every attendance_events read in the app is COMPLETE: paged through
// src/fetchAllRows.js, or structurally bounded (one day, one row, named ids),
// or a write.
//
// An unranged PostgREST select stops at the project's max rows (1000 on a
// default Supabase project) with no error. Every hours read orders
// attendance_events oldest-first, so the rows that fall off are the NEWEST: a
// team-wide read loses this week once about 60 members pass 1000 events, which
// they do inside a season, and a per-member read does the same after a few
// years. Nothing on screen says so; the totals just read low. So this is held
// by a source scan rather than left to review: a new read that is neither
// paged nor bounded fails here.
//
// The scan reads each `supabase.from('attendance_events')` call chain in src/,
// whole (balanced parentheses, string literals skipped), and classifies it.
// Positive controls: the scanner is driven over known-good and known-bad
// snippets (the bad one is the HoursBoard read as it stood at a55d574), and
// the real tree must yield both paged and bounded reads, so an empty or
// broken scan cannot pass.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const TABLE = 'attendance_events'

// Reads outside the hours lane that are not paged yet, with why. Each value is
// the most such reads the file may hold; the fix lowers the count to zero and
// never trips this test, so the entry can be deleted once it is applied.
const PENDING = {
  // Lane b2 owns HomePage.jsx. Its dashboard read (one member, all time,
  // oldest-first) drives isCheckedIn and the Today/Season figures; the paging
  // edit is handed to the orchestrator in the hd lane's output.
  'HomePage.jsx': 1,
}

// Skip a quoted string starting at i (quote char at s[i]); return the index
// just past its closing quote.
function skipString(s, i) {
  const q = s[i]
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue }
    if (q === '`' && s[j] === '$' && s[j + 1] === '{') {
      let depth = 1; j += 2
      for (; j < s.length && depth; j++) {
        if (s[j] === '{') depth++
        else if (s[j] === '}') depth--
        else if (s[j] === '\'' || s[j] === '"' || s[j] === '`') j = skipString(s, j) - 1
      }
      j--
      continue
    }
    if (s[j] === q) return j + 1
  }
  return s.length
}

// From `i` (at a '(') return the index just past its matching ')'.
function skipParens(s, i) {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\'' || c === '"' || c === '`') { j = skipString(s, j) - 1; continue }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return j + 1
  }
  return s.length
}

// Every chain on `table` in `src`: { chain, paged, line }.
function readsOf(src, table = TABLE) {
  const out = []
  const needle = new RegExp(`\\bsupabase\\s*\\.from\\(\\s*['"]${table}['"]\\s*\\)`, 'g')
  for (const m of src.matchAll(needle)) {
    let end = m.index + m[0].length
    // Follow `.name(...)` links, across whitespace, newlines and comments.
    for (;;) {
      const link = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*\.\s*[A-Za-z_$][\w$]*\s*\(/.exec(src.slice(end))
      if (!link) break
      end = skipParens(src, end + link[0].length - 1)
    }
    const before = src.slice(Math.max(0, m.index - 80), m.index)
    out.push({
      chain: src.slice(m.index, end),
      paged: /fetchAllRows\(\s*\(\)\s*=>\s*$/.test(before),
      line: src.slice(0, m.index).split('\n').length,
    })
  }
  return out
}

// write | paged | bounded | UNBOUNDED
function classify({ chain, paged }) {
  if (/\.(insert|update|upsert|delete)\s*\(/.test(chain)) return 'write'
  if (paged) return 'paged'
  // One row, a named set of rows, or everything since a recent instant (the
  // presence board, the activity feed and the check-in fast paths read from
  // the start of today).
  if (/\.(limit|single|maybeSingle)\s*\(/.test(chain)) return 'bounded'
  if (/\.(in|eq)\(\s*['"]id['"]/.test(chain)) return 'bounded'
  if (/\.gte\(\s*['"]event_time['"]/.test(chain)) return 'bounded'
  return 'UNBOUNDED'
}

function sourceFiles() {
  return readdirSync(SRC).filter(f => /\.(jsx?|mjs)$/.test(f))
}

describe('the scanner', () => {
  test('POSITIVE CONTROL: the a55d574 Team Hours read is unbounded; the same read paged is not', () => {
    const was = `Promise.all([
      supabase.from('attendance_events').select('id, user_id, type, event_time, location, category, manual_entry').order('event_time'),
      supabase.from('logged_hours').select('member_id, type, hours, date').eq('status', 'verified'),
    ])`
    const now = `const readEvents = () => fetchAllRows(() => supabase.from('attendance_events')
      .select('id, user_id, type, event_time, location, category, manual_entry').order('event_time').order('id'))`
    expect(readsOf(was).map(classify)).toEqual(['UNBOUNDED'])
    expect(readsOf(now).map(classify)).toEqual(['paged'])
  })

  test('reads a whole chain across lines, skipping parentheses inside strings', () => {
    const src = `const { data } = await supabase
      .from('attendance_events')
      .select('id, profiles!attendance_events_user_fkey(full_name, nickname)')
      .eq('user_id', uid)
      .order('event_time', { ascending: false }).limit(6)
    setRows(data)`
    const [r] = readsOf(src)
    expect(r.chain.endsWith('.limit(6)')).toBe(true)
    // A comment between two links does not end the chain.
    const commented = src.replace(".select(", "// two FKs point at profiles (a comment with parens)\n      .select(")
    expect(classify(readsOf(commented)[0])).toBe('bounded')
    expect(classify(r)).toBe('bounded')
    // Positive control: the same chain without its .limit(6) is unbounded.
    expect(classify(readsOf(src.replace('.limit(6)', ''))[0])).toBe('UNBOUNDED')
  })

  test('a write, a today-bounded read and a named-id read are each recognised', () => {
    expect(classify(readsOf(`await supabase.from('attendance_events').insert(row)`)[0])).toBe('write')
    expect(classify(readsOf(`supabase.from('attendance_events').select('user_id').gte('event_time', todayISO)`)[0])).toBe('bounded')
    expect(classify(readsOf(`supabase.from('attendance_events').select('id').in('id', eventIds)`)[0])).toBe('bounded')
    // Positive control: a filter on another column bounds nothing.
    expect(classify(readsOf(`supabase.from('attendance_events').select('id').in('user_id', ids)`)[0])).toBe('UNBOUNDED')
  })
})

describe('the tree', () => {
  const all = sourceFiles().flatMap(f => readsOf(readFileSync(join(SRC, f), 'utf8')).map(r => ({ ...r, file: f, kind: classify(r) })))

  test('no attendance_events read is unbounded, beyond the pending ones named above', () => {
    const unbounded = all.filter(r => r.kind === 'UNBOUNDED')
    const byFile = {}
    for (const r of unbounded) (byFile[r.file] ??= []).push(`${r.file}:${r.line}`)
    for (const [file, sites] of Object.entries(byFile)) {
      expect(sites.length, `unpaged attendance_events read(s): ${sites.join(', ')}`).toBeLessThanOrEqual(PENDING[file] ?? 0)
    }
  })

  test('every paged read orders by id last, so pages cannot overlap or skip', () => {
    const paged = all.filter(r => r.kind === 'paged')
    for (const r of paged) {
      const orders = [...r.chain.matchAll(/\.order\(\s*['"](\w+)['"]/g)].map(m => m[1])
      expect(orders.at(-1), `${r.file}:${r.line}`).toBe('id')
      expect(r.chain, `${r.file}:${r.line} selects id`).toMatch(/select\(\s*['"](id|[^'"]*\bid\b)/)
    }
  })

  test('POSITIVE CONTROL: the scan found the reads it is about', () => {
    const count = (kind) => all.filter(r => r.kind === kind).length
    // Team Hours, Reports, the anomaly list,
    // the parent dashboard, Jobs, the roster, the /display history, the member
    // admin panel and My Hours are paged; the check-in fast paths, the presence
    // board, the glance card and the activity feed are bounded to today.
    expect(count('paged')).toBeGreaterThanOrEqual(9)
    expect(count('bounded')).toBeGreaterThanOrEqual(5)
    expect(count('write')).toBeGreaterThanOrEqual(3)
    const pagedFiles = new Set(all.filter(r => r.kind === 'paged').map(r => r.file))
    for (const f of ['HoursBoard.jsx', 'ReportsPage.jsx', 'VerifyHoursPage.jsx', 'ParentHomePage.jsx', 'JobsPage.jsx', 'RosterPage.jsx', 'AttendanceHistory.jsx', 'MemberHoursAdmin.jsx', 'MyHoursPage.jsx']) {
      expect(pagedFiles.has(f), f).toBe(true)
    }
  })
})
