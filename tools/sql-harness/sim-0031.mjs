#!/usr/bin/env node
/**
 * 28 members filling the role board in AT ONCE (0031_role_board_v2), with
 * real concurrent sessions. Mr. Pina asked for this proof before showing the
 * board to the team. An SQL test is one session; this is 29.
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/sim-0031.mjs
 *
 * Setup (committed in the throwaway cluster): 28 synthetic students, one
 * event, three slots (Quals 1 and 2 need 6 scouts each, Lunch: pit watch A
 * needs 1 pit crew). Then, all at the same instant:
 *   28 student sessions, each asking for scout in both quals and pit crew at
 *     lunch, asking for scout in Quals 1 a second time, members 1 to 10
 *     taking Quals 1 back, members 1 to 5 asking for it again;
 *   1 mentor session, at the same time, adding himself as drive coach in
 *     Quals 1 and assigning or backing up whoever has asked so far.
 * Afterwards a second mentor pass assigns 7 scouts in Quals 1 and marks 2
 * backups, deterministically, and the counts are read back through
 * role_board as a student would.
 *
 * Also re-pastes 0031 over a Beach Blitz event with the live id carrying an
 * old Alliance selection slot with a request on it: the lunch watches arrive
 * once, the needs change in place, the slot and its request survive.
 *
 * Prints PASS/FAIL lines and `sim 0031: N/N passed`. Exits 1 on any FAIL.
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();
const N = 28;

function session(script) {
  return new Promise((resolve) => {
    const p = spawn(PSQL, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=0'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, out, err }));
    p.stdin.end(script);
  });
}
const lastLine = (out) => out.trim().split('\n').pop();
const as = (uid) => `select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', false), set_config('request.jwt.claim.sub', '${uid}', false);\nset role authenticated;\n`;

let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total += 1; if (ok) pass += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`) };

// ── setup ──
const ids = Array.from({ length: N }, (_, i) => `31000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const mentor = sql(`select member_id from public.member_roles where role = 'mentor' order by member_id limit 1`);
sql(`insert into auth.users (id, email) values ${ids.map((id, i) => `('${id}', 'sim31.${i + 1}@boscotech.edu')`).join(',')} on conflict do nothing;
insert into public.profiles (id) select id from auth.users where email like 'sim31.%' on conflict do nothing;
update public.profiles set approved = true, status = 'active', full_name = 'Sim ' || id::text where id::text like '31000000-%';
insert into public.member_roles (member_id, role) select id, 'student' from public.profiles where id::text like '31000000-%' on conflict do nothing;
insert into public.events (id, title, kind, starts_at, ends_at) values ('31000000-0000-4000-9000-000000000001', 'sim 0031', 'competition', now() + interval '1 day', now() + interval '3 days');
insert into public.role_slots (id, event_id, day, label, starts_at, ends_at, needs) values
 ('31000000-0000-4000-a000-000000000001', '31000000-0000-4000-9000-000000000001', current_date + 1, 'Quals 1', now() + interval '1 day', now() + interval '25 hours', '{"scout":6,"drive_coach":1}'),
 ('31000000-0000-4000-a000-000000000002', '31000000-0000-4000-9000-000000000001', current_date + 1, 'Quals 2', now() + interval '25 hours', now() + interval '26 hours', '{"scout":6}'),
 ('31000000-0000-4000-a000-000000000003', '31000000-0000-4000-9000-000000000001', current_date + 1, 'Lunch: pit watch A', now() + interval '27 hours', now() + interval '27.5 hours', '{"pit_crew":1,"battery_captain":1}');`);
const Q1 = '31000000-0000-4000-a000-000000000001', Q2 = '31000000-0000-4000-a000-000000000002', L = '31000000-0000-4000-a000-000000000003';

// ── 28 students and a mentor at once ──
const studentScript = (id, i) => as(id) + [
  `select public.role_request('${Q1}', 'scout') is not null;`,
  `select public.role_request('${Q2}', 'scout') is not null;`,
  `select public.role_request('${L}', 'pit_crew') is not null;`,
  `select public.role_request('${Q1}', 'scout') is not null;`,
  ...(i < 10 ? [`select public.role_withdraw('${Q1}', 'scout');`] : []),
  ...(i < 5 ? [`select public.role_request('${Q1}', 'scout') is not null;`] : []),
  `select public.role_board('31000000-0000-4000-9000-000000000001') is not null;`,
].join('\n') + '\n';
const mentorScript = as(mentor) + [
  `select public.staff_add_to_slot('${Q1}', '${mentor}', 'drive_coach', 'assigned') is not null;`,
  // whoever has asked for Quals 2 by now: assign or back up, mid-flight
  ...Array.from({ length: 6 }, () => `select count(public.staff_set_request_status(r.id, case when random() < 0.5 then 'assigned' else 'backup' end)) >= 0 from (select id from public.role_requests where slot_id = '${Q2}' order by random() limit 3) r;`),
].join('\n') + '\n';

const t0 = Date.now();
const results = await Promise.all([...ids.map((id, i) => session(studentScript(id, i))), session(mentorScript)]);
const ms = Date.now() - t0;
const errs = results.filter((r) => /ERROR/.test(r.err));
check(`29 concurrent sessions (28 students, 1 mentor) finish with no error`, errs.length === 0, `${ms} ms; ${errs.length} with errors${errs[0] ? `: ${errs[0].err.split('\n')[0]}` : ''}`);
const q = (s) => sql(s);
check('Quals 1 scout: 23 requests (28, minus 10 taken back, plus 5 asked again)', q(`select count(*) from public.role_requests where slot_id = '${Q1}' and role = 'scout'`) === '23');
check('Quals 2 scout: 28 requests; lunch pit crew: 28', q(`select count(*) from public.role_requests where slot_id = '${Q2}'`) === '28' && q(`select count(*) from public.role_requests where slot_id = '${L}'`) === '28');
check('no duplicate (slot, member, role) anywhere', q(`select count(*) from (select 1 from public.role_requests group by slot_id, member_id, role having count(*) > 1) d`) === '0');
check('the mentor is assigned drive coach in Quals 1, with no eligibility popup', q(`select status from public.role_requests where slot_id = '${Q1}' and member_id = '${mentor}' and role = 'drive_coach'`) === 'assigned');
check('mid-flight staff marks touched only Quals 2, and only with a valid status', q(`select count(*) from public.role_requests where slot_id <> '${Q2}' and status <> 'asked' and member_id <> '${mentor}'`) === '0'
  && q(`select count(*) from public.role_requests where status not in ('asked', 'assigned', 'backup')`) === '0');

// ── the deterministic staff pass ──
const q1rows = q(`select id from public.role_requests where slot_id = '${Q1}' and role = 'scout' order by member_id`).split('\n');
const staffPass = as(mentor) + q1rows.slice(0, 7).map((id) => `select public.staff_set_request_status('${id}', 'assigned') is not null;`).join('\n')
  + '\n' + q1rows.slice(7, 9).map((id) => `select public.staff_set_request_status('${id}', 'backup') is not null;`).join('\n') + '\n';
const sp = await session(staffPass);
check('the mentor assigns 7 to a box needing 6 and marks 2 backups, no error', !/ERROR/.test(sp.err), sp.err.split('\n')[0]);
const board = JSON.parse(lastLine((await session(as(ids[20]) + `select public.role_board('31000000-0000-4000-9000-000000000001');\n`)).out));
const c = board.slots.find((s) => s.id === Q1).counts.scout;
check('a student reads Quals 1 scout as 7 of 6 assigned, 2 backup, 14 asked', c.needed === 6 && c.assigned === 7 && c.backup === 2 && c.asked === 14, JSON.stringify(c));
const open = JSON.parse(lastLine((await session(as(ids[20]) + `select public.role_board_open_events();\n`)).out)).find((e) => e.event_id === '31000000-0000-4000-9000-000000000001');
const expected = Number(q(`select count(*) from public._role_slot_cells('31000000-0000-4000-9000-000000000001') where assigned < needed`));
check('Do this now unfilled = cells with assigned < needed', open && open.unfilled === expected && Number(q(`select count(*) from public._role_slot_cells('31000000-0000-4000-9000-000000000001') where slot_id = '${Q1}' and assigned < needed`)) === 0, `${open?.unfilled} vs ${expected}`);
const stu = await session(as(ids[3]) + `select public.staff_set_request_status('${q1rows[10]}', 'assigned');\n`);
check('a student session cannot set status', /Staff only/.test(stu.err) && q(`select status from public.role_requests where id = '${q1rows[10]}'`) === 'asked', stu.err.split('\n')[0]);

// ── the live Beach Blitz step, re-pasted over existing slots ──
const LIVE = 'f891929e-d8bb-4a3e-9f12-c5c0aca3e886';
sql(`insert into public.events (id, title, kind, starts_at, ends_at) values ('${LIVE}', 'Beach Blitz sim', 'competition', '2026-10-30 15:00-07', '2026-11-01 18:00-07') on conflict (id) do nothing;
insert into public.role_slots (id, event_id, day, label, starts_at, needs) values
 ('31000000-0000-4000-b000-000000000001', '${LIVE}', '2026-10-31', 'Qualifications 1', '2026-10-31 09:35-07', '{"scout":6}'),
 ('31000000-0000-4000-b000-000000000002', '${LIVE}', '2026-11-01', 'Alliance selection', '2026-11-01 11:25-07', '{"scouting_lead":1,"drive_coach":1,"scout":2}');
insert into public.role_requests (slot_id, member_id, role) values ('31000000-0000-4000-b000-000000000002', '${ids[0]}', 'scouting_lead');`);
const TMP = mkdtempSync(path.join(tmpdir(), 'sim0031-'));
const f = path.join(TMP, 'm.sql');
writeFileSync(f, readFileSync(path.join(REPO, 'supabase', 'migrations', '0031_role_board_v2.sql'), 'utf8'));
for (let i = 0; i < 2; i += 1) execFileSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
check('re-pasting 0031 twice adds the 4 lunch watches once (Sat and Sun, 12:00 and 12:30)',
  q(`select string_agg(day || ' ' || to_char(starts_at at time zone 'America/Los_Angeles', 'HH24:MI') || ' ' || label, ',' order by day, starts_at) from public.role_slots where event_id = '${LIVE}' and label like 'Lunch%'`)
  === '2026-10-31 12:00 Lunch: pit watch A,2026-10-31 12:30 Lunch: pit watch B,2026-11-01 12:00 Lunch: pit watch A,2026-11-01 12:30 Lunch: pit watch B');
check('Alliance selection keeps its id and its request; needs are exactly team captain, scouting lead, drive coach',
  q(`select needs::text from public.role_slots where id = '31000000-0000-4000-b000-000000000002'`) === '{"drive_coach": 1, "team_captain": 1, "scouting_lead": 1}'
  && q(`select count(*) from public.role_requests where slot_id = '31000000-0000-4000-b000-000000000002'`) === '1');
check('the board data from before the re-paste is intact (Quals 1 still 7 assigned, 2 backup)', q(`select count(*) filter (where status = 'assigned') || '/' || count(*) filter (where status = 'backup') from public.role_requests where slot_id = '${Q1}' and role = 'scout'`) === '7/2');

console.log(`sim 0031: ${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
