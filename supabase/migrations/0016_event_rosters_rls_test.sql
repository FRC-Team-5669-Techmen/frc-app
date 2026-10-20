-- ============================================================
-- 0016_event_rosters RLS test
--
-- Run in the Supabase SQL editor AFTER 0016_event_rosters.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK.
-- One row per check (PASS / FAIL with detail) and a summary. Checks 13 to 15
-- need the event family hub (0005 onward) and read SKIP without it.
-- Actors: three approved students with no staff role (A, B, C) and a staff
-- member S.
-- ============================================================

begin;

do $applied$
begin
  if to_regclass('public.event_roles') is null then
    raise exception 'Cannot test: 0016_event_rosters.sql has not been applied';
  end if;
end
$applied$;

create temp table t0016_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0016_fx (a uuid, b uuid, c uuid, s uuid,
  ev_comp uuid default gen_random_uuid(), ev_kick uuid default gen_random_uuid(), ev_past uuid default gen_random_uuid()) on commit drop;

with ns as (
  select p.id, row_number() over (order by p.id) as rn from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
)
insert into t0016_fx (a, b, c, s)
select (select id from ns where rn = 1), (select id from ns where rn = 2), (select id from ns where rn = 3),
       (select r.member_id from public.member_roles r where r.role in ('mentor', 'admin') order by r.member_id limit 1);

do $pre$
declare f t0016_fx;
begin
  select * into f from t0016_fx;
  if f.c is null or f.s is null then raise exception 'Cannot test: need three students and a staff member'; end if;
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
create function pg_temp.run_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare n int; outcome text;
begin
  perform pg_temp.act(p_who);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    outcome := 'ok:' || n;
  exception when others then
    outcome := 'err:' || sqlstate;
  end;
  perform pg_temp.clear();
  return outcome;
end
$fn$;
create function pg_temp.val_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate;
  end;
  perform pg_temp.clear();
  return v;
end
$fn$;
-- As the table owner (no role switch), with a caller identity, so a trigger
-- that reads auth.uid() and is_staff() can be exercised on a direct write.
create function pg_temp.owner_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare n int; outcome text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    outcome := 'ok:' || n;
  exception when others then
    outcome := 'err:' || sqlstate;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return outcome;
end
$fn$;
create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text) returns void language sql as $fn$
  insert into t0016_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

do $checks$
declare
  f t0016_fx;
  r text; v text; w text;
  hub_ev uuid := gen_random_uuid(); hub_day uuid := gen_random_uuid(); hub_car uuid := gen_random_uuid(); hub_inv uuid := gen_random_uuid();
