-- ============================================================
-- 0032_connector_team_reads test. Run AFTER 0032. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; nothing it writes persists.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Actors: an admin A, a mentor M, students S1 and S2, a parent-only account P,
-- signed out.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.team_attendance_summary(date)') is null
     or to_regprocedure('public.admin_set_member_status_bulk(uuid[], text, text)') is null then
    raise exception 'Cannot test: 0032_connector_team_reads.sql has not been applied';
  end if;
end
$applied$;

create temp table t32_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t32_fx (a uuid, m uuid, s1 uuid, s2 uuid, p uuid, h0 numeric, hs0 numeric, c0 int) on commit drop;
grant all on t32_fx, t32_results to anon, authenticated, service_role;

with st as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
     and coalesce(p.status, 'active') = 'active'
)
insert into t32_fx (a, m, s1, s2, p)
select (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'mentor'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin')
         order by r.member_id limit 1),
       (select id from st where rn = 1), (select id from st where rn = 2),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('student', 'mentor', 'lead', 'admin'))
         order by r.member_id limit 1);

do $pre$
declare f t32_fx;
begin
  select * into f from t32_fx;
  if f.a is null or f.m is null or f.s2 is null or f.p is null then
    raise exception 'Cannot test: need an admin, a mentor, two active students and a parent-only account';
  end if;
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
create function pg_temp.rec(n int, name text, ok boolean, detail text) returns void language sql as $fn$
  insert into t32_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
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

-- The baseline for S2, read as the admin before any fixture lands.
do $c$
declare f t32_fx;
begin
  select * into f from t32_fx;
  update t32_fx set
    h0  = pg_temp.call_as(f.a, format('select hours_total::text from public.team_attendance_summary() where member_id = %L', f.s2))::numeric,
    hs0 = pg_temp.call_as(f.a, format('select hours_since::text from public.team_attendance_summary(current_date - 15) where member_id = %L', f.s2))::numeric,
    c0  = pg_temp.call_as(f.a, format('select check_ins::text from public.team_attendance_summary() where member_id = %L', f.s2))::int;
end
$c$;

-- Fixtures: S2 one 3-hour build session 10 days ago, one FLL (volunteer)
-- session 9 days ago, a verified 2-hour log and a pending 5-hour one, a last
-- sign-in; an approved email that never made an account.
do $fx$
declare f t32_fx; t0 timestamptz := date_trunc('hour', now()) - interval '10 days';
begin
  select * into f from t32_fx;
  insert into public.attendance_events (user_id, type, event_time, category) values
    (f.s2, 'in', t0, 'build'), (f.s2, 'out', t0 + interval '3 hours', 'build'),
    (f.s2, 'in', t0 + interval '1 day', 'volunteer'), (f.s2, 'out', t0 + interval '1 day 2 hours', 'volunteer');
  insert into public.logged_hours (member_id, date, hours, type, status) values
    (f.s2, current_date - 3, 2, 'outreach', 'verified'), (f.s2, current_date - 2, 5, 'outreach', 'pending');
  update auth.users set last_sign_in_at = now() - interval '1 hour' where id = f.s2;
  insert into public.approved_emails (email, granted_role) values ('t32.ghost@boscotech.edu', 'student');
end
$fx$;

-- 1. The admin reads one row per profile plus the accountless email.
do $c$
declare f t32_fx; v text; want int;
begin
  select * into f from t32_fx;
  select count(*) + (select count(*) from public.approved_emails ae where not exists (select 1 from auth.users u where lower(u.email) = ae.email))
    into want from public.profiles;
  v := pg_temp.call_as(f.a, 'select count(*)::text from public.team_attendance_summary()');
  perform pg_temp.rec(1, 'admin reads every profile and every accountless approved email', v = want::text, format('%s rows, want %s', v, want));
end
$c$;

-- 2. A mentor reads it too (staff).
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.m, 'select count(*)::text from public.team_attendance_summary()');
  perform pg_temp.rec(2, 'a mentor reads the team', v ~ '^[0-9]+$' and v::int > 5, v);
end
$c$;

-- 3. A student is refused.
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.s1, 'select count(*)::text from public.team_attendance_summary()');
  perform pg_temp.rec(3, 'a student is refused', v like 'err:42501:%', v);
end
$c$;

-- 4. A parent-only account is refused.
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.p, 'select count(*)::text from public.team_attendance_summary()');
  perform pg_temp.rec(4, 'a parent-only account is refused', v like 'err:42501:%', v);
end
$c$;

-- 5. Signed out cannot execute it at all.
do $c$
declare v text;
begin
  v := pg_temp.call_as(null, 'select count(*)::text from public.team_attendance_summary()');
  perform pg_temp.rec(5, 'signed out cannot execute', v like 'err:42501:%', v);
