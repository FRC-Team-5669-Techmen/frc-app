-- ============================================================
-- 0043_my_schedule test. Run AFTER 0043. SAFE ON LIVE DATA: one transaction
-- ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: two approved students (S seated in a car and assigned scout, T
-- seated elsewhere and only a backup) and a parent-only account (P). Every
-- refusal is paired with an accepted read or a sent reminder on the same
-- fixture.
-- ============================================================
begin;

do $applied$
begin
  if to_regprocedure('public.schedule_reminders_run(timestamptz)') is null then
    raise exception 'Cannot test: 0043_my_schedule.sql has not been applied';
  end if;
end
$applied$;

create temp table t43_results(n int primary key, check_name text, result text, detail text) on commit drop;
create function pg_temp.rec(n int, label text, ok boolean, detail text default '') returns void language sql as $fn$
 insert into t43_results values(n, label, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail);
$fn$;
create function pg_temp.val_as(who uuid, q text) returns text language plpgsql as $fn$
declare v text;
begin
 perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
 perform set_config('request.jwt.claims', jsonb_build_object('sub', who, 'role', 'authenticated')::text, true);
 perform set_config('role', 'authenticated', true);
 begin execute q into v; v := coalesce(v, 'null'); exception when others then v := 'err:' || sqlstate || ':' || sqlerrm; end;
 reset role;
 perform set_config('request.jwt.claim.sub', '', true);
 perform set_config('request.jwt.claims', '', true);
 return v;
end
$fn$;

do $checks$
#variable_conflict use_variable
declare s uuid; t uuid; p uuid; e uuid := gen_random_uuid(); slot1 uuid := gen_random_uuid(); slot2 uuid := gen_random_uuid(); slot3 uuid := gen_random_uuid();
  he uuid := gen_random_uuid(); d1 uuid := gen_random_uuid(); is_ uuid := gen_random_uuid(); it uuid := gen_random_uuid();
  car1 uuid := gen_random_uuid(); car2 uuid := gen_random_uuid(); t0 timestamptz := date_trunc('minute', now()) + interval '1 day'; v text; v2 text; n int;
