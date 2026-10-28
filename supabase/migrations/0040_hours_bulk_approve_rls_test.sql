-- ============================================================
-- 0040_hours_bulk_approve test. Run AFTER 0040. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; nothing it writes persists.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
--
-- Fixture, built inside the transaction: four pending entries (two for each
-- of two students), one verified and one rejected entry. Every refusal is
-- measured against the same entries being approved by staff afterwards, so a
-- function that approves nothing for anybody cannot pass.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.staff_approve_logged_hours(uuid[])') is null then
    raise exception 'Cannot test: 0040_hours_bulk_approve.sql has not been applied';
  end if;
end
$applied$;

create temp table t40_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t40_fx (m uuid, s uuid, s2 uuid, p uuid) on commit drop;
create temp table t40_lh (k text primary key, id uuid not null) on commit drop;
grant all on t40_fx, t40_lh, t40_results to anon, authenticated, service_role;

insert into t40_fx (m, s, s2, p)
select (select r.member_id from public.member_roles r where r.role in ('mentor', 'admin') order by r.role desc, r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'student'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('mentor', 'lead', 'admin'))
         order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'student'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('mentor', 'lead', 'admin'))
         order by r.member_id offset 1 limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('mentor', 'lead', 'admin'))
         order by r.member_id limit 1);

do $pre$
begin
  if (select m from t40_fx) is null or (select s from t40_fx) is null or (select s2 from t40_fx) is null then
    raise exception 'Cannot test: need a staff member and two students';
  end if;
end
$pre$;

-- The fixture rows, written as the table owner. type volunteer is valid in
-- every version of the type check since session_integrity.sql.
with ins as (
  insert into public.logged_hours (member_id, date, hours, type, description, status)
  values
    ((select s from t40_fx),  current_date - 3, 2.00, 'volunteer', 't40 a', 'pending'),
    ((select s from t40_fx),  current_date - 2, 1.50, 'outreach',  't40 b', 'pending'),
    ((select s2 from t40_fx), current_date - 2, 4.00, 'outreach',  't40 c', 'pending'),
    ((select s2 from t40_fx), current_date - 1, 0.25, 'volunteer', 't40 d', 'pending'),
    ((select s2 from t40_fx), current_date - 9, 3.00, 'outreach',  't40 v', 'verified'),
    ((select s2 from t40_fx), current_date - 9, 5.00, 'volunteer', 't40 r', 'rejected')
  returning id, description
)
insert into t40_lh (k, id) select substr(description, 5), id from ins;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  perform set_config('role', 'authenticated', true);
end
$fn$;

create function pg_temp.st(p_k text) returns text language sql as $fn$
  select l.status from public.logged_hours l where l.id = (select id from t40_lh where k = p_k)
$fn$;

-- 1. Negative: a student is refused with 42501 and nothing changes.
do $c1$
declare v_err text;
begin
  perform pg_temp.act((select s from t40_fx));
  begin
    perform * from public.staff_approve_logged_hours(array(select id from t40_lh where k in ('a', 'b', 'c', 'd')));
  exception when others then v_err := sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  insert into t40_results values (1, 'a student is refused with 42501, all 4 stay pending',
    case when v_err = '42501' and (select count(*) from t40_lh where k in ('a','b','c','d') and pg_temp.st(k) = 'pending') = 4 then 'PASS' else 'FAIL' end,
    coalesce(v_err, 'no error') || ', pending=' || (select count(*) from t40_lh where k in ('a','b','c','d') and pg_temp.st(k) = 'pending'));
end
$c1$;

-- 2. Negative: a parent is refused the same way (skipped if no parent role).
do $c2$
declare v_err text;
begin
  if (select p from t40_fx) is null then
    insert into t40_results values (2, 'a parent is refused with 42501', 'SKIP', 'no parent-only member');
    return;
  end if;
  perform pg_temp.act((select p from t40_fx));
  begin
    perform * from public.staff_approve_logged_hours(array(select id from t40_lh where k = 'a'));
  exception when others then v_err := sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  insert into t40_results values (2, 'a parent is refused with 42501, the entry stays pending',
    case when v_err = '42501' and pg_temp.st('a') = 'pending' then 'PASS' else 'FAIL' end,
    coalesce(v_err, 'no error') || ', a=' || pg_temp.st('a'));
end
$c2$;

