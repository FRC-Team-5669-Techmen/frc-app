-- ============================================================
-- feedback RLS mutation test
--
-- Run in the Supabase SQL editor AFTER supabase/feedback.sql.
-- SAFE ON LIVE DATA: the whole script runs inside one transaction that ends in
-- ROLLBACK, so the fixture rows it writes never persist. It writes nothing to
-- auth.users, touches no storage object, and modifies no existing row.
--
-- This is a MUTATION test, not a smoke test: each case asserts that the policy
-- actually BLOCKS the thing it is supposed to block, and fails loudly if the
-- block is missing. Widen "feedback select admin" to using (true) on purpose
-- and this script must raise -- if it still says PASS, the test is worthless.
--
-- HOW TO READ IT: a failure aborts the script with a FAIL message. A pass ends
-- with a one-row result grid of per-case verdicts plus a privilege snapshot --
-- the Supabase editor does not render NOTICE output, so verdicts are returned
-- as columns instead.
--
-- Cases:
--   1. a non-admin member cannot SELECT any feedback row, own included  (select policy)
--   2. an admin CAN select both fixture rows                            (positive control)
--   3. a non-admin cannot INSERT a row whose member_id is someone else  (insert policy)
--   4. a non-admin CAN insert their own row                             (positive control)
--   5. a non-admin cannot UPDATE a row's status                         (observable behaviour)
--   5b. every UPDATE policy requires is_admin()                        (update policy, isolated)
--   6. nobody can DELETE, admin included                                (no delete policy/grant)
--   7. anon cannot touch the table at all                               (anon revoke)
-- ============================================================

begin;

-- Clear last run's verdicts. Set with is_local = false because a SET LOCAL made
-- inside a DO block is undone when that block exits, which would take the
-- verdicts with it; that also means they outlive the rollback, so a stale value
-- must not be mistaken for this run's result.
select set_config('test.cases_1',   '', false),
       set_config('test.cases_3_5', '', false),
       set_config('test.case_2',    '', false),
       set_config('test.case_5b',   '', false),
       set_config('test.case_6',    '', false),
       set_config('test.case_7',    '', false);

-- -- Fixtures ------------------------------------------------------------------
-- member A is deliberately a NON-ADMIN member: is_admin() would make cases 1
-- and 5 pass for the wrong reason. A mentor or lead is fine here and is in fact
-- the more interesting choice, since this table is narrower than is_staff().
select set_config(
  'test.member_a',
  coalesce((
    select p.id::text from public.profiles p
     where not exists (
       select 1 from public.member_roles r
        where r.member_id = p.id and r.role = 'admin')
     order by p.id limit 1), ''),
  true);

select set_config(
  'test.member_b',
  coalesce((
    select p.id::text from public.profiles p
     where p.id <> nullif(current_setting('test.member_a', true), '')::uuid
     order by p.id limit 1), ''),
  true);

select set_config(
  'test.admin',
  coalesce((
    select r.member_id::text from public.member_roles r
     where r.role = 'admin'
     order by r.member_id limit 1), ''),
  true);

do $pre$
begin
  if nullif(current_setting('test.member_a', true), '') is null then
    raise exception 'Fixture missing: no non-admin profile to test with';
  end if;
  if nullif(current_setting('test.member_b', true), '') is null then
    raise exception 'Fixture missing: need at least two profiles';
  end if;
  if nullif(current_setting('test.admin', true), '') is null then
    raise exception 'Fixture missing: no member holds the admin role, so the positive control cannot run';
  end if;
end
$pre$;

-- Seeded as the table owner, which bypasses RLS -- this is the setup, not a
-- case. One report from A, one from B.
insert into public.feedback (member_id, category, message, route, viewport, user_agent)
values
  (current_setting('test.member_a')::uuid, 'bug',      'rls fixture A', '/jobs',  '390x844',  'rls-test'),
  (current_setting('test.member_b')::uuid, 'feedback', 'rls fixture B', '/hours', '1280x800', 'rls-test');

