-- ============================================================
-- 0033_human_player_leaderboard test. Run AFTER 0033. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; the attempts it makes never
-- persist. ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Actors: students A and B, a mentor M, a parent-only account P, signed out.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.hp_log_attempt(uuid, date, text, integer, integer, integer, integer, text, text, text)') is null then
    raise exception 'Cannot test: 0033_human_player_leaderboard.sql has not been applied';
  end if;
end
$applied$;

create temp table t33_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t33_fx (a uuid, b uuid, m uuid, p uuid, s_a uuid, s_b uuid, base_n int) on commit drop;
grant all on t33_fx, t33_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
)
insert into t33_fx (a, b, m, p, base_n)
select (select id from ns where rn = 1), (select id from ns where rn = 2),
       (select r.member_id from public.member_roles r join public.profiles pp on pp.id = r.member_id
         where r.role = 'mentor' and pp.approved and coalesce(pp.status, 'active') = 'active' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('student', 'mentor', 'lead', 'admin'))
         order by r.member_id limit 1),
       (select count(*) from public.hp_attempts);

do $pre$
declare f t33_fx;
begin
  select * into f from t33_fx;
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
  insert into t33_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
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
declare f t33_fx; r text; rx text; rm text; rp text; ra text;
begin
  select * into f from t33_fx;
  r := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'accuracy', 15, 20, 0, null, null, null, 'from the outpost')::text$q$);
  update t33_fx set s_a = (r::jsonb ->> 'id')::uuid where r like '{%';
  perform pg_temp.rec(1, 'a student logs their own accuracy set, attributed to them and logged by them',
    r like '{%' and (select member_id = f.a and logged_by = f.a and made = 15 and attempted = 20 from public.hp_attempts where id = (r::jsonb ->> 'id')::uuid), left(r, 80));
  rx := pg_temp.call_as(f.a, format($q$select public.hp_log_attempt(%L::uuid, current_date, 'accuracy', 10, 20)::text$q$, f.b));
  perform pg_temp.rec(2, 'a student cannot log for another student; B has 0 attempts',
    rx like 'err:42501:%' and not exists (select 1 from public.hp_attempts where member_id = f.b), left(rx, 60));
  rm := pg_temp.call_as(f.m, format($q$select public.hp_log_attempt(%L::uuid, current_date, 'match', 30, 44, 6, 163, 'red', 'blue', null)::text$q$, f.b));
  update t33_fx set s_b = (rm::jsonb ->> 'id')::uuid where rm like '{%';
  perform pg_temp.rec(3, 'a mentor logs a match run for B, logged by the mentor, with made while inactive and the HUB order',
    rm like '{%' and (select member_id = f.b and logged_by = f.m and made = 30 and made_inactive = 6 and inactive_first = 'blue' from public.hp_attempts where id = (rm::jsonb ->> 'id')::uuid), left(rm, 80));
  rp := pg_temp.call_as(f.p, $q$select public.hp_log_attempt(null, current_date, 'accuracy', 5, 20)::text$q$);
  ra := pg_temp.call_as(null, $q$select public.hp_log_attempt(null, current_date, 'accuracy', 5, 20)::text$q$);
  perform pg_temp.rec(4, 'a parent-only account and signed out cannot log; still 2 new attempts',
    rp like 'err:42501:%' and ra like 'err:42501:%' and (select count(*) from public.hp_attempts) = f.base_n + 2, format('parent %s; anon %s', left(rp, 40), left(ra, 40)));
end
$c$;

-- 5. Reading: students and staff read; parent-only and signed out read nothing.
do $c$
declare f t33_fx; ns text; nm text; np text; na text; want text;
begin
  select * into f from t33_fx;
  want := (f.base_n + 2)::text;
  ns := pg_temp.call_as(f.b, $q$select count(*)::text from public.hp_attempts$q$);
  nm := pg_temp.call_as(f.m, $q$select count(*)::text from public.hp_attempts$q$);
  np := pg_temp.call_as(f.p, $q$select count(*)::text from public.hp_attempts$q$);
  na := pg_temp.call_as(null, $q$select count(*)::text from public.hp_attempts$q$);
  perform pg_temp.rec(5, 'student B and the mentor read every attempt; parent-only and signed out read 0',
    ns = want and nm = want and np = '0' and (na = '0' or na like 'err:42501:%'), format('student %s, mentor %s, parent %s, anon %s (want %s)', ns, nm, np, left(na, 20), want));
