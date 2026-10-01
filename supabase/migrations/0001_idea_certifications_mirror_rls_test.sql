-- ============================================================
-- 0001_idea_certifications_mirror_rls_test.sql
--
-- Run in the Supabase SQL editor AFTER
-- supabase/migrations/0001_idea_certifications_mirror.sql.
--
-- SAFE ON LIVE DATA: the whole script is one transaction that ends in
-- ROLLBACK. Inside it, it swaps in a throwaway secret (a random value generated
-- at run time and never written down), replaces the mirror with fictional
-- snapshots, and, only if the database has no suitable parent fixture, adds a
-- parent role and a guardian link between two existing members. ALL of that is
-- rolled back: the live key, the live mirror, roles and links are exactly as
-- they were afterwards. It writes nothing to auth.users. It holds the sync's
-- advisory lock for the few seconds it runs, so a real sync arriving in that
-- window waits rather than interleaving.
--
-- HOW TO READ IT: the result grid has one row per check -- check, result
-- (PASS or FAIL), detail -- and a final SUMMARY row. The Supabase editor shows
-- no NOTICE output, so the verdicts are rows. A broken boundary produces a
-- FAIL row; a broken HARNESS (no fixture to test with, migration not applied)
-- raises and aborts instead, because then no row would mean anything.
--
-- This is a MUTATION test: widen "idea_cert_holders read" to using (true), or
-- grant select on idea_cert_sync_key to authenticated, and it must turn red.
-- Every negative check has a positive control beside it, so a policy that is
-- broken SHUT (everyone reads nothing) cannot pass as a policy that works.
-- ============================================================

begin;

-- ── Harness ─────────────────────────────────────────────────────────────────
create temp table _idea_cert_rls (
  seq     serial primary key,
  "check" text not null,
  result  text not null,
  detail  text
) on commit drop;
-- The checks below switch to anon and authenticated mid-block; the result
-- table must stay writable as either.
grant select, insert on _idea_cert_rls to anon, authenticated;
grant usage on sequence _idea_cert_rls_seq_seq to anon, authenticated;

create function pg_temp.rec(p_check text, p_pass boolean, p_detail text) returns void
language sql as $f$
  insert into _idea_cert_rls ("check", result, detail)
  values (p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$f$;

-- Act as a client role. Sets the same claims PostgREST sets, then SET LOCAL
-- ROLE, so every statement until act_as_owner() runs under RLS as that caller.
create function pg_temp.act_as(p_role text, p_sub uuid) returns void
language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
end
$f$;

create function pg_temp.act_as_owner() returns void
language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$f$;

-- Run one statement as whoever we are acting as. Returns 'rows:<n>' or the
-- SQLSTATE it raised, so a refusal and a silent 0-row result read differently.
create function pg_temp.try_sql(p_sql text) returns text
language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'rows:' || n;
exception when others then
  return sqlstate;
end
$f$;

-- count(*) of a query as the current role, or the SQLSTATE it raised.
create function pg_temp.try_count(p_sql text) returns text
language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', p_sql) into n;
  return n::text;
exception when others then
  return sqlstate;
end
$f$;

-- Call the sync as the current role. {"sqlstate": ...} when it raised,
-- {"result": ...} when it returned.
create function pg_temp.try_sync(p_secret text, p_snapshot jsonb) returns jsonb
language plpgsql as $f$
declare r jsonb;
begin
  r := public.idea_cert_sync(p_secret, p_snapshot);
  return jsonb_build_object('result', r);
exception when others then
  return jsonb_build_object('sqlstate', sqlstate);
end
$f$;

-- The mirror's content, synced_at excluded, as one hash. Owner only.
create function pg_temp.mirror_md5() returns text
language sql as $f$
  select md5(
    coalesce((select string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', code, name, level, category,
                definition, allows, does_not_allow, prerequisites, renewal, active, sort_order), E'\n' order by code)
                from public.idea_cert_catalog), '')
    || '##' ||
    coalesce((select string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s', serial, email, holder_name, code, status,
                awarded_at, awarded_by_name, expires_at), E'\n' order by serial)
                from public.idea_cert_holders), ''));
