-- ============================================================
-- 0009_event_hub_households test. Run AFTER 0009 (which needs 0005 to 0008).
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK; its event, families,
-- links, cars and queued emails never persist, and nothing is emailed.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Needs four non-staff accounts to stand in as students.
--
-- The fixture: one event, four families. A and B share an email (one parent,
-- two students); B and D share another (a second parent of B); C shares none.
--
--   1      who is a sibling of whom
--   2-5    the one-child rule and siblings: a sibling takes the first seat of
--          the family car alone (an outsider is refused), the car then takes
--          one outsider, and without the sibling the outsider alone is red
--   6-7    the household on the page, and which pages can be opened
--   8-9    hub_household_open: your email on the other page opens it; every
--          other case is refused and opens nothing
--   10     who may execute what
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.hub_household_open(text, uuid)') is null then
    raise exception 'Cannot test: 0009_event_hub_households.sql has not been applied';
  end if;
end
$applied$;

create temp table t9_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t9_log (label text, outcome text) on commit drop;
create temp table t9_fx (
  sa uuid, sb uuid, sc uuid, sd uuid,
  ev uuid default gen_random_uuid(), dy uuid default gen_random_uuid(),
  ia uuid default gen_random_uuid(), ib uuid default gen_random_uuid(),
  ic uuid default gen_random_uuid(), id_ uuid default gen_random_uuid(),
  ta text, tb text, tbq text, tc text, tlegacy text
) on commit drop;

with picks as (
  select p.id, row_number() over (order by p.id) as k from public.profiles p
   where not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin')))
insert into t9_fx (sa, sb, sc, sd)
select (select id from picks where k = 1), (select id from picks where k = 2),
       (select id from picks where k = 3), (select id from picks where k = 4);

do $pre$
declare f t9_fx;
begin
  select * into f from t9_fx;
  if f.sd is null then raise exception 'Cannot test: need four non-staff accounts'; end if;
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

create function pg_temp.anon(p_sql text) returns text language plpgsql as $fn$
declare v text; d text;
begin
  perform pg_temp.act('anon', null);
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

-- A family call exactly as the event-family Edge Function makes it.
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

create function pg_temp.act_out(p_token text, p_action text, p_args jsonb) returns text language sql as $fn$
  select coalesce(pg_temp.fam(p_token, p_action, p_args) ->> 'error', 'ok')
$fn$;

create function pg_temp.must(p_label text, p_out text) returns void language sql as $fn$
  insert into t9_log select p_label, p_out where p_out is distinct from 'ok';
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_ok boolean, p_detail text) returns void language sql as $fn$
  insert into t9_results values (p_n, p_check,
    case when p_ok is null then 'FAIL' when p_ok then 'PASS' else 'FAIL' end, p_detail);
$fn$;

-- -- Fixture, as the table owner ---------------------------------------------

insert into public.hub_events (id, title, alert_emails)
select ev, 'RLS0009 households', array['mentors-0009@example.invalid'] from t9_fx;
insert into public.hub_days (id, event_id, day_date, position, venue_closes_at, ask_school_ride)
select dy, ev, (now() + interval '10 days')::date, 1, now() + interval '10 days 10 hours', false from t9_fx;
insert into public.hub_invites (id, event_id, student_id, emails)
select ia, ev, sa, array['parent-0009@example.invalid'] from t9_fx
union all select ib, ev, sb, array['parent-0009@example.invalid', 'second-0009@example.invalid'] from t9_fx
union all select ic, ev, sc, array['other-0009@example.invalid'] from t9_fx
union all select id_, ev, sd, array['second-0009@example.invalid'] from t9_fx;
update t9_fx set
  ta = public._hub_mint_token_for(ia, 'parent-0009@example.invalid'),
  tb = public._hub_mint_token_for(ib, 'parent-0009@example.invalid'),
  tbq = public._hub_mint_token_for(ib, 'second-0009@example.invalid'),
  tc = public._hub_mint_token_for(ic, 'other-0009@example.invalid'),
  tlegacy = public._hub_mint_token(ia);

-- -- 1. siblings ---------------------------------------------------------------
do $c$
declare f t9_fx; got text;
begin
  select * into f from t9_fx;
  got := concat_ws(' ', public._hub_siblings(f.ia, f.ib), public._hub_siblings(f.ib, f.ia), public._hub_siblings(f.ib, f.id_),
                   public._hub_siblings(f.ia, f.ic), public._hub_siblings(f.ia, f.id_), public._hub_siblings(f.ia, f.ia),
                   public._hub_siblings(f.ia, null));
  perform pg_temp.rec(1, 'siblings share an email in the same event: A-B and B-D are, A-C, A-D, A-A and A-nobody are not',
    got = 't t t f f f f', got);
