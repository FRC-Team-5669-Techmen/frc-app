-- ============================================================
-- 0026_battery_log test. Run AFTER 0026. SAFE ON LIVE DATA: one transaction
-- ending in ROLLBACK; the batteries and runs it makes never persist.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Actors: students A and B, a mentor M, a parent-only account P, signed out.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.battery_log_run(uuid, text, uuid, text, numeric, numeric, numeric, integer, text, integer, text, timestamptz)') is null then
    raise exception 'Cannot test: 0026_battery_log.sql has not been applied';
  end if;
end
$applied$;

create temp table t26_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t26_fx (a uuid, b uuid, m uuid, p uuid, bat uuid, bat2 uuid, run_a uuid) on commit drop;
grant all on t26_fx, t26_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
)
insert into t26_fx (a, b, m, p)
select (select id from ns where rn = 1), (select id from ns where rn = 2),
       (select r.member_id from public.member_roles r where r.role = 'mentor' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('student', 'mentor', 'lead', 'admin'))
         order by r.member_id limit 1);

do $pre$
declare f t26_fx;
begin
  select * into f from t26_fx;
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
  insert into t26_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
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

-- 1-3. Adding batteries: staff add a numbered set in one action (positive
-- control); a student cannot; the set skips a label that exists.
do $c$
declare f t26_fx; r text; rs text; r2 text;
begin
  select * into f from t26_fx;
  rs := pg_temp.call_as(f.a, $q$select public.battery_add_set('TQ', 1, 3)::text$q$);
  perform pg_temp.rec(1, 'a student cannot add batteries; nothing is written',
    rs like 'err:42501:%' and not exists (select 1 from public.batteries where label like 'TQ%'), left(rs, 60));
  r := pg_temp.call_as(f.m, $q$select public.battery_add_set('TQ', 1, 3, 'MK ES17-12', 2025, 'competition')::text$q$);
  perform pg_temp.rec(2, 'a mentor adds TQ01 to TQ03 in one call, as competition batteries',
    r like '{%' and (select count(*) from public.batteries where label in ('TQ01', 'TQ02', 'TQ03') and status = 'competition' and charge_state = 'needs_charge') = 3, left(r, 80));
  r2 := pg_temp.call_as(f.m, $q$select public.battery_add_set('TQ', 3, 4)::text$q$);
  perform pg_temp.rec(3, 'a second set skips the label that exists and adds the new one',
    r2::jsonb -> 'skipped' = '["TQ03"]'::jsonb and r2::jsonb -> 'created' = '["TQ04"]'::jsonb
    and (select count(*) from public.batteries where upper(label) = 'TQ03') = 1, left(r2, 80));
  update t26_fx set bat = (select id from public.batteries where label = 'TQ01'), bat2 = (select id from public.batteries where label = 'TQ02');
end
$c$;

-- 4-6. Reading: students and staff read; a parent-only account and signed out read nothing.
do $c$
declare f t26_fx; ns text; nm text; np text; na text;
begin
  select * into f from t26_fx;
  ns := pg_temp.call_as(f.a, $q$select count(*)::text from public.batteries where label like 'TQ%'$q$);
  nm := pg_temp.call_as(f.m, $q$select count(*)::text from public.batteries where label like 'TQ%'$q$);
  np := pg_temp.call_as(f.p, $q$select count(*)::text from public.batteries where label like 'TQ%'$q$);
  na := pg_temp.call_as(null, $q$select count(*)::text from public.batteries where label like 'TQ%'$q$);
  perform pg_temp.rec(4, 'a student and a mentor each read the 4 batteries (positive control)', ns = '4' and nm = '4', format('student %s, mentor %s', ns, nm));
  perform pg_temp.rec(5, 'a parent-only account reads 0 batteries, against 4 for the student', np = '0', format('parent %s', np));
  perform pg_temp.rec(6, 'signed out reads nothing', na = '0' or na like 'err:42501:%', na);
end
$c$;

