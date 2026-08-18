-- ============================================================
-- parent_responses / parent_token RLS mutation test
--
-- Run in the Supabase SQL editor AFTER supabase/parent_responses.sql.
-- SAFE ON LIVE DATA: the whole script runs inside one transaction that ends in
-- ROLLBACK, so the fixture rows it writes never persist. It writes nothing to
-- auth.users and modifies no existing row.
--
-- This is a MUTATION test, not a smoke test: each case asserts that the policy
-- or grant actually BLOCKS the thing it is supposed to block, and fails loudly
-- if the block is missing. Widen the select policy to `using (true)`, or delete
-- the column-grant rebuild in section 2 of parent_responses.sql, and this
-- script must raise -- if it still says PASS, the test is worthless.
--
-- HOW TO READ IT: a failure aborts the script with a FAIL message. A pass ends
-- with a one-row result grid of per-case verdicts plus a privilege snapshot --
-- the Supabase editor does not render NOTICE output, so verdicts are returned
-- as columns instead.
--
-- Cases:
--   1. non-staff member cannot SELECT any parent_responses row   (staff-only select policy)
--   2. non-staff member cannot INSERT into parent_responses      (no insert policy + revoked grant)
--   3. non-staff member cannot SELECT member_applications.parent_token,
--      not even on their OWN row                                 (column grant rebuild)
--   4. non-staff member CAN still read their own application's other columns
--                                                                (positive control for case 3)
--   5. staff CAN read the parent_responses row                   (positive control for case 1)
--   6. anon has no privilege on parent_responses at all          (explicit anon revoke)
--
-- Cases 4 and 5 are the reason a broken-shut policy cannot fake a pass: if the
-- select policy were `using (false)` case 5 fails, and if the column rebuild had
-- revoked the whole table instead of one column, case 4 fails.
-- ============================================================

begin;

-- Clear last run's verdicts. They are set with is_local = false because a
-- SET LOCAL made inside a DO block is undone when that block exits, which would
-- take the verdicts with it; that also means they outlive the rollback, so a
-- stale value must not be mistaken for this run's result.
select set_config('test.cases_1_4', '', false),
       set_config('test.case_5',    '', false),
       set_config('test.case_6',    '', false);

-- -- Fixtures ------------------------------------------------------------------
-- Season first, because member A is then picked to be someone who does NOT
-- already have an application in it -- the unique (member_id, season_id) index
-- would otherwise blow up the seed on live data.
select set_config(
  'test.season',
  coalesce((select s.id::text from public.seasons s order by s.start_date desc limit 1), ''),
  true);

-- Member A is deliberately a NON-staff member: is_staff() would make cases 1-3
-- pass for the wrong reason. Member S is staff, for the positive control.
select set_config(
  'test.member_a',
  coalesce((
    select p.id::text from public.profiles p
     where not exists (
       select 1 from public.member_roles r
        where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
       and not exists (
       select 1 from public.member_applications a
        where a.member_id = p.id
          and a.season_id = nullif(current_setting('test.season', true), '')::uuid)
     order by p.id limit 1), ''),
  true);

select set_config(
  'test.member_s',
  coalesce((
    select r.member_id::text from public.member_roles r
     where r.role in ('mentor', 'lead', 'admin')
     order by r.member_id limit 1), ''),
  true);

do $pre$
begin
  if nullif(current_setting('test.season', true), '') is null then
    raise exception 'Fixture missing: no season row (run supabase/seasons.sql)';
  end if;
  if nullif(current_setting('test.member_a', true), '') is null then
    raise exception 'Fixture missing: no non-staff profile without an application in the latest season';
  end if;
  if nullif(current_setting('test.member_s', true), '') is null then
    raise exception 'Fixture missing: no mentor/lead/admin profile -- case 5 (the positive control) cannot run';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'member_applications'
       and column_name = 'parent_token') then
    raise exception 'Fixture missing: member_applications.parent_token does not exist -- run supabase/parent_responses.sql first';
  end if;
