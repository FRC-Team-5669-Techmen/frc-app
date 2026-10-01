-- ============================================================================
-- 0002_feedback_console_rls_test.sql
-- Proves the boundaries 0002_feedback_console.sql draws, against whatever
-- database it is pasted into.
--
-- RUN IN THE SUPABASE SQL EDITOR AFTER 0002_feedback_console.sql.
-- SAFE ON LIVE DATA: everything runs inside one transaction that ends in
-- ROLLBACK. It inserts three fixture reports (user_agent '0002-rls-test'),
-- moves only those, and every write is undone at the end. It writes nothing to
-- auth.users and touches no storage object and no existing row.
--
-- HOW TO READ IT: the last thing it returns is a grid, one row per check:
-- check | result (PASS or FAIL) | detail. The editor shows the last statement
-- that returned rows, and it shows no NOTICE output at all, so every verdict is
-- a row. A broken boundary is a FAIL row; anything the harness itself cannot
-- set up raises and aborts the script with the reason.
--
-- This is a MUTATION test: each refusal check passes only if the database
-- actually refused, and each one has a POSITIVE CONTROL beside it (the admin
-- succeeds, the member's own insert succeeds), so a function that refuses
-- EVERYONE cannot fake a pass. Remove the is_admin() check from
-- feedback_set_status on purpose and check 07 must turn FAIL.
--
-- The checks:
--   01  category is nullable, tried/build exist, status defaults to 'new'
--   02  the status CHECK admits all six new values and all three legacy ones,
--       and refuses an unknown value
--   03  a member CAN file a report with no type, with tried and build  (positive)
--   04  a member cannot file a report as someone else      (insert policy kept)
--   05  a member still reads 0 reports, own included       (select policy kept)
--   06  the deployed console's direct update with a legacy status still works
--       for an admin                                        (positive: no regression)
--   07  a non-admin's feedback_set_status is refused by the database, called
--       by a mentor/lead when one exists (the caller is named in the detail)
--   08  a non-admin's feedback_restore_status is refused by the database
--   09  anon's feedback_set_status is refused
--   10  anon's feedback_restore_status is refused
--   11  an admin's move changes exactly the reports not already there, and
--       returns their previous status and stamp           (positive)
--   12  the moved reports carry the admin's stamp
--   13  the admin's undo restores exactly what was returned (positive)
--   14  an undo never overwrites a report moved again since
--   15  feedback_set_status refuses an unknown or legacy status
--   16  both RPCs are SECURITY DEFINER with search_path pinned, executable by
--       authenticated, and NOT by anon or PUBLIC
--   17  nobody can delete a report, admin included          (revoke kept)
--   18  the refused calls in 07-10 changed no report, read back as the owner
--   19  a report already in the target under its OLD spelling (a 'reviewed'
--       row moved to Seen) is left alone, stamp included  (with a positive
--       control: the same row does move to a status it is not in)
--   20  a member's direct insert that sets status done / spam / in_progress,
--       reviewed_by (the admin's id), reviewed_at and a backdated created_at
--       is filed New, unstamped and created now          (0002 section 6)
--   21  the admin's own direct insert of the same shape keeps every value it
--       set (positive control: the read-back CAN see a triaged, backdated
--       row, and the clamp is not applied to everyone)
--   22  the widget's exact insert (member_id, category, message, image_paths,
--       route, viewport, user_agent, tried, build) still succeeds for a
--       member and is filed New, created now             (positive: no regression)
--   23  the trigger itself: BEFORE INSERT FOR EACH ROW on public.feedback,
--       enabled, an INVOKER function with search_path pinned, executable by
--       nobody (a definer trigger would see its owner and clamp nobody)
--   24  the table owner (the SQL editor) and the service role keep what they
--       set: the triaged fixture rows seeded below, and a service-role insert
--       (positive: the clamp is scoped to the API roles)
--
-- Remove the trigger on purpose (drop trigger feedback_member_insert_defaults
-- on public.feedback, or make its IF never true) and check 20 must turn FAIL.
-- ============================================================================

begin;

create temp table fb0002_results (
  n       int primary key,
  "check" text not null,
  result  text not null check (result in ('PASS', 'FAIL')),
  detail  text
) on commit drop;
-- The impersonated roles record their own verdicts.
grant select, insert on fb0002_results to authenticated, anon;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Member A is deliberately NOT an admin: an admin would make every refusal
-- check pass for the wrong reason. Member A is a non-admin STAFF member
-- (mentor or lead) whenever one exists, because the realistic way this
-- boundary breaks is a body check written as is_staff() instead of is_admin(),
-- and only a staff caller sees that. Picking "the first non-admin by id"
-- instead let an is_staff() mutant pass every check on a database
-- whose lowest id happened to be a student -- which, with random uuids and a
-- roster that is mostly students, is the likely case on the live project.
-- Member B is anybody else. The admin is the positive control.
select set_config('fb0002.member_a', coalesce((
  select p.id::text from public.profiles p
   where not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'admin')
   order by exists (select 1 from public.member_roles r
                     where r.member_id = p.id and r.role in ('mentor', 'lead')) desc,
            p.id
   limit 1), ''), true);
