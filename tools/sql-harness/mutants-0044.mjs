#!/usr/bin/env node
/**
 * Mutation proof for 0044_standing_october_correction_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0044.mjs
 *
 * Each mutant rewrites ONE clause of 0044 in the PERMISSIVE direction, re-pastes
 * the file, runs the test and requires the named check(s) to turn FAIL; then it
 * re-pastes the ORIGINAL text (read once into memory, never git checkout) and
 * confirms the test is green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0044: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0044_standing_october_correction.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0044_standing_october_correction_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0044-'));

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
  return { fails, rows, errored: r.status !== 0 || /ERROR:/.test(r.stderr || '') }
}

// [name, find, replace, checks that must FAIL]
const MUTANTS = [
  ["an open session is never present", "case when public._session_open_at(p_member, e.starts_at) then 'present' end) as scan", "null::text) as scan", [1]],
  ["a signed-out session still counts", "select a.type = 'in' and a.event_time > p_at - interval '12 hours'", "select a.event_time > p_at - interval '12 hours'", [2]],
  ["no 12-hour cap", "a.type = 'in' and a.event_time > p_at - interval '12 hours'\n", "a.type = 'in'\n", [3]],
  ["a blank meeting counts", "public._meeting_recorded(e.id, e.starts_at, e.ends_at) as recorded", "true as recorded", [5]],
  ["no hold", "if v_limit is not null and v_new > v_limit then", "if false then", [6, 7]],
  ["the hold alerts every run", "where kind = 'standing_hold' and created_at > now() - interval '20 hours') then", "where false) then", [8]],
  ["the hold cannot be turned off", "v_limit := case when s.hold_over_pct is null then null", "v_limit := case when s.hold_over_pct is null then 0", [9]],
  ["members run the unwrapped run", "revoke execute on function public._standing_evaluate_run() from public, anon, authenticated;", "grant execute on function public._standing_evaluate_run() to authenticated;", [11]],
]

const base = runTest()
if (process.env.SHOW) console.log(spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' }).stdout)
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0044`); continue }
  // A grant mutant needs the revoke to stay first, so the whole file is
  // re-pasted with the one change; anon loses the grant again on restore.
  paste(ORIGINAL.replace(find, () => replace)) // a function: a $' in the replacement must stay literal
  const r = runTest()
  // A test that stops with an error under a mutant has not passed it: count it caught, and say so.
  const hit = want.every((n) => r.fails.has(n)) || (r.errored && r.rows < base.rows)
  if (hit) caught += 1
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`)
  paste(ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1) }
}
console.log(`mutants 0044: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
