-- ============================================================
-- 0008_event_hub_families test. Run AFTER 0008 (which needs 0005 and 0007).
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK; its events,
-- invites, tokens, cars and queued emails never persist, so nothing is
-- emailed and no real family is touched.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Needs one staff member, one approved non-staff student, TWO students with
-- a current-season application (the open link lists only those) and two
-- more non-staff accounts to act as other families.
--
-- Outcomes read ok, <value>, or err:<SQLSTATE>:<message>|<detail>. A rule's
-- refusal is err:P0001:hub:<code>|<the sentence a family reads>; an unknown
-- link err:P0002:hub:not_found; a missing EXECUTE or table grant err:42501.
--
-- WHAT IS PROVED, each refusal beside its positive control:
--    1-2   adults 0..30: 12 saved, 31 and 2.5 refused; the column agrees
--    3-13  a parent driving for the team: the drive flag makes a car with
--          the student in the carpool, the one-child rule refuses a single
--          rider (and the same car with the own student aboard takes one),
--          the own student leaving turns it red and emails mentors, a second
--          rider is accepted, the new car_required sentence, clearing the flag
--          withdraws the car with no false "second rider" email, attending
--          does not remove a flag car, a left car blocks only what it should,
--          progress asks for the car on a flag-only day, the page shows flags
--   14     the one-child rule cannot be switched off, by staff or the owner
--   15-17  one outbox row per recipient (and not twice across 0008), the
--          minted link records its one recipient
--   18-20  invite status from every link email, the open-link family
--          included, and the hourly tick reminds it
--   21-27  guardians: name stored, 'me' and 'guardians' on the page, not on
--          the family, exactly one person's links revoked, removing yourself,
--          the last guardian, staff removal
--   28-33  removing a family: after the event, once a car left, the removal
--          itself and everyone told, nothing left behind, the student free
--          on the open link again, staff removal
--   34-35  anon reads nothing; who may execute each new function
--   42     the way there and home are answers, not the carpool default
--   36-41  mentors seat two at once: an empty needs-two car takes a pair
--          and keeps no override (one leaving turns it red), students and
--          anon refused, the same student twice refused, a one-seat car
--          refuses and seats nobody (rolled back), a car with a rider refuses
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.hub_remove_family(text)') is null
     or to_regprocedure('public.hub_join(uuid, uuid, text, text, boolean)') is null then
    raise exception 'Cannot test: 0008_event_hub_families.sql has not been applied';
  end if;
end
$applied$;

create temp table t8_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t8_log (label text, outcome text) on commit drop;
create temp table t8_fx (
  staff_id uuid, member_id uuid, j_student uuid, r_student uuid,
  sa uuid, sb uuid, sc uuid, sd uuid, sx uuid,
  ev1 uuid default gen_random_uuid(), ev2 uuid default gen_random_uuid(), evp uuid default gen_random_uuid(),
  e1d1 uuid default gen_random_uuid(), e1d2 uuid default gen_random_uuid(),
  e2d1 uuid default gen_random_uuid(), e2d2 uuid default gen_random_uuid(), epd uuid default gen_random_uuid(),
  m2 uuid default gen_random_uuid(), n2 uuid default gen_random_uuid(),
  ia uuid default gen_random_uuid(), ib uuid default gen_random_uuid(), ic uuid default gen_random_uuid(),
  id_ uuid default gen_random_uuid(), ix uuid default gen_random_uuid(), ip uuid default gen_random_uuid(),
  ij uuid, ir uuid,
  ta text, tb text, tc text, td text, tx text, tp text,
  tj text, tj2 text, tjs text, tjl text, tlee text, tr text
) on commit drop;

-- Actors, picked from live data.
insert into t8_fx (staff_id, member_id, j_student, r_student)
select
  (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead', 'admin')
    order by r.role = 'admin', r.member_id limit 1),
  (select p.id from public.profiles p
    where p.approved
      and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
      and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
    order by p.id limit 1),
  (select p.id from public.profiles p where public._hub_join_eligible(p.id) order by p.id limit 1),
  (select p.id from public.profiles p where public._hub_join_eligible(p.id) order by p.id offset 1 limit 1);

with picks as (
  select p.id, row_number() over (
           order by exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student') desc,
                    p.approved desc, p.id) as k
    from public.profiles p
   where not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))),
others as (
  select pk.id, row_number() over (order by pk.k) as k2 from picks pk, t8_fx f
   where pk.id is distinct from f.j_student and pk.id is distinct from f.r_student)
update t8_fx set
  sa = (select id from picks where k = 1), sb = (select id from picks where k = 2), sc = (select id from picks where k = 3),
  sd = (select id from others where k2 = 1), sx = (select id from others where k2 = 2);

do $pre$
declare f t8_fx;
begin
  select * into f from t8_fx;
  if f.staff_id is null then raise exception 'Cannot test: no member holds mentor, lead or admin'; end if;
  if f.member_id is null then raise exception 'Cannot test: no approved, non-staff student'; end if;
  if f.r_student is null then raise exception 'Cannot test: need two students with a current-season application'; end if;
  if f.sc is null or f.sx is null then raise exception 'Cannot test: need two non-staff accounts besides those two students'; end if;
end
$pre$;

-- -- Helpers (pg_temp: they vanish with the transaction) ----------------------

create function pg_temp.act(p_role text, p_who uuid) returns void language plpgsql as $fn$
begin
  if p_role = 'authenticated' then
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_who::text, true);
  else
    perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;
  perform set_config('role', p_role, true);
end
$fn$;

