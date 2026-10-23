-- ============================================================
-- 0028_role_interest_board test (role board, autos, simulated matches,
-- season applications). Run AFTER 0028. SAFE ON LIVE DATA: one transaction
-- ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: students A and B, a mentor M, a parent-only account P.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.role_board(uuid)') is null then
    raise exception 'Cannot test: 0028_role_interest_board.sql has not been applied';
  end if;
end
$applied$;

create temp table t28_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t28_fx (a uuid, b uuid, m uuid, p uuid, ev uuid, slot uuid, routine uuid) on commit drop;
grant all on t28_fx, t28_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
)
insert into t28_fx (a, b, m, p)
select (select id from ns where rn = 1), (select id from ns where rn = 2),
       (select r.member_id from public.member_roles r where r.role = 'mentor' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('student', 'mentor', 'lead', 'admin'))
         order by r.member_id limit 1);


do $pre$
declare f t28_fx;
begin
  select * into f from t28_fx;
  if f.b is null or f.m is null or f.p is null then raise exception 'Cannot test: need two students, a mentor and a parent-only account'; end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  if p_who is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_who::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end
$fn$;
create function pg_temp.clear() returns void language plpgsql as $fn$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;
create function pg_temp.rec(n int, name text, ok boolean, detail text) returns void language sql as $fn$
  insert into t28_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
$fn$;
create function pg_temp.call_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.clear();
  return v;
end
$fn$;


-- Fixture: one competition two days long starting tomorrow, one battery.
insert into public.events (id, title, kind, starts_at, ends_at) select gen_random_uuid(), '0028 test regional', 'competition', now() + interval '1 day', now() + interval '3 days';
update t28_fx set ev = (select id from public.events where title = '0028 test regional');

-- 1-3. Slots: staff add and template; a student cannot.
do $c$
declare f t28_fx; rs text; rm text; rt text; rt2 text;
begin
  select * into f from t28_fx;
  rs := pg_temp.call_as(f.a, format($q$select public.staff_save_slot(null, %L::uuid, current_date + 1, 'Quals 1', now() + interval '1 day', now() + interval '1 day 1 hour', '{"scout":2,"driver":1}'::jsonb)::text$q$, f.ev));
  perform pg_temp.rec(1, 'a student cannot add a time slot; nothing is written', rs like 'err:42501:%' and not exists (select 1 from public.role_slots where event_id = f.ev), left(rs, 60));
  rm := pg_temp.call_as(f.m, format($q$select public.staff_save_slot(null, %L::uuid, current_date + 1, 'Quals 1', now() + interval '1 day', now() + interval '1 day 1 hour', '{"scout":2,"driver":1}'::jsonb)::text$q$, f.ev));
  update t28_fx set slot = (rm::jsonb ->> 'id')::uuid where rm like '{%';
  perform pg_temp.rec(2, 'a mentor adds a slot needing 2 scouts and 1 driver (positive control)', rm like '{%' and (select needs from public.role_slots where id = (rm::jsonb ->> 'id')::uuid) = '{"scout":2,"driver":1}'::jsonb, left(rm, 60));
  rt := pg_temp.call_as(f.m, format($q$select public.staff_apply_slot_template(%L::uuid, %L::uuid)::text$q$, f.ev, (select id from public.role_slot_templates where name = 'Beach Blitz (3 days, Friday load-in)')));
  rt2 := pg_temp.call_as(f.m, format($q$select public.staff_apply_slot_template(%L::uuid, %L::uuid)::text$q$, f.ev, (select id from public.role_slot_templates where name = 'Beach Blitz (3 days, Friday load-in)')));
  perform pg_temp.rec(3, 'the Beach Blitz template adds 16 slots once; a second apply adds none',
    rt = '16' and rt2 = '0' and (select count(*) from public.role_slots where event_id = f.ev and created_by = f.m) = 17
    and (select max(needs ->> 'scout') from public.role_slots where event_id = f.ev and label = 'Qualifications 1') = '6'
    and (select max(to_char(starts_at at time zone 'America/Los_Angeles', 'HH24:MI')) from public.role_slots where event_id = f.ev and label = 'Qualifications 1') = '09:35', format('%s, %s', rt, rt2));
