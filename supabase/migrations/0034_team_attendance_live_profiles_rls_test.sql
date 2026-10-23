-- ============================================================
-- 0034_team_attendance_live_profiles test. Run AFTER 0034. SAFE ON LIVE
-- DATA: one transaction ending in ROLLBACK; nothing it writes persists.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
--
-- Reproduces the live profiles table: where profiles.created_at exists (the
-- SQL harness stub), it is dropped inside this transaction, so the function
-- is called against the same columns production has. On live the column is
-- already absent and nothing is altered.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.team_attendance_summary(date)') is null then
    raise exception 'Cannot test: 0034_team_attendance_live_profiles.sql has not been applied';
  end if;
end
$applied$;

create temp table t34_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t34_fx (a uuid, s uuid) on commit drop;
grant all on t34_fx, t34_results to anon, authenticated, service_role;

insert into t34_fx (a, s)
select (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'student'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('mentor', 'lead', 'admin'))
         order by r.member_id limit 1);

do $pre$
begin
  if (select a from t34_fx) is null or (select s from t34_fx) is null then
    raise exception 'Cannot test: need an admin and a student';
  end if;
end
$pre$;

do $live_shape$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at') then
    execute 'alter table public.profiles drop column created_at';
  end if;
end
$live_shape$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  perform set_config('role', 'authenticated', true);
end
$fn$;

-- 1. Positive: an admin reads the summary on the live column set, with rows.
do $c1$
declare v_n int; v_err text;
begin
  perform pg_temp.act((select a from t34_fx));
  begin
    select count(*) into v_n from public.team_attendance_summary(null);
  exception when others then v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into t34_results values (1, 'admin reads the summary without profiles.created_at',
    case when v_err is null and v_n > 0 then 'PASS' else 'FAIL' end,
    coalesce(v_err, v_n || ' rows'));
end
$c1$;

-- 2. Positive: with a since date, the admin's own row carries both counts.
do $c2$
declare v_id uuid; v_hs numeric; v_cs int; v_err text;
begin
  perform pg_temp.act((select a from t34_fx));
  begin
    select t.member_id, t.hours_since, t.check_ins_since into v_id, v_hs, v_cs
      from public.team_attendance_summary(date '2000-01-01') t
     where t.member_id = (select a from t34_fx);
  exception when others then v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into t34_results values (2, 'since date fills hours_since and check_ins_since',
    case when v_err is null and v_id is not null and v_hs is not null and v_cs is not null then 'PASS' else 'FAIL' end,
    coalesce(v_err, 'found=' || (v_id is not null)::text));
end
$c2$;

-- 3. Negative: a student is still refused (the staff gate survived the copy).
do $c3$
declare v_err text;
begin
  perform pg_temp.act((select s from t34_fx));
  begin
    perform count(*) from public.team_attendance_summary(null);
  exception when others then v_err := sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  insert into t34_results values (3, 'student is refused with 42501',
    case when v_err = '42501' then 'PASS' else 'FAIL' end, coalesce(v_err, 'no error'));
end
$c3$;

reset role;
select n, check_name, result, detail from t34_results
union all
select 999, 'summary', case when bool_and(result = 'PASS') then 'PASS' else 'FAIL' end,
       count(*) filter (where result = 'PASS') || '/' || count(*) || ' passed'
  from t34_results
order by n;

rollback;