-- 7-9. Logging a run and the charge state.
do $c$
declare f t26_fx; r text; rp text; rx text; c text; cp text;
begin
  select * into f from t26_fx;
  perform pg_temp.call_as(f.m, format($q$select public.battery_set_charge(%L::uuid, 'charged')::text$q$, f.bat));
  r := pg_temp.call_as(f.a, format($q$select public.battery_log_run(%L::uuid, 'match', null, 'qm12', 12.9, 11.8, 14.5, 3, 'no', 4, 'fine')::text$q$, f.bat));
  update t26_fx set run_a = (r::jsonb ->> 'id')::uuid where r like '{%';
  perform pg_temp.rec(7, 'a student logs a match run, attributed to them, and a charged battery becomes needs_charge',
    r like '{%' and (select member_id from public.battery_runs where id = (r::jsonb ->> 'id')::uuid) = f.a
    and (select charge_state from public.batteries where id = f.bat) = 'needs_charge', left(r, 80));
  rp := pg_temp.call_as(f.p, format($q$select public.battery_log_run(%L::uuid, 'match')::text$q$, f.bat));
  rx := pg_temp.call_as(null, format($q$select public.battery_log_run(%L::uuid, 'match')::text$q$, f.bat));
  perform pg_temp.rec(8, 'a parent-only account and signed out cannot log a run; still 1 run',
    rp like 'err:42501:%' and rx like 'err:42501:%' and (select count(*) from public.battery_runs where battery_id = f.bat) = 1, format('parent %s; anon %s', left(rp, 40), left(rx, 40)));
  c := pg_temp.call_as(f.b, format($q$select public.battery_set_charge(%L::uuid, 'charging')::text$q$, f.bat));
  cp := pg_temp.call_as(f.p, format($q$select public.battery_set_charge(%L::uuid, 'charged')::text$q$, f.bat));
  perform pg_temp.rec(9, 'any student sets the charge state; a parent-only account cannot',
    c like '{%' and cp like 'err:42501:%' and (select charge_state from public.batteries where id = f.bat) = 'charging', format('%s; parent %s', left(c, 40), left(cp, 40)));
end
$c$;

-- 10-12. Editing a run: the author within 24 hours, not another student,
-- not the author after 24 hours, staff any time.
do $c$
declare f t26_fx; ra text; rb text; rold text; rm text;
begin
  select * into f from t26_fx;
  rb := pg_temp.call_as(f.b, format($q$select public.battery_edit_run(%L::uuid, 'match', null, 'qm12', 12.0)::text$q$, f.run_a));
  ra := pg_temp.call_as(f.a, format($q$select public.battery_edit_run(%L::uuid, 'match', null, 'qm12', 12.95, 11.8, 14.5, 3, 'yes')::text$q$, f.run_a));
  perform pg_temp.rec(10, 'the author corrects their run; another student cannot',
    ra like '{%' and rb like 'err:42501:%' and (select brownout from public.battery_runs where id = f.run_a) = 'yes'
    and (select voltage_before from public.battery_runs where id = f.run_a) = 12.95, format('author %s; other %s', left(ra, 30), left(rb, 40)));
  update public.battery_runs set created_at = now() - interval '25 hours' where id = f.run_a;
  rold := pg_temp.call_as(f.a, format($q$select public.battery_edit_run(%L::uuid, 'match', null, 'qm12', 1.0)::text$q$, f.run_a));
  perform pg_temp.rec(11, 'after 24 hours the author can no longer change it',
    rold like 'err:42501:%' and (select voltage_before from public.battery_runs where id = f.run_a) = 12.95, left(rold, 60));
  rm := pg_temp.call_as(f.m, format($q$select public.battery_edit_run(%L::uuid, 'match', null, 'qm12', 12.7, 11.8, 14.5, 3, 'yes')::text$q$, f.run_a));
  perform pg_temp.rec(12, 'a mentor edits any run at any time',
    rm like '{%' and (select voltage_before from public.battery_runs where id = f.run_a) = 12.7, left(rm, 60));
end
$c$;

-- 13-15. Batteries: staff edit and retire; a student cannot; a retired battery takes no run.
do $c$
declare f t26_fx; rs text; rm text; rr text; dup text;
begin
  select * into f from t26_fx;
  rs := pg_temp.call_as(f.a, format($q$select public.battery_save(%L::uuid, 'TQ02', null, null, 'retired')::text$q$, f.bat2));
  perform pg_temp.rec(13, 'a student cannot retire a battery',
    rs like 'err:42501:%' and (select status from public.batteries where id = f.bat2) = 'competition', left(rs, 60));
  rm := pg_temp.call_as(f.m, format($q$select public.battery_save(%L::uuid, 'TQ02', 'MK ES17-12', 2019, 'retired', 'Swollen')::text$q$, f.bat2));
  rr := pg_temp.call_as(f.a, format($q$select public.battery_log_run(%L::uuid, 'bench_test')::text$q$, f.bat2));
  perform pg_temp.rec(14, 'a mentor retires it, and nobody can log a run on a retired battery',
    rm like '{%' and (select status from public.batteries where id = f.bat2) = 'retired' and rr like 'err:22023:%', format('%s; run %s', left(rm, 30), left(rr, 50)));
  dup := pg_temp.call_as(f.m, $q$select public.battery_save(null, 'tq01')::text$q$);
  perform pg_temp.rec(15, 'a label is unique regardless of case', dup like 'err:23505:%', left(dup, 60));
