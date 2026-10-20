-- ============================================================
-- 0019_connector_writes RLS test
--
-- Run in the Supabase SQL editor AFTER 0019_connector_writes.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK. Every fixture it
-- makes (an event, a job, a survey, a trip, a squad position, test rows on
-- members it picks) and every write it tries is undone, and no existing row
-- changes.
--
-- HOW TO READ IT: one row per check (PASS / FAIL / SKIP, with detail) and a
-- final summary row. Check 1 is the structure; every other check is one of
-- the functions 0019 creates.
--
-- WHAT IT PROVES. For each function, the page old direct write (the exact
-- statements the page made, which is also its fallback in src/writeVia.js)
-- and the function are run side by side, each in its own savepoint that is
-- then rolled back, as five callers: an admin A, a mentor or lead M, an
-- approved member S with no staff role, a parent P and a signed-out caller.
-- For every caller the outcome must be identical: written or refused with
-- the same SQLSTATE, and the same rows afterwards (a fingerprint of every
-- row the write could touch, ids that are freshly generated left out).
-- POSITIVE CONTROL per check: one named caller who could write before must
-- write (ok, and the rows changed). NEGATIVE CONTROL per check: one named
-- caller who could not write before must still change nothing.
-- A function made SECURITY DEFINER, or with its gate widened, turns its row
-- red: tools/connector/harness/mutants-0019.mjs runs those mutants.
--
-- Actors, picked from live data: A an admin; M a mentor or lead who is not
-- an admin (A stands in when the team has none, and the checks say so); S
-- and S2 two approved members with no staff and no parent role; P a parent
-- with no staff role (skipped when none). A check whose caller is missing
-- SKIPs.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.schedule_create_event(text, text, timestamptz, timestamptz, text, text, boolean, integer, boolean)') is null
     or to_regprocedure('public.attendance_record(text, text, text, text, boolean, text, boolean)') is null
     or to_regprocedure('public.trips_save_day(uuid, jsonb)') is null then
    raise exception 'Cannot test: 0019_connector_writes.sql must be applied';
  end if;
end
$applied$;

create temp table t0019_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0019_fx (k text primary key, v text) on commit drop;
create temp table t0019_cases (
  n int primary key,
  fn text not null,
  setup text,              -- run once as postgres before the probes (stays for later checks)
  direct text[] not null,  -- the page statements; a leading + keeps going after a failure, ? ignores it
  call text not null,      -- the function call
  fp text not null,        -- SQL answering one text: the rows the write could touch
  pos text not null,       -- the actor who must write
  neg text not null,       -- the actor who must change nothing
  needs_change boolean not null default true,
  skip_if text             -- SQL answering true when the check cannot run on this database
) on commit drop;

-- ── actors ──────────────────────────────────────────────────────────────────
insert into t0019_fx (k, v)
select 'A', (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1)::text
union all
select 'M', coalesce(
  (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead')
     and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin')
   order by r.member_id limit 1),
  (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1))::text
