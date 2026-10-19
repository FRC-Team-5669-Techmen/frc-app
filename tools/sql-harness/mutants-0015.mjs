#!/usr/bin/env node
/**
 * Mutation proof for 0015_member_standing_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0004,0014,0015 --tests none \
 *     --node tools/sql-harness/mutants-0015.mjs
 *
 * Each mutant widens ONE rule 0015 adds (who sees a member's record, the
 * 24-hour and mandatory-event rules, the unanswered-counts-as-excused rule,
 * the 14-day break-week rule, staff-only logging, admin-only removal and
 * confirmation, the third-safety threshold, the evaluation proposing removal,
 * read policies, the FLL cap), runs the test, requires the named check(s) to
 * turn FAIL, then restores from the definition it read first (never git).
 *
 * Prints one line per mutant and `mutants 0015: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0015_member_standing_rls_test.sql');
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
  fn('everyone can see every member record', 'public._can_see_member(uuid)',
    [['select auth.uid() = p_member or public.is_staff()', 'select true or public.is_staff()']], [7, 11, 20, 23]),
  fn('the 24-hour rule dropped', 'public.request_absence(uuid,text,text,boolean)',
    [["if now() > ev.starts_at - interval '24 hours' then", 'if false then']], [3]),
  fn('a mandatory event takes any reason', 'public.request_absence(uuid,text,text,boolean)',
    [["if v_mandatory and not (p_reason = 'religious'", "if false and not (p_reason = 'religious'"]], [5]),
  fn('anyone decides an absence', 'public.decide_absence(uuid,boolean,text)',
    [['if not public.is_staff() then', 'if false then']], [8]),
  fn('an unanswered request never counts', 'public._absence_excused(uuid,uuid,timestamp with time zone)',
    [["or (a.status = 'pending' and a.requested_at <= p_starts and now() >= p_starts)", '']], [9]),
  fn('a break week posted any time', 'public.staff_set_week(date,text,text)',
    [['if p_week < public._la_today() + 14 then', 'if false then']], [10]),
  fn('anyone logs discipline', 'public.staff_log_discipline(uuid,text,text,text,date,date)',
    [['if not public.is_staff() then', 'if false then']], [11]),
  fn('any staff removes a member', 'public.staff_log_discipline(uuid,text,text,text,date,date)',
    [["if p_level = 'removal' and not public.is_admin() then", 'if false then']], [13]),
  fn('the first safety violation reaches the admins', 'public.staff_log_safety(uuid,text,text)',
    [['if n >= 3 then', 'if n >= 1 then']], [14]),
  fn('anyone runs the evaluation', 'public.standing_evaluate()',
    [['if auth.uid() is not null and not public.is_admin() then', 'if false then']], [17]),
  fn('removal never proposed', 'public._propose_removal(uuid,text,date)',
    [["if exists (select 1 from public.standing_records where member_id = p_member and kind = 'removal' and status = 'proposed') then return; end if;", 'return;']], [18]),
  fn('any staff confirms a removal', 'public.admin_confirm_standing(uuid,boolean,text)',
    [['if not public.is_admin() then', 'if false then']], [21]),
  fn('a student voids a session', 'public.staff_void_session(uuid,text)',
    [['if not public.is_staff() then', 'if false then']], [25]),
  fn('five mentors per FLL team', 'public.fll_join(uuid)',
    [['if n >= 4 then', 'if n >= 5 then']], [26]),
  grant('every incident readable', 'alter policy "incidents read reporter staff" on public.incident_reports using (true)',
    'alter policy "incidents read reporter staff" on public.incident_reports using (reported_by = auth.uid() or public.is_staff())', [16]),
  grant('the outbox readable by anyone signed in', 'alter policy "outbox staff read" on public.notice_outbox using (true)',
    'alter policy "outbox staff read" on public.notice_outbox using (public.is_admin())', [24]),
  grant('notices writable directly', 'grant update on public.member_notices to authenticated; create policy zz_n on public.member_notices for update to authenticated using (true) with check (true)',
    'drop policy zz_n on public.member_notices; revoke update on public.member_notices from authenticated', [23]),
  grant('anon reads the outbox', 'grant select on public.notice_outbox to anon; create policy zz_a on public.notice_outbox for select to anon using (true)',
    'drop policy zz_a on public.notice_outbox; revoke select on public.notice_outbox from anon', [24]),
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0015: baseline is not green, nothing to measure');
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
console.log(`mutants 0015: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