-- The first column of a one-row statement as (role, member), as text.
create function pg_temp.val_as(p_role text, p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text; d text;
begin
  perform pg_temp.act(p_role, p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    v := 'err:' || sqlstate || ':' || sqlerrm || '|' || coalesce(d, '');
  end;
  reset role;
  return v;
end
$fn$;

create function pg_temp.anon(p_sql text) returns text language sql as $fn$
  select pg_temp.val_as('anon', null, p_sql)
$fn$;

-- A family's call exactly as the event-family Edge Function makes it.
create function pg_temp.fam(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $fn$
declare v jsonb; d text;
begin
  perform pg_temp.act('service_role', null);
  begin
    v := public.hub_family_call(p_token, p_action, p_args);
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    v := jsonb_build_object('error', sqlstate || ':' || sqlerrm || '|' || coalesce(d, ''));
  end;
  reset role;
  return v;
end
$fn$;

create function pg_temp.save(p_token text, p_field text, p_value jsonb, p_day uuid default null)
returns text language sql as $fn$
  select coalesce(pg_temp.fam(p_token, 'save',
           jsonb_build_object('field', p_field, 'value', p_value, 'day_id', p_day)) ->> 'error', 'ok')
$fn$;

create function pg_temp.stf(p_who uuid, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $fn$
declare v jsonb;
begin
  perform pg_temp.act('authenticated', p_who);
  begin
    v := public.hub_staff_call(p_action, p_args);
  exception when others then
    v := jsonb_build_object('error', sqlstate || ':' || sqlerrm);
  end;
  reset role;
  return v;
end
$fn$;

-- Does this link open its family's page?
create function pg_temp.opens(p_token text) returns boolean language sql as $fn$
  select pg_temp.fam(p_token, 'fetch') ->> 'invite_id' is not null
$fn$;

-- A returned value as jsonb, or null when it was an error.
create function pg_temp.j(p text) returns jsonb language sql as $fn$
  select case when p is null or p like 'err:%' then null else p::jsonb end
$fn$;

create function pg_temp.must(p_label text, p_out text) returns void language sql as $fn$
  insert into t8_log select p_label, p_out where p_out is distinct from 'ok';
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_ok boolean, p_detail text) returns void language sql as $fn$
  insert into t8_results values (p_n, p_check,
    case when p_ok is null then 'FAIL' when p_ok then 'PASS' else 'FAIL' end, p_detail);
$fn$;

-- -- Fixture, as the table owner ---------------------------------------------
-- ev1: the carpool checks. ev2: the guardian and removal checks (lock-in
-- open, so a rider leaving emails the driver). evp: an event that is over.

insert into public.hub_events (id, title, alert_emails)
select ev1, 'RLS0008 cars', array['mentors-0008@example.invalid'] from t8_fx
union all select ev2, 'RLS0008 families', array['mentors-0008@example.invalid'] from t8_fx
union all select evp, 'RLS0008 past', array['mentors-0008@example.invalid'] from t8_fx;
update public.hub_events set lockin_opens_at = now() - interval '1 day' where id = (select ev2 from t8_fx);
insert into public.hub_days (id, event_id, day_date, position, venue_closes_at, ask_school_ride)
select e1d1, ev1, (now() + interval '10 days')::date, 1, now() + interval '10 days 10 hours', false from t8_fx
union all select e1d2, ev1, (now() + interval '11 days')::date, 2, now() + interval '11 days 10 hours', false from t8_fx
union all select e2d1, ev2, (now() + interval '10 days')::date, 1, now() + interval '10 days 10 hours', true from t8_fx
union all select e2d2, ev2, (now() + interval '11 days')::date, 2, now() + interval '11 days 10 hours', true from t8_fx
union all select epd, evp, (now() - interval '2 days')::date, 1, now() - interval '1 hour', true from t8_fx;
insert into public.hub_meals (id, event_id, day_id, label, starts_at)
select m2, ev2, e2d1, 'RLS0008 lunch', now() + interval '10 days 3 hours' from t8_fx;
insert into public.hub_food_needs (id, meal_id, label) select n2, m2, 'Salad' from t8_fx;

insert into public.hub_invites (id, event_id, student_id, emails)
select ia, ev1, sa, array['rls0008-a@example.invalid'] from t8_fx
union all select ib, ev1, sb, array['rls0008-b@example.invalid'] from t8_fx
union all select ic, ev1, sc, array['rls0008-c@example.invalid'] from t8_fx
union all select id_, ev2, sd, array['rls0008-d@example.invalid'] from t8_fx
union all select ix, ev2, sx, array['rls0008-x@example.invalid'] from t8_fx
union all select ip, evp, sa, array['rls0008-p@example.invalid'] from t8_fx;
update t8_fx set
  ta = public._hub_mint_token_for(ia, 'rls0008-a@example.invalid'),
  tb = public._hub_mint_token_for(ib, 'rls0008-b@example.invalid'),
  tc = public._hub_mint_token_for(ic, 'rls0008-c@example.invalid'),
  td = public._hub_mint_token_for(id_, 'rls0008-d@example.invalid'),
  tx = public._hub_mint_token_for(ix, 'rls0008-x@example.invalid'),
  tp = public._hub_mint_token_for(ip, 'rls0008-p@example.invalid');

-- Two families come in through the open link, as anon.
do $join$
declare f t8_fx; rj text; rr text;
begin
  select * into f from t8_fx;
  rj := pg_temp.anon(format('select public.hub_join(%L, %L, %L, %L, true)::text', f.ev2, f.j_student, 'Pat Parent', 'Pat.Parent@Example.invalid'));
  rr := pg_temp.anon(format('select public.hub_join(%L, %L, %L, %L, true)::text', f.ev2, f.r_student, 'Rae Rider', 'rae.r@example.invalid'));
  if pg_temp.j(rj) ->> 'status' is distinct from 'in' or pg_temp.j(rr) ->> 'status' is distinct from 'in' then
    raise exception 'Cannot test: the open link did not let the first parent in (%, %)', rj, rr;
  end if;
  update t8_fx set tj = pg_temp.j(rj) ->> 'token', tr = pg_temp.j(rr) ->> 'token',
    ij = (select id from public.hub_invites where event_id = f.ev2 and student_id = f.j_student),
    ir = (select id from public.hub_invites where event_id = f.ev2 and student_id = f.r_student);
end
$join$;

-- -- 1-2. Adults 0..30 --------------------------------------------------------
do $adults$
declare f t8_fx; o text; p text; q text; n int; names text; v int; att int2;
begin
  select * into f from t8_fx;
  o := pg_temp.save(f.ta, 'adults', '12', f.e1d1);
  p := pg_temp.save(f.ta, 'adults', '31', f.e1d1);
  q := pg_temp.save(f.ta, 'adults', '2.5', f.e1d1);
  select adults into v from public.hub_day_answers where invite_id = f.ia and day_id = f.e1d1;
  perform pg_temp.rec(1, 'adults: 12 is saved; 31 and 2.5 are refused "Choose 0 to 30 adults." and 12 stays',
    o = 'ok' and p = 'P0001:hub:invalid|Choose 0 to 30 adults.' and q like 'P0001:hub:invalid|%' and v = 12,
    format('12: %s; 31: %s; 2.5: %s; stored %s', o, p, q, v));

  select a.attnum into att from pg_attribute a where a.attrelid = 'public.hub_day_answers'::regclass and a.attname = 'adults';
  select count(*), string_agg(c.conname::text, ', ') into n, names from pg_constraint c
   where c.conrelid = 'public.hub_day_answers'::regclass and c.contype = 'c' and c.conkey = array[att];
  begin
    update public.hub_day_answers set adults = 31 where invite_id = f.ia and day_id = f.e1d1;
    p := 'saved';
  exception when others then p := sqlstate;
  end;
  begin
    update public.hub_day_answers set adults = 30 where invite_id = f.ia and day_id = f.e1d1;
    q := 'saved';
  exception when others then q := sqlstate;
  end;
  perform pg_temp.rec(2, 'the column agrees: one check on adults, hub_day_answers_adults_chk; 31 raises 23514, 30 saves',
    n = 1 and names = 'hub_day_answers_adults_chk' and p = '23514' and q = 'saved',
    format('checks on adults: %s (%s); 31: %s; 30: %s', n, names, p, q));
end
$adults$;

-- -- 3-13. A parent driving for the team -------------------------------------
do $cars$
declare f t8_fx; v jsonb; pr jsonb; o text; p text; q text; r text; n int; n2 int; n3 int; n4 int;
        car uuid; car2 uuid; red0 int; drop0 int;
begin
  select * into f from t8_fx;

  -- A: coming on day 1, the student rides the carpool home, the parent
  -- offers a car home for the team. No car until the driver checks are in.
  perform pg_temp.must('A', pg_temp.save(f.ta, 'attending', '"yes"', f.e1d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_seats', '3', f.e1d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_description', '"green wagon"', f.e1d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_leave_by', to_jsonb((now() + interval '10 days 9 hours')::text), f.e1d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_takes_pickups', 'false', f.e1d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'drive_home', 'true', f.e1d1));
  select count(*) into n from public.hub_cars where driver_invite_id = f.ia;
  perform pg_temp.must('A', pg_temp.save(f.ta, 'driver_25', 'true'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'driver_licensed', 'true'));
  select id into car from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home';
  select count(*) into n2 from public.hub_cars where driver_invite_id = f.ia and run = 'to';
  v := pg_temp.fam(f.ta, 'fetch');
  perform pg_temp.rec(3, 'the drive_home flag, with a complete offer and both driver checks, makes a car for that run only, while the student''s own mode is the carpool and the student is not aboard',
    n = 0 and car is not null and n2 = 0 and not public._hub_own_aboard(car)
      and (v -> 'answers' -> 'days' -> f.e1d1::text ->> 'eff_home') = 'carpool'
      and not exists (select 1 from t8_log where label = 'A'),
    format('cars before the driver checks %s; home car %s; to cars %s; own aboard %s; eff_home %s; refused saves: %s',
           n, coalesce(car::text, 'none'), n2, case when car is null then null else public._hub_own_aboard(car) end,
           v -> 'answers' -> 'days' -> f.e1d1::text ->> 'eff_home',
           coalesce((select string_agg(outcome, ' | ') from t8_log where label = 'A'), 'none')));

  perform pg_temp.must('B', pg_temp.save(f.tb, 'attending', '"yes"', f.e1d1));
  perform pg_temp.must('C', pg_temp.save(f.tc, 'attending', '"yes"', f.e1d1));
  v := pg_temp.fam(f.tb, 'claim_seat', jsonb_build_object('car_id', car));
  perform pg_temp.rec(4, 'one-child rule: a single rider into a car whose driver''s own student is not in it is refused',
    v ->> 'error' like 'P0001:hub:one_minor%' and not exists (select 1 from public.hub_seats where invite_id = f.ib),
    format('claim: %s', coalesce(v ->> 'error', 'accepted')));

  o := pg_temp.save(f.ta, 'home_mode', '"driving"', f.e1d1);
  v := pg_temp.fam(f.tb, 'claim_seat', jsonb_build_object('car_id', car));
  perform pg_temp.rec(5, 'positive control: the same car with the driver''s own student aboard (home mode "driving") takes that one rider, and it is still one car',
    o = 'ok' and v ->> 'error' is null and public._hub_own_aboard(car)
      and exists (select 1 from public.hub_seats where car_id = car and invite_id = f.ib)
      and (select count(*) from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home') = 1,
    format('mode: %s; claim: %s; own aboard %s; A''s home cars %s', o, coalesce(v ->> 'error', 'ok'), public._hub_own_aboard(car),
           (select count(*) from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home')));

  select count(*) into red0 from public.hub_outbox where event_id = f.ev1 and kind = 'car_red';
  o := pg_temp.save(f.ta, 'home_mode', '"carpool"', f.e1d1);
  perform pg_temp.rec(6, 'the own student leaving (home mode back to the carpool, flag still on): the car stays, turns red with its one rider, and mentors are emailed',
    o = 'ok' and exists (select 1 from public.hub_cars where id = car) and public._hub_car_problem(car) = 'needs_second_rider'
      and (select count(*) from public.hub_outbox where event_id = f.ev1 and kind = 'car_red') = red0 + 1,
    format('mode: %s; problem %s; car_red emails %s -> %s', o, coalesce(public._hub_car_problem(car), 'none'), red0,
           (select count(*) from public.hub_outbox where event_id = f.ev1 and kind = 'car_red')));

  v := pg_temp.fam(f.tc, 'claim_seat', jsonb_build_object('car_id', car));
  perform pg_temp.rec(7, 'a second rider is accepted into the flag car, and it is no longer red',
    v ->> 'error' is null and (select count(*) from public.hub_seats where car_id = car) = 2 and public._hub_car_problem(car) is null,
    format('claim: %s; riders %s; problem %s', coalesce(v ->> 'error', 'ok'),
           (select count(*) from public.hub_seats where car_id = car), coalesce(public._hub_car_problem(car), 'none')));

  o := pg_temp.save(f.ta, 'car_description', '""', f.e1d1);
  perform pg_temp.rec(8, 'blanking a listed car is refused with the new sentence, which points at "Will a parent drive?"',
    o = 'P0001:hub:car_required|Keep this filled in while you are driving. To stop driving, change your answer to "Will a parent drive?"',
    o);

  select count(*) into red0 from public.hub_outbox where event_id = f.ev1 and kind = 'car_red';
  select count(*) into drop0 from public.hub_outbox where event_id = f.ev1 and kind = 'seat_dropped';
  o := pg_temp.save(f.ta, 'drive_home', 'false', f.e1d1);
  perform pg_temp.rec(9, 'clearing the flag withdraws the car: both riders dropped and each family emailed, and no "needs a second rider" email about a car being deleted',
    o = 'ok' and not exists (select 1 from public.hub_cars where id = car)
      and not exists (select 1 from public.hub_seats where invite_id in (f.ib, f.ic) and day_id = f.e1d1)
      and (select count(*) from public.hub_outbox where event_id = f.ev1 and kind = 'seat_dropped') = drop0 + 2
      and exists (select 1 from public.hub_outbox where kind = 'seat_dropped' and to_emails = array['rls0008-b@example.invalid'])
      and exists (select 1 from public.hub_outbox where kind = 'seat_dropped' and to_emails = array['rls0008-c@example.invalid'])
      and (select count(*) from public.hub_outbox where event_id = f.ev1 and kind = 'car_red') = red0,
    format('save: %s; car left standing: %s; seat_dropped %s -> %s; car_red %s -> %s', o,
           exists (select 1 from public.hub_cars where id = car), drop0,
           (select count(*) from public.hub_outbox where event_id = f.ev1 and kind = 'seat_dropped'), red0,
           (select count(*) from public.hub_outbox where event_id = f.ev1 and kind = 'car_red')));

  select count(*) into n3 from jsonb_array_elements(pg_temp.stf(f.staff_id, 'overview', jsonb_build_object('event_id', f.ev1)) -> 'drivers') d
   where d ->> 'invite_id' = f.ia::text;
  o := pg_temp.save(f.ta, 'drive_home', 'true', f.e1d1);
  select count(*) into n4 from jsonb_array_elements(pg_temp.stf(f.staff_id, 'overview', jsonb_build_object('event_id', f.ev1)) -> 'drivers') d
   where d ->> 'invite_id' = f.ia::text;
  select id into car2 from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home';
  p := pg_temp.save(f.ta, 'attending', '"no"', f.e1d1);
  select count(*) into n from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home';
  q := pg_temp.save(f.ta, 'drive_home', 'null', f.e1d1);
  select count(*) into n2 from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home';
  perform pg_temp.rec(10, 'the flag works whatever the student''s answer: attending "no" keeps the car; clearing the flag (null) removes it; the mentor''s driver list shows the family only while the flag is on',
    o = 'ok' and car2 is not null and p = 'ok' and n = 1 and q = 'ok' and n2 = 0 and n3 = 0 and n4 = 1,
    format('flag on: %s; attending no: %s, cars %s; flag cleared: %s, cars %s; on the driver list before / with the flag: %s / %s',
           o, p, n, q, n2, n3, n4));

  -- A car that has left: it blocks only a change that would remove it.
  o := pg_temp.save(f.ta, 'drive_home', 'true', f.e1d1);
  select id into car2 from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home';
  perform pg_temp.stf(f.staff_id, 'mark', jsonb_build_object('car_id', car2, 'what', 'left'));
  p := pg_temp.save(f.ta, 'attending', '"unsure"', f.e1d1);
  q := pg_temp.save(f.ta, 'drive_home', 'false', f.e1d1);
  perform pg_temp.stf(f.staff_id, 'undo_mark', jsonb_build_object('car_id', car2));
  perform pg_temp.must('A2', pg_temp.save(f.ta, 'drive_home', 'false', f.e1d1));
  perform pg_temp.must('A2', pg_temp.save(f.ta, 'attending', '"yes"', f.e1d1));
  perform pg_temp.must('A2', pg_temp.save(f.ta, 'home_mode', '"driving"', f.e1d1));
  select id into car2 from public.hub_cars where driver_invite_id = f.ia and day_id = f.e1d1 and run = 'home';
  perform pg_temp.stf(f.staff_id, 'mark', jsonb_build_object('car_id', car2, 'what', 'left'));
  r := pg_temp.save(f.ta, 'attending', '"no"', f.e1d1);
  perform pg_temp.stf(f.staff_id, 'undo_mark', jsonb_build_object('car_id', car2));
  perform pg_temp.must('A2', pg_temp.save(f.ta, 'home_mode', '"carpool"', f.e1d1));
  perform pg_temp.rec(11, 'a left car kept by its flag does not block a change of attending, but its flag cannot be cleared; a left car the change WOULD remove still blocks it',
    o = 'ok' and p = 'ok' and q like 'P0001:hub:car_left%' and r like 'P0001:hub:car_left%'
      and not exists (select 1 from t8_log where label = 'A2'),
    format('attending with a left flag car: %s; clearing its flag: %s; attending with a left "driving" car: %s; setup: %s', p, q, r,
           coalesce((select string_agg(outcome, ' | ') from t8_log where label = 'A2'), 'ok')));

  -- B on day 2: not coming, no driver checks; the flag alone asks for both.
  pr := pg_temp.fam(f.tb, 'fetch') -> 'progress';
  select count(*) into n from jsonb_array_elements(pr -> 'missing') m
   where m ->> 'day_id' = f.e1d2::text and m ->> 'step' = 'getting' and m ->> 'key' in ('car', 'driver_checks');
  o := pg_temp.save(f.tb, 'attending', '"no"', f.e1d2);
  p := pg_temp.save(f.tb, 'drive_to', 'true', f.e1d2);
  v := pg_temp.fam(f.tb, 'fetch');
  select count(*) into n2 from jsonb_array_elements(v -> 'progress' -> 'missing') m
   where m ->> 'day_id' = f.e1d2::text and m ->> 'step' = 'getting' and m ->> 'key' in ('car', 'driver_checks');
  select count(*) into n3 from public.hub_cars where driver_invite_id = f.ib;
  q := pg_temp.save(f.tb, 'drive_to', 'false', f.e1d2);
  pr := pg_temp.fam(f.tb, 'fetch') -> 'progress';
  select count(*) into n4 from jsonb_array_elements(pr -> 'missing') m
   where m ->> 'day_id' = f.e1d2::text and m ->> 'step' = 'getting' and m ->> 'key' in ('car', 'driver_checks');
  perform pg_temp.rec(12, 'progress asks for the car offer and driver checks on a day only a flag is on (student not coming): 0 before, 2 with it, 0 after; no car without an offer',
    n = 0 and o = 'ok' and p = 'ok' and n2 = 2 and n3 = 0 and q = 'ok' and n4 = 0,
    format('before %s; with the flag %s (cars %s); after %s; saves %s / %s / %s', n, n2, n3, n4, o, p, q));
  perform pg_temp.rec(13, 'the family page carries drive_to and drive_home on every day',
    (v -> 'answers' -> 'days' -> f.e1d2::text -> 'drive_to') = 'true'::jsonb
      and (v -> 'answers' -> 'days' -> f.e1d2::text) ? 'drive_home'
      and (v -> 'answers' -> 'days' -> f.e1d1::text) ? 'drive_to'
      and (v -> 'answers' -> 'days' -> f.e1d1::text) ? 'drive_home',
    format('day 2: drive_to %s, drive_home %s', v -> 'answers' -> 'days' -> f.e1d2::text -> 'drive_to',
           v -> 'answers' -> 'days' -> f.e1d2::text -> 'drive_home'));
end
$cars$;

-- -- 14. The one-child rule is always on --------------------------------------
do $minor$
declare f t8_fx; o text; p text; q text; n int; c int;
begin
  select * into f from t8_fx;
  o := pg_temp.val_as('authenticated', f.staff_id, format('update public.hub_events set one_minor_rule = false where id = %L returning 1', f.ev1));
  p := pg_temp.val_as('authenticated', f.staff_id, format('update public.hub_events set venue_name = %L where id = %L returning 1', 'RLS0008 venue', f.ev1));
  begin
    update public.hub_events set one_minor_rule = false where id = f.ev2;
    q := 'saved';
  exception when others then q := sqlstate;
  end;
  select count(*) filter (where not one_minor_rule), count(*) into n, c from public.hub_events;
  perform pg_temp.rec(14, 'the one-child rule cannot be switched off: staff and the owner get 23514 (another column saves); no event has it off',
    o like 'err:23514%' and p = '1' and q = '23514' and n = 0 and c >= 3
      and exists (select 1 from pg_constraint where conname = 'hub_events_one_minor_rule_on'),
    format('staff off: %s; staff venue: %s; owner off: %s; events with it off %s of %s', left(o, 40), p, q, n, c));
end
$minor$;

-- -- 15-17. One outbox row, and one link, per person -------------------------
do $outbox$
declare f t8_fx; n int; k int; one boolean; keys text; o1 uuid; o2 uuid; t1 text; t2 text; e1 text; e2 text; ok boolean;
begin
  select * into f from t8_fx;
  perform public._hub_enqueue(f.ev2, 't8_split', array['p1@rls0008.invalid', 'p2@rls0008.invalid', 'p3@rls0008.invalid'],
                              'S', 'B {{link}}', f.id_, 't8:split');
  perform public._hub_enqueue(f.ev2, 't8_split', array['p1@rls0008.invalid', 'p2@rls0008.invalid', 'p3@rls0008.invalid'],
                              'S', 'B {{link}}', f.id_, 't8:split');
  perform public._hub_enqueue(f.ev2, 't8_one', array['p1@rls0008.invalid'], 'S', 'B {{link}}', f.id_, 't8:one');
  perform public._hub_enqueue(f.ev2, 't8_nolink', array['p1@rls0008.invalid', 'p2@rls0008.invalid'], 'S', 'B', null, 't8:nolink');
  perform public._hub_enqueue(f.ev2, 't8_nokey', array['p1@rls0008.invalid', 'p2@rls0008.invalid'], 'S', 'B {{link}}', f.id_, null);
  select count(*), count(distinct dedupe_key), bool_and(cardinality(to_emails) = 1), string_agg(dedupe_key, ' ' order by dedupe_key)
    into n, k, one, keys from public.hub_outbox where kind = 't8_split';
  ok := (select count(*) = 1 and bool_and(dedupe_key = 't8:one' and to_emails = array['p1@rls0008.invalid'])
           from public.hub_outbox where kind = 't8_one')
        and (select count(*) = 1 and bool_and(cardinality(to_emails) = 2 and dedupe_key = 't8:nolink')
               from public.hub_outbox where kind = 't8_nolink')
        and (select count(*) = 2 and bool_and(dedupe_key is null and cardinality(to_emails) = 1)
               from public.hub_outbox where kind = 't8_nokey');
  perform pg_temp.rec(15, 'a link to three people is three rows with three keys (sent twice, still three); one person is one row with the key unchanged; no link, one row',
    n = 3 and k = 3 and one and keys = 't8:split:p1@rls0008.invalid t8:split:p2@rls0008.invalid t8:split:p3@rls0008.invalid' and ok,
    format('split rows %s, keys %s (%s); single, no-link and keyless shapes right: %s', n, k, keys, ok));

  -- An email that went out under the single key before this file (one row,
  -- the whole family): asked again, only a new address is sent it.
  insert into public.hub_outbox (event_id, kind, to_emails, subject, body, link_invite_id, dedupe_key)
  values (f.ev2, 't8_legacy', array['p1@rls0008.invalid', 'p2@rls0008.invalid'], 'S', 'B {{link}}', f.id_, 't8:legacy');
  perform public._hub_enqueue(f.ev2, 't8_legacy', array['p1@rls0008.invalid', 'p2@rls0008.invalid', 'p4@rls0008.invalid'],
                              'S', 'B {{link}}', f.id_, 't8:legacy');
  perform public._hub_enqueue(f.ev2, 't8_split', array['p1@rls0008.invalid'], 'S', 'B {{link}}', f.id_, 't8:split');
  perform pg_temp.rec(16, 'nobody is sent the same email twice across 0008: under the old single key only the new address gets a row; a lone address already sent under its own key gets none',
    (select count(*) from public.hub_outbox where kind = 't8_legacy') = 2
      and exists (select 1 from public.hub_outbox where dedupe_key = 't8:legacy:p4@rls0008.invalid' and to_emails = array['p4@rls0008.invalid'])
      and (select count(*) from public.hub_outbox where kind = 't8_split') = 3
      and not exists (select 1 from public.hub_outbox where dedupe_key = 't8:split'),
    format('legacy rows %s; split rows %s', (select count(*) from public.hub_outbox where kind = 't8_legacy'),
           (select count(*) from public.hub_outbox where kind = 't8_split')));

  select id into o1 from public.hub_outbox where kind = 't8_one';
  select id into o2 from public.hub_outbox where dedupe_key = 't8:legacy';
  update public.hub_outbox set status = 'sending' where id in (o1, o2);
  t1 := pg_temp.val_as('service_role', null, format('select public.hub_outbox_mint_link(%L)', o1));
  t2 := pg_temp.val_as('service_role', null, format('select public.hub_outbox_mint_link(%L)', o2));
  update public.hub_outbox set status = 'skipped' where id in (o1, o2);
  select coalesce(email, 'null') into e1 from public.hub_invite_tokens where token_hash = sha256(convert_to(t1, 'UTF8'));
  select coalesce(email, 'null') into e2 from public.hub_invite_tokens where token_hash = sha256(convert_to(t2, 'UTF8'));
  perform pg_temp.rec(17, 'a link minted for a one-person email records that person on the token; one for an email to several records nobody; both open the family',
    e1 = 'p1@rls0008.invalid' and e2 = 'null'
      and public._hub_invite_for_token(t1) = f.id_ and public._hub_invite_for_token(t2) = f.id_,
    format('one person: %s; several: %s', coalesce(e1, 'no token'), coalesce(e2, 'no token')));
end
$outbox$;

-- -- 18-20. Invite status, however the family came in -------------------------
do $status$
declare f t8_fx; s0 text; s1 text; s2 text; d0 text; d1 text; j0 text; j1 text; r0 text; n int;
begin
  select * into f from t8_fx;
  s0 := public._hub_invite_status(f.ix);
  perform public._hub_mail_invite(f.ix);
  s1 := public._hub_invite_status(f.ix);
  update public.hub_outbox set status = 'failed', attempts = 3 where link_invite_id = f.ix and kind = 'invite';
  s2 := public._hub_invite_status(f.ix);
  d0 := public._hub_invite_status(f.id_);
  perform public._hub_mail_invite(f.id_);
  update public.hub_outbox set status = 'sent', sent_at = now() where link_invite_id = f.id_ and kind = 'invite';
  d1 := public._hub_invite_status(f.id_);
  perform pg_temp.rec(18, 'invite status: none, pending, failed and sent from the mail that carries the link; link mail of another kind does not count',
    s0 = 'none' and s1 = 'pending' and s2 = 'failed' and d0 = 'none' and d1 = 'sent'
      and exists (select 1 from public.hub_outbox where link_invite_id = f.id_ and kind like 't8_%'),
    format('X: %s -> %s -> %s; D (with other link mail): %s -> %s', s0, s1, s2, d0, d1));

  j0 := public._hub_invite_status(f.ij);
  r0 := public._hub_invite_status(f.ir);
  update public.hub_outbox set status = 'sent', sent_at = now() where link_invite_id = f.ij and kind = 'welcome';
  j1 := public._hub_invite_status(f.ij);
  perform pg_temp.rec(19, 'a family that came in through the open link reads pending, then sent, though no invite:<id> key exists (0005 read none forever)',
    j0 = 'pending' and r0 = 'pending' and j1 = 'sent'
      and not exists (select 1 from public.hub_outbox where dedupe_key = 'invite:' || f.ij),
    format('joined family: %s -> %s; another, welcome unsent: %s', j0, j1, r0));

  update public.hub_events set phase1_due_at = now() + interval '12 hours' where id = f.ev2;
  perform pg_temp.act('service_role', null);
  n := public.hub_cron_enqueue();
  reset role;
  update public.hub_events set phase1_due_at = null where id = f.ev2;
  perform pg_temp.rec(20, 'the hourly tick reminds the open-link family whose welcome went out; not one whose invite failed, nor one whose welcome is unsent',
    exists (select 1 from public.hub_outbox where link_invite_id = f.ij and kind = 'remind_phase1')
      and not exists (select 1 from public.hub_outbox where link_invite_id = f.ix and kind = 'remind_phase1')
      and not exists (select 1 from public.hub_outbox where link_invite_id = f.ir and kind = 'remind_phase1'),
    format('tick queued %s; reminders: joined %s, failed %s, unsent %s', n,
           (select count(*) from public.hub_outbox where link_invite_id = f.ij and kind = 'remind_phase1'),
           (select count(*) from public.hub_outbox where link_invite_id = f.ix and kind = 'remind_phase1'),
           (select count(*) from public.hub_outbox where link_invite_id = f.ir and kind = 'remind_phase1')));
end
$status$;

-- -- 21-27. Guardians ---------------------------------------------------------
do $guardians$
declare
  f t8_fx; o text; p text; q text; v jsonb; w jsonb; x jsonb; ob uuid; ob2 uuid; pe text;
  pat text := 'pat.parent@example.invalid'; sam text := 'sam.second@example.invalid'; lee text := 'lee.third@example.invalid';
begin
  select * into f from t8_fx;
  o := pg_temp.anon(format('select public.hub_add_parent(%L, %L, %L)::text', f.tj, 'Sam.Second@Example.invalid', '  Sam Second  '));
  p := pg_temp.anon(format('select public.hub_add_parent(%L, %L, %L)::text', f.tj, 'long@rls0008.invalid', repeat('x', 121)));
  perform pg_temp.rec(21, 'a second parent is added with their name (trimmed) and emailed their own link; a name over 120 characters is refused and adds nobody',
    pg_temp.j(o) ->> 'ok' = 'true'
      and (select guardian_names ->> sam from public.hub_invites where id = f.ij) = 'Sam Second'
      and (select emails from public.hub_invites where id = f.ij) = array[pat, sam]
      and exists (select 1 from public.hub_outbox where kind = 'added' and link_invite_id = f.ij and to_emails = array[sam])
      and p like 'err:P0001:hub:name%',
    format('add: %s; long name: %s; names %s', left(o, 60), left(p, 40), (select guardian_names from public.hub_invites where id = f.ij)));

  -- Sam's link as the send would mint it; a second link for Pat; a link
  -- minted before 0008 (no email on it).
  select id into ob from public.hub_outbox where kind = 'added' and link_invite_id = f.ij and to_emails = array[sam];
  update public.hub_outbox set status = 'sending' where id = ob;
  q := pg_temp.val_as('service_role', null, format('select public.hub_outbox_mint_link(%L)', ob));
  update public.hub_outbox set status = 'sent', sent_at = now() where id = ob;
  update t8_fx set tjs = q, tj2 = public._hub_mint_token_for(f.ij, pat), tjl = public._hub_mint_token(f.ij);
  select * into f from t8_fx;

  v := pg_temp.fam(f.tj, 'fetch');
  w := pg_temp.fam(f.tjl, 'fetch');
  x := pg_temp.fam(f.tjs, 'food_drop', jsonb_build_object('claim_id', gen_random_uuid()));
  perform pg_temp.rec(22, 'the page says who is reading (me) and lists the guardians with names, in order; a pre-0008 link reads me = null; a page returned by an action carries both',
    v -> 'me' = to_jsonb(pat)
      and v -> 'guardians' = jsonb_build_array(jsonb_build_object('email', pat, 'name', 'Pat Parent'),
                                               jsonb_build_object('email', sam, 'name', 'Sam Second'))
      and w ? 'me' and w -> 'me' = 'null'::jsonb and w -> 'guardians' = v -> 'guardians'
      and x -> 'me' = to_jsonb(sam) and x ? 'guardians' and x ? 'result',
    format('me %s / legacy %s / action %s; guardians %s', v -> 'me', w -> 'me', x -> 'me', v -> 'guardians'));

  o := pg_temp.anon(format('select public.hub_remove_guardian(%L, %L)::text', f.tj, 'nobody@rls0008.invalid'));
  perform pg_temp.rec(23, 'removing an address that is not on the family is refused, and the family is unchanged',
    o = 'err:P0001:hub:not_on_family|That email is not on this family.'
      and (select emails from public.hub_invites where id = f.ij) = array[pat, sam],
    o);

  p := pg_temp.anon(format('select public.hub_add_parent(%L, %L, %L)::text', f.tjs, lee, 'Lee Third'));
  update t8_fx set tlee = public._hub_mint_token_for(f.ij, lee);
  select * into f from t8_fx;
  o := pg_temp.anon(format('select public.hub_remove_guardian(%L, %L)::text', f.tjs, 'LEE.Third@Example.invalid'));
  perform pg_temp.rec(24, 'a guardian removes another (self = false): exactly that person''s link stops working (1 of 6), everyone else''s still opens, and their name goes',
    pg_temp.j(p) ->> 'ok' = 'true' and pg_temp.j(o) ->> 'ok' = 'true' and pg_temp.j(o) ->> 'self' = 'false'
      and not pg_temp.opens(f.tlee) and pg_temp.opens(f.tj) and pg_temp.opens(f.tj2) and pg_temp.opens(f.tjs) and pg_temp.opens(f.tjl)
      and (select count(*) from public.hub_invite_tokens where invite_id = f.ij and revoked_at is not null) = 1
      and (select count(*) from public.hub_invite_tokens where invite_id = f.ij) = 5
      and (select emails from public.hub_invites where id = f.ij) = array[pat, sam]
      and not ((select guardian_names from public.hub_invites where id = f.ij) ? lee),
    format('remove: %s; revoked %s of %s', o,
           (select count(*) from public.hub_invite_tokens where invite_id = f.ij and revoked_at is not null),
           (select count(*) from public.hub_invite_tokens where invite_id = f.ij)));

  -- Pat removes themselves. A reminder to Pat is still queued (check 20); one
  -- to Sam is queued here.
  select id into ob from public.hub_outbox where link_invite_id = f.ij and kind = 'remind_phase1' and to_emails = array[pat];
  perform public._hub_enqueue(f.ev2, 'resend', array[sam], 'S', 'B {{link}}', f.ij, null);
  select id into ob2 from public.hub_outbox where link_invite_id = f.ij and kind = 'resend' and to_emails = array[sam];
  select parent_email into pe from public.hub_responses where invite_id = f.ij;
  o := pg_temp.anon(format('select public.hub_remove_guardian(%L, %L)::text', f.tj, pat));
  v := pg_temp.fam(f.tjs, 'fetch');
  perform pg_temp.rec(25, 'a guardian removes themselves (self = true): both their links stop working, the others open, mail queued to them is cancelled and to the other is not, and their contact email is cleared',
    pg_temp.j(o) ->> 'self' = 'true'
      and not pg_temp.opens(f.tj) and not pg_temp.opens(f.tj2) and pg_temp.opens(f.tjs) and pg_temp.opens(f.tjl)
      and ob is not null and (select status from public.hub_outbox where id = ob) = 'skipped'
      and (select status from public.hub_outbox where id = ob2) = 'pending'
      and pe = pat and (select parent_email from public.hub_responses where invite_id = f.ij) is null
      and v -> 'me' = to_jsonb(sam) and v -> 'guardians' = jsonb_build_array(jsonb_build_object('email', sam, 'name', 'Sam Second')),
    format('remove: %s; reminder to Pat %s; resend to Sam %s; contact email %s -> %s', o,
           (select status from public.hub_outbox where id = ob), (select status from public.hub_outbox where id = ob2),
           pe, coalesce((select parent_email from public.hub_responses where invite_id = f.ij), 'null')));

  o := pg_temp.anon(format('select public.hub_remove_guardian(%L, %L)::text', f.tjs, sam));
  perform pg_temp.rec(26, 'the last guardian cannot be removed by the family, with the sentence pointing at "Remove our family"; their link still opens',
    o = 'err:P0001:hub:last_guardian|You are the only parent or guardian on this family. To take your family off the trip, use "Remove our family".'
      and (select emails from public.hub_invites where id = f.ij) = array[sam] and pg_temp.opens(f.tjs),
    o);

  o := pg_temp.val_as('authenticated', f.member_id, format('select public.hub_staff_remove_guardian(%L, %L)::text', f.ij, sam));
  p := pg_temp.anon(format('select public.hub_staff_remove_guardian(%L, %L)::text', f.ij, sam));
  q := pg_temp.val_as('authenticated', f.staff_id, format('select public.hub_staff_remove_guardian(%L, %L)::text', f.ij, sam));
  perform pg_temp.rec(27, 'staff removal: a student is refused (not_allowed) and anon cannot call it (42501); staff may remove even the last address, whose link then stops working',
    o like 'err:P0001:hub:not_allowed%' and p like 'err:42501%' and pg_temp.j(q) ->> 'ok' = 'true'
      and cardinality((select emails from public.hub_invites where id = f.ij)) = 0
      and not pg_temp.opens(f.tjs) and pg_temp.opens(f.tjl),
    format('student: %s; anon: %s; staff: %s', left(o, 40), left(p, 40), q));
end
$guardians$;

-- -- 28-33. Removing a family from the trip -----------------------------------
do $remove$
declare
  f t8_fx; o text; p text; q text; v jsonb; dcar uuid; rcar uuid; n_rl0 int; n_sd0 int; n_fr0 int; n_fd0 int; n_ss0 int;
begin
  select * into f from t8_fx;
  o := pg_temp.anon(format('select public.hub_remove_family(%L)::text', f.tp));
  perform pg_temp.rec(28, 'a family cannot remove itself after the event; it is still there',
    o = 'err:P0001:hub:event_over|This event is over.' and exists (select 1 from public.hub_invites where id = f.ip),
    o);

  -- D drives day 1 with its own student. R rides with D on day 1, asked for
  -- a pickup, drives X on day 2, and claimed a food need.
  perform pg_temp.must('D', pg_temp.save(f.td, 'attending', '"yes"', f.e2d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'to_mode', '"driving"', f.e2d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_seats', '3', f.e2d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_description', '"blue van"', f.e2d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_leave_by', to_jsonb((now() + interval '10 days 1 hour')::text), f.e2d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_takes_pickups', 'true', f.e2d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'driver_25', 'true'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'driver_licensed', 'true'));
  select id into dcar from public.hub_cars where driver_invite_id = f.id_ and day_id = f.e2d1 and run = 'to';
  perform pg_temp.must('R', pg_temp.save(f.tr, 'attending', '"yes"', f.e2d1));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'attending', '"yes"', f.e2d2));
  perform pg_temp.must('R', coalesce(pg_temp.fam(f.tr, 'claim_seat', jsonb_build_object('car_id', dcar)) ->> 'error', 'ok'));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'pickup', '{"spot":"Oak and 5th","consent":true,"covers_home":true}', f.e2d1));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'to_mode', '"driving"', f.e2d2));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'car_seats', '2', f.e2d2));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'car_description', '"red sedan"', f.e2d2));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'car_leave_by', to_jsonb((now() + interval '11 days 1 hour')::text), f.e2d2));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'car_takes_pickups', 'false', f.e2d2));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'driver_25', 'true'));
  perform pg_temp.must('R', pg_temp.save(f.tr, 'driver_licensed', 'true'));
  perform pg_temp.must('R', coalesce(pg_temp.fam(f.tr, 'food_claim', jsonb_build_object('meal_id', f.m2, 'need_id', f.n2,
                                 'what', 'Green salad', 'serves', 10, 'allergen', 'no')) ->> 'error', 'ok'));
  select id into rcar from public.hub_cars where driver_invite_id = f.ir and day_id = f.e2d2 and run = 'to';
  perform pg_temp.must('X', pg_temp.save(f.tx, 'attending', '"yes"', f.e2d2));
  perform pg_temp.must('X', coalesce(pg_temp.fam(f.tx, 'claim_seat', jsonb_build_object('car_id', rcar)) ->> 'error', 'ok'));

  v := pg_temp.stf(f.staff_id, 'mark', jsonb_build_object('car_id', dcar, 'what', 'left'));
  o := pg_temp.anon(format('select public.hub_remove_family(%L)::text', f.tr));
  perform pg_temp.stf(f.staff_id, 'undo_mark', jsonb_build_object('car_id', dcar));
  perform pg_temp.rec(29, 'a family cannot remove itself once a car it is in has left; nothing was removed',
    v ->> 'error' is null
      and o = 'err:P0001:hub:car_left|A car with your family in it has already left. Ask a mentor.'
      and exists (select 1 from public.hub_invites where id = f.ir)
      and (select count(*) from public.hub_seats where invite_id = f.ir) = 2
      and (select count(*) from public.hub_seats where invite_id = f.ix) = 2
      and not exists (select 1 from t8_log where label in ('D', 'R', 'X')),
    format('mark left: %s; remove: %s; setup: %s', coalesce(v ->> 'error', 'ok'), o,
           coalesce((select string_agg(label || ' ' || outcome, ' | ') from t8_log where label in ('D', 'R', 'X')), 'ok')));

  select count(*) into n_rl0 from public.hub_outbox where kind = 'rider_left' and to_emails = array['rls0008-d@example.invalid'];
  select count(*) into n_sd0 from public.hub_outbox where kind = 'seat_dropped' and to_emails = array['rls0008-x@example.invalid']
                                                      and body like '%The driver''s family left the trip.%';
  select count(*) into n_ss0 from public.hub_outbox where kind = 'seat_dropped_staff' and event_id = f.ev2;
  select count(*) into n_fr0 from public.hub_outbox where kind = 'family_removed' and event_id = f.ev2;
  select count(*) into n_fd0 from public.hub_outbox where kind = 'food_dropped' and event_id = f.ev2;
  o := pg_temp.anon(format('select public.hub_remove_family(%L)::text', f.tr));
  perform pg_temp.rec(30, 'the family removes itself: its seats are released (the driver told), the car it drove goes with its rider''s seats (that family told why), its food reopens, mentors get one email',
    pg_temp.j(o) ->> 'ok' = 'true' and pg_temp.j(o) ->> 'student' = public._hub_student_name(f.r_student)
      and exists (select 1 from public.hub_cars where id = dcar)
      and (select count(*) from public.hub_seats where car_id = dcar) = 0
      and not exists (select 1 from public.hub_cars where event_id = f.ev2 and description = 'red sedan')
      and (select count(*) from public.hub_seats where invite_id = f.ix) = 0
      and (select count(*) from public.hub_outbox where kind = 'rider_left' and to_emails = array['rls0008-d@example.invalid']) = n_rl0 + 2
      and (select count(*) from public.hub_outbox where kind = 'seat_dropped' and to_emails = array['rls0008-x@example.invalid']
                                                    and body like '%The driver''s family left the trip.%') = n_sd0 + 2
      and (select count(*) from public.hub_outbox where kind = 'seat_dropped_staff' and event_id = f.ev2) = n_ss0 + 2
      and (select count(*) from public.hub_outbox where kind = 'food_dropped' and event_id = f.ev2) = n_fd0 + 1
      and (select count(*) from public.hub_outbox where kind = 'family_removed' and event_id = f.ev2
              and to_emails = array['mentors-0008@example.invalid'] and body like '%by the family%') = n_fr0 + 1
      and not exists (select 1 from public.hub_food_claims where need_id = f.n2),
    format('remove: %s; D''s car riders %s; X''s seats %s; rider_left to D +%s; seat_dropped to X +%s; to mentors: seat_dropped_staff +%s, food_dropped +%s, family_removed +%s',
           o, (select count(*) from public.hub_seats where car_id = dcar), (select count(*) from public.hub_seats where invite_id = f.ix),
           (select count(*) from public.hub_outbox where kind = 'rider_left' and to_emails = array['rls0008-d@example.invalid']) - n_rl0,
           (select count(*) from public.hub_outbox where kind = 'seat_dropped' and to_emails = array['rls0008-x@example.invalid']
                                                      and body like '%The driver''s family left the trip.%') - n_sd0,
           (select count(*) from public.hub_outbox where kind = 'seat_dropped_staff' and event_id = f.ev2) - n_ss0,
           (select count(*) from public.hub_outbox where kind = 'food_dropped' and event_id = f.ev2) - n_fd0,
           (select count(*) from public.hub_outbox where kind = 'family_removed' and event_id = f.ev2) - n_fr0));

  v := pg_temp.fam(f.tr, 'fetch');
  perform pg_temp.rec(31, 'nothing of the family is left: no invite, its link opens nothing (P0002), no token, pickup request or mail carrying its link',
    not exists (select 1 from public.hub_invites where id = f.ir)
      and v ->> 'error' like 'P0002:hub:not_found%'
      and not exists (select 1 from public.hub_invite_tokens where invite_id = f.ir)
      and not exists (select 1 from public.hub_pickups where invite_id = f.ir)
      and not exists (select 1 from public.hub_outbox where link_invite_id = f.ir),
    format('invite %s; link: %s', exists (select 1 from public.hub_invites where id = f.ir), coalesce(v ->> 'error', 'opened')));

  o := pg_temp.anon(format('select public.hub_join(%L, %L, %L, %L, true)::text', f.ev2, f.r_student, 'Rae Rider', 'rae.r@example.invalid'));
  perform pg_temp.rec(32, 'the student is free again: the open link lets a parent straight back in, with a new page that opens',
    pg_temp.j(o) ->> 'status' = 'in' and pg_temp.opens(pg_temp.j(o) ->> 'token')
      and exists (select 1 from public.hub_invites where event_id = f.ev2 and student_id = f.r_student and id <> f.ir),
    left(o, 60));

  o := pg_temp.val_as('authenticated', f.member_id, format('select public.hub_staff_remove_family(%L)::text', f.ip));
  p := pg_temp.anon(format('select public.hub_staff_remove_family(%L)::text', f.ip));
  q := pg_temp.val_as('authenticated', f.staff_id, format('select public.hub_staff_remove_family(%L)::text', f.ip));
  perform pg_temp.rec(33, 'staff removal: a student is refused (not_allowed) and anon cannot call it (42501); staff remove a family even after its event, and mentors are told a mentor did it',
    o like 'err:P0001:hub:not_allowed%' and p like 'err:42501%' and pg_temp.j(q) ->> 'ok' = 'true'
      and not exists (select 1 from public.hub_invites where id = f.ip)
      and exists (select 1 from public.hub_outbox where event_id = f.evp and kind = 'family_removed' and body like '%by a mentor (%'),
    format('student: %s; anon: %s; staff: %s', left(o, 40), left(p, 40), q));