end
$c$;

-- -- 2-5. the one-child rule and siblings --------------------------------------
do $c$
declare f t9_fx; car uuid; o text; p text; q text; r text; s text;
begin
  select * into f from t9_fx;
  -- A parent drives for the team on the day A is not coming.
  perform pg_temp.must('A', pg_temp.save(f.ta, 'staying_nights', '[]'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'attending', '"no"', f.dy));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'driver_25', 'true'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'driver_licensed', 'true'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'drive_to', 'true', f.dy));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_seats', '3', f.dy));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_description', '"blue van"', f.dy));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_leave_by', to_jsonb((now() + interval '10 days 8 hours')::text), f.dy));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'car_takes_pickups', 'false', f.dy));
  select id into car from public.hub_cars where driver_invite_id = f.ia and day_id = f.dy and run = 'to';
  perform pg_temp.must('B', pg_temp.save(f.tb, 'attending', '"yes"', f.dy));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'to_mode', '"carpool"', f.dy));
  perform pg_temp.must('C', pg_temp.save(f.tc, 'attending', '"yes"', f.dy));
  perform pg_temp.must('C', pg_temp.save(f.tc, 'to_mode', '"carpool"', f.dy));

  o := pg_temp.act_out(f.tc, 'claim_seat', jsonb_build_object('car_id', car, 'day_id', f.dy, 'run', 'to'));
  perform pg_temp.rec(2, 'an outsider is still refused the first seat of a car without the driver own child (the rule as before)',
    car is not null and o like 'P0001:hub:one_minor%' and not exists (select 1 from public.hub_seats where car_id = car),
    format('car %s; outsider: %s', car is not null, left(o, 60)));

  p := pg_temp.act_out(f.tb, 'claim_seat', jsonb_build_object('car_id', car, 'day_id', f.dy, 'run', 'to'));
  perform pg_temp.rec(3, 'a sibling takes the first seat alone: the family car carries the parent own child, and it is not red',
    p = 'ok' and exists (select 1 from public.hub_seats where car_id = car and invite_id = f.ib)
      and public._hub_own_aboard(car) and public._hub_car_problem(car) is null,
    format('sibling: %s; own aboard %s; problem %s', p, public._hub_own_aboard(car), coalesce(public._hub_car_problem(car), 'none')));

  q := pg_temp.act_out(f.tc, 'claim_seat', jsonb_build_object('car_id', car, 'day_id', f.dy, 'run', 'to'));
  perform pg_temp.rec(4, 'with the sibling aboard the car takes one outsider (positive control for check 2)',
    q = 'ok' and (select count(*) from public.hub_seats where car_id = car) = 2 and public._hub_car_problem(car) is null,
    format('outsider: %s; riders %s', q, (select count(*) from public.hub_seats where car_id = car)));

  r := pg_temp.act_out(f.tb, 'unclaim_seat', jsonb_build_object('car_id', car));
  perform pg_temp.rec(5, 'the sibling leaving leaves the outsider alone with a parent not theirs: the car turns red',
    r = 'ok' and public._hub_car_problem(car) is not null and not public._hub_own_aboard(car),
    format('leave: %s; problem %s; own aboard %s', r, coalesce(public._hub_car_problem(car), 'none'), public._hub_own_aboard(car)));
end
$c$;

-- -- 6-7. the household on the page -------------------------------------------
do $c$
declare f t9_fx; hb jsonb; ha jsonb; hc jsonb; hl jsonb; car uuid;
begin
  select * into f from t9_fx;
  select id into car from public.hub_cars where driver_invite_id = f.ia and day_id = f.dy and run = 'to';
  hb := pg_temp.fam(f.tb, 'fetch') -> 'household';
  ha := pg_temp.fam(f.ta, 'fetch') -> 'household';
  hc := pg_temp.fam(f.tc, 'fetch') -> 'household';
  perform pg_temp.rec(6, 'B (read with the shared parent link) lists A and D; A can be opened, D cannot (that email is not on D); A lists B and its car carries A family car id',
    jsonb_array_length(hb) = 2
      and (select (x ->> 'can_open')::boolean from jsonb_array_elements(hb) x where x ->> 'invite_id' = f.ia::text)
      and not (select (x ->> 'can_open')::boolean from jsonb_array_elements(hb) x where x ->> 'invite_id' = f.id_::text)
      and (select (x -> 'cars') ? car::text from jsonb_array_elements(hb) x where x ->> 'invite_id' = f.ia::text)
      and jsonb_array_length(ha) = 1 and ha -> 0 ->> 'invite_id' = f.ib::text,
    format('B sees %s; A sees %s', hb, ha));
  hl := pg_temp.fam(f.tlegacy, 'fetch') -> 'household';
  perform pg_temp.rec(7, 'a family with no shared email lists nobody; a link with no email on it lists siblings but can open none',
    jsonb_array_length(hc) = 0 and jsonb_array_length(hl) = 1 and not (hl -> 0 ->> 'can_open')::boolean,
    format('C sees %s; legacy link sees %s', hc, hl));
