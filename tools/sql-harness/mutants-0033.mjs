#!/usr/bin/env node
/**
 * Mutation proof for 0033_human_player_leaderboard_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0033 --tests none --node tools/sql-harness/mutants-0033.mjs
 *
 * Each mutant rewrites ONE clause of 0033 in the PERMISSIVE direction (the parent-only exclusion, logging for others, staff-only edit, the void window and owner, the read policy, the target check, the 60-day window, the made-fits check, a client write grant), re-pastes the rewritten file,
 * runs the test and requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0033: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0033_human_player_leaderboard.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0033_human_player_leaderboard_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0033-'));

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
  ['parents allowed', "       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')\n            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));\n$fn$;\nrevoke all on function public._hp_member_ok()", "       and true);\n$fn$;\nrevoke all on function public._hp_member_ok()", [13]],
  ['a student logs for anyone', "if v_member <> auth.uid() and not public.is_staff() then", "if v_member <> auth.uid() and false then", [2]],
  ['anyone eligible edits', "if not public.is_staff() or not public._hp_member_ok() then raise exception 'Only staff can change an attempt.'", "if not public._hp_member_ok() then raise exception 'Only staff can change an attempt.'", [6]],
  ['the 24-hour void window dropped', "(a.member_id <> auth.uid() or a.created_at < now() - interval '24 hours') then", "(a.member_id <> auth.uid()) then", [8]],
  ['a student voids anyone', "(a.member_id <> auth.uid() or a.created_at < now() - interval '24 hours') then", "(a.created_at < now() - interval '24 hours') then", [7]],
  ['attempts read by anyone signed in', "create policy hp_attempts_read on public.hp_attempts for select to authenticated using ((select public._hp_member_ok()));", "create policy hp_attempts_read on public.hp_attempts for select to authenticated using (true);", [5]],
  ['logging for a member who cannot play', "  if not public._hp_target_ok(v_member) then raise exception", "  if false then raise exception", [14]],
  ['the student 60-day window dropped', "if not public.is_staff() and v_date < (now() at time zone 'America/Los_Angeles')::date - 60 then", "if false then", [12]],
  ['more made than shots accepted', "  if p_made + p_made_inactive > p_attempted then\n    raise exception", "  if false then\n    raise exception", [11]],
  ['inactive makes allowed outside a match', "  if p_drill <> 'match' and (p_made_inactive <> 0 or p_alliance is not null or p_inactive_first is not null) then", "  if false then", [11]],
  ['anon may call the log function', "revoke all on function public.hp_log_attempt(uuid, date, text, integer, integer, integer, integer, text, text, text) from public, anon;", "grant execute on function public.hp_log_attempt(uuid, date, text, integer, integer, integer, integer, text, text, text) to anon;", [15]],
  ['a client write grant on the table', "grant select on public.hp_attempts to authenticated;", "grant select, insert, update, delete on public.hp_attempts to authenticated;\ndrop policy if exists zz_i on public.hp_attempts;\ncreate policy zz_i on public.hp_attempts for insert to authenticated with check (true);\ndrop policy if exists zz_u on public.hp_attempts;\ncreate policy zz_u on public.hp_attempts for update to authenticated using (true);\ndrop policy if exists zz_d on public.hp_attempts;\ncreate policy zz_d on public.hp_attempts for delete to authenticated using (true);", [9, 10]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0033`); continue }
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
console.log(`mutants 0033: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