end
$remove$;

-- -- 36-41. Mentors seat two at once -----------------------------------------
-- A mentor's van on day 1's run home (no driver's own student, so it needs
-- two), and a one-seat car. A, B and C are coming that day with no seat home.
do $pair$
declare f t8_fx; v jsonb; van uuid; coupe uuid; o text; p text; q text; r text; s text;
begin
  select * into f from t8_fx;
  v := pg_temp.stf(f.staff_id, 'add_car', jsonb_build_object('day_id', f.e1d1, 'run', 'home', 'driver_label', 'RLS0008 van',
         'seats', 3, 'description', 'white van', 'takes_pickups', false));
  van := (v ->> 'car_id')::uuid;
  v := pg_temp.stf(f.staff_id, 'add_car', jsonb_build_object('day_id', f.e1d1, 'run', 'home', 'driver_label', 'RLS0008 coupe',
         'seats', 1, 'description', 'one-seat coupe', 'takes_pickups', false));
  coupe := (v ->> 'car_id')::uuid;

  o := pg_temp.val_as('authenticated', f.staff_id, format('select public.hub_staff_place_pair(%L, %L, %L)::text', van, f.ib, f.ic));
  perform pg_temp.rec(36, 'a mentor seats two students into an empty needs-two car in one call; no override is left on it and it is not red',
    pg_temp.j(o) = '{"ok": true, "riders": 2}'::jsonb
      and (select count(*) from public.hub_seats where car_id = van) = 2
      and not public._hub_own_aboard(van)
      and (select minor_override_reason is null and minor_override_by is null and minor_override_at is null
             from public.hub_cars where id = van)
      and public._hub_car_problem(van) is null,
    format('place: %s; riders %s; override %s; problem %s', o, (select count(*) from public.hub_seats where car_id = van),
           coalesce((select minor_override_reason from public.hub_cars where id = van), 'none'),
           coalesce(public._hub_car_problem(van), 'none')));

  v := pg_temp.stf(f.staff_id, 'move', jsonb_build_object('invite_id', f.ib, 'day_id', f.e1d1, 'run', 'home', 'car_id', null));
  perform pg_temp.rec(37, 'one of the two leaving turns the car red: no override lingered from the pair placement',
    v ->> 'error' is null and (select count(*) from public.hub_seats where car_id = van) = 1
      and public._hub_car_problem(van) = 'needs_second_rider',
    format('move out: %s; riders %s; problem %s', coalesce(v ->> 'error', 'ok'), (select count(*) from public.hub_seats where car_id = van),
           coalesce(public._hub_car_problem(van), 'none')));

  o := pg_temp.val_as('authenticated', f.member_id, format('select public.hub_staff_place_pair(%L, %L, %L)::text', coupe, f.ia, f.ib));
  p := pg_temp.anon(format('select public.hub_staff_place_pair(%L, %L, %L)::text', coupe, f.ia, f.ib));
  perform pg_temp.rec(38, 'a student is refused (not_allowed) and anon cannot call it (42501)',
    o = 'err:P0001:hub:not_allowed|Staff only.' and p like 'err:42501%'
      and (select count(*) from public.hub_seats where car_id = coupe) = 0,
    format('student: %s; anon: %s', o, left(p, 40)));

  o := pg_temp.val_as('authenticated', f.staff_id, format('select public.hub_staff_place_pair(%L, %L, %L)::text', coupe, f.ia, f.ia));
  p := pg_temp.val_as('authenticated', f.staff_id, format('select public.hub_staff_place_pair(%L, %L, null)::text', coupe, f.ia));
  perform pg_temp.rec(39, 'the same student twice, or a missing one, is refused "Pick two different students."',
    o = 'err:P0001:hub:invalid|Pick two different students.' and p = 'err:P0001:hub:invalid|Pick two different students.'
      and (select count(*) from public.hub_seats where car_id = coupe) = 0,
    format('twice: %s; missing: %s', o, p));

  -- C is alone in the van. Pairing C and A into the one-seat car moves C out
  -- of the van, then the second seat is refused: everything rolls back.
  q := pg_temp.val_as('authenticated', f.staff_id, format('select public.hub_staff_place_pair(%L, %L, %L)::text', coupe, f.ic, f.ia));
  perform pg_temp.rec(40, 'a car with one seat refuses the pair and seats NOBODY: the first student is back in the car they were moved out of',
    q like 'err:P0001:hub:car_full%'
      and (select count(*) from public.hub_seats where car_id = coupe) = 0
      and exists (select 1 from public.hub_seats where car_id = van and invite_id = f.ic)
      and (select minor_override_reason is null from public.hub_cars where id = coupe),
    format('pair: %s; coupe riders %s; C still in the van %s', q, (select count(*) from public.hub_seats where car_id = coupe),
           exists (select 1 from public.hub_seats where car_id = van and invite_id = f.ic)));

  r := pg_temp.val_as('authenticated', f.staff_id, format('select public.hub_staff_place_pair(%L, %L, %L)::text', van, f.ia, f.ib));
  perform pg_temp.rec(41, 'a car that already has a rider refuses the pair, and keeps its one rider',
    r = 'err:P0001:hub:invalid|This is for a car with nobody in it yet.'
      and (select count(*) from public.hub_seats where car_id = van) = 1,
    format('pair: %s; van riders %s', r, (select count(*) from public.hub_seats where car_id = van)));
