#!/usr/bin/env node
/**
 * Mutation proof for 0025_absence_handbook_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0025.mjs
 *
 * Each mutant rewrites ONE clause of 0025 in the PERMISSIVE direction (a
 * medical visit back as an emergency, break weeks ignored for the next
 * school day, the unanswered-at-the-meeting rule dropped, any IN counted as
 * a meeting check-in, the staff check on deciding), re-pastes the rewritten
 * file, runs the test and requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0025: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0025_absence_handbook.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0025_absence_handbook_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0025-'));

function paste(text) {
  const f = path.join(TMP, 'm.sql');
  writeFileSync(f, text);
  execFileSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function runTest() {
  const r = spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' });
  const fails = new Set();
  let rows = 0;
  for (const line of (r.stdout || '').split('\n')) {
    const c = line.split('\t');
    if (c.length >= 4 && /^(PASS|FAIL|SKIP)$/.test(c[2]) && c[1] !== 'summary') {
      rows += 1;
      if (c[2] === 'FAIL') fails.add(Number(c[0]));
    }
  }
  return { fails, rows, errored: r.status !== 0 }
}

// [name, find, replace, checks that must FAIL]
const MUTANTS = [
  ['a medical visit accepted as an emergency again',
    "if p_reason not in ('illness', 'family_emergency') then", "if p_reason not in ('illness', 'family_emergency', 'medical') then", [1]],
  ['break weeks ignored for the next school day',
    "and not exists (select 1 from public.team_weeks w where w.kind = 'break' and w.week_start = date_trunc('week', d)::date) then",
    "then", [5]],
  ['a request unanswered at the meeting may be denied afterwards',
    "    if not p_approve then\n      raise exception 'This request was still unanswered",
    "    if false then\n      raise exception 'This request was still unanswered", [6]],
  ['any IN during the meeting counts, not only a mentor check-in',
    "and a.type = 'in' and coalesce(a.manual_entry, false)", "and a.type = 'in' and true", [11]],
  ['anyone signed in may decide an absence',
    "  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;\n  select e.starts_at",
    "  if not true then raise exception 'Staff only' using errcode = '42501'; end if;\n  select e.starts_at", [13]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0025`); continue }
  // A grant mutant needs the revoke to stay first, so the whole file is
  // re-pasted with the one change; anon loses the grant again on restore.
  paste(ORIGINAL.replace(find, replace))
  const r = runTest()
  const hit = want.every((n) => r.fails.has(n))
  if (hit) caught += 1
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`)
  paste(ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1) }
}
console.log(`mutants 0025: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