end
$c$;

-- 6. Editing: staff only.
do $c$
declare f t33_fx; rs text; rm text;
begin
  select * into f from t33_fx;
  rs := pg_temp.call_as(f.a, format($q$select public.hp_edit_attempt(%L::uuid, current_date, 20, 20)::text$q$, f.s_a));
  rm := pg_temp.call_as(f.m, format($q$select public.hp_edit_attempt(%L::uuid, current_date, 14, 20, 0, null, 'recounted')::text$q$, f.s_a));
  perform pg_temp.rec(6, 'the student cannot edit even their own attempt; the mentor can',
    rs like 'err:42501:%' and rm like '{%' and (select made from public.hp_attempts where id = f.s_a) = 14, format('student %s; mentor %s', left(rs, 40), left(rm, 30)));
end
$c$;

-- 7-8. Voiding: the player within 24 hours (positive control), not another
-- student, not the player after 24 hours, staff any time.
do $c$
declare f t33_fx; r2 text; s2 uuid; rb text; ra text; rold text; rm text;
begin
  select * into f from t33_fx;
  r2 := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'rate', 12, 18, 0, 30)::text$q$);
  s2 := (r2::jsonb ->> 'id')::uuid;
  rb := pg_temp.call_as(f.b, format($q$select public.hp_void_attempt(%L::uuid, 'not mine')::text$q$, s2));
  ra := pg_temp.call_as(f.a, format($q$select public.hp_void_attempt(%L::uuid, 'miscounted')::text$q$, s2));
  perform pg_temp.rec(7, 'another student cannot void A attempt; A voids their own within 24 hours',
    rb like 'err:42501:%' and ra like '{%' and (select voided_by = f.a and void_reason = 'miscounted' from public.hp_attempts where id = s2), format('other %s; own %s', left(rb, 40), left(ra, 30)));
  update public.hp_attempts set created_at = now() - interval '25 hours' where id = f.s_a;
  rold := pg_temp.call_as(f.a, format($q$select public.hp_void_attempt(%L::uuid)::text$q$, f.s_a));
  rm := pg_temp.call_as(f.m, format($q$select public.hp_void_attempt(%L::uuid, 'duplicate')::text$q$, f.s_a));
  perform pg_temp.rec(8, 'after 24 hours the player cannot void it; the mentor can',
    rold like 'err:42501:%' and rm like '{%' and (select voided_by from public.hp_attempts where id = f.s_a) = f.m, format('player %s; mentor %s', left(rold, 40), left(rm, 30)));
end
$c$;

-- 9-10. The table is closed to direct writes, for students and staff alike.
do $c$
declare f t33_fx; i text; u text; d text; um text;
begin
  select * into f from t33_fx;
  i := pg_temp.call_as(f.a, format($q$insert into public.hp_attempts (member_id, attempt_date, drill, made, attempted) values (%L, current_date, 'accuracy', 20, 20) returning id::text$q$, f.a));
  u := pg_temp.call_as(f.a, format($q$update public.hp_attempts set made = 44 where id = %L returning id::text$q$, f.s_b));
  d := pg_temp.call_as(f.a, format($q$delete from public.hp_attempts where id = %L returning id::text$q$, f.s_b));
  perform pg_temp.rec(9, 'no direct insert, update or delete for a student',
    i like 'err:42501:%' and u like 'err:42501:%' and d like 'err:42501:%', format('%s | %s | %s', left(i, 25), left(u, 25), left(d, 25)));
  um := pg_temp.call_as(f.m, format($q$update public.hp_attempts set made = 44 where id = %L returning id::text$q$, f.s_b));
  perform pg_temp.rec(10, 'no direct update for a mentor either; B match run still has 30 made',
    um like 'err:42501:%' and (select made from public.hp_attempts where id = f.s_b) = 30, left(um, 40));
end
$c$;

