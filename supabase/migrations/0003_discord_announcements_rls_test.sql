-- ============================================================
-- 0003_discord_announcements RLS mutation test
--
-- Run in the Supabase SQL editor AFTER 0003_discord_announcements.sql.
-- SAFE ON LIVE DATA: the whole script is one transaction that ends in ROLLBACK.
-- It writes two fixture role rows and a few fixture log rows, all marked
-- 'rls-test', and if the database has no non-admin staff member (or no admin)
-- it borrows one profile's role for the length of the transaction. All of it
-- is rolled back. It touches no auth.users row and calls nothing outside the
-- database.
--
-- HOW TO READ IT: the last statement returns one row per check -- check,
-- result (PASS or FAIL), detail. The Supabase editor shows no NOTICE output,
-- which is why the verdicts come back as rows. Every row must say PASS. A
-- broken boundary produces a FAIL row; a broken HARNESS (a persona that does
-- not resolve as who it should) raises and stops the script instead, because
-- then nothing below it would be testing anything.
--
-- This is a MUTATION test: widen any policy below to using (true), or drop a
-- revoke, and at least one row turns FAIL. Each negative check sits beside a
-- positive control on the same fixture, so a table that is broken SHUT for
-- everyone cannot pass as "correctly closed".
--
--   role table (discord_announce_roles): staff read, admin write
--   log (discord_announcements): staff read, service role writes, nobody else
--   anon: nothing on either
-- ============================================================

begin;

-- Clear any verdict from an earlier run in this session.
select set_config('announce_test.' || k, '', false)
  from unnest(array['r01','r02','r03','r04','r05','r06','r07','r08','r09','r10','r11',
                    'l01','l02','l03','l04','l05','l06','l07','l08',
                    'a01','a02','p01','p02','p03']) as k;

-- ── Personas ─────────────────────────────────────────────────────────────────
-- student: holds no staff role. mentor: staff but NOT admin -- the interesting
-- one, because it can read both tables and must still not write the role
-- table. admin: holds admin. Picked from the real rows; if the database lacks
-- a non-admin staff member or an admin, one profile is lent that role inside
-- this transaction and gets it back at the rollback.
do $personas$
declare
  v_student uuid;
  v_mentor  uuid;
  v_admin   uuid;
begin
  select p.id into v_student from public.profiles p
   where not exists (select 1 from public.member_roles r
                      where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
   order by p.id limit 1;
  if v_student is null then
    raise exception 'Fixture missing: no profile without a staff role to act as the student';
  end if;

  select r.member_id into v_admin from public.member_roles r
   where r.role = 'admin' order by r.member_id limit 1;

  select r.member_id into v_mentor from public.member_roles r
   where r.role in ('mentor', 'lead')
     and not exists (select 1 from public.member_roles a where a.member_id = r.member_id and a.role = 'admin')
   order by r.member_id limit 1;

  if v_mentor is null then
    select p.id into v_mentor from public.profiles p
     where p.id <> v_student and p.id is distinct from v_admin
       and not exists (select 1 from public.member_roles r
                        where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
     order by p.id limit 1;
    if v_mentor is null then raise exception 'Fixture missing: need a second profile to act as a mentor'; end if;
    insert into public.member_roles (member_id, role) values (v_mentor, 'mentor');
  end if;

  if v_admin is null then
    select p.id into v_admin from public.profiles p
     where p.id not in (v_student, v_mentor)
     order by p.id limit 1;
    if v_admin is null then raise exception 'Fixture missing: need a third profile to act as an admin'; end if;
    insert into public.member_roles (member_id, role) values (v_admin, 'admin');
  end if;

  perform set_config('announce_test.student', v_student::text, false);
  perform set_config('announce_test.mentor',  v_mentor::text,  false);
  perform set_config('announce_test.admin',   v_admin::text,   false);
end
$personas$;

-- ── Fixtures, written as the table owner (RLS does not apply to the owner) ───
insert into public.discord_announce_roles (name, role_id, sort_order, notes) values
  ('RLS test role A', '199999999999999901', 900, 'rls-test'),
  ('RLS test role B', '199999999999999902', 901, 'rls-test');

insert into public.discord_announcements
  (request_id, sender_name, channel_name, content, role_ids, payload, status, discord_message_id)
values
  (gen_random_uuid(), 'rls-test', 'announcements', 'rls-test fixture',
   '{199999999999999901}', '{"content": "rls-test fixture"}', 'sent', '199999999999999903');

-- ── As the student ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('announce_test.student'), true),
       set_config('request.jwt.claims',
         json_build_object('sub', current_setting('announce_test.student'), 'role', 'authenticated')::text, true);

do $as_student$
declare
  n       int;
  blocked boolean;
begin
  if auth.uid()::text is distinct from current_setting('announce_test.student') then
    raise exception 'Harness broken: auth.uid() is %, expected the student', auth.uid();
  end if;
  if public.is_staff() then
    raise exception 'Harness broken: the student resolves as staff, so nothing below tests anything';
  end if;

  select count(*) into n from public.discord_announce_roles where notes = 'rls-test';
  perform set_config('announce_test.r01', case when n = 0
    then 'PASS|reads 0 of the 2 fixture role rows'
    else 'FAIL|a non-staff member read ' || n || ' role rows' end, false);

  blocked := false;
  begin
    insert into public.discord_announce_roles (name, role_id, notes)
    values ('RLS test student row', '199999999999999911', 'rls-test');
  exception when insufficient_privilege then blocked := true;
  end;
  perform set_config('announce_test.r03', case when blocked
    then 'PASS|insert refused with 42501'
    else 'FAIL|a non-staff member added a role to the ping list' end, false);

  select count(*) into n from public.discord_announcements where sender_name = 'rls-test';
  perform set_config('announce_test.l01', case when n = 0
    then 'PASS|reads 0 of the 1 fixture log row'
    else 'FAIL|a non-staff member read ' || n || ' log rows' end, false);
end
$as_student$;

-- ── As the mentor (staff, not admin) ─────────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('announce_test.mentor'), true),
       set_config('request.jwt.claims',
         json_build_object('sub', current_setting('announce_test.mentor'), 'role', 'authenticated')::text, true);