select set_config('fb0002.member_a_kind', case when exists (
  select 1 from public.member_roles r
   where r.member_id::text = current_setting('fb0002.member_a') and r.role in ('mentor', 'lead'))
  then 'a mentor/lead (staff, not admin)'
  else 'a non-staff member (no mentor or lead exists to test with)' end, true);
select set_config('fb0002.member_b', coalesce((
  select p.id::text from public.profiles p
   where p.id::text <> current_setting('fb0002.member_a')
   order by p.id limit 1), ''), true);
select set_config('fb0002.admin', coalesce((
  select r.member_id::text from public.member_roles r where r.role = 'admin'
   order by r.member_id limit 1), ''), true);

do $pre$
begin
  if current_setting('fb0002.member_a') = '' then
    raise exception 'Fixture missing: no non-admin profile to test with.';
  end if;
  if current_setting('fb0002.member_b') = '' then
    raise exception 'Fixture missing: need at least two profiles.';
  end if;
  if current_setting('fb0002.admin') = '' then
    raise exception 'Fixture missing: nobody holds the admin role, so the positive controls cannot run.';
  end if;
  if to_regprocedure('public.feedback_set_status(uuid[], text)') is null
     or to_regprocedure('public.feedback_restore_status(jsonb, text)') is null then
    raise exception '0002_feedback_console.sql has not been applied: its two functions are missing.';
  end if;
end
$pre$;

-- Seeded as the table owner (bypasses RLS): the setup, not a case.
--   r1  member A, no type, New
--   r2  member B, Idea, Seen, stamped by the admin at a fixed instant
--   r3  member B, Bug, Done
select set_config('fb0002.r1', gen_random_uuid()::text, true),
       set_config('fb0002.r2', gen_random_uuid()::text, true),
       set_config('fb0002.r3', gen_random_uuid()::text, true);
-- Rows the checks for section 6 insert, named up front so the owner can read
-- them back (a member cannot read any report, their own included):
--   f1 f2 f3  member A's forged inserts (done / spam / in_progress)
--   f4        member A's widget-shaped insert
--   fa        the admin's own forged-shape insert (positive control)
--   fs        a service-role insert of the same shape      (positive control)
select set_config('fb0002.f1', gen_random_uuid()::text, true),
       set_config('fb0002.f2', gen_random_uuid()::text, true),
       set_config('fb0002.f3', gen_random_uuid()::text, true),
       set_config('fb0002.f4', gen_random_uuid()::text, true),
       set_config('fb0002.fa', gen_random_uuid()::text, true),
       set_config('fb0002.fs', gen_random_uuid()::text, true);

insert into public.feedback (id, member_id, category, message, route, user_agent, status, reviewed_by, reviewed_at)
values
  (current_setting('fb0002.r1')::uuid, current_setting('fb0002.member_a')::uuid, null,
   '0002 fixture one', '/schedule', '0002-rls-test', 'new', null, null),
  (current_setting('fb0002.r2')::uuid, current_setting('fb0002.member_b')::uuid, 'idea',
   '0002 fixture two', '/jobs', '0002-rls-test', 'seen',
   current_setting('fb0002.admin')::uuid, '2026-09-05 18:00:00+00'),
  (current_setting('fb0002.r3')::uuid, current_setting('fb0002.member_b')::uuid, 'bug',
   '0002 fixture three', '/hours', '0002-rls-test', 'done',
   current_setting('fb0002.admin')::uuid, '2026-09-06 18:00:00+00');

-- ── 24: the owner and the service role keep what they set ───────────────────
-- Read straight after the seed, before any check moves a fixture. The seed
-- above ran as the table owner, the role the SQL editor runs as; if the
-- section 6 clamp reached it, r2 and r3 would read New and unstamped here (and
-- 11-13 would fail for a reason that has nothing to do with the RPCs).
do $c24$
declare
  v_owner int;
  v_svc text;
  v_err text;
  v_kept boolean := false;
