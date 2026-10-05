-- ============================================================
-- 0005_event_family_hub RLS + rules test
--
-- Run in the Supabase SQL editor AFTER 0005_event_family_hub.sql (0006 may
-- or may not be applied; this test builds its own fixture event and never
-- reads the seed). SAFE ON LIVE DATA: the whole script is one transaction
-- that ends in ROLLBACK. Its events, invites, tokens, cars and emails never
-- persist, and the outbox rows it creates never commit, so nothing is ever
-- emailed. It writes nothing to auth.users.
--
-- HOW TO READ IT: ONE ROW PER CHECK -- n, check, result (PASS / FAIL / SKIP),
-- detail -- plus a final "summary" row. A broken boundary is a FAIL row, not
-- an abort: every check runs and reports. It aborts outright only when it
-- cannot test at all (0005 not applied, or not enough members to act as).
--
-- Outcomes are recorded as ok:<rows> or err:<SQLSTATE>:<message>. A rule's
-- refusal reads err:P0001:hub:<code>; an unknown token err:P0002:hub:not_found;
-- a missing privilege or an RLS WITH CHECK err:42501. ok:0 is the silent
-- refusal (no policy matched); each check names the one it requires.
--
-- WHAT IS PROVED, and the positive control beside each refusal:
--    1-6   structure: RLS on every table, anon has no privilege on any of
--          them, family data not writable by anyone signed in, tokens and
--          the throttle unreadable, every function executable by exactly the
--          role that calls it, every function's search_path pinned
--    7-12  answers and phase completeness: sign-up done only once every
--          required answer is saved, a pickup spot stored only with consent,
--          a car listed only once its offer and driver checks are complete,
--          lock-in done once every coming day is confirmed
--   13-21  seats: a claim and its home default, the driver's own child,
--          capacity, the one-minor rule refused / overridden / red / blocks
--          Left, Left freezes the car
--   22-33  consent-gated visibility: driver phone, rider phone, pickup spot
--          open and accepted, allergy names, the member board, the staff
--          and family entry points
--   34-49  windows and mail: food claims and edits until the meal starts,
--          the event-over and day-over windows, driver paperwork pending,
--          car edits, unknown / malformed / revoked tokens get nothing, only
--          the hash is stored, invites minted at send time, the lock-in
--          email, the resend throttle, 14-day retention, leaving the carpool
--   50-63  per table: a non-staff member reads 0 rows where staff read >= 1
--          (widen any ONE policy to using (true) and its row turns FAIL)
--   64-69  direct writes refused for students AND staff on family data;
--          staff CAN write setup tables (positive); anon gets nothing
-- ============================================================

begin;

do $applied$
begin
  if to_regclass('public.hub_events') is null or to_regclass('public.hub_seats') is null
     or to_regprocedure('public.hub_family_call(text, text, jsonb)') is null
     or to_regprocedure('public.hub_staff_call(text, jsonb)') is null
     or to_regprocedure('public.hub_member_board(uuid)') is null then
    raise exception 'Cannot test: 0005_event_family_hub.sql has not been applied';
  end if;
end
$applied$;

create temp table t5_results (
  n          int  primary key,
  check_name text not null,
  result     text not null,
  detail     text
) on commit drop;

create temp table t5_fx (
  staff_id   uuid, member_id uuid, parent_id uuid, unapproved_id uuid,
  s1 uuid, s2 uuid, s3 uuid, s4 uuid,
  ev uuid default gen_random_uuid(), ev_past uuid default gen_random_uuid(),
  ev_recent uuid default gen_random_uuid(), ev_mid uuid default gen_random_uuid(),
  d1 uuid default gen_random_uuid(), d2 uuid default gen_random_uuid(), d3 uuid default gen_random_uuid(),
  pd uuid default gen_random_uuid(), rd uuid default gen_random_uuid(),
  md0 uuid default gen_random_uuid(), md1 uuid default gen_random_uuid(),
  m_future uuid default gen_random_uuid(), m_started uuid default gen_random_uuid(),
  n1 uuid default gen_random_uuid(), n2 uuid default gen_random_uuid(),
  ia uuid default gen_random_uuid(), ib uuid default gen_random_uuid(),
  id_ uuid default gen_random_uuid(), ie uuid default gen_random_uuid(),
  ip uuid default gen_random_uuid(), ir uuid default gen_random_uuid(), im uuid default gen_random_uuid(),
  ta text, tb text, td text, te text, tp text, tr text, tm text, ta2 text,
  staff_car uuid
) on commit drop;

-- Actors, picked from live data. Four non-staff members act as four
-- families' students (approved students first); a student acts as the
-- signed-in member; a parent-only account and an unapproved account are
-- used where they exist.
insert into t5_fx (staff_id, member_id, parent_id, unapproved_id)
select
  (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead', 'admin')
    order by r.role = 'admin', r.member_id limit 1),
  (select p.id from public.profiles p
    where p.approved
      and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
      and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
    order by p.id limit 1),
  (select p.id from public.profiles p
    where exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')
      and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin'))
    order by p.id limit 1),
  (select p.id from public.profiles p
    where not p.approved
      and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
    order by p.id limit 1);