-- 3. Negative: anon holds no execute privilege; authenticated does (both directions).
insert into t40_results
select 3, 'anon cannot execute, authenticated can',
       case when not has_function_privilege('anon', 'public.staff_approve_logged_hours(uuid[])', 'execute')
             and has_function_privilege('authenticated', 'public.staff_approve_logged_hours(uuid[])', 'execute') then 'PASS' else 'FAIL' end,
       'anon=' || has_function_privilege('anon', 'public.staff_approve_logged_hours(uuid[])', 'execute')::text
       || ' authenticated=' || has_function_privilege('authenticated', 'public.staff_approve_logged_hours(uuid[])', 'execute')::text;

-- 4. Positive: staff approve a, b, c plus the verified, the rejected and an
--    unknown id. Exactly a, b and c come back, with their hours, stamped.
do $c4$
declare v_ids uuid[]; v_n int; v_sum numeric; v_err text;
begin
  perform pg_temp.act((select m from t40_fx));
  begin
    select count(*), sum(r.hours), array_agg(r.id) into v_n, v_sum, v_ids
      from public.staff_approve_logged_hours(
        array(select id from t40_lh where k in ('a', 'b', 'c', 'v', 'r')) || gen_random_uuid()) r;
  exception when others then v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into t40_results values (4, 'staff: 3 of 6 ids approved and returned, 7.5 hours',
    case when v_err is null and v_n = 3 and v_sum = 7.5
          and v_ids @> array(select id from t40_lh where k in ('a', 'b', 'c'))
          and (select count(*) from public.logged_hours l join t40_lh t on t.id = l.id
                where t.k in ('a', 'b', 'c') and l.status = 'verified'
                  and l.verified_by = (select m from t40_fx) and l.verified_at is not null) = 3
         then 'PASS' else 'FAIL' end,
    coalesce(v_err, 'returned=' || v_n || ' hours=' || v_sum));
end
$c4$;

-- 5. Negative: the rejected entry stays rejected and the verified one keeps
--    its old stamp; d (not listed) stays pending.
insert into t40_results
select 5, 'not listed or not pending: rejected stays rejected, verified keeps no new stamp, d stays pending',
       case when pg_temp.st('r') = 'rejected' and pg_temp.st('d') = 'pending'
             and (select l.verified_by from public.logged_hours l where l.id = (select id from t40_lh where k = 'v')) is null
            then 'PASS' else 'FAIL' end,
       'r=' || pg_temp.st('r') || ' d=' || pg_temp.st('d');

-- 6. A repeat of the same call approves nothing more and answers 0 rows.
do $c6$
declare v_n int; v_err text;
begin
  perform pg_temp.act((select m from t40_fx));
  begin
    select count(*) into v_n from public.staff_approve_logged_hours(array(select id from t40_lh where k in ('a', 'b', 'c')));
  exception when others then v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into t40_results values (6, 'a repeat answers 0 rows (3 the first time)',
    case when v_err is null and v_n = 0 then 'PASS' else 'FAIL' end, coalesce(v_err, v_n || ' rows'));
end
$c6$;

-- 7. An empty or null list answers 0 rows without an error.
do $c7$
declare v_a int; v_b int; v_err text;
begin
  perform pg_temp.act((select m from t40_fx));
  begin
    select count(*) into v_a from public.staff_approve_logged_hours('{}'::uuid[]);
    select count(*) into v_b from public.staff_approve_logged_hours(null);
  exception when others then v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into t40_results values (7, 'empty and null lists answer 0 rows',
    case when v_err is null and v_a = 0 and v_b = 0 and pg_temp.st('d') = 'pending' then 'PASS' else 'FAIL' end,
    coalesce(v_err, v_a || ' and ' || v_b));
end
$c7$;

-- 8. Positive control for check 1: the entry the student could not approve
--    (d) is approved by staff, 1 row.
do $c8$
declare v_n int; v_err text;
begin
  perform pg_temp.act((select m from t40_fx));
  begin
    select count(*) into v_n from public.staff_approve_logged_hours(array(select id from t40_lh where k = 'd'));
  exception when others then v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  insert into t40_results values (8, 'staff approve d after the student could not (1 against 0)',
    case when v_err is null and v_n = 1 and pg_temp.st('d') = 'verified' then 'PASS' else 'FAIL' end,
    coalesce(v_err, v_n || ' rows, d=' || pg_temp.st('d')));
end
$c8$;

reset role;
select n, check_name, result, detail from t40_results
union all
select 999, 'summary', case when bool_and(result <> 'FAIL') then 'PASS' else 'FAIL' end,
       count(*) filter (where result = 'PASS') || '/' || count(*) || ' passed'
  from t40_results
order by n;

rollback;
