#!/usr/bin/env node
/**
 * Mutation proof for 0028_role_interest_board_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0028.mjs
 *
 * Each mutant rewrites ONE clause of 0028 in the PERMISSIVE direction (the parent-only exclusion, staff checks on slots, assignment and routines, the requester binding, the needed-role check, eligibility bypassed, the 24-hour window, the season list opened), re-pastes the rewritten file,
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
const MIG = path.join(REPO, 'supabase', 'migrations', '0028_role_interest_board.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0028_role_interest_board_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0028-'));

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
  ['parents allowed on the board', "       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')\n            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));\n$fn$;\nrevoke all on function public._role_board_member_ok()", "       and true);\n$fn$;\nrevoke all on function public._role_board_member_ok()", [22]],
  ['anyone eligible may add slots', "  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;\n  if not exists (select 1 from public.events where id = p_event) then raise exception 'Event not found'", "  if not public._role_board_member_ok() then raise exception 'Staff only' using errcode = '42501'; end if;\n  if not exists (select 1 from public.events where id = p_event) then raise exception 'Event not found'", [1]],
  ['a request may name any role', "  if not (s.needs ? p_role) then raise exception", "  if false then raise exception", [6]],
  ['withdraw removes anyone', "delete from public.role_requests where slot_id = p_slot and role = p_role and member_id = auth.uid();", "delete from public.role_requests where slot_id = p_slot and role = p_role;", [8]],
  // Not a mutant: staff_assign_from_request calls staff_assign_role, which refuses a
  // non-staff caller itself, so removing the outer check changes nothing observable.
  ['assignment skips the eligibility check', "  v := public.staff_assign_role(s.event_id, r.member_id, r.role,\n         coalesce(nullif(btrim(p_reason), ''), 'Asked for it on the role board (' || s.label || ')'));", "  insert into public.event_roles (event_id, member_id, role, reason, assigned_by) values (s.event_id, r.member_id, r.role, coalesce(nullif(btrim(p_reason), ''), 'Asked for it on the role board (' || s.label || ')'), auth.uid()) returning * into v;", [12]],
  ['anyone eligible may add routines', "  if not public.is_staff() or not public._role_board_member_ok() then raise exception 'Only staff can add or change auto routines.'", "  if not public._role_board_member_ok() then raise exception 'Only staff can add or change auto routines.'", [14]],
  ['the 24-hour window on auto runs dropped', "(r.member_id <> auth.uid() or r.created_at < now() - interval '24 hours') then\n    raise exception 'You can correct your own run for 24 hours after logging it. Ask a mentor after that.' using errcode = '42501'; end if;\n  if p_result is null", "(r.member_id <> auth.uid()) then\n    raise exception 'You can correct your own run for 24 hours after logging it. Ask a mentor after that.' using errcode = '42501'; end if;\n  if p_result is null", [16]],
  ['season applications for anyone', "  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;\n  select id, name, start_date, end_date into s from public.seasons", "  select id, name, start_date, end_date into s from public.seasons", [20]],
  ['a client write grant on the new tables', "grant select on public.role_slots, public.role_requests to authenticated;", "grant select, insert, update, delete on public.role_slots, public.role_requests to authenticated;\ndrop policy if exists zz_i on public.role_slots;\ncreate policy zz_i on public.role_slots for insert to authenticated with check (true);", [21]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0026`); continue }
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
console.log(`mutants 0028: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
