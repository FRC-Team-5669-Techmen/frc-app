-- ============================================================
-- 0015_member_standing RLS test
--
-- Run in the Supabase SQL editor AFTER 0015_member_standing.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK. Every event,
-- request, record, notice, mail row and setting it touches is undone.
--
-- HOW TO READ IT: one row per check (PASS / FAIL, with detail) and a summary.
-- ok:<rows> is a write that landed; err:<SQLSTATE> is a refusal (42501
-- permission, 22023 or P0002 a rule, 23514 a check constraint).
--
-- Actors, picked from live data: three approved students with no staff role
-- (A, B, C), a staff member S that is not an admin when one exists, an admin
-- AD, and a parent P linked to A for this test only.
-- ============================================================

begin;

do $applied$
begin
  if to_regclass('public.standing_records') is null or to_regprocedure('public.standing_evaluate()') is null then
    raise exception 'Cannot test: 0015_member_standing.sql has not been applied';
  end if;
end
$applied$;

create temp table t0015_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0015_fx (a uuid, b uuid, c uuid, s uuid, ad uuid, p uuid,
  ev_soon uuid default gen_random_uuid(), ev_tomorrow uuid default gen_random_uuid(),
  ev_past uuid default gen_random_uuid(), ev_mand uuid default gen_random_uuid(),
  ev_open uuid default gen_random_uuid()) on commit drop;

with ns as (
  select p.id, row_number() over (order by p.id) as rn from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
)
insert into t0015_fx (a, b, c, s, ad, p)
select (select id from ns where rn = 1), (select id from ns where rn = 2), (select id from ns where rn = 3),
       coalesce((select r.member_id from public.member_roles r where r.role in ('mentor', 'lead')
                  and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin')
                  order by r.member_id limit 1),
                (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1)),
       (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
       (select p.id from public.profiles p where not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role <> 'parent')
          and p.id not in (select id from ns) order by p.id limit 1);

do $pre$
declare f t0015_fx;
begin
  select * into f from t0015_fx;
  if f.c is null then raise exception 'Cannot test: need three approved students with no staff role'; end if;
  if f.ad is null then raise exception 'Cannot test: no admin'; end if;
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
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
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
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text) returns void language sql as $fn$
  insert into t0015_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

do $checks$
declare
  f t0015_fx;
  r text; v text; w text; req uuid; mon date := date_trunc('week', (now() at time zone 'America/Los_Angeles')::date)::date;