union all
select 'M_is_admin', (not exists (select 1 from public.member_roles r where r.role in ('mentor', 'lead')
     and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin')))::text
union all
select 'S', (select p.id from public.profiles p where p.approved
   and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
   and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
 order by p.id limit 1)::text
union all
select 'S2', (select p.id from public.profiles p where p.approved
   and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
   and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
 order by p.id offset 1 limit 1)::text
union all
select 'P', (select r.member_id from public.member_roles r where r.role = 'parent'
   and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('mentor', 'lead', 'admin'))
 order by r.member_id limit 1)::text;

do $pre$
begin
  if (select v from t0019_fx where k = 'A') is null then raise exception 'Cannot test: no admin member'; end if;
  if (select v from t0019_fx where k = 'S') is null then raise exception 'Cannot test: no approved student without a staff role'; end if;
end
$pre$;

-- ── fixtures, made as postgres inside this transaction ──────────────────────
do $fixtures$
declare
  v_a uuid := (select v::uuid from t0019_fx where k = 'A');
  v_s uuid := (select v::uuid from t0019_fx where k = 'S');
  v_id uuid;
  v_ci uuid; v_co uuid;
begin
  -- the schedule
  insert into public.events (title, kind, starts_at, ends_at, created_by) values ('t0019 event', 'build', now() + interval '3 days', now() + interval '3 days 2 hours', v_a) returning id into v_id;
  insert into t0019_fx values ('E', v_id::text);
  insert into public.events (title, kind, starts_at, ends_at, created_by) values ('t0019 doomed', 'build', now() + interval '4 days', now() + interval '4 days 1 hour', v_a) returning id into v_id;
  insert into t0019_fx values ('E5', v_id::text);
  insert into t0019_fx values ('SER', gen_random_uuid()::text);
  insert into public.events (title, kind, starts_at, ends_at, created_by, series_id)
  select 't0019 series', 'meeting', now() + (d || ' days')::interval, now() + (d || ' days')::interval + interval '1 hour', v_a, (select v::uuid from t0019_fx where k = 'SER')
    from (values (5), (12)) as x(d);
  insert into t0019_fx select 'SER_A', id::text from public.events where series_id = (select v::uuid from t0019_fx where k = 'SER') order by starts_at limit 1;
  insert into t0019_fx select 'SER_B', id::text from public.events where series_id = (select v::uuid from t0019_fx where k = 'SER') order by starts_at offset 1 limit 1;
  insert into t0019_fx values ('NEWSER', gen_random_uuid()::text);

  -- jobs and a skill
  insert into public.tasks (title, created_by) values ('t0019 job', v_a) returning id into v_id;
  insert into t0019_fx values ('T', v_id::text);
  insert into public.skills (name) values ('t0019 skill') returning id into v_id;
  insert into t0019_fx values ('SK', v_id::text);

  -- logged hours waiting, a missed check-out, a push subscription, a feedback report
  insert into public.logged_hours (member_id, date, hours, type, description, status) values (v_s, current_date, 1, 'build', 't0019 mine', 'pending') returning id into v_id;
  insert into t0019_fx values ('LH', v_id::text);
  insert into public.logged_hours (member_id, date, hours, type, description, status) values (v_s, current_date, 2, 'build', 't0019 review', 'pending') returning id into v_id;
  insert into t0019_fx values ('LH2', v_id::text);
  insert into public.attendance_events (user_id, type, event_time, location, category) values (v_s, 'in', now() - interval '30 hours', 't0019 sr', 'build') returning id into v_ci;
  insert into public.attendance_events (user_id, type, event_time, location, category) values (v_s, 'out', now() - interval '20 hours', 't0019 sr', 'build') returning id into v_co;
  insert into public.session_reviews (user_id, checkin_id, checkout_id, status) values (v_s, v_ci, v_co, 'pending') returning id into v_id;
  insert into t0019_fx values ('SR', v_id::text);
  insert into public.push_subscriptions (endpoint, member_id, p256dh, auth) values ('https://t0019.example/s', v_s, 'k', 'a');
  insert into public.feedback (member_id, category, message) values (v_s, 'bug', 't0019 report') returning id into v_id;
  insert into t0019_fx values ('F', v_id::text);

  -- Discord roles, allowed domains
  insert into public.discord_announce_roles (name, role_id, notes) values ('t0019 fixture role', '111111111111111111', 't0019 fixture') returning id into v_id;
  insert into t0019_fx values ('DR', v_id::text);
  insert into public.allowed_domains (domain) values ('t0019r.example');

  -- squad positions
  insert into public.positions (name, target_count, sort_order) values ('t0019 fixture pos', 1, 90) returning id into v_id;
  insert into t0019_fx values ('POS', v_id::text);
  insert into public.positions (name, target_count, sort_order) values ('t0019 doomed pos', 1, 91) returning id into v_id;
  insert into t0019_fx values ('POS2', v_id::text);

  -- surveys: every open one closed for this transaction, one open fixture
  update public.surveys set is_open = false where is_open;
  insert into public.surveys (title, is_open, created_by) values ('t0019 open', true, v_a) returning id into v_id;
  insert into t0019_fx values ('SVO', v_id::text);
  insert into public.survey_questions (survey_id, position, kind, prompt) values (v_id, 1, 'single', 't0019 open q') returning id into v_id;
  insert into t0019_fx values ('QO', v_id::text);
  insert into public.surveys (title, created_by) values ('t0019 closed', v_a) returning id into v_id;
  insert into t0019_fx values ('SV', v_id::text);
  insert into public.survey_questions (survey_id, position, kind, prompt) values (v_id, 1, 'single', 't0019 q1') returning id into v_id;
  insert into t0019_fx values ('Q1', v_id::text);
  insert into public.survey_questions (survey_id, position, kind, prompt) values ((select v::uuid from t0019_fx where k = 'SV'), 2, 'single', 't0019 q2') returning id into v_id;
  insert into t0019_fx values ('Q2', v_id::text);
  insert into public.survey_questions (survey_id, position, kind, prompt) values ((select v::uuid from t0019_fx where k = 'SV'), 3, 'single', 't0019 q3') returning id into v_id;
  insert into t0019_fx values ('Q3', v_id::text);
  insert into public.surveys (title, created_by) values ('t0019 doomed survey', v_a) returning id into v_id;
  insert into t0019_fx values ('SVD', v_id::text);

  -- a trip with a day, a meal and two food needs
  insert into public.hub_events (title) values ('t0019 trip') returning id into v_id;
  insert into t0019_fx values ('H', v_id::text);
  insert into public.hub_days (event_id, day_date, venue_closes_at) values (v_id, current_date + 40, now() + interval '40 days') returning id into v_id;
  insert into t0019_fx values ('D', v_id::text);
  insert into public.hub_meals (event_id, day_id, label, starts_at)
  values ((select v::uuid from t0019_fx where k = 'H'), v_id, 't0019 lunch', now() + interval '40 days') returning id into v_id;
  insert into t0019_fx values ('ML', v_id::text);
  insert into public.hub_food_needs (meal_id, label, starter) values (v_id, 't0019 starter', true) returning id into v_id;
  insert into t0019_fx values ('N1', v_id::text);
  insert into public.hub_food_needs (meal_id, label) values ((select v::uuid from t0019_fx where k = 'ML'), 't0019 doomed need') returning id into v_id;
  insert into t0019_fx values ('N2', v_id::text);

  -- a season for an application nobody has made
  insert into public.seasons (name, start_date, end_date) values ('t0019 season', current_date + 500, current_date + 700) returning id into v_id;
  insert into t0019_fx values ('SEA', v_id::text);

  -- the auto close setting exists
  insert into public.app_settings (key, value) select 'auto_close_cutoff', '23:00'
   where not exists (select 1 from public.app_settings where key = 'auto_close_cutoff');
end
$fixtures$;

-- ── machinery ───────────────────────────────────────────────────────────────

create function pg_temp.fx(p_k text) returns text language sql as $fn$ select v from t0019_fx where k = p_k $fn$;

-- {me} is the caller, {myemail} the caller email, {X} a fixture or actor id.
create function pg_temp.sub(p_sql text, p_who uuid) returns text language plpgsql as $fn$
declare r record; s text := p_sql;
begin
  s := replace(s, '{me}', coalesce(quote_literal(p_who::text) || '::uuid', 'null::uuid'));
  s := replace(s, '{myemail}', coalesce(quote_literal((select lower(email) from auth.users where id = p_who)), 'null'));
  for r in select k, v from t0019_fx order by length(k) desc loop
    s := replace(s, '{' || r.k || '}', coalesce(quote_literal(r.v), 'null'));
  end loop;
  return s;
end
$fn$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  if p_who is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated',
      'email', (select lower(email) from auth.users where id = p_who))::text, true);
    perform set_config('request.jwt.claim.sub', p_who::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end
$fn$;

create function pg_temp.unact() returns void language plpgsql as $fn$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end
$fn$;

-- the fingerprint, read as postgres
create function pg_temp.fpv(p_fp text, p_who uuid) returns text language plpgsql as $fn$
declare v text;
begin
  execute pg_temp.sub(p_fp, p_who) into v;
  return coalesce(v, 'none');
end
$fn$;

-- Run statements as a caller, then fingerprint, then roll it all back.
-- answers ok|<fp> or err:<SQLSTATE>|<fp>
create function pg_temp.probe(p_who uuid, p_stmts text[], p_fp text) returns text language plpgsql as $fn$
declare
  subs text[] := '{}';
  s text; flag text; outcome text := null; i int;
begin
  for i in 1 .. cardinality(p_stmts) loop subs := subs || pg_temp.sub(p_stmts[i], p_who); end loop;
  begin
    perform pg_temp.act(p_who);
    for i in 1 .. cardinality(subs) loop
      s := subs[i];
      flag := case when left(s, 1) in ('+', '?') then left(s, 1) else '' end;
      if flag <> '' then s := substr(s, 2); end if;
      begin
        execute s;
      exception when others then
        if flag <> '?' then outcome := coalesce(outcome, 'err:' || sqlstate); end if;
        if flag = '' then exit; end if;
      end;
    end loop;
    perform pg_temp.unact();
    raise exception using errcode = 'T0019', message = coalesce(outcome, 'ok') || '|' || pg_temp.fpv(p_fp, p_who);
  exception when sqlstate 'T0019' then
    perform pg_temp.unact();
    return sqlerrm;
  end;
end
$fn$;

-- rows as text, sorted, with the named keys dropped (fresh ids)
create function pg_temp.rows_fp(p_select text, p_drop text[] default '{}') returns text language plpgsql as $fn$
declare v text;
begin
  execute format('select md5(coalesce(string_agg(x, %L order by x), %L)) from (select ((to_jsonb(t) - %L::text[])::text) as x from (%s) t) s',
                 E'\n', '', p_drop, p_select) into v;
  return v;
end
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_result text, p_detail text) returns void language sql as $fn$
  insert into t0019_results values (p_n, p_check, p_result, p_detail);
$fn$;

-- ── the cases ───────────────────────────────────────────────────────────────
-- fp helper shorthand: select pg_temp.rows_fp($q$...$q$, array[...])

insert into t0019_cases (n, fn, setup, direct, call, fp, pos, neg, needs_change, skip_if) values
(2, 'access_request_submit', null,
 array[$s$insert into public.access_requests (email, full_name, requested_role, note) values ({myemail}, 't0019', 'student', 't0019')$s$],
 $s$select public.access_request_submit({myemail}, 't0019', 'student', 't0019')$s$,
 $s$select pg_temp.rows_fp('select * from public.access_requests where note = ''t0019''', array['id'])$s$,
 'S', 'anon', true,
 $s$select exists (select 1 from public.access_requests r join auth.users u on lower(u.email) = r.email where u.id = (select v::uuid from t0019_fx where k = 'S') and r.status = 'pending')$s$),