end
$c$;

-- 6. Hours: the build session counts, the FLL one does not, and the number is _member_hours exactly.
do $c$
declare f t32_fx; v text; mh numeric;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select hours_total::text from public.team_attendance_summary() where member_id = %L', f.s2));
  mh := public._member_hours(f.s2, timestamptz '2000-01-01 00:00+00', now());
  perform pg_temp.rec(6, 'hours_total is _member_hours: +3 build, FLL excluded',
    v::numeric = f.h0 + 3 and v::numeric = mh, format('%s, before %s, _member_hours %s', v, f.h0, mh));
end
$c$;

-- 7. Since: a window that starts after the session leaves it out; one before takes it in.
do $c$
declare f t32_fx; late text; early text; nolate text;
begin
  select * into f from t32_fx;
  late := pg_temp.call_as(f.a, format('select hours_since || ''/'' || check_ins_since from public.team_attendance_summary(current_date - 5) where member_id = %L', f.s2));
  early := pg_temp.call_as(f.a, format('select hours_since::text from public.team_attendance_summary(current_date - 15) where member_id = %L', f.s2));
  nolate := pg_temp.call_as(f.a, format('select coalesce(hours_since::text, ''null'') from public.team_attendance_summary() where member_id = %L', f.s2));
  perform pg_temp.rec(7, 'since: after the session 0, before it +3, no date null',
    split_part(late, '/', 1)::numeric = 0 and split_part(late, '/', 2) = '0' and early::numeric = f.hs0 + 3 and nolate = 'null',
    format('after %s, before %s (was %s), none %s', late, early, f.hs0, nolate));
end
$c$;

-- 8. Check-ins count both INs; the last check-in is the FLL one, the first is set.
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select check_ins || ''/'' || (last_check_in is not null) || ''/'' || (first_check_in is not null) from public.team_attendance_summary() where member_id = %L', f.s2));
  perform pg_temp.rec(8, 'check-ins counted, first and last set', v = (f.c0 + 2)::text || '/true/true', v);
end
$c$;

-- 9. Verified logged hours only.
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select logged_hours_verified::text from public.team_attendance_summary() where member_id = %L', f.s2));
  perform pg_temp.rec(9, 'logged hours: the verified 2, not the pending 5', v::numeric >= 2 and v::numeric < 7
    and v::numeric = (select sum(hours) from public.logged_hours where member_id = f.s2 and status = 'verified'), v);
end
$c$;

-- 10. Email is the auth.users email; last sign-in is read.
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select email || ''/'' || (last_sign_in is not null) from public.team_attendance_summary() where member_id = %L', f.s2));
  perform pg_temp.rec(10, 'email from auth.users, last sign-in read', v = (select email from auth.users where id = f.s2) || '/true', v);
end
$c$;

-- 11. Parent marked parent-only; a student is not.
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select string_agg(is_parent_only::text, ''/'' order by (member_id = %L) desc) from public.team_attendance_summary() where member_id in (%L, %L)', f.p, f.p, f.s2));
  perform pg_temp.rec(11, 'parent-only marked true, student false', v = 'true/false', v);
end
$c$;

-- 12. The accountless email is a row, marked, with no member id.
do $c$
declare f t32_fx; v text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, 'select coalesce(member_id::text, ''none'') || ''/'' || has_account || ''/'' || hours_total from public.team_attendance_summary() where email = ''t32.ghost@boscotech.edu''');
  perform pg_temp.rec(12, 'accountless approved email: no id, has_account false, 0 hours', v = 'none/false/0', v);
end
$c$;

-- 13. This season application: present for a student who applied, absent for one who did not.
do $c$
declare f t32_fx; v text; with_app uuid; without_app uuid;
begin
  select * into f from t32_fx;
  select ma.member_id into with_app from public.member_applications ma order by ma.member_id limit 1;
  select p.id into without_app from public.profiles p
   where not exists (select 1 from public.member_applications ma where ma.member_id = p.id) order by p.id limit 1;
  v := pg_temp.call_as(f.a, format('select string_agg(has_season_application::text, ''/'' order by (member_id = %L) desc) from public.team_attendance_summary() where member_id in (%L, %L)', with_app, with_app, without_app));
  perform pg_temp.rec(13, 'season application: true for an applicant, false otherwise', v = 'true/false', v);
end
$c$;

