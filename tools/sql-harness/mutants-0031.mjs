#!/usr/bin/env node
/**
 * Mutation proof for 0031_role_board_v2_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0031.mjs
 *
 * Each mutant rewrites ONE clause of 0031 in the PERMISSIVE direction (a student setting status,
 * a student adding others, withdraw taking an assigned row, backups or asks counted as filled,
 * the event_roles sync deleting roster rows, the needed-role check on staff add, a client write
 * grant on role_requests, the eligibility block put back), re-pastes the rewritten file,
 * runs the test and requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0031: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0031_role_board_v2.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0031_role_board_v2_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0031-'));

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
  ['any member may set status', "returns jsonb language plpgsql security definer set search_path = public as $fn$\ndeclare r public.role_requests; s public.role_slots;\nbegin\n  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;\n  if p_status is null", "returns jsonb language plpgsql security definer set search_path = public as $fn$\ndeclare r public.role_requests; s public.role_slots;\nbegin\n  if not public._role_board_member_ok() then raise exception 'Staff only' using errcode = '42501'; end if;\n  if p_status is null", [5]],
  ['any member may add others to a box', "  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;\n  if coalesce(p_status, 'assigned')", "  if coalesce(p_status, 'assigned')", [6]],
  ['withdraw takes an assigned row too', "member_id = auth.uid() and status = 'asked';", "member_id = auth.uid();", [15]],
  ['backups counted as assigned on the board', "'assigned', (select count(*) from public.role_requests r where r.slot_id = s.id and r.role = n.key and r.status = 'assigned'),", "'assigned', (select count(*) from public.role_requests r where r.slot_id = s.id and r.role = n.key and r.status in ('assigned', 'backup')),", [8]],
  ['asks counted as filled for Do this now', "(select count(*)::integer from public.role_requests r where r.slot_id = s.id and r.role = n.key and r.status = 'assigned')", "(select count(*)::integer from public.role_requests r where r.slot_id = s.id and r.role = n.key)", [17]],
  ['the sync removes roster page rows', "where event_id = p_event and member_id = p_member and role = p_role and reason ilike '%role board%';", "where event_id = p_event and member_id = p_member and role = p_role;", [14]],
  ['staff add skips the needed role check', "  if not (s.needs ? p_role) then raise exception 'That role is not needed in this slot.' using errcode = '22023'; end if;\n  if not exists (select 1 from public.profiles p where p.id = p_member", "  if not exists (select 1 from public.profiles p where p.id = p_member", [18]],
  ['a client write grant on role_requests', "create index if not exists role_requests_slot_status_idx", "grant update on public.role_requests to authenticated;\ndrop policy if exists zz_u on public.role_requests;\ncreate policy zz_u on public.role_requests for update to authenticated using (true) with check (true);\ncreate index if not exists role_requests_slot_status_idx", [7]],
  ['the eligibility block put back', "  r := public.staff_set_request_status(p_request, 'assigned');", "  if public.event_role_blocker((select member_id from public.role_requests where id = p_request), (select s.event_id from public.role_slots s join public.role_requests q on q.slot_id = s.id where q.id = p_request), (select role from public.role_requests where id = p_request)) is not null then raise exception 'Not eligible' using errcode = '22023'; end if;\n  r := public.staff_set_request_status(p_request, 'assigned');", [11]],
  // Not a mutant: dropping the bulk staff check changes nothing observable, because
  // staff_add_to_slot and staff_set_request_status refuse a non-staff caller themselves.
  ['an ambiguous name takes the first match', "  if array_length(ids, 1) > 1 then\n", "  if false then\n", [22]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0031`); continue }
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
console.log(`mutants 0031: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