(3, 'announce_add_role', null,
 array[$s$insert into public.discord_announce_roles (name, role_id, notes, sort_order) values ('t0019 role', '123456789012345678', 't0019', 5)$s$],
 $s$select public.announce_add_role('t0019 role', '123456789012345678', 't0019', 5)$s$,
 $s$select pg_temp.rows_fp('select * from public.discord_announce_roles where notes = ''t0019''', array['id'])$s$,
 'A', 'M', true, null),

(4, 'announce_edit_role', null,
 array[$s$update public.discord_announce_roles set name = 't0019 renamed', role_id = '123456789012345679', notes = 't0019 edit', sort_order = 7 where id = {DR}$s$],
 $s$select public.announce_edit_role({DR}, 't0019 renamed', '123456789012345679', 't0019 edit', 7)$s$,
 $s$select pg_temp.rows_fp('select * from public.discord_announce_roles where id = ' || quote_literal({DR}))$s$,
 'A', 'M', true, null),

(5, 'announce_set_role_active', null,
 array[$s$update public.discord_announce_roles set active = false where id = {DR}$s$],
 $s$select public.announce_set_role_active({DR}, false)$s$,
 $s$select pg_temp.rows_fp('select * from public.discord_announce_roles where id = ' || quote_literal({DR}))$s$,
 'A', 'M', true, null),

(6, 'announce_delete_role', null,
 array[$s$delete from public.discord_announce_roles where id = {DR}$s$],
 $s$select public.announce_delete_role({DR})$s$,
 $s$select pg_temp.rows_fp('select * from public.discord_announce_roles where id = ' || quote_literal({DR}))$s$,
 'A', 'M', true, null),

(7, 'member_finish_tour', null,
 array[$s$update public.profiles set onboarded_at = now() where id = {me}$s$],
 $s$select public.member_finish_tour()$s$,
 $s$select pg_temp.rows_fp('select * from public.profiles where id = ' || coalesce(quote_literal({me}::text), 'null'))$s$,
 'S', 'anon', true, null),

(8, 'member_ensure_profile', null,
 array[$s$insert into public.profiles (id) values ({me}) on conflict (id) do update set id = excluded.id$s$],
 $s$select public.member_ensure_profile()$s$,
 $s$select pg_temp.rows_fp('select * from public.profiles where id = ' || coalesce(quote_literal({me}::text), 'null'))$s$,
 'S', 'anon', false, null),

(9, 'member_save_profile', null,
 array[$s$update public.profiles set nickname = 't0019', bio = 't0019 bio', shirt_size = 'M', subteams = '{Mechanical}', disciplines = '{}', grad_year = 2029 where id = {me}$s$],
 $s$select public.member_save_profile('t0019', 't0019 bio', 'M', '{Mechanical}', '{}', 2029)$s$,
 $s$select pg_temp.rows_fp('select * from public.profiles where id = ' || coalesce(quote_literal({me}::text), 'null'))$s$,
 'S', 'anon', true, null),

(10, 'member_set_avatar', null,
 array[$s$update public.profiles set avatar_url = 'https://t0019.example/a.png' where id = {me}$s$],
 $s$select public.member_set_avatar('https://t0019.example/a.png')$s$,
 $s$select pg_temp.rows_fp('select * from public.profiles where id = ' || coalesce(quote_literal({me}::text), 'null'))$s$,
 'S', 'anon', true, null),

(11, 'member_set_notification_prefs', null,
 array[$s$update public.profiles set notification_prefs = '{"enabled": false, "t0019": true}' where id = {me}$s$],
 $s$select public.member_set_notification_prefs('{"enabled": false, "t0019": true}')$s$,
 $s$select pg_temp.rows_fp('select * from public.profiles where id = ' || coalesce(quote_literal({me}::text), 'null'))$s$,
 'S', 'anon', true, null),

(12, 'member_save_application_profile', null,
 array[$s$update public.profiles set nickname = 't0019b', grad_year = 2030, shirt_size = 'L' where id = {me}$s$],
 $s$select public.member_save_application_profile('t0019b', 2030, 'L')$s$,
 $s$select pg_temp.rows_fp('select * from public.profiles where id = ' || coalesce(quote_literal({me}::text), 'null'))$s$,
 'S', 'anon', true, null),

(13, 'member_application_submit', null,
 array[$s$insert into public.member_applications (member_id, season_id, legal_first_name, legal_last_name, student_phone, pathway, returning_member, seasons_on_team, prior_robotics, programming_languages, cad_tools, hands_on_experience, certifications_claimed, subteam_first, subteam_second, subteam_third, subteam_rationale, monday_lunch, tuesday_after_school, friday_after_school, transport_after_5pm, seasonal_conflicts, conflict_detail, fll_volunteering_interest, build_season_acknowledged, parent_name, parent_email, parent_phone, parent_two_name, parent_two_contact, dietary_restrictions, emergency_contact_name, emergency_contact_phone, discord_username, conduct_acknowledged) values ({me}, {SEA}, 'Tee', 'Zero', '5555550101', 'MSET', true, 1, '{FRC}', '{}', '{}', '{}', null, 'Mechanical', 'Programming', null, 't0019', 'Yes', 'Yes', 'No', 'Parent pickup', '{}', null, null, true, 'Pat', 'p@example.com', '5555550102', null, null, null, 'Gee', '5555550103', 't0019_d', true) returning id$s$],
 $s$select public.member_application_submit(jsonb_build_object('member_id', {me}, 'season_id', {SEA}, 'legal_first_name', 'Tee', 'legal_last_name', 'Zero', 'student_phone', '5555550101', 'pathway', 'MSET', 'returning_member', true, 'seasons_on_team', 1, 'prior_robotics', jsonb_build_array('FRC'), 'programming_languages', '[]'::jsonb, 'cad_tools', '[]'::jsonb, 'hands_on_experience', '[]'::jsonb, 'certifications_claimed', null, 'subteam_first', 'Mechanical', 'subteam_second', 'Programming', 'subteam_third', null, 'subteam_rationale', 't0019', 'monday_lunch', 'Yes', 'tuesday_after_school', 'Yes', 'friday_after_school', 'No', 'transport_after_5pm', 'Parent pickup', 'seasonal_conflicts', '[]'::jsonb, 'conflict_detail', null, 'fll_volunteering_interest', null, 'build_season_acknowledged', true, 'parent_name', 'Pat', 'parent_email', 'p@example.com', 'parent_phone', '5555550102', 'parent_two_name', null, 'parent_two_contact', null, 'dietary_restrictions', null, 'emergency_contact_name', 'Gee', 'emergency_contact_phone', '5555550103', 'discord_username', 't0019_d', 'conduct_acknowledged', true))$s$,
 $s$select pg_temp.rows_fp('select * from public.member_applications where season_id = ' || quote_literal({SEA}), array['id', 'parent_token'])$s$,
 'S', 'anon', true, null),

(14, 'attendance_record', null,
 array[$s$insert into public.attendance_events (user_id, type, location, method, category, geo_ok) values ({me}, 'in', 't0019', 'nfc', 'build', true)$s$],
 $s$select public.attendance_record('in', 't0019', 'nfc', 'build', true)$s$,
 $s$select pg_temp.rows_fp('select * from public.attendance_events where location = ''t0019''', array['id'])$s$,
 'S', 'anon', true, null),