begin
  select count(*) into v_owner from public.feedback
   where (id = current_setting('fb0002.r2')::uuid and status = 'seen'
          and reviewed_by = current_setting('fb0002.admin')::uuid
          and reviewed_at = '2026-09-05 18:00:00+00'::timestamptz)
      or (id = current_setting('fb0002.r3')::uuid and status = 'done'
          and reviewed_by = current_setting('fb0002.admin')::uuid
          and reviewed_at = '2026-09-06 18:00:00+00'::timestamptz);

  -- The service role, when this session may become it (the harness and the
  -- Supabase SQL editor both can; anything else says so in the detail).
  if pg_has_role(current_user, 'service_role', 'MEMBER') then
    perform set_config('role', 'service_role', true);
    begin
      insert into public.feedback (id, member_id, category, message, user_agent, status, reviewed_by, reviewed_at, created_at)
      values (current_setting('fb0002.fs')::uuid, current_setting('fb0002.member_b')::uuid, 'bug',
              '0002 service-role import', '0002-rls-test', 'done',
              current_setting('fb0002.admin')::uuid, '2026-09-07 18:00:00+00', '2020-01-01 00:00:00+00');
    exception when others then
      v_err := sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    select status = 'done' and reviewed_by = current_setting('fb0002.admin')::uuid
           and reviewed_at = '2026-09-07 18:00:00+00'::timestamptz
           and created_at = '2020-01-01 00:00:00+00'::timestamptz
      into v_kept
      from public.feedback where id = current_setting('fb0002.fs')::uuid;
    v_svc := case when v_err is not null then 'service-role insert refused: ' || v_err
                  when coalesce(v_kept, false) then 'service-role insert kept done, its stamp and its 2020 created_at'
                  else 'service-role insert was rewritten' end;
  else
    v_kept := true;
    v_svc := 'service_role cannot be assumed from this session, so only the owner half ran';
  end if;

  insert into fb0002_results values (24, 'the table owner and the service role keep what they set (positive control)',
    case when v_owner = 2 and v_err is null and coalesce(v_kept, false) then 'PASS' else 'FAIL' end,
    format('owner-seeded triaged fixtures intact: %s of 2; %s', v_owner, v_svc));
end
$c24$;

-- ── 01, 02: the schema, as the owner ────────────────────────────────────────
do $c01$
declare
  v_ok boolean;
  v_detail text;
begin
  select (select is_nullable from information_schema.columns
           where table_schema = 'public' and table_name = 'feedback' and column_name = 'category') = 'YES'
     and (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'feedback' and column_name in ('tried', 'build')) = 2
     and (select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'feedback' and column_name = 'status') like '''new''%'
    into v_ok;
  v_detail := 'category nullable, tried + build present, status default ''new''';
  insert into fb0002_results values (1, 'schema: optional type, tried, build, default status',
    case when v_ok then 'PASS' else 'FAIL' end, v_detail);
end
$c01$;

do $c02$
declare
  v_s text;
  v_refused text := '';
  v_bogus boolean := false;
begin
  foreach v_s in array array['new','seen','in_progress','done','wont_do','spam','open','reviewed','dismissed'] loop
    begin
      update public.feedback set status = v_s where id = current_setting('fb0002.r1')::uuid;
    exception when check_violation then
      v_refused := v_refused || v_s || ' ';
    end;
  end loop;
  begin
    update public.feedback set status = 'bogus' where id = current_setting('fb0002.r1')::uuid;
  exception when check_violation then
    v_bogus := true;
  end;
  update public.feedback set status = 'new' where id = current_setting('fb0002.r1')::uuid;
  insert into fb0002_results values (2, 'status CHECK: both vocabularies in, unknown out',
    case when v_refused = '' and v_bogus then 'PASS' else 'FAIL' end,
    case when v_refused <> '' then 'refused a status it must admit: ' || v_refused
         when not v_bogus then 'admitted the unknown status ''bogus'''
         else 'admits 6 new + 3 legacy values, refuses ''bogus''' end);
end
$c02$;