do $as_mentor$
declare
  n        int;
  blocked  boolean;
  affected int;
begin
  if auth.uid()::text is distinct from current_setting('announce_test.mentor') then
    raise exception 'Harness broken: auth.uid() is %, expected the mentor', auth.uid();
  end if;
  if not public.is_staff() or public.is_admin() then
    raise exception 'Harness broken: the mentor must be staff and not admin (is_staff %, is_admin %)',
      public.is_staff(), public.is_admin();
  end if;

  -- Positive control for r01: staff DO read the list.
  select count(*) into n from public.discord_announce_roles where notes = 'rls-test';
  perform set_config('announce_test.r02', case when n = 2
    then 'PASS|staff read both fixture role rows'
    else 'FAIL|staff read ' || n || ' of 2 role rows -- the select policy is broken shut' end, false);

  blocked := false;
  begin
    insert into public.discord_announce_roles (name, role_id, notes)
    values ('RLS test mentor row', '199999999999999912', 'rls-test');
  exception when insufficient_privilege then blocked := true;
  end;
  perform set_config('announce_test.r04', case when blocked
    then 'PASS|insert refused with 42501'
    else 'FAIL|a non-admin staff member added a role to the ping list' end, false);

  -- Not masked by the select policy: staff CAN see these rows, so an UPDATE
  -- finds them and only the update policy stands in the way.
  blocked := false; affected := -1;
  begin
    update public.discord_announce_roles set name = name || ' (hijacked)'
     where notes = 'rls-test';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then blocked := true;
  end;
  select count(*) into n from public.discord_announce_roles where notes = 'rls-test' and name like '%hijacked%';
  perform set_config('announce_test.r06', case
    when n = 0 and blocked then 'PASS|update refused with 42501'
    when n = 0 and affected = 0 then 'PASS|update matched 0 rows (no admin policy for staff)'
    else 'FAIL|a non-admin staff member changed ' || n || ' role rows' end, false);

  blocked := false; affected := -1;
  begin
    delete from public.discord_announce_roles where notes = 'rls-test';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then blocked := true;
  end;
  select count(*) into n from public.discord_announce_roles where notes = 'rls-test';
  perform set_config('announce_test.r08', case
    when n = 2 and blocked then 'PASS|delete refused with 42501'
    when n = 2 and affected = 0 then 'PASS|delete matched 0 rows, both fixture rows remain'
    else 'FAIL|a non-admin staff member deleted ' || (2 - n) || ' role rows' end, false);

  -- Positive control for l01: staff DO read the log.
  select count(*) into n from public.discord_announcements where sender_name = 'rls-test';
  perform set_config('announce_test.l02', case when n = 1
    then 'PASS|staff read the fixture log row'
    else 'FAIL|staff read ' || n || ' of 1 log rows -- the select policy is broken shut' end, false);

  blocked := false; affected := -1;
  begin
    update public.discord_announcements set status = 'failed' where sender_name = 'rls-test';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then blocked := true;
  end;
  select count(*) into n from public.discord_announcements where sender_name = 'rls-test' and status = 'sent';
  perform set_config('announce_test.l04', case
    when n = 1 and blocked then 'PASS|update refused with 42501 (revoked, not just unpoliced)'
    else 'FAIL|staff rewrote the log (blocked ' || blocked || ', rows ' || affected || ')' end, false);