(15, 'attendance_record (the Check Out button)', null,
 array[$s$insert into public.attendance_events (user_id, type, location, method) values ({me}, 'out', 't0019 button', null)$s$],
 $s$select public.attendance_record('out', 't0019 button', null)$s$,
 $s$select pg_temp.rows_fp('select * from public.attendance_events where location = ''t0019 button''', array['id'])$s$,
 'M', 'anon', true, null),

(16, 'feedback_submit', null,
 array[$s$insert into public.feedback (member_id, category, message, image_paths, route, viewport, user_agent, tried, build) values ({me}, 'bug', 't0019', '[]', '/x', '1x1', 'ua', 't0019 tried', 'b1')$s$],
 $s$select public.feedback_submit('bug', 't0019', '[]', '/x', '1x1', 'ua', 't0019 tried', 'b1')$s$,
 $s$select pg_temp.rows_fp('select * from public.feedback where message = ''t0019''', array['id'])$s$,
 'S', 'anon', true, null),

(17, 'feedback_set_legacy_status', null,
 array[$s$update public.feedback set status = 'reviewed', reviewed_by = {me}, reviewed_at = now() where id = {F}$s$],
 $s$select public.feedback_set_legacy_status({F}, 'reviewed', true)$s$,
 $s$select pg_temp.rows_fp('select * from public.feedback where id = ' || quote_literal({F}))$s$,
 'A', 'M', true, null),

(18, 'handbook_sign', null,
 array[$s$insert into public.handbook_acknowledgments (member_id, version, signer_role, lessons_passed, signed_at) values ({me}, '1999-01-01', 'student', 3, now())$s$],
 $s$select public.handbook_sign('1999-01-01', 'student', 3)$s$,
 $s$select pg_temp.rows_fp('select * from public.handbook_acknowledgments where version = ''1999-01-01''', array['id'])$s$,
 'S', 'M', true, null),

(19, 'event_set_response', null,
 array[$s$insert into public.event_signups (event_id, member_id, response, updated_at) values ({E}, {me}, 'maybe', now()) on conflict (event_id, member_id) do update set event_id = excluded.event_id, member_id = excluded.member_id, response = excluded.response, updated_at = excluded.updated_at$s$],
 $s$select public.event_set_response({E}, 'maybe')$s$,
 $s$select pg_temp.rows_fp('select * from public.event_signups where event_id = ' || quote_literal({E}))$s$,
 'S', 'anon', true, null),

(20, 'event_rsvp', null,
 array[$s$insert into public.event_signups (event_id, member_id, response, item, updated_at) values ({E}, {me}, 'going', 'chips', now()) on conflict (event_id, member_id) do update set event_id = excluded.event_id, member_id = excluded.member_id, response = excluded.response, item = excluded.item, updated_at = excluded.updated_at$s$],
 $s$select public.event_rsvp({E}, 'going', 'chips')$s$,
 $s$select pg_temp.rows_fp('select * from public.event_signups where event_id = ' || quote_literal({E}))$s$,
 'S', 'anon', true, null),

(21, 'event_clear_response',
 $s$insert into public.event_signups (event_id, member_id, response, item) values ({E}, {S}, 'going', 'kept') on conflict do nothing$s$,
 array[$s$delete from public.event_signups where event_id = {E} and member_id = {me}$s$],
 $s$select public.event_clear_response({E})$s$,
 $s$select pg_temp.rows_fp('select * from public.event_signups where event_id = ' || quote_literal({E}))$s$,
 'S', 'M', true, null),

(22, 'job_post_update', null,
 array[$s$insert into public.task_updates (task_id, member_id, body, image_path) values ({T}, {me}, 't0019', null)$s$],
 $s$select public.job_post_update({T}, 't0019', null)$s$,
 $s$select pg_temp.rows_fp('select * from public.task_updates where task_id = ' || quote_literal({T}), array['id'])$s$,
 'M', 'S', true, null),

(23, 'staff_set_job_status', null,
 array[$s$update public.tasks set status = 'completed', updated_at = now(), completed_at = now() where id = {T}$s$],
 $s$select public.staff_set_job_status({T}, 'completed')$s$,
 $s$select pg_temp.rows_fp('select * from public.tasks where id = ' || quote_literal({T}))$s$,
 'M', 'S', true, null),

(24, 'staff_save_job (a new job)', null,
 array[$s$insert into public.tasks (title, description, subteam, max_claimants, due_date, links, images, created_by) values ('t0019 new job', 'd', 'CAD', 2, current_date + 9, '[{"label": "a", "url": "https://x"}]', '[]', {me}) returning id$s$],
 $s$select public.staff_save_job(null, 't0019 new job', 'd', 'CAD', 2, current_date + 9, '[{"label": "a", "url": "https://x"}]', '[]', null)$s$,
 $s$select pg_temp.rows_fp('select * from public.tasks where title = ''t0019 new job''', array['id'])$s$,
 'S', 'anon', true, null),

(25, 'staff_save_job (an edit with required skills)', null,
 array[$s$update public.tasks set title = 't0019 job edited', description = null, subteam = null, max_claimants = 1, due_date = null, links = '[]', images = '[]', updated_at = now() where id = {T}$s$,
       $s$?delete from public.task_required_skills where task_id = {T}$s$,
       $s$insert into public.task_required_skills (task_id, skill_id) values ({T}, {SK})$s$],
 $s$select public.staff_save_job({T}, 't0019 job edited', null, null, 1, null, '[]', '[]', array[{SK}]::uuid[])$s$,
 $s$select pg_temp.rows_fp('select * from public.tasks where id = ' || quote_literal({T})) || pg_temp.rows_fp('select * from public.task_required_skills where task_id = ' || quote_literal({T}))$s$,
 'M', 'S', true, null),

(26, 'staff_delete_job', null,
 array[$s$delete from public.tasks where id = {T}$s$],
 $s$select public.staff_delete_job({T})$s$,
 $s$select pg_temp.rows_fp('select * from public.tasks where id = ' || quote_literal({T}))$s$,
 'M', 'S', true, null),

(27, 'log_hours_submit', null,
 array[$s$insert into public.logged_hours (member_id, date, hours, type, description, status) values ({me}, current_date, 1.5, 'build', 't0019', 'pending') returning *$s$],
 $s$select public.log_hours_submit(current_date, 1.5, 'build', 't0019')$s$,
 $s$select pg_temp.rows_fp('select * from public.logged_hours where description = ''t0019''', array['id'])$s$,
 'S', 'anon', true, null),

(28, 'log_hours_delete', null,
 array[$s$delete from public.logged_hours where id = {LH}$s$],
 $s$select public.log_hours_delete({LH})$s$,
 $s$select pg_temp.rows_fp('select * from public.logged_hours where id = ' || quote_literal({LH}))$s$,
 'S', 'M', true, null),

(29, 'staff_review_logged_hours', null,
 array[$s$update public.logged_hours set status = 'verified', verified_by = {me}, verified_at = now() where id = {LH2}$s$],
 $s$select public.staff_review_logged_hours({LH2}, true)$s$,
 $s$select pg_temp.rows_fp('select * from public.logged_hours where id = ' || quote_literal({LH2}))$s$,
 'M', 'S', true, null),

