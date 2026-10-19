#!/usr/bin/env node
/**
 * Mutation proof for 0014_session_signout_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0004,0014 --tests none \
 *     --node tools/sql-harness/mutants-0014.mjs
 *
 * Each mutant widens ONE rule 0014 adds (the self-OUT guard, the approver
 * check, the no-self-approval check, the read policies, the direct-write
 * revokes, the meeting window and kind checks, anon), runs the test, requires
 * the named check(s) to turn FAIL, then restores from the definition it read
 * first (never from git). Same mechanics as mutants-0012.mjs.
 *
 * Prints one line per mutant and `mutants 0014: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0014_session_signout_rls_test.sql');
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
const GUARD = 'public.attendance_events_self_out_guard()';
const CAN = 'public.can_approve_signouts()';
const MEET = 'public.meeting_checkin(uuid)';
const SR = 'public.signout_requests';
const MC = 'public.meeting_checkins';

const MUTANTS = [
  fn('the self-OUT guard lets everything through', GUARD, [["if new.type <> 'out' or", "if true or"]], [4]),
  fn('anyone can approve', CAN, [["select public.is_staff() or public.has_capability('signout.approve');", "select true;"]], [7]),
  // Removing the self-approval check alone is NOT a live mutant: approving your
  // own sign-out writes your own OUT, and the self-OUT guard refuses that too
  // (measured 2026-10-19: check 20 stays PASS). Two layers, so it is listed
  // here as equivalent rather than as a mutant.
  fn('the switch bypass is always on', GUARD, [["if current_setting('app.signout_switch', true) = 'on' then", "if true then"]], [4, 23]),
  fn('the switch never turns the bypass off', 'public.switch_to_fll(text, boolean, text)', [["perform set_config('app.signout_switch', 'off', true);", "perform 1;"]], [23]),
  fn('the switch accepts an FLL session', 'public.switch_to_fll(text, boolean, text)', [["or coalesce(v_last.category, 'build') = 'volunteer' then", "then"]], [22]),
  fn('late never recorded', MEET, [["case when now() <= v_ev.starts_at + interval '15 minutes' then 'present' else 'late' end", "'present'"]], [15]),
  fn('any event kind counts as a meeting', MEET, [["if v_ev.id is null or v_ev.kind <> 'meeting' then", 'if v_ev.id is null then']], [16]),
  grant('every request readable', `alter policy "sr select own or approver" on ${SR} using (true)`,
    `alter policy "sr select own or approver" on ${SR} using (member_id = auth.uid() or public.can_approve_signouts())`, [9]),
  grant('students write requests directly', `grant insert on ${SR} to authenticated; create policy zz_sr on ${SR} for insert to authenticated with check (true)`,
    `drop policy zz_sr on ${SR}; revoke insert on ${SR} from authenticated`, [3]),
  grant('every meeting check-in readable', `alter policy "mc select own or staff" on ${MC} using (true)`,
    `alter policy "mc select own or staff" on ${MC} using (member_id = auth.uid() or public.is_staff())`, [17]),
  grant('students write meeting check-ins directly', `grant insert on ${MC} to authenticated; create policy zz_mc on ${MC} for insert to authenticated with check (true)`,
    `drop policy zz_mc on ${MC}; revoke insert on ${MC} from authenticated`, [18]),
  grant('anon reads requests', `grant select on ${SR} to anon; create policy zz_anon on ${SR} for select to anon using (true)`,
    `drop policy zz_anon on ${SR}; revoke select on ${SR} from anon`, [19]),
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0014: baseline is not green, nothing to measure');
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
console.log(`mutants 0014: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
