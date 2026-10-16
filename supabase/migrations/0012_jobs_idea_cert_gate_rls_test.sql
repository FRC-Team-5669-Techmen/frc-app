-- ============================================================
-- 0012_jobs_idea_cert_gate RLS test
--
-- Run in the Supabase SQL editor AFTER 0012_jobs_idea_cert_gate.sql.
-- SAFE ON LIVE DATA: the whole script is one transaction that ends in
-- ROLLBACK. Every job, skill, claim, requirement and mirror row it creates is
-- inside that transaction and never commits. It does insert a few IDEA mirror
-- rows (codes and serials starting zzt-0012) so the claim gate has something
-- to hold; they vanish with the rollback and no real mirror row is read for a
-- verdict or changed. It writes nothing to auth.users.
--
-- HOW TO READ IT: one row per check (check, result PASS / FAIL / SKIP, detail)
-- and a final summary row. Each outcome is recorded as ok:<rows> or
-- err:<SQLSTATE>; err:42501 is a loud refusal (a revoked privilege, or the
-- admin or certification check inside an RPC).
--
-- MUTATION TEST: widen any one boundary (grant insert on the requirement table
-- back to authenticated, drop the is_admin() check, drop the status or expiry
-- clause from idea_cert_caller_holds, put the old member_skills gate back) and
-- at least one row turns FAIL. Several rows are POSITIVE controls (a holder
-- CAN claim, an admin CAN set a code, a member CAN read requirements, a job
-- with no requirement CAN be claimed), so a gate broken shut cannot pass.
--
-- Actors, picked from live data:
--   admin     a member holding admin
--   staff     a mentor or lead who is not admin (checks that need one SKIP
--             when there is none)
--   holder    an approved non-staff member with a sign-in email
--   other     a second non-staff member with a sign-in email
-- ============================================================

begin;

do $applied$
begin
  if to_regclass('public.task_idea_cert_requirements') is null
     or to_regprocedure('public.admin_set_task_cert(uuid, text)') is null
     or to_regprocedure('public.idea_cert_caller_holds(text)') is null
     or to_regprocedure('public._idea_cert_map_jobs()') is null then
    raise exception 'Cannot test: 0012_jobs_idea_cert_gate.sql has not been applied';
  end if;
end
$applied$;

create temp table t0012_results (
  n          int  primary key,
  check_name text not null,
  result     text not null,
  detail     text
) on commit drop;

create temp table t0012_fx (
  admin_id     uuid,
  staff_id     uuid,
  holder_id    uuid,
  holder_email text,
  other_id     uuid,
  other_email  text,
  j_held       uuid default gen_random_uuid(),   -- requires zzt-0012-a, holder holds it
  j_notheld    uuid default gen_random_uuid(),   -- requires zzt-0012-b, nobody holds it
  j_susp       uuid default gen_random_uuid(),   -- requires zzt-0012-s, holder suspended
  j_lapsed     uuid default gen_random_uuid(),   -- requires zzt-0012-x, active but expired
  j_otheremail uuid default gen_random_uuid(),   -- requires zzt-0012-o, held under another email
  j_unmapped   uuid default gen_random_uuid(),   -- old skill requirement, decided as none
  j_none       uuid default gen_random_uuid(),   -- no requirement row at all
  j_full       uuid default gen_random_uuid(),   -- capacity 1, already claimed
  j_admin      uuid default gen_random_uuid(),   -- admin sets and clears its code
  m1 uuid default gen_random_uuid(), m2 uuid default gen_random_uuid(),
  m3 uuid default gen_random_uuid(), m4 uuid default gen_random_uuid(),
  m5 uuid default gen_random_uuid(), m6 uuid default gen_random_uuid(),
  s_alpha uuid default gen_random_uuid(), s_beta uuid default gen_random_uuid(),
  s_beta2 uuid default gen_random_uuid(), s_none uuid default gen_random_uuid(),
  s_dup   uuid default gen_random_uuid()
) on commit drop;

