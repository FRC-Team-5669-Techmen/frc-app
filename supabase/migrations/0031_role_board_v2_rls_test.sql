-- ============================================================
-- 0031_role_board_v2 test: per slot status, no blocking, backups, and 28
-- members filling the board in. Run AFTER 0031. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK. ONE ROW PER CHECK plus a summary row.
-- Actors: 28 synthetic students S1 to S28 (created and rolled back here), a
-- mentor M, a parent-only account P.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.staff_set_request_status(uuid, text)') is null then
    raise exception 'Cannot test: 0031_role_board_v2.sql has not been applied';
  end if;
end
$applied$;

create temp table t31_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t31_fx (m uuid, p uuid, ev uuid, q uuid, q2 uuid, lunch uuid) on commit drop;
create temp table t31_s (i int primary key, id uuid not null) on commit drop;
grant all on t31_fx, t31_results, t31_s to anon, authenticated, service_role;

-- 28 synthetic students.
insert into t31_s (i, id) select g, gen_random_uuid() from generate_series(1, 28) g;
insert into auth.users (id, email) select id, 't31.sim' || i || '@boscotech.edu' from t31_s;
insert into public.profiles (id) select id from t31_s on conflict (id) do nothing;
update public.profiles p set full_name = 'Sim Student ' || lpad(s.i::text, 2, '0'), approved = true, status = 'active' from t31_s s where p.id = s.id;
insert into public.member_roles (member_id, role) select id, 'student' from t31_s on conflict do nothing;

insert into t31_fx (m, p)
select (select r.member_id from public.member_roles r where r.role = 'mentor' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('student', 'mentor', 'lead', 'admin'))
         order by r.member_id limit 1);

do $pre$
declare f t31_fx;
begin
  select * into f from t31_fx;
  if f.m is null or f.p is null then raise exception 'Cannot test: need a mentor and a parent-only account'; end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  perform set_config('role', 'authenticated', true);
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
  insert into t31_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
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
create function pg_temp.sid(n int) returns uuid language sql as $fn$ select id from t31_s where i = n $fn$;
-- One cell of the board as a member sees it.
create function pg_temp.cell(p_who uuid, p_slot uuid, p_role text) returns jsonb language plpgsql as $fn$
declare b text;
begin
  b := pg_temp.call_as(p_who, format($q$select public.role_board(%L::uuid)::text$q$, (select ev from t31_fx)));
  if b not like '{%' then return jsonb_build_object('error', b); end if;
  return (select s -> 'counts' -> p_role from jsonb_array_elements(b::jsonb -> 'slots') s where (s ->> 'id')::uuid = p_slot);
end
$fn$;

-- Fixture: a competition starting tomorrow with three slots.
insert into public.events (id, title, kind, starts_at, ends_at) select gen_random_uuid(), '0031 test regional', 'competition', now() + interval '1 day', now() + interval '3 days';
update t31_fx set ev = (select id from public.events where title = '0031 test regional');
do $slots$
declare f t31_fx; r text;
begin
  select * into f from t31_fx;
  r := pg_temp.call_as(f.m, format($q$select public.staff_save_slot(null, %L::uuid, current_date + 1, 'Quals 1', now() + interval '1 day', now() + interval '1 day 1 hour', '{"scout":6,"driver":1,"drive_coach":1,"team_captain":1}'::jsonb)::text$q$, f.ev));
  update t31_fx set q = (r::jsonb ->> 'id')::uuid;
  r := pg_temp.call_as(f.m, format($q$select public.staff_save_slot(null, %L::uuid, current_date + 1, 'Quals 2', now() + interval '1 day 1 hour', now() + interval '1 day 2 hours', '{"scout":6,"pit_crew":3}'::jsonb)::text$q$, f.ev));
  update t31_fx set q2 = (r::jsonb ->> 'id')::uuid;
  r := pg_temp.call_as(f.m, format($q$select public.staff_save_slot(null, %L::uuid, current_date + 1, 'Lunch: pit watch A', now() + interval '1 day 3 hours', now() + interval '1 day 3.5 hours', '{"pit_crew":1,"battery_captain":1}'::jsonb)::text$q$, f.ev));
  update t31_fx set lunch = (r::jsonb ->> 'id')::uuid;
end
$slots$;