(30, 'push_subscribe', null,
 array[$s$insert into public.push_subscriptions (endpoint, member_id, p256dh, auth, user_agent) values ('https://t0019.example/p', {me}, 'k', 'a', 'ua') on conflict (endpoint) do update set endpoint = excluded.endpoint, member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent$s$],
 $s$select public.push_subscribe('https://t0019.example/p', 'k', 'a', 'ua')$s$,
 $s$select pg_temp.rows_fp('select * from public.push_subscriptions where endpoint like ''https://t0019.example/%''')$s$,
 'S', 'anon', true, null),

(31, 'push_unsubscribe', null,
 array[$s$delete from public.push_subscriptions where endpoint = 'https://t0019.example/s'$s$],
 $s$select public.push_unsubscribe('https://t0019.example/s')$s$,
 $s$select pg_temp.rows_fp('select * from public.push_subscriptions where endpoint like ''https://t0019.example/%''')$s$,
 'S', 'M', true, null),

(32, 'admin_approve_member',
 $s$update public.profiles set approved = false where id = {S2}; delete from public.member_roles where member_id = {S2} and role = 'student'$s$,
 array[$s$+update public.profiles set approved = true where id = {S2}$s$,
       $s$+insert into public.member_roles (member_id, role) values ({S2}, 'student') on conflict (member_id, role) do nothing$s$],
 $s$select public.admin_approve_member({S2})$s$,
 $s$select pg_temp.rows_fp('select id, approved from public.profiles where id = ' || quote_literal({S2})) || pg_temp.rows_fp('select * from public.member_roles where member_id = ' || quote_literal({S2}))$s$,
 'A', 'M', true, $s$select (select v from t0019_fx where k = 'S2') is null$s$),

(33, 'admin_add_allowed_domain', null,
 array[$s$insert into public.allowed_domains (domain) values ('t0019.example')$s$],
 $s$select public.admin_add_allowed_domain('t0019.example')$s$,
 $s$select pg_temp.rows_fp('select domain, added_by from public.allowed_domains where domain like ''t0019%''')$s$,
 'A', 'M', true, null),

(34, 'admin_remove_allowed_domain', null,
 array[$s$delete from public.allowed_domains where domain = 't0019r.example'$s$],
 $s$select public.admin_remove_allowed_domain('t0019r.example')$s$,
 $s$select pg_temp.rows_fp('select domain from public.allowed_domains where domain like ''t0019%''')$s$,
 'A', 'M', true, null),

(35, 'admin_set_member_status', null,
 array[$s$update public.profiles set status = 'alumni' where id = {S2}$s$],
 $s$select public.admin_set_member_status({S2}, 'alumni')$s$,
 $s$select pg_temp.rows_fp('select id, status from public.profiles where id = ' || quote_literal({S2}))$s$,
 'A', 'M', true, $s$select (select v from t0019_fx where k = 'S2') is null$s$),

(36, 'admin_set_geofence_exempt', null,
 array[$s$update public.profiles set geofence_exempt = not geofence_exempt where id = {S2}$s$],
 $s$select public.admin_set_geofence_exempt({S2}, not (select geofence_exempt from public.profiles where id = {S2}))$s$,
 $s$select pg_temp.rows_fp('select * from public.profiles where id = ' || quote_literal({S2}))$s$,
 'A', 'M', true, $s$select (select v from t0019_fx where k = 'S2') is null or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'geofence_exempt')$s$),

(37, 'staff_link_family_hub', null,
 array[$s$update public.hub_events set event_id = {E} where id = {H}$s$],
 $s$select public.staff_link_family_hub({E}, null, {H})$s$,
 $s$select pg_temp.rows_fp('select id, event_id from public.hub_events where id = ' || quote_literal({H}))$s$,
 'M', 'S', true, null),

(38, 'schedule_create_event', null,
 array[$s$insert into public.events (title, kind, starts_at, ends_at, location, notes, rsvp_enabled, capacity, mandatory, created_by) values ('t0019 new', 'outreach', date_trunc('hour', now()) + interval '6 days', date_trunc('hour', now()) + interval '6 days 2 hours', 'Library', 'bring shirts', true, 12, false, {me})$s$],
 $s$select public.schedule_create_event('t0019 new', 'outreach', date_trunc('hour', now()) + interval '6 days', date_trunc('hour', now()) + interval '6 days 2 hours', 'Library', 'bring shirts', true, 12, false)$s$,
 $s$select pg_temp.rows_fp('select * from public.events where title = ''t0019 new''', array['id'])$s$,
 'M', 'S', true, null),

(39, 'schedule_create_events', null,
 array[$s$insert into public.events (title, kind, starts_at, ends_at, location, notes, rsvp_enabled, capacity, mandatory, created_by, series_id) values ('t0019 series new', 'build', now() + interval '20 days', now() + interval '20 days 2 hours', null, null, false, null, false, {me}, {NEWSER}), ('t0019 series new', 'build', now() + interval '27 days', now() + interval '27 days 2 hours', null, null, false, null, false, {me}, {NEWSER})$s$],
 $s$select public.schedule_create_events(jsonb_build_array(jsonb_build_object('title', 't0019 series new', 'kind', 'build', 'starts_at', now() + interval '20 days', 'ends_at', now() + interval '20 days 2 hours', 'location', null, 'notes', null, 'rsvp_enabled', false, 'capacity', null, 'mandatory', false, 'created_by', {me}, 'series_id', {NEWSER}), jsonb_build_object('title', 't0019 series new', 'kind', 'build', 'starts_at', now() + interval '27 days', 'ends_at', now() + interval '27 days 2 hours', 'location', null, 'notes', null, 'rsvp_enabled', false, 'capacity', null, 'mandatory', false, 'created_by', {me}, 'series_id', {NEWSER})))$s$,
 $s$select pg_temp.rows_fp('select * from public.events where title = ''t0019 series new''', array['id'])$s$,
 'M', 'S', true, null),

(40, 'schedule_update_event', null,
 array[$s$update public.events set title = 't0019 event moved', kind = 'meeting', starts_at = now() + interval '8 days', ends_at = now() + interval '8 days 1 hour', location = 'Room 1', notes = 'n', rsvp_enabled = true, capacity = 5, mandatory = false, updated_at = now() where id = {E} returning id$s$],
 $s$select public.schedule_update_event({E}, 't0019 event moved', 'meeting', now() + interval '8 days', now() + interval '8 days 1 hour', 'Room 1', 'n', true, 5, false)$s$,
 $s$select pg_temp.rows_fp('select * from public.events where id = ' || quote_literal({E}))$s$,
 'M', 'S', true, null),

(41, 'schedule_update_series', null,
 array[$s$+update public.events set title = 't0019 series moved', kind = 'meeting', location = 'L', notes = null, rsvp_enabled = false, capacity = null, mandatory = false, updated_at = now(), starts_at = now() + interval '5 days 3 hours', ends_at = now() + interval '5 days 4 hours' where id = {SER_A} returning id$s$,
       $s$+update public.events set title = 't0019 series moved', kind = 'meeting', location = 'L', notes = null, rsvp_enabled = false, capacity = null, mandatory = false, updated_at = now(), starts_at = now() + interval '12 days 3 hours', ends_at = now() + interval '12 days 4 hours' where id = {SER_B} returning id$s$],
 $s$select public.schedule_update_series('t0019 series moved', 'meeting', 'L', null, false, null, false, jsonb_build_array(jsonb_build_object('id', {SER_A}, 'starts_at', now() + interval '5 days 3 hours', 'ends_at', now() + interval '5 days 4 hours'), jsonb_build_object('id', {SER_B}, 'starts_at', now() + interval '12 days 3 hours', 'ends_at', now() + interval '12 days 4 hours')))$s$,
 $s$select pg_temp.rows_fp('select * from public.events where series_id = ' || quote_literal({SER}))$s$,
 'M', 'S', true, null),