end
$pre$;

-- Seeded as the table owner, which bypasses RLS -- this is the setup, not a
-- case. One application row for member A, and one parent response attached to
-- it. parent_token is left to its default: nothing in this test needs to know
-- it, which is the point.
insert into public.member_applications (
  member_id, season_id,
  legal_first_name, legal_last_name, student_phone,
  pathway, returning_member,
  subteam_first, subteam_second, subteam_rationale,
  monday_lunch, tuesday_after_school, friday_after_school, transport_after_5pm,
  build_season_acknowledged,
  parent_name, parent_email, parent_phone,
  emergency_contact_name, emergency_contact_phone,
  discord_username, conduct_acknowledged
) values (
  current_setting('test.member_a')::uuid, current_setting('test.season')::uuid,
  'Test', 'MemberA', '5555550100',
  'CSEE', false,
  'Programming', 'Electrical', 'rls fixture',
  'Yes', 'Yes', 'Yes', 'Parent pickup',
  true,
  'Parent A', 'parent-a@example.invalid', '5555550101',
  'Emergency A', '5555550102',
  'testa', true
);

-- Stash the new row's id for the cases below (set_config, not psql's \gset --
-- the Supabase SQL editor does not run psql meta-commands).
select set_config(
  'test.application',
  (select id::text from public.member_applications
    where member_id = current_setting('test.member_a')::uuid
      and season_id = current_setting('test.season')::uuid),
  true);

insert into public.parent_responses (
  application_id, weekend_supervision, meal_support, travel_driving,
  employer_name, employer_contact_consent, donation_offer
) values (
  current_setting('test.application')::uuid, 'either', 'yes', 'maybe',
  'Fixture Corp', true, 'rls fixture'
);

-- -- Act as member A (non-staff) -----------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.member_a'), 'role', 'authenticated')::text,
  true);

do $as_member$
declare
  n        int;
  blocked  boolean;
  tok      uuid;
begin
  if auth.uid()::text <> current_setting('test.member_a') then
    raise exception 'Harness broken: auth.uid() is %, expected %',
      auth.uid(), current_setting('test.member_a');
  end if;
  if public.is_staff() then
    raise exception 'Harness broken: fixture member A resolves as staff';
  end if;

  -- CASE 1: cannot read parent responses at all -- not even the one attached to
  -- their own application. There is exactly one such row, so a 0 here is the
  -- policy working and case 5 proves the row is genuinely readable by someone.
  select count(*) into n from public.parent_responses;
  if n <> 0 then
    raise exception 'FAIL case 1: non-staff member read % parent_responses rows (expected 0)', n;
  end if;

  -- CASE 2: cannot write one either. Both a missing grant (42501 at the grant
  -- layer) and a missing policy (42501 from RLS) raise insufficient_privilege;
  -- the only failure is a row that actually lands, which is re-checked below as
  -- the owner in case the block was silent.
  blocked := false;
  begin
    insert into public.parent_responses (application_id, meal_support)
    values (current_setting('test.application')::uuid, 'no');
  exception
    when insufficient_privilege then blocked := true;
    when unique_violation then
      -- Got PAST the privilege check and collided with the fixture row. That is
      -- exactly the failure this case exists to catch.
      raise exception 'FAIL case 2: the insert reached the unique constraint, so the privilege check let it through';
  end;
  if not blocked then
    raise exception 'FAIL case 2: non-staff member inserted a parent_responses row';
  end if;

  -- CASE 3: cannot read the capability token, EVEN ON THEIR OWN ROW. This is
  -- the load-bearing one: a student who can read this answers the parent form
  -- as their own parent. Only insufficient_privilege is a pass -- an
  -- undefined_column means the migration never ran and the test is vacuous.
  blocked := false;
  begin
    select parent_token into tok
      from public.member_applications
     where member_id = current_setting('test.member_a')::uuid;
  exception
    when insufficient_privilege then blocked := true;
    when undefined_column then
      raise exception 'FAIL case 3: parent_token does not exist -- run supabase/parent_responses.sql';
  end;
  if not blocked then
    raise exception 'FAIL case 3: non-staff member read their own parent_token (%). '
      'The column-level revoke is a NO-OP while a table-level SELECT grant exists -- '
      'section 2 of parent_responses.sql must drop it and re-grant the other columns.', tok;
  end if;

  -- CASE 4 (positive control for case 3): the rest of their own row is still
  -- readable. If this fails, the rebuild revoked too much and case 3 "passed"
  -- because the whole table went dark, not because one column did.
  select count(*) into n
    from public.member_applications
   where member_id = current_setting('test.member_a')::uuid
     and legal_last_name = 'MemberA';
  if n <> 1 then
    raise exception 'FAIL case 4: member A sees % of their own application rows (expected 1) -- the column grants are too narrow', n;
  end if;

  perform set_config('test.cases_1_4',
    'PASS: non-staff cannot read or write parent_responses, cannot read their own parent_token, and can still read the rest of their own application', false);
