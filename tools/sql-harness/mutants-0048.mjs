#!/usr/bin/env node
/**
 * Mutation proof for 0048_frc_feedback_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0048.mjs
 *
 * Each mutant rewrites ONE clause of 0048 in the PERMISSIVE direction, re-pastes
 * the file, runs the test and requires the named check(s) to turn FAIL; then it
 * re-pastes the ORIGINAL text (read once into memory, never git checkout) and
 * confirms the test is green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0048: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0048_frc_feedback.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0048_frc_feedback_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0048-'));

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

const serviceFunctions = [...ORIGINAL.matchAll(/^revoke execute on function (public\.[^\n]+?) from [^;]+;/gm)].map(m => ({ find: m[0], sig: m[1] }))
if (serviceFunctions.length !== 14) throw new Error('Expected 14 changed function grants')

// [name, find, replace, checks that must FAIL]
const MUTANTS = [
  ['withdrawn probations count again', "and status <> 'dismissed'", '', [1]],
  ['NFC check-ins ignored during meetings', "where a.user_id = p_member and a.type = 'in'\n        and a.event_time >= e.starts_at", "where a.user_id = p_member and a.type = 'in' and coalesce(a.manual_entry,false)\n        and a.event_time >= e.starts_at", [3]],
  ['meeting day uses UTC instead of Los Angeles', 'and public._la_date(e.starts_at) between p_from and p_to;', 'and e.starts_at::date between p_from and p_to;', [32,33]],
  ['evidence includes the following day', 'and v.day >= f and v.day < t));', 'and v.day between f and t));', [48]],
  ['snapshot loses the last day of a week', "t := case when basis = 'week' then f + 7", "t := case when basis = 'week' then f + 6", [35,36]],
  ['staff evidence open to members', "if auth.uid() is null or not public.is_staff() then", "if false then", [9]],
  ['raw evidence table made readable', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role;', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role; grant select on public.standing_record_evidence to authenticated; drop policy if exists mutant48 on public.standing_record_evidence; create policy mutant48 on public.standing_record_evidence for select to authenticated using (true);', [10]],
  ['snapshot client writes opened', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role;', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role; grant all on public.standing_record_evidence to authenticated; drop policy if exists mutant48_write on public.standing_record_evidence; create policy mutant48_write on public.standing_record_evidence for all to authenticated using (true) with check (true);', [44,45,46,47]],
  ['pause ownership ignored', 'if v.id is null or v.user_id <> auth.uid() then', 'if v.id is null then', [13,14]],
  ['unapproved inactive or roleless accounts can pause', "if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved and p.status = 'active')\n    or not (public.has_role('student') or public.is_staff()) then", 'if false then', [25,26,27]],
  ['closed sessions may pause', "if v.type <> 'in' or last_id <> v.id or not (", "if v.type <> 'in' or not (", [20]],
  ['client may forge pause history', "if current_user in ('anon','authenticated') then", 'if false then', [16,17]],
  ['pause end not recorded at checkout', "if n > 0 and v.pauses -> (n-1) ->> 'end' is null then", 'if false then', [19]],
  ['SQL credits paused time', "- public._pause_seconds(pauses,event_time,least(ntime,event_time + interval '12 hours'))", '', [21]],
  ['all SQL pause deductions disabled', 'select coalesce(sum(extract(epoch from upper(span)-lower(span))),0) from merged;', 'select 0::numeric;', [21,29,30,31]],
  ['unverified logged work counts in standing', "l.member_id=p_member and l.status='verified'", 'l.member_id=p_member', [37,40]],
  ['private weekly helper readable by members', 'revoke execute on function public._standing_week_hours(uuid,timestamptz,timestamptz) from public, anon, authenticated, service_role;', 'revoke execute on function public._standing_week_hours(uuid,timestamptz,timestamptz) from public, anon, authenticated, service_role; grant execute on function public._standing_week_hours(uuid,timestamptz,timestamptz) to authenticated;', [41]],
  ['private meeting details executable by clients', 'revoke execute on function public._standing_meeting_details(uuid,date,date) from public, anon, authenticated, service_role;', 'revoke execute on function public._standing_meeting_details(uuid,date,date) from public, anon, authenticated, service_role; grant execute on function public._standing_meeting_details(uuid,date,date) to public;', [49]],
  ['private evidence constructor executable by clients', 'revoke execute on function public._standing_evidence(uuid,text) from public, anon, authenticated, service_role;', 'revoke execute on function public._standing_evidence(uuid,text) from public, anon, authenticated, service_role; grant execute on function public._standing_evidence(uuid,text) to public;', [50]],
  ['pause arithmetic executable by clients', 'revoke execute on function public._pause_seconds(jsonb,timestamptz,timestamptz) from public, anon, authenticated, service_role;', 'revoke execute on function public._pause_seconds(jsonb,timestamptz,timestamptz) from public, anon, authenticated, service_role; grant execute on function public._pause_seconds(jsonb,timestamptz,timestamptz) to public;', [22,51]],
  ['weekly hours executable by anon', 'revoke execute on function public._standing_week_hours(uuid,timestamptz,timestamptz) from public, anon, authenticated, service_role;', 'revoke execute on function public._standing_week_hours(uuid,timestamptz,timestamptz) from public, anon, authenticated, service_role; grant execute on function public._standing_week_hours(uuid,timestamptz,timestamptz) to anon;', [43]],
  ...['_protect_attendance_pauses','_end_attendance_pause','_capture_standing_evidence'].map(name => [
    `${name} executable by clients`, `revoke execute on function public.${name}() from public, anon, authenticated, service_role;`,
    `revoke execute on function public.${name}() from public, anon, authenticated, service_role; grant execute on function public.${name}() to public;`, [52]]),
  ['anonymous snapshot-table access', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role;', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role; grant all on public.standing_record_evidence to anon; drop policy if exists mutant48_anon on public.standing_record_evidence; create policy mutant48_anon on public.standing_record_evidence for all to anon using(true) with check(true);', [53]],
  ['anonymous staff evidence execute', 'revoke execute on function public.staff_standing_evidence(uuid) from public, anon, service_role;', 'revoke execute on function public.staff_standing_evidence(uuid) from public, anon, service_role; grant execute on function public.staff_standing_evidence(uuid) to anon;', [23]],
  ['anonymous pause access', 'revoke execute on function public.set_session_paused(uuid,boolean) from public, anon, service_role;', 'revoke execute on function public.set_session_paused(uuid,boolean) from public, anon, service_role; grant execute on function public.set_session_paused(uuid,boolean) to anon;', [23]],
  ...serviceFunctions.map(({find,sig}) => [`${sig} opened to service_role`, find, `${find} grant execute on function ${sig} to service_role;`, [54]]),
  ['snapshot table opened to service_role', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role;', 'revoke all on public.standing_record_evidence from public, anon, authenticated, service_role; grant all on public.standing_record_evidence to service_role;', [54]],
]

const base = runTest()
if (process.env.SHOW) console.log(spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' }).stdout)
if (base.errored || base.fails.size || base.rows !== 54) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0048`); continue }
  // A grant mutant needs the revoke to stay first, so the whole file is
  // re-pasted with the one change; anon loses the grant again on restore.
  paste(ORIGINAL.replace(find, () => replace)) // a function: a $' in the replacement must stay literal
  const r = runTest()
  // Only named failing rows from a complete run count. A SQL crash proves nothing.
  const hit = !r.errored && r.rows === base.rows && want.every((n) => r.fails.has(n))
  if (hit) caught += 1
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`)
  paste('drop policy if exists mutant48 on public.standing_record_evidence; drop policy if exists mutant48_write on public.standing_record_evidence; drop policy if exists mutant48_anon on public.standing_record_evidence;\n' + ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1) }
}
console.log(`mutants 0048: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
