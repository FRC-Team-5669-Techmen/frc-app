-- ============================================================
-- 0044_standing_october_correction test. Run AFTER 0044. SAFE ON LIVE DATA:
-- one transaction ending in ROLLBACK; its events, sign-ins, settings and
-- evaluation runs never persist.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row. Each
-- rule is pinned both ways on the same fixture.
-- Actors: students A, B, C, D, a staff member S.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public._session_open_at(uuid, timestamptz)') is null
     or to_regprocedure('public._standing_evaluate_run()') is null then
    raise exception 'Cannot test: 0044 has not been applied';
  end if;
end
$applied$;

create temp table t44_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t44_fx (a uuid, b uuid, c uuid, d uuid, s uuid,
  ev_rec uuid default gen_random_uuid(), ev_blank uuid default gen_random_uuid()) on commit drop;
grant all on t44_fx, t44_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where public._standing_member(p.id)
)
insert into t44_fx (a, b, c, d, s)
select (select id from ns where rn = 1), (select id from ns where rn = 2), (select id from ns where rn = 3), (select id from ns where rn = 4),
       (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1);

do $pre$
declare f t44_fx;
begin
  select * into f from t44_fx;
  if f.d is null or f.s is null then raise exception 'Cannot test: need four judged students and an admin'; end if;
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
  insert into t44_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
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

-- A recorded meeting two days ago, and a blank one 300 days ago that no one
-- signed in for.
insert into public.events (id, title, kind, starts_at, ends_at)
select ev_rec, 'RLS0044 meeting', 'meeting', now() - interval '50 hours', now() - interval '49 hours 45 minutes' from t44_fx
union all
select ev_blank, 'RLS0044 blank meeting', 'meeting', now() - interval '300 days', now() - interval '300 days' + interval '15 minutes' from t44_fx;

-- A signed in 30 minutes before the start and still in; B signed in and out
-- before it; C signed in 13 hours before and never out.
do $c$
declare f t44_fx; st timestamptz;
begin
  select * into f from t44_fx;
  select starts_at into st from public.events where id = f.ev_rec;
  insert into public.attendance_events (user_id, type, event_time, location, method, category, verified)
  values (f.a, 'in',  st - interval '30 minutes', 'shop', 'nfc', 'build', false),
         (f.b, 'in',  st - interval '90 minutes', 'shop', 'nfc', 'build', false),
         (f.b, 'out', st - interval '10 minutes', 'shop', 'nfc', 'build', false),
         (f.c, 'in',  st - interval '13 hours',   'shop', 'nfc', 'build', false);
end
$c$;

-- 1 to 3. An open session at the start is present; a closed one and a stale
-- one are not.
do $c$
declare f t44_fx; st timestamptz; ma record; mb record; mc record;
begin
  select * into f from t44_fx;
  select starts_at into st from public.events where id = f.ev_rec;
  select * into ma from public._member_meetings(f.a, public._la_date(st), public._la_date(st));
  select * into mb from public._member_meetings(f.b, public._la_date(st), public._la_date(st));
  select * into mc from public._member_meetings(f.c, public._la_date(st), public._la_date(st));
  perform pg_temp.rec(1, 'signed in before the meeting and still in counts as present',
    ma.counted >= 1 and ma.attended = ma.counted and ma.misses = 0 and ma.lates = 0,
    format('A counted %s attended %s misses %s lates %s', ma.counted, ma.attended, ma.misses, ma.lates));
  perform pg_temp.rec(2, 'signed out before the meeting started is a miss',
    mb.counted >= 1 and mb.misses >= 1 and mb.attended = 0,
    format('B counted %s attended %s misses %s', mb.counted, mb.attended, mb.misses));
  perform pg_temp.rec(3, 'a session open more than 12 hours does not count',
    mc.counted >= 1 and mc.misses >= 1 and mc.attended = 0,
    format('C counted %s attended %s misses %s', mc.counted, mc.attended, mc.misses));
end
$c$;