-- ── As member A (not an admin) ──────────────────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('fb0002.member_a'), true),
       set_config('request.jwt.claims',
         json_build_object('sub', current_setting('fb0002.member_a'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $as_member$
declare
  v_n int;
  v_err text;
  v_code text;
begin
  if auth.uid()::text <> current_setting('fb0002.member_a') then
    raise exception 'Harness broken: auth.uid() is %, expected member A', auth.uid();
  end if;
  if public.is_admin() then
    raise exception 'Harness broken: member A resolves as admin, so nothing below tests anything.';
  end if;

  -- 03 (positive): a report with NO type, with what they tried and a build.
  v_err := null;
  begin
    insert into public.feedback (member_id, category, message, tried, build, route, user_agent)
    values (auth.uid(), null, '0002 own report, no type', 'reloaded the page', 'abc1234', '/schedule', '0002-rls-test');
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  insert into fb0002_results values (3, 'member files a report with no type (positive control)',
    case when v_err is null then 'PASS' else 'FAIL' end,
    coalesce('refused: ' || v_err, 'inserted with category null, tried and build set'));

  -- 04: not as someone else.
  v_code := null;
  begin
    insert into public.feedback (member_id, category, message, user_agent)
    values (current_setting('fb0002.member_b')::uuid, 'bug', 'spoofed author', '0002-rls-test');
  exception when others then
    v_code := sqlstate;
  end;
  insert into fb0002_results values (4, 'member cannot file as someone else',
    case when v_code = '42501' then 'PASS' else 'FAIL' end,
    case when v_code is null then 'a report was filed under another member''s id'
         else 'refused with ' || v_code end);

  -- 20 (written here, judged by the owner below): a hand-rolled insert that
  -- tries to file a report already triaged, stamped by the admin, and
  -- backdated. Each must SUCCEED -- refusing it would also be safe, but the
  -- rule is "filed New", and a refusal here would mean the widget's own path
  -- had broken -- and land New, unstamped, created now.
  v_err := null;
  begin
    insert into public.feedback (id, member_id, category, message, user_agent, status, reviewed_by, reviewed_at, created_at)
    values
      (current_setting('fb0002.f1')::uuid, auth.uid(), 'bug', '0002 forged done', '0002-rls-test', 'done',
       current_setting('fb0002.admin')::uuid, '2026-09-08 18:00:00+00', '2020-01-01 00:00:00+00'),
      (current_setting('fb0002.f2')::uuid, auth.uid(), 'idea', '0002 forged spam', '0002-rls-test', 'spam',
       current_setting('fb0002.admin')::uuid, '2026-09-08 18:00:00+00', '2020-01-01 00:00:00+00'),
      (current_setting('fb0002.f3')::uuid, auth.uid(), null, '0002 forged in progress', '0002-rls-test', 'in_progress',
       current_setting('fb0002.admin')::uuid, '2026-09-08 18:00:00+00', '2020-01-01 00:00:00+00');
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('fb0002.forged_err', coalesce(v_err, ''), true);

  -- 22 (judged below): the widget's own insert, column for column as
  -- src/feedbackModel.js buildReport() sends it after 0002.
  v_err := null;
  begin
    insert into public.feedback (id, member_id, category, message, image_paths, route, viewport, user_agent, tried, build)
    values (current_setting('fb0002.f4')::uuid, auth.uid(), 'bug', '0002 widget-shaped report', '[]'::jsonb,
            '/schedule', '390x844', '0002-rls-test', 'reloaded the page', 'abc1234');
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('fb0002.widget_err', coalesce(v_err, ''), true);

  -- 05: reads nothing, own report included.
  select count(*) into v_n from public.feedback;
  insert into fb0002_results values (5, 'member reads 0 reports, own included',
    case when v_n = 0 then 'PASS' else 'FAIL' end,
    format('%s report(s) visible to a non-admin', v_n));

  -- 07: the bulk move, refused in the body.
  v_code := null; v_n := null;
  begin
    select count(*) into v_n from public.feedback_set_status(
      array[current_setting('fb0002.r1')::uuid, current_setting('fb0002.r2')::uuid], 'spam');
  exception when others then
    v_code := sqlstate; v_err := sqlerrm;
  end;
  insert into fb0002_results values (7, 'non-admin feedback_set_status is refused',
    case when v_code = '42501' then 'PASS' else 'FAIL' end,
    'as ' || current_setting('fb0002.member_a_kind') || ': ' ||
    case when v_code is null then format('a non-admin moved %s report(s) to spam', v_n)
         else v_code || ' ' || v_err end);

  -- 08: the undo, refused in the body.
  v_code := null; v_n := null;
  begin
    select count(*) into v_n from public.feedback_restore_status(
      jsonb_build_array(jsonb_build_object('id', current_setting('fb0002.r3'), 'status', 'new')), 'done');
  exception when others then
    v_code := sqlstate; v_err := sqlerrm;
  end;
  insert into fb0002_results values (8, 'non-admin feedback_restore_status is refused',
    case when v_code = '42501' then 'PASS' else 'FAIL' end,
    'as ' || current_setting('fb0002.member_a_kind') || ': ' ||
    case when v_code is null then format('a non-admin restored %s report(s)', v_n)
         else v_code || ' ' || v_err end);
end
$as_member$;

-- ── As anon ─────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '', true);
set local role anon;

do $as_anon$
declare
  v_n int;
  v_code text;
  v_err text;
begin
  v_code := null; v_n := null;
  begin
    select count(*) into v_n from public.feedback_set_status(array[current_setting('fb0002.r1')::uuid], 'spam');
  exception when others then
    v_code := sqlstate; v_err := sqlerrm;
  end;
  insert into fb0002_results values (9, 'anon feedback_set_status is refused',
    case when v_code = '42501' then 'PASS' else 'FAIL' end,
    case when v_code is null then format('anon moved %s report(s)', v_n) else v_code || ' ' || v_err end);

  v_code := null; v_n := null;
  begin
    select count(*) into v_n from public.feedback_restore_status(
      jsonb_build_array(jsonb_build_object('id', current_setting('fb0002.r3'), 'status', 'new')), 'done');
  exception when others then
    v_code := sqlstate; v_err := sqlerrm;
  end;
  insert into fb0002_results values (10, 'anon feedback_restore_status is refused',
    case when v_code = '42501' then 'PASS' else 'FAIL' end,
    case when v_code is null then format('anon restored %s report(s)', v_n) else v_code || ' ' || v_err end);
end
$as_anon$;

-- The refusals above must have changed nothing. Read back as the owner.
reset role;
do $unchanged$
declare
  v_bad int;
begin
  select count(*) into v_bad from public.feedback
   where (id = current_setting('fb0002.r1')::uuid and status <> 'new')
      or (id = current_setting('fb0002.r2')::uuid and status <> 'seen')
      or (id = current_setting('fb0002.r3')::uuid and status <> 'done');
  insert into fb0002_results values (18, 'the refused calls (07-10) changed no report',
    case when v_bad = 0 then 'PASS' else 'FAIL' end,
    format('%s of 3 fixture reports changed status while only refused callers had acted', v_bad));
end
$unchanged$;

-- ── As the admin ────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('fb0002.admin'), true),
       set_config('request.jwt.claims',
         json_build_object('sub', current_setting('fb0002.admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $as_admin$
declare
  v_items jsonb;
  v_n int;
  v_err text;
  v_code text;
  v_ok boolean;
  v_restored int;
  v_kept int;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Harness broken: the fixture admin does not resolve as admin.';
  end if;

  -- 06 (positive, no regression): the console deployed before 0002 triages
  -- with a direct update and a legacy value. It must keep working.
  v_err := null;
  begin
    update public.feedback set status = 'dismissed' where id = current_setting('fb0002.r1')::uuid;
    get diagnostics v_n = row_count;
    update public.feedback set status = 'new' where id = current_setting('fb0002.r1')::uuid;
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  insert into fb0002_results values (6, 'admin direct update with a legacy status still works (positive control)',
    case when v_err is null and v_n = 1 then 'PASS' else 'FAIL' end,
    coalesce('refused: ' || v_err, format('%s row updated to ''dismissed'' and back', v_n)));

  -- 11 (positive): move all three to Done. r3 is already Done, so exactly two
  -- change and exactly two come back, with what they had before.
  select jsonb_agg(jsonb_build_object(
           'id', s.id, 'status', s.previous_status,
           'reviewed_by', s.previous_reviewed_by, 'reviewed_at', s.previous_reviewed_at)
         order by s.previous_status)
    into v_items
    from public.feedback_set_status(array[
           current_setting('fb0002.r1')::uuid,
           current_setting('fb0002.r2')::uuid,
           current_setting('fb0002.r3')::uuid], 'done') s;
  v_ok := jsonb_array_length(coalesce(v_items, '[]')) = 2
      and v_items @> jsonb_build_array(jsonb_build_object('id', current_setting('fb0002.r1'), 'status', 'new', 'reviewed_by', null))
      and v_items @> jsonb_build_array(jsonb_build_object('id', current_setting('fb0002.r2'), 'status', 'seen',
                                                          'reviewed_by', current_setting('fb0002.admin')));
  insert into fb0002_results values (11, 'admin move returns exactly the changed reports with their previous state (positive control)',
    case when v_ok then 'PASS' else 'FAIL' end,
    format('%s report(s) returned: %s', jsonb_array_length(coalesce(v_items, '[]')), coalesce(v_items::text, 'none')));

  -- 12: the stamp.
  select count(*) into v_n from public.feedback
   where id in (current_setting('fb0002.r1')::uuid, current_setting('fb0002.r2')::uuid)
     and status = 'done' and reviewed_by = auth.uid() and reviewed_at is not null;
  insert into fb0002_results values (12, 'moved reports carry the admin''s triage stamp',
    case when v_n = 2 then 'PASS' else 'FAIL' end, format('%s of 2 stamped done by the admin', v_n));

  -- 13 (positive): the undo puts back exactly what was returned.
  select count(*) into v_restored from public.feedback_restore_status(v_items, 'done');
  select count(*) into v_n from public.feedback
   where (id = current_setting('fb0002.r1')::uuid and status = 'new' and reviewed_by is null and reviewed_at is null)
      or (id = current_setting('fb0002.r2')::uuid and status = 'seen'
          and reviewed_by = current_setting('fb0002.admin')::uuid
          and reviewed_at = '2026-09-05 18:00:00+00'::timestamptz)
      or (id = current_setting('fb0002.r3')::uuid and status = 'done');
  insert into fb0002_results values (13, 'admin undo restores status and stamp exactly (positive control)',
    case when v_restored = 2 and v_n = 3 then 'PASS' else 'FAIL' end,
    format('%s restored; %s of 3 fixture reports back in their exact prior state', v_restored, v_n));

  -- 14: an undo must not overwrite a later change. Move r1 to Spam, then
  -- somebody moves it to In progress, then the stale Spam undo is pressed.
  select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.previous_status,
                     'reviewed_by', s.previous_reviewed_by, 'reviewed_at', s.previous_reviewed_at))
    into v_items
    from public.feedback_set_status(array[current_setting('fb0002.r1')::uuid], 'spam') s;
  perform public.feedback_set_status(array[current_setting('fb0002.r1')::uuid], 'in_progress');
  select count(*) into v_restored from public.feedback_restore_status(v_items, 'spam');
  select status into r from public.feedback where id = current_setting('fb0002.r1')::uuid;
  insert into fb0002_results values (14, 'a stale undo never overwrites a later move',
    case when v_restored = 0 and r.status = 'in_progress' then 'PASS' else 'FAIL' end,
    format('%s restored; report is now %s', v_restored, r.status));

  -- 15: only the new vocabulary goes through the RPC.
  v_ok := true;
  v_err := '';
  for r in select unnest(array['reviewed', 'bogus', '']) as s loop
    v_code := null;
    begin
      perform public.feedback_set_status(array[current_setting('fb0002.r1')::uuid], r.s);
    exception when others then
      v_code := sqlstate;
    end;
    if v_code is distinct from '22023' then
      v_ok := false;
      v_err := v_err || format('%L -> %s; ', r.s, coalesce(v_code, 'accepted'));
    end if;
  end loop;
  insert into fb0002_results values (15, 'feedback_set_status refuses an unknown or legacy status',
    case when v_ok then 'PASS' else 'FAIL' end,
    case when v_ok then '''reviewed'', ''bogus'' and '''' each refused with 22023' else v_err end);

  -- 19: a report already in the target under its OLD spelling is left alone,
  -- stamp included. The console deployed before 0002 still writes 'reviewed'
  -- with a direct update (06 proves it can); moving that row to Seen must not
  -- restamp it, because the console's undo skips a row whose previous status
  -- already read as the target and nothing would ever put the stamp back.
  -- r2 is back at 'seen', stamped by the admin at 2026-09-05 18:00 (13).
  update public.feedback set status = 'reviewed' where id = current_setting('fb0002.r2')::uuid;
  select count(*) into v_n
    from public.feedback_set_status(array[current_setting('fb0002.r2')::uuid], 'seen');
  select count(*) into v_kept from public.feedback
   where id = current_setting('fb0002.r2')::uuid and status = 'reviewed'
     and reviewed_by = current_setting('fb0002.admin')::uuid
     and reviewed_at = '2026-09-05 18:00:00+00'::timestamptz;
  -- Positive control: the same row DOES move to a status it is not in, and
  -- comes back carrying the old spelling as its previous status.
  select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.previous_status))
    into v_items
    from public.feedback_set_status(array[current_setting('fb0002.r2')::uuid], 'wont_do') s;
  v_ok := v_n = 0 and v_kept = 1
      and jsonb_array_length(coalesce(v_items, '[]')) = 1
      and v_items -> 0 ->> 'status' = 'reviewed';
  insert into fb0002_results values (19, 'a move leaves a report already there under its old spelling alone, stamp included',
    case when v_ok then 'PASS' else 'FAIL' end,
    format('move of a ''reviewed'' report to seen changed %s (want 0), stamp kept %s of 1; positive control: move to wont_do returned %s',
           v_n, v_kept, coalesce(v_items::text, 'nothing')));

  -- 21 (judged below): the admin's own direct insert of the forged shape.
  v_err := null;
  begin
    insert into public.feedback (id, member_id, category, message, user_agent, status, reviewed_by, reviewed_at, created_at)
    values (current_setting('fb0002.fa')::uuid, auth.uid(), 'bug', '0002 admin-filed, already done', '0002-rls-test', 'done',
            auth.uid(), '2026-09-09 18:00:00+00', '2020-01-02 00:00:00+00');
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('fb0002.admin_err', coalesce(v_err, ''), true);

  -- 17: delete stays impossible, admin included.
  v_code := null;
  begin
    delete from public.feedback where user_agent = '0002-rls-test';
    get diagnostics v_n = row_count;
  exception when others then
    v_code := sqlstate;
  end;
  insert into fb0002_results values (17, 'nobody can delete a report, admin included',
    case when v_code = '42501' then 'PASS' else 'FAIL' end,
    case when v_code is null then format('admin deleted %s report(s)', v_n) else 'refused with ' || v_code end);
