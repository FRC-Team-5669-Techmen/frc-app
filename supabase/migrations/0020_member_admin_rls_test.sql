-- ============================================================
-- 0020_member_admin RLS test
--
-- Run in the Supabase SQL editor AFTER 0020_member_admin.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK. The names it sets
-- and the merge it runs (two real members, merged and then rolled back) are
-- undone; no existing row changes.
--
-- HOW TO READ IT: one row per check (PASS / FAIL / SKIP, with detail) and a
-- final summary row.
--
-- WHAT IT PROVES. Only an admin sets a member name or merges two accounts;
-- a mentor and a member get 42501 and nothing changes. Every column in this
-- database that names a member is one the merge knows (check 2: this is the
-- check that turns red when a later migration adds one without teaching
-- the merge). A merge leaves no row naming the duplicate account, loses no
-- row it does not report as a duplicate, keeps the auth user, and writes the
-- trail. Positive controls: 3, 4, 7. Negative controls: 5, 6, 8.
-- The row-by-row proof, with a row in every handled table and three
-- mutants, is tools/sql-harness/merge-0020.mjs.
--
-- Actors, picked from live data: an admin A, a mentor or lead M without the
-- admin role (checks that need M SKIP without one), and two approved
-- members S and S2 with no staff role.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.admin_merge_member(uuid, uuid, text)') is null
     or to_regprocedure('public.admin_set_member_name(uuid, text, text)') is null then
    raise exception 'Cannot test: 0020_member_admin.sql must be applied';
  end if;
end
$applied$;

create temp table t0020_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0020_fx (a uuid, m uuid, s uuid, s2 uuid) on commit drop;