-- 4 and 5. A blank meeting counts for no one; a recorded one counts for a
-- member who has nothing on it.
do $c$
declare f t44_fx; st timestamptz; sb timestamptz; md record; mz record;
begin
  select * into f from t44_fx;
  select starts_at into st from public.events where id = f.ev_rec;
  select starts_at into sb from public.events where id = f.ev_blank;
  select * into md from public._member_meetings(f.d, public._la_date(st), public._la_date(st));
  select * into mz from public._member_meetings(f.d, public._la_date(sb), public._la_date(sb));
  perform pg_temp.rec(4, 'a recorded meeting is a miss for a member with no record of it',
    md.total >= 1 and md.misses >= 1, format('D on the recorded day: total %s misses %s', md.total, md.misses));
  perform pg_temp.rec(5, 'a meeting with no attendance taken counts for no one',
    mz.total = 0 and mz.counted = 0 and mz.misses = 0, format('D on the blank day: total %s counted %s misses %s', mz.total, mz.counted, mz.misses));
end
$c$;

-- 6 to 9. The hold. Every judged student has a finished week with no hours.
update public.standing_settings set starts_on = (date_trunc('week', public._la_today()) - interval '14 days')::date, hold_over_pct = 25;
update public.member_applications set submitted_at = now() - interval '90 days';
update auth.users set created_at = now() - interval '90 days';

do $c$
declare f t44_fx; v_ret int; v_judged int; v_rec int; v_wk int; v_mail int; v_hold int; v_admins int;
begin
  select * into f from t44_fx;
  perform pg_temp.clear();
  select count(*) into v_judged from public.profiles p where public._standing_member(p.id);
  select count(*) into v_admins from public.member_roles where role = 'admin';
  v_ret := public.standing_evaluate();
  select count(distinct member_id) into v_rec from public.standing_records where created_at = now();
  select count(*) into v_wk from public.standing_weeks where evaluated_at = now();
  select count(*) into v_mail from public.notice_outbox where created_at = now() and kind = 'probation';
  select count(*) into v_hold from public.member_notices where created_at = now() and kind = 'standing_hold';
  perform pg_temp.rec(6, 'a run that would put every judged student on probation is held: nothing kept, nothing mailed',
    v_judged >= 4 and v_ret = 0 and v_rec = 0 and v_wk = 0 and v_mail = 0,
    format('judged %s, returned %s, records %s, weeks %s, probation mails %s', v_judged, v_ret, v_rec, v_wk, v_mail));
  perform pg_temp.rec(7, 'the hold alerts every admin once',
    v_admins >= 1 and v_hold = v_admins, format('%s hold notices for %s admins', v_hold, v_admins));

  v_ret := public.standing_evaluate();
  select count(*) into v_hold from public.member_notices where created_at = now() and kind = 'standing_hold';
  perform pg_temp.rec(8, 'a second held run the same day does not alert again',
    v_ret = 0 and v_hold = v_admins, format('returned %s, %s hold notices for %s admins', v_ret, v_hold, v_admins));

  update public.standing_settings set hold_over_pct = null;
  v_ret := public.standing_evaluate();
  select count(distinct member_id) into v_rec from public.standing_records where created_at = now() and kind in ('hours', 'meetings');
  select count(*) into v_mail from public.notice_outbox where created_at = now() and kind = 'probation';
  perform pg_temp.rec(9, 'with the hold off, the same run opens the probations and queues their mail',
    v_ret > 0 and v_rec >= 4 and v_mail >= v_rec,
    format('returned %s, members on probation %s, probation mails %s', v_ret, v_rec, v_mail));
end
$c$;

-- 10 and 11. Who can call what.
do $c$
declare f t44_fx; r text;
begin
  select * into f from t44_fx;
  r := pg_temp.call_as(f.a, 'select public.standing_evaluate()::text');
  perform pg_temp.rec(10, 'a student cannot run the evaluation; the entry point is still granted to members (it checks admin itself)',
    r like 'err:42501:%' and has_function_privilege('authenticated', 'public.standing_evaluate()', 'EXECUTE'), r);
  perform pg_temp.rec(11, 'the unwrapped run and the new helpers are closed to members',
    not has_function_privilege('authenticated', 'public._standing_evaluate_run()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._session_open_at(uuid, timestamptz)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._meeting_recorded(uuid, timestamptz, timestamptz)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.standing_evaluate()', 'EXECUTE'),
    'run, open-at, recorded closed; anon closed');
end
$c$;

select n, check_name as check, result, detail from t44_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t44_results
order by 1;

rollback;