-- 1-4. 28 members fill it in: scout in both quals, pit crew in Quals 2,
-- the same cells as each other, asked twice, some withdrawing and asking again.
do $c$
declare f t31_fx; i int; r text; errs int := 0; dup int;
begin
  select * into f from t31_fx;
  for i in 1..28 loop
    r := pg_temp.call_as(pg_temp.sid(i), format($q$select public.role_request(%L::uuid, 'scout')::text$q$, f.q));  if r not like '{%' then errs := errs + 1; end if;
    r := pg_temp.call_as(pg_temp.sid(i), format($q$select public.role_request(%L::uuid, 'scout')::text$q$, f.q2)); if r not like '{%' then errs := errs + 1; end if;
    r := pg_temp.call_as(pg_temp.sid(i), format($q$select public.role_request(%L::uuid, 'pit_crew')::text$q$, f.q2)); if r not like '{%' then errs := errs + 1; end if;
  end loop;
  perform pg_temp.rec(1, '28 members ask for 3 cells each: 84 requests, all asked, no errors',
    errs = 0 and (select count(*) from public.role_requests r join t31_s s on s.id = r.member_id) = 84
    and not exists (select 1 from public.role_requests r join t31_s s on s.id = r.member_id where r.status <> 'asked'), format('%s errors', errs));
  for i in 1..28 loop
    r := pg_temp.call_as(pg_temp.sid(i), format($q$select public.role_request(%L::uuid, 'scout')::text$q$, f.q)); if r not like '{%' then errs := errs + 1; end if;
  end loop;
  perform pg_temp.rec(2, 'asking again for the same cell is no error and no duplicate: still 84', errs = 0
    and (select count(*) from public.role_requests r join t31_s s on s.id = r.member_id) = 84, format('%s errors', errs));
  for i in 1..10 loop
    r := pg_temp.call_as(pg_temp.sid(i), format($q$select public.role_withdraw(%L::uuid, 'scout')::text$q$, f.q)); if r <> '1' then errs := errs + 1; end if;
  end loop;
  for i in 1..5 loop
    r := pg_temp.call_as(pg_temp.sid(i), format($q$select public.role_request(%L::uuid, 'scout')::text$q$, f.q)); if r not like '{%' then errs := errs + 1; end if;
  end loop;
  select count(*) into dup from (select slot_id, member_id, role from public.role_requests group by 1, 2, 3 having count(*) > 1) d;
  perform pg_temp.rec(3, '10 withdraw, 5 ask again: 23 scouts asked in Quals 1, 28 in Quals 2, no duplicate rows',
    errs = 0 and dup = 0 and (select count(*) from public.role_requests where slot_id = f.q and role = 'scout') = 23
    and (select count(*) from public.role_requests where slot_id = f.q2 and role = 'scout') = 28, format('%s errors, %s dups', errs, dup));
  perform pg_temp.rec(4, 'the board counts Quals 1 scout as needed 6, asked 23, assigned 0, backup 0',
    pg_temp.cell(pg_temp.sid(20), f.q, 'scout') = '{"needed":6,"asked":23,"assigned":0,"backup":0,"requested":23}'::jsonb, pg_temp.cell(pg_temp.sid(20), f.q, 'scout')::text);
end
$c$;

-- 5-7. A student cannot set status, add someone, or write the table.
do $c$
declare f t31_fx; req uuid; r1 text; r2 text; r3 text;
begin
  select * into f from t31_fx;
  select id into req from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(12) and role = 'scout';
  r1 := pg_temp.call_as(pg_temp.sid(11), format($q$select public.staff_set_request_status(%L::uuid, 'assigned')::text$q$, req));
  perform pg_temp.rec(5, 'a student cannot assign anyone; the request stays asked', r1 like 'err:42501:%'
    and (select status from public.role_requests where id = req) = 'asked', left(r1, 50));
  r2 := pg_temp.call_as(pg_temp.sid(11), format($q$select public.staff_add_to_slot(%L::uuid, %L::uuid, 'driver', 'assigned')::text$q$, f.q, pg_temp.sid(13)));
  perform pg_temp.rec(6, 'a student cannot add another member to a box', r2 like 'err:42501:%'
    and not exists (select 1 from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(13) and role = 'driver'), left(r2, 50));
  r3 := pg_temp.call_as(pg_temp.sid(12), format($q$update public.role_requests set status = 'assigned' where id = %L returning status$q$, req));
  perform pg_temp.rec(7, 'a student cannot update status directly, even on their own request', (r3 like 'err:42501:%' or r3 = 'null')
    and (select status from public.role_requests where id = req) = 'asked', left(r3, 50));