end
$as_mentor$;

-- ── As the admin ─────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('announce_test.admin'), true),
       set_config('request.jwt.claims',
         json_build_object('sub', current_setting('announce_test.admin'), 'role', 'authenticated')::text, true);

do $as_admin$
declare
  n        int;
  blocked  boolean;
  affected int;
  failed   text := '';
begin
  if auth.uid()::text is distinct from current_setting('announce_test.admin') then
    raise exception 'Harness broken: auth.uid() is %, expected the admin', auth.uid();
  end if;
  if not public.is_admin() then
    raise exception 'Harness broken: the admin does not resolve as admin';
  end if;

  -- Positive control for r03 / r04: an admin CAN add a row.
  begin
    insert into public.discord_announce_roles (name, role_id, notes)
    values ('RLS test admin row', '199999999999999904', 'rls-test');
    perform set_config('announce_test.r05', 'PASS|an admin added a role row', false);
  exception when others then
    perform set_config('announce_test.r05', 'FAIL|an admin could not add a role row: ' || sqlerrm, false);
  end;

  -- Positive control for r06.
  affected := 0;
  begin
    update public.discord_announce_roles set name = 'RLS test role A renamed'
     where role_id = '199999999999999901';
    get diagnostics affected = row_count;
  exception when others then failed := sqlerrm;
  end;
  perform set_config('announce_test.r07', case when affected = 1
    then 'PASS|an admin renamed a role row'
    else 'FAIL|an admin update changed ' || affected || ' rows ' || failed end, false);

  -- Positive control for r08.
  affected := 0; failed := '';
  begin
    delete from public.discord_announce_roles where role_id = '199999999999999902';
    get diagnostics affected = row_count;
  exception when others then failed := sqlerrm;
  end;
  perform set_config('announce_test.r09', case when affected = 1
    then 'PASS|an admin deleted a role row'
    else 'FAIL|an admin delete removed ' || affected || ' rows ' || failed end, false);

  -- The snowflake CHECK, which is what keeps a role NAME or a pasted mention
  -- out of the id column. Three bad shapes, each must be refused.
  n := 0;
  begin
    insert into public.discord_announce_roles (name, role_id) values ('RLS bad 1', '12345');
  exception when check_violation then n := n + 1;
  end;
  begin
    insert into public.discord_announce_roles (name, role_id) values ('RLS bad 2', '<@&199999999999999905>');
  exception when check_violation then n := n + 1;
  end;
  begin
    insert into public.discord_announce_roles (name, role_id) values ('RLS bad 3', 'Programming');
  exception when check_violation then n := n + 1;
  end;
  perform set_config('announce_test.r10', case when n = 3
    then 'PASS|short id, pasted mention and role name all refused (23514); r05 is the accepted shape'
    else 'FAIL|only ' || n || ' of 3 malformed role ids were refused' end, false);

  blocked := false;
  begin
    insert into public.discord_announce_roles (name, role_id) values ('RLS duplicate', '199999999999999901');
  exception when unique_violation then blocked := true;
  end;
  perform set_config('announce_test.r11', case when blocked
    then 'PASS|a second row for one role id is refused (23505)'
    else 'FAIL|one Discord role id is on the list twice' end, false);

  -- The admin sends THROUGH the function. A direct write is refused even for
  -- an admin, loudly.
  blocked := false;
  begin
    insert into public.discord_announcements (request_id, channel_name, payload)
    values (gen_random_uuid(), 'announcements', '{}');
  exception when insufficient_privilege then blocked := true;
  end;
  perform set_config('announce_test.l03', case when blocked
    then 'PASS|insert refused with 42501, admin included'
    else 'FAIL|a client wrote a log row directly' end, false);

  blocked := false;
  begin
    delete from public.discord_announcements where sender_name = 'rls-test';
  exception when insufficient_privilege then blocked := true;
  end;
  select count(*) into n from public.discord_announcements where sender_name = 'rls-test';
  perform set_config('announce_test.l05', case when blocked and n = 1
    then 'PASS|delete refused with 42501, admin included; the row remains'
    else 'FAIL|the log was pruned from a client (' || n || ' fixture rows remain)' end, false);