(42, 'schedule_delete_event', null,
 array[$s$delete from public.events where id = {E5} returning id$s$],
 $s$select public.schedule_delete_event({E5})$s$,
 $s$select pg_temp.rows_fp('select * from public.events where id = ' || quote_literal({E5}))$s$,
 'M', 'S', true, null),

(43, 'schedule_delete_series', null,
 array[$s$delete from public.events where series_id = {SER} returning id$s$],
 $s$select public.schedule_delete_series({SER})$s$,
 $s$select pg_temp.rows_fp('select * from public.events where series_id = ' || quote_literal({SER}))$s$,
 'M', 'S', true, null),

(44, 'staff_assign_position', null,
 array[$s$insert into public.position_assignments (position_id, member_id, assigned_by) values ({POS}, {S}, {me})$s$],
 $s$select public.staff_assign_position({POS}, {S})$s$,
 $s$select pg_temp.rows_fp('select * from public.position_assignments where position_id = ' || quote_literal({POS}))$s$,
 'M', 'S', true, null),

(45, 'staff_unassign_position',
 $s$insert into public.position_assignments (position_id, member_id) values ({POS}, {S}) on conflict do nothing$s$,
 array[$s$delete from public.position_assignments where position_id = {POS} and member_id = {S}$s$],
 $s$select public.staff_unassign_position({POS}, {S})$s$,
 $s$select pg_temp.rows_fp('select * from public.position_assignments where position_id = ' || quote_literal({POS}))$s$,
 'M', 'S', true, null),

(46, 'staff_save_position (a new one)', null,
 array[$s$insert into public.positions (name, description, target_count, sort_order) values ('t0019 new pos', null, 2, 50)$s$],
 $s$select public.staff_save_position(null, 't0019 new pos', null, 2, 50)$s$,
 $s$select pg_temp.rows_fp('select * from public.positions where name = ''t0019 new pos''', array['id'])$s$,
 'M', 'S', true, null),

(47, 'staff_save_position (an edit)', null,
 array[$s$update public.positions set name = 't0019 fixture pos', description = 'edited', target_count = 3, sort_order = 92 where id = {POS}$s$],
 $s$select public.staff_save_position({POS}, 't0019 fixture pos', 'edited', 3, 92)$s$,
 $s$select pg_temp.rows_fp('select * from public.positions where id = ' || quote_literal({POS}))$s$,
 'M', 'S', true, null),

(48, 'staff_delete_position', null,
 array[$s$delete from public.positions where id = {POS2}$s$],
 $s$select public.staff_delete_position({POS2})$s$,
 $s$select pg_temp.rows_fp('select * from public.positions where id = ' || quote_literal({POS2}))$s$,
 'M', 'S', true, null),

(49, 'staff_add_fll_team', null,
 array[$s$insert into public.fll_teams (name) values ('t0019 fll')$s$],
 $s$select public.staff_add_fll_team('t0019 fll')$s$,
 $s$select pg_temp.rows_fp('select * from public.fll_teams where name = ''t0019 fll''', array['id'])$s$,
 'M', 'S', true, null),

(50, 'admin_save_standing_settings', null,
 array[$s$update public.standing_settings set starts_on = date '2026-09-02', build_season_start = date '2027-01-10', build_season_end = date '2027-04-05', kickoff_event_id = {E}, updated_at = now() where id = true$s$],
 $s$select public.admin_save_standing_settings(jsonb_build_object('starts_on', '2026-09-02', 'build_season_start', '2027-01-10', 'build_season_end', '2027-04-05', 'kickoff_event_id', {E}))$s$,
 $s$select pg_temp.rows_fp('select * from public.standing_settings')$s$,
 'A', 'M', true, $s$select not exists (select 1 from public.standing_settings where id)$s$),

(51, 'survey_submit', null,
 array[$s$insert into public.survey_responses (survey_id, member_id) values ({SVO}, {me}) returning id, submitted_at$s$,
       $s$insert into public.survey_answers (response_id, question_id, value) select r.id, {QO}, '"Yes"' from public.survey_responses r where r.survey_id = {SVO} and r.member_id = {me}$s$],
 $s$select public.survey_submit({SVO}, jsonb_build_array(jsonb_build_object('question_id', {QO}, 'value', 'Yes')))$s$,
 $s$select pg_temp.rows_fp('select r.member_id, r.submitted_at, a.question_id, a.value from public.survey_responses r left join public.survey_answers a on a.response_id = r.id where r.survey_id = ' || quote_literal({SVO}))$s$,
 'S', 'anon', true, null),

(52, 'survey_create', null,
 array[$s$insert into public.surveys (title, opens_at, closes_at, created_by) values ('t0019 survey', now(), now() + interval '7 days', {me}) returning id$s$],
 $s$select public.survey_create('t0019 survey', now(), now() + interval '7 days')$s$,
 $s$select pg_temp.rows_fp('select * from public.surveys where title = ''t0019 survey''', array['id'])$s$,
 'M', 'S', true, null),

(53, 'survey_set_open', null,
 array[$s$update public.surveys set is_open = false where id = {SVO}$s$,
       $s$update public.surveys set is_open = true where id = {SV}$s$],
 $s$select public.survey_set_open({SV}, true)$s$,
 $s$select pg_temp.rows_fp('select id, is_open from public.surveys where is_open or id in (' || quote_literal({SV}) || ', ' || quote_literal({SVO}) || ')')$s$,
 'M', 'S', true, null),

(54, 'survey_save_details', null,
 array[$s$update public.surveys set title = 't0019 closed renamed', opens_at = now(), closes_at = now() + interval '3 days' where id = {SV}$s$],
 $s$select public.survey_save_details({SV}, 't0019 closed renamed', now(), now() + interval '3 days')$s$,
 $s$select pg_temp.rows_fp('select * from public.surveys where id = ' || quote_literal({SV}))$s$,
 'M', 'S', true, null),

(55, 'survey_duplicate', null,
 array[$s$insert into public.surveys (title, opens_at, closes_at, is_open, created_by) values ('t0019 copy', null, null, false, {me}) returning id$s$,
       $s$insert into public.survey_questions (survey_id, position, kind, prompt, options, required) select s.id, x.position, x.kind, x.prompt, x.options, x.required from public.surveys s, (values (1, 'single', 'A?', '[]'::jsonb, true), (2, 'text', 'B?', '[]'::jsonb, false)) as x(position, kind, prompt, options, required) where s.title = 't0019 copy'$s$],
 $s$select public.survey_duplicate('t0019 copy', '[{"position": 1, "kind": "single", "prompt": "A?", "options": [], "required": true}, {"position": 2, "kind": "text", "prompt": "B?", "options": [], "required": false}]')$s$,
 $s$select pg_temp.rows_fp('select s.title, s.is_open, s.created_by, q.position, q.kind, q.prompt, q.options, q.required from public.surveys s left join public.survey_questions q on q.survey_id = s.id where s.title = ''t0019 copy''')$s$,
 'M', 'S', true, null),

