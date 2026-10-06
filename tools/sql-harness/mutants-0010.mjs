#!/usr/bin/env node
/**
 * Mutation proof for 0010_event_hub_roster_names_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none \
 *     --node tools/sql-harness/mutants-0010.mjs
 *
 * Each mutant breaks ONE rule 0010 adds, in the PERMISSIVE direction where
 * there is one (the mentor and admin exclusion dropped, Add them handed
 * everyone, the at-sign guard removed, a family link reading the signed-in
 * user, a helper granted to anon), then runs the test and requires the named
 * check(s) to turn FAIL, then restores the rule from the definition it read
 * before changing it (never from git). Same mechanics as mutants-0008.mjs.
 *
 * Prints one line per mutant and `mutants 0010: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0010_event_hub_roster_names_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();

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
  return { fails, rows, errored: r.status !== 0, err: (r.stderr || '').trim().split('\n').slice(-1)[0] };
}

const fn = (name, sig, find, replace, expect) => ({ name, kind: 'fn', sig, find, replace, expect });
const ROSTER = 'public._hub_roster_student(uuid)';
const NAME = 'public._hub_student_name(uuid)';

const MUTANTS = [
  // 1. who is on the roster
  fn('mentor and admin no longer excluded', ROSTER,
    "r.role in ('mentor', 'admin')", "r.role in ('nobody')", [3, 4, 5]),
  fn('admin no longer excluded', ROSTER,
    "r.role in ('mentor', 'admin')", "r.role in ('mentor')", [4, 5]),
  fn('lead excluded again (the rule before 0010)', ROSTER,
    "r.role in ('mentor', 'admin')", "r.role in ('mentor', 'lead', 'admin')", [1, 2, 5, 6]),
  fn('Add them makes an invite for every approved account', 'public._hub_sync_invites(uuid)',
    'where public._hub_roster_student(p.id)),', 'where p.approved),', [6]),
  fn('the readiness count keeps its own copy of the old rule', 'public._hub_overview(uuid)',
    'where public._hub_roster_student(p.id);',
    "where p.approved and p.status = 'active' and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student') and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'));",
    [6]),

  // 2. how a student is named
  fn('the application name ignored', NAME,
    'where ma.member_id = p_student\n      order by', 'where false\n      order by', [7, 9]),
  fn('the at-sign guard removed', 'public._hub_clean_name(text)',
    "case when v = '' or position('@' in v) > 0 or v ~* '^[a-z0-9._-]+\\.[0-9]{2,4}\\Z' then null else v end",
    "nullif(v, '')", [9]),
  fn('the profile name preferred over the application', NAME,
    "  select coalesce(\n    (select public._hub_clean_name(concat_ws",
    "  select coalesce(\n    (select coalesce(public._hub_clean_name(p.full_name), public._hub_clean_name(p.nickname)) from public.profiles p where p.id = p_student),\n    (select public._hub_clean_name(concat_ws",
    [7, 9]),
  fn('the surname read from the profile again', 'public._hub_family_surname(uuid)',
    "nullif(public._hub_student_name(i.student_id), 'A student')",
    '(select p.full_name from public.profiles p where p.id = i.student_id)', [7]),

  // 3. the family path never reads who is signed in
  fn('a family link opens the staff view for a signed-in staff member', 'public.hub_family_call(text,text,jsonb)',
    "      return public._hub_family_view(v_invite, 'family') || public._hub_family_extras(v_invite, p_token);",
    "      return public._hub_family_view(v_invite, case when public.is_staff() then 'staff' else 'family' end) || public._hub_family_extras(v_invite, p_token);",
    [10]),

  // 4. grants
  { name: 'the roster helper executable by anon', kind: 'sql',
    apply: 'grant execute on function public._hub_roster_student(uuid) to anon',
    restore: 'revoke execute on function public._hub_roster_student(uuid) from anon',
    expect: [12] },
  { name: 'the naming helper executable by authenticated', kind: 'sql',
    apply: 'grant execute on function public._hub_student_name(uuid) to authenticated',
    restore: 'revoke execute on function public._hub_student_name(uuid) from authenticated',
    expect: [12] },
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0010: baseline is not green, nothing to measure');
  process.exit(1);
}

let caught = 0;
for (const m of MUTANTS) {
  let restore;
  if (m.kind === 'sql') {
    sql(m.apply);
    restore = () => sql(m.restore);
  } else {
    const def = sql(`select pg_get_functiondef('${m.sig}'::regprocedure)`);
    if (!def.includes(m.find)) {
      console.log(`ABORT mutant "${m.name}": fragment not found in ${m.sig}`);
      process.exit(1);
    }
    const write = (text) => { execFileSync(PSQL, [...base, '-f', '-'], { input: text + '\n;', encoding: 'utf8' }); };
    write(def.replace(m.find, m.replace));
    restore = () => write(def);
  }
  const r = runTest();
  restore();
  const hit = m.expect.filter((n) => r.fails.has(n));
  const ok = hit.length === m.expect.length;
  if (ok) caught += 1;
  console.log(`${ok ? 'CAUGHT' : 'MISSED'} ${m.name} -- FAIL rows: ${[...r.fails].sort((a, b) => a - b).join(', ') || 'none'}; want ${m.expect.join(', ')}${r.errored ? ` (errored: ${r.err})` : ''}`);
}

const after = runTest();
console.log(`after restoring every mutant: ${after.rows} rows, ${after.fails.size} FAIL`);
const allGood = caught === MUTANTS.length && after.fails.size === 0 && !after.errored && after.rows === baseline.rows;
console.log(`mutants 0010: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
