-- ============================================================
-- 0014_session_signout RLS test
--
-- Run in the Supabase SQL editor AFTER 0014_session_signout.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK. Every attendance
-- event, request, meeting, grant and check-in it creates is undone, and no
-- existing row changes.
--
-- HOW TO READ IT: one row per check (PASS / FAIL / SKIP, with detail) and a
-- final summary row. ok:<rows> is a write that landed; err:<SQLSTATE> is a
-- refusal (42501 for permission, P0002 or 22023 for a rule).
--
-- MUTATION TEST: widen a boundary (the guard returning new always, the
-- approver check to true, the select policy to true) and rows turn FAIL.
-- Checks 2, 5, 8, 10, 11, 12, 13, 15, 17 and 21 are positive controls; 6 and 20
-- refuse self-approval to a non-approver and to an approver.
--
-- Actors, picked from live data: four approved members with no staff role
-- (A requests, B is granted signout.approve, C runs an FLL session, D is a
-- second requester), and one staff member S.
-- ============================================================

begin;

do $applied$
begin
  if to_regclass('public.signout_requests') is null
     or to_regclass('public.meeting_checkins') is null
     or to_regprocedure('public.approve_signout(uuid)') is null then
    raise exception 'Cannot test: 0014_session_signout.sql has not been applied';
  end if;
end
$applied$;

create temp table t0014_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0014_fx (a uuid, b uuid, c uuid, d uuid, s uuid,
  ev_now uuid default gen_random_uuid(), ev_late uuid default gen_random_uuid(),
  ev_build uuid default gen_random_uuid(), ev_past uuid default gen_random_uuid()) on commit drop;

