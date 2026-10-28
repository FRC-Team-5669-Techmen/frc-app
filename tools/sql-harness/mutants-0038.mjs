#!/usr/bin/env node
/**
 * Mutation proof for 0038_robot_match_log_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0038.mjs
 *
 * Each mutant rewrites ONE clause of 0038 in the PERMISSIVE direction, re-pastes
 * the file, runs the test and requires the named check(s) to turn FAIL; then it
 * re-pastes the ORIGINAL text (read once into memory, never git checkout) and
 * confirms the test is green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0038: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0038_robot_match_log.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0038_robot_match_log_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0038-'));

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
  ['any member imports', "  select public._driver_member_ok() and (public.is_staff() or public.has_capability('robot.matches'));", "  select public._driver_member_ok();", [7, 9, 19]],
  ['the log readable by any signed-in account', "create policy robot_matches_read on public.robot_matches for select to authenticated using ((select public._driver_member_ok()));", "create policy robot_matches_read on public.robot_matches for select to authenticated using (true);", [11]],
  ['a client write grant on the table', "grant select on public.robot_matches to authenticated;\ndrop policy if exists robot_matches_read on public.robot_matches;\ncreate policy robot_matches_read on public.robot_matches for select to authenticated using ((select public._driver_member_ok()));", "grant select, insert, update on public.robot_matches to authenticated;\ndrop policy if exists robot_matches_read on public.robot_matches;\ncreate policy robot_matches_read on public.robot_matches for all to authenticated using ((select public._driver_member_ok())) with check (true);", [12]],
  ['re-import inserts again', "  if old.id is not null then return jsonb_build_object('status', 'already', 'match', to_jsonb(old)); end if;", "  if false then return null; end if;", [4]],
  ['the battery run written on every import of a merged match', "  if m.battery_id is not null and m.battery_run_id is null and coalesce((l ->> 'battery_run')::boolean, true) then", "  if m.battery_id is not null and coalesce((l ->> 'battery_run')::boolean, true) then", [15]],
  ['no Match Sim merge', "    if v_cand <> 1 then v_sim := null; end if;", "    v_sim := null;", [14]],
  ['raw editable through update', "    if not k = any(allowed) then raise exception 'Unknown robot match field %.', k using errcode = '22023'; end if;", "    null;", [10]],
  ['the other alliance score taken', "and x ->> 'alliance' = m.alliance", "", [18]],
  ['the drive session not logged', "  if m.driver_id is not null and m.drive_session_id is null and coalesce((l ->> 'drive_session')::boolean, true) then", "  if false then", [6]],
]

const base = runTest()
if (process.env.SHOW) console.log(spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' }).stdout)
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0038`); continue }
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
console.log(`mutants 0038: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