-- 11. Validation, with a positive control: a sound rate attempt is accepted.
do $c$
declare f t33_fx; ok text; over text; accsec text; rnosec text; accinact text; badhub text;
begin
  select * into f from t33_fx;
  ok := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'rate', 20, 25, 0, 30)::text$q$);
  over := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'match', 30, 40, 11, 163)::text$q$);
  accsec := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'accuracy', 10, 20, 0, 30)::text$q$);
  rnosec := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'rate', 10, 20)::text$q$);
  accinact := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'accuracy', 10, 20, 3)::text$q$);
  badhub := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date, 'match', 10, 20, 0, 163, 'green')::text$q$);
  perform pg_temp.rec(11, 'a sound rate attempt is accepted; more made than shots, an accuracy clock, a rate with no clock, inactive makes outside a match and a bad alliance are refused',
    ok like '{%' and over like 'err:22023:%' and accsec like 'err:22023:%' and rnosec like 'err:22023:%' and accinact like 'err:22023:%' and badhub like 'err:22023:%',
    format('ok %s | %s | %s | %s | %s | %s', left(ok, 10), left(over, 20), left(accsec, 20), left(rnosec, 20), left(accinact, 20), left(badhub, 20)));
end
$c$;

-- 12. The 60-day window for students (staff may log older).
do $c$
declare f t33_fx; old_s text; old_m text;
begin
  select * into f from t33_fx;
  old_s := pg_temp.call_as(f.a, $q$select public.hp_log_attempt(null, current_date - 90, 'accuracy', 10, 20)::text$q$);
  old_m := pg_temp.call_as(f.m, format($q$select public.hp_log_attempt(%L::uuid, current_date - 90, 'accuracy', 10, 20)::text$q$, f.a));
  perform pg_temp.rec(12, 'a student cannot log 90 days back; a mentor can log it for them',
    old_s like 'err:22023:%' and old_m like '{%', format('student %s; mentor %s', left(old_s, 40), left(old_m, 30)));
end
$c$;

-- 13. A parent role without a staff role excludes, even beside a student
-- role (the same rule as 0026 and 0029); a staff role brings access back.
do $c$
declare f t33_fx; nb text; lb text; nbs text;
begin
  select * into f from t33_fx;
  insert into public.member_roles (member_id, role) values (f.b, 'parent') on conflict do nothing;
  nb := pg_temp.call_as(f.b, $q$select count(*)::text from public.hp_attempts$q$);
  lb := pg_temp.call_as(f.b, $q$select public.hp_log_attempt(null, current_date, 'accuracy', 5, 20)::text$q$);
  insert into public.member_roles (member_id, role) values (f.b, 'mentor') on conflict do nothing;
  nbs := pg_temp.call_as(f.b, $q$select count(*)::text from public.hp_attempts$q$);
  delete from public.member_roles where member_id = f.b and role in ('parent', 'mentor');
  perform pg_temp.rec(13, 'student plus parent reads 0 and cannot log; adding a staff role reads them again',
    nb = '0' and lb like 'err:42501:%' and nbs::int > 0, format('student+parent %s, log %s; +mentor %s', nb, left(lb, 30), nbs));
end
$c$;

-- 14. The mentor cannot log for a parent-only account (positive control: check 3 logged for B).
do $c$
declare f t33_fx; rp text;
begin
  select * into f from t33_fx;
  rp := pg_temp.call_as(f.m, format($q$select public.hp_log_attempt(%L::uuid, current_date, 'accuracy', 5, 20)::text$q$, f.p));
  perform pg_temp.rec(14, 'a mentor cannot log an attempt for a parent-only account; it has 0 attempts',
    rp like 'err:22023:%' and not exists (select 1 from public.hp_attempts where member_id = f.p), left(rp, 60));
end
$c$;

-- 15. Grants: the three entry points are signed-in only and SECURITY DEFINER with search_path pinned.
do $c$
declare n int; bad text;
begin
  with want(sig) as (values
    ('public.hp_log_attempt(uuid,date,text,integer,integer,integer,integer,text,text,text)'),
    ('public.hp_edit_attempt(uuid,date,integer,integer,integer,integer,text)'),
    ('public.hp_void_attempt(uuid,text)'))
  select count(p.oid), string_agg(w.sig, ', ') filter (where p.oid is null or not p.prosecdef
           or has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute')
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(15, 'grants: three entry points signed-in only, definer, search_path pinned',
    n = 3 and bad is null, format('%s of 3 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t33_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t33_results
order by 1;

rollback;