-- -- Act as member A (non-admin) -----------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.member_a'), 'role', 'authenticated')::text,
  true);

do $as_member$
declare
  n        int;
  blocked  boolean;
  affected int;
  stored   text;
begin
  if auth.uid()::text <> current_setting('test.member_a') then
    raise exception 'Harness broken: auth.uid() is %, expected %',
      auth.uid(), current_setting('test.member_a');
  end if;
  if public.is_admin() then
    raise exception 'Harness broken: fixture member A resolves as admin, so nothing below tests anything';
  end if;

  -- CASE 1: reads NOTHING, not even the report they filed themselves. There is
  -- exactly one select policy and it is admin-only, so 0 is the whole answer.
  select count(*) into n from public.feedback;
  if n <> 0 then
    raise exception 'FAIL case 1: a non-admin member read % feedback rows (expected 0)', n;
  end if;

  -- CASE 3: cannot file a report as someone else.
  blocked := false;
  begin
    insert into public.feedback (member_id, category, message)
    values (current_setting('test.member_b')::uuid, 'bug', 'spoofed author, should never land');
  exception
    when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL case 3: a non-admin member filed a report as another member';
  end if;

  -- CASE 4 (positive control): CAN file their own. If this fails the insert
  -- policy is broken shut and case 3 "passed" for the wrong reason.
  begin
    insert into public.feedback (member_id, category, message)
    values (current_setting('test.member_a')::uuid, 'idea', 'own row, must be allowed');
  exception
    when insufficient_privilege then
      raise exception 'FAIL case 4: a member cannot file their own report -- the insert policy is broken shut';
  end;

  -- CASE 5: cannot triage.
  --
  -- READ THE LIMIT OF THIS CASE, it was found by breaking it: an UPDATE has to
  -- FIND its rows first, and row lookup goes through the SELECT policy, which
  -- here is admin-only. So a non-admin affects 0 rows even if the update policy
  -- is wide open -- this case cannot distinguish the two, and on its own it is
  -- really case 1 again. Case 5b below is what actually isolates the update
  -- policy. Both are kept: 5 proves the observable behaviour, 5b proves the
  -- reason.
  --
  -- Two outcomes are acceptable and the test says which one it got:
  -- insufficient_privilege (revoked at the grant layer, loud) or 0 rows
  -- affected (no permissive policy matched, silent). The ONLY failure is a
  -- value that actually changed -- asserting on the raised error alone would
  -- be the wrong signal, because a policy-less update raises nothing.
  blocked  := false;
  affected := -1;
  begin
    update public.feedback set status = 'dismissed'
     where member_id = current_setting('test.member_a')::uuid;
    get diagnostics affected = row_count;
  exception
    when insufficient_privilege then blocked := true;
  end;
  if not blocked and affected <> 0 then
    raise exception 'FAIL case 5: a non-admin member updated % feedback rows', affected;
  end if;

  perform set_config('test.cases_1',
    'PASS: a non-admin member reads 0 feedback rows, own report included', false);
  perform set_config('test.cases_3_5',
    'PASS: cannot author as someone else (3), CAN author their own (4), cannot change status (5)', false);
end
$as_member$;

-- -- CASE 5b: the update policy in isolation -----------------------------------
-- Structural, not behavioural, and that is the point: case 5 above is masked by
-- the select policy, so the only way to see a permissive UPDATE policy is to
-- read the catalog. Every UPDATE policy on this table must consult is_admin();
-- one that does not is a triage path open to whoever the select policy later
-- lets read a row.
reset role;

do $update_policies$
declare
  offenders text;
