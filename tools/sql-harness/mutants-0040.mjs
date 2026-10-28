#!/usr/bin/env node
/**
 * Mutation proof for 0040_hours_bulk_approve_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0040.mjs
 *
 * Each mutant rewrites ONE clause of 0040 in the PERMISSIVE direction (the
 * staff check, the still-pending filter, the listed-ids filter, the verifier
 * stamp, an anon grant), re-pastes the rewritten file, runs the test and
 * requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL
 * text, read once at start into memory (never restored from the repository),
 * and confirms the test is green again before the next mutant. Same shape as
 * mutants-0025.mjs.
 *
 * Prints one line per mutant and `mutants 0040: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0040_hours_bulk_approve.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0040_hours_bulk_approve_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0040-'));

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
  return { fails, rows, errored: r.status !== 0 };
}

// [name, find, replace, checks that must FAIL]
const MUTANTS = [
  ['anyone signed in may bulk approve',
    'if not public.is_staff() then', 'if false then', [1, 2]],
  ['entries already verified or rejected are approved again',
    "\n       and l.status = 'pending'", '', [5, 6]],
  ['every pending entry is approved, not only the listed ones',
    "where l.id = any(coalesce(p_entries, '{}'::uuid[]))", 'where true', [5]],
  ['the approver is not stamped',
    "set status = 'verified', verified_by = auth.uid(), verified_at = now()", "set status = 'verified', verified_at = now()", [4]],
  ['anon may execute',
    'grant execute on function public.staff_approve_logged_hours(uuid[]) to authenticated;',
    'grant execute on function public.staff_approve_logged_hours(uuid[]) to authenticated, anon;', [3]],
];

const base = runTest();
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`);
  process.exit(1);
}
let caught = 0;
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0040`); continue; }
  paste(ORIGINAL.replace(find, () => replace));
  const r = runTest();
  const hit = want.every((n) => r.fails.has(n));
  if (hit) caught += 1;
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`);
  paste(ORIGINAL);
  const back = runTest();
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1); }
}
console.log(`mutants 0040: ${caught}/${MUTANTS.length} caught`);
process.exit(caught === MUTANTS.length ? 0 : 1);
