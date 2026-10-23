-- ============================================================
-- 0025_absence_handbook test. Run AFTER 0025. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; its events, requests, check-ins and
-- weeks never persist.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row. Each
-- handbook rule is pinned both ways: what it refuses beside what it lets
-- through on the same fixture.
-- Actors: students A, B, C, D, a staff member S.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public._member_meetings(uuid, date, date)') is null
     or to_regprocedure('public.request_absence(uuid, text, text, boolean)') is null then
    raise exception 'Cannot test: 0015 and 0025 have not been applied';
  end if;
end
$applied$;

create temp table t25_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t25_fx (a uuid, b uuid, c uuid, d uuid, s uuid,
  ev_past uuid default gen_random_uuid(), ev_soon uuid default gen_random_uuid(), ev_met uuid default gen_random_uuid()) on commit drop;
grant all on t25_fx, t25_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
)
insert into t25_fx (a, b, c, d, s)
select (select id from ns where rn = 1), (select id from ns where rn = 2), (select id from ns where rn = 3), (select id from ns where rn = 4),
       (select r.member_id from public.member_roles r where r.role in ('mentor', 'admin') order by r.member_id limit 1);

do $pre$
declare f t25_fx;
begin
  select * into f from t25_fx;
  if f.d is null or f.s is null then raise exception 'Cannot test: need four non-staff students and a staff member'; end if;
end
$pre$;

-- A meeting that started two hours ago, one two days ahead, and one that
-- ended yesterday (for the attendance count).
insert into public.events (id, title, kind, starts_at, ends_at)
select ev_past, 'RLS0025 meeting today', 'meeting', now() - interval '2 hours', now() + interval '1 hour' from t25_fx
union all select ev_soon, 'RLS0025 meeting ahead', 'meeting', now() + interval '2 days', now() + interval '2 days 2 hours' from t25_fx
union all select ev_met, 'RLS0025 meeting yesterday', 'meeting', now() - interval '26 hours', now() - interval '24 hours' from t25_fx;

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
  insert into t25_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
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

-- 1-3. Section 6: an emergency is own illness or injury, or a family
-- emergency. A medical visit is not one, but is excused asked ahead.
do $c$
declare f t25_fx; r1 text; r2 text; r3 text;
begin
  select * into f from t25_fx;
  r1 := pg_temp.call_as(f.a, format('select (public.request_absence(%L::uuid, %L, null, true)).status', f.ev_past, 'medical'));
  r2 := pg_temp.call_as(f.b, format('select (public.request_absence(%L::uuid, %L, null, true)).status', f.ev_past, 'illness'));
  r3 := pg_temp.call_as(f.a, format('select (public.request_absence(%L::uuid, %L, null, false)).status', f.ev_soon, 'medical'));
  perform pg_temp.rec(1, 'a medical visit filed as an emergency is refused', r1 like 'err:22023:%emergency%', r1);
  perform pg_temp.rec(2, 'own illness filed as an emergency after the meeting started is taken (positive control)', r2 = 'pending', r2);
  perform pg_temp.rec(3, 'a medical visit asked two days ahead is taken', r3 = 'pending', r3);
end
$c$;

-- 4-5. Section 6: by 11:59 PM the next SCHOOL day; a posted break week has
-- none.
do $c$
declare fri date; nxt date; nxt_break date;
begin
  fri := (date_trunc('week', current_date)::date + 4 + 70);   -- a Friday ten weeks out
  nxt := public._next_school_day(fri);
  insert into public.team_weeks (week_start, kind) values (fri + 3, 'break');
  nxt_break := public._next_school_day(fri);
  perform pg_temp.rec(4, 'the next school day after a Friday is the Monday',
    nxt = fri + 3, format('%s -> %s', fri, nxt));
  perform pg_temp.rec(5, 'with that week posted as a break week, it is the Monday after the break',
    nxt_break = fri + 10, format('%s -> %s', fri, nxt_break));
end
$c$;