(56, 'survey_delete', null,
 array[$s$delete from public.surveys where id = {SVD}$s$],
 $s$select public.survey_delete({SVD})$s$,
 $s$select pg_temp.rows_fp('select * from public.surveys where id = ' || quote_literal({SVD}))$s$,
 'M', 'S', true, null),

(57, 'survey_add_question', null,
 array[$s$insert into public.survey_questions (survey_id, position, kind, prompt, options, required) values ({SV}, 9, 'single', 'New question', '[]', false)$s$],
 $s$select public.survey_add_question({SV}, 9)$s$,
 $s$select pg_temp.rows_fp('select * from public.survey_questions where survey_id = ' || quote_literal({SV}), array['id'])$s$,
 'M', 'S', true, null),

(58, 'survey_save_question', null,
 array[$s$update public.survey_questions set prompt = 't0019 q1 edited', kind = 'multi', options = '["a", "b"]', required = false where id = {Q1}$s$],
 $s$select public.survey_save_question({Q1}, 't0019 q1 edited', 'multi', '["a", "b"]', false)$s$,
 $s$select pg_temp.rows_fp('select * from public.survey_questions where id = ' || quote_literal({Q1}))$s$,
 'M', 'S', true, null),

(59, 'survey_delete_question', null,
 array[$s$delete from public.survey_questions where id = {Q2}$s$],
 $s$select public.survey_delete_question({Q2})$s$,
 $s$select pg_temp.rows_fp('select * from public.survey_questions where id = ' || quote_literal({Q2}))$s$,
 'M', 'S', true, null),

(60, 'survey_reorder_questions', null,
 array[$s$update public.survey_questions set position = 1 where id = {Q3}$s$,
       $s$update public.survey_questions set position = 2 where id = {Q1}$s$,
       $s$update public.survey_questions set position = 3 where id = {Q2}$s$],
 $s$select public.survey_reorder_questions(array[{Q3}, {Q1}, {Q2}]::uuid[])$s$,
 $s$select pg_temp.rows_fp('select id, position from public.survey_questions where survey_id = ' || quote_literal({SV}))$s$,
 'M', 'S', true, null),

(61, 'trips_create', null,
 array[$s$insert into public.hub_events (title) values ('t0019 new trip') returning id$s$],
 $s$select public.trips_create('t0019 new trip')$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_events where title = ''t0019 new trip''', array['id'])$s$,
 'M', 'S', true, null),

(62, 'trips_mark_needs_reviewed', null,
 array[$s$update public.hub_food_needs set starter = false where id in ({N1})$s$],
 $s$select public.trips_mark_needs_reviewed(array[{N1}]::uuid[])$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_food_needs where meal_id = ' || quote_literal({ML}), array['id'])$s$,
 'M', 'S', true, null),

(63, 'trips_add_food_need', null,
 array[$s$insert into public.hub_food_needs (meal_id, label, quantity, position) values ({ML}, 't0019 need', 2, 99)$s$],
 $s$select public.trips_add_food_need({ML}, 't0019 need', 2)$s$,
 $s$select pg_temp.rows_fp('select meal_id, label, quantity, starter, position from public.hub_food_needs where meal_id = ' || quote_literal({ML}))$s$,
 'M', 'S', true, null),

(64, 'trips_remove_food_need', null,
 array[$s$delete from public.hub_food_needs where id = {N2}$s$],
 $s$select public.trips_remove_food_need({N2})$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_food_needs where id = ' || quote_literal({N2}))$s$,
 'M', 'S', true, null),

(65, 'trips_save_event', null,
 array[$s$update public.hub_events set title = 't0019 trip saved', venue_name = 'Venue', venue_address = '1 Main', map_url = 'https://m', phase1_due_at = now() + interval '9 days', lockin_opens_at = null, lockin_due_at = null, one_minor_rule = true, driver_paperwork_required = true, alert_emails = '{a@example.com}', links = '{"hotel": "https://h"}', updated_at = now(), parent_service_hours_note = 'Counts.' where id = {H}$s$],
 $s$select public.trips_save_event({H}, jsonb_build_object('title', 't0019 trip saved', 'venue_name', 'Venue', 'venue_address', '1 Main', 'map_url', 'https://m', 'phase1_due_at', now() + interval '9 days', 'lockin_opens_at', null, 'lockin_due_at', null, 'one_minor_rule', true, 'driver_paperwork_required', true, 'alert_emails', jsonb_build_array('a@example.com'), 'links', jsonb_build_object('hotel', 'https://h'), 'updated_at', now(), 'parent_service_hours_note', 'Counts.'))$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_events where id = ' || quote_literal({H}))$s$,
 'M', 'S', true, null),

(66, 'trips_save_event (the info sections only)', null,
 array[$s$update public.hub_events set info = '{"sections": [{"key": "s1", "title": "Parking", "lines": ["Lot B"]}]}', updated_at = now() where id = {H}$s$],
 $s$select public.trips_save_event({H}, jsonb_build_object('info', '{"sections": [{"key": "s1", "title": "Parking", "lines": ["Lot B"]}]}'::jsonb, 'updated_at', now()))$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_events where id = ' || quote_literal({H}))$s$,
 'M', 'S', true, null),

(67, 'trips_save_day', null,
 array[$s$update public.hub_days set title = 't0019 day', position = 2, captain_id = {A}, meet_place = 'Lot', meet_at = now() + interval '40 days', last_car_out_at = null, target_arrival_at = null, doors_at = null, venue_opens_at = null, venue_closes_at = now() + interval '40 days 8 hours', pits_close_at = null, drive_to_range = '1h', drive_home_range = '1h', miles_to = 30.5, miles_home = 31, intro = 'Hi', home_options = '[{"label": "Bus", "default": true}]', notes = null, ask_pit_setup = true, ask_school_ride = false where id = {D}$s$],
 $s$select public.trips_save_day({D}, jsonb_build_object('title', 't0019 day', 'position', 2, 'captain_id', {A}, 'meet_place', 'Lot', 'meet_at', now() + interval '40 days', 'last_car_out_at', null, 'target_arrival_at', null, 'doors_at', null, 'venue_opens_at', null, 'venue_closes_at', now() + interval '40 days 8 hours', 'pits_close_at', null, 'drive_to_range', '1h', 'drive_home_range', '1h', 'miles_to', 30.5, 'miles_home', 31, 'intro', 'Hi', 'home_options', '[{"label": "Bus", "default": true}]'::jsonb, 'notes', null, 'ask_pit_setup', true, 'ask_school_ride', false))$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_days where id = ' || quote_literal({D}))$s$,
 'M', 'S', true, null),

(68, 'trips_save_meal', null,
 array[$s$update public.hub_meals set label = 't0019 meal', starts_at = now() + interval '40 days 1 hour', truck_note = 'truck' where id = {ML}$s$],
 $s$select public.trips_save_meal({ML}, 't0019 meal', now() + interval '40 days 1 hour', 'truck')$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_meals where id = ' || quote_literal({ML}))$s$,
 'M', 'S', true, null),

(69, 'trips_add_day', null,
 array[$s$insert into public.hub_days (event_id, day_date, position, venue_closes_at) values ({H}, current_date + 41, 9, now() + interval '41 days')$s$],
 $s$select public.trips_add_day({H}, current_date + 41, now() + interval '41 days')$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_days where event_id = ' || quote_literal({H}), array['id'])$s$,
 'M', 'S', true, null),

(70, 'trips_add_meal', null,
 array[$s$insert into public.hub_meals (event_id, day_id, label, starts_at) values ({H}, {D}, 't0019 dinner', now() + interval '40 days 9 hours')$s$],
 $s$select public.trips_add_meal({H}, {D}, 't0019 dinner', now() + interval '40 days 9 hours')$s$,
 $s$select pg_temp.rows_fp('select * from public.hub_meals where event_id = ' || quote_literal({H}), array['id'])$s$,
 'M', 'S', true, null),

(71, 'staff_resolve_missed_checkout', null,
 array[$s$update public.session_reviews set status = 'approved', reviewed_by = {me}, reviewed_at = now() where id = {SR}$s$],
 $s$select public.staff_resolve_missed_checkout({SR}, 'approved')$s$,
 $s$select pg_temp.rows_fp('select * from public.session_reviews where id = ' || quote_literal({SR}))$s$,
 'M', 'S', true, null),

(72, 'staff_set_auto_close_cutoff', null,
 array[$s$update public.app_settings set value = '23:37' where key = 'auto_close_cutoff' returning key$s$],
 $s$select public.staff_set_auto_close_cutoff('23:37')$s$,
 $s$select pg_temp.rows_fp('select * from public.app_settings where key = ''auto_close_cutoff''')$s$,
 'M', 'S', true, null);