with picks as (
  select p.id, row_number() over (
           order by exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student') desc,
                    p.approved desc, p.id) as k
    from public.profiles p
   where not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin')))
update t5_fx set
  s1 = (select id from picks where k = 1), s2 = (select id from picks where k = 2),
  s3 = (select id from picks where k = 3), s4 = (select id from picks where k = 4);

do $pre$
declare f t5_fx;
begin
  select * into f from t5_fx;
  if f.staff_id is null then raise exception 'Cannot test: no member holds mentor, lead or admin'; end if;
  if f.member_id is null then raise exception 'Cannot test: no approved, non-staff student to read the member board as'; end if;
  if f.s4 is null then raise exception 'Cannot test: need four non-staff members to act as four families'; end if;
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

-- One statement as (role, member): 'ok:<rows>' or 'err:<SQLSTATE>:<message>'.
create function pg_temp.run_as(p_role text, p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare n int; outcome text;
begin
  perform pg_temp.act(p_role, p_who);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    outcome := 'ok:' || n;
  exception when others then
    outcome := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return outcome;
end
$fn$;

-- The first column of a one-row query as (role, member), as text.
create function pg_temp.val_as(p_role text, p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_role, p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return v;
end
$fn$;

-- A family's call, exactly as the event-family Edge Function makes it: as
-- service_role, through hub_family_call. A refusal comes back as
-- {"error": "<SQLSTATE>:<message>"}; the refused call left nothing behind.
create function pg_temp.fam(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $fn$
declare v jsonb;
begin
  perform pg_temp.act('service_role', null);
  begin
    v := public.hub_family_call(p_token, p_action, p_args);
  exception when others then
    v := jsonb_build_object('error', sqlstate || ':' || sqlerrm);
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

-- A staff call, as the signed-in member p_who through hub_staff_call.
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

-- How many non-null values of key k appear anywhere in j.
create function pg_temp.nkey(j jsonb, k text) returns int language sql as $fn$
  select count(*)::int from jsonb_path_query(j, ('strict $.**.' || k)::jsonpath, '{}', true) x
   where jsonb_typeof(x) not in ('null')
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text)
returns void language sql as $fn$
  insert into t5_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

-- -- Fixture, as the table owner (bypasses RLS) ---------------------------------
-- Main event: three days 10-12 days out. A past event (ended 15 days ago), a
-- recent one (ended 3 days ago), and one whose first day is over while its
-- second is not, for the windows.

insert into public.hub_events (id, title, venue_name, phase1_due_at, lockin_opens_at, lockin_due_at, links)
select ev, 'rls-0005 fixture', 'Fixture Venue', now() + interval '5 days', now() - interval '1 day',
       now() + interval '8 days', '{"first_registration": "https://example.invalid/first"}'::jsonb from t5_fx;
insert into public.hub_days (id, event_id, day_date, position, title, meet_at, venue_closes_at, ask_pit_setup, ask_school_ride, home_options)
select d1, ev, (now() + interval '10 days')::date, 1, 'Evening', now() + interval '10 days',
       now() + interval '10 days 10 hours', true, false,
       '[{"key":"pits","label":"Leave when pits close","default":true},{"key":"movie","label":"Stay for the movie"}]'::jsonb from t5_fx
union all
select d2, ev, (now() + interval '11 days')::date, 2, 'Quals', now() + interval '11 days',
       now() + interval '11 days 12 hours', false, true, '[]'::jsonb from t5_fx
union all
select d3, ev, (now() + interval '12 days')::date, 3, 'Playoffs', now() + interval '12 days',
       now() + interval '12 days 12 hours', false, true, '[]'::jsonb from t5_fx;
insert into public.hub_meals (id, event_id, day_id, label, starts_at)
select m_future, ev, d1, 'Fri dinner', now() + interval '10 days 2 hours' from t5_fx
union all
select m_started, ev, d2, 'Sat lunch', now() - interval '1 hour' from t5_fx;
insert into public.hub_food_needs (id, meal_id, label, quantity, starter)
select n1, m_future, 'Main dish', 2, true from t5_fx
union all
select n2, m_started, 'Water case', 1, false from t5_fx;

insert into public.hub_invites (id, event_id, student_id, emails)
select ia, ev, s1, array['rls0005-a@example.invalid'] from t5_fx
union all select ib, ev, s2, array['rls0005-b@example.invalid'] from t5_fx
union all select id_, ev, s3, array['rls0005-d@example.invalid'] from t5_fx
union all select ie, ev, s4, array['rls0005-e@example.invalid'] from t5_fx;

insert into public.hub_events (id, title) select ev_past, 'rls-0005 past' from t5_fx
union all select ev_recent, 'rls-0005 recent' from t5_fx
union all select ev_mid, 'rls-0005 mid' from t5_fx;
update public.hub_events set lockin_opens_at = now() + interval '3 days'
 where id = (select ev_mid from t5_fx);
insert into public.hub_days (id, event_id, day_date, venue_closes_at)
select pd, ev_past, (now() - interval '16 days')::date, now() - interval '15 days' from t5_fx
union all select rd, ev_recent, (now() - interval '4 days')::date, now() - interval '3 days' from t5_fx
union all select md0, ev_mid, (now() - interval '2 days')::date, now() - interval '1 day' from t5_fx
union all select md1, ev_mid, (now() + interval '2 days')::date, now() + interval '2 days 8 hours' from t5_fx;
insert into public.hub_invites (id, event_id, student_id, emails)
select ip, ev_past, s1, array['rls0005-p@example.invalid'] from t5_fx
union all select ir, ev_recent, s2, array['rls0005-r@example.invalid'] from t5_fx
union all select im, ev_mid, s1, array['rls0005-m@example.invalid'] from t5_fx;
insert into public.hub_day_answers (invite_id, day_id, attending, school_mode)
select ip, pd, 'yes', 'pickup' from t5_fx union all select ir, rd, 'yes', 'pickup' from t5_fx;
insert into public.hub_pickups (invite_id, day_id, spot, consent_at)
select ip, pd, 'Old Corner', now() - interval '20 days' from t5_fx
union all select ir, rd, 'Recent Corner', now() - interval '5 days' from t5_fx;
insert into public.hub_responses (invite_id, driver_phone_consent_at, rider_phone_consent_at)
select ip, now() - interval '20 days', now() - interval '20 days' from t5_fx
union all select ir, now() - interval '5 days', now() - interval '5 days' from t5_fx;

update t5_fx set
  ta = public._hub_mint_token(ia), tb = public._hub_mint_token(ib), td = public._hub_mint_token(id_),
  te = public._hub_mint_token(ie), tp = public._hub_mint_token(ip), tr = public._hub_mint_token(ir),
  tm = public._hub_mint_token(im), ta2 = public._hub_mint_token(ia);

create temp table t5_log (label text, outcome text) on commit drop;
create temp table t5_minted (outbox_id uuid, invite_id uuid, token text) on commit drop;
grant all on t5_minted to service_role;
create function pg_temp.must(p_label text, p_out text) returns void language sql as $fn$
  insert into t5_log select p_label, p_out where p_out is distinct from 'ok';
$fn$;

-- -- 1-6. Structure ---------------------------------------------------------
do $structure$
declare
  tabs text[] := array['hub_events','hub_days','hub_meals','hub_food_needs','hub_invites','hub_invite_tokens',
                       'hub_responses','hub_day_answers','hub_cars','hub_seats','hub_pickups','hub_food_claims',
                       'hub_outbox','hub_resend_log'];
  famtabs text[] := array['hub_invites','hub_responses','hub_day_answers','hub_cars','hub_seats','hub_pickups',
                          'hub_food_claims','hub_outbox'];
  svc text[] := array['hub_family_call','hub_resend_request','hub_outbox_take','hub_outbox_mint_link',
                      'hub_outbox_done','hub_cron_enqueue'];
  usr text[] := array['hub_member_board','hub_member_events','hub_staff_call'];
  -- Functions a LATER migration adds (0007's open link, 0008's family
  -- changes) carry their own grants, checked by their own tests. Check 5 is
  -- about 0005's functions, so it skips these; without this list it failed
  -- whenever 0007 was applied, which it was meant never to do.
  later text[] := array['hub_join','hub_join_info','hub_add_parent','_hub_join_eligible','_hub_join_event','_hub_join_taken',
                        '_hub_mask_email','hub_remove_guardian','hub_remove_family','hub_staff_remove_guardian',
                        'hub_staff_remove_family','hub_staff_place_pair','_hub_mint_token_for','_hub_family_extras',
                        '_hub_remove_guardian','_hub_remove_family'];
  bad text; n int;
begin
  select count(*), string_agg(c.relname, ', ') filter (where not c.relrowsecurity) into n, bad
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = any(tabs);
  perform pg_temp.rec(1, 'RLS is on for all 14 hub tables', n = 14 and bad is null,
    format('%s of 14 tables found; without RLS: %s', n, coalesce(bad, 'none')));

  select string_agg(t || ':' || pv, ', ') into bad
    from unnest(tabs) t, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pv
   where has_table_privilege('anon', 'public.' || t, pv);
  perform pg_temp.rec(2, 'anon holds no privilege on any hub table', bad is null, coalesce('held: ' || bad, 'none held, 14 tables x 7 privileges'));

  select string_agg(t || ':' || pv, ', ') into bad
    from unnest(famtabs) t, unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) pv
   where has_table_privilege('authenticated', 'public.' || t, pv);
  select count(*) into n from unnest(famtabs) t where has_table_privilege('authenticated', 'public.' || t, 'SELECT');
  perform pg_temp.rec(3, 'authenticated cannot write family data (staff included); it may SELECT, which RLS narrows to staff',
    bad is null and n = 8, format('writes held: %s; SELECT held on %s of 8 (want 8)', coalesce(bad, 'none'), n));

  select string_agg(t || ':' || pv, ', ') into bad
    from unnest(array['hub_invite_tokens','hub_resend_log']) t, unnest(array['SELECT','INSERT','UPDATE','DELETE']) pv
   where has_table_privilege('authenticated', 'public.' || t, pv);
  perform pg_temp.rec(4, 'nobody signed in can touch the token hashes or the resend throttle', bad is null, coalesce('held: ' || bad, 'none held'));

  select string_agg(format('%s(anon=%s,auth=%s,svc=%s)', p.proname,
           has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE'),
           has_function_privilege('service_role', p.oid, 'EXECUTE')), ', ')
    into bad
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and (p.proname like '\_hub\_%' or p.proname like 'hub\_%' or p.proname = 'invoke_event_hub_tick')
     and not (p.proname = any(later))
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE') <> (p.proname = any(usr))
          or has_function_privilege('service_role', p.oid, 'EXECUTE') <> (p.proname = any(svc)));
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and (p.proname like '\_hub\_%' or p.proname like 'hub\_%') and not (p.proname = any(later));
  perform pg_temp.rec(5, 'each hub function is executable by exactly its caller: 6 by service_role, 3 by authenticated, none by anon',
    bad is null, format('%s functions checked; wrong: %s', n, coalesce(bad, 'none')));

  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and (p.proname like '\_hub\_%' or p.proname like 'hub\_%' or p.proname = 'invoke_event_hub_tick')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and (p.proname like '\_hub\_%' or p.proname like 'hub\_%') and p.prosecdef;
  perform pg_temp.rec(6, 'every hub function pins search_path (SECURITY DEFINER ones above all)',
    bad is null and n >= 40, format('%s are SECURITY DEFINER; without a pinned search_path: %s', n, coalesce(bad, 'none')));
end
$structure$;

-- -- 7-12. Answers, saved field by field as the page autosaves ---------------
do $answers$
declare f t5_fx; pr jsonb; v jsonb; n int; n2 int;
begin
  select * into f from t5_fx;

  pr := pg_temp.fam(f.te, 'fetch') -> 'progress';
  perform pg_temp.rec(7, 'a family with no answers is not done (negative control for check 8)',
    (pr ->> 'phase1_done') = 'false' and jsonb_array_length(pr -> 'missing') >= 8,
    format('phase1_done %s, %s answers missing', pr ->> 'phase1_done', jsonb_array_length(pr -> 'missing')));

  -- Family A: a rider. Every required answer.
  perform pg_temp.must('A', pg_temp.save(f.ta, 'staying_nights', '[]'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'attending', '"yes"', f.d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'attending', '"yes"', f.d2));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'attending', '"no"', f.d3));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'adults', '1', f.d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'adults', '0', f.d2));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'pit_setup', 'false', f.d1));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'school_mode', '"self"', f.d2));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'allergens', '["peanut"]'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'medication', 'false'));
  pr := pg_temp.fam(f.ta, 'fetch') -> 'progress';
  perform pg_temp.must('A', pg_temp.save(f.ta, 'parent_name', '"Alex Avila"'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'parent_phone', '"(555) 555-0101"'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'parent_email', '"Rls0005-A@example.invalid"'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'emergency_name', '"Emma Avila"'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'emergency_phone', '"5555550102"'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'first_reg_done', 'true'));
  perform pg_temp.must('A', pg_temp.save(f.ta, 'rider_phone_consent', 'true'));
  v := pg_temp.fam(f.ta, 'fetch') -> 'progress';
  perform pg_temp.rec(8, 'family A: sign-up done once every required answer is saved; not before the contacts step',
    (pr ->> 'phase1_done') = 'false' and (pr -> 'steps' ->> 'contacts') = 'false'
      and (v ->> 'phase1_done') = 'true' and (v ->> 'lockin_done') = 'false' and (v ->> 'unconfirmed_days') = '2',
    format('before contacts: phase1 %s; after: phase1 %s, lockin %s, unconfirmed %s',
           pr ->> 'phase1_done', v ->> 'phase1_done', v ->> 'lockin_done', v ->> 'unconfirmed_days'));

  -- Family B: a rider who asks for a pickup on day 2.
  perform pg_temp.must('B', pg_temp.save(f.tb, 'staying_nights', '[]'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'attending', '"yes"', f.d1));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'attending', '"yes"', f.d2));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'attending', '"unsure"', f.d3));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'adults', '0', f.d1));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'adults', '2', f.d2));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'pit_setup', 'true', f.d1));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'home_option', '"movie"', f.d1));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'allergies_none', 'true'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'medication', 'true'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'parent_name', '"Bo Baker"'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'parent_phone', '"5555550201"'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'parent_email', '"rls0005-b@example.invalid"'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'emergency_name', '"Bea Baker"'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'emergency_phone', '"5555550202"'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'first_reg_done', 'false'));
  perform pg_temp.must('B', pg_temp.save(f.tb, 'pickup', '{"spot":"Main St and 1st","consent":false}', f.d2));
  select count(*) into n from public.hub_pickups where invite_id = f.ib;
  perform pg_temp.must('B', pg_temp.save(f.tb, 'pickup', '{"spot":"Main St and 1st","consent":true,"covers_home":true}', f.d2));
  select count(*) into n2 from public.hub_pickups where invite_id = f.ib and spot is not null and consent_at is not null;
  perform pg_temp.rec(9, 'a pickup spot is stored only with consent: 0 rows without it, 1 with it',
    n = 0 and n2 = 1, format('without consent: %s row(s); with consent: %s', n, n2));

  -- Family D: drives both days, its own student aboard; consents to share its phone.
  perform pg_temp.must('D', pg_temp.save(f.td, 'staying_nights', '[]'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'attending', '"yes"', f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'attending', '"yes"', f.d2));
  perform pg_temp.must('D', pg_temp.save(f.td, 'attending', '"no"', f.d3));
  perform pg_temp.must('D', pg_temp.save(f.td, 'adults', '1', f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'adults', '1', f.d2));
  perform pg_temp.must('D', pg_temp.save(f.td, 'pit_setup', 'true', f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'to_mode', '"driving"', f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_seats', '1', f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_description', '"silver Odyssey"', f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_leave_by', to_jsonb((now() + interval '10 days 9 hours')::text), f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_takes_pickups', 'false', f.d1));
  perform pg_temp.must('D', pg_temp.save(f.td, 'to_mode', '"driving"', f.d2));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_seats', '3', f.d2));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_description', '"blue van"', f.d2));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_leave_by', to_jsonb((now() + interval '11 days 11 hours')::text), f.d2));
  perform pg_temp.must('D', pg_temp.save(f.td, 'car_takes_pickups', 'true', f.d2));
  select count(*) into n from public.hub_cars where driver_invite_id = f.id_;
  perform pg_temp.must('D', pg_temp.save(f.td, 'driver_25', 'true'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'driver_licensed', 'true'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'driver_phone_consent', 'true'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'parent_name', '"Dana Diaz"'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'parent_phone', '"5555551234"'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'parent_email', '"rls0005-d@example.invalid"'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'emergency_name', '"Del Diaz"'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'emergency_phone', '"5555551235"'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'allergies_none', 'true'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'medication', 'false'));
  perform pg_temp.must('D', pg_temp.save(f.td, 'first_reg_done', 'true'));
  select count(*) into n2 from public.hub_cars where driver_invite_id = f.id_;

  -- Family E: rides on day 1, drives on day 2 without taking pickups.
  perform pg_temp.must('E', pg_temp.save(f.te, 'staying_nights', '[]'));
  perform pg_temp.must('E', pg_temp.save(f.te, 'attending', '"yes"', f.d1));
  perform pg_temp.must('E', pg_temp.save(f.te, 'attending', '"yes"', f.d2));
  perform pg_temp.must('E', pg_temp.save(f.te, 'attending', '"no"', f.d3));
  perform pg_temp.must('E', pg_temp.save(f.te, 'to_mode', '"driving"', f.d2));
  perform pg_temp.must('E', pg_temp.save(f.te, 'car_seats', '2', f.d2));
  perform pg_temp.must('E', pg_temp.save(f.te, 'car_description', '"red sedan"', f.d2));
  perform pg_temp.must('E', pg_temp.save(f.te, 'car_leave_by', to_jsonb((now() + interval '11 days 11 hours')::text), f.d2));
  perform pg_temp.must('E', pg_temp.save(f.te, 'car_takes_pickups', 'false', f.d2));
  perform pg_temp.must('E', pg_temp.save(f.te, 'driver_25', 'true'));
  perform pg_temp.must('E', pg_temp.save(f.te, 'driver_licensed', 'true'));
  perform pg_temp.must('E', pg_temp.save(f.te, 'parent_phone', '"5555550401"'));

  select count(*) into n from t5_log where label in ('A', 'B', 'D', 'E');
  perform pg_temp.rec(10, 'every answer the four families saved was accepted', n = 0,
    coalesce((select string_agg(label || ' ' || outcome, ' | ') from t5_log), 'all ok'));

  select count(*) into n from public.hub_cars where driver_invite_id = f.id_;
  select count(*) into n2 from public.hub_cars where driver_invite_id = f.ie;
  perform pg_temp.rec(11, 'a car lists only once the offer is complete AND both driver checks are ticked',
    n = 4 and n2 = 2,
    format('family D: %s cars (want 4: two days x two runs); family E: %s (want 2)', n, n2));

  -- Lock-in: A confirms both days; B confirms both but leaves day 3 "Not sure yet".
  perform pg_temp.must('lockA', coalesce(pg_temp.fam(f.ta, 'confirm_day', jsonb_build_object('day_id', f.d1)) ->> 'error', 'ok'));
  perform pg_temp.must('lockA', coalesce(pg_temp.fam(f.ta, 'confirm_day', jsonb_build_object('day_id', f.d2)) ->> 'error', 'ok'));
  perform pg_temp.must('lockB', coalesce(pg_temp.fam(f.tb, 'confirm_day', jsonb_build_object('day_id', f.d1)) ->> 'error', 'ok'));
  perform pg_temp.must('lockB', coalesce(pg_temp.fam(f.tb, 'confirm_day', jsonb_build_object('day_id', f.d2)) ->> 'error', 'ok'));
  pr := pg_temp.fam(f.ta, 'fetch') -> 'progress';
  v := pg_temp.fam(f.tb, 'fetch') -> 'progress';
  perform pg_temp.rec(12, 'lock-in: done once every coming day is confirmed; a day still "Not sure yet" holds it open',
    (pr ->> 'lockin_done') = 'true' and (v ->> 'phase1_done') = 'true' and (v ->> 'lockin_done') = 'false'
      and (v ->> 'unsure_days') = '1' and not exists (select 1 from t5_log where label like 'lock%'),
    format('A lockin %s; B phase1 %s, lockin %s with %s unsure day(s); confirm errors: %s',
           pr ->> 'lockin_done', v ->> 'phase1_done', v ->> 'lockin_done', v ->> 'unsure_days',
           coalesce((select string_agg(outcome, ' | ') from t5_log where label like 'lock%'), 'none')));