insert into t0012_fx (admin_id, staff_id, holder_id)
select
  (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
  (select r.member_id from public.member_roles r
    where r.role in ('mentor', 'lead')
      and not exists (select 1 from public.member_roles a where a.member_id = r.member_id and a.role = 'admin')
    order by r.member_id limit 1),
  (select p.id from public.profiles p join auth.users u on u.id = p.id
    where p.approved and u.email is not null
      and not exists (select 1 from public.member_roles s
                       where s.member_id = p.id and s.role in ('mentor', 'lead', 'admin'))
    order by p.id limit 1);

update t0012_fx set
  holder_email = (select lower(btrim(u.email)) from auth.users u where u.id = t0012_fx.holder_id),
  other_id = (select p.id from public.profiles p join auth.users u on u.id = p.id
               where p.id <> t0012_fx.holder_id and u.email is not null
                 and not exists (select 1 from public.member_roles s
                                  where s.member_id = p.id and s.role in ('mentor', 'lead', 'admin'))
               order by p.id limit 1);
update t0012_fx set
  other_email = (select lower(btrim(u.email)) from auth.users u where u.id = t0012_fx.other_id);

do $pre$
declare f t0012_fx;
begin
  select * into f from t0012_fx;
  if f.admin_id is null then
    raise exception 'Cannot test: no member holds the admin role';
  end if;
  if f.holder_id is null or f.other_id is null then
    raise exception 'Cannot test: need two non-staff members with a sign-in email';
  end if;
end
$pre$;

-- -- Helpers (pg_temp: gone with the transaction) --------------------------------
create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  if p_who is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
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

create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text)
returns void language sql as $fn$
  insert into t0012_results values
    (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

create function pg_temp.claims(p_task uuid) returns int language sql as $fn$
  select count(*)::int from public.task_claims where task_id = p_task;
$fn$;

-- -- Fixture, as the table owner ------------------------------------------------
insert into public.idea_cert_catalog (code, name, level, category, synced_at) values
  ('zzt-0012-a', 'zzt-0012 Alpha Skill', 1, 'zzt', now()),
  ('zzt-0012-b', 'zzt-0012 Beta', 1, 'zzt', now()),
  ('zzt-0012-s', 'zzt-0012 Suspended', 1, 'zzt', now()),
  ('zzt-0012-x', 'zzt-0012 Lapsed', 1, 'zzt', now()),
  ('zzt-0012-o', 'zzt-0012 Elsewhere', 1, 'zzt', now()),
  ('zzt-0012-d1', 'zzt-0012 Dup', 1, 'zzt', now()),
  ('zzt-0012 dup', 'zzt-0012 Dup Two', 1, 'zzt', now());

insert into public.idea_cert_holders (serial, email, holder_name, code, status, awarded_at, awarded_by_name, expires_at, synced_at)
select 'zzt-0012-1', holder_email, 'zzt holder', 'zzt-0012-a', 'active',    now() - interval '10 days', 'zzt', now() + interval '300 days', now() from t0012_fx
union all
select 'zzt-0012-2', holder_email, 'zzt holder', 'zzt-0012-s', 'suspended', now() - interval '10 days', 'zzt', null, now() from t0012_fx
union all
select 'zzt-0012-3', holder_email, 'zzt holder', 'zzt-0012-x', 'active',    now() - interval '400 days', 'zzt', now() - interval '1 day', now() from t0012_fx
union all
select 'zzt-0012-4', 'zzt-0012-nobody@example.invalid', 'zzt nobody', 'zzt-0012-o', 'active', now() - interval '10 days', 'zzt', null, now() from t0012_fx;

insert into public.skills (id, name, category)
select s_alpha, 'zzt-0012 alpha skill', 'zzt' from t0012_fx union all
select s_beta,  'zzt-0012-b',           'zzt' from t0012_fx union all
select s_beta2, 'ZZT-0012 BETA',        'zzt' from t0012_fx union all
select s_none,  'zzt-0012 nothing',     'zzt' from t0012_fx union all
select s_dup,   'zzt-0012 dup',         'zzt' from t0012_fx;

insert into public.tasks (id, title, status, max_claimants, created_by)
select j_held,       'rls-0012 held',        'open', null::int, admin_id from t0012_fx union all
select j_notheld,    'rls-0012 not held',    'open', null, admin_id from t0012_fx union all
select j_susp,       'rls-0012 suspended',   'open', null, admin_id from t0012_fx union all
select j_lapsed,     'rls-0012 lapsed',      'open', null, admin_id from t0012_fx union all
select j_otheremail, 'rls-0012 other email', 'open', null, admin_id from t0012_fx union all
select j_unmapped,   'rls-0012 unmapped',    'open', null, admin_id from t0012_fx union all
select j_none,       'rls-0012 none',        'open', null, admin_id from t0012_fx union all
select j_full,       'rls-0012 full',        'open', 1,    admin_id from t0012_fx union all
select j_admin,      'rls-0012 admin',       'open', null, admin_id from t0012_fx union all
select m1, 'rls-0012 map 1', 'open', null, admin_id from t0012_fx union all
select m2, 'rls-0012 map 2', 'open', null, admin_id from t0012_fx union all
select m3, 'rls-0012 map 3', 'open', null, admin_id from t0012_fx union all
select m4, 'rls-0012 map 4', 'open', null, admin_id from t0012_fx union all
select m5, 'rls-0012 map 5', 'open', null, admin_id from t0012_fx union all
select m6, 'rls-0012 map 6', 'open', null, admin_id from t0012_fx;

insert into public.task_idea_cert_requirements (task_id, code, source)
select j_held,       'zzt-0012-a'::text, 'admin'    from t0012_fx union all
select j_notheld,    'zzt-0012-b', 'admin'    from t0012_fx union all
select j_susp,       'zzt-0012-s', 'admin'    from t0012_fx union all
select j_lapsed,     'zzt-0012-x', 'admin'    from t0012_fx union all
select j_otheremail, 'zzt-0012-o', 'admin'    from t0012_fx union all
select j_unmapped,   null,         'unmapped' from t0012_fx;

-- j_unmapped keeps an old skill requirement the holder does NOT have in
-- member_skills: the old gate would refuse them, the new one must not.
insert into public.task_required_skills (task_id, skill_id)
select j_unmapped, s_none from t0012_fx;

-- j_full: capacity 1, already claimed by other.
insert into public.task_claims (task_id, member_id, status, claimed_at)
select j_full, other_id, 'claimed', now() from t0012_fx;

-- -- Grants and RLS on the requirement table ----------------------------------------
do $table$
declare f t0012_fx; o text;
begin
  select * into f from t0012_fx;

  o := pg_temp.val_as(f.holder_id, 'select count(*) from public.task_idea_cert_requirements where code like ''zzt-0012-%''');
  perform pg_temp.rec(1, 'a member CAN read job requirements (positive control)', o = '5',
    format('rows visible: %s (want 5)', o));

  o := pg_temp.val_as(null, 'select count(*) from public.task_idea_cert_requirements');
  perform pg_temp.rec(2, 'anon cannot read job requirements', o = 'err:42501', format('%s (want err:42501)', o));

  o := pg_temp.run_as(f.holder_id, format(
    'insert into public.task_idea_cert_requirements (task_id, code, source) values (%L, null, %L)', f.j_none, 'admin'));
  perform pg_temp.rec(3, 'a member cannot insert a requirement directly', o = 'err:42501', format('%s (want err:42501)', o));

  o := pg_temp.run_as(f.holder_id, format(
    'update public.task_idea_cert_requirements set code = null where task_id = %L', f.j_notheld));
  perform pg_temp.rec(4, 'a member cannot clear a requirement directly', o = 'err:42501'
    and (select code from public.task_idea_cert_requirements where task_id = f.j_notheld) = 'zzt-0012-b',
    format('%s (want err:42501), code after: %s', o,
      (select code from public.task_idea_cert_requirements where task_id = f.j_notheld)));

  o := pg_temp.run_as(f.holder_id, format(
    'delete from public.task_idea_cert_requirements where task_id = %L', f.j_notheld));
  perform pg_temp.rec(5, 'a member cannot delete a requirement directly', o = 'err:42501', format('%s (want err:42501)', o));

  if f.staff_id is null then
    insert into t0012_results values (6, 'a non-admin STAFF member cannot write a requirement directly', 'SKIP',
      'no mentor or lead without admin exists to act as');
  else
    o := pg_temp.run_as(f.staff_id, format(
      'update public.task_idea_cert_requirements set code = null where task_id = %L', f.j_notheld));
    perform pg_temp.rec(6, 'a non-admin STAFF member cannot write a requirement directly', o = 'err:42501',
      format('%s (want err:42501)', o));
  end if;
end
$table$;

-- -- admin_set_task_cert -------------------------------------------------------------
do $setter$
declare f t0012_fx; o text; c text; src text;
begin
  select * into f from t0012_fx;

  o := pg_temp.run_as(f.holder_id, format('select public.admin_set_task_cert(%L, %L)', f.j_admin, 'zzt-0012-a'));
  perform pg_temp.rec(7, 'a member cannot set a job certification', o = 'err:42501'
    and not exists (select 1 from public.task_idea_cert_requirements where task_id = f.j_admin),
    format('%s (want err:42501)', o));

  if f.staff_id is null then
    insert into t0012_results values (8, 'a non-admin STAFF member cannot set a job certification', 'SKIP',
      'no mentor or lead without admin exists to act as');
  else
    o := pg_temp.run_as(f.staff_id, format('select public.admin_set_task_cert(%L, %L)', f.j_admin, 'zzt-0012-a'));
    perform pg_temp.rec(8, 'a non-admin STAFF member cannot set a job certification', o = 'err:42501'
      and not exists (select 1 from public.task_idea_cert_requirements where task_id = f.j_admin),
      format('%s (want err:42501)', o));
  end if;

  o := pg_temp.run_as(f.admin_id, format('select public.admin_set_task_cert(%L, %L)', f.j_admin, ' zzt-0012-a '));
  select code, source into c, src from public.task_idea_cert_requirements where task_id = f.j_admin;
  perform pg_temp.rec(9, 'an admin CAN set a catalog code, trimmed (positive control)',
    o like 'ok:%' and c = 'zzt-0012-a' and src = 'admin', format('%s, code %s, source %s', o, c, src));

  o := pg_temp.run_as(f.admin_id, format('select public.admin_set_task_cert(%L, %L)', f.j_admin, 'zzt-0012-not-a-code'));
  select code into c from public.task_idea_cert_requirements where task_id = f.j_admin;
  perform pg_temp.rec(10, 'an admin cannot set a code that is not in the IDEA catalog',
    o = 'err:22023' and c = 'zzt-0012-a', format('%s (want err:22023), code still %s', o, c));

  o := pg_temp.run_as(f.admin_id, format('select public.admin_set_task_cert(%L, null)', f.j_admin));
  select code, source into c, src from public.task_idea_cert_requirements where task_id = f.j_admin;
  perform pg_temp.rec(11, 'an admin CAN clear a requirement (row kept, code null, source admin)',
    o like 'ok:%' and c is null and src = 'admin', format('%s, code %s, source %s', o, coalesce(c, 'null'), src));
end
$setter$;

-- -- claim_task ----------------------------------------------------------------------
do $claims$
declare f t0012_fx; o text;
begin
  select * into f from t0012_fx;

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_held));
  perform pg_temp.rec(12, 'a member holding the active, unexpired code CAN claim (positive control)',
    o like 'ok:%' and pg_temp.claims(f.j_held) = 1, format('%s, claims %s', o, pg_temp.claims(f.j_held)));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_notheld));
  perform pg_temp.rec(13, 'a member who does not hold the code cannot claim',
    o = 'err:42501' and pg_temp.claims(f.j_notheld) = 0, format('%s (want err:42501), claims %s', o, pg_temp.claims(f.j_notheld)));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_susp));
  perform pg_temp.rec(14, 'a SUSPENDED holding does not let a member claim',
    o = 'err:42501' and pg_temp.claims(f.j_susp) = 0, format('%s (want err:42501)', o));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_lapsed));
  perform pg_temp.rec(15, 'an active holding PAST its expiry does not let a member claim',
    o = 'err:42501' and pg_temp.claims(f.j_lapsed) = 0, format('%s (want err:42501)', o));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_otheremail));
  perform pg_temp.rec(16, 'an active holding under ANOTHER email does not let a member claim',
    o = 'err:42501' and pg_temp.claims(f.j_otheremail) = 0, format('%s (want err:42501)', o));

  o := pg_temp.run_as(f.other_id, format('select public.claim_task(%L)', f.j_held));
  perform pg_temp.rec(17, 'a second member who does not hold the code cannot claim the job the first one could',
    o = 'err:42501' and pg_temp.claims(f.j_held) = 1, format('%s (want err:42501), claims %s', o, pg_temp.claims(f.j_held)));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_unmapped));
  perform pg_temp.rec(18, 'the OLD skill requirement no longer gates: an unmapped job CAN be claimed without member_skills',
    o like 'ok:%' and pg_temp.claims(f.j_unmapped) = 1
      and not exists (select 1 from public.member_skills ms, t0012_fx x where ms.member_id = x.holder_id and ms.skill_id = x.s_none),
    format('%s, claims %s', o, pg_temp.claims(f.j_unmapped)));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_none));
  perform pg_temp.rec(19, 'a job with no requirement row CAN be claimed', o like 'ok:%' and pg_temp.claims(f.j_none) = 1,
    format('%s, claims %s', o, pg_temp.claims(f.j_none)));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_full));
  perform pg_temp.rec(20, 'capacity is still enforced (job full)', o = 'err:P0001' and pg_temp.claims(f.j_full) = 1,
    format('%s (want err:P0001), claims %s', o, pg_temp.claims(f.j_full)));

  o := pg_temp.run_as(f.holder_id, format('select public.claim_task(%L)', f.j_held));
  perform pg_temp.rec(21, 'a second claim of the same job by the same member is still refused', o = 'err:P0001'
    and pg_temp.claims(f.j_held) = 1, format('%s (want err:P0001)', o));
