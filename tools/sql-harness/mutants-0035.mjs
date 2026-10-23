#!/usr/bin/env node
/**
 * Mutation proof for 0035_meet_a_team_rls_test.sql, run by
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
const MIG = path.join(REPO, 'supabase', 'migrations', '0035_meet_a_team.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0035_meet_a_team_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0035-'));

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
  ['contacts readable by any signed-in account', "create policy team_connection_contacts_read on public.team_connection_contacts for select to authenticated\n  using ((select public._role_board_member_ok()));", "create policy team_connection_contacts_read on public.team_connection_contacts for select to authenticated\n  using (true);", [3]],
  ['the shared list shows contacts to everyone', "  v_contacts := public._role_board_member_ok();", "  v_contacts := true;", [4]],
  ['any member edits any note', "create policy team_connections_update on public.team_connections for update to authenticated\n  using ((member_id = (select auth.uid()) and (select public._role_board_member_ok())) or (select public.is_staff()))\n  with check ((member_id = (select auth.uid()) and (select public._role_board_member_ok())) or (select public.is_staff()));", "create policy team_connections_update on public.team_connections for update to authenticated\n  using (true) with check (true);", [6]],
  ['any member deletes any note', "create policy team_connections_delete on public.team_connections for delete to authenticated\n  using ((member_id = (select auth.uid()) and (select public._role_board_member_ok())) or (select public.is_staff()));", "create policy team_connections_delete on public.team_connections for delete to authenticated\n  using (true);", [8]],
  ['any member changes any contact', "create policy team_connection_contacts_write on public.team_connection_contacts for all to authenticated\n  using ((select public._role_board_member_ok()) and exists", "create policy team_connection_contacts_write on public.team_connection_contacts for all to authenticated\n  using (true or exists", [8]],
  ['member_id made updatable (a table-level update grant)', "grant select, insert, delete on public.team_connections to authenticated;", "grant select, insert, update, delete on public.team_connections to authenticated;", [9]],
  ['a note written in another member\'s name', "  with check (member_id = (select auth.uid()) and (select public._role_board_member_ok()));", "  with check ((select public._role_board_member_ok()));", [9]],
  ['anon reads the notes', "grant select, insert, delete on public.team_connection_contacts to authenticated;", "grant select, insert, delete on public.team_connection_contacts to authenticated;\ngrant select on public.team_connections, public.team_connection_contacts to anon;\ndrop policy if exists zz_anon on public.team_connections;\ncreate policy zz_anon on public.team_connections for select to anon using (true);\ndrop policy if exists zz_anon on public.team_connection_contacts;\ncreate policy zz_anon on public.team_connection_contacts for select to anon using (true);", [5]],
  ['a student gives everyone a slot', "  v_placed jsonb := '[]'::jsonb; v_unplaced jsonb := '[]'::jsonb; v_slots integer; v_boxes integer; v_already integer;\nbegin\n  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;", "  v_placed jsonb := '[]'::jsonb; v_unplaced jsonb := '[]'::jsonb; v_slots integer; v_boxes integer; v_already integer;\nbegin", [15]],
  ['the preview writes', "    if p_apply then\n", "    if true then\n", [16]],
  ['other roles ignored when placing', "o.status = 'assigned' and o.role <> 'meet_team' and s2.event_id = p_event", "o.status = 'assigned' and false and s2.event_id = p_event", [19]],
  ['progress open to students', "declare ev record; v_people jsonb;\nbegin\n  if not public.is_staff() then", "declare ev record; v_people jsonb;\nbegin\n  if not public._meet_team_reader() then", [22]],
  ['Do this now keeps nagging after a note', "     and not exists (select 1 from public.team_connections c where c.event_id = e.id and c.member_id = auth.uid())), '[]'::jsonb);", "     ), '[]'::jsonb);", [23]],
]

const base = runTest()
if (process.env.SHOW) console.log(spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' }).stdout)
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0035`); continue }
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
console.log(`mutants 0035: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