$f$;

create function pg_temp.log_count() returns bigint
language sql as $f$ select count(*) from public.idea_cert_sync_log $f$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ── Preconditions ───────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.idea_cert_catalog') is null
     or to_regclass('public.idea_cert_holders') is null
     or to_regclass('public.idea_cert_sync_log') is null
     or to_regclass('public.idea_cert_sync_key') is null
     or to_regprocedure('public.idea_cert_sync(text, jsonb)') is null then
    raise exception 'Migration 0001 is not applied: run supabase/migrations/0001_idea_certifications_mirror.sql first';
  end if;
  if to_regprocedure('extensions.crypt(text, text)') is null then
    raise exception 'pgcrypto is not in schema extensions: extensions.crypt() is missing';
  end if;
end
$pre$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- A throwaway secret and a wrong one, both random, both gone at rollback.
select set_config('test.secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), true) is not null as secret_generated,
       set_config('test.wrong',  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), true) is not null as wrong_generated,
       set_config('test.nobody', gen_random_uuid()::text, true) is not null as nobody_generated;

insert into public.idea_cert_sync_key (id, secret_hash)
values (true, extensions.crypt(current_setting('test.secret'), extensions.gen_salt('bf')))
on conflict (id) do update set secret_hash = excluded.secret_hash, set_at = now();

do $fixtures$
declare
  v_staff   uuid;
  v_student uuid;
  v_email   text;
  v_parent  uuid;
  v_how     text;