end
$c$;

-- 4-7. Requests: any student, for themself; parent-only nobody; the board shows who asked.
do $c$
declare f t28_fx; ra text; rb text; rp text; bad text; board text; bp text;
begin
  select * into f from t28_fx;
  ra := pg_temp.call_as(f.a, format($q$select public.role_request(%L::uuid, 'scout')::text$q$, f.slot));
  rb := pg_temp.call_as(f.b, format($q$select public.role_request(%L::uuid, 'scout')::text$q$, f.slot));
  perform pg_temp.rec(4, 'two students request scout in the slot, each as themself', ra like '{%' and rb like '{%'
    and (select count(*) from public.role_requests where slot_id = f.slot and role = 'scout') = 2
    and (select member_id from public.role_requests where id = (ra::jsonb ->> 'id')::uuid) = f.a, left(ra, 40));
  rp := pg_temp.call_as(f.p, format($q$select public.role_request(%L::uuid, 'scout')::text$q$, f.slot));
  perform pg_temp.rec(5, 'a parent-only account cannot request; still 2', rp like 'err:42501:%' and (select count(*) from public.role_requests where slot_id = f.slot) = 2, left(rp, 50));
  bad := pg_temp.call_as(f.a, format($q$select public.role_request(%L::uuid, 'media')::text$q$, f.slot));
  perform pg_temp.rec(6, 'a role the slot does not need is refused', bad like 'err:22023:%', left(bad, 50));
  board := pg_temp.call_as(f.b, format($q$select public.role_board(%L::uuid)::text$q$, f.ev));
  bp := pg_temp.call_as(f.p, format($q$select public.role_board(%L::uuid)::text$q$, f.ev));
  perform pg_temp.rec(7, 'a student reads the board with both requesters by name; a parent-only account reads nothing',
    board like '{%' and (select count(*) from jsonb_array_elements(board::jsonb -> 'slots') s, jsonb_array_elements(s -> 'requests') r where r ->> 'role' = 'scout') = 2
    and bp like 'err:42501:%', left(bp, 40));
end
$c$;

-- 8-9. Withdraw: own only. B withdraws scout on the cell A and B both
-- asked for: B's request goes, A's stays.
do $c$
declare f t28_fx; wb text; wa text;
begin
  select * into f from t28_fx;
  wb := pg_temp.call_as(f.b, format($q$select public.role_withdraw(%L::uuid, 'scout')::text$q$, f.slot));
  perform pg_temp.rec(8, 'withdrawing removes only your own request: B goes, A stays',
    wb = '1' and exists (select 1 from public.role_requests where slot_id = f.slot and member_id = f.a and role = 'scout')
    and not exists (select 1 from public.role_requests where slot_id = f.slot and member_id = f.b and role = 'scout'), wb);
  insert into public.role_requests (slot_id, member_id, role) values (f.slot, f.b, 'scout');
  insert into public.role_requests (slot_id, member_id, role) select f.slot, f.a, 'driver';
  wa := pg_temp.call_as(f.b, format($q$delete from public.role_requests where member_id = %L returning id::text$q$, f.a));
  perform pg_temp.rec(9, 'no direct delete of another member request', wa like 'err:42501:%' and (select count(*) from public.role_requests where member_id = f.a) = 2, left(wa, 40));
  delete from public.role_requests where member_id = f.a and role = 'driver';
end
$c$;