end
$as_admin$;

-- ── As the service role (the Edge Function) ──────────────────────────────────
reset role;
set local role service_role;

do $as_service$
declare
  rid     uuid := gen_random_uuid();
  n       int  := 0;
  blocked boolean;
begin
  -- Positive control for l03: the one intended writer CAN write, reserve then
  -- confirm, which is exactly what the function does.
  begin
    insert into public.discord_announcements (request_id, sender_name, channel_name, payload)
    values (rid, 'rls-test', 'announcements', '{"content": "rls-test"}');
    update public.discord_announcements set status = 'sent', discord_message_id = '199999999999999906', sent_at = now()
     where request_id = rid;
    get diagnostics n = row_count;
    perform set_config('announce_test.l06', case when n = 1
      then 'PASS|the service role reserved a row and marked it sent'
      else 'FAIL|the service role update matched ' || n || ' rows' end, false);
  exception when others then
    perform set_config('announce_test.l06', 'FAIL|the service role could not write the log: ' || sqlerrm, false);
  end;

  n := 0;
  begin
    insert into public.discord_announcements (request_id, channel_name, payload, status)
    values (gen_random_uuid(), 'announcements', '{}', 'bogus');
  exception when check_violation then n := n + 1;
  end;
  begin
    insert into public.discord_announcements (request_id, channel_name, payload, status)
    values (gen_random_uuid(), 'announcements', '{}', 'sent');
  exception when check_violation then n := n + 1;
  end;
  begin
    insert into public.discord_announcements (request_id, channel_name, payload, role_ids)
    values (gen_random_uuid(), 'announcements', '{}', '{everyone}');
  exception when check_violation then n := n + 1;
  end;
  perform set_config('announce_test.l07', case when n = 3
    then 'PASS|unknown status, sent-without-message-id and a non-snowflake role id all refused'
    else 'FAIL|only ' || n || ' of 3 malformed log rows were refused' end, false);

  -- THE no-double-post guarantee: a retried request carries the same
  -- request_id, and the second reservation must fail before Discord is called.
  blocked := false;
  begin
    insert into public.discord_announcements (request_id, channel_name, payload)
    values (rid, 'announcements', '{}');
  exception when unique_violation then blocked := true;
  end;
  perform set_config('announce_test.l08', case when blocked
    then 'PASS|a second reservation for one request_id is refused (23505)'
    else 'FAIL|one request_id reserved twice, so a retry could post twice' end, false);
end
$as_service$;

-- ── As anon ──────────────────────────────────────────────────────────────────
reset role;
set local role anon;

do $as_anon$
declare
  n       int;
  blocked boolean;
begin
  blocked := false;
  begin
    select count(*) into n from public.discord_announce_roles;
  exception when insufficient_privilege then blocked := true;
  end;
  perform set_config('announce_test.a01', case when blocked
    then 'PASS|anon has no privilege on the role table'
    else 'FAIL|anon read the role table' end, false);

  blocked := false;
  begin
    select count(*) into n from public.discord_announcements;
  exception when insufficient_privilege then blocked := true;
  end;
  perform set_config('announce_test.a02', case when blocked
    then 'PASS|anon has no privilege on the log'
    else 'FAIL|anon read the log' end, false);
end
$as_anon$;

-- ── Catalog checks, which see what a behavioural case cannot ─────────────────
reset role;

do $catalog$
declare
  offenders text;
  missing   text;