-- 14. Bulk status: a mentor and a student are refused and nothing changes.
do $c$
declare f t32_fx; vm text; vs text; n int;
begin
  select * into f from t32_fx;
  vm := pg_temp.call_as(f.m, format('select public.admin_set_member_status_bulk(array[%L, %L]::uuid[], ''inactive'', ''never came'')::text', f.s1, f.s2));
  vs := pg_temp.call_as(f.s1, format('select public.admin_set_member_status_bulk(array[%L]::uuid[], ''inactive'', ''never came'')::text', f.s2));
  select count(*) into n from public.profiles where id in (f.s1, f.s2) and status = 'inactive';
  perform pg_temp.rec(14, 'bulk status: mentor and student refused, nothing changed',
    vm like 'err:42501:%' and vs like 'err:42501:%' and n = 0, format('mentor %s; student %s; changed %s', vm, vs, n));
end
$c$;

-- 15. The admin marks two inactive: both change, two log rows with the reason.
do $c$
declare f t32_fx; v text; n int; logs int;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select (public.admin_set_member_status_bulk(array[%L, %L]::uuid[], ''inactive'', ''never came'') ->> ''changed_count'')', f.s1, f.s2));
  select count(*) into n from public.profiles where id in (f.s1, f.s2) and status = 'inactive';
  select count(*) into logs from public.member_admin_log where member_id in (f.s1, f.s2) and action = 'set_status' and reason = 'never came' and actor_id = f.a;
  perform pg_temp.rec(15, 'admin: two changed, two set_status log rows', v = '2' and n = 2 and logs = 2, format('changed %s, inactive %s, logs %s', v, n, logs));
end
$c$;

-- 16. Again: already so, nothing changes, no new log row.
do $c$
declare f t32_fx; v text; logs int;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select (r ->> ''changed_count'') || ''/'' || jsonb_array_length(r -> ''unchanged'') from public.admin_set_member_status_bulk(array[%L]::uuid[], ''inactive'', ''never came'') r', f.s1));
  select count(*) into logs from public.member_admin_log where member_id = f.s1 and action = 'set_status';
  perform pg_temp.rec(16, 'already inactive: 0 changed, 1 unchanged, no new log', v = '0/1' and logs = 1, format('%s, logs %s', v, logs));
end
$c$;

-- 17. Refusals: own account, an unknown status, a blank reason; an unknown id is reported.
do $c$
declare f t32_fx; own text; bad text; blank text; ghost text;
begin
  select * into f from t32_fx;
  own := pg_temp.call_as(f.a, format('select public.admin_set_member_status_bulk(array[%L, %L]::uuid[], ''inactive'', ''x'')::text', f.a, f.s2));
  bad := pg_temp.call_as(f.a, format('select public.admin_set_member_status_bulk(array[%L]::uuid[], ''deleted'', ''x'')::text', f.s2));
  blank := pg_temp.call_as(f.a, format('select public.admin_set_member_status_bulk(array[%L]::uuid[], ''active'', ''  '')::text', f.s2));
  ghost := pg_temp.call_as(f.a, 'select jsonb_array_length(public.admin_set_member_status_bulk(array[''00000000-0000-0000-0000-00000000dead'']::uuid[], ''active'', ''x'') -> ''not_found'')::text');
  perform pg_temp.rec(17, 'own account, bad status, blank reason refused; unknown id reported',
    own like 'err:22023:%' and bad like 'err:22023:%' and blank like 'err:22023:%' and ghost = '1',
    format('own %s; bad %s; blank %s; ghost %s', left(own, 60), left(bad, 60), left(blank, 60), ghost));
end
$c$;

-- 18. Back to active works (the positive direction of 14) and the log is admin-only to read.
do $c$
declare f t32_fx; v text; slog text;
begin
  select * into f from t32_fx;
  v := pg_temp.call_as(f.a, format('select (public.admin_set_member_status_bulk(array[%L]::uuid[], ''active'', ''came back'') ->> ''changed_count'')', f.s2));
  slog := pg_temp.call_as(f.s1, format('select count(*)::text from public.member_admin_log where member_id = %L', f.s2));
  perform pg_temp.rec(18, 'reactivate works; a student reads no log rows',
    v = '1' and (select status from public.profiles where id = f.s2) = 'active' and slog = '0', format('changed %s, student log rows %s', v, slog));
end
$c$;

-- 19. Grants: both entry points signed-in only, SECURITY DEFINER, search_path pinned.
do $c$
declare n int; bad text;
begin
  with want(sig) as (values
    ('public.team_attendance_summary(date)'),
    ('public.admin_set_member_status_bulk(uuid[],text,text)'))
  select count(p.oid), string_agg(w.sig, ', ') filter (where p.oid is null or not p.prosecdef
           or has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute')
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(19, 'grants: two entry points signed-in only, definer, search_path pinned',
    n = 2 and bad is null, format('%s of 2 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t32_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t32_results
order by 1;

rollback;
