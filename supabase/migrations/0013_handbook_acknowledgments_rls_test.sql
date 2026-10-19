-- ============================================================
-- 0013_handbook_acknowledgments RLS test
--
-- Run in the Supabase SQL editor AFTER 0013_handbook_acknowledgments.sql.
-- SAFE ON LIVE DATA: the whole script is one transaction that ends in
-- ROLLBACK. The signatures and the guardian link it creates never persist,
-- and it changes no existing row.
--
-- HOW TO READ IT: ONE ROW PER CHECK (check, result PASS / FAIL / SKIP, detail)
-- plus a final summary row. Each outcome is ok:<rows> or err:<SQLSTATE>:
-- err:42501 is a loud refusal (revoked privilege or WITH CHECK), ok:0 the
-- silent one (no row matched). Each check names which one it requires.
--
-- This is a MUTATION test: widen a boundary on purpose -- the select policy to
-- using (true), the insert check to (true), or grant update back -- and at
-- least one row turns FAIL. Checks 2, 8, 10, 11 and 15 are POSITIVE controls,
-- so a policy broken shut cannot make the refusals pass for free.
--
-- Actors, picked from live data by role:
--   student   an approved member holding 'student' and no staff role
--   other     a second non-staff member
--   staff     a member holding mentor, lead or admin
--   parent    a member holding 'parent' and no staff role (checks 11 and 12
--             SKIP when there is none); linked to student inside this
--             transaction
-- ============================================================

begin;

do $applied$
begin
  if to_regclass('public.handbook_acknowledgments') is null
     or to_regprocedure('public.handbook_ack_stamp()') is null then
    raise exception 'Cannot test: 0013_handbook_acknowledgments.sql has not been applied';
  end if;
end
$applied$;

create temp table t0013_results (
  n          int  primary key,
  check_name text not null,
  result     text not null,
  detail     text
) on commit drop;

create temp table t0013_fx (
  student_id uuid,
  other_id   uuid,
  staff_id   uuid,
  parent_id  uuid
) on commit drop;

insert into t0013_fx (student_id, staff_id, parent_id)
select
  (select p.id from public.profiles p
    where p.approved
      and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
      and not exists (select 1 from public.member_roles s
                       where s.member_id = p.id and s.role in ('mentor', 'lead', 'admin', 'parent'))
    order by p.id limit 1),
  (select r.member_id from public.member_roles r
    where r.role in ('mentor', 'lead', 'admin') order by r.member_id limit 1),
  (select r.member_id from public.member_roles r
    where r.role = 'parent'
      and not exists (select 1 from public.member_roles s
                       where s.member_id = r.member_id and s.role in ('mentor', 'lead', 'admin'))
    order by r.member_id limit 1);

update t0013_fx set other_id = (
  select p.id from public.profiles p
   where p.id <> t0013_fx.student_id
     and p.id is distinct from t0013_fx.parent_id
     and not exists (select 1 from public.member_roles s
                      where s.member_id = p.id and s.role in ('mentor', 'lead', 'admin'))
     and not exists (select 1 from public.guardian_links g
                      where g.parent_id = p.id and g.student_id = t0013_fx.student_id)
   order by p.id limit 1);

do $pre$
declare f t0013_fx;
begin
  select * into f from t0013_fx;
  if f.student_id is null then raise exception 'Cannot test: no approved member holds only the student role'; end if;
  if f.other_id is null then raise exception 'Cannot test: need a second non-staff member'; end if;
  if f.staff_id is null then raise exception 'Cannot test: no member holds a staff role'; end if;
end
$pre$;