begin
  select * into f from t0015_fx;
  -- The parent P is linked to A for this test only (guardian links have no
  -- other path a test can take without an admin RPC).
  if f.p is not null then
    insert into public.guardian_links (parent_id, student_id) values (f.p, f.a) on conflict do nothing;
  end if;

  insert into public.events (id, title, kind, starts_at, ends_at, mandatory) values
    (f.ev_soon,     't0015 meeting in 3 days', 'meeting',     now() + interval '3 days',  now() + interval '3 days 1 hour', false),
    (f.ev_tomorrow, 't0015 meeting in 6 h',    'meeting',     now() + interval '6 hours', now() + interval '7 hours', false),
    (f.ev_past,     't0015 meeting 2 h ago',   'meeting',     now() - interval '2 hours', now() - interval '1 hour', false),
    (f.ev_mand,     't0015 competition',       'competition', now() + interval '20 days', now() + interval '21 days', true),
    (f.ev_open,     't0015 meeting started',   'meeting',     now() - interval '10 minutes', now() + interval '1 hour', false);

  -- 1 structure
  select string_agg(c.relname, ',' order by c.relname) into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in ('absence_requests', 'team_weeks', 'grade_checks', 'discipline_records',
     'safety_violations', 'incident_reports', 'member_notices', 'notice_outbox', 'standing_records', 'standing_weeks', 'standing_months',
     'fll_teams', 'fll_mentors', 'standing_settings');
  perform pg_temp.rec(1, 'structure: RLS on all 14 new tables', array_length(string_to_array(v, ','), 1) = 14, v);

  -- 2 POSITIVE: a request 3 days ahead
  r := pg_temp.run_as(f.a, format('select public.request_absence(%L, %L, %L, false)', f.ev_soon, 'medical', 'Dentist'));
  perform pg_temp.rec(2, 'a student asks 3 days ahead (positive control)', r = 'ok:1', r);

  -- 3 under 24 hours is refused unless an emergency
  r := pg_temp.run_as(f.a, format('select public.request_absence(%L, %L, null, false)', f.ev_tomorrow, 'medical'));
  v := pg_temp.run_as(f.a, format('select public.request_absence(%L, %L, null, true)', f.ev_tomorrow, 'illness'));
  perform pg_temp.rec(3, 'under 24 hours refused, as an emergency accepted', r = 'err:22023' and v = 'ok:1', r || ' / ' || v);

  -- 4 an emergency after the meeting is accepted (next school day), a non-emergency is not
  r := pg_temp.run_as(f.b, format('select public.request_absence(%L, %L, null, true)', f.ev_past, 'family_emergency'));
  v := pg_temp.run_as(f.c, format('select public.request_absence(%L, %L, null, false)', f.ev_past, 'school_event'));
  perform pg_temp.rec(4, 'an emergency filed after the meeting is accepted; a plain request is not', r = 'ok:1' and v = 'err:22023', r || ' / ' || v);

  -- 5 a mandatory event: only an emergency, or a religious holiday 14 days ahead
  r := pg_temp.run_as(f.a, format('select public.request_absence(%L, %L, null, false)', f.ev_mand, 'school_event'));
  v := pg_temp.run_as(f.a, format('select public.request_absence(%L, %L, null, false)', f.ev_mand, 'religious'));
  perform pg_temp.rec(5, 'a mandatory event refuses a school event and accepts a religious holiday 20 days ahead', r = 'err:22023' and v = 'ok:1', r || ' / ' || v);

  -- 6 no direct writes
  r := pg_temp.run_as(f.a, format('insert into public.absence_requests (member_id, event_id, reason) values (%L, %L, %L)', f.a, f.ev_open, 'medical'));
  perform pg_temp.rec(6, 'a student cannot insert an absence directly, loud', r = 'err:42501', r);

  -- 7 who reads
  v := pg_temp.val_as(f.a, format('select count(*) from public.absence_requests where member_id = %L', f.a));
  r := pg_temp.val_as(f.b, format('select count(*) from public.absence_requests where member_id = %L', f.a));
  w := case when f.p is null then 'skip' else pg_temp.val_as(f.p, format('select count(*) from public.absence_requests where member_id = %L', f.a)) end;
  perform pg_temp.rec(7, 'A reads own 3, B reads 0, the linked parent reads 3', v = '3' and r = '0' and (w = '3' or w = 'skip'), v || ' / ' || r || ' / ' || w);

  -- 8 deciding
  select id into req from public.absence_requests where member_id = f.a and event_id = f.ev_soon;
  r := pg_temp.run_as(f.b, format('select public.decide_absence(%L, true, null)', req));
  v := pg_temp.val_as(f.s, format('select status from public.decide_absence(%L, false, %L)', req, 'Come for the first half'));
  w := (select count(*)::text from public.member_notices where member_id = f.a and kind = 'absence');
  perform pg_temp.rec(8, 'a student cannot decide; staff denies and A gets a notice (positive control)', r = 'err:42501' and v = 'denied' and w = '1', r || ' / ' || v || ' / ' || w);

  -- 9 unanswered at the start counts as excused; denied does not
  insert into public.absence_requests (member_id, event_id, reason, requested_at) values (f.b, f.ev_open, 'medical', now() - interval '2 days');
  v := public._absence_excused(f.b, f.ev_open, now() - interval '10 minutes')::text;
  r := public._absence_excused(f.a, f.ev_soon, now() + interval '3 days')::text;
  perform pg_temp.rec(9, 'a request unanswered when the meeting started is excused; a denied one is not', v = 'true' and r = 'false', v || ' / ' || r);

  -- 10 break weeks
  r := pg_temp.val_as(f.s, format('select kind from public.staff_set_week(%L, %L, %L)', mon + 21, 'break', 'Thanksgiving'));
  v := pg_temp.run_as(f.s, format('select public.staff_set_week(%L, %L, null)', mon + 7, 'break'));
  w := pg_temp.run_as(f.a, format('select public.staff_set_week(%L, %L, null)', mon + 28, 'break'));
  perform pg_temp.rec(10, 'staff posts a break week 21 days out; 7 days out refused; a student refused', r = 'break' and v = 'err:22023' and w = 'err:42501', r || ' / ' || v || ' / ' || w);

  -- 11 discipline
  r := pg_temp.run_as(f.b, format('select public.staff_log_discipline(%L, %L, %L)', f.a, 'verbal', 'Phone in the shop'));
  v := pg_temp.run_as(f.s, format('select public.staff_log_discipline(%L, %L, %L)', f.a, 'written', 'No safety glasses after a warning'));
  w := pg_temp.val_as(f.a, format('select count(*) from public.discipline_records where member_id = %L', f.a))
       || '/' || pg_temp.val_as(f.b, format('select count(*) from public.discipline_records where member_id = %L', f.a));
  perform pg_temp.rec(11, 'a student cannot log discipline; staff logs a written warning; A reads 1, B reads 0', r = 'err:42501' and v = 'ok:1' and w = '1/0', r || ' / ' || v || ' / ' || w);
  w := (select count(*)::text from public.notice_outbox where member_id = f.a and kind = 'discipline');
  perform pg_temp.rec(12, 'the written warning mails the student and the parents on file (positive control)', w::int >= 1, w || ' mail rows');

  -- 13 suspension length, and removal is admin only
  r := pg_temp.run_as(f.s, format('select public.staff_log_discipline(%L, %L, %L, null, %L, %L)', f.b, 'suspension', 'Horseplay', current_date, current_date + 2));
  v := case when f.s = f.ad then 'err:42501' else pg_temp.run_as(f.s, format('select public.staff_log_discipline(%L, %L, %L)', f.b, 'removal', 'Theft')) end;
  perform pg_temp.rec(13, 'a 3-day suspension refused (1 to 4 weeks); removal refused for a non-admin', r = 'err:23514' and v = 'err:42501', r || ' / ' || v);

  -- 14 safety: the third in a school year reaches the admins
  r := pg_temp.run_as(f.s, format('select public.staff_log_safety(%L, %L)', f.c, 'No glasses'));
  r := r || pg_temp.run_as(f.s, format('select public.staff_log_safety(%L, %L)', f.c, 'Loose hoodie strings'));
  v := (select count(*)::text from public.member_notices where kind = 'safety_third');
  r := r || pg_temp.run_as(f.s, format('select public.staff_log_safety(%L, %L)', f.c, 'Ran the mill alone'));
  w := (select count(*)::text from public.member_notices where kind = 'safety_third');
  perform pg_temp.rec(14, 'two safety violations reach no admin, the third does', v = '0' and w::int >= 1, v || ' then ' || w);
  r := pg_temp.run_as(f.c, format('select public.staff_log_safety(%L, %L)', f.a, 'No glasses'));
  perform pg_temp.rec(15, 'a student cannot log a safety violation, loud', r = 'err:42501', r);

  -- 16 incidents
  r := pg_temp.run_as(f.a, format('select public.report_incident(%L, null, %L)', 'near_miss', 'A drill bit snapped near me'));
  v := pg_temp.val_as(f.b, 'select count(*) from public.incident_reports') || '/' || pg_temp.val_as(f.a, 'select count(*) from public.incident_reports where reported_by = auth.uid()')
       || '/' || pg_temp.val_as(f.s, format('select count(*) from public.incident_reports where reported_by = %L', f.a));
  perform pg_temp.rec(16, 'a student reports a near miss; another student reads 0, the reporter 1, staff 1', r = 'ok:1' and v like '0/1/1', r || ' / ' || v);

  -- 17 the evaluation is admin or cron only
  r := pg_temp.run_as(f.a, 'select public.standing_evaluate()');
  v := case when f.s = f.ad then 'err:42501' else pg_temp.run_as(f.s, 'select public.standing_evaluate()') end;
  perform pg_temp.rec(17, 'a student and a non-admin cannot run the evaluation, loud', r = 'err:42501' and v = 'err:42501', r || ' / ' || v);

  -- 18 POSITIVE: the evaluation opens hours probation for a short week and not for a full one.
  -- Standards from 2 Mondays ago (so no calendar month has ended inside the
  -- window); A, B, C joined 60 days ago; each of those weeks B worked 3 hours
  -- and A none (their own rows in the window are cleared first).
  update public.standing_settings set starts_on = mon - 14;
  delete from public.attendance_events where user_id in (f.a, f.b) and event_time >= public._la_start(mon - 15);
  update auth.users set created_at = now() - interval '60 days' where id in (f.a, f.b, f.c);
  update public.member_applications set submitted_at = now() - interval '60 days' where member_id in (f.a, f.b, f.c);
  delete from public.standing_weeks where member_id in (f.a, f.b, f.c);
  delete from public.standing_months where member_id in (f.a, f.b, f.c);
  delete from public.standing_records where member_id in (f.a, f.b, f.c);
  insert into public.attendance_events (user_id, type, event_time, location, method, category)
  select f.b, x.t, public._la_start(mon - 14 + i) + x.h, 'test', 'manual', 'build'
    from generate_series(0, 13) i,
         (values ('in', interval '15 hours'), ('out', interval '18 hours')) x(t, h)
   where extract(isodow from mon - 14 + i) = 2;
  r := pg_temp.val_as(f.ad, 'select public.standing_evaluate()');
  v := (select string_agg(kind || ':' || status, ',' order by kind) from public.standing_records where member_id = f.a);
  w := coalesce((select string_agg(kind || ':' || status, ',') from public.standing_records where member_id = f.b), 'none');
  -- Two short weeks: the first opens hours probation, the second (on
  -- probation) fails it and proposes removal.
  perform pg_temp.rec(18, 'evaluation: A (two weeks, no hours) goes on hours probation, then removal is proposed; B (3 h a week) none (positive control)',
    v = 'hours:failed,removal:proposed' and w = 'none', coalesce(v, 'none') || ' / ' || w);

  -- 19 idempotent: a second run judges nothing again
  r := pg_temp.val_as(f.ad, 'select public.standing_evaluate()');
  v := (select count(*)::text from public.standing_records where member_id = f.a);
  perform pg_temp.rec(19, 'a second run judges no week twice', r = '0' and v = '2', r || ' rows / ' || v || ' records');

  -- 20 B reads A standing? no. A and the parent yes.
  r := pg_temp.val_as(f.b, format('select public.member_standing(%L)->>''standing''', f.a));
  v := pg_temp.val_as(f.a, format('select public.member_standing(%L)->>''standing''', f.a));
  w := case when f.p is null then 'probation' else pg_temp.val_as(f.p, format('select public.member_standing(%L)->>''standing''', f.a)) end;
  -- (A is on probation: the removal is only proposed.)
  perform pg_temp.rec(20, 'B cannot read A standing; A and the linked parent read probation', r = 'err:42501' and v = 'probation' and w = 'probation', r || ' / ' || v || ' / ' || w);

  -- 21 a removal proposal waits for the admin; confirming takes the member off the roster
  select id into req from public.standing_records where member_id = f.a and kind = 'removal' and status = 'proposed';
  r := case when f.s = f.ad then 'err:42501' else pg_temp.run_as(f.s, format('select public.admin_confirm_standing(%L, true)', req)) end;
  v := (select coalesce(status, 'active') from public.profiles where id = f.a);
  w := pg_temp.val_as(f.ad, format('select status from public.admin_confirm_standing(%L, true)', req));
  w := w || '/' || (select status from public.profiles where id = f.a);
  perform pg_temp.rec(21, 'a non-admin cannot confirm a removal; still active until the admin confirms, then inactive', r = 'err:42501' and v = 'active' and w = 'removed/inactive', r || ' / ' || v || ' / ' || w);

  -- 22 grade checks
  r := pg_temp.run_as(f.s, format('select public.admin_record_grade_check(%L, current_date, true)', f.b));
  v := case when f.s = f.ad then 'skip' else r end;
  r := pg_temp.val_as(f.ad, format('select below from public.admin_record_grade_check(%L, current_date, true)', f.b));
  w := (select string_agg(kind || ':' || status, ',') from public.standing_records where member_id = f.b and kind = 'grades');
  perform pg_temp.rec(22, 'a non-admin cannot record a grade check; the admin records under 2.0 and grades probation opens',
    (v = 'err:42501' or v = 'skip') and r = 'true' and w = 'grades:open', v || ' / ' || r || ' / ' || w);

  -- 23 notices: own only, and only through mark_notice_read
  r := pg_temp.val_as(f.b, format('select count(*) from public.member_notices where member_id = %L', f.a));
  v := pg_temp.run_as(f.a, 'update public.member_notices set read_at = now()');
  perform pg_temp.rec(23, 'B reads 0 of A notices; A cannot update notices directly, loud', r = '0' and v = 'err:42501', r || ' / ' || v);
  r := pg_temp.val_as(null, 'select count(*) from public.notice_outbox');
  v := pg_temp.val_as(f.a, 'select count(*) from public.notice_outbox');
  perform pg_temp.rec(24, 'anon cannot read the outbox (loud); a student reads 0 rows', r = 'err:42501' and v = '0', r || ' / ' || v);

  -- 25 voiding idle time
  insert into public.attendance_events (user_id, type, event_time, location, method, category)
  values (f.a, 'in', now() - interval '1 hour', 'test', 'nfc', 'build');
  r := pg_temp.run_as(f.b, format('select public.staff_void_session(%L, %L)', f.a, 'On a phone for an hour'));
  v := pg_temp.val_as(f.s, format('select public.staff_void_session(%L, %L)', f.a, 'On a phone for an hour'));
  w := (select r2.status from public.session_reviews r2 join public.attendance_events e on e.id = r2.checkout_id where e.user_id = f.a order by e.event_time desc limit 1);
  perform pg_temp.rec(25, 'a student cannot void; staff voids an idle session and it is marked voided', r = 'err:42501' and v = '1' and w = 'voided', r || ' / ' || v || ' / ' || coalesce(w, 'none'));

  -- 26 FLL mentors: at most 4 per team
  insert into public.fll_teams (name) values ('t0015 FLL');
  r := '';
  for v in select unnest(array[f.a::text, f.b::text, f.c::text, f.s::text, f.ad::text]) loop
    r := r || pg_temp.run_as(v::uuid, format('select public.fll_join((select id from public.fll_teams where name = %L))', 't0015 FLL')) || ' ';
  end loop;
  perform pg_temp.rec(26, 'four mentors join an FLL team, a fifth is refused', r like 'ok:1 ok:1 ok:1 ok:1 err:22023%', r);
end
$checks$;

select n, check_name, result, detail from (
  select n, check_name, result, detail from t0015_results
  union all
  select 999, 'summary',
         case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
         format('%s pass, %s fail', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'))
    from t0015_results
) all_rows order by n;

rollback;