end
$c$;

-- 8-9. Staff overfill and name backups, per slot.
do $c$
declare f t31_fx; i int; req uuid; r text; errs int := 0;
begin
  select * into f from t31_fx;
  for i in 11..17 loop
    select id into req from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(i) and role = 'scout';
    r := pg_temp.call_as(f.m, format($q$select public.staff_set_request_status(%L::uuid, 'assigned')::text$q$, req)); if r not like '{%' then errs := errs + 1; end if;
  end loop;
  for i in 18..19 loop
    select id into req from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(i) and role = 'scout';
    r := pg_temp.call_as(f.m, format($q$select public.staff_set_request_status(%L::uuid, 'backup')::text$q$, req)); if r not like '{%' then errs := errs + 1; end if;
  end loop;
  perform pg_temp.rec(8, 'a mentor assigns 7 scouts to a box needing 6 and marks 2 backups: assigned 7, backup 2, asked 14',
    errs = 0 and pg_temp.cell(pg_temp.sid(1), f.q, 'scout') = '{"needed":6,"asked":14,"assigned":7,"backup":2,"requested":23}'::jsonb, pg_temp.cell(pg_temp.sid(1), f.q, 'scout')::text);
  perform pg_temp.rec(9, 'assignment is per slot: the same 7 are still only asked in Quals 2 (assigned 0 there)',
    (pg_temp.cell(pg_temp.sid(1), f.q2, 'scout') ->> 'assigned') = '0'
    and (select count(*) from public.role_requests where slot_id = f.q2 and role = 'scout' and status = 'asked') = 28, pg_temp.cell(pg_temp.sid(1), f.q2, 'scout')::text);
end
$c$;

-- 10-12. No blocking: the mentor adds himself as drive coach, a student on
-- hours probation is assigned driver, team captain is a role.
do $c$
declare f t31_fx; r1 text; r2 text; r3 text; req uuid;
begin
  select * into f from t31_fx;
  r1 := pg_temp.call_as(f.m, format($q$select public.staff_add_to_slot(%L::uuid, %L::uuid, 'drive_coach', 'assigned')::text$q$, f.q, f.m));
  perform pg_temp.rec(10, 'the mentor adds himself as drive coach without asking: assigned, no error',
    r1 like '{%' and (select status from public.role_requests where slot_id = f.q and member_id = f.m and role = 'drive_coach') = 'assigned', left(r1, 60));
  insert into public.standing_records (member_id, kind, status, reason, opened_on) values (pg_temp.sid(20), 'hours', 'open', '0031 test', current_date);
  r2 := pg_temp.call_as(pg_temp.sid(20), format($q$select public.role_request(%L::uuid, 'driver')::text$q$, f.q));
  select id into req from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(20) and role = 'driver';
  r2 := pg_temp.call_as(f.m, format($q$select public.staff_assign_from_request(%L::uuid)::text$q$, req));
  perform pg_temp.rec(11, 'staff_assign_from_request assigns a student on hours probation as driver: no eligibility block, on event_roles',
    r2 like '{%' and (select status from public.role_requests where id = req) = 'assigned'
    and exists (select 1 from public.event_roles where event_id = f.ev and member_id = pg_temp.sid(20) and role = 'driver'), left(r2, 70));
  r3 := pg_temp.call_as(pg_temp.sid(21), format($q$select public.role_request(%L::uuid, 'team_captain')::text$q$, f.q));
  select id into req from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(21) and role = 'team_captain';
  r3 := pg_temp.call_as(f.m, format($q$select public.staff_set_request_status(%L::uuid, 'assigned')::text$q$, req));
  perform pg_temp.rec(12, 'team captain is a role: asked, assigned, and on event_roles',
    r3 like '{%' and exists (select 1 from public.event_roles where event_id = f.ev and member_id = pg_temp.sid(21) and role = 'team_captain'), left(r3, 60));
end
$c$;