end
$claims$;

-- -- idea_cert_caller_holds and the carry-over --------------------------------------
do $helpers$
declare f t0012_fx; a text; b text; o text;
begin
  select * into f from t0012_fx;

  a := pg_temp.val_as(f.holder_id, 'select public.idea_cert_caller_holds(''zzt-0012-a'')');
  b := pg_temp.val_as(f.holder_id, 'select public.idea_cert_caller_holds(''zzt-0012-s'')');
  perform pg_temp.rec(22, 'idea_cert_caller_holds: true for a held code, false for a suspended one',
    a = 'true' and b = 'false', format('held %s, suspended %s', a, b));

  o := pg_temp.val_as(null, 'select public.idea_cert_caller_holds(''zzt-0012-a'')');
  perform pg_temp.rec(23, 'anon cannot call idea_cert_caller_holds', o = 'err:42501', format('%s (want err:42501)', o));

  o := pg_temp.val_as(f.admin_id, 'select public._idea_cert_map_jobs()');
  perform pg_temp.rec(24, 'no client, admin included, can run the carry-over', o = 'err:42501', format('%s (want err:42501)', o));
end
$helpers$;

-- Carry-over fixture: m1 one skill matching a catalog NAME; m2 two skills on
-- two codes; m3 a skill matching nothing; m4 a skill matching two codes (one
-- by code, one by name); m5 two skills both on code zzt-0012-b (one by code,
-- one by name, different case); m6 already decided by an admin as none.
insert into public.task_required_skills (task_id, skill_id)
select m1, s_alpha from t0012_fx union all
select m2, s_alpha from t0012_fx union all
select m2, s_beta  from t0012_fx union all
select m3, s_none  from t0012_fx union all
select m4, s_dup   from t0012_fx union all
select m5, s_beta  from t0012_fx union all
select m5, s_beta2 from t0012_fx union all
select m6, s_alpha from t0012_fx;
insert into public.task_idea_cert_requirements (task_id, code, source)
select m6, null, 'admin' from t0012_fx;