end
$as_member$;

-- -- Act as staff (positive control) --------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.member_s'), 'role', 'authenticated')::text,
  true);

do $as_staff$
declare
  n int;
begin
  if not public.is_staff() then
    raise exception 'Harness broken: fixture member S does not resolve as staff';
  end if;
  select count(*) into n
    from public.parent_responses
   where application_id = current_setting('test.application')::uuid;
  if n <> 1 then
    raise exception 'FAIL case 5: staff read % of the fixture parent_responses rows (expected 1). '
      'The select policy is broken shut, which would also make case 1 pass for the wrong reason.', n;
  end if;
  perform set_config('test.case_5', 'PASS: staff can read the row, so case 1 is a real block and not a dark table', false);
end
$as_staff$;

-- -- Act as anon ---------------------------------------------------------------
reset role;
set local role anon;

do $as_anon$
declare
  n       int;
  blocked boolean := false;
begin
  begin
    select count(*) into n from public.parent_responses;
  exception
    when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL case 6: anon read parent_responses (% rows) -- the anon revoke is missing', n;
  end if;
  perform set_config('test.case_6', 'PASS: anon has no table privilege at all', false);
end
$as_anon$;

reset role;

-- Belt and braces: confirm as the owner that case 2 left nothing behind, so a
-- silently-succeeded insert cannot hide behind a caught exception.
do $post$
declare
  n int;
begin
  select count(*) into n
    from public.parent_responses
   where application_id = current_setting('test.application')::uuid;
  if n <> 1 then
    raise exception 'FAIL: % parent_responses rows exist for the fixture application (expected exactly the 1 seeded)', n;
  end if;
end
$post$;

-- The verdicts, as a RESULT GRID. The Supabase SQL editor does not render
-- NOTICE output, so a silent pass would otherwise look identical to a loud one.
-- A hard failure still aborts the script with its FAIL message.
-- Expected: three PASS lines, and every privilege column false.
select
  current_setting('test.cases_1_4', true) as cases_1_to_4,
  current_setting('test.case_5',    true) as case_5_staff_control,
  current_setting('test.case_6',    true) as case_6,
  has_column_privilege('authenticated', 'public.member_applications', 'parent_token', 'SELECT') as authenticated_can_read_token,
  has_column_privilege('authenticated', 'public.member_applications', 'parent_token', 'INSERT') as authenticated_can_write_token,
  has_table_privilege ('authenticated', 'public.parent_responses', 'INSERT')  as authenticated_can_insert_response,
  has_table_privilege ('authenticated', 'public.parent_responses', 'UPDATE')  as authenticated_can_update_response,
  has_table_privilege ('anon',          'public.parent_responses', 'SELECT')  as anon_can_select_response;

rollback;

-- Nothing is left behind. Confirm with:
--   select count(*) from public.parent_responses;  -- unchanged by this script