end
$pair$;

-- -- 34-35. anon, and who may execute what ------------------------------------
do $grants$
declare f t8_fx; o text; p text; bad text; n int;
begin
  select * into f from t8_fx;
  o := pg_temp.anon('select count(*)::text from public.hub_invites');
  p := pg_temp.val_as('authenticated', f.staff_id, format('select count(*)::text from public.hub_invites where event_id = %L', f.ev2));
  perform pg_temp.rec(34, 'anon still has no direct read on hub_invites; staff read the fixture (positive control)',
    o like 'err:42501%' and p ~ '^[0-9]+$' and p::int >= 3, format('anon: %s; staff: %s', left(o, 40), p));

  with want(sig, a, u, s) as (values
    ('public.hub_add_parent(text,text,text)', true, true, true),
    ('public.hub_remove_guardian(text,text)', true, true, true),
    ('public.hub_remove_family(text)', true, true, true),
    ('public.hub_staff_remove_guardian(uuid,text)', false, true, false),
    ('public.hub_staff_remove_family(uuid)', false, true, false),
    ('public.hub_staff_place_pair(uuid,uuid,uuid)', false, true, false),
    ('public._hub_mint_token_for(uuid,text)', false, false, false),
    ('public._hub_family_extras(uuid,text)', false, false, false),
    ('public._hub_remove_guardian(uuid,text,uuid)', false, false, false),
    ('public._hub_remove_family(uuid,uuid)', false, false, false),
    ('public.hub_join(uuid,uuid,text,text,boolean)', true, true, true),
    ('public.hub_family_call(text,text,jsonb)', false, false, true),
    ('public.hub_outbox_mint_link(uuid)', false, false, true))
  select count(*), string_agg(w.sig, ', ') filter (where p.oid is null
           or has_function_privilege('anon', p.oid, 'EXECUTE') <> w.a
           or has_function_privilege('authenticated', p.oid, 'EXECUTE') <> w.u
           or has_function_privilege('service_role', p.oid, 'EXECUTE') <> w.s
           or not p.prosecdef
           or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(35, 'each new or redefined entry point is executable by exactly its caller and the new helpers by nobody; all SECURITY DEFINER with a pinned search_path; hub_add_parent(text, text) is gone',
    n = 13 and bad is null and to_regprocedure('public.hub_add_parent(text,text)') is null,
    format('%s checked; wrong: %s; old hub_add_parent: %s', n, coalesce(bad, 'none'),
           coalesce(to_regprocedure('public.hub_add_parent(text,text)')::text, 'gone')));
end
$grants$;

-- -- 42. the way there and home are answers, not the carpool default -------------
do $rides$
declare
  f t8_fx; ev uuid := gen_random_uuid(); dy uuid := gen_random_uuid(); inv uuid := gen_random_uuid();
  tok text; m0 text; m1 text; m2 text; m3 text;
begin
  select * into f from t8_fx;
  insert into public.hub_events (id, title, alert_emails) values (ev, 'RLS0008 rides', array['mentors-0008@example.invalid']);
  -- Two days, so the night between them is one a family can stay.
  insert into public.hub_days (id, event_id, day_date, position, venue_closes_at, ask_school_ride)
  values (gen_random_uuid(), ev, (now() + interval '11 days')::date, 1, now() + interval '11 days 10 hours', true),
         (dy, ev, (now() + interval '12 days')::date, 2, now() + interval '12 days 10 hours', true);
  insert into public.hub_invites (id, event_id, student_id, emails) values (inv, ev, f.sa, array['rides-0008@example.invalid']);
  tok := public._hub_mint_token(inv);
  -- The 'getting' keys (only the second day is coming), as one sorted string.
  perform pg_temp.must('R', pg_temp.save(tok, 'attending', '"yes"', dy));
  select coalesce(string_agg(m ->> 'key', ',' order by m ->> 'key'), '') into m0
    from jsonb_array_elements(pg_temp.fam(tok, 'fetch') -> 'progress' -> 'missing') m where m ->> 'step' = 'getting';
  perform pg_temp.must('R', pg_temp.save(tok, 'to_mode', '"carpool"', dy));
  select coalesce(string_agg(m ->> 'key', ',' order by m ->> 'key'), '') into m1
    from jsonb_array_elements(pg_temp.fam(tok, 'fetch') -> 'progress' -> 'missing') m where m ->> 'step' = 'getting';
  perform pg_temp.must('R', pg_temp.save(tok, 'school_mode', '"self"', dy));
  perform pg_temp.must('R', pg_temp.save(tok, 'home_mode', '"self"', dy));
  select coalesce(string_agg(m ->> 'key', ',' order by m ->> 'key'), '') into m2
    from jsonb_array_elements(pg_temp.fam(tok, 'fetch') -> 'progress' -> 'missing') m where m ->> 'step' = 'getting';
  -- Staying nearby the night before answers the way there.
  perform pg_temp.must('R', pg_temp.save(tok, 'to_mode', 'null', dy));
  perform pg_temp.must('R', pg_temp.save(tok, 'staying_nights', to_jsonb(array[((now() + interval '11 days')::date)::text])));
  select coalesce(string_agg(m ->> 'key', ',' order by m ->> 'key'), '') into m3
    from jsonb_array_elements(pg_temp.fam(tok, 'fetch') -> 'progress' -> 'missing') m where m ->> 'step' = 'getting';
  perform pg_temp.rec(42, 'the way there and home are each an answer: both asked on a coming day, "Getting to Bosco Tech" only once the carpool is chosen, neither once answered, and staying nearby answers the way there',
    m0 = 'ride_home,ride_to' and m1 = 'ride_home,school_mode' and m2 = '' and m3 = ''
      and not exists (select 1 from t8_log where label = 'R'),
    format('nothing chosen [%s]; carpool there [%s]; both answered [%s]; staying nearby, way there cleared [%s]; setup %s',
           m0, m1, m2, m3, coalesce((select string_agg(outcome, ' | ') from t8_log where label = 'R'), 'ok')));
end
$rides$;

select n, check_name as check, result, detail from t8_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 and count(*) = 41 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP of %s checks', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'),
              count(*) filter (where result = 'SKIP'), count(*))
  from t8_results
order by 1;

rollback;