begin
  select string_agg(policyname, ', ') into offenders
    from pg_policies
   where schemaname = 'public' and tablename = 'feedback' and cmd = 'UPDATE'
     and (coalesce(qual, '') not like '%is_admin%'
       or coalesce(with_check, '') not like '%is_admin%');
  if offenders is not null then
    raise exception 'FAIL case 5b: UPDATE policy(s) on public.feedback do not require is_admin(): %', offenders;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'feedback' and cmd = 'UPDATE') then
    raise exception 'FAIL case 5b: no UPDATE policy at all -- admins cannot triage the inbox';
  end if;
  perform set_config('test.case_5b',
    'PASS: every UPDATE policy on public.feedback requires is_admin(), in both USING and WITH CHECK', false);
end
$update_policies$;

-- -- Act as the admin ----------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.admin'), 'role', 'authenticated')::text,
  true);

do $as_admin$
declare
  n        int;
  blocked  boolean := false;
  affected int     := -1;
  still    int;
begin
  if not public.is_admin() then
    raise exception 'Harness broken: fixture admin does not resolve as admin -- is_admin() may be missing (run supabase/feedback.sql)';
  end if;

  -- CASE 2 (positive control): the admin sees both fixture rows. Without this,
  -- a policy that blocks everyone would make case 1 look like a pass.
  select count(*) into n from public.feedback where user_agent = 'rls-test';
  if n < 2 then
    raise exception 'FAIL case 2: admin sees % of the 2 fixture rows -- the select policy is broken shut', n;
  end if;
  perform set_config('test.case_2',
    'PASS: admin reads the inbox (' || n || ' fixture rows visible)', false);

  -- CASE 6: there is no delete policy and no delete grant, for anyone. An inbox
  -- is triaged, not pruned, so the record of what was reported survives.
  begin
    delete from public.feedback where user_agent = 'rls-test';
    get diagnostics affected = row_count;
  exception
    when insufficient_privilege then blocked := true;
  end;
  select count(*) into still from public.feedback where user_agent = 'rls-test';
  if still < n then
    raise exception 'FAIL case 6: % fixture rows were deleted (% remain of %)', n - still, still, n;
  elsif blocked then
    perform set_config('test.case_6',
      'PASS (loud): delete is revoked at the grant layer, raises 42501', false);
  elsif affected = 0 then
    perform set_config('test.case_6',
      'PASS (silent): RLS found no permissive DELETE policy, 0 rows and NO error', false);
  else
    raise exception 'FAIL case 6: delete affected % rows', affected;
  end if;
end
$as_admin$;

-- -- Act as anon ---------------------------------------------------------------
reset role;
set local role anon;

do $as_anon$
declare
  n       int;
  blocked boolean := false;
begin
  begin
    select count(*) into n from public.feedback;
  exception
    when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL case 7: anon read public.feedback (% rows) -- the anon revoke is missing', n;
  end if;
  perform set_config('test.case_7', 'PASS: anon has no table privilege at all', false);
end
$as_anon$;

reset role;

-- The verdicts, as a RESULT GRID. The Supabase SQL editor does not render
-- NOTICE output, so a silent pass would otherwise look identical to a loud one.
-- A hard failure still aborts the script with its FAIL message.
-- Expected: six PASS lines, case 6 loud, authenticated_can_delete false,
-- anon_can_select false, and the bucket not public.
select
  current_setting('test.cases_1',   true) as case_1,
  current_setting('test.case_2',    true) as case_2,
  current_setting('test.cases_3_5', true) as cases_3_to_5,
  current_setting('test.case_5b',   true) as case_5b,
  current_setting('test.case_6',    true) as case_6,
  current_setting('test.case_7',    true) as case_7,
  has_table_privilege('authenticated', 'public.feedback', 'DELETE') as authenticated_can_delete,
  has_table_privilege('anon',          'public.feedback', 'SELECT') as anon_can_select,
  (select public from storage.buckets where id = 'feedback')        as bucket_is_public;

rollback;

-- Nothing is left behind. Confirm with:
--   select count(*) from public.feedback;  -- unchanged by this script