insert into t0020_fx
select (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead') and not exists (
          select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin') order by r.member_id limit 1),
       (select p.id from public.profiles p where p.approved and not exists (
          select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin')) order by p.id limit 1),
       (select p.id from public.profiles p where p.approved and not exists (
          select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin')) order by p.id offset 1 limit 1);

do $pre$
begin
  if (select a from t0020_fx) is null or (select s from t0020_fx) is null then
    raise exception 'Cannot test: needs an admin and an approved member without a staff role';
  end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  perform set_config('role', 'authenticated', true);
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
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text) returns void language sql as $fn$
  insert into t0020_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;
create function pg_temp.skip(p_n int, p_check text, p_detail text) returns void language sql as $fn$
  insert into t0020_results values (p_n, p_check, 'SKIP', p_detail);
$fn$;

-- Rows in every moved column that name one account, counted as postgres.
create function pg_temp.naming(p_who uuid) returns bigint language plpgsql as $fn$
declare r record; n bigint := 0; c bigint;
begin
  for r in select x.tbl, x.col from public._merge_member_rules() x where x.rule = 'move'
             and to_regclass('public.' || quote_ident(x.tbl)) is not null
             and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = x.tbl and k.column_name = x.col) loop
    execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into c using p_who;
    n := n + c;
  end loop;
  return n;
end
$fn$;

do $checks$
declare
  f t0020_fx;
  v text; d text; n int; n2 int;
  v_name text; v_nick text;
  v_before_s bigint; v_before_s2 bigint; v_out jsonb;
begin
  select * into f from t0020_fx;

  -- 1 structure
  select string_agg(x, ',' order by x) into v from (
    select 'definer_merge' as x from pg_proc where oid = 'public.admin_merge_member(uuid, uuid, text)'::regprocedure and prosecdef
    union all select 'definer_name' from pg_proc where oid = 'public.admin_set_member_name(uuid, text, text)'::regprocedure and prosecdef
    union all select 'log_rls' from pg_class where oid = 'public.member_admin_log'::regclass and relrowsecurity
    union all select 'log_no_client_write' where not has_table_privilege('authenticated', 'public.member_admin_log', 'insert')
                                              and not has_table_privilege('authenticated', 'public.member_admin_log', 'update')
                                              and not has_table_privilege('authenticated', 'public.member_admin_log', 'delete')
                                              and not has_table_privilege('anon', 'public.member_admin_log', 'select')
    union all select 'helpers_closed' where not has_function_privilege('authenticated', 'public._merge_move(regclass, text, uuid, uuid)', 'execute')
                                         and not has_function_privilege('authenticated', 'public._member_ref_columns()', 'execute')
  ) s;
  perform pg_temp.rec(1, 'structure: both functions definer, the trail closed to client writes, the helpers closed',
    v = 'definer_merge,definer_name,helpers_closed,log_no_client_write,log_rls', coalesce(v, 'none'));

  -- 2 every column that names a member is one the merge knows
  select string_agg(d2.tbl || '.' || d2.col, ', ' order by d2.tbl, d2.col), count(*) into d, n
    from public._member_ref_columns() d2
   where not exists (select 1 from public._merge_member_rules() x where x.tbl = d2.tbl and x.col = d2.col);
  select count(*) into n2 from public._member_ref_columns();
  perform pg_temp.rec(2, 'every column in this database that names a member is one the merge knows',
    n = 0 and n2 > 50, n2 || ' member columns; unknown: ' || coalesce(d, 'none'));

  -- 3 POSITIVE: the admin sets a name; the nickname is left alone when not given
  select full_name, nickname into v_name, v_nick from public.profiles where id = f.s;
  v := pg_temp.val_as(f.a, format('select public.admin_set_member_name(%L, %L)', f.s, 'T0020 Real Name'));
  select count(*) into n from public.profiles where id = f.s and full_name = 'T0020 Real Name' and nickname is not distinct from v_nick;
  select count(*) into n2 from public.member_admin_log where member_id = f.s and action = 'set_name' and new_value ->> 'full_name' = 'T0020 Real Name' and actor_id = f.a;
  perform pg_temp.rec(3, 'an admin sets the real name, the nickname untouched, one trail row (positive control)',
    n = 1 and n2 = 1 and (v::jsonb ->> 'previous_full_name') is not distinct from v_name, left(v, 120));

  -- 4 POSITIVE: a nickname given is set, an empty one clears it
  v := pg_temp.val_as(f.a, format('select public.admin_set_member_name(%L, %L, %L)', f.s, 'T0020 Real Name', 'Tee'));
  d := pg_temp.val_as(f.a, format('select public.admin_set_member_name(%L, %L, %L)', f.s, 'T0020 Real Name', ''));
  select count(*) into n from public.profiles where id = f.s and nickname is null;
  perform pg_temp.rec(4, 'a nickname given is set, and an empty one clears it (positive control)',
    v::jsonb ->> 'nickname' = 'Tee' and d::jsonb ->> 'previous_nickname' = 'Tee' and n = 1, left(v, 60) || ' / ' || left(d, 60));

  -- 5 NEGATIVE: a member and a mentor may not set a name
  v := pg_temp.val_as(f.s, format('select public.admin_set_member_name(%L, %L)', f.s, 'T0020 Self'));
  d := case when f.m is null then 'err:42501:skipped' else pg_temp.val_as(f.m, format('select public.admin_set_member_name(%L, %L)', f.s, 'T0020 Mentor')) end;
  select count(*) into n from public.profiles where id = f.s and full_name in ('T0020 Self', 'T0020 Mentor');
  perform pg_temp.rec(5, 'a member and a mentor are refused setting a name, and nothing changes',
    v like 'err:42501:%' and d like 'err:42501:%' and n = 0, left(v, 60) || ' / ' || left(d, 60) || case when f.m is null then ' (no mentor here)' else '' end);

  if f.s2 is null then
    perform pg_temp.skip(6, 'a member and a mentor are refused a merge', 'needs two approved members without a staff role');
    perform pg_temp.skip(7, 'an admin merge moves everything', 'needs two approved members without a staff role');
  else
    v_before_s := pg_temp.naming(f.s);
    v_before_s2 := pg_temp.naming(f.s2);

    -- 6 NEGATIVE: a member and a mentor may not merge
    v := pg_temp.val_as(f.s, format('select public.admin_merge_member(%L, %L, %L)', f.s2, f.s, 't0020'));
    d := case when f.m is null then 'err:42501:skipped' else pg_temp.val_as(f.m, format('select public.admin_merge_member(%L, %L, %L)', f.s2, f.s, 't0020')) end;
    perform pg_temp.rec(6, 'a member and a mentor are refused a merge, and no row moves',
      v like 'err:42501:%' and d like 'err:42501:%' and pg_temp.naming(f.s2) = v_before_s2 and pg_temp.naming(f.s) = v_before_s,
      left(v, 60) || ' / ' || left(d, 60));

    -- 7 POSITIVE: the admin merge moves every row and reports what it removed
    v := pg_temp.val_as(f.a, format('select public.admin_merge_member(%L, %L, %L)', f.s2, f.s, 't0020 test merge'));
    begin v_out := v::jsonb; exception when others then v_out := null; end;
    select count(*) into n from public.profiles where id = f.s2 and status = 'inactive' and not approved and bio like 'Merged into %: t0020 test merge';
    select count(*) into n2 from auth.users where id = f.s2;
    perform pg_temp.rec(7, 'the admin merge leaves no row naming the duplicate, loses none it does not report, keeps the sign-in (positive control)',
      v_out is not null
        and pg_temp.naming(f.s2) = 0
        and pg_temp.naming(f.s) = v_before_s + v_before_s2 - (v_out ->> 'duplicates_removed')::bigint
        and not exists (select 1 from public.member_roles where member_id = f.s2)
        and n = 1 and n2 = 1
        and (select count(*) from public.member_admin_log where member_id in (f.s, f.s2) and action like 'merge%') = 2,
      format('before %s + %s, after %s, duplicates %s; %s', v_before_s, v_before_s2, pg_temp.naming(f.s), v_out ->> 'duplicates_removed', left(v, 80)));
  end if;

  -- 8 NEGATIVE: the merge refuses one account named twice, no reason, and merging away yourself
  v := pg_temp.val_as(f.a, format('select public.admin_merge_member(%L, %L, %L)', f.s, f.s, 'x'));
  d := pg_temp.val_as(f.a, format('select public.admin_merge_member(%L, %L, %L)', f.s, f.a, '  '));
  v_name := pg_temp.val_as(f.a, format('select public.admin_merge_member(%L, %L, %L)', f.a, f.s, 'x'));
  perform pg_temp.rec(8, 'the merge refuses one account named twice, a blank reason, and merging away your own account',
    v like 'err:22023:%' and d like 'err:22023:%' and v_name like 'err:42501:%', left(v, 40) || ' / ' || left(d, 40) || ' / ' || left(v_name, 40));
end
$checks$;

select n, check_name, result, detail from t0020_results
union all
select 1000, 'SUMMARY', case when bool_and(result <> 'FAIL') then 'PASS' else 'FAIL' end,
       format('%s pass, %s fail, %s skip', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t0020_results
order by 1;

rollback;