-- 10-12. Assign from a request: staff only, through staff_assign_role (eligibility runs).
do $c$
declare f t28_fx; req uuid; rs text; rm text; blocked text; r2 uuid;
begin
  select * into f from t28_fx;
  select id into req from public.role_requests where slot_id = f.slot and member_id = f.a and role = 'scout';
  rs := pg_temp.call_as(f.b, format($q$select public.staff_assign_from_request(%L::uuid)::text$q$, req));
  perform pg_temp.rec(10, 'a student cannot assign from a request', rs like 'err:42501:%' and not exists (select 1 from public.event_roles where event_id = f.ev), left(rs, 40));
  rm := pg_temp.call_as(f.m, format($q$select public.staff_assign_from_request(%L::uuid)::text$q$, req));
  perform pg_temp.rec(11, 'a mentor assigns: one event_roles row, scout, for that student, with the slot in the reason',
    rm like '{%' and (select count(*) from public.event_roles where event_id = f.ev and member_id = f.a and role = 'scout' and reason like '%Quals 1%') = 1, left(rm, 60));
  -- Hours probation blocks the drive team (event_role_blocker), even from a request.
  insert into public.standing_records (member_id, kind, status, reason, opened_on) values (f.b, 'hours', 'open', '0028 test', current_date);
  insert into public.role_requests (slot_id, member_id, role) values (f.slot, f.b, 'driver') returning id into r2;
  blocked := pg_temp.call_as(f.m, format($q$select public.staff_assign_from_request(%L::uuid)::text$q$, r2));
  perform pg_temp.rec(12, 'eligibility still runs: a student on hours probation cannot be assigned driver from a request',
    blocked like 'err:22023:%probation%' and not exists (select 1 from public.event_roles where event_id = f.ev and member_id = f.b), left(blocked, 70));
end
$c$;

-- 13. battery captain is an event role now.
do $c$
declare f t28_fx; r text;
begin
  select * into f from t28_fx;
  r := pg_temp.call_as(f.m, format($q$select public.staff_assign_role(%L::uuid, %L::uuid, 'battery_captain', 'Owns the charger')::text$q$, f.ev, f.a));
  perform pg_temp.rec(13, 'battery_captain is accepted by event_roles', r not like 'err:%' and exists (select 1 from public.event_roles where event_id = f.ev and member_id = f.a and role = 'battery_captain'), left(r, 60));
end
$c$;

-- 14-16. Autos.
do $c$
declare f t28_fx; rs text; rm text; ra text; rp text; rold text;
begin
  select * into f from t28_fx;
  rs := pg_temp.call_as(f.a, $q$select public.auto_save_routine(null, 'Two-piece left')::text$q$);
  rm := pg_temp.call_as(f.m, $q$select public.auto_save_routine(null, 'Two-piece left', 'Left of HUB', 'Shoots preload, intakes two')::text$q$);
  update t28_fx set routine = (select id from public.auto_routines where name = 'Two-piece left');
  perform pg_temp.rec(14, 'staff add a routine; a student cannot', rs like 'err:42501:%' and not exists (select 1 from public.auto_routines where created_by = f.a), left(rs, 30));
  select * into f from t28_fx;
  ra := pg_temp.call_as(f.a, format($q$select public.auto_log_run(%L::uuid, 'success', null, null, 'Shop field')::text$q$, f.routine));
  rp := pg_temp.call_as(f.p, format($q$select public.auto_log_run(%L::uuid, 'success')::text$q$, f.routine));
  perform pg_temp.rec(15, 'a student logs a run as themself; a parent-only account cannot',
    ra like '{%' and rp like 'err:42501:%' and (select member_id from public.auto_runs where id = (ra::jsonb ->> 'id')::uuid) = f.a, left(rp, 40));
  update public.auto_runs set created_at = now() - interval '25 hours' where id = (ra::jsonb ->> 'id')::uuid;
  rold := pg_temp.call_as(f.a, format($q$select public.auto_edit_run(%L::uuid, 'fail')::text$q$, (ra::jsonb ->> 'id')));
  perform pg_temp.rec(16, 'after 24 hours the author cannot change the result', rold like 'err:42501:%' and (select result from public.auto_runs where id = (ra::jsonb ->> 'id')::uuid) = 'success', left(rold, 40));
end
$c$;