begin
  select * into f from t0016_fx;
  delete from public.standing_records where member_id in (f.a, f.b, f.c);
  delete from public.discipline_records where member_id in (f.a, f.b, f.c);
  update public.standing_settings set kickoff_event_id = null;
  insert into public.events (id, title, kind, starts_at, ends_at, mandatory) values
    (f.ev_comp, 't0016 competition', 'competition', now() + interval '20 days', now() + interval '22 days', true),
    (f.ev_kick, 't0016 kickoff',     'meeting',     now() - interval '10 days', now() - interval '10 days' + interval '3 hours', true),
    (f.ev_past, 't0016 past event',  'competition', now() - interval '5 days',  now() - interval '4 days', true);
  update auth.users set created_at = now() - interval '60 days' where id in (f.a, f.b, f.c);
  update public.member_applications set submitted_at = now() - interval '60 days' where member_id in (f.a, f.b, f.c);
  update public.standing_settings set starts_on = (now() - interval '30 days')::date;

  select string_agg(c.relname, ',' order by c.relname) into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in ('event_roles', 'event_rosters', 'event_attendance', 'member_conflicts', 'event_signup_reminders');
  perform pg_temp.rec(1, 'structure: RLS on all 5 new tables', array_length(string_to_array(v, ','), 1) = 5, v);

  r := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.a, 'scout', 'Reliable, 30 hours'));
  perform pg_temp.rec(2, 'staff assigns a scout with a reason (positive control)', r = 'ok:1', r);

  r := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.b, 'scout', ''));
  v := pg_temp.run_as(f.a, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.b, 'scout', 'Because'));
  w := pg_temp.run_as(f.a, format('insert into public.event_roles (event_id, member_id, role, reason) values (%L, %L, %L, %L)', f.ev_comp, f.a, 'driver', 'self'));
  perform pg_temp.rec(3, 'no reason refused; a student cannot assign, by RPC or directly, loud', r = 'err:22023' and v = 'err:42501' and w = 'err:42501', r || ' / ' || v || ' / ' || w);

  insert into public.standing_records (member_id, kind, reason, opened_on) values (f.b, 'hours', 'test', current_date);
  r := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.b, 'driver', 'Best driver'));
  v := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.b, 'pit_speaker', 'Knows the robot'));
  w := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.b, 'scout', 'Everyone scouts'));
  perform pg_temp.rec(4, 'hours probation blocks the drive team and speaking, not scouting (positive control)', r = 'err:22023' and v = 'err:22023' and w = 'ok:1', r || ' / ' || v || ' / ' || w);

  insert into public.standing_records (member_id, kind, reason, opened_on) values (f.c, 'grades', 'test', current_date);
  r := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.c, 'pit_crew', 'Fast'));
  v := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.c, 'impact_presenter', 'Great speaker'));
  perform pg_temp.rec(5, 'grades probation blocks the pit crew, not the Impact presentation', r = 'err:22023' and v = 'ok:1', r || ' / ' || v);

  insert into public.discipline_records (member_id, level, rule, starts_on, ends_on)
  values (f.a, 'suspension', 'test', public._la_date(now() + interval '15 days'), public._la_date(now() + interval '25 days'));
  r := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.a, 'media', 'Camera'));
  perform pg_temp.rec(6, 'a member suspended over the event takes no role', r = 'err:22023', r);
  delete from public.discipline_records where member_id = f.a;

  update public.standing_settings set kickoff_event_id = f.ev_kick;
  r := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.a, 'driver', 'Passed the test'));
  insert into public.meeting_checkins (event_id, member_id, status) values (f.ev_kick, f.a, 'present');
  v := pg_temp.run_as(f.s, format('select public.staff_assign_role(%L, %L, %L, %L)', f.ev_comp, f.a, 'driver', 'Passed the test'));
  perform pg_temp.rec(7, 'missed Kickoff blocks the drive team; after a Kickoff check-in it is allowed (positive control)', r = 'err:22023' and v = 'ok:1', r || ' / ' || v);

  r := pg_temp.val_as(f.c, format('select count(*) from public.event_roles where event_id = %L', f.ev_comp));
  v := pg_temp.val_as(f.s, format('select count(*) from public.event_roles where event_id = %L', f.ev_comp));
  w := pg_temp.val_as(f.s, format('select public.staff_post_roster(%L, null)', f.ev_comp));
  perform pg_temp.rec(8, 'a draft roster: a student reads 0, staff 4; posting returns the days ahead',
    r = '0' and v = '4' and w ~ '^\d+$' and w::int >= 19, r || ' / ' || v || ' / ' || w);
  r := pg_temp.val_as(f.c, format('select count(*) from public.event_roles where event_id = %L', f.ev_comp));
  v := (select count(*)::text from public.member_notices where member_id = f.a and kind = 'roster');
  perform pg_temp.rec(9, 'after posting a student reads all 4 and A has a notice (positive control)', r = '4' and v = '1', r || ' / ' || v);

  r := pg_temp.run_as(f.s, format('select public.staff_mark_event_day(%L, %L, %L, %L)', f.ev_past, public._la_date(now() - interval '5 days'), f.a, 'absent'));
  v := (select string_agg(kind || ':' || status, ',') from public.standing_records where member_id = f.a);
  w := pg_temp.run_as(f.s, format('select public.staff_mark_event_day(%L, %L, %L, %L)', f.ev_past, public._la_date(now() - interval '5 days'), f.c, 'present'));
  perform pg_temp.rec(10, 'absent from a competition day without an absence opens probation; present opens none',
    r = 'ok:1' and v = 'meetings:open' and w = 'ok:1' and not exists (select 1 from public.standing_records where member_id = f.c and kind = 'meetings'), r || ' / ' || coalesce(v, 'none') || ' / ' || w);
  r := pg_temp.run_as(f.b, format('select public.staff_mark_event_day(%L, %L, %L, %L)', f.ev_past, public._la_date(now() - interval '5 days'), f.b, 'present'));
  v := pg_temp.run_as(f.s, format('select public.staff_mark_event_day(%L, %L, %L, %L)', f.ev_past, current_date + 30, f.b, 'present'));
  perform pg_temp.rec(11, 'a student cannot mark attendance, loud; a day outside the event is refused', r = 'err:42501' and v = 'err:22023', r || ' / ' || v);

  r := pg_temp.run_as(f.a, format('select public.declare_conflict(%L, %L)', f.ev_comp, 'Cousin wedding Saturday'));
  v := pg_temp.val_as(f.a, 'select count(*) from public.member_conflicts where member_id = auth.uid()') || '/'
    || pg_temp.val_as(f.b, format('select count(*) from public.member_conflicts where member_id = %L', f.a));
  w := pg_temp.run_as(f.a, format('select public.declare_conflict(%L, %L)', f.ev_past, 'Too late'));
  perform pg_temp.rec(12, 'A declares a conflict and reads it (1), B reads 0; a past event refused',
    r = 'ok:1' and v = '1/0' and w = 'err:22023', r || ' / ' || v || ' / ' || w);
  perform pg_temp.rec(16, 'conflict deadline: a March event is due February 1, an October event at sign-up',
    public.conflict_deadline('2027-03-19 09:00-07') = date '2027-02-01' and public.conflict_deadline('2026-10-30 09:00-07') is null, '');

  if to_regclass('public.hub_events') is null or to_regprocedure('public.carpool_lock_guard()') is null then
    perform pg_temp.rec(13, 'carpool lock (needs the hub)', true, 'SKIP: hub not applied');
    perform pg_temp.rec(14, 'carpool freeze (needs the hub)', true, 'SKIP: hub not applied');
    perform pg_temp.rec(15, 'family sign-up rule (needs the hub)', true, 'SKIP: hub not applied');
  else
    insert into public.hub_events (id, title, event_id) values (hub_ev, 't0016 hub', f.ev_comp);
    insert into public.hub_days (id, event_id, day_date, venue_closes_at, meet_at)
    values (hub_day, hub_ev, (now() + interval '2 days')::date, now() + interval '2 days 10 hours', now() + interval '2 days');
    insert into public.hub_invites (id, event_id, student_id) values (hub_inv, hub_ev, f.a);
    -- The car goes in as staff: the lock is already on 2 days out.
    r := pg_temp.owner_as(f.s, format('insert into public.hub_cars (id, event_id, day_id, run, driver_label, seats, description) values (%L, %L, %L, %L, %L, 4, %L)',
      hub_car, hub_ev, hub_day, 'to', 'Coach', 'Gray van'));
    if r <> 'ok:1' then raise exception 'fixture car not inserted: %', r; end if;
    r := pg_temp.owner_as(f.b, format('insert into public.hub_seats (car_id, day_id, run, invite_id) values (%L, %L, %L, %L)', hub_car, hub_day, 'to', hub_inv));
    v := pg_temp.owner_as(f.s, format('insert into public.hub_seats (car_id, day_id, run, invite_id) values (%L, %L, %L, %L)', hub_car, hub_day, 'to', hub_inv));
    perform pg_temp.rec(13, 'inside 72 hours a family cannot change a seat, a mentor can (positive control)', r = 'err:42501' and v = 'ok:1', r || ' / ' || v);
    update public.hub_days set meet_at = now() + interval '6 hours' where id = hub_day;
    r := pg_temp.owner_as(f.s, format('delete from public.hub_seats where invite_id = %L', hub_inv));
    v := pg_temp.owner_as(f.s, format('delete from public.hub_invites where id = %L', hub_inv));
    perform pg_temp.rec(14, 'inside 12 hours nobody changes a seat; removing a family still cascades', r = 'err:42501' and v = 'ok:1', r || ' / ' || v);

    if to_regprocedure('public._hub_roster_student(uuid)') is null then
      perform pg_temp.rec(15, 'family sign-up rule (needs 0010)', true, 'SKIP: _hub_roster_student missing');
    else
      r := pg_temp.run_as(f.a, format('select public.staff_remind_signups(%L)', hub_ev));
      v := pg_temp.val_as(f.s, format('select public.staff_remind_signups(%L)', hub_ev));
      update public.event_signup_reminders set reminded_at = now() - interval '49 hours' where hub_event_id = hub_ev;
      delete from public.standing_records where member_id = f.b;
      perform public.event_signup_check();
      w := coalesce((select string_agg(kind, ',') from public.standing_records sr
                       join public.event_signup_reminders x on x.student_id = sr.member_id and x.hub_event_id = hub_ev
                      where sr.kind = 'meetings' and sr.status = 'open' limit 1), 'none');
      perform pg_temp.rec(15, 'a student cannot send reminders; 48 hours after a reminder a missing sign-up opens probation',
        r = 'err:42501' and v ~ '^\d+$' and v::int >= 1 and w like 'meetings%', r || ' / ' || v || ' reminded / ' || w);
    end if;
  end if;

  r := pg_temp.val_as(null, 'select count(*) from public.event_roles');
  perform pg_temp.rec(17, 'anon cannot read roles, loud', r = 'err:42501', r);
end
$checks$;

select n, check_name, result, detail from (
  select n, check_name, result, detail from t0016_results
  union all
  select 999, 'summary',
         case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
         format('%s pass, %s fail', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'))
    from t0016_results
) all_rows order by n;

rollback;