-- Become p_who (null = anon). auth.uid() reads request.jwt.claim.sub or
-- request.jwt.claims->>'sub'; both are set.
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
  insert into t0013_results values
    (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

create function pg_temp.ins(p_member uuid, p_version text, p_role text, p_at text default null)
returns text language sql as $fn$
  select format(
    'insert into public.handbook_acknowledgments (member_id, version, signer_role, lessons_passed%s) values (%L, %L, %L, 18%s)',
    case when p_at is null then '' else ', signed_at' end,
    p_member, p_version, p_role,
    case when p_at is null then '' else ', ' || quote_literal(p_at) || '::timestamptz' end);
$fn$;

do $checks$
declare
  f t0013_fx;
  r text;
  v text;
begin
  select * into f from t0013_fx;

  -- 1 structure
  select string_agg(x, ',') into v from (
    select 'rls' as x from pg_class where oid = 'public.handbook_acknowledgments'::regclass and relrowsecurity
    union all select 'trigger' from pg_trigger where tgname = 'handbook_ack_stamp' and not tgisinternal
    union all select 'unique' from pg_constraint where conname = 'handbook_ack_once_key'
  ) s;
  perform pg_temp.rec(1, 'structure: RLS on, stamp trigger, one-signature key', v = 'rls,trigger,unique', coalesce(v, 'none'));

  -- 2 POSITIVE: a student signs for themselves as a student
  r := pg_temp.run_as(f.student_id, pg_temp.ins(f.student_id, '2099-01-01', 'student'));
  perform pg_temp.rec(2, 'student signs own row as student (positive control)', r = 'ok:1', r);

  -- 3 a student cannot sign for somebody else
  r := pg_temp.run_as(f.student_id, pg_temp.ins(f.other_id, '2099-01-01', 'student'));
  perform pg_temp.rec(3, 'student cannot insert a row for another member, loud', r = 'err:42501', r);

  -- 4 a student cannot sign as a mentor
  r := pg_temp.run_as(f.student_id, pg_temp.ins(f.student_id, '2099-01-01', 'mentor'));
  perform pg_temp.rec(4, 'student cannot sign as mentor, loud', r = 'err:42501', r);

  -- 5 a student cannot sign as a parent without the parent role
  r := pg_temp.run_as(f.student_id, pg_temp.ins(f.student_id, '2099-01-01', 'parent'));
  perform pg_temp.rec(5, 'student without the parent role cannot sign as parent, loud', r = 'err:42501', r);

  -- 6 and 7 no update, no delete, even on your own row
  r := pg_temp.run_as(f.student_id, format(
    'update public.handbook_acknowledgments set version = %L where member_id = %L', '2000-01-01', f.student_id));
  perform pg_temp.rec(6, 'student cannot update own signature, loud', r = 'err:42501', r);
  r := pg_temp.run_as(f.student_id, format(
    'delete from public.handbook_acknowledgments where member_id = %L', f.student_id));
  perform pg_temp.rec(7, 'student cannot delete own signature, loud', r = 'err:42501', r);

  -- 8 POSITIVE: the student reads their own row
  v := pg_temp.val_as(f.student_id, format(
    'select count(*) from public.handbook_acknowledgments where member_id = %L and version = %L', f.student_id, '2099-01-01'));
  perform pg_temp.rec(8, 'student reads own signature (positive control)', v = '1', v);

  -- 9 another member cannot read it
  v := pg_temp.val_as(f.other_id, format(
    'select count(*) from public.handbook_acknowledgments where member_id = %L', f.student_id));
  perform pg_temp.rec(9, 'another non-staff member reads 0 of the student''s rows', v = '0', v);

  -- 10 POSITIVE: staff read it
  v := pg_temp.val_as(f.staff_id, format(
    'select count(*) from public.handbook_acknowledgments where member_id = %L and version = %L', f.student_id, '2099-01-01'));
  perform pg_temp.rec(10, 'staff read the student''s signature (positive control)', v = '1', v);

  -- 11 and 12 a parent: reads 0 before the link, 1 after (positive control)
  if f.parent_id is null then
    insert into t0013_results values (11, 'linked parent reads the student''s signature', 'SKIP', 'no parent-only member');
    insert into t0013_results values (12, 'unlinked parent reads 0 of the student''s rows', 'SKIP', 'no parent-only member');
  else
    delete from public.guardian_links where parent_id = f.parent_id and student_id = f.student_id;
    v := pg_temp.val_as(f.parent_id, format(
      'select count(*) from public.handbook_acknowledgments where member_id = %L', f.student_id));
    perform pg_temp.rec(12, 'unlinked parent reads 0 of the student''s rows', v = '0', v);
    insert into public.guardian_links (parent_id, student_id) values (f.parent_id, f.student_id);
    v := pg_temp.val_as(f.parent_id, format(
      'select count(*) from public.handbook_acknowledgments where member_id = %L and version = %L', f.student_id, '2099-01-01'));
    perform pg_temp.rec(11, 'linked parent reads the student''s signature (positive control)', v = '1', v);
  end if;

  -- 13 a back-dated signed_at is replaced by the clock of the server
  r := pg_temp.run_as(f.student_id, pg_temp.ins(f.student_id, '2099-01-02', 'student', '2020-01-01'));
  select signed_at::text into v from public.handbook_acknowledgments
   where member_id = f.student_id and version = '2099-01-02';
  perform pg_temp.rec(13, 'signed_at is stamped by the server, not the client', r = 'ok:1' and v::timestamptz > now() - interval '1 minute', r || ' ' || coalesce(v, 'null'));

  -- 14 signing the same version twice is refused by the key
  r := pg_temp.run_as(f.student_id, pg_temp.ins(f.student_id, '2099-01-01', 'student'));
  perform pg_temp.rec(14, 'second signature of one version is refused, 23505', r = 'err:23505', r);

  -- 15 POSITIVE: staff sign as mentor
  r := pg_temp.run_as(f.staff_id, pg_temp.ins(f.staff_id, '2099-01-01', 'mentor'));
  perform pg_temp.rec(15, 'staff sign as mentor (positive control)', r = 'ok:1', r);

  -- 16 anon can do nothing
  v := pg_temp.val_as(null, 'select count(*) from public.handbook_acknowledgments');
  perform pg_temp.rec(16, 'anon cannot read the table, loud', v = 'err:42501', v);
end
$checks$;

select n, check_name, result, detail from (
  select n, check_name, result, detail from t0013_results
  union all
  select 999, 'summary',
         case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
         format('%s pass, %s fail, %s skip',
                count(*) filter (where result = 'PASS'),
                count(*) filter (where result = 'FAIL'),
                count(*) filter (where result = 'SKIP'))
    from t0013_results
) all_rows
order by n;

rollback;