with ns as (
  select p.id, row_number() over (order by p.id) as rn from public.profiles p
   where p.approved and not exists (select 1 from public.member_roles r
                                     where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
)
insert into t0014_fx (a, b, c, d, s)
select (select id from ns where rn = 1), (select id from ns where rn = 2),
       (select id from ns where rn = 3), (select id from ns where rn = 4),
       (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead', 'admin') order by r.member_id limit 1);

do $pre$
declare f t0014_fx;
begin
  select * into f from t0014_fx;
  if f.d is null then raise exception 'Cannot test: need four approved members with no staff role'; end if;
  if f.s is null then raise exception 'Cannot test: no staff member'; end if;
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
  return v;
end
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text) returns void language sql as $fn$
  insert into t0014_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

do $checks$
declare
  f t0014_fx;
  r text; v text; req uuid; req_d uuid;
begin
  select * into f from t0014_fx;

  -- Fixtures, as the table owner: A and D signed in on build, C on FLL, S on build.
  insert into public.attendance_events (user_id, type, event_time, location, method, category)
  values (f.a, 'in', now() - interval '2 hours', 'test', 'nfc', 'build'),
         (f.d, 'in', now() - interval '2 hours', 'test', 'nfc', 'build'),
         (f.c, 'in', now() - interval '2 hours', 'test', 'nfc', 'volunteer'),
         (f.s, 'in', now() - interval '2 hours', 'test', 'nfc', 'build');
  insert into public.events (id, title, kind, starts_at, ends_at) values
    (f.ev_now,   't0014 meeting now',  'meeting', now() - interval '5 minutes',  now() + interval '1 hour'),
    (f.ev_late,  't0014 meeting late', 'meeting', now() - interval '30 minutes', now() + interval '1 hour'),
    (f.ev_build, 't0014 build',        'build',   now() - interval '5 minutes',  now() + interval '1 hour'),
    (f.ev_past,  't0014 meeting past', 'meeting', now() - interval '3 hours',    now() - interval '2 hours');

  -- 1 structure
  select string_agg(x, ',' order by x) into v from (
    select 'rls_sr' as x from pg_class where oid = 'public.signout_requests'::regclass and relrowsecurity
    union all select 'rls_mc' from pg_class where oid = 'public.meeting_checkins'::regclass and relrowsecurity
    union all select 'guard' from pg_trigger where tgname = 'attendance_events_self_out' and not tgisinternal
    union all select 'one_pending' from pg_indexes where indexname = 'signout_requests_one_pending_idx'
  ) s;
  perform pg_temp.rec(1, 'structure: RLS on both tables, the OUT guard, one pending per member', v = 'guard,one_pending,rls_mc,rls_sr', coalesce(v, 'none'));

  -- 2 POSITIVE: A asks to sign out
  r := pg_temp.run_as(f.a, $q$select public.request_signout('Wired the drive base', true, 'shop', 'nfc')$q$);
  select id into req from public.signout_requests where member_id = f.a and status = 'pending';
  perform pg_temp.rec(2, 'student requests a sign-out with a note (positive control)', r = 'ok:1' and req is not null, r);

  -- 3 no direct writes to the request table
  r := pg_temp.run_as(f.b, format('insert into public.signout_requests (member_id, note) values (%L, %L)', f.b, 'skip the line'));
  perform pg_temp.rec(3, 'student cannot insert a request row directly, loud', r = 'err:42501', r);

  -- 4 A cannot just write their own OUT on a build session
  r := pg_temp.run_as(f.a, format('insert into public.attendance_events (user_id, type, location, method) values (%L, %L, %L, %L)', f.a, 'out', 'shop', 'nfc'));
  perform pg_temp.rec(4, 'student cannot write their own OUT on a build session, loud', r = 'err:42501', r);

  -- 5 POSITIVE: C closes an FLL session directly, with a note
  r := pg_temp.run_as(f.c, format('insert into public.attendance_events (user_id, type, location, method, note) values (%L, %L, %L, %L, %L)', f.c, 'out', 'fll', 'nfc', 'Helped team 2 with attachments'));
  perform pg_temp.rec(5, 'student closes an FLL session directly with a note (positive control)', r = 'ok:1', r);

  -- 6 A cannot approve their own
  r := pg_temp.run_as(f.a, format('select public.approve_signout(%L)', req));
  perform pg_temp.rec(6, 'student cannot approve their own sign-out, loud', r = 'err:42501', r);

  -- 7 B without the capability cannot approve A
  r := pg_temp.run_as(f.b, format('select public.approve_signout(%L)', req));
  perform pg_temp.rec(7, 'student without signout.approve cannot approve another, loud', r = 'err:42501', r);

  -- 8 POSITIVE: A reads own; 9: B reads 0 of it
  v := pg_temp.val_as(f.a, format('select count(*) from public.signout_requests where id = %L', req));
  perform pg_temp.rec(8, 'student reads their own request (positive control)', v = '1', v);
  v := pg_temp.val_as(f.b, format('select count(*) from public.signout_requests where id = %L', req));
  perform pg_temp.rec(9, 'another student reads 0 of it', v = '0', v);

  -- 10 POSITIVE: staff reads and approves; the OUT lands with the note
  v := pg_temp.val_as(f.s, format('select status from public.approve_signout(%L)', req));
  select count(*)::text into r from public.attendance_events
   where user_id = f.a and type = 'out' and note = 'Wired the drive base' and cleanup_confirmed;
  perform pg_temp.rec(10, 'staff approves: request approved and the OUT carries the note (positive control)', v = 'approved' and r = '1', v || ' / out rows ' || r);

  -- 11 POSITIVE: B granted signout.approve approves D
  insert into public.member_permissions (member_id, capability, granted_by) values (f.b, 'signout.approve', f.s);
  r := pg_temp.run_as(f.d, $q$select public.request_signout('Cut gussets', false, 'shop', 'button')$q$);
  select id into req_d from public.signout_requests where member_id = f.d and status = 'pending';
  v := pg_temp.val_as(f.b, format('select status from public.approve_signout(%L)', req_d));
  perform pg_temp.rec(11, 'a student granted signout.approve approves another (positive control)', v = 'approved', r || ' / ' || v);

  -- 12 POSITIVE: a sent-back request is marked returned with the reason
  insert into public.attendance_events (user_id, type, event_time, location, method, category)
  values (f.d, 'in', now() + interval '1 second', 'test', 'nfc', 'build');
  -- now() is the transaction start, so this IN is the newest event for D.
  r := pg_temp.run_as(f.d, $q$select public.request_signout('Second try', false, 'shop', 'nfc')$q$);
  select id into req_d from public.signout_requests where member_id = f.d and status = 'pending';
  v := pg_temp.val_as(f.s, format('select status || '':'' || reason from public.return_signout(%L, %L)', req_d, 'Clean the bench'));
  perform pg_temp.rec(12, 'staff sends a request back with a reason (positive control)', v = 'returned:Clean the bench', v);

  -- 13 POSITIVE: staff close their own session directly
  r := pg_temp.run_as(f.s, format('insert into public.attendance_events (user_id, type, location, method) values (%L, %L, %L, %L)', f.s, 'out', 'shop', 'nfc'));
  perform pg_temp.rec(13, 'staff close their own build session directly (positive control)', r = 'ok:1', r);

  -- 14 a request with no open session is refused
  r := pg_temp.run_as(f.c, $q$select public.request_signout('Nothing open', false, 'shop', 'nfc')$q$);
  perform pg_temp.rec(14, 'a request with no open session is refused', r = 'err:P0002', r);

  -- 15 POSITIVE: meeting check-in present then late
  v := pg_temp.val_as(f.a, format('select status from public.meeting_checkin(%L)', f.ev_now));
  r := pg_temp.val_as(f.a, format('select status from public.meeting_checkin(%L)', f.ev_late));
  perform pg_temp.rec(15, 'meeting check-in reads present in the first 15 minutes and late after (positive control)', v = 'present' and r = 'late', v || ' / ' || r);

  -- 16 refused for a build event and a meeting that is over
  v := pg_temp.val_as(f.a, format('select status from public.meeting_checkin(%L)', f.ev_build));
  r := pg_temp.val_as(f.a, format('select status from public.meeting_checkin(%L)', f.ev_past));
  perform pg_temp.rec(16, 'meeting check-in refused on a build event and after the meeting', v = 'err:P0002' and r = 'err:22023', v || ' / ' || r);

  -- 17 POSITIVE and negative: own check-ins readable, others not, no direct writes
  v := pg_temp.val_as(f.a, format('select count(*) from public.meeting_checkins where member_id = %L', f.a));
  r := pg_temp.val_as(f.b, format('select count(*) from public.meeting_checkins where member_id = %L', f.a));
  perform pg_temp.rec(17, 'student reads own meeting check-ins (2), another student reads 0', v = '2' and r = '0', v || ' / ' || r);
  r := pg_temp.run_as(f.b, format('insert into public.meeting_checkins (event_id, member_id, status) values (%L, %L, %L)', f.ev_past, f.b, 'present'));
  perform pg_temp.rec(18, 'student cannot write a meeting check-in directly, loud', r = 'err:42501', r);

  -- 20 an approver (B, granted in 11) still cannot approve their own
  insert into public.attendance_events (user_id, type, event_time, location, method, category)
  values (f.b, 'in', now() - interval '2 hours', 'test', 'nfc', 'build');
  r := pg_temp.run_as(f.b, $q$select public.request_signout('Own one', false, 'shop', 'nfc')$q$);
  v := pg_temp.run_as(f.b, format('select public.approve_signout(id) from public.signout_requests where member_id = %L and status = %L', f.b, 'pending'));
  perform pg_temp.rec(20, 'an approver cannot approve their own sign-out, loud', r = 'ok:1' and v = 'err:42501', r || ' / ' || v);

  -- 21 POSITIVE: switch to FLL closes the build session and opens a volunteer one
  r := pg_temp.run_as(f.d, $q$select public.switch_to_fll('fll-room', true, null)$q$);
  select type || ':' || coalesce(category, '') into v from public.attendance_events
   where user_id = f.d order by event_time desc limit 1;
  perform pg_temp.rec(21, 'switch to FLL writes the build OUT and a volunteer IN (positive control)', r = 'ok:1' and v = 'in:volunteer', r || ' / ' || v);

  -- 22 switching with no build session open is refused
  r := pg_temp.run_as(f.d, $q$select public.switch_to_fll('fll-room', true, null)$q$);
  perform pg_temp.rec(22, 'switch to FLL refused with no build session open', r = 'err:P0002', r);

  -- 23 the switch leaves no way round the guard behind it
  r := pg_temp.run_as(f.b, format('insert into public.attendance_events (user_id, type, location, method) values (%L, %L, %L, %L)', f.b, 'out', 'shop', 'nfc'));
  perform pg_temp.rec(23, 'after a switch, a build session still cannot be closed directly, loud', r = 'err:42501', r);

  -- 19 anon
  v := pg_temp.val_as(null, 'select count(*) from public.signout_requests');
  perform pg_temp.rec(19, 'anon cannot read sign-out requests, loud', v = 'err:42501', v);
end
$checks$;

select n, check_name, result, detail from (
  select n, check_name, result, detail from t0014_results
  union all
  select 999, 'summary',
         case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
         format('%s pass, %s fail, %s skip', count(*) filter (where result = 'PASS'),
                count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
    from t0014_results
) all_rows order by n;

rollback;
