#!/usr/bin/env node
/**
 * Proof for 0011_event_hub_parent_service_hours.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none \
 *     --node tools/sql-harness/check-0011.mjs
 *
 * 0011 changes no grant and no policy, so it has no _rls_test.sql sibling
 * (supabase/migrations/README.md rule 3). What it does change is three
 * function bodies and one column, and this script proves each, every
 * assertion with its opposite on the same fixture:
 *
 *   1. Beach Blitz 2026 carries the note, word for word.
 *   2. A second paste keeps a mentor edit (and fills an empty one).
 *   3. _hub_event_json and hub_join_info (as anon) carry the note when set,
 *      and carry null when it is cleared.
 *   4. _hub_export marks drove true on the day a family listed a car, false
 *      on a day it did not, and false for a family with no car; each day
 *      carries its date.
 *   5. anon still cannot call _hub_export or _hub_event_json, while it can
 *      call hub_join_info: the restated grants changed nothing.
 *
 * Every write runs inside begin ... rollback. Prints one line per check and
 * `check 0011: N/N passed`; exits 1 on any failure.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0011_event_hub_parent_service_hours.sql');
const PSQL = process.env.PSQL || 'psql';
const BB = 'b1b12026-0000-4000-8000-000000000001';
const NOTE = 'Driving, attending, and volunteering at Beach Blitz all count toward parent service hours.';
const RILEY = '00000000-0000-0000-0000-0000000000c2';
const CASEY = '00000000-0000-0000-0000-0000000000c3';

// Runs a script in one psql session; returns the tuples-only output lines.
function run(script) {
  const r = spawnSync(PSQL, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: script, encoding: 'utf8' });
  return { out: (r.stdout || '').trim().split('\n').filter(Boolean), err: (r.stderr || '').trim(), status: r.status };
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`);
};

// 1. The seeded note.
{
  const r = run(`select parent_service_hours_note from public.hub_events where id = '${BB}';`);
  check('Beach Blitz 2026 carries the note', r.out[0] === NOTE, r.out[0] ?? r.err);
}

// 2. Re-paste: a mentor edit stands, an empty note is filled.
{
  const r = run(`begin;
update public.hub_events set parent_service_hours_note = 'Mentor edit.' where id = '${BB}';
\\i ${MIG}
select parent_service_hours_note from public.hub_events where id = '${BB}';
update public.hub_events set parent_service_hours_note = null where id = '${BB}';
\\i ${MIG}
select parent_service_hours_note from public.hub_events where id = '${BB}';
rollback;`);
  check('a second paste keeps a mentor edit', r.out[0] === 'Mentor edit.', r.out[0] ?? r.err);
  check('a second paste fills a note that was cleared', r.out[1] === NOTE, r.out[1] ?? r.err);
}

// 3. The note reaches the pages, and null when cleared.
{
  const r = run(`begin;
select public._hub_event_json('${BB}') ->> 'parent_service_hours_note';
set local role anon;
select public.hub_join_info('${BB}') -> 'event' ->> 'parent_service_hours_note';
reset role;
update public.hub_events set parent_service_hours_note = null where id = '${BB}';
select coalesce(public._hub_event_json('${BB}') ->> 'parent_service_hours_note', '<null>'),
       (public._hub_event_json('${BB}') ? 'parent_service_hours_note')::text;
set local role anon;
select coalesce(public.hub_join_info('${BB}') -> 'event' ->> 'parent_service_hours_note', '<null>');
rollback;`);
  check('_hub_event_json carries the note', r.out[0] === NOTE, r.out[0] ?? r.err);
  check('hub_join_info, as anon, carries the note', r.out[1] === NOTE, r.out[1] ?? r.err);
  check('_hub_event_json carries null once the note is cleared', r.out[2] === '<null>|true', r.out[2] ?? r.err);
  check('hub_join_info carries null once the note is cleared', r.out[3] === '<null>', r.out[3] ?? r.err);
}

// 4. drove, per family per day, with the date.
{
  const r = run(`begin;
insert into public.hub_invites (id, event_id, student_id, emails) values
  ('e0110000-0000-4000-8000-000000000001', '${BB}', '${RILEY}', '{riley.family@example.com}'),
  ('e0110000-0000-4000-8000-000000000002', '${BB}', '${CASEY}', '{casey.family@example.com}');
insert into public.hub_cars (event_id, day_id, run, driver_invite_id, seats, description)
  select '${BB}', d.id, 'to', 'e0110000-0000-4000-8000-000000000001', 3, 'grey minivan'
    from public.hub_days d where d.event_id = '${BB}' order by d.day_date desc limit 1;
select (x ->> 'student') || '|' || (d ->> 'date') || '|' || (d ->> 'drove')
  from jsonb_array_elements(public._hub_export('${BB}')) x, jsonb_array_elements(x -> 'days') d
 order by x ->> 'student', d ->> 'date';
select max(day_date)::text from public.hub_days where event_id = '${BB}';
rollback;`);
  const last = r.out[r.out.length - 1];
  const rows = r.out.slice(0, -1).map((l) => l.split('|'))
  const riley = rows.filter((x) => x[0].startsWith('Riley'));
  const casey = rows.filter((x) => x[0].startsWith('Casey'));
  check('the export lists every day for each family', riley.length >= 2 && riley.length === casey.length, `${riley.length} and ${casey.length} days${r.err ? `; ${r.err}` : ''}`);
  check('drove is true on the day the family listed a car', riley.some((x) => x[1] === last && x[2] === 'true'), JSON.stringify(riley));
  check('drove is false on the days it did not', riley.filter((x) => x[1] !== last).every((x) => x[2] === 'false') && riley.some((x) => x[2] === 'false'), JSON.stringify(riley));
  check('drove is false for a family with no car', casey.length > 0 && casey.every((x) => x[2] === 'false'), JSON.stringify(casey));
  check('each day carries its date', rows.length > 0 && rows.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x[1])), JSON.stringify(rows.map((x) => x[1])));
}

// 5. The grants, both ways.
{
  const denied = (fn) => {
    const r = run(`begin; set local role anon; select public.${fn}('${BB}') is not null; rollback;`);
    return r.status !== 0 && /permission denied/.test(r.err);
  };
  const ok = run(`begin; set local role anon; select (public.hub_join_info('${BB}') ? 'event')::text; rollback;`);
  check('anon may call hub_join_info', ok.status === 0 && ok.out[0] === 'true', ok.out[0] ?? ok.err);
  check('anon may not call _hub_export', denied('_hub_export'));
  check('anon may not call _hub_event_json', denied('_hub_event_json'));
}

const passed = results.filter(Boolean).length;
console.log(`check 0011: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
