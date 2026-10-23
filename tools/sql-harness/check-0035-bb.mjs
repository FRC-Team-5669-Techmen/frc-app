#!/usr/bin/env node
/**
 * 0035 against a Beach Blitz shaped event with the LIVE id, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/check-0035-bb.mjs
 *
 * The harness has no Beach Blitz event, so this builds one the way the 0028/0031 template
 * made it live (Friday load-in, Saturday Qualifications 1 to 6 and lunch watches, Sunday
 * Qualifications 7 and 8 in the morning, Alliance selection, Playoffs 1 and 2 after noon),
 * with a student already assigned as scout in Qualifications 1 and a staff edit giving
 * Qualifications 2 its own meet_team count. Then it pastes 0035 twice and checks:
 * 3 boxes in Qualifications 1, 3 to 6, 7 and 8; Qualifications 2 keeps the staff count;
 * none on lunch, practice, alliance selection or playoffs after noon; the existing request
 * untouched; the second paste changes nothing. Everything runs in its own event and is
 * deleted at the end.
 *
 * Prints one line per check and `check 0035 bb: N/N`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0035_meet_a_team.sql');
const PSQL = process.env.PSQL || 'psql';
const TMP = mkdtempSync(path.join(tmpdir(), 'bb0035-'));
const EV = 'f891929e-d8bb-4a3e-9f12-c5c0aca3e886';

const psql = (sql) => {
  const f = path.join(TMP, 'q.sql');
  writeFileSync(f, sql);
  return execFileSync(PSQL, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', f], { encoding: 'utf8' }).trim();
};
const paste = () => execFileSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', MIG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

psql(`
delete from public.events where id = '${EV}';
insert into public.events (id, title, kind, starts_at, ends_at) values ('${EV}', 'Beach Blitz 2026 (check)', 'competition', '2026-10-30 15:00-07', '2026-11-01 18:00-08');
insert into public.role_slots (event_id, day, label, starts_at, ends_at, needs, position)
select '${EV}', d::date, label, (d || ' ' || st)::timestamp at time zone 'America/Los_Angeles', (d || ' ' || en)::timestamp at time zone 'America/Los_Angeles', needs::jsonb, pos from (values
  ('2026-10-30', 'Practice matches 1', '18:30', '19:30', '{"scout":6}', 1),
  ('2026-10-31', 'Qualifications 1', '09:35', '10:45', '{"scout":6,"pit_crew":3}', 2),
  ('2026-10-31', 'Qualifications 2', '10:45', '12:00', '{"scout":6,"meet_team":5}', 3),
  ('2026-10-31', 'Qualifications 3', '13:00', '14:15', '{"scout":6}', 4),
  ('2026-10-31', 'Qualifications 4', '14:15', '15:30', '{"scout":6}', 5),
  ('2026-10-31', 'Qualifications 5', '15:30', '16:45', '{"scout":6}', 6),
  ('2026-10-31', 'Qualifications 6', '16:45', '18:00', '{"scout":6}', 7),
  ('2026-10-31', 'Lunch: pit watch A', '12:00', '12:30', '{"pit_crew":1,"battery_captain":1}', 900),
  ('2026-11-01', 'Qualifications 7', '08:30', '09:50', '{"scout":6}', 8),
  ('2026-11-01', 'Qualifications 8', '09:50', '11:15', '{"scout":6}', 9),
  ('2026-11-01', 'Alliance selection', '11:25', '11:55', '{"team_captain":1,"scouting_lead":1,"drive_coach":1}', 10),
  ('2026-11-01', 'Playoffs 1', '13:00', '15:00', '{"scout":6}', 11),
  ('2026-11-01', 'Playoffs 2', '15:00', '17:15', '{"scout":6}', 12)) as x(d, label, st, en, needs, pos);
insert into public.role_requests (slot_id, member_id, role, status)
select s.id, (select r.member_id from public.member_roles r where r.role = 'student' order by r.member_id limit 1), 'scout', 'assigned'
  from public.role_slots s where s.event_id = '${EV}' and s.label = 'Qualifications 1';
`);

const snap = () => psql(`select string_agg(label || '=' || coalesce(needs ->> 'meet_team', '-'), ',' order by position) from public.role_slots where event_id = '${EV}'`);
const reqs = () => psql(`select string_agg(r.role || ':' || r.status, ',') from public.role_requests r join public.role_slots s on s.id = r.slot_id where s.event_id = '${EV}'`);

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`); };

const before = reqs();
paste();
const first = snap();
const want = 'Practice matches 1=-,Qualifications 1=3,Qualifications 2=5,Qualifications 3=3,Qualifications 4=3,Qualifications 5=3,Qualifications 6=3,Qualifications 7=3,Qualifications 8=3,Alliance selection=-,Playoffs 1=-,Playoffs 2=-,Lunch: pit watch A=-';
check('3 boxes in each Saturday qualification and each Sunday morning one; none elsewhere; a staff count kept', first === want, first);
check('the existing assignment is untouched', reqs() === before && before === 'scout:assigned', reqs());
paste();
check('a second paste changes nothing', snap() === first, snap());
const other = psql(`select scout from (select (needs ->> 'scout') as scout from public.role_slots where event_id = '${EV}' and label = 'Qualifications 1') x`);
check('other needs in a slot are kept (scout 6 in Qualifications 1)', other === '6', other);
psql(`delete from public.events where id = '${EV}';`);
const n = results.filter(Boolean).length;
console.log(`check 0035 bb: ${n}/${results.length}`);
process.exit(n === results.length ? 0 : 1);