do $mapping$
declare f t0012_fx; first_run int; second_run int; got text;
begin
  select * into f from t0012_fx;
  first_run := public._idea_cert_map_jobs();

  select string_agg(format('%s=%s/%s', t.title, coalesce(r.code, 'null'), coalesce(r.source, 'none')), ', ' order by t.title)
    into got
    from public.tasks t left join public.task_idea_cert_requirements r on r.task_id = t.id
   where t.id in (f.m1, f.m2, f.m3, f.m4, f.m5, f.m6);

  perform pg_temp.rec(25, 'carry-over maps ONLY the unambiguous jobs (m1 by name, m5 both skills on one code)',
    got = 'rls-0012 map 1=zzt-0012-a/mapped, rls-0012 map 2=null/unmapped, rls-0012 map 3=null/unmapped, '
       || 'rls-0012 map 4=null/unmapped, rls-0012 map 5=zzt-0012-b/mapped, rls-0012 map 6=null/admin',
    got);

  second_run := public._idea_cert_map_jobs();
  perform pg_temp.rec(26, 'carry-over is idempotent and never overrides an admin decision',
    first_run >= 5 and second_run = 0
      and (select source from public.task_idea_cert_requirements where task_id = f.m6) = 'admin',
    format('first run decided %s, second run %s', first_run, second_run));
