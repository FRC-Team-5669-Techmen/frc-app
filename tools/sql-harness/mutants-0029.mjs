#!/usr/bin/env node
/**
 * Mutation proof for 0029_driver_leaderboard_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0029 --tests none --node tools/sql-harness/mutants-0029.mjs
 *
 * Each mutant rewrites ONE clause of 0029 in the PERMISSIVE direction (the parent-only exclusion, logging for others, staff-only edit and rate, the void window and owner, the two read policies, the note-free scores gate, the target check, the 60-day window, a client write grant), re-pastes the rewritten file,
 * runs the test and requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0028: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0029_driver_leaderboard.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0029_driver_leaderboard_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0029-'));

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
  ['parents allowed', "       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')\n            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));\n$fn$;\nrevoke all on function public._driver_member_ok()", "       and true);\n$fn$;\nrevoke all on function public._driver_member_ok()", [17]],
  ['a student logs for anyone', "if v_member <> auth.uid() and not public.is_staff() then", "if v_member <> auth.uid() and false then", [2]],
  ['anyone eligible edits', "if not public.is_staff() or not public._driver_member_ok() then raise exception 'Only staff can change a drive session.'", "if not public._driver_member_ok() then raise exception 'Only staff can change a drive session.'", [6]],
  ['the 24-hour void window dropped', "(s.member_id <> auth.uid() or s.created_at < now() - interval '24 hours') then", "(s.member_id <> auth.uid()) then", [8]],
  ['a student voids anyone', "(s.member_id <> auth.uid() or s.created_at < now() - interval '24 hours') then", "(s.created_at < now() - interval '24 hours') then", [7]],
  ['anyone eligible rates', "if not public.is_staff() or not public._driver_member_ok() then raise exception 'Only staff can rate a driver.'", "if not public._driver_member_ok() then raise exception 'Only staff can rate a driver.'", [9]],
  ['rating notes read by every member', "using ((select public._driver_member_ok()) and ((select public.is_staff()) or driver_id = (select auth.uid())));", "using ((select public._driver_member_ok()));", [11]],
  ['sessions read by anyone signed in', "create policy drive_sessions_read on public.drive_sessions for select to authenticated using ((select public._driver_member_ok()));", "create policy drive_sessions_read on public.drive_sessions for select to authenticated using (true);", [5]],
  ['the scores read without the gate', "  if not public._driver_member_ok() then raise exception 'The driver leaderboard is for approved students and staff.' using errcode = '42501'; end if;\n  return query", "  return query", [12]],
  ['rating a member who cannot drive', "  if not public._driver_target_ok(p_driver) then raise exception", "  if false then raise exception", [10]],
  ['the student 60-day window dropped', "if not public.is_staff() and v_date < (now() at time zone 'America/Los_Angeles')::date - 60 then", "if false then", [16]],
  ['a client write grant on the new tables', "grant select on public.drive_sessions, public.driver_ratings to authenticated;", "grant select, insert, update, delete on public.drive_sessions, public.driver_ratings to authenticated;\ndrop policy if exists zz_i on public.drive_sessions;\ncreate policy zz_i on public.drive_sessions for insert to authenticated with check (true);\ndrop policy if exists zz_u on public.drive_sessions;\ncreate policy zz_u on public.drive_sessions for update to authenticated using (true);", [13, 14]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0029`); continue }
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
console.log(`mutants 0029: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