begin
  -- Staff: anyone holding mentor, lead or admin.
  select r.member_id into v_staff
    from public.member_roles r join public.profiles p on p.id = r.member_id
   where r.role in ('mentor', 'lead', 'admin')
   order by r.member_id limit 1;

  -- An ordinary approved member: not staff, not a parent, with a sign-in email.
  -- Prefer one who already has a linked parent, so nothing has to be invented.
  select p.id, lower(u.email) into v_student, v_email
    from public.profiles p join auth.users u on u.id = p.id
   where p.approved and u.email is not null and u.email <> ''
     and not exists (select 1 from public.member_roles r
                      where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin', 'parent'))
   order by exists (
              select 1 from public.guardian_links g
                join public.profiles pp on pp.id = g.parent_id and pp.approved
               where g.student_id = p.id
                 and exists (select 1 from public.member_roles r where r.member_id = pp.id and r.role = 'parent')
                 and not exists (select 1 from public.member_roles r
                                  where r.member_id = pp.id and r.role in ('mentor', 'lead', 'admin'))) desc,
            p.id
   limit 1;

  if v_staff is null then
    raise exception 'Fixture missing: no member holds mentor, lead or admin';
  end if;
  if v_student is null then
    raise exception 'Fixture missing: no approved non-staff, non-parent member with a sign-in email';
  end if;

  -- A parent-only account linked to that student: an existing one if there is
  -- one, else an existing parent we link (rolled back), else an existing
  -- approved member we make a parent and link (rolled back).
  select g.parent_id into v_parent
    from public.guardian_links g join public.profiles pp on pp.id = g.parent_id and pp.approved
   where g.student_id = v_student
     and exists (select 1 from public.member_roles r where r.member_id = g.parent_id and r.role = 'parent')
     and not exists (select 1 from public.member_roles r
                      where r.member_id = g.parent_id and r.role in ('mentor', 'lead', 'admin'))
   order by g.parent_id limit 1;
  v_how := 'existing parent and link';

  if v_parent is null then
    select pp.id into v_parent from public.profiles pp
     where pp.approved and pp.id <> v_student
       and exists (select 1 from public.member_roles r where r.member_id = pp.id and r.role = 'parent')
       and not exists (select 1 from public.member_roles r
                        where r.member_id = pp.id and r.role in ('mentor', 'lead', 'admin'))
     order by pp.id limit 1;
    v_how := 'existing parent, link added for this run';
  end if;
  if v_parent is null then
    select pp.id into v_parent from public.profiles pp
     where pp.approved and pp.id <> v_student
       and not exists (select 1 from public.member_roles r
                        where r.member_id = pp.id and r.role in ('mentor', 'lead', 'admin'))
     order by pp.id limit 1;
    if v_parent is null then
      raise exception 'Fixture missing: need a second approved non-staff member to act as the parent';
    end if;
    insert into public.member_roles (member_id, role) values (v_parent, 'parent') on conflict do nothing;
    v_how := 'member given the parent role and a link for this run';
  end if;
  insert into public.guardian_links (parent_id, student_id) values (v_parent, v_student)
  on conflict do nothing;

  perform set_config('test.staff',   v_staff::text,   true);
  perform set_config('test.student', v_student::text, true);
  perform set_config('test.email',   v_email,         true);
  perform set_config('test.parent',  v_parent::text,  true);
  perform set_config('test.parent_how', v_how,        true);
end
$fixtures$;

-- The snapshots. Fictional throughout except the linked student's email,
-- which has to be real for the parent scoping to be tested at all.
--   S1: three certifications; four holders, two of them the linked student.
--   S2: smaller, replaces S1.
select set_config('test.s1', jsonb_build_object(
  'source_revision', 'rls-test-s1',
  'catalog', jsonb_build_array(
    jsonb_build_object('code', 'RLSTEST-SAFE-1', 'name', 'Test Shop Safety', 'level', 1, 'category', 'Test Safety',
      'definition', 'fixture', 'allows', null, 'does_not_allow', null, 'prerequisites', '[]'::jsonb,
      'renewal', null, 'active', true, 'sort_order', 1),
    jsonb_build_object('code', 'RLSTEST-MECH-1', 'name', 'Test Hand Tools', 'level', 1, 'category', 'Test Mechanical',
      'definition', null, 'allows', null, 'does_not_allow', null, 'prerequisites', '["RLSTEST-SAFE-1"]'::jsonb,
      'renewal', null, 'active', true, 'sort_order', 2),
    jsonb_build_object('code', 'RLSTEST-WELD-2', 'name', 'Test Welding', 'level', 2, 'category', 'Test Mechanical',
      'definition', null, 'allows', null, 'does_not_allow', null, 'prerequisites', '["RLSTEST-SAFE-1"]'::jsonb,
      'renewal', 'yearly', 'active', false, 'sort_order', 3)),
  'holders', jsonb_build_array(
    jsonb_build_object('serial', 'RLSTEST-0001', 'email', current_setting('test.email'), 'holder_name', 'Linked Student',
      'code', 'RLSTEST-SAFE-1', 'status', 'active', 'awarded_at', '2026-09-30T17:00:00Z',
      'awarded_by_name', 'Test Mentor', 'expires_at', null),
    jsonb_build_object('serial', 'RLSTEST-0002', 'email', current_setting('test.email'), 'holder_name', 'Linked Student',
      'code', 'RLSTEST-MECH-1', 'status', 'revoked', 'awarded_at', '2026-09-30T17:05:00Z',
      'awarded_by_name', 'Test Mentor', 'expires_at', '2027-09-30T17:05:00Z'),
    jsonb_build_object('serial', 'RLSTEST-0003', 'email', 'rls.fixture.unlinked@example.invalid', 'holder_name', 'Unlinked Person',
      'code', 'RLSTEST-SAFE-1', 'status', 'active', 'awarded_at', '2026-09-29T16:00:00-07:00',
      'awarded_by_name', 'Test Mentor', 'expires_at', null),
    jsonb_build_object('serial', 'RLSTEST-0004', 'email', 'rls.fixture.other@example.invalid', 'holder_name', 'Other Person',
      'code', 'RLSTEST-WELD-2', 'status', 'suspended', 'awarded_at', '2026-09-28T16:00:00Z',
      'awarded_by_name', 'Test Mentor', 'expires_at', null))
)::text, true) is not null as s1_built;

select set_config('test.s2', jsonb_build_object(
  'source_revision', 'rls-test-s2',
  'catalog', jsonb_build_array(
    jsonb_build_object('code', 'RLSTEST-SAFE-1', 'name', 'Test Shop Safety', 'level', 1, 'category', 'Test Safety',
      'definition', 'fixture, renamed', 'allows', null, 'does_not_allow', null, 'prerequisites', '[]'::jsonb,
      'renewal', null, 'active', true, 'sort_order', 1),
    jsonb_build_object('code', 'RLSTEST-ELEC-1', 'name', 'Test Wiring', 'level', 1, 'category', 'Test Electrical',
      'definition', null, 'allows', null, 'does_not_allow', null, 'prerequisites', '[]'::jsonb,
      'renewal', null, 'active', true, 'sort_order', 2)),
  'holders', jsonb_build_array(
    jsonb_build_object('serial', 'RLSTEST-0003', 'email', 'rls.fixture.unlinked@example.invalid', 'holder_name', 'Unlinked Person',
      'code', 'RLSTEST-ELEC-1', 'status', 'active', 'awarded_at', '2026-09-29T23:00:00Z',
      'awarded_by_name', 'Test Mentor', 'expires_at', null))
)::text, true) is not null as s2_built;

-- ── Checks: the writer ──────────────────────────────────────────────────────
do $writer$
declare
  s1      jsonb := current_setting('test.s1')::jsonb;
  s2      jsonb := current_setting('test.s2')::jsonb;
  r       jsonb;
  r2      jsonb;
  md5_s1  text;
  md5_now text;
  logs    bigint;
  n_cat   bigint;
  n_hold  bigint;
  serials text;
  bad     jsonb;
  label   text;
begin
  -- 1. A good snapshot, applied by the real caller's role (anon). Positive
  --    control for everything that follows: if this fails, every "refused"
  --    below could be a sync that refuses everything.
  logs := pg_temp.log_count();
  perform pg_temp.act_as('anon', null);
  r := pg_temp.try_sync(current_setting('test.secret'), s1);
  perform pg_temp.act_as_owner();
  select count(*) into n_cat from public.idea_cert_catalog;
  select count(*) into n_hold from public.idea_cert_holders;
  select string_agg(serial, ',' order by serial) into serials from public.idea_cert_holders;
  perform pg_temp.rec('good snapshot applied (as anon)',
    (r -> 'result' ->> 'ok') = 'true' and n_cat = 3 and n_hold = 4
      and serials = 'RLSTEST-0001,RLSTEST-0002,RLSTEST-0003,RLSTEST-0004'
      and pg_temp.log_count() = logs + 1
      and exists (select 1 from public.idea_cert_sync_log where ok and source_revision = 'rls-test-s1'),
    format('returned %s; mirror now %s certifications, %s holders (%s)', r, n_cat, n_hold, serials));
  md5_s1 := pg_temp.mirror_md5();

  -- 2. Wrong secret: refused with the generic 28000, NOTHING written, not even
  --    a log row. Tried with the smaller snapshot, so a leak would show.
  logs := pg_temp.log_count();
  perform pg_temp.act_as('anon', null);
  r := pg_temp.try_sync(current_setting('test.wrong'), s2);
  perform pg_temp.act_as('authenticated', current_setting('test.student')::uuid);
  r2 := pg_temp.try_sync(current_setting('test.wrong'), s2);
  perform pg_temp.act_as_owner();
  md5_now := pg_temp.mirror_md5();
  perform pg_temp.rec('wrong secret refused, nothing written',
    r ->> 'sqlstate' = '28000' and r2 ->> 'sqlstate' = '28000'
      and md5_now = md5_s1 and pg_temp.log_count() = logs,
    format('anon got %s, signed-in member got %s; mirror %s; log rows +%s',
      r, r2, case when md5_now = md5_s1 then 'unchanged' else 'CHANGED' end, pg_temp.log_count() - logs));

  -- 3. No secret at all, and an empty one.
  perform pg_temp.act_as('anon', null);
  r  := pg_temp.try_sync(null, s2);
  r2 := pg_temp.try_sync('', s2);
  perform pg_temp.act_as_owner();
  md5_now := pg_temp.mirror_md5();
  perform pg_temp.rec('missing or empty secret refused, nothing written',
    r ->> 'sqlstate' = '28000' and r2 ->> 'sqlstate' = '28000'
      and md5_now = md5_s1 and pg_temp.log_count() = logs,
    format('null got %s, empty got %s; mirror %s', r, r2,
      case when md5_now = md5_s1 then 'unchanged' else 'CHANGED' end));

  -- 4. Invalid snapshots, right secret. Each must be refused WHOLE: the mirror
  --    stays exactly S1 and the refusal is logged (ok = false). The first one
  --    is the case the brief names; it is otherwise S2, so a partial apply
  --    would be visible.
  for label, bad in
    select * from (values
      ('holder whose code is missing from the catalog refused, nothing written',
        jsonb_set(s2, '{holders,0,code}', '"RLSTEST-NOT-IN-CATALOG"')),
      ('holder email not lowercase refused, nothing written',
        jsonb_set(s2, '{holders,0,email}', '"RLS.Fixture.Upper@example.invalid"')),
      ('illegal holder status refused, nothing written',
        jsonb_set(s2, '{holders,0,status}', '"pending"')),
      ('duplicate serials refused, nothing written',
        jsonb_set(s2, '{holders}', (s2 -> 'holders') || (s2 -> 'holders'))),
      ('holder missing a required key refused, nothing written',
        jsonb_set(s2, '{holders,0}', (s2 #> '{holders,0}') - 'awarded_at')),
      ('prerequisite outside the catalog refused, nothing written',
        jsonb_set(s2, '{catalog,1,prerequisites}', '["RLSTEST-NOPE"]')),
      ('timestamp without an offset refused, nothing written',
        jsonb_set(s2, '{holders,0,awarded_at}', '"2026-09-29T23:00:00"')),
      ('snapshot that is not an object refused, nothing written',
        '[]'::jsonb)
    ) as v(label, bad)
  loop
    logs := pg_temp.log_count();
    perform pg_temp.act_as('anon', null);
    r := pg_temp.try_sync(current_setting('test.secret'), bad);
    perform pg_temp.act_as_owner();
    md5_now := pg_temp.mirror_md5();
    perform pg_temp.rec(label,
      (r -> 'result' ->> 'ok') = 'false' and md5_now = md5_s1
        and pg_temp.log_count() = logs + 1
        and exists (select 1 from public.idea_cert_sync_log
                     where id = (r -> 'result' ->> 'log_id')::bigint and ok = false and error is not null),
      format('returned ok=%s, %s problem(s), http %s; mirror %s; log rows +%s',
        r -> 'result' ->> 'ok', r -> 'result' ->> 'problem_count', coalesce(current_setting('response.status', true), '-'),
        case when md5_now = md5_s1 then 'unchanged' else 'CHANGED' end, pg_temp.log_count() - logs));
    perform set_config('response.status', '', true);
  end loop;

  -- 5. A smaller snapshot REPLACES the larger one: S1-only rows are gone.
  perform pg_temp.act_as('anon', null);
  r := pg_temp.try_sync(current_setting('test.secret'), s2);
  perform pg_temp.act_as_owner();
  select string_agg(code, ',' order by code) into serials from public.idea_cert_catalog;
  select count(*) into n_hold from public.idea_cert_holders;
  perform pg_temp.rec('smaller snapshot replaces the larger one',
    (r -> 'result' ->> 'ok') = 'true' and serials = 'RLSTEST-ELEC-1,RLSTEST-SAFE-1' and n_hold = 1
      and (select code from public.idea_cert_holders where serial = 'RLSTEST-0003') = 'RLSTEST-ELEC-1'
      and not exists (select 1 from public.idea_cert_holders where serial in ('RLSTEST-0001', 'RLSTEST-0002', 'RLSTEST-0004')),
    format('catalog now %s; holders now %s', serials, n_hold));

  -- 6. The same snapshot twice gives the same mirror (idempotent).
  md5_now := pg_temp.mirror_md5();
  perform pg_temp.act_as('anon', null);
  r := pg_temp.try_sync(current_setting('test.secret'), s2);
  perform pg_temp.act_as_owner();
  perform pg_temp.rec('same snapshot twice is idempotent',
    (r -> 'result' ->> 'ok') = 'true' and pg_temp.mirror_md5() = md5_now,
    format('second apply returned ok=%s; mirror %s', r -> 'result' ->> 'ok',
      case when pg_temp.mirror_md5() = md5_now then 'identical' else 'DIFFERENT' end));

  -- Back to S1 for the read checks.
  perform pg_temp.act_as('anon', null);
  r := pg_temp.try_sync(current_setting('test.secret'), s1);
  perform pg_temp.act_as_owner();
  if (r -> 'result' ->> 'ok') is distinct from 'true' then
    raise exception 'Harness broken: could not restore snapshot S1 for the read checks: %', r;
  end if;
end
$writer$;

-- ── Checks: who reads what ──────────────────────────────────────────────────
do $readers$
declare
  cat  text; hold text; logn text; mine text; other text; keyn text;
  cat2 text; hold2 text; logn2 text; keyn2 text;
begin
  -- 7. An ordinary approved member reads the whole catalog and every holder.
  perform pg_temp.act_as('authenticated', current_setting('test.student')::uuid);
  if public.is_staff() or not public.idea_cert_reads_all() then
    raise exception 'Harness broken: the member fixture resolves as staff, or is not an approved non-parent';
  end if;
  cat  := pg_temp.try_count('select 1 from public.idea_cert_catalog');
  hold := pg_temp.try_count('select 1 from public.idea_cert_holders');
  logn := pg_temp.try_count('select 1 from public.idea_cert_sync_log');
  keyn := pg_temp.try_count('select 1 from public.idea_cert_sync_key');
  perform pg_temp.act_as_owner();
  perform pg_temp.rec('approved member reads the catalog and every holder',
    cat = '3' and hold = '4', format('catalog %s of 3, holders %s of 4', cat, hold));

  -- 8. Staff read everything including the log (positive control for 9).
  perform pg_temp.act_as('authenticated', current_setting('test.staff')::uuid);
  if not public.is_staff() then
    raise exception 'Harness broken: the staff fixture does not resolve is_staff()';
  end if;
  cat2  := pg_temp.try_count('select 1 from public.idea_cert_catalog');
  hold2 := pg_temp.try_count('select 1 from public.idea_cert_holders');
  logn2 := pg_temp.try_count('select 1 from public.idea_cert_sync_log');
  keyn2 := pg_temp.try_count('select 1 from public.idea_cert_sync_key');
  perform pg_temp.act_as_owner();
  perform pg_temp.rec('staff read the catalog, every holder and the sync log',
    cat2 = '3' and hold2 = '4' and logn2 ~ '^\d+$' and logn2::bigint >= 1,
    format('catalog %s, holders %s, log rows %s', cat2, hold2, logn2));

  -- 9. The sync log is staff-only.
  perform pg_temp.rec('approved member reads no sync log row',
    logn = '0' and logn2 ~ '^\d+$' and logn2::bigint >= 1,
    format('member sees %s log rows; staff see %s (positive control)', logn, logn2));

  -- 10. The key table: unreadable to every client role, staff included.
  perform pg_temp.rec('key table unreadable to authenticated (member and staff)',
    keyn = '42501' and keyn2 = '42501'
      and (select count(*) from public.idea_cert_sync_key) = 1,
    format('member got %s, staff got %s; the owner sees %s row (positive control)', keyn, keyn2,
      (select count(*) from public.idea_cert_sync_key)));

  -- 11. A parent-only account reads ONLY their linked student's rows.
  perform pg_temp.act_as('authenticated', current_setting('test.parent')::uuid);
  if public.idea_cert_reads_all() then
    raise exception 'Harness broken: the parent fixture resolves as a full reader (staff, or not a parent)';
  end if;
  cat   := pg_temp.try_count('select 1 from public.idea_cert_catalog');
  mine  := pg_temp.try_count(format('select 1 from public.idea_cert_holders where email = %L', current_setting('test.email')));
  other := pg_temp.try_count(format('select 1 from public.idea_cert_holders where email <> %L', current_setting('test.email')));
  logn  := pg_temp.try_count('select 1 from public.idea_cert_sync_log');
  perform pg_temp.act_as_owner();
  perform pg_temp.rec('parent reads only their linked student''s holder rows',
    mine = '2' and other = '0',
    format('linked student''s rows %s of 2, anyone else''s %s (must be 0); fixture: %s',
      mine, other, current_setting('test.parent_how')));
  perform pg_temp.rec('parent reads the catalog but not the sync log',
    cat = '3' and logn = '0', format('catalog %s of 3, log rows %s', cat, logn));

  -- 12. A signed-in account with no approved profile reads nothing.
  perform pg_temp.act_as('authenticated', current_setting('test.nobody')::uuid);
  cat  := pg_temp.try_count('select 1 from public.idea_cert_catalog');
  hold := pg_temp.try_count('select 1 from public.idea_cert_holders');
  logn := pg_temp.try_count('select 1 from public.idea_cert_sync_log');
  perform pg_temp.act_as_owner();
  perform pg_temp.rec('account with no approved profile reads nothing',
    cat = '0' and hold = '0' and logn = '0',
    format('catalog %s, holders %s, log %s (members above read 3 and 4)', cat, hold, logn));

  -- 13. anon reads nothing: no table privilege at all.
  perform pg_temp.act_as('anon', null);
  cat  := pg_temp.try_count('select 1 from public.idea_cert_catalog');
  hold := pg_temp.try_count('select 1 from public.idea_cert_holders');
  logn := pg_temp.try_count('select 1 from public.idea_cert_sync_log');
  keyn := pg_temp.try_count('select 1 from public.idea_cert_sync_key');
  perform pg_temp.act_as_owner();
  perform pg_temp.rec('anon reads nothing',
    cat = '42501' and hold = '42501' and logn = '42501' and keyn = '42501',
    format('catalog %s, holders %s, log %s, key %s', cat, hold, logn, keyn));
end
$readers$;

-- ── Checks: nobody writes directly ──────────────────────────────────────────
do $writes$
declare
  who     record;
  stmt    text;
  got     text;
  results text;
  pass    boolean;
  before  text;
  logs    bigint;
  keyhash text;
  stmts   text[] := array[
    $s$insert into public.idea_cert_catalog (code, name, level, category, synced_at) values ('RLSTEST-X', 'x', 1, 'x', now())$s$,
    $s$update public.idea_cert_catalog set name = 'tampered' where true$s$,
    $s$delete from public.idea_cert_catalog where true$s$,
    $s$insert into public.idea_cert_holders (serial, email, holder_name, code, status, awarded_at, awarded_by_name, synced_at) values ('RLSTEST-X', 'x@example.invalid', 'x', 'RLSTEST-SAFE-1', 'active', now(), 'x', now())$s$,
    $s$update public.idea_cert_holders set status = 'active' where true$s$,
    $s$delete from public.idea_cert_holders where true$s$,
    $s$insert into public.idea_cert_sync_log (ok) values (true)$s$,
    $s$update public.idea_cert_sync_log set ok = true where true$s$,
    $s$delete from public.idea_cert_sync_log where true$s$,
    $s$update public.idea_cert_sync_key set secret_hash = 'tampered' where true$s$,
    $s$insert into public.idea_cert_sync_key (id, secret_hash) values (true, 'tampered') on conflict (id) do update set secret_hash = 'tampered' where true$s$,
    $s$delete from public.idea_cert_sync_key where true$s$];
begin
  -- 14. Every direct write, as a member, as staff and as anon. Two outcomes
  --     are acceptable -- 42501 (refused at the grant layer, loud) or 0 rows
  --     (no policy matched, silent) -- and the detail says which. The only
  --     failure is a statement that changed something.
  for who in
    select * from (values ('member', 'authenticated', current_setting('test.student')),
                          ('staff',  'authenticated', current_setting('test.staff')),
                          ('anon',   'anon',          null)) as v(label, role, sub)
  loop
    -- Baseline per role, so each row reports only its own writes.
    before  := pg_temp.mirror_md5();
    logs    := pg_temp.log_count();
    keyhash := (select secret_hash from public.idea_cert_sync_key);
    results := '';
    pass := true;
    foreach stmt in array stmts loop
      perform pg_temp.act_as(who.role, who.sub::uuid);
      got := pg_temp.try_sql(stmt);
      perform pg_temp.act_as_owner();
      if got not in ('42501', 'rows:0') then pass := false; end if;
      results := results || got || ' ';
    end loop;
    pass := pass and pg_temp.mirror_md5() = before and pg_temp.log_count() = logs
                 and (select secret_hash from public.idea_cert_sync_key) = keyhash;
    perform pg_temp.rec(format('no direct insert, update or delete (%s)', who.label), pass,
      format('12 statements returned: %s; mirror, log and key %s', btrim(results),
        case when pass then 'unchanged' else 'CHECK THEM' end));
  end loop;
end
$writes$;

-- 15. Structural: no write policy exists on any of the four tables, and no
--     client role holds a write privilege. This is what isolates a write
--     policy from the select policy that would otherwise mask it.
insert into _idea_cert_rls ("check", result, detail)
select 'no write policy and no write grant on any mirror table',
       case when pol = 0 and grants = 0 then 'PASS' else 'FAIL' end,
       format('%s non-SELECT policies, %s client write privileges (both must be 0)', pol, grants)
  from (select (select count(*) from pg_policies
                 where schemaname = 'public'
                   and tablename in ('idea_cert_catalog', 'idea_cert_holders', 'idea_cert_sync_log', 'idea_cert_sync_key')
                   and cmd <> 'SELECT') as pol,
               (select count(*) from unnest(array['anon', 'authenticated']) r
                 cross join unnest(array['public.idea_cert_catalog', 'public.idea_cert_holders',
                                         'public.idea_cert_sync_log', 'public.idea_cert_sync_key']) t
                 cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
                 where has_table_privilege(r, t, p)) as grants) s;

-- 16. Who may call what. The sync MUST be callable by anon (that is how the
--     IDEA server reaches it); the helpers must not be callable by anon.
insert into _idea_cert_rls ("check", result, detail)
select 'execute grants: sync open to anon and authenticated, helpers not to anon',
       case when sync_anon and sync_auth and not helper_anon and helper_auth then 'PASS' else 'FAIL' end,
       format('sync: anon %s, authenticated %s; helpers: anon %s, authenticated %s',
              sync_anon, sync_auth, helper_anon, helper_auth)
  from (select has_function_privilege('anon', 'public.idea_cert_sync(text, jsonb)', 'EXECUTE') as sync_anon,
               has_function_privilege('authenticated', 'public.idea_cert_sync(text, jsonb)', 'EXECUTE') as sync_auth,
               has_function_privilege('anon', 'public.idea_cert_reads_all()', 'EXECUTE')
                 or has_function_privilege('anon', 'public.idea_cert_reads_catalog()', 'EXECUTE')
                 or has_function_privilege('anon', 'public.idea_cert_guardian_emails()', 'EXECUTE') as helper_anon,
               has_function_privilege('authenticated', 'public.idea_cert_reads_all()', 'EXECUTE')
                 and has_function_privilege('authenticated', 'public.idea_cert_reads_catalog()', 'EXECUTE')
                 and has_function_privilege('authenticated', 'public.idea_cert_guardian_emails()', 'EXECUTE') as helper_auth) s;

-- ── The verdicts ────────────────────────────────────────────────────────────
-- Expected: every row PASS, and the SUMMARY row says 0 FAIL.
select "check", result, detail from (
  select seq, "check", result, detail from _idea_cert_rls
  union all
  select 1000000, 'SUMMARY',
         case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
         format('%s checks, %s FAIL', count(*), count(*) filter (where result <> 'PASS'))
    from _idea_cert_rls
) v order by seq;

rollback;

-- Nothing is left behind: the live key, mirror, log, roles and links are as
-- they were. Confirm with:
--   select count(*) from public.idea_cert_sync_log;   -- unchanged by this script