end
$mapping$;

-- -- Structure ------------------------------------------------------------------------
do $structure$
declare bad text;
begin
  select string_agg(x, '; ') into bad from (
    select 'RLS off on task_idea_cert_requirements' as x
     where not (select relrowsecurity from pg_class where oid = 'public.task_idea_cert_requirements'::regclass)
    union all
    select 'authenticated holds a write privilege on task_idea_cert_requirements'
     where has_table_privilege('authenticated', 'public.task_idea_cert_requirements', 'INSERT')
        or has_table_privilege('authenticated', 'public.task_idea_cert_requirements', 'UPDATE')
        or has_table_privilege('authenticated', 'public.task_idea_cert_requirements', 'DELETE')
        or has_table_privilege('authenticated', 'public.task_idea_cert_requirements', 'TRUNCATE')
    union all
    select p.proname || ' is not SECURITY DEFINER with search_path pinned'
      from pg_proc p
     where p.oid in ('public.claim_task(uuid)'::regprocedure, 'public.admin_set_task_cert(uuid, text)'::regprocedure,
                     'public.idea_cert_caller_holds(text)'::regprocedure, 'public._idea_cert_map_jobs()'::regprocedure)
       and not (p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%')
    union all
    select 'claim_task still reads member_skills or task_required_skills'
     where (select prosrc from pg_proc where oid = 'public.claim_task(uuid)'::regprocedure) ~ '(member_skills|task_required_skills)'
    union all
    select 'claim_task does not read task_idea_cert_requirements'
     where (select prosrc from pg_proc where oid = 'public.claim_task(uuid)'::regprocedure) !~ 'task_idea_cert_requirements'
    union all
    select 'idea_cert_caller_holds does not check status and expiry'
     where (select prosrc from pg_proc where oid = 'public.idea_cert_caller_holds(text)'::regprocedure) !~ 'status = ''active'''
        or (select prosrc from pg_proc where oid = 'public.idea_cert_caller_holds(text)'::regprocedure) !~ 'expires_at > now'
  ) s;
  perform pg_temp.rec(27, 'structure: RLS on, no client write grant, definer functions pinned, claim_task reads only the new gate',
    bad is null, coalesce('offending: ' || bad, 'none'));
end
$structure$;

select n, check_name as "check", result, detail
  from t0012_results
union all
select 999, 'summary',
       case when bool_or(result = 'FAIL') then 'FAIL' else 'PASS' end,
       format('%s PASS, %s FAIL, %s SKIP of %s checks',
              count(*) filter (where result = 'PASS'),
              count(*) filter (where result = 'FAIL'),
              count(*) filter (where result = 'SKIP'),
              count(*))
  from t0012_results
 order by 1;

rollback;

-- Nothing is left behind. Confirm with:
--   select count(*) from public.tasks where title like 'rls-0012%';            -- 0
--   select count(*) from public.idea_cert_catalog where code like 'zzt-0012%'; -- 0