end
$as_admin$;

-- ── 16: the functions' own properties, read from the catalog ─────────────────
-- Structural, and that is the point: the body check above (07, 08) would also
-- refuse anon, so the only way to see a grant that is too wide is to read it.
reset role;
do $c16$
declare
  v_bad text := '';
  f regprocedure;
begin
  foreach f in array array['public.feedback_set_status(uuid[], text)'::regprocedure,
                           'public.feedback_restore_status(jsonb, text)'::regprocedure] loop
    if not (select prosecdef from pg_proc where oid = f) then
      v_bad := v_bad || f::text || ' is not SECURITY DEFINER; ';
    end if;
    if not coalesce((select proconfig from pg_proc where oid = f), '{}') @> array['search_path=public'] then
      v_bad := v_bad || f::text || ' does not pin search_path; ';
    end if;
    if has_function_privilege('anon', f, 'execute') then
      v_bad := v_bad || 'anon can execute ' || f::text || '; ';
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      v_bad := v_bad || 'authenticated cannot execute ' || f::text || '; ';
    end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = f and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      v_bad := v_bad || 'PUBLIC can execute ' || f::text || '; ';
    end if;
  end loop;
  insert into fb0002_results values (16, 'RPCs: definer, search_path pinned, authenticated only',
    case when v_bad = '' then 'PASS' else 'FAIL' end,
    case when v_bad = '' then 'both functions: SECURITY DEFINER, search_path=public, EXECUTE to authenticated, not anon, not PUBLIC'
         else v_bad end);