-- ── 1 structure ─────────────────────────────────────────────────────────────
do $structure$
declare
  v_names text[] := array[
    'access_request_submit', 'announce_add_role', 'announce_edit_role', 'announce_set_role_active',
    'announce_delete_role', 'member_finish_tour', 'member_ensure_profile', 'member_save_profile',
    'member_set_avatar', 'member_set_notification_prefs', 'member_save_application_profile',
    'member_application_submit', 'attendance_record', 'feedback_submit', 'feedback_set_legacy_status',
    'handbook_sign', 'event_set_response', 'event_rsvp', 'event_clear_response', 'job_post_update',
    'staff_set_job_status', 'staff_save_job', 'staff_delete_job', 'log_hours_submit', 'log_hours_delete',
    'staff_review_logged_hours', 'push_subscribe', 'push_unsubscribe', 'admin_approve_member',
    'admin_add_allowed_domain', 'admin_remove_allowed_domain', 'admin_set_member_status',
    'admin_set_geofence_exempt', 'staff_link_family_hub', 'schedule_create_event', 'schedule_create_events',
    'schedule_update_event', 'schedule_update_series', 'schedule_delete_event', 'schedule_delete_series',
    'staff_assign_position', 'staff_unassign_position', 'staff_save_position', 'staff_delete_position',
    'staff_add_fll_team', 'admin_save_standing_settings', 'survey_submit', 'survey_create', 'survey_set_open',
    'survey_save_details', 'survey_duplicate', 'survey_delete', 'survey_add_question', 'survey_save_question',
    'survey_delete_question', 'survey_reorder_questions', 'trips_create', 'trips_mark_needs_reviewed',
    'trips_add_food_need', 'trips_remove_food_need', 'trips_save_event', 'trips_save_day', 'trips_save_meal',
    'trips_add_day', 'trips_add_meal', 'staff_resolve_missed_checkout', 'staff_set_auto_close_cutoff'];
  v_found int; v_definer int; v_tested int;
begin
  select count(*), count(*) filter (where p.prosecdef) into v_found, v_definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (v_names);
  select count(distinct split_part(fn, ' ', 1)) into v_tested from t0019_cases where split_part(fn, ' ', 1) = any (v_names);
  perform pg_temp.rec(1, 'structure: 67 functions, every one SECURITY INVOKER, every one tested below',
    case when v_found = 67 and v_definer = 0 and v_tested = 67 then 'PASS' else 'FAIL' end,
    format('found %s, definer %s, tested %s', v_found, v_definer, v_tested));
end
$structure$;

-- ── 2 .. 72 the functions, side by side with the direct write ───────────────
do $checks$
declare
  c record;
  a record;
  v_actor uuid;
  v_base text; v_d text; v_f text;
  v_same boolean; v_pos_ok boolean; v_neg_ok boolean;
  v_detail text; v_diff text; v_skip boolean;
  v_m_is_admin boolean := (select v::boolean from t0019_fx where k = 'M_is_admin');
begin
  for c in select * from t0019_cases order by n loop
    v_skip := false;
    if c.skip_if is not null then execute c.skip_if into v_skip; end if;
    if coalesce(v_skip, false) then
      perform pg_temp.rec(c.n, c.fn, 'SKIP', 'cannot run on this database (see skip_if)');
      continue;
    end if;
    if (c.pos <> 'anon' and pg_temp.fx(c.pos) is null) or (c.neg <> 'anon' and pg_temp.fx(c.neg) is null) then
      perform pg_temp.rec(c.n, c.fn, 'SKIP', format('no %s or no %s member on this database', c.pos, c.neg));
      continue;
    end if;
    if c.setup is not null then execute pg_temp.sub(c.setup, null); end if;
    v_same := true; v_pos_ok := false; v_neg_ok := false; v_diff := '';
    for a in select x.k from (values ('A'), ('M'), ('S'), ('P'), ('anon')) as x(k) loop
      if a.k <> 'anon' and pg_temp.fx(a.k) is null then continue; end if;
      v_actor := case when a.k = 'anon' then null else pg_temp.fx(a.k)::uuid end;
      v_base := 'ok|' || pg_temp.fpv(c.fp, v_actor);
      v_d := pg_temp.probe(v_actor, c.direct, c.fp);
      v_f := pg_temp.probe(v_actor, array[c.call], c.fp);
      if v_d is distinct from v_f then
        v_same := false;
        v_diff := v_diff || format(' %s: direct %s, function %s;', a.k, split_part(v_d, '|', 1) || case when split_part(v_d, '|', 2) = split_part(v_base, '|', 2) then ' (unchanged)' else ' (changed)' end,
                                   split_part(v_f, '|', 1) || case when split_part(v_f, '|', 2) = split_part(v_base, '|', 2) then ' (unchanged)' else ' (changed)' end);
      end if;
      if a.k = c.pos then
        v_pos_ok := split_part(v_d, '|', 1) = 'ok' and split_part(v_f, '|', 1) = 'ok'
                    and (not c.needs_change or (split_part(v_d, '|', 2) <> split_part(v_base, '|', 2)));
      end if;
      if a.k = c.neg then
        v_neg_ok := split_part(v_d, '|', 2) = split_part(v_base, '|', 2) and split_part(v_f, '|', 2) = split_part(v_base, '|', 2);
      end if;
    end loop;
    v_detail := format('same outcome for every caller: %s; %s writes: %s; %s changes nothing: %s%s%s',
                       v_same, c.pos, v_pos_ok, c.neg, v_neg_ok,
                       case when v_diff <> '' then '.' || v_diff else '' end,
                       case when v_m_is_admin and 'M' in (c.pos, c.neg) then ' (no mentor without admin here: M is an admin)' else '' end);
    perform pg_temp.rec(c.n, c.fn, case when v_same and v_pos_ok and v_neg_ok then 'PASS' else 'FAIL' end, v_detail);
  end loop;
end
$checks$;

select n, check_name, result, detail from t0019_results
union all
select 1000, 'SUMMARY', case when bool_and(result <> 'FAIL') then 'PASS' else 'FAIL' end,
       format('%s pass, %s fail, %s skip', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t0019_results
order by 1;

rollback;
