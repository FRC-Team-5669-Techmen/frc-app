// admin_merge_member (0020) KNOWS EVERY COLUMN THAT NAMES A MEMBER.
//
// The merge refuses to run while the live catalog holds a member column its
// rule list (_merge_member_rules) does not name, and 0020_member_admin_rls_test
// check 2 turns red on it. Both need a database. This is the same check read
// off the SQL files, so it runs on every push in CI: every column any SQL file
// creates that references profiles or auth.users, or is a uuid named like a
// member (member_id, user_id, *_by, student_id, allowed_member, ...), must have
// a rule. A new migration adding one without teaching the merge fails here.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chainFiles, ROOT } from '../tools/connector/sqlchain.mjs'

const NAME = /((^|_)(member|user|student|parent|owner|viewer|captain|driver|rider|actor|mentor|person|account|claimant|signer|recipient)(_id)?|_by|^allowed_member)$/
const REF = /\breferences\s+(?:public\.)?profiles\b|\breferences\s+auth\.users\b/i

function splitTop(s) {
  const parts = []; let depth = 0; let cur = ''
  for (const ch of s) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => p.trim())
}

export function memberColumns(text) {
  const sql = text.replace(/--[^\n]*/g, '')
  const out = new Set()
  const consider = (tbl, def) => {
    const m = /^"?([a-z_][a-z0-9_]*)"?\s+([a-z0-9_. []+)/i.exec(def)
    if (!m) return
    const [, col, type] = m
    if (/^(constraint|primary|unique|foreign|check|exclude)$/i.test(col)) return
    if (REF.test(def) || (/^uuid\b/i.test(type.trim()) && NAME.test(col.toLowerCase()))) out.add(`${tbl}.${col.toLowerCase()}`)
  }
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    let depth = 1; let j = m.index + m[0].length
    while (j < sql.length && depth > 0) { if (sql[j] === '(') depth += 1; else if (sql[j] === ')') depth -= 1; j += 1 }
    const tbl = m[1].toLowerCase()
    for (const def of splitTop(sql.slice(m.index + m[0].length, j - 1))) {
      consider(tbl, def)
      const fk = /foreign\s+key\s*\(\s*([a-z_][a-z0-9_]*)\s*\)\s*references\s+(?:public\.)?(profiles|auth\.users)\b/i.exec(def)
      if (fk) out.add(`${tbl}.${fk[1].toLowerCase()}`)
    }
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+([^;]*);/gi)) {
    for (const part of splitTop(m[2])) {
      const a = /^add\s+column\s+(?:if\s+not\s+exists\s+)?(.+)$/is.exec(part.trim())
      if (a) consider(m[1].toLowerCase(), a[1].trim())
      const fk = /foreign\s+key\s*\(\s*([a-z_][a-z0-9_]*)\s*\)\s*references\s+(?:public\.)?(profiles|auth\.users)\b/i.exec(part)
      if (fk) out.add(`${m[1].toLowerCase()}.${fk[1].toLowerCase()}`)
    }
  }
  return out
}

const rulesText = readFileSync(join(ROOT, 'supabase/migrations/0020_member_admin.sql'), 'utf8')
const RULES = new Map([...rulesText.matchAll(/\('([a-z_]+)', '([a-z_]+)', '(profile|roles|grants|drop|keep|refuse|move)'\)/g)].map((m) => [`${m[1]}.${m[2]}`, m[3]]))

describe('the merge knows every member column the SQL files create', () => {
  const found = new Set(chainFiles().flatMap((f) => [...memberColumns(readFileSync(join(ROOT, f), 'utf8'))]))
  it('reads the rules and finds the columns (positive control on both)', () => {
    expect(RULES.size).toBeGreaterThan(100)
    for (const c of ['event_signups.member_id', 'logged_hours.verified_by', 'guardian_links.parent_id', 'connector_settings.allowed_member']) expect(found.has(c), c).toBe(true)
  })
  it('every one of them has a rule in _merge_member_rules', () => {
    const missing = [...found].filter((c) => !RULES.has(c)).sort()
    expect(missing, 'add each to _merge_member_rules() in a migration (see 0020_member_admin.sql)').toEqual([])
  })
  it('POSITIVE CONTROL: a member column planted in a new table and one added by alter table are both found', () => {
    const planted = memberColumns(`create table if not exists public.robot_drivers (id uuid primary key, pilot uuid references public.profiles(id), coach_id uuid, approved_by uuid, note text);
      alter table public.events add column if not exists checked_by uuid;`)
    expect([...planted].sort()).toEqual(['events.checked_by', 'robot_drivers.approved_by', 'robot_drivers.pilot'])
    expect(planted.has('robot_drivers.coach_id')).toBe(false)
    expect(RULES.has('robot_drivers.pilot')).toBe(false)
  })
})