-- 13-14. event_roles stays in step without touching roster rows.
do $c$
declare f t31_fx; req uuid; req2 uuid; r text; kept boolean;
begin
  select * into f from t31_fx;
  -- S11 is assigned scout in Quals 1; also assign S11 scout in Quals 2.
  select id into req from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(11) and role = 'scout';
  select id into req2 from public.role_requests where slot_id = f.q2 and member_id = pg_temp.sid(11) and role = 'scout';
  perform pg_temp.call_as(f.m, format($q$select public.staff_set_request_status(%L::uuid, 'assigned')::text$q$, req2));
  perform pg_temp.call_as(f.m, format($q$select public.staff_set_request_status(%L::uuid, 'removed')::text$q$, req));
  kept := exists (select 1 from public.event_roles where event_id = f.ev and member_id = pg_temp.sid(11) and role = 'scout')
          and not exists (select 1 from public.role_requests where id = req);
  r := pg_temp.call_as(f.m, format($q$select public.staff_set_request_status(%L::uuid, 'asked')::text$q$, req2));
  perform pg_temp.rec(13, 'removing one of two assigned slots keeps the event_roles row; setting the last back to asked drops it',
    kept and r like '{%' and not exists (select 1 from public.event_roles where event_id = f.ev and member_id = pg_temp.sid(11) and role = 'scout'), format('kept %s', kept));
  -- A roster page row (no role board in the reason) survives a board change.
  r := pg_temp.call_as(f.m, format($q$select public.staff_assign_role(%L::uuid, %L::uuid, 'pit_crew', 'Owns the toolbox')::text$q$, f.ev, pg_temp.sid(22)));
  select id into req from public.role_requests where slot_id = f.q2 and member_id = pg_temp.sid(22) and role = 'pit_crew';
  perform pg_temp.call_as(f.m, format($q$select public.staff_set_request_status(%L::uuid, 'backup')::text$q$, req));
  perform pg_temp.rec(14, 'a roster row made on the roster page is never removed by the board',
    r not like 'err:%' and exists (select 1 from public.event_roles where event_id = f.ev and member_id = pg_temp.sid(22) and role = 'pit_crew' and reason = 'Owns the toolbox'), left(r, 40));
end
$c$;

-- 15-16. Take back: only an ask.
do $c$
declare f t31_fx; w1 text; w2 text;
begin
  select * into f from t31_fx;
  w1 := pg_temp.call_as(pg_temp.sid(12), format($q$select public.role_withdraw(%L::uuid, 'scout')::text$q$, f.q));
  perform pg_temp.rec(15, 'an assigned member cannot take it back; the row stays assigned', w1 like 'err:22023:%'
    and (select status from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(12) and role = 'scout') = 'assigned', left(w1, 60));
  w2 := pg_temp.call_as(pg_temp.sid(25), format($q$select public.role_withdraw(%L::uuid, 'scout')::text$q$, f.q));
  perform pg_temp.rec(16, 'an asked member takes it back (positive control)', w2 = '1'
    and not exists (select 1 from public.role_requests where slot_id = f.q and member_id = pg_temp.sid(25) and role = 'scout'), w2);
end
$c$;

-- 17. Unfilled counts assigned only.
do $c$
declare f t31_fx; o text; u int;
begin
  select * into f from t31_fx;
  o := pg_temp.call_as(pg_temp.sid(1), $q$select public.role_board_open_events()::text$q$);
  select (e ->> 'unfilled')::int into u from jsonb_array_elements(o::jsonb) e where (e ->> 'event_id')::uuid = f.ev;
  -- Quals 1: scout 6 of 7 assigned (filled), driver filled, drive coach filled, team captain filled -> 0.
  -- Quals 2: scout 0 of 6, pit crew 0 of 3 (S22 is backup) -> 2. Lunch: pit crew, battery captain -> 2.
  perform pg_temp.rec(17, 'Do this now counts unfilled as needed minus assigned: 4 cells (asks and backups do not fill)', u = 4, coalesce(u::text, o));
end
$c$;