begin
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select p0.id into t from public.profiles p0 where p0.approved and p0.id<>s and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead','student')) order by member_id limit 1;
 if s is null or t is null or p is null then raise exception '0043 test needs two approved students and a parent-only account'; end if;
 update public.profiles set status='active', approved=true where id in (s,t);

 -- A competition with three slots: Quals 1 in 10 minutes, Quals 2 in 30, Load-in 5 minutes ago.
 insert into public.events(id,title,kind,starts_at,ends_at) values (e,'0043 test','competition',t0,t0+interval '1 day');
 insert into public.role_slots(id,event_id,day,label,starts_at,ends_at,needs) values
   (slot1,e,(t0 at time zone 'America/Los_Angeles')::date,'Quals 1',t0+interval '10 minutes',t0+interval '70 minutes','{"scout":2,"pit_crew":1}'),
   (slot2,e,(t0 at time zone 'America/Los_Angeles')::date,'Quals 2',t0+interval '30 minutes',t0+interval '90 minutes','{"scout":2}'),
   (slot3,e,(t0 at time zone 'America/Los_Angeles')::date,'Load-in',t0-interval '5 minutes',t0+interval '60 minutes','{"pit_crew":2}');
 insert into public.role_requests(slot_id,member_id,role,status) values
   (slot1,s,'scout','assigned'),(slot1,s,'pit_crew','assigned'),(slot1,t,'scout','backup'),
   (slot2,s,'scout','assigned'),(slot3,s,'pit_crew','assigned');

 -- A trip day with two cars: S in car 1 leaving in 12 minutes, T in car 2 leaving in 40.
 insert into public.hub_events(id,title) values (he,'0043 trip');
 insert into public.hub_days(id,event_id,day_date,meet_at,meet_place,venue_closes_at) values (d1,he,(t0 at time zone 'America/Los_Angeles')::date,t0+interval '10 days','Front lot',t0+interval '10 days');  -- meet_at far ahead: the 0016 carpool lock refuses new seats within 72 hours of it
 insert into public.hub_invites(id,event_id,student_id) values (is_,he,s),(it,he,t);
 insert into public.hub_cars(id,event_id,day_id,run,driver_label,seats,description,leave_by) values
   (car1,he,d1,'to','Mr. Test',4,'Silver Sienna',t0+interval '12 minutes'),
   (car2,he,d1,'to','Ms. Other',4,'Blue F-150',t0+interval '40 minutes');
 insert into public.hub_seats(car_id,day_id,run,invite_id) values (car1,d1,'to',is_),(car2,d1,'to',it);

 -- Rides.
 v := pg_temp.val_as(s, format('select public.my_schedule_rides(%L,%L)::text', (t0 at time zone 'America/Los_Angeles')::date, (t0 at time zone 'America/Los_Angeles')::date + 2));
 perform pg_temp.rec(1, 'a student reads their own ride: the car, driver, leave time and meeting place (positive control)',
   v like '[%' and jsonb_array_length(v::jsonb) = 1 and v::jsonb->0->>'description' = 'Silver Sienna' and v::jsonb->0->>'driver' = 'Mr. Test' and v::jsonb->0->>'meet_place' = 'Front lot', left(v, 160));
 v := pg_temp.val_as(t, format('select public.my_schedule_rides(%L,%L)::text', (t0 at time zone 'America/Los_Angeles')::date, (t0 at time zone 'America/Los_Angeles')::date + 2));
 perform pg_temp.rec(2, 'another student reads only their own car, never the first student''s', v::jsonb->0->>'description' = 'Blue F-150' and jsonb_array_length(v::jsonb) = 1 and v not like '%Sienna%', left(v, 160));
 v := pg_temp.val_as(p, format('select public.my_schedule_rides(%L,%L)::text', (t0 at time zone 'America/Los_Angeles')::date, (t0 at time zone 'America/Los_Angeles')::date + 2));
 perform pg_temp.rec(3, 'a parent-only account, seated nowhere, reads an empty list (no one else''s seats)', v = '[]', v);
 v := pg_temp.val_as(null, format('select public.my_schedule_rides(%L,%L)::text', current_date, current_date));
 perform pg_temp.rec(4, 'signed out is refused', v like 'err:%', left(v, 80));
 v := pg_temp.val_as(s, format('select public.my_schedule_rides(%L,%L)::text', current_date, current_date + 30));
 perform pg_temp.rec(5, 'more than 14 days is refused', v like 'err:22023:%', left(v, 80));

 -- Reminders at t0: Quals 1 (in 10 min) for S only, car 1 (in 12 min) for S only.
 n := public.schedule_reminders_run(t0);
 perform pg_temp.rec(6, 'at t0 two reminders go out: S for Quals 1 and S for car 1', n = 2, n::text);
 perform pg_temp.rec(7, 'the ledger holds exactly S''s Quals 1 and car 1',
   exists(select 1 from public.schedule_reminders_sent where key = 'role:' || slot1 || ':' || s)
   and exists(select 1 from public.schedule_reminders_sent where key = 'ride:' || car1 || ':' || s)
   and (select count(*) from public.schedule_reminders_sent where key like '%' || slot1 || '%' or key like '%' || car1 || '%' or key like '%' || car2 || '%' or key like '%' || slot2 || '%') = 2, '');
 perform pg_temp.rec(8, 'a backup (T in Quals 1) is never reminded', not exists(select 1 from public.schedule_reminders_sent where key = 'role:' || slot1 || ':' || t), '');
 perform pg_temp.rec(9, 'a slot that already started (Load-in) and one 30 minutes away (Quals 2) are not reminded yet',
   not exists(select 1 from public.schedule_reminders_sent where key in ('role:' || slot3 || ':' || s, 'role:' || slot2 || ':' || s)), '');
 n := public.schedule_reminders_run(t0 + interval '1 minute');
 perform pg_temp.rec(10, 'a minute later nothing goes out again (one reminder per slot and car)', n = 0, n::text);
 n := public.schedule_reminders_run(t0 + interval '21 minutes');
 perform pg_temp.rec(11, 'at t0+21 min Quals 2 (in 9 min) goes to S, and nothing else', n = 1 and exists(select 1 from public.schedule_reminders_sent where key = 'role:' || slot2 || ':' || s), n::text);
 n := public.schedule_reminders_run(t0 + interval '26 minutes');
 perform pg_temp.rec(12, 'at t0+26 min car 2 (in 14 min) goes to T', n = 1 and exists(select 1 from public.schedule_reminders_sent where key = 'ride:' || car2 || ':' || t), n::text);
 update public.hub_cars set left_at = t0 where id = car2;
 delete from public.schedule_reminders_sent where key = 'ride:' || car2 || ':' || t;
 n := public.schedule_reminders_run(t0 + interval '27 minutes');
 perform pg_temp.rec(13, 'a car that already left is not reminded', n = 0, n::text);

 -- Who may run it, and the ledger.
 v := pg_temp.val_as(s, format('select public.schedule_reminders_run(%L)::text', t0));
 perform pg_temp.rec(14, 'a student cannot run the reminders', v like 'err:42501:%', left(v, 80));
 v := pg_temp.val_as(s, 'select count(*)::text from public.schedule_reminders_sent');
 v2 := pg_temp.val_as(s, $q$insert into public.schedule_reminders_sent(key) values ('role:x:y') returning 1$q$);
 perform pg_temp.rec(15, 'the ledger is closed to clients: no read, no insert', v like 'err:42501:%' and v2 like 'err:42501:%', left(v, 40) || ' | ' || left(v2, 40));
 perform pg_temp.rec(16, 'the role words and places read as people say them',
   public._role_words('scouting_lead') = 'Scouting lead' and public._role_words('meet_team') = 'Meet a team' and public._role_place('scout') = 'the stands' and public._role_place('pit_crew') = 'the pit', '');
 perform pg_temp.rec(17, 'anon cannot read rides; members can',
   not has_function_privilege('anon', 'public.my_schedule_rides(date,date)', 'execute') and has_function_privilege('authenticated', 'public.my_schedule_rides(date,date)', 'execute'), '');
end
$checks$;

select n, check_name as check, result, detail from t43_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t43_results
order by 1;
rollback;
