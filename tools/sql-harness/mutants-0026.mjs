#!/usr/bin/env node
/**
 * Mutation proof for 0026_battery_log_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0026.mjs
 *
 * Each mutant rewrites ONE clause of 0026 in the PERMISSIVE direction (the
 * read policy, the parent-only exclusion, the staff check on adding and on
 * retiring, the 24-hour author window, the other-author check, a client
 * write grant, the retired-battery refusal), re-pastes the rewritten file,
 * runs the test and requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0026: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0026_battery_log.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0026_battery_log_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0026-'));

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
  ['the read policy opened to every signed-in caller',
    "create policy batteries_read on public.batteries for select to authenticated using ((select public._battery_member_ok()));",
    "create policy batteries_read on public.batteries for select to authenticated using (true);", [5]],
  ['the parent-only exclusion dropped from eligibility',
    "       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')\n            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));",
    "       and (true or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));", [20]],
  ['eligibility accepts any role, parents included',
    "r.role in ('student', 'mentor', 'lead', 'admin'))\n       and (not exists",
    "r.role in ('student', 'mentor', 'lead', 'admin', 'parent'))\n       and (true or not exists", [5, 8, 20]],
  ['anyone eligible may add a numbered set',
    "  if not public.is_staff() or not public._battery_member_ok() then raise exception 'Only staff can add batteries.'",
    "  if not public._battery_member_ok() then raise exception 'Only staff can add batteries.'", [1]],
  ['anyone eligible may edit or retire a battery',
    "  if not public.is_staff() or not public._battery_member_ok() then raise exception 'Only staff can add or change batteries.'",
    "  if not public._battery_member_ok() then raise exception 'Only staff can add or change batteries.'", [13]],
  ['the 24-hour window dropped',
    "(r.member_id <> auth.uid() or r.created_at < now() - interval '24 hours')",
    "(r.member_id <> auth.uid())", [11]],
  ['any student may edit any run',
    "(r.member_id <> auth.uid() or r.created_at < now() - interval '24 hours')",
    "(r.created_at < now() - interval '24 hours')", [10]],
  ['a client write grant on the tables',
    "grant select on public.batteries, public.battery_runs to authenticated;",
    "grant select, insert, update, delete on public.batteries, public.battery_runs to authenticated;\ndrop policy if exists zz_mut_i on public.batteries;\ncreate policy zz_mut_i on public.batteries for insert to authenticated with check (true);\ndrop policy if exists zz_mut_u on public.batteries;\ncreate policy zz_mut_u on public.batteries for update to authenticated using (true) with check (true);\ndrop policy if exists zz_mut_ru on public.battery_runs;\ncreate policy zz_mut_ru on public.battery_runs for update to authenticated using (true) with check (true);\ndrop policy if exists zz_mut_rd on public.battery_runs;\ncreate policy zz_mut_rd on public.battery_runs for delete to authenticated using (true);", [16, 17]],
  ['a retired battery still takes a run',
    "  if b.status = 'retired' then raise exception",
    "  if false then raise exception", [14]],
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
  paste(ORIGINAL.replace(find, replace))
  const r = runTest()
  const hit = want.every((n) => r.fails.has(n))
  if (hit) caught += 1
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`)
  paste(ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1) }
}
console.log(`mutants 0026: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