-- 18-19. Staff add guards; parent-only reads nothing.
do $c$
declare f t31_fx; r1 text; r2 text; bp text;
begin
  select * into f from t31_fx;
  r1 := pg_temp.call_as(f.m, format($q$select public.staff_add_to_slot(%L::uuid, %L::uuid, 'media', 'assigned')::text$q$, f.q, pg_temp.sid(2)));
  r2 := pg_temp.call_as(f.m, format($q$select public.staff_add_to_slot(%L::uuid, %L::uuid, 'battery_captain', 'backup')::text$q$, f.lunch, pg_temp.sid(2)));
  perform pg_temp.rec(18, 'staff cannot add a role the box does not need; can add a backup to a lunch watch',
    r1 like 'err:22023:%' and r2 like '{%' and (select status from public.role_requests where slot_id = f.lunch and member_id = pg_temp.sid(2)) = 'backup', left(r1, 50));
  bp := pg_temp.call_as(f.p, format($q$select public.role_board(%L::uuid)::text$q$, f.ev));
  perform pg_temp.rec(19, 'a parent-only account reads no board', bp like 'err:42501:%', left(bp, 40));
end
$c$;

-- 20. The Beach Blitz template: lunch watches on both days, alliance needs.
do $c$
declare t jsonb;
begin
  select slots into t from public.role_slot_templates where name = 'Beach Blitz (3 days, Friday load-in)';
  perform pg_temp.rec(20, 'the template has 4 lunch pit watches (days 1 and 2) and Alliance selection needs exactly team captain, scouting lead, drive coach',
    (select count(*) from jsonb_array_elements(t) e where e.value ->> 'label' like 'Lunch: pit watch %' and e.value -> 'needs' = '{"pit_crew":1,"battery_captain":1}'::jsonb) = 4
    and (select e.value -> 'needs' from jsonb_array_elements(t) e where e.value ->> 'label' = 'Alliance selection') = '{"team_captain":1,"scouting_lead":1,"drive_coach":1}'::jsonb,
    jsonb_array_length(t)::text);
end
$c$;

-- 21-23. Many changes in one call (the connector tool assign_roles).
do $c$
declare f t31_fx; r1 text; r2 text; r3 text; before_n bigint;
begin
  select * into f from t31_fx;
  r1 := pg_temp.call_as(f.m, format($q$select public.staff_set_role_statuses(%L::uuid, %L::jsonb)::text$q$, f.ev,
    jsonb_build_array(jsonb_build_object('member', 'Sim Student 03', 'role', 'scout', 'day', to_char(current_date + 1, 'FMDay'), 'status', 'assigned'),
                      jsonb_build_object('member', 'sim student 04', 'role', 'pit_crew', 'slot', 'Quals 2', 'status', 'backup'))));
  perform pg_temp.rec(21, 'one call assigns a member by name as scout in every slot that day needing scouts (2) and makes another a backup by slot label',
    r1 like '{%' and (r1::jsonb ->> 'changed') = '3'
    and (select count(*) from public.role_requests where member_id = pg_temp.sid(3) and role = 'scout' and status = 'assigned') = 2
    and (select status from public.role_requests where slot_id = f.q2 and member_id = pg_temp.sid(4) and role = 'pit_crew') = 'backup', left(r1, 80));
  select count(*) into before_n from public.role_requests where status <> 'asked';
  r2 := pg_temp.call_as(f.m, format($q$select public.staff_set_role_statuses(%L::uuid, %L::jsonb)::text$q$, f.ev,
    jsonb_build_array(jsonb_build_object('member', 'Sim Student 05', 'role', 'scout', 'slot', 'Quals 2', 'status', 'assigned'),
                      jsonb_build_object('member', 'Sim Student', 'role', 'scout', 'slot', 'Quals 2', 'status', 'assigned'))));
  perform pg_temp.rec(22, 'an ambiguous name refuses the whole call and names the candidates; the first item is not written',
    r2 like 'err:22023:%More than one member%' and (select count(*) from public.role_requests where status <> 'asked') = before_n
    and (select status from public.role_requests where slot_id = f.q2 and member_id = pg_temp.sid(5) and role = 'scout') = 'asked', left(r2, 80));
  r3 := pg_temp.call_as(pg_temp.sid(6), format($q$select public.staff_set_role_statuses(%L::uuid, %L::jsonb)::text$q$, f.ev,
    jsonb_build_array(jsonb_build_object('member', 'Sim Student 06', 'role', 'scout', 'slot', 'Quals 2', 'status', 'assigned'))));
  perform pg_temp.rec(23, 'a student cannot use the bulk call, even on themself',
    r3 like 'err:42501:%' and (select status from public.role_requests where slot_id = f.q2 and member_id = pg_temp.sid(6) and role = 'scout') = 'asked', left(r3, 60));
end
$c$;

select n, check_name as check, result, detail from t31_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t31_results
order by 1;

rollback;
