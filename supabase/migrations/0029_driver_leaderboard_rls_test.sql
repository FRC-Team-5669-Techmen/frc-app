-- ============================================================
-- 0029_driver_leaderboard test. Run AFTER 0029. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; the sessions and ratings it makes never
-- persist. ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Actors: students A and B, a mentor M, a parent-only account P, signed out.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.driver_log_session(uuid, date, integer, text, integer, text)') is null then
    raise exception 'Cannot test: 0029_driver_leaderboard.sql has not been applied';
  end if;
end
$applied$;

create temp table t29_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t29_fx (a uuid, b uuid, m uuid, p uuid, s_a uuid, s_b uuid, base_n int) on commit drop;
grant all on t29_fx, t29_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
)
insert into t29_fx (a, b, m, p, base_n)
select (select id from ns where rn = 1), (select id from ns where rn = 2),
       (select r.member_id from public.member_roles r join public.profiles pp on pp.id = r.member_id
         where r.role = 'mentor' and pp.approved and coalesce(pp.status, 'active') = 'active' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('student', 'mentor', 'lead', 'admin'))
         order by r.member_id limit 1),
       (select count(*) from public.drive_sessions);

do $pre$
declare f t29_fx;
begin
  select * into f from t29_fx;
  if f.b is null or f.m is null or f.p is null then raise exception 'Cannot test: need two students, a mentor and a parent-only account'; end if;
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
  insert into t29_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
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

-- 1-4. Logging: a student logs their own (positive control); not for another
-- student; a mentor logs for anyone; parent-only and signed out cannot.
do $c$
declare f t29_fx; r text; rx text; rm text; rp text; ra text;
begin
  select * into f from t29_fx;
  r := pg_temp.call_as(f.a, $q$select public.driver_log_session(null, current_date, 25, 'practice_field', null, 'figure eights')::text$q$);
  update t29_fx set s_a = (r::jsonb ->> 'id')::uuid where r like '{%';
  perform pg_temp.rec(1, 'a student logs their own session, attributed to them and logged by them',
    r like '{%' and (select member_id = f.a and logged_by = f.a and minutes = 25 from public.drive_sessions where id = (r::jsonb ->> 'id')::uuid), left(r, 80));
  rx := pg_temp.call_as(f.a, format($q$select public.driver_log_session(%L::uuid, current_date, 30, 'match')::text$q$, f.b));
  perform pg_temp.rec(2, 'a student cannot log for another student; B has 0 sessions',
    rx like 'err:42501:%' and not exists (select 1 from public.drive_sessions where member_id = f.b), left(rx, 60));
  rm := pg_temp.call_as(f.m, format($q$select public.driver_log_session(%L::uuid, current_date, 40, 'mosim', 1520, null)::text$q$, f.b));
  update t29_fx set s_b = (rm::jsonb ->> 'id')::uuid where rm like '{%';
  perform pg_temp.rec(3, 'a mentor logs a MoSim session for B, logged by the mentor',
    rm like '{%' and (select member_id = f.b and logged_by = f.m and sim_score = 1520 from public.drive_sessions where id = (rm::jsonb ->> 'id')::uuid), left(rm, 80));
  rp := pg_temp.call_as(f.p, $q$select public.driver_log_session(null, current_date, 10, 'test')::text$q$);
  ra := pg_temp.call_as(null, $q$select public.driver_log_session(null, current_date, 10, 'test')::text$q$);
  perform pg_temp.rec(4, 'a parent-only account and signed out cannot log; still 2 new sessions',
    rp like 'err:42501:%' and ra like 'err:42501:%' and (select count(*) from public.drive_sessions) = f.base_n + 2, format('parent %s; anon %s', left(rp, 40), left(ra, 40)));
end
$c$;

