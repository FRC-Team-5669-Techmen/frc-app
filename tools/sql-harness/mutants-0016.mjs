#!/usr/bin/env node
/**
 * Mutation proof for 0016_event_rosters_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0004,0005,0006,0007,0008,0009,0010,0011,0014,0015,0016 --tests none \
 *     --node tools/sql-harness/mutants-0016.mjs
 *
 * Each mutant widens ONE rule 0016 adds (each eligibility clause, the draft
 * roster read, staff-only marking, probation on a missed competition day,
 * conflict reads, the carpool lock, freeze and cascade exception, the 48-hour
 * sign-up rule), runs the test, requires the named check(s) to turn FAIL, then
 * restores from the definition it read first (never git).
 *
 * Prints one line per mutant and `mutants 0016: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0016_event_rosters_rls_test.sql');
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

const fn = (name, sig, pairs, expect) => ({ name, kind: 'fn', sig, pairs, expect });
const grant = (name, apply, restore, expect) => ({ name, kind: 'sql', apply, restore, expect });

const MUTANTS = [
  fn('probation never blocks a role', 'public.event_role_blocker(uuid,uuid,text)',
    [["r.kind in ('meetings', 'hours') and r.status in ('open', 'proposed')) then", "r.kind in ('meetings', 'hours') and r.status in ('open', 'proposed') and false) then"]], [4]),
  fn('grades probation never blocks', 'public.event_role_blocker(uuid,uuid,text)',
    [["r.kind = 'grades' and r.status = 'open') then", "r.kind = 'grades' and r.status = 'open' and false) then"]], [5]),
  fn('a suspension never blocks', 'public.event_role_blocker(uuid,uuid,text)',
    [["and public._la_date(ev.starts_at) <= d.ends_on and public._la_date(ev.ends_at) >= d.starts_on) then", "and false) then"]], [6]),
  fn('missing Kickoff never blocks', 'public._missed_kickoff(uuid)',
    [["if k.id is null or k.ends_at > now() then return false; end if;", 'return false;']], [7]),
  fn('anyone assigns roles', 'public.staff_assign_role(uuid,uuid,text,text)',
    [['if not public.is_staff() then', 'if false then']], [3]),
  fn('a missed competition day opens nothing', 'public.staff_mark_event_day(uuid,date,uuid,text,text)',
    [["if p_status = 'absent' and", "if false and"]], [10]),
  fn('anyone marks attendance', 'public.staff_mark_event_day(uuid,date,uuid,text,text)',
    [['if not public.is_staff() then', 'if false then']], [11]),
  fn('the carpool lock lets families through', 'public.carpool_lock_guard()',
    [["and now() < v_leave and not public.is_staff() then", "and now() < v_leave and false then"]], [13]),
  fn('no freeze in the last 12 hours', 'public.carpool_lock_guard()',
    [["if now() >= v_leave - interval '12 hours' and now() < v_leave + interval '1 day' then", 'if false then']], [14]),
  fn('a cascade is blocked too', 'public.carpool_lock_guard()',
    [['if pg_trigger_depth() > 1 then return coalesce(new, old); end if;', '']], [14]),
  fn('a missing sign-up opens nothing', 'public.event_signup_check()',
    [["if r.mandatory and public._standing_member(r.student_id) then", "if false then"]], [15]),
  grant('draft rosters readable by everyone', 'alter policy "event roles read" on public.event_roles using (true)',
    'alter policy "event roles read" on public.event_roles using (public.is_staff() or exists (select 1 from public.event_rosters r where r.event_id = event_roles.event_id))', [8]),
  grant('every conflict readable', 'alter policy "conflicts read" on public.member_conflicts using (true)',
    'alter policy "conflicts read" on public.member_conflicts using (public._can_see_member(member_id))', [12]),
  grant('anon reads roles', 'grant select on public.event_roles to anon; create policy zz_a on public.event_roles for select to anon using (true)',
    'drop policy zz_a on public.event_roles; revoke select on public.event_roles from anon', [17]),
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0016: baseline is not green, nothing to measure');
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
    let next = def;
    for (const [find, replace] of m.pairs) {
      if (!next.includes(find)) {
        console.log(`ABORT mutant "${m.name}": fragment not found in ${m.sig}: ${find}`);
        process.exit(1);
      }
      next = next.replace(find, replace);
    }
    const write = (text) => { execFileSync(PSQL, [...base, '-f', '-'], { input: text + '\n;', encoding: 'utf8' }); };
    write(next);
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
console.log(`mutants 0016: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
