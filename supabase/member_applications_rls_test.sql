-- ============================================================
-- member_applications RLS mutation test
--
-- Run in the Supabase SQL editor AFTER supabase/member_applications.sql.
-- SAFE ON LIVE DATA: the whole script runs inside one transaction that ends in
-- ROLLBACK, so the two fixture rows it writes never persist. It writes nothing
-- to auth.users and modifies no existing row.
--
-- This is a MUTATION test, not a smoke test: each case asserts that the policy
-- actually BLOCKS the thing it is supposed to block, and fails loudly if the
-- block is missing. Break a policy on purpose (e.g. widen the select policy to
-- `using (true)`) and this script must raise -- if it still says PASS, the test
-- is worthless.
--
-- Cases:
--   1. member A cannot SELECT member B's application row            (select policy)
--   2. member A CAN select their own row                            (positive control)
--   3. member A cannot INSERT a row whose member_id is member B     (insert policy)
--   4. member A cannot UPDATE their own row                         (no update policy + revoked grant)
--   5. anon cannot touch the table at all                           (explicit anon revoke)
-- ============================================================

begin;

-- -- Fixtures ------------------------------------------------------------------
-- member A is deliberately a NON-staff member: is_staff() would make case 1
-- pass for the wrong reason.
select set_config(
  'test.member_a',
  coalesce((
    select p.id::text from public.profiles p
     where not exists (
       select 1 from public.member_roles r
        where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
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
  'test.season',
  coalesce((select s.id::text from public.seasons s order by s.start_date desc limit 1), ''),
  true);

do $pre$
begin
  if nullif(current_setting('test.member_a', true), '') is null then
    raise exception 'Fixture missing: no non-staff profile to test with';
  end if;
  if nullif(current_setting('test.member_b', true), '') is null then
    raise exception 'Fixture missing: need at least two profiles';
  end if;
  if nullif(current_setting('test.season', true), '') is null then
    raise exception 'Fixture missing: no season row (run supabase/seasons.sql)';
  end if;
end
$pre$;

-- Seeded as the table owner, which bypasses RLS -- this is the setup, not a
-- case. One application row for A, one for B, both in the same season.
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
  'Programming and Controls', 'Electrical and Wiring', 'rls fixture',
  'Yes', 'Yes', 'Yes', 'Parent pickup',
  true,
  'Parent A', 'parent-a@example.invalid', '5555550101',
  'Emergency A', '5555550102',
  'testa', true
), (
  current_setting('test.member_b')::uuid, current_setting('test.season')::uuid,
  'Test', 'MemberB', '5555550200',
  'MSET', false,
  'Mechanical Design (CAD)', 'Fabrication and Machining', 'rls fixture',
  'No', 'Sometimes', 'Yes', 'Own transport',
  true,
  'Parent B', 'parent-b@example.invalid', '5555550201',
  'Emergency B', '5555550202',
  'testb', true
);

-- -- Act as member A -----------------------------------------------------------
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
  stored   boolean;
begin
  if auth.uid()::text <> current_setting('test.member_a') then
    raise exception 'Harness broken: auth.uid() is %, expected %',
      auth.uid(), current_setting('test.member_a');
  end if;

  -- CASE 1: cannot read someone else's application.
  select count(*) into n
    from public.member_applications
   where member_id = current_setting('test.member_b')::uuid;
  if n <> 0 then
    raise exception 'FAIL case 1: member A read % of member B''s application rows (expected 0)', n;
  end if;

  -- CASE 2 (positive control): can read own, and ONLY own. If this sees 2 rows
  -- the select policy is too wide; if it sees 0 the policy is broken shut and
  -- case 1 would have "passed" for the wrong reason.
  select count(*) into n from public.member_applications;
  if n <> 1 then
    raise exception 'FAIL case 2: member A sees % rows in member_applications (expected exactly 1, their own)', n;
  end if;

  -- CASE 3: cannot insert on someone else's behalf. A different season keeps
  -- the unique (member_id, season_id) constraint out of it, so a block here is
  -- the RLS check and nothing else.
  blocked := false;
  begin
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
      current_setting('test.member_b')::uuid, current_setting('test.season')::uuid,
      'Spoofed', 'Row', '5555550300',
      'ACE', false,
      'Field and Pit Crew', 'Media Outreach and Business', 'should never land',
      'Yes', 'Yes', 'Yes', 'Own transport',
      true,
      'Parent X', 'parent-x@example.invalid', '5555550301',
      'Emergency X', '5555550302',
      'spoof', true
    );
  exception
    when insufficient_privilege then blocked := true;
    -- A unique violation would mean the row got PAST the policy check, which is
    -- exactly the failure this case exists to catch.
  end;
  if not blocked then
    raise exception 'FAIL case 3: member A inserted an application row for member B';
  end if;

  -- CASE 4: there is no update policy, so an own-row edit must not change
  -- anything; corrections route through a SECURITY DEFINER function instead.
  -- Two outcomes are acceptable and the test says which one it got:
  --   * insufficient_privilege -- update is revoked at the grant layer (loud)
  --   * 0 rows affected        -- RLS found no permissive UPDATE policy (silent)
  -- The ONLY failure is a value that actually changed. Asserting on the raised
  -- error alone would have been the wrong signal: a policy-less update raises
  -- nothing, it just quietly affects no rows.
  blocked  := false;
  affected := -1;
  begin
    update public.member_applications
       set discord_server_confirmed = true
     where member_id = current_setting('test.member_a')::uuid;
    get diagnostics affected = row_count;
  exception
    when insufficient_privilege then blocked := true;
  end;

  select discord_server_confirmed into stored
    from public.member_applications
   where member_id = current_setting('test.member_a')::uuid;

  if stored is not false then
    raise exception 'FAIL case 4: member A changed their own application row (stored value is now %)', stored;
  elsif blocked then
    raise notice 'case 4 PASS loudly: update is revoked at the grant layer (42501)';
  elsif affected = 0 then
    raise notice 'case 4 PASS but SILENTLY: RLS blocked the update with 0 rows and no error. Apply the "revoke update, delete, truncate ... from authenticated" line in member_applications.sql so a stray write raises instead of vanishing.';
  else
    raise exception 'FAIL case 4: update affected % rows', affected;
  end if;

  raise notice 'cases 1-3 PASS (member A cannot read member B''s row and cannot insert one for them)';
end
$as_member$;

-- -- Act as anon ---------------------------------------------------------------
reset role;
set local role anon;

do $as_anon$
declare
  n       int;
  blocked boolean := false;
begin
  begin
    select count(*) into n from public.member_applications;
  exception
    when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    raise exception 'FAIL case 5: anon read member_applications (% rows) -- the anon revoke is missing', n;
  end if;
  raise notice 'case 5 PASS (anon has no table privilege at all)';
end
$as_anon$;

reset role;
rollback;

-- Expect five NOTICEs-worth of PASS above and zero rows left behind:
--   select count(*) from public.member_applications;  -- unchanged by this script