end
$answers$;

-- -- 13-21. Seats: capacity, the own-child exemption, the one-minor rule -----
do $seats$
declare f t5_fx; v jsonb; c1 uuid; c_home uuid; n int; p text; o text;
begin
  select * into f from t5_fx;
  select id into c1 from public.hub_cars where driver_invite_id = f.id_ and day_id = f.d1 and run = 'to';
  select id into c_home from public.hub_cars where driver_invite_id = f.id_ and day_id = f.d1 and run = 'home';

  v := pg_temp.fam(f.ta, 'claim_seat', jsonb_build_object('car_id', c1));
  select count(*) into n from public.hub_seats where invite_id = f.ia and day_id = f.d1;
  perform pg_temp.rec(13, 'a claim seats the student, and the home run defaults to the same driver''s car',
    v ->> 'error' is null and n = 2 and (v -> 'result' ->> 'home') = 'placed',
    format('error %s; A''s day-1 seats %s (want 2); home %s', coalesce(v ->> 'error', 'none'), n, v -> 'result' ->> 'home'));

  perform pg_temp.rec(14, 'the driver''s OWN student aboard: one other rider is allowed (the rule is "alone with a single minor")',
    public._hub_car_problem(c1) is null and public._hub_own_aboard(c1),
    format('own aboard %s; problem %s', public._hub_own_aboard(c1), coalesce(public._hub_car_problem(c1), 'none')));

  v := pg_temp.fam(f.tb, 'claim_seat', jsonb_build_object('car_id', c1));
  select count(*) into n from public.hub_seats where car_id = c1;
  perform pg_temp.rec(15, 'capacity: the last seat taken, the next claim is refused "That car just filled"',
    v ->> 'error' like 'P0001:hub:car_full%' and n = 1,
    format('second claim: %s; riders in the 1-seat car: %s', coalesce(v ->> 'error', 'accepted'), n));

  -- A mentor's car: no own child aboard, so the one-minor rule bites.
  v := pg_temp.stf(f.staff_id, 'add_car', jsonb_build_object('day_id', f.d1, 'run', 'to', 'driver_label', 'Mentor Van',
         'seats', 3, 'description', 'white van', 'takes_pickups', false));
  update t5_fx set staff_car = (v ->> 'car_id')::uuid;
  select * into f from t5_fx;

  v := pg_temp.fam(f.tb, 'claim_seat', jsonb_build_object('car_id', f.staff_car));
  o := v ->> 'error';
  v := pg_temp.stf(f.staff_id, 'move', jsonb_build_object('invite_id', f.ib, 'day_id', f.d1, 'run', 'to', 'car_id', f.staff_car));
  p := v ->> 'error';
  perform pg_temp.rec(16, 'one-minor rule: the first student into a car without the driver''s own child is refused, family and staff alike',
    o like 'P0001:hub:one_minor%' and p like 'P0001:hub:one_minor%',
    format('family claim: %s; staff move without a reason: %s', coalesce(o, 'accepted'), coalesce(p, 'accepted')));

  v := pg_temp.stf(f.staff_id, 'move', jsonb_build_object('invite_id', f.ib, 'day_id', f.d1, 'run', 'to',
         'car_id', f.staff_car, 'override_reason', 'second rider joins at the lot'));
  perform pg_temp.rec(17, 'a staff move with an override reason places the student and records the reason',
    v ->> 'error' is null
      and (select minor_override_reason from public.hub_cars where id = f.staff_car) = 'second rider joins at the lot'
      and (select override_reason from public.hub_seats where car_id = f.staff_car and invite_id = f.ib) is not null,
    format('move: %s; car override: %s', coalesce(v ->> 'error', 'ok'),
           coalesce((select minor_override_reason from public.hub_cars where id = f.staff_car), 'none')));

  v := pg_temp.fam(f.te, 'claim_seat', jsonb_build_object('car_id', f.staff_car));
  perform pg_temp.rec(18, 'a second rider is accepted, and the car is fine without the override (which is cleared)',
    v ->> 'error' is null and public._hub_car_problem(f.staff_car) is null
      and (select minor_override_reason from public.hub_cars where id = f.staff_car) is null,
    format('claim: %s; problem %s; override %s', coalesce(v ->> 'error', 'ok'),
           coalesce(public._hub_car_problem(f.staff_car), 'none'),
           coalesce((select minor_override_reason from public.hub_cars where id = f.staff_car), 'cleared')));

  select count(*) into n from public.hub_outbox where event_id = f.ev and kind = 'car_red';
  v := pg_temp.fam(f.te, 'unclaim_seat', jsonb_build_object('car_id', f.staff_car));
  perform pg_temp.rec(19, 'a rider LEAVING into the one-minor state is allowed; the car turns red and mentors are emailed',
    v ->> 'error' is null and public._hub_car_problem(f.staff_car) = 'needs_second_rider'
      and (select count(*) from public.hub_outbox where event_id = f.ev and kind = 'car_red') = n + 1,
    format('leave: %s; problem %s; car_red emails %s -> %s', coalesce(v ->> 'error', 'ok'),
           coalesce(public._hub_car_problem(f.staff_car), 'none'), n,
           (select count(*) from public.hub_outbox where event_id = f.ev and kind = 'car_red')));

  v := pg_temp.fam(f.tb, 'mark', jsonb_build_object('car_id', f.staff_car, 'what', 'left'));
  o := v ->> 'error';
  v := pg_temp.stf(f.staff_id, 'mark', jsonb_build_object('car_id', f.staff_car, 'what', 'left'));
  p := v ->> 'error';
  v := pg_temp.stf(f.staff_id, 'mark', jsonb_build_object('car_id', f.staff_car, 'what', 'left',
         'override_reason', 'parent of the rider rides along'));
  perform pg_temp.rec(20, 'a red car cannot be marked Left: not by a rider family, not by staff without a reason; with one it leaves and its riders are emailed',
    o like 'P0001:hub:not_your_car%' and p like 'P0001:hub:needs_second_rider%' and v ->> 'error' is null
      and (select left_at from public.hub_cars where id = f.staff_car) is not null
      and exists (select 1 from public.hub_outbox where kind = 'car_left' and 'rls0005-b@example.invalid' = any(to_emails)),
    format('rider family: %s; staff without reason: %s; staff with reason: %s', coalesce(o, 'accepted'),
           coalesce(p, 'accepted'), coalesce(v ->> 'error', 'ok')));

  v := pg_temp.fam(f.tb, 'unclaim_seat', jsonb_build_object('car_id', f.staff_car));
  select count(*) into n from public.hub_seats where car_id = f.staff_car;
  perform pg_temp.rec(21, 'a car that has left is frozen: its rider cannot leave it',
    v ->> 'error' like 'P0001:hub:car_left%' and n = 1,
    format('leave after Left: %s; riders still in it: %s', coalesce(v ->> 'error', 'accepted'), n));