-- 6-8. Section 6: a request still unanswered at the meeting is approved. A
-- mentor cannot deny it afterwards, may approve it; a request before its
-- event may still be denied.
do $c$
declare f t25_fx; req_late uuid; req_early uuid; r1 text; r2 text; r3 text;
begin
  select * into f from t25_fx;
  insert into public.absence_requests (member_id, event_id, reason, requested_at)
  values (f.c, f.ev_past, 'school_event', now() - interval '3 days') returning id into req_late;
  insert into public.absence_requests (member_id, event_id, reason, requested_at)
  values (f.d, f.ev_soon, 'school_event', now() - interval '1 hour') returning id into req_early;
  r1 := pg_temp.call_as(f.s, format('select (public.decide_absence(%L::uuid, false)).status', req_late));
  perform pg_temp.rec(6, 'a request unanswered when its meeting started cannot be denied afterwards',
    r1 like 'err:22023:%unanswered%' and (select status from public.absence_requests where id = req_late) = 'pending', r1);
  r2 := pg_temp.call_as(f.s, format('select (public.decide_absence(%L::uuid, true)).status', req_late));
  perform pg_temp.rec(7, 'it can be recorded as approved', r2 = 'approved', r2);
  perform pg_temp.rec(13, 'a student cannot decide an absence; nothing changes',
    pg_temp.call_as(f.a, format('select (public.decide_absence(%L::uuid, false)).status', req_early)) like 'err:42501:%'
    and (select status from public.absence_requests where id = req_early) = 'pending', '');
  r3 := pg_temp.call_as(f.s, format('select (public.decide_absence(%L::uuid, false)).status', req_early));
  perform pg_temp.rec(8, 'a request decided before its event may still be denied (positive control)', r3 = 'denied', r3);
end
$c$;

-- 9-11. Section 6: a mentor who checks a member in during the meeting counts
-- as attending (present in the first 15 minutes, late after); a member with
-- nothing is absent; an ordinary IN with no meeting scan is still absent.
do $c$
declare f t25_fx; st timestamptz; ma record; mb record; mc record; md record;
begin
  select * into f from t25_fx;
  select starts_at into st from public.events where id = f.ev_met;
  insert into public.attendance_events (user_id, type, event_time, location, method, category, manual_entry, verified)
  values (f.a, 'in', st + interval '5 minutes', 'manual', 'manual', 'build', true, true),
         (f.b, 'in', st + interval '40 minutes', 'manual', 'manual', 'build', true, true),
         (f.d, 'in', st + interval '5 minutes', 'shop', 'nfc', 'build', false, false);
  select * into ma from public._member_meetings(f.a, (st - interval '1 day')::date, (st + interval '1 day')::date);
  select * into mb from public._member_meetings(f.b, (st - interval '1 day')::date, (st + interval '1 day')::date);
  select * into mc from public._member_meetings(f.c, (st - interval '1 day')::date, (st + interval '1 day')::date);
  select * into md from public._member_meetings(f.d, (st - interval '1 day')::date, (st + interval '1 day')::date);
  perform pg_temp.rec(9, 'a mentor check-in 5 minutes in counts as present, 40 minutes in as late',
    ma.attended >= 1 and ma.misses = 0 and ma.lates = 0 and mb.attended >= 1 and mb.lates >= 1 and mb.misses = 0,
    format('A attended %s lates %s misses %s; B attended %s lates %s misses %s', ma.attended, ma.lates, ma.misses, mb.attended, mb.lates, mb.misses));
  perform pg_temp.rec(10, 'a member with no scan and no mentor check-in is absent',
    mc.misses >= 1, format('C misses %s of %s', mc.misses, mc.total));
  perform pg_temp.rec(11, 'an ordinary tag IN with no meeting scan does not count as attending (only a mentor check-in does)',
    md.misses >= 1 and md.attended = 0, format('D attended %s misses %s', md.attended, md.misses));
end
$c$;

-- 12. The two helpers are not callable by a member (a definer read of
-- any member meetings).
do $c$
declare f t25_fx; r text;
begin
  select * into f from t25_fx;
  r := pg_temp.call_as(f.a, format('select (public._member_meetings(%L::uuid, current_date - 7, current_date)).total::text', f.b));
  perform pg_temp.rec(12, 'a member cannot read another member meeting counts through the helper',
    r like 'err:42501:%' and not has_function_privilege('authenticated', 'public._next_school_day(date)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.request_absence(uuid, text, text, boolean)', 'EXECUTE'), r);
end
$c$;

select n, check_name as check, result, detail from t25_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t25_results
order by 1;

rollback;