-- 17-18. A simulated match writes its auto run and its battery run together.
do $c$
declare f t28_fx; r text; rp text; bat uuid;
begin
  select * into f from t28_fx;
  insert into public.batteries (label, status, charge_state) values ('SIM1', 'competition', 'charged') returning id into bat;
  r := pg_temp.call_as(f.a, format($q$select public.sim_save_match(now() - interval '3 minutes', now(), 'red', 'blue', %L::uuid, null, null, null, %L::uuid, %L::uuid, 'partial', 3, 12, 'level2', 12.9, 11.6, 'no', 'Fed 10 FUEL from the chute', 'Missed the second pickup')::text$q$, f.a, bat, f.routine));
  perform pg_temp.rec(17, 'a simulated match saves with its auto run (partial) and battery run (practice match, 12.9 V), linked',
    r like '{%' and (select result from public.auto_runs where id = (r::jsonb ->> 'auto_run_id')::uuid) = 'partial'
    and (select kind || ':' || voltage_before from public.battery_runs where id = (r::jsonb ->> 'battery_run_id')::uuid) = 'practice_match:12.90'
    and (select sim_match_id from public.auto_runs where id = (r::jsonb ->> 'auto_run_id')::uuid) = (r::jsonb ->> 'id')::uuid, left(r, 60));
  rp := pg_temp.call_as(f.p, $q$select public.sim_save_match(now(), now(), 'red', 'blue')::text$q$);
  perform pg_temp.rec(18, 'a parent-only account cannot save a simulated match', rp like 'err:42501:%', left(rp, 40));
end
$c$;

-- 19-20. Season applications (D4): staff read names; a student cannot.
do $c$
declare f t28_fx; rm text; rs text;
begin
  select * into f from t28_fx;
  rm := pg_temp.call_as(f.m, $q$select public.season_applications()::text$q$);
  rs := pg_temp.call_as(f.a, $q$select public.season_applications()::text$q$);
  perform pg_temp.rec(19, 'a mentor reads who completed this season, by name', rm like '{%' and jsonb_typeof(rm::jsonb -> 'completed') = 'array'
    and (jsonb_array_length(rm::jsonb -> 'completed') + jsonb_array_length(rm::jsonb -> 'missing')) > 0 and (rm::jsonb #>> '{completed,0,name}') is not null, left(rm, 80));
  perform pg_temp.rec(20, 'a student cannot', rs like 'err:42501:%', left(rs, 40));
end
$c$;

-- 21. No direct writes on the five tables, for staff either.
do $c$
declare f t28_fx; a text; b text; c text;
begin
  select * into f from t28_fx;
  a := pg_temp.call_as(f.m, format($q$insert into public.role_slots (event_id, day, label, starts_at) values (%L, current_date, 'x', now()) returning id::text$q$, f.ev));
  b := pg_temp.call_as(f.a, format($q$insert into public.auto_runs (routine_id, member_id, result) values (%L, %L, 'success') returning id::text$q$, f.routine, f.a));
  c := pg_temp.call_as(f.m, $q$update public.sim_matches set problems = 'x' returning id::text$q$);
  perform pg_temp.rec(21, 'no direct insert or update on the new tables', a like 'err:42501:%' and b like 'err:42501:%' and c like 'err:42501:%', format('%s | %s | %s', left(a, 20), left(b, 20), left(c, 20)));
end
$c$;

-- 22. A parent role without staff excludes, even beside a student role.
do $c$
declare f t28_fx; rb text; rq text;
begin
  select * into f from t28_fx;
  insert into public.member_roles (member_id, role) values (f.b, 'parent') on conflict do nothing;
  rb := pg_temp.call_as(f.b, format($q$select public.role_board(%L::uuid)::text$q$, f.ev));
  rq := pg_temp.call_as(f.b, format($q$select public.role_request(%L::uuid, 'driver')::text$q$, f.slot));
  delete from public.member_roles where member_id = f.b and role = 'parent';
  perform pg_temp.rec(22, 'student plus parent reads no board and cannot request', rb like 'err:42501:%' and rq like 'err:42501:%', left(rb, 30));
end
$c$;

select n, check_name as check, result, detail from t28_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t28_results
order by 1;

rollback;