end
$c$;

-- -- 8-9. hub_household_open --------------------------------------------------
do $c$
declare f t9_fx; o text; tok text; v jsonb; r1 text; r2 text; r3 text; r4 text; r5 text; n0 int; n1 int;
begin
  select * into f from t9_fx;
  o := pg_temp.anon(format('select public.hub_household_open(%L, %L)::text', f.tb, f.ia));
  tok := (o::jsonb) ->> 'token';
  v := pg_temp.fam(tok, 'fetch');
  perform pg_temp.rec(8, 'from B, the parent opens A: a fresh link that opens A, recorded for that parent email',
    tok is not null and v ->> 'invite_id' = f.ia::text and v ->> 'me' = 'parent-0009@example.invalid',
    format('open: %s; page %s; me %s', left(o, 40), v ->> 'invite_id', v ->> 'me'));

  select count(*) into n0 from public.hub_invite_tokens;
  r1 := pg_temp.anon(format('select public.hub_household_open(%L, %L)::text', f.tb, f.id_));
  r2 := pg_temp.anon(format('select public.hub_household_open(%L, %L)::text', f.tc, f.ia));
  r3 := pg_temp.anon(format('select public.hub_household_open(%L, %L)::text', f.tlegacy, f.ib));
  r4 := pg_temp.anon(format('select public.hub_household_open(%L, %L)::text', f.tb, f.ib));
  r5 := pg_temp.anon(format('select public.hub_household_open(%L, %L)::text', 'AAAAAAAAAAAAAAAAAAAAAA', f.ia));
  select count(*) into n1 from public.hub_invite_tokens;
  perform pg_temp.rec(9, 'refused, minting nothing: a page not on your email (D), not a sibling (C to A), a link with no email, your own page; an unknown link is not_found',
    r1 like 'err:P0001:hub:not_household%' and r2 like 'err:P0001:hub:not_household%' and r3 like 'err:P0001:hub:not_household%'
      and r4 like 'err:P0001:hub:not_household%' and r5 like 'err:P0002:hub:not_found%' and n1 = n0,
    format('D %s; C->A %s; legacy %s; own %s; unknown %s; links minted %s', left(r1, 28), left(r2, 28), left(r3, 28), left(r4, 28), left(r5, 24), n1 - n0));
end
$c$;

-- -- 10. who may execute what -------------------------------------------------
do $c$
declare bad text; n int;
begin
  with want(sig, a, u, s) as (values
    ('public.hub_household_open(text,uuid)', true, true, true),
    ('public._hub_siblings(uuid,uuid)', false, false, false),
    ('public._hub_own_aboard(uuid)', false, false, false),
    ('public._hub_claim(uuid,uuid,uuid,text,boolean)', false, false, false),
    ('public._hub_family_extras(uuid,text)', false, false, false))
  select count(p.oid), string_agg(w.sig, ', ') filter (where p.oid is null
           or has_function_privilege('anon', p.oid, 'EXECUTE') <> w.a
           or has_function_privilege('authenticated', p.oid, 'EXECUTE') <> w.u
           or has_function_privilege('service_role', p.oid, 'EXECUTE') <> w.s
           or not p.prosecdef
           or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(10, 'hub_household_open is open to anon and signed-in callers, the helpers to nobody; all SECURITY DEFINER with a pinned search_path',
    n = 5 and bad is null, format('%s of 5 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t9_results
union all
select 998, 'setup', case when count(*) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(label || ': ' || outcome, ' | '), 'every setup save was accepted') from t9_log
union all
select 999, 'summary', case when (select count(*) filter (where result = 'FAIL') from t9_results) = 0
                             and (select count(*) from t9_results) = 10
                             and (select count(*) from t9_log) = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL of %s checks', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*))
  from t9_results
order by 1;

rollback;