end
$c$;

-- 16-17. The tables are closed to direct writes, for students and staff alike.
do $c$
declare f t26_fx; i text; u text; d text; um text;
begin
  select * into f from t26_fx;
  i := pg_temp.call_as(f.a, $q$insert into public.batteries (label) values ('ZZ99') returning id::text$q$);
  u := pg_temp.call_as(f.a, format($q$update public.battery_runs set voltage_before = 1 where id = %L returning id::text$q$, f.run_a));
  d := pg_temp.call_as(f.a, format($q$delete from public.battery_runs where id = %L returning id::text$q$, f.run_a));
  um := pg_temp.call_as(f.m, format($q$update public.batteries set label = 'XX' where id = %L returning id::text$q$, f.bat));
  perform pg_temp.rec(16, 'no direct insert, update or delete for a student',
    i like 'err:42501:%' and u like 'err:42501:%' and d like 'err:42501:%', format('%s | %s | %s', left(i, 30), left(u, 30), left(d, 30)));
  perform pg_temp.rec(17, 'no direct update for a mentor either; the label is unchanged',
    um like 'err:42501:%' and (select label from public.batteries where id = f.bat) = 'TQ01', left(um, 40));
end
$c$;

-- 18. Not recorded stays NULL, never 0.
do $c$
declare f t26_fx; r text;
begin
  select * into f from t26_fx;
  r := pg_temp.call_as(f.a, format($q$select public.battery_log_run(%L::uuid, 'bench_test')::text$q$, f.bat));
  perform pg_temp.rec(18, 'a run with nothing measured stores NULL voltage and resistance and unknown brownout',
    r like '{%' and r::jsonb -> 'voltage_before' = 'null'::jsonb and r::jsonb -> 'resistance_mohm' = 'null'::jsonb and r::jsonb ->> 'brownout' = 'unknown', left(r, 80));
end
$c$;

-- 20. A parent role without a staff role excludes, even beside a student
-- role (the same rule as scouting, 0022); a staff role brings access back.
do $c$
declare f t26_fx; nb text; lb text; nbs text;
begin
  select * into f from t26_fx;
  insert into public.member_roles (member_id, role) values (f.b, 'parent') on conflict do nothing;
  nb := pg_temp.call_as(f.b, $q$select count(*)::text from public.batteries where label like 'TQ%'$q$);
  lb := pg_temp.call_as(f.b, format($q$select public.battery_log_run(%L::uuid, 'bench_test')::text$q$, f.bat));
  insert into public.member_roles (member_id, role) values (f.b, 'mentor') on conflict do nothing;
  nbs := pg_temp.call_as(f.b, $q$select count(*)::text from public.batteries where label like 'TQ%'$q$);
  delete from public.member_roles where member_id = f.b and role in ('parent', 'mentor');
  perform pg_temp.rec(20, 'student plus parent reads 0 and cannot log; adding a staff role reads 4 again',
    nb = '0' and lb like 'err:42501:%' and nbs = '4', format('student+parent %s, log %s; +mentor %s', nb, left(lb, 30), nbs));
end
$c$;

-- 19. Grants: the five entry points are signed-in only and SECURITY DEFINER with search_path pinned.
do $c$
declare n int; bad text;
begin
  with want(sig) as (values
    ('public.battery_add_set(text,integer,integer,text,integer,text)'),
    ('public.battery_save(uuid,text,text,integer,text,text)'),
    ('public.battery_set_charge(uuid,text)'),
    ('public.battery_log_run(uuid,text,uuid,text,numeric,numeric,numeric,integer,text,integer,text,timestamptz)'),
    ('public.battery_edit_run(uuid,text,uuid,text,numeric,numeric,numeric,integer,text,integer,text)'))
  select count(p.oid), string_agg(w.sig, ', ') filter (where p.oid is null or not p.prosecdef
           or has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute')
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(19, 'grants: five entry points signed-in only, definer, search_path pinned',
    n = 5 and bad is null, format('%s of 5 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t26_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t26_results
order by 1;

rollback;