-- 5. Reading sessions: students and staff read; parent-only and signed out read nothing.
do $c$
declare f t29_fx; ns text; nm text; np text; na text; want text;
begin
  select * into f from t29_fx;
  want := (f.base_n + 2)::text;
  ns := pg_temp.call_as(f.b, $q$select count(*)::text from public.drive_sessions$q$);
  nm := pg_temp.call_as(f.m, $q$select count(*)::text from public.drive_sessions$q$);
  np := pg_temp.call_as(f.p, $q$select count(*)::text from public.drive_sessions$q$);
  na := pg_temp.call_as(null, $q$select count(*)::text from public.drive_sessions$q$);
  perform pg_temp.rec(5, 'student B and the mentor read every session; parent-only and signed out read 0',
    ns = want and nm = want and np = '0' and (na = '0' or na like 'err:42501:%'), format('student %s, mentor %s, parent %s, anon %s (want %s)', ns, nm, np, left(na, 20), want));
end
$c$;

-- 6. Editing: staff only.
do $c$
declare f t29_fx; rs text; rm text;
begin
  select * into f from t29_fx;
  rs := pg_temp.call_as(f.a, format($q$select public.driver_edit_session(%L::uuid, current_date, 300, 'practice_field')::text$q$, f.s_a));
  rm := pg_temp.call_as(f.m, format($q$select public.driver_edit_session(%L::uuid, current_date, 35, 'practice_field', null, 'corrected')::text$q$, f.s_a));
  perform pg_temp.rec(6, 'the student cannot edit even their own session; the mentor can',
    rs like 'err:42501:%' and rm like '{%' and (select minutes from public.drive_sessions where id = f.s_a) = 35, format('student %s; mentor %s', left(rs, 40), left(rm, 30)));
end
$c$;

-- 7-8. Voiding: the driver within 24 hours (positive control), not another
-- student, not the driver after 24 hours, staff any time.
do $c$
declare f t29_fx; r2 text; s2 uuid; rb text; ra text; rold text; rm text;
begin
  select * into f from t29_fx;
  r2 := pg_temp.call_as(f.a, $q$select public.driver_log_session(null, current_date, 15, 'test')::text$q$);
  s2 := (r2::jsonb ->> 'id')::uuid;
  rb := pg_temp.call_as(f.b, format($q$select public.driver_void_drive(%L::uuid, 'not mine')::text$q$, s2));
  ra := pg_temp.call_as(f.a, format($q$select public.driver_void_drive(%L::uuid, 'typo')::text$q$, s2));
  perform pg_temp.rec(7, 'another student cannot void A session; A voids their own within 24 hours',
    rb like 'err:42501:%' and ra like '{%' and (select voided_by = f.a and void_reason = 'typo' from public.drive_sessions where id = s2), format('other %s; own %s', left(rb, 40), left(ra, 30)));
  update public.drive_sessions set created_at = now() - interval '25 hours' where id = f.s_a;
  rold := pg_temp.call_as(f.a, format($q$select public.driver_void_drive(%L::uuid)::text$q$, f.s_a));
  rm := pg_temp.call_as(f.m, format($q$select public.driver_void_drive(%L::uuid, 'duplicate')::text$q$, f.s_a));
  perform pg_temp.rec(8, 'after 24 hours the driver cannot void it; the mentor can',
    rold like 'err:42501:%' and rm like '{%' and (select voided_by from public.drive_sessions where id = f.s_a) = f.m, format('driver %s; mentor %s', left(rold, 40), left(rm, 30)));
end
$c$;