end
$c16$;

-- ── 20-23: section 6, read back as the owner ─────────────────────────────────
reset role;
do $c20$
declare
  v_err text;
  v_n int;
  v_bad text;
  r record;
begin
  -- 20: the three forged member inserts.
  v_err := nullif(current_setting('fb0002.forged_err'), '');
  select count(*) filter (where status = 'new' and reviewed_by is null and reviewed_at is null
                            and created_at > now() - interval '1 minute'),
         string_agg(format('%s/%s/%s', status, coalesce(reviewed_by::text, 'null'), created_at::date), ', ' order by message)
    into v_n, v_bad
    from public.feedback
   where id in (current_setting('fb0002.f1')::uuid, current_setting('fb0002.f2')::uuid, current_setting('fb0002.f3')::uuid);
  insert into fb0002_results values (20, 'a member cannot file a report already triaged, stamped or backdated',
    case when v_err is null and v_n = 3 then 'PASS' else 'FAIL' end,
    case when v_err is not null then 'the forged insert was refused, so nothing was judged: ' || v_err
         else format('%s of 3 forged inserts (done, spam, in_progress; reviewed_by the admin; created 2020) landed new / unstamped / created now. Stored: %s',
                     v_n, coalesce(v_bad, 'no rows')) end);

  -- 21: the admin's own insert of the same shape, kept as written.
  v_err := nullif(current_setting('fb0002.admin_err'), '');
  select * into r from public.feedback where id = current_setting('fb0002.fa')::uuid;
  insert into fb0002_results values (21, 'an admin''s own direct insert keeps the status, stamp and date it set (positive control)',
    case when v_err is null and r.status = 'done' and r.reviewed_by = current_setting('fb0002.admin')::uuid
              and r.reviewed_at = '2026-09-09 18:00:00+00'::timestamptz
              and r.created_at = '2020-01-02 00:00:00+00'::timestamptz then 'PASS' else 'FAIL' end,
    coalesce('refused: ' || v_err,
             format('stored %s, reviewed_by is the admin: %s, reviewed_at %s, created_at %s',
                    r.status, r.reviewed_by = current_setting('fb0002.admin')::uuid, r.reviewed_at, r.created_at)));

  -- 22: the widget's insert, unchanged in outcome.
  v_err := nullif(current_setting('fb0002.widget_err'), '');
  select * into r from public.feedback where id = current_setting('fb0002.f4')::uuid;
  insert into fb0002_results values (22, 'the widget''s exact insert still succeeds for a member, filed New (positive control)',
    case when v_err is null and r.status = 'new' and r.reviewed_by is null and r.reviewed_at is null
              and r.created_at > now() - interval '1 minute'
              and r.tried = 'reloaded the page' and r.build = 'abc1234' and r.category = 'bug' then 'PASS' else 'FAIL' end,
    coalesce('refused: ' || v_err,
             format('stored status %s, category %s, tried and build kept: %s, created now: %s',
                    r.status, r.category, r.tried = 'reloaded the page' and r.build = 'abc1234',
                    r.created_at > now() - interval '1 minute')));

  -- 23: the trigger's own properties, which the behaviour above cannot show
  -- (a disabled trigger and a missing one look the same from 20; a definer
  -- function looks like a missing trigger).
  v_bad := '';
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.feedback'::regclass
       and t.tgname = 'feedback_member_insert_defaults'
       and not t.tgisinternal
       and t.tgfoid = to_regprocedure('public.feedback_member_insert_defaults()')
       and (t.tgtype & 7) = 7 and (t.tgtype & 56) = 0) then
    v_bad := v_bad || 'no BEFORE INSERT FOR EACH ROW trigger feedback_member_insert_defaults; ';
  elsif exists (select 1 from pg_trigger t where t.tgrelid = 'public.feedback'::regclass
                   and t.tgname = 'feedback_member_insert_defaults' and t.tgenabled = 'D') then
    v_bad := v_bad || 'the trigger is DISABLED; ';
  end if;
  if to_regprocedure('public.feedback_member_insert_defaults()') is null then
    v_bad := v_bad || 'the trigger function is missing; ';
  else
    if (select prosecdef from pg_proc where oid = 'public.feedback_member_insert_defaults()'::regprocedure) then
      v_bad := v_bad || 'the function is SECURITY DEFINER (current_user would be its owner); ';
    end if;
    if not coalesce((select proconfig from pg_proc where oid = 'public.feedback_member_insert_defaults()'::regprocedure), '{}')
           @> array['search_path=public'] then
      v_bad := v_bad || 'search_path is not pinned; ';
    end if;
    if has_function_privilege('anon', 'public.feedback_member_insert_defaults()', 'execute')
       or has_function_privilege('authenticated', 'public.feedback_member_insert_defaults()', 'execute') then
      v_bad := v_bad || 'anon or authenticated holds EXECUTE; ';
    end if;
  end if;
  insert into fb0002_results values (23, 'the insert trigger: before insert, row-level, enabled, invoker, search_path pinned',
    case when v_bad = '' then 'PASS' else 'FAIL' end,
    case when v_bad = '' then 'feedback_member_insert_defaults: BEFORE INSERT FOR EACH ROW, enabled, SECURITY INVOKER, search_path=public, no EXECUTE for anon or authenticated'
         else v_bad end);
end
$c20$;

-- The verdicts. Twenty-four rows; every one should read PASS.
select n as "#", "check", result, detail
  from fb0002_results
 order by n;

rollback;

-- Nothing is left behind. Confirm with:
--   select count(*) from public.feedback where user_agent = '0002-rls-test';   -- 0