end
$seats$;

-- -- 22-33. Consent-gated visibility ----------------------------------------
do $visibility$
declare f t5_fx; ba jsonb; bb jsonb; bd jsonb; be jsonb; bs jsonb; bm jsonb; v jsonb; c2 uuid; c2e uuid; pk uuid;
        n_a int; n_b int; n_e int; n_d int; o text; p text;
begin
  select * into f from t5_fx;
  select id into c2 from public.hub_cars where driver_invite_id = f.id_ and day_id = f.d2 and run = 'to';
  select id into c2e from public.hub_cars where driver_invite_id = f.ie and day_id = f.d2 and run = 'to';
  select id into pk from public.hub_pickups where invite_id = f.ib and day_id = f.d2;

  ba := pg_temp.fam(f.ta, 'fetch') -> 'board';
  bb := pg_temp.fam(f.tb, 'fetch') -> 'board';
  be := pg_temp.fam(f.te, 'fetch') -> 'board';
  perform pg_temp.rec(22, 'a driver''s phone (consented) reaches the families in that car and no one else',
    pg_temp.nkey(ba, 'driver_phone') = 2 and pg_temp.nkey(bb, 'driver_phone') = 0 and pg_temp.nkey(be, 'driver_phone') = 0,
    format('family A (two seats in D''s cars): %s; family B (not in them): %s; family E (a driver too): %s',
           pg_temp.nkey(ba, 'driver_phone'), pg_temp.nkey(bb, 'driver_phone'), pg_temp.nkey(be, 'driver_phone')));

  perform pg_temp.save(f.td, 'driver_phone_consent', 'false');
  v := pg_temp.fam(f.ta, 'fetch') -> 'board';
  perform pg_temp.rec(23, 'without the driver''s consent the same family sees no phone and "contact through mentors"',
    pg_temp.nkey(v, 'driver_phone') = 0
      and (select count(*) from jsonb_path_query(v, 'strict $.**.phone_note', '{}', true) x where x #>> '{}' = 'contact_mentors') = 2,
    format('family A phones %s; contact-through-mentors notes %s',
           pg_temp.nkey(v, 'driver_phone'),
           (select count(*) from jsonb_path_query(v, 'strict $.**.phone_note', '{}', true) x where x #>> '{}' = 'contact_mentors')));
  perform pg_temp.save(f.td, 'driver_phone_consent', 'true');

  bd := pg_temp.fam(f.td, 'fetch') -> 'board';
  bs := pg_temp.stf(f.staff_id, 'board', jsonb_build_object('event_id', f.ev)) -> 'board';
  n_d := pg_temp.nkey(bd, 'spot'); n_e := pg_temp.nkey(be, 'spot'); n_a := pg_temp.nkey(ba, 'spot');
  perform pg_temp.rec(24, 'an OPEN pickup spot: drivers who offered pickups that day and staff see it; other drivers and families do not',
    n_d = 1 and pg_temp.nkey(bs, 'spot') = 1 and n_e = 0 and n_a = 0,
    format('pickup driver D %s, staff %s, non-pickup driver E %s, family A %s', n_d, pg_temp.nkey(bs, 'spot'), n_e, n_a));

  v := pg_temp.fam(f.te, 'pickup_accept', jsonb_build_object('pickup_id', pk, 'car_id', c2e));
  o := v ->> 'error';
  v := pg_temp.fam(f.ta, 'pickup_accept', jsonb_build_object('pickup_id', pk, 'car_id', c2));
  p := v ->> 'error';
  perform pg_temp.rec(25, 'only a pickup-taking driver accepts, and only into their own car',
    o like 'P0001:hub:no_pickups%' and p like 'P0001:hub:not_your_car%',
    format('driver without pickups: %s; another family into D''s car: %s', coalesce(o, 'accepted'), coalesce(p, 'accepted')));

  v := pg_temp.fam(f.td, 'pickup_accept', jsonb_build_object('pickup_id', pk, 'car_id', c2));
  perform pg_temp.rec(26, 'the pickup driver accepts: the student is in their car both ways, as a pickup',
    v ->> 'error' is null
      and (select count(*) from public.hub_seats where invite_id = f.ib and day_id = f.d2 and via_pickup) = 2
      and (select car_id from public.hub_pickups where id = pk) = c2,
    format('accept: %s; B''s day-2 pickup seats: %s', coalesce(v ->> 'error', 'ok'),
           (select count(*) from public.hub_seats where invite_id = f.ib and day_id = f.d2 and via_pickup)));

  ba := pg_temp.fam(f.ta, 'fetch') -> 'board';
  bb := pg_temp.fam(f.tb, 'fetch');
  bd := pg_temp.fam(f.td, 'fetch') -> 'board';
  be := pg_temp.fam(f.te, 'fetch') -> 'board';
  bs := pg_temp.stf(f.staff_id, 'board', jsonb_build_object('event_id', f.ev)) -> 'board';
  perform pg_temp.rec(27, 'an ACCEPTED pickup spot: the accepting driver and staff see it; nobody else, not even other drivers',
    pg_temp.nkey(bd, 'spot') = 2 and pg_temp.nkey(bs, 'spot') = 2 and pg_temp.nkey(be, 'spot') = 0
      and pg_temp.nkey(ba, 'spot') = 0 and pg_temp.nkey(bb -> 'board', 'spot') = 0
      and (bb -> 'answers' -> 'days' -> f.d2::text -> 'pickup' ->> 'spot') = 'Main St and 1st',
    format('accepting driver %s, staff %s, driver E %s, family A %s, family B on the board %s (its own answer: %s)',
           pg_temp.nkey(bd, 'spot'), pg_temp.nkey(bs, 'spot'), pg_temp.nkey(be, 'spot'), pg_temp.nkey(ba, 'spot'),
           pg_temp.nkey(bb -> 'board', 'spot'), bb -> 'answers' -> 'days' -> f.d2::text -> 'pickup' ->> 'spot'));

  perform pg_temp.rec(28, 'a rider family''s phone reaches their driver only with that family''s consent',
    pg_temp.nkey(bd, 'parent_phone') = 2
      and (select count(*) from public.hub_seats s where s.car_id in (select id from public.hub_cars where driver_invite_id = f.id_)
                                                     and s.invite_id = f.ib) = 2,
    format('driver D sees %s rider phones: family A consented and rides twice; family B rides twice and did not consent',
           pg_temp.nkey(bd, 'parent_phone')));

  perform pg_temp.rec(29, 'allergy NAMES are staff-only; families see the counts by allergen',
    pg_temp.nkey(bs, 'allergy_names') >= 1 and pg_temp.nkey(ba, 'allergy_names') = 0
      and exists (select 1 from jsonb_path_query(ba, 'strict $.meals[*].allergy_counts[*]', '{}', true) x
                   where x ->> 'allergen' = 'peanut' and (x ->> 'count')::int >= 1)
      and (bs::text like '%' || public._hub_student_name(f.s1) || '%'),
    format('staff allergy_names lists %s; family A %s; family A''s peanut count present: %s',
           pg_temp.nkey(bs, 'allergy_names'), pg_temp.nkey(ba, 'allergy_names'),
           exists (select 1 from jsonb_path_query(ba, 'strict $.meals[*].allergy_counts[*]', '{}', true) x
                    where x ->> 'allergen' = 'peanut')));

  v := jsonb_build_object('r', pg_temp.val_as('authenticated', f.member_id, format('select public.hub_member_board(%L)::text', f.ev)));
  bm := case when v ->> 'r' like 'err:%' then null else (v ->> 'r')::jsonb end;
  perform pg_temp.rec(30, 'a signed-in student reads the board: cars and rider names, and no phone, spot, allergy name or starter flag',
    bm is not null and jsonb_array_length(bm -> 'board' -> 'days') = 3
      and (select count(*) from jsonb_path_query(bm, 'strict $.board.days[*].runs[*].cars[*].riders[*].name', '{}', true)) >= 4
      and pg_temp.nkey(bm, 'driver_phone') = 0 and pg_temp.nkey(bm, 'spot') = 0 and pg_temp.nkey(bm, 'parent_phone') = 0
      and pg_temp.nkey(bm, 'allergy_names') = 0 and pg_temp.nkey(bm, 'starter') = 0
      and pg_temp.nkey(bs, 'driver_phone') >= 1 and pg_temp.nkey(bs, 'starter') >= 1,
    format('member: %s rider names, phones %s, spots %s, rider phones %s, allergy names %s, starters %s; staff on the same fixture: phones %s, starters %s',
           (select count(*) from jsonb_path_query(bm, 'strict $.board.days[*].runs[*].cars[*].riders[*].name', '{}', true)),
           pg_temp.nkey(bm, 'driver_phone'), pg_temp.nkey(bm, 'spot'), pg_temp.nkey(bm, 'parent_phone'),
           pg_temp.nkey(bm, 'allergy_names'), pg_temp.nkey(bm, 'starter'),
           pg_temp.nkey(bs, 'driver_phone'), pg_temp.nkey(bs, 'starter')));

  if f.parent_id is null and f.unapproved_id is null then
    insert into t5_results values (31, 'a parent-only or unapproved account cannot read the member board', 'SKIP',
      'no parent-only and no unapproved account exists to act as');
  else
    o := case when f.parent_id is null then 'skipped'
              else pg_temp.val_as('authenticated', f.parent_id, format('select public.hub_member_board(%L)::text', f.ev)) end;
    p := case when f.unapproved_id is null then 'skipped'
              else pg_temp.val_as('authenticated', f.unapproved_id, format('select public.hub_member_board(%L)::text', f.ev)) end;
    perform pg_temp.rec(31, 'a parent-only account (they use their link) and an unapproved account cannot read the member board',
      (o = 'skipped' or o like 'err:42501%') and (p = 'skipped' or p like 'err:42501%'),
      format('parent-only: %s; unapproved: %s', left(o, 40), left(p, 40)));
  end if;

  o := pg_temp.val_as('authenticated', f.member_id, 'select public.hub_staff_call(''overview'', ''{}''::jsonb)::text');
  v := pg_temp.stf(f.staff_id, 'overview', jsonb_build_object('event_id', f.ev));
  perform pg_temp.rec(32, 'the staff entry point refuses a student; staff get the overview of all four families',
    o like 'err:42501%' and jsonb_array_length(v -> 'families') = 4,
    format('student: %s; staff families: %s', left(o, 40), jsonb_array_length(v -> 'families')));

  o := pg_temp.val_as('authenticated', f.member_id, format('select public.hub_family_call(%L, ''fetch'')::text', f.ta));
  p := pg_temp.val_as('anon', null, format('select public.hub_family_call(%L, ''fetch'')::text', f.ta));
  perform pg_temp.rec(33, 'the family entry point is the Edge Function''s alone: a signed-in student and anon are refused even with a valid token',
    o like 'err:42501%' and p like 'err:42501%' and (pg_temp.fam(f.ta, 'fetch') ->> 'invite_id')::uuid = f.ia,
    format('student: %s; anon: %s; service role: opens it', left(o, 40), left(p, 40)));
end
$visibility$;

-- -- 34-49. Windows, paperwork, tokens, mail, retention ----------------------
do $windows$
declare f t5_fx; v jsonb; o text; p text; q text; n int; n2 int; c2 uuid; row_o public.hub_outbox; t text; ok boolean;
begin
  select * into f from t5_fx;
  select id into c2 from public.hub_cars where driver_invite_id = f.id_ and day_id = f.d2 and run = 'to';

  -- Food: claim, collision, the meal-start window, drop reopens and emails.
  o := coalesce(pg_temp.fam(f.ta, 'food_claim', jsonb_build_object('meal_id', f.m_future, 'need_id', f.n1,
         'what', 'Chicken tray', 'serves', 12, 'allergen', 'no')) ->> 'error', 'ok');
  p := coalesce(pg_temp.fam(f.tb, 'food_claim', jsonb_build_object('meal_id', f.m_future, 'need_id', f.n1,
         'what', 'Pasta', 'serves', 10, 'allergen', 'unsure')) ->> 'error', 'ok');
  perform pg_temp.rec(34, 'a food need is claimed by one family; the second gets "Someone just claimed that"',
    o = 'ok' and p like 'P0001:hub:need_taken%',
    format('first: %s; second: %s', o, p));

  o := coalesce(pg_temp.fam(f.ta, 'food_claim', jsonb_build_object('meal_id', f.m_started, 'need_id', f.n2,
         'what', 'Water', 'serves', 24, 'allergen', 'no')) ->> 'error', 'ok');
  p := coalesce(pg_temp.stf(f.staff_id, 'food_claim', jsonb_build_object('meal_id', f.m_started, 'need_id', f.n2,
         'what', 'Water', 'serves', 24, 'allergen', 'no', 'staff_label', 'Mentors')) ->> 'error', 'ok');
  perform pg_temp.rec(35, 'a family cannot claim food for a meal that has started; staff can',
    o like 'P0001:hub:meal_started%' and p = 'ok', format('family: %s; staff: %s', o, p));

  select count(*) into n from public.hub_outbox where kind = 'food_dropped' and event_id = f.ev;
  o := coalesce(pg_temp.fam(f.ta, 'food_drop', jsonb_build_object(
         'claim_id', (select id from public.hub_food_claims where need_id = f.n1))) ->> 'error', 'ok');
  perform pg_temp.rec(36, 'dropping a claimed need reopens it and emails mentors',
    o = 'ok' and not exists (select 1 from public.hub_food_claims where need_id = f.n1)
      and (select count(*) from public.hub_outbox where kind = 'food_dropped' and event_id = f.ev) = n + 1,
    format('drop: %s; need open: %s; food_dropped emails %s -> %s', o,
           not exists (select 1 from public.hub_food_claims where need_id = f.n1), n,
           (select count(*) from public.hub_outbox where kind = 'food_dropped' and event_id = f.ev)));

  perform pg_temp.fam(f.ta, 'food_claim', jsonb_build_object('meal_id', f.m_future, 'what', 'Brownies', 'serves', 20, 'allergen', 'yes'));
  update public.hub_meals set starts_at = now() - interval '5 minutes' where id = f.m_future;
  o := coalesce(pg_temp.fam(f.ta, 'food_edit', jsonb_build_object(
         'claim_id', (select id from public.hub_food_claims where invite_id = f.ia and what = 'Brownies'),
         'what', 'Cookies', 'serves', 20, 'allergen', 'yes')) ->> 'error', 'ok');
  update public.hub_meals set starts_at = now() + interval '10 days 2 hours' where id = f.m_future;
  p := coalesce(pg_temp.fam(f.ta, 'food_edit', jsonb_build_object(
         'claim_id', (select id from public.hub_food_claims where invite_id = f.ia and what = 'Brownies'),
         'what', 'Cookies', 'serves', 20, 'allergen', 'yes')) ->> 'error', 'ok');
  perform pg_temp.rec(37, 'a food claim is editable until its meal starts, and not after',
    o like 'P0001:hub:meal_started%' and p = 'ok', format('after the start: %s; before it: %s', o, p));

  -- The event-over and day-over windows; lock-in not open yet.
  o := pg_temp.save(f.tp, 'attending', '"no"', f.pd);
  v := pg_temp.fam(f.tp, 'fetch');
  perform pg_temp.rec(38, 'after the event ends everything is read-only, and the page still opens',
    o like 'P0001:hub:event_over%' and (v -> 'event' ->> 'over') = 'true' and v ->> 'error' is null,
    format('save: %s; fetch: %s', o, coalesce(v ->> 'error', 'opens, over = ' || (v -> 'event' ->> 'over'))));

  o := pg_temp.save(f.tm, 'attending', '"yes"', f.md0);
  p := pg_temp.save(f.tm, 'attending', '"yes"', f.md1);
  q := coalesce(pg_temp.fam(f.tm, 'confirm_day', jsonb_build_object('day_id', f.md1)) ->> 'error', 'ok');
  perform pg_temp.rec(39, 'a day that is over is read-only while a later day is not; confirming waits for lock-in to open',
    o like 'P0001:hub:day_over%' and p = 'ok' and q like 'P0001:hub:lockin_not_open%',
    format('past day: %s; next day: %s; confirm before lock-in opens: %s', o, p, q));

  -- Driver paperwork.
  update public.hub_events set driver_paperwork_required = true where id = f.ev;
  v := pg_temp.fam(f.ta, 'fetch') -> 'board';
  o := coalesce(pg_temp.fam(f.ta, 'claim_seat', jsonb_build_object('car_id', c2)) ->> 'error', 'ok');
  perform pg_temp.stf(f.staff_id, 'paperwork', jsonb_build_object('invite_id', f.id_, 'on', true));
  p := coalesce(pg_temp.fam(f.ta, 'claim_seat', jsonb_build_object('car_id', c2)) ->> 'error', 'ok');
  update public.hub_events set driver_paperwork_required = false where id = f.ev;
  perform pg_temp.rec(40, 'with paperwork required, a driver''s car is Pending and takes nobody until a mentor marks it on file',
    o like 'P0001:hub:pending%' and p = 'ok'
      and exists (select 1 from jsonb_path_query(v, 'strict $.days[*].runs[*].cars[*].status', '{}', true) x where x #>> '{}' = 'pending'),
    format('while pending: %s; after "on file": %s', o, p));

  o := pg_temp.save(f.td, 'car_seats', '1', f.d2);
  p := pg_temp.save(f.td, 'car_description', '""', f.d1);
  q := pg_temp.save(f.td, 'favourite_colour', '"blue"');
  perform pg_temp.rec(41, 'a driver cannot lower seats below their riders or blank a listed car; an unknown field is refused',
    o like 'P0001:hub:seats_below_riders%' and p like 'P0001:hub:car_required%' and q like 'P0001:hub:unknown_field%',
    format('seats 3 -> 1 with 2 riders: %s; blank description: %s; unknown field: %s', left(o, 40), left(p, 40), left(q, 40)));

  -- Tokens.
  o := coalesce(pg_temp.fam('AAAAAAAAAAAAAAAAAAAAAA', 'fetch') ->> 'error', 'opened');
  p := coalesce(pg_temp.fam('not a token', 'fetch') ->> 'error', 'opened');
  perform pg_temp.rec(42, 'a well-formed but unknown token, and a malformed one, get nothing ("not found")',
    o like 'P0002:hub:not_found%' and p like 'P0002:hub:not_found%', format('unknown: %s; malformed: %s', o, p));

  update public.hub_invite_tokens set revoked_at = now() where token_hash = sha256(convert_to(f.ta2, 'UTF8'));
  o := coalesce(pg_temp.fam(f.ta2, 'fetch') ->> 'error', 'opened');
  p := case when (pg_temp.fam(f.ta, 'fetch') ->> 'invite_id')::uuid = f.ia then 'opened' else 'not opened' end;
  perform pg_temp.rec(43, 'a revoked token gets nothing while the family''s other token still opens the page',
    o like 'P0002:hub:not_found%' and p = 'opened', format('revoked: %s; the other: %s', o, p));

  select count(*) into n from public.hub_invite_tokens where token_hash = sha256(convert_to(f.ta, 'UTF8'));
  select count(*) into n2 from public.hub_invite_tokens where token_hash = convert_to(f.ta, 'UTF8');
  perform pg_temp.rec(44, 'only the SHA-256 of a token is stored; the token itself is in no table',
    n = 1 and n2 = 0 and length(f.ta) = 22
      and not exists (select 1 from public.hub_outbox o where o.body like '%' || f.ta || '%' or o.subject like '%' || f.ta || '%'),
    format('rows matching the hash: %s; rows matching the raw token: %s; token length %s', n, n2, length(f.ta)));

  -- Invites go out through the outbox; the link is minted at send time.
  v := pg_temp.stf(f.staff_id, 'send_invites', jsonb_build_object('event_id', f.ev));
  o := (pg_temp.stf(f.staff_id, 'send_invites', jsonb_build_object('event_id', f.ev)) ->> 'queued');
  -- As the Edge Function does it, as service_role: take, mint, mark sent.
  perform pg_temp.act('service_role', null);
  for row_o in select * from public.hub_outbox_take(50, f.ev) loop
    if row_o.kind = 'invite' then
      insert into t5_minted values (row_o.id, row_o.link_invite_id, public.hub_outbox_mint_link(row_o.id));
    end if;
    perform public.hub_outbox_done(row_o.id, true, null);
  end loop;
  reset role;
  -- Then, as the owner, check what came back.
  select count(*), bool_and(m.token is not null and length(m.token) = 22
                            and public._hub_invite_for_token(m.token) = m.invite_id
                            and o.body like '%{{link}}%' and o.body not like '%' || m.token || '%'
                            and o.status = 'sent')
    into n, ok
    from t5_minted m join public.hub_outbox o on o.id = m.outbox_id;
  perform pg_temp.rec(45, 'send invites queues one per family once; each link is minted at send time and opens that family''s page',
    (v ->> 'queued') = '4' and o = '0' and n = 4 and ok,
    format('first press %s, second press %s; invites taken %s; every link resolved to its own invite and the body kept {{link}}: %s',
           v ->> 'queued', o, n, ok));

  perform pg_temp.act('service_role', null);
  n := public.hub_cron_enqueue();
  n2 := public.hub_cron_enqueue();
  reset role;
  perform pg_temp.rec(46, 'the hourly tick sends "lock-in is open" once per family whose invite went out, and never twice',
    n >= 4 and n2 >= 0 and (select count(*) from public.hub_outbox where event_id = f.ev and kind = 'lockin_open') = 4,
    format('first tick queued %s, second %s; lockin_open emails: %s', n, n2,
           (select count(*) from public.hub_outbox where event_id = f.ev and kind = 'lockin_open')));

  perform pg_temp.act('service_role', null);
  for n in 1..5 loop perform public.hub_resend_request('RLS0005-A@example.invalid'); end loop;
  perform public.hub_resend_request('nobody-0005@example.invalid');
  reset role;
  o := pg_temp.val_as('authenticated', f.member_id, 'select public.hub_resend_request(''rls0005-a@example.invalid'')::text');
  perform pg_temp.rec(47, '"lost your link": 3 links an hour to a known address, none to an unknown one; signed-in callers are refused',
    (select count(*) from public.hub_outbox where kind = 'resend' and 'rls0005-a@example.invalid' = any(to_emails)) = 3
      and not exists (select 1 from public.hub_outbox where kind = 'resend' and 'nobody-0005@example.invalid' = any(to_emails))
      and o like 'err:42501%',
    format('5 requests -> %s links; unknown address -> %s; signed in: %s',
           (select count(*) from public.hub_outbox where kind = 'resend' and 'rls0005-a@example.invalid' = any(to_emails)),
           (select count(*) from public.hub_outbox where kind = 'resend' and 'nobody-0005@example.invalid' = any(to_emails)),
           left(o, 40)));

  perform public.hub_retention_sweep();
  perform pg_temp.rec(48, '14 days after an event: pickup spots and both phone consents cleared; an event 3 days over is untouched',
    (select spot is null and consent_at is null from public.hub_pickups where invite_id = f.ip)
      and (select driver_phone_consent_at is null and rider_phone_consent_at is null from public.hub_responses where invite_id = f.ip)
      and (select spot is not null from public.hub_pickups where invite_id = f.ir)
      and (select driver_phone_consent_at is not null from public.hub_responses where invite_id = f.ir),
    format('15 days over: spot %s, consents %s; 3 days over: spot %s',
           (select coalesce(spot, 'cleared') from public.hub_pickups where invite_id = f.ip),
           (select case when driver_phone_consent_at is null then 'cleared' else 'kept' end from public.hub_responses where invite_id = f.ip),
           (select coalesce(spot, 'cleared') from public.hub_pickups where invite_id = f.ir)));

  -- A rider family switching cars mid-plan, and switching from carpool to
  -- driving: the old seat goes, the plan follows.
  o := pg_temp.save(f.ta, 'to_mode', '"self"', f.d1);
  perform pg_temp.rec(49, 'leaving the team carpool for a run releases that run''s seat (the car is not frozen yet)',
    o = 'ok' and not exists (select 1 from public.hub_seats where invite_id = f.ia and day_id = f.d1 and run = 'to')
      and exists (select 1 from public.hub_seats where invite_id = f.ia and day_id = f.d1 and run = 'home'),
    format('save: %s; to-seat kept: %s; home seat kept: %s', o,
           exists (select 1 from public.hub_seats where invite_id = f.ia and day_id = f.d1 and run = 'to'),
           exists (select 1 from public.hub_seats where invite_id = f.ia and day_id = f.d1 and run = 'home')));
end
$windows$;

-- -- 50-63. RLS per table: a student reads nothing, staff read the fixture ----
-- One check per table, so widening ANY single policy to using (true) turns
-- exactly its row FAIL.
do $reads$
declare f t5_fx; t text; o text; s text; k int := 50;
begin
  select * into f from t5_fx;
  foreach t in array array['hub_events','hub_days','hub_meals','hub_food_needs','hub_invites','hub_responses',
                           'hub_day_answers','hub_cars','hub_seats','hub_pickups','hub_food_claims','hub_outbox'] loop
    o := pg_temp.val_as('authenticated', f.member_id, format('select count(*) from public.%I', t));
    s := pg_temp.val_as('authenticated', f.staff_id, format('select count(*) from public.%I', t));
    perform pg_temp.rec(k, format('%s: a student reads 0 rows; staff read the fixture (positive control)', t),
      o = '0' and s ~ '^[0-9]+$' and s::int > 0, format('student %s, staff %s', o, s));
    k := k + 1;
  end loop;
  foreach t in array array['hub_invite_tokens','hub_resend_log'] loop
    o := pg_temp.val_as('authenticated', f.member_id, format('select count(*) from public.%I', t));
    s := pg_temp.val_as('authenticated', f.staff_id, format('select count(*) from public.%I', t));
    perform pg_temp.rec(k, format('%s: no signed-in reader at all, staff included', t),
      o like 'err:42501%' and s like 'err:42501%', format('student %s; staff %s', left(o, 30), left(s, 30)));
    k := k + 1;
  end loop;
end
$reads$;

-- -- 64-71. Direct writes: refused for students AND staff on family data ----
do $writes$
declare f t5_fx; o text; p text; c uuid;
begin
  select * into f from t5_fx;
  select id into c from public.hub_cars where driver_invite_id = f.id_ limit 1;

  o := pg_temp.run_as('authenticated', f.member_id, format(
         'insert into public.hub_events (title) values (%L)', 'rls-0005 student event'));
  p := pg_temp.run_as('authenticated', f.staff_id, format(
         'insert into public.hub_days (event_id, day_date, venue_closes_at) values (%L, current_date + 40, now() + interval ''40 days'')', f.ev));
  perform pg_temp.rec(64, 'a student cannot add an event (RLS WITH CHECK); staff CAN add a day (positive control)',
    o like 'err:42501%' and p = 'ok:1', format('student: %s; staff: %s', left(o, 30), p));

  o := pg_temp.run_as('authenticated', f.member_id, format(
         'insert into public.hub_seats (car_id, day_id, run, invite_id) select id, day_id, run, %L from public.hub_cars where id = %L', f.ib, c));
  p := pg_temp.run_as('authenticated', f.staff_id, format(
         'insert into public.hub_seats (car_id, day_id, run, invite_id) select id, day_id, run, %L from public.hub_cars where id = %L', f.ie, c));
  perform pg_temp.rec(65, 'nobody inserts a seat directly, staff included: seats go through the rules',
    o like 'err:42501%' and p like 'err:42501%', format('student: %s; staff: %s', left(o, 30), left(p, 30)));

  o := pg_temp.run_as('authenticated', f.member_id, format('update public.hub_cars set seats = 7 where id = %L', c));
  p := pg_temp.run_as('authenticated', f.staff_id, format('update public.hub_cars set seats = 7 where id = %L', c));
  perform pg_temp.rec(66, 'nobody updates a car directly (a capacity change would skip the rider check)',
    o like 'err:42501%' and p like 'err:42501%', format('student: %s; staff: %s', left(o, 30), left(p, 30)));

  o := pg_temp.run_as('authenticated', f.member_id, format('delete from public.hub_food_claims where invite_id = %L', f.ia));
  p := pg_temp.run_as('authenticated', f.staff_id, format('update public.hub_responses set parent_phone = %L where invite_id = %L', '000', f.ia));
  perform pg_temp.rec(67, 'a student cannot delete a food claim; staff cannot edit answers around the save rules',
    o like 'err:42501%' and p like 'err:42501%', format('student delete: %s; staff update: %s', left(o, 30), left(p, 30)));

  o := pg_temp.run_as('anon', null, 'select count(*) from public.hub_events');
  p := pg_temp.run_as('anon', null, format('insert into public.hub_events (title) values (%L)', 'rls-0005 anon'));
  perform pg_temp.rec(68, 'anon reads nothing and writes nothing',
    o like 'err:42501%' and p like 'err:42501%', format('read: %s; write: %s', left(o, 30), left(p, 30)));

  o := pg_temp.run_as('anon', null, 'select public.hub_member_board(gen_random_uuid())');
  p := pg_temp.run_as('anon', null, 'select public.hub_staff_call(''overview'', ''{}''::jsonb)');
  perform pg_temp.rec(69, 'anon cannot call the member or staff entry points',
    o like 'err:42501%' and p like 'err:42501%', format('member board: %s; staff call: %s', left(o, 30), left(p, 30)));
end
$writes$;

select n, check_name as "check", result, detail
  from t5_results
union all
select 999, 'summary',
       case when bool_or(result = 'FAIL') then 'FAIL' else 'PASS' end,
       format('%s PASS, %s FAIL, %s SKIP of %s checks',
              count(*) filter (where result = 'PASS'),
              count(*) filter (where result = 'FAIL'),
              count(*) filter (where result = 'SKIP'),
              count(*))
  from t5_results
 order by 1;

rollback;

-- Nothing is left behind. Confirm with:
--   select count(*) from public.hub_events where title like 'rls-0005%';   -- 0