-- 9-10. Rating: staff only, never themselves, only a member who can drive.
do $c$
declare f t29_fx; rs text; rm text; rself text; rp text;
begin
  select * into f from t29_fx;
  rs := pg_temp.call_as(f.b, format($q$select public.driver_rate(%L::uuid, 5, 5, 5, 5, 5, 'from a friend')::text$q$, f.a));
  rm := pg_temp.call_as(f.m, format($q$select public.driver_rate(%L::uuid, 4, 3, null, 2, 4, 'Smooth, watch the wall')::text$q$, f.a));
  perform pg_temp.rec(9, 'a student cannot rate; the mentor rates A, criteria stored with defense not seen as NULL',
    rs like 'err:42501:%' and rm like '{%' and (select count(*) from public.driver_ratings where driver_id = f.a) = 1
    and (select scoring is null and control = 4 and coach_id = f.m from public.driver_ratings where driver_id = f.a), format('student %s; mentor %s', left(rs, 40), left(rm, 30)));
  rself := pg_temp.call_as(f.m, format($q$select public.driver_rate(%L::uuid, 5)::text$q$, f.m));
  rp := pg_temp.call_as(f.m, format($q$select public.driver_rate(%L::uuid, 3)::text$q$, f.p));
  perform pg_temp.rec(10, 'the mentor cannot rate themselves or a parent-only account; still 1 rating',
    rself like 'err:22023:%' and rp like 'err:22023:%' and (select count(*) from public.driver_ratings where driver_id in (f.m, f.p)) = 0, format('self %s; parent %s', left(rself, 40), left(rp, 40)));
end
$c$;

-- 11-12. Who reads a rating note: staff and the driver; not another student,
-- not a parent. The scores without notes are for every eligible member.
do $c$
declare f t29_fx; na text; nb text; nm text; np text; sb text; sp text; sa text; cols text;
begin
  select * into f from t29_fx;
  na := pg_temp.call_as(f.a, $q$select count(*)::text from public.driver_ratings where note is not null$q$);
  nb := pg_temp.call_as(f.b, $q$select count(*)::text from public.driver_ratings$q$);
  nm := pg_temp.call_as(f.m, format($q$select count(*)::text from public.driver_ratings where driver_id = %L$q$, f.a));
  np := pg_temp.call_as(f.p, $q$select count(*)::text from public.driver_ratings$q$);
  perform pg_temp.rec(11, 'the rated driver and the mentor read the rating with its note; student B and the parent read 0',
    na = '1' and nm = '1' and nb = '0' and np = '0', format('driver %s, mentor %s, other student %s, parent %s', na, nm, nb, np));
  sb := pg_temp.call_as(f.b, format($q$select count(*)::text from public.driver_rating_scores() where driver_id = %L$q$, f.a));
  sp := pg_temp.call_as(f.p, $q$select count(*)::text from public.driver_rating_scores()$q$);
  sa := pg_temp.call_as(null, $q$select count(*)::text from public.driver_rating_scores()$q$);
  select string_agg(a, ',') into cols from (select unnest(proargnames) a from pg_proc where oid = 'public.driver_rating_scores()'::regprocedure) x;
  perform pg_temp.rec(12, 'student B reads A score row (1) through driver_rating_scores, which carries no note; parent and signed out are refused',
    sb = '1' and sp like 'err:42501:%' and sa like 'err:42501:%' and cols not like '%note%', format('B %s, parent %s, anon %s, cols %s', sb, left(sp, 20), left(sa, 20), cols));
end
$c$;

-- 13-14. The tables are closed to direct writes, for students and staff alike.
do $c$
declare f t29_fx; i text; u text; d text; um text; ir text;
begin
  select * into f from t29_fx;
  i := pg_temp.call_as(f.a, format($q$insert into public.drive_sessions (member_id, session_date, minutes, kind) values (%L, current_date, 500, 'match') returning id::text$q$, f.a));
  u := pg_temp.call_as(f.a, format($q$update public.drive_sessions set minutes = 600 where id = %L returning id::text$q$, f.s_b));
  d := pg_temp.call_as(f.a, format($q$delete from public.drive_sessions where id = %L returning id::text$q$, f.s_b));
  ir := pg_temp.call_as(f.b, format($q$insert into public.driver_ratings (driver_id, coach_id, control) values (%L, %L, 5) returning id::text$q$, f.b, f.m));
  perform pg_temp.rec(13, 'no direct insert, update or delete on sessions, and no direct rating insert, for a student',
    i like 'err:42501:%' and u like 'err:42501:%' and d like 'err:42501:%' and ir like 'err:42501:%', format('%s | %s | %s | %s', left(i, 25), left(u, 25), left(d, 25), left(ir, 25)));
  um := pg_temp.call_as(f.m, format($q$update public.drive_sessions set minutes = 600 where id = %L returning id::text$q$, f.s_b));
  perform pg_temp.rec(14, 'no direct update for a mentor either; B session is still 40 minutes',
    um like 'err:42501:%' and (select minutes from public.drive_sessions where id = f.s_b) = 40, left(um, 40));