begin
  -- Every write policy on the role table requires is_admin(), and each of the
  -- three write commands has one (none missing means none broken shut).
  select string_agg(policyname || ' (' || cmd || ')', ', ') into offenders
    from pg_policies
   where schemaname = 'public' and tablename = 'discord_announce_roles'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and ((cmd in ('UPDATE', 'DELETE', 'ALL') and coalesce(qual, '') not like '%is_admin%')
       or (cmd in ('INSERT', 'UPDATE', 'ALL') and coalesce(with_check, '') not like '%is_admin%'));
  select string_agg(c, ', ') into missing
    from unnest(array['INSERT', 'UPDATE', 'DELETE']) c
   where not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'discord_announce_roles' and cmd = c);
  perform set_config('announce_test.p01', case
    when offenders is null and missing is null then 'PASS|insert, update and delete policies all require is_admin()'
    else 'FAIL|' || coalesce('not admin-gated: ' || offenders, '') || coalesce(' missing: ' || missing, '') end, false);

  select string_agg(policyname || ' (' || cmd || ')', ', ') into offenders
    from pg_policies
   where schemaname = 'public' and tablename = 'discord_announcements' and cmd <> 'SELECT';
  perform set_config('announce_test.p02', case when offenders is null
    then 'PASS|the log has a select policy and no write policy of any kind'
    else 'FAIL|write policies on the log: ' || offenders end, false);

  perform set_config('announce_test.p03', case
    when not has_table_privilege('authenticated', 'public.discord_announcements', 'INSERT')
     and not has_table_privilege('authenticated', 'public.discord_announcements', 'UPDATE')
     and not has_table_privilege('authenticated', 'public.discord_announcements', 'DELETE')
     and not has_table_privilege('authenticated', 'public.discord_announce_roles', 'TRUNCATE')
     and not has_table_privilege('anon', 'public.discord_announce_roles', 'SELECT')
     and not has_table_privilege('anon', 'public.discord_announcements', 'SELECT')
     and has_table_privilege('authenticated', 'public.discord_announcements', 'SELECT')
     and has_table_privilege('service_role', 'public.discord_announcements', 'INSERT')
    then 'PASS|authenticated: log select only, no role-table truncate; anon: nothing; service_role: log insert'
    else 'FAIL|privileges differ from the migration: authenticated log insert '
      || has_table_privilege('authenticated', 'public.discord_announcements', 'INSERT')
      || ', anon role-table select ' || has_table_privilege('anon', 'public.discord_announce_roles', 'SELECT')
      || ', service_role log insert ' || has_table_privilege('service_role', 'public.discord_announcements', 'INSERT') end, false);
end
$catalog$;

-- ── The verdicts ─────────────────────────────────────────────────────────────
-- Expected: 24 rows, every one PASS.
select v.n,
       v.check_name as "check",
       coalesce(nullif(split_part(coalesce(current_setting('announce_test.' || v.k, true), ''), '|', 1), ''), 'FAIL') as result,
       coalesce(nullif(substr(coalesce(current_setting('announce_test.' || v.k, true), ''),
                              position('|' in coalesce(current_setting('announce_test.' || v.k, true), '')) + 1), ''),
                'did not run') as detail
  from (values
    ( 1, 'r01', 'roles: a non-staff member cannot read the list'),
    ( 2, 'r02', 'roles: staff CAN read the list (control for 1)'),
    ( 3, 'r03', 'roles: a non-staff member cannot add a role'),
    ( 4, 'r04', 'roles: non-admin staff cannot add a role'),
    ( 5, 'r05', 'roles: an admin CAN add a role (control for 3, 4)'),
    ( 6, 'r06', 'roles: non-admin staff cannot edit a role'),
    ( 7, 'r07', 'roles: an admin CAN edit a role (control for 6)'),
    ( 8, 'r08', 'roles: non-admin staff cannot delete a role'),
    ( 9, 'r09', 'roles: an admin CAN delete a role (control for 8)'),
    (10, 'r10', 'roles: role_id must be a snowflake'),
    (11, 'r11', 'roles: one row per role id'),
    (12, 'l01', 'log: a non-staff member cannot read it'),
    (13, 'l02', 'log: staff CAN read it (control for 12)'),
    (14, 'l03', 'log: no client insert, admin included'),
    (15, 'l04', 'log: no client update, staff included'),
    (16, 'l05', 'log: no client delete, admin included'),
    (17, 'l06', 'log: the service role CAN write it (control for 14)'),
    (18, 'l07', 'log: status, sent and role_ids CHECKs hold'),
    (19, 'l08', 'log: one reservation per request_id'),
    (20, 'a01', 'anon: no access to the role table'),
    (21, 'a02', 'anon: no access to the log'),
    (22, 'p01', 'catalog: every role-table write policy needs is_admin()'),
    (23, 'p02', 'catalog: the log has no write policy'),
    (24, 'p03', 'catalog: privileges match the migration')
  ) as v(n, k, check_name)
 order by v.n;

rollback;