end
$c$;

-- 15-16. Validation, and the 60-day window for students (staff may log older).
do $c$
declare f t29_fx; sc text; z text; old_s text; old_m text;
begin
  select * into f from t29_fx;
  sc := pg_temp.call_as(f.a, $q$select public.driver_log_session(null, current_date, 20, 'match', 900)::text$q$);
  z := pg_temp.call_as(f.a, $q$select public.driver_log_session(null, current_date, 0, 'match')::text$q$);
  perform pg_temp.rec(15, 'a score on a real-robot session and zero minutes are refused',
    sc like 'err:22023:%' and z like 'err:22023:%', format('%s; %s', left(sc, 40), left(z, 40)));
  old_s := pg_temp.call_as(f.a, $q$select public.driver_log_session(null, current_date - 90, 20, 'match')::text$q$);
  old_m := pg_temp.call_as(f.m, format($q$select public.driver_log_session(%L::uuid, current_date - 90, 20, 'match')::text$q$, f.a));
  perform pg_temp.rec(16, 'a student cannot log 90 days back; a mentor can log it for them',
    old_s like 'err:22023:%' and old_m like '{%', format('student %s; mentor %s', left(old_s, 40), left(old_m, 30)));
end
$c$;

-- 17. A parent role without a staff role excludes, even beside a student
-- role (the same rule as the battery log, 0026); a staff role brings access back.
do $c$
declare f t29_fx; nb text; lb text; nbs text;
begin
  select * into f from t29_fx;
  insert into public.member_roles (member_id, role) values (f.b, 'parent') on conflict do nothing;
  nb := pg_temp.call_as(f.b, $q$select count(*)::text from public.drive_sessions$q$);
  lb := pg_temp.call_as(f.b, $q$select public.driver_log_session(null, current_date, 10, 'test')::text$q$);
  insert into public.member_roles (member_id, role) values (f.b, 'mentor') on conflict do nothing;
  nbs := pg_temp.call_as(f.b, $q$select count(*)::text from public.drive_sessions$q$);
  delete from public.member_roles where member_id = f.b and role in ('parent', 'mentor');
  perform pg_temp.rec(17, 'student plus parent reads 0 and cannot log; adding a staff role reads them again',
    nb = '0' and lb like 'err:42501:%' and nbs::int > 0, format('student+parent %s, log %s; +mentor %s', nb, left(lb, 30), nbs));
end
$c$;

-- 18. Grants: the five entry points are signed-in only and SECURITY DEFINER with search_path pinned.
do $c$
declare n int; bad text;
begin
  with want(sig) as (values
    ('public.driver_rating_scores()'),
    ('public.driver_log_session(uuid,date,integer,text,integer,text)'),
    ('public.driver_edit_session(uuid,date,integer,text,integer,text)'),
    ('public.driver_void_drive(uuid,text)'),
    ('public.driver_rate(uuid,integer,integer,integer,integer,integer,text)'))
  select count(p.oid), string_agg(w.sig, ', ') filter (where p.oid is null or not p.prosecdef
           or has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute')
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(18, 'grants: five entry points signed-in only, definer, search_path pinned',
    n = 5 and bad is null, format('%s of 5 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t29_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t29_results
order by 1;

rollback;
