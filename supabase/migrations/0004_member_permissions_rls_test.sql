-- ============================================================
-- 0004_member_permissions RLS test
--
-- Run in the Supabase SQL editor AFTER 0004_member_permissions.sql.
-- SAFE ON LIVE DATA: the whole script is one transaction that ends in
-- ROLLBACK. The grants, events and helper functions it creates never persist,
-- and because the events it inserts never commit, neither the hourly Discord
-- poster nor anyone's calendar ever sees them (the schedule_change trigger's
-- queued pg_net request is rolled back with them). It writes nothing to
-- auth.users and changes no existing row outside the transaction.
--
-- HOW TO READ IT: the result grid has ONE ROW PER CHECK -- check, result
-- (PASS / FAIL / SKIP) and detail -- plus a final "summary" row. The Supabase
-- editor shows no NOTICE output, so verdicts are rows rather than messages,
-- and a broken boundary is a FAIL row rather than an abort: every check runs
-- and reports. The script only aborts outright when it cannot test at all
-- (0004 not applied, or no admin / no two non-staff members to act as).
--
-- Each outcome is recorded as ok:<rows affected> or err:<SQLSTATE>, so the
-- detail column says WHICH kind of refusal happened: err:42501 is a loud
-- refusal (a revoked privilege, an RLS WITH CHECK violation, or the admin
-- check inside an RPC); ok:0 is the silent one (no permissive USING clause
-- matched the row). Each check names which one it requires.
--
-- This is a MUTATION test: widen any one boundary on purpose -- e.g. the
-- update policy to using (true), or grant insert on member_permissions back to
-- authenticated -- and at least one row here must turn FAIL. Several checks
-- are POSITIVE controls (a holder CAN add, staff CAN still do everything), so
-- a policy broken shut cannot make the negative checks pass for free.
--
-- Actors, picked from live data by role:
--   admin      a member holding 'admin'
--   staff      a mentor or lead who is NOT admin, else the admin
--   holder     a non-staff member (a student if there is one), granted
--              'events.create' by the admin inside this transaction
--   other      a second non-staff member who does NOT hold 'events.create'
-- ============================================================

begin;

-- First, before anything names the new objects: a script that dies on a raw
-- "relation does not exist" reads like a broken test, not a missing migration.
do $applied$
begin
  if to_regclass('public.member_permissions') is null
     or to_regclass('public.capabilities') is null
     or to_regprocedure('public.has_capability(text)') is null
     or to_regprocedure('public.admin_grant_capability(uuid, text)') is null
     or to_regprocedure('public.admin_revoke_capability(uuid, text)') is null then
    raise exception 'Cannot test: 0004_member_permissions.sql has not been applied';
  end if;
end
$applied$;

create temp table t0004_results (
  n          int  primary key,
  check_name text not null,
  result     text not null,
  detail     text
) on commit drop;

create temp table t0004_fx (
  admin_id          uuid,
  staff_id          uuid,
  nonadmin_staff_id uuid,
  holder_id         uuid,
  other_id          uuid,
  ev_staff          uuid default gen_random_uuid(),
  ev_h1             uuid default gen_random_uuid(),
  ev_h2             uuid default gen_random_uuid(),
  ev_h3             uuid default gen_random_uuid(),
  ev_s2             uuid default gen_random_uuid()
) on commit drop;

insert into t0004_fx (admin_id, nonadmin_staff_id, holder_id)
select
  (select r.member_id from public.member_roles r
    where r.role = 'admin' order by r.member_id limit 1),
  (select r.member_id from public.member_roles r
    where r.role in ('mentor', 'lead')
      and not exists (select 1 from public.member_roles a
                       where a.member_id = r.member_id and a.role = 'admin')
    order by r.member_id limit 1),
  (select p.id from public.profiles p
    where not exists (select 1 from public.member_roles s
                       where s.member_id = p.id and s.role in ('mentor', 'lead', 'admin'))
    order by exists (select 1 from public.member_roles st
                      where st.member_id = p.id and st.role = 'student') desc, p.id
    limit 1);

update t0004_fx set
  staff_id = coalesce(nonadmin_staff_id, admin_id),
  other_id = (select p.id from public.profiles p
               where p.id <> t0004_fx.holder_id
                 and not exists (select 1 from public.member_roles s
                                  where s.member_id = p.id and s.role in ('mentor', 'lead', 'admin'))
                 and not exists (select 1 from public.member_permissions mp
                                  where mp.member_id = p.id and mp.capability = 'events.create')
               order by p.id limit 1);

do $pre$
declare f t0004_fx;
begin
  select * into f from t0004_fx;
  if f.admin_id is null then
    raise exception 'Cannot test: no member holds the admin role, so the grant RPC has no positive control';
  end if;
  if f.holder_id is null or f.other_id is null then
    raise exception 'Cannot test: need two non-staff members (one not already holding events.create)';
  end if;
end
$pre$;

-- -- Helpers (pg_temp: they vanish with the transaction) ----------------------

-- Become p_who for the statements that follow (null = anon). auth.uid() reads
-- request.jwt.claim.sub or request.jwt.claims->>'sub'; both are set.
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

-- Run one statement as p_who; 'ok:<row_count>' or 'err:<SQLSTATE>'. The role
-- is set BEFORE the exception block (an error rolls back GUCs set inside it)
-- and restored before returning, so the caller is the table owner again.
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

-- The first column of a one-row query as p_who, as text; 'err:<SQLSTATE>' on error.
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
  insert into t0004_results values
    (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

create function pg_temp.ev_insert(p_id uuid, p_created_by uuid, p_mandatory boolean)
returns text language sql as $fn$
  select format(
    'insert into public.events (id, title, kind, starts_at, ends_at, created_by, mandatory) '
    || 'values (%L, %L, ''meeting'', now() + interval ''30 days'', '
    || 'now() + interval ''30 days 2 hours'', %L, %L)',
    p_id, 'rls-0004 fixture', p_created_by, p_mandatory);
$fn$;

-- Setup as the table owner (bypasses RLS): one event a staff member added.
insert into public.events (id, title, kind, starts_at, ends_at, created_by)
select ev_staff, 'rls-0004 fixture staff', 'meeting',
       now() + interval '30 days', now() + interval '30 days 2 hours', staff_id
  from t0004_fx;

-- -- The grant / revoke RPCs and the member_permissions table -----------------
do $grants$
declare f t0004_fx; o text; o2 text; cnt int;
begin
  select * into f from t0004_fx;

  o := pg_temp.run_as(f.admin_id,
         format('select public.admin_grant_capability(%L, %L)', f.holder_id, 'events.create'));
  select count(*) into cnt from public.member_permissions
   where member_id = f.holder_id and capability = 'events.create';
  perform pg_temp.rec(1, 'admin CAN grant through admin_grant_capability (positive control)',
    o like 'ok:%' and cnt = 1, format('call %s; holder grant rows after: %s', o, cnt));

  o := pg_temp.run_as(f.other_id,
         format('select public.admin_grant_capability(%L, %L)', f.other_id, 'events.create'));
  select count(*) into cnt from public.member_permissions where member_id = f.other_id;
  perform pg_temp.rec(2, 'a non-admin member cannot grant themselves (refused inside the RPC)',
    o = 'err:42501' and cnt = 0, format('call %s (want err:42501); other grant rows: %s', o, cnt));

  if f.nonadmin_staff_id is null then
    insert into t0004_results values (3, 'a non-admin STAFF member cannot grant', 'SKIP',
      'no mentor or lead without admin exists to act as');
  else
    o := pg_temp.run_as(f.nonadmin_staff_id,
           format('select public.admin_grant_capability(%L, %L)', f.other_id, 'events.create'));
    select count(*) into cnt from public.member_permissions where member_id = f.other_id;
    perform pg_temp.rec(3, 'a non-admin STAFF member cannot grant (staff is not admin)',
      o = 'err:42501' and cnt = 0, format('call %s (want err:42501); other grant rows: %s', o, cnt));
  end if;

  o := pg_temp.run_as(f.other_id,
         format('select public.admin_revoke_capability(%L, %L)', f.holder_id, 'events.create'));
  select count(*) into cnt from public.member_permissions
   where member_id = f.holder_id and capability = 'events.create';
  perform pg_temp.rec(4, 'a non-admin member cannot revoke someone else''s grant',
    o = 'err:42501' and cnt = 1, format('call %s (want err:42501); holder grant rows: %s', o, cnt));

  o  := pg_temp.run_as(f.other_id, format(
          'insert into public.member_permissions (member_id, capability) values (%L, %L)',
          f.other_id, 'events.create'));
  o2 := pg_temp.run_as(f.admin_id, format(
          'insert into public.member_permissions (member_id, capability) values (%L, %L)',
          f.other_id, 'events.create'));
  select count(*) into cnt from public.member_permissions where member_id = f.other_id;
  perform pg_temp.rec(5, 'direct INSERT into member_permissions is refused loudly, admin included',
    o = 'err:42501' and o2 = 'err:42501' and cnt = 0,
    format('member %s, admin %s (want err:42501 both); other grant rows: %s', o, o2, cnt));

  o  := pg_temp.run_as(f.holder_id, format(
          'delete from public.member_permissions where member_id = %L', f.holder_id));
  o2 := pg_temp.run_as(f.admin_id, format(
          'update public.member_permissions set granted_by = null where member_id = %L', f.holder_id));
  select count(*) into cnt from public.member_permissions
   where member_id = f.holder_id and capability = 'events.create';
  perform pg_temp.rec(6, 'direct DELETE / UPDATE on member_permissions is refused loudly, never 0 rows',
    o = 'err:42501' and o2 = 'err:42501' and cnt = 1,
    format('holder delete %s, admin update %s (want err:42501 both); holder grant rows: %s', o, o2, cnt));

  o := pg_temp.val_as(f.holder_id, format(
         'select count(*) from public.member_permissions where member_id = %L', f.holder_id));
  perform pg_temp.rec(7, 'the holder CAN read their own grant (positive control)',
    o = '1', format('holder sees %s own row(s) (want 1)', o));

  o := pg_temp.val_as(f.other_id, format(
         'select count(*) from public.member_permissions where member_id = %L', f.holder_id));
  perform pg_temp.rec(8, 'another member cannot read the holder''s grant',
    o = '0', format('other sees %s of the holder''s rows (want 0)', o));

  o := pg_temp.val_as(f.staff_id, format(
         'select count(*) from public.member_permissions where member_id = %L', f.holder_id));
  perform pg_temp.rec(9, 'staff CAN read every grant (positive control, the roster)',
    o = '1', format('staff sees %s of the holder''s rows (want 1)', o));

  o  := pg_temp.val_as(f.holder_id, 'select public.has_capability(''events.create'')');
  o2 := pg_temp.val_as(f.other_id,  'select public.has_capability(''events.create'')');
  perform pg_temp.rec(10, 'has_capability(): holder true, non-holder false, staff true',
    o = 'true' and o2 = 'false'
      and pg_temp.val_as(f.staff_id, 'select public.has_capability(''events.create'')') = 'true',
    format('holder %s, other %s, staff %s', o, o2,
      pg_temp.val_as(f.staff_id, 'select public.has_capability(''events.create'')')));
end
$grants$;

-- -- public.events: inserts ----------------------------------------------------
do $inserts$
declare f t0004_fx; o text; o2 text; cnt int;
begin
  select * into f from t0004_fx;

  o  := pg_temp.run_as(f.holder_id, pg_temp.ev_insert(f.ev_h1, f.holder_id, false));
  o2 := pg_temp.run_as(f.holder_id, pg_temp.ev_insert(f.ev_h2, f.holder_id, false));
  perform pg_temp.run_as(f.holder_id, pg_temp.ev_insert(f.ev_h3, f.holder_id, false));
  select count(*) into cnt from public.events where id in (f.ev_h1, f.ev_h2, f.ev_h3);
  perform pg_temp.rec(11, 'the holder CAN add an event as themselves (positive control)',
    o = 'ok:1' and o2 = 'ok:1' and cnt = 3, format('inserts %s, %s; rows landed: %s of 3', o, o2, cnt));

  o := pg_temp.run_as(f.other_id, pg_temp.ev_insert(gen_random_uuid(), f.other_id, false));
  select count(*) into cnt from public.events where created_by = f.other_id and title = 'rls-0004 fixture';
  perform pg_temp.rec(12, 'a non-holder student cannot add an event (RLS WITH CHECK, loud)',
    o = 'err:42501' and cnt = 0, format('insert %s (want err:42501); rows landed: %s', o, cnt));

  o  := pg_temp.run_as(f.holder_id, pg_temp.ev_insert(gen_random_uuid(), f.other_id, false));
  o2 := pg_temp.run_as(f.holder_id, pg_temp.ev_insert(gen_random_uuid(), null, false));
  select count(*) into cnt from public.events
   where title = 'rls-0004 fixture' and (created_by is distinct from f.holder_id);
  perform pg_temp.rec(13, 'the holder cannot add an event as someone else, or as nobody',
    o = 'err:42501' and o2 = 'err:42501' and cnt = 0,
    format('created_by=other %s, created_by=null %s (want err:42501 both); rows landed: %s', o, o2, cnt));

  o := pg_temp.run_as(f.holder_id, pg_temp.ev_insert(gen_random_uuid(), f.holder_id, true));
  select count(*) into cnt from public.events where title = 'rls-0004 fixture' and mandatory;
  perform pg_temp.rec(14, 'the holder cannot add a MANDATORY event (staff only)',
    o = 'err:42501' and cnt = 0, format('insert %s (want err:42501); rows landed: %s', o, cnt));
end
$inserts$;

-- -- public.events: updates and deletes ---------------------------------------
do $edits$
declare f t0004_fx; o text; o2 text; t text; cnt int; who uuid; m boolean;
begin
  select * into f from t0004_fx;

  o := pg_temp.run_as(f.holder_id, format(
         'update public.events set title = %L where id = %L', 'rls-0004 holder edit', f.ev_h1));
  select title into t from public.events where id = f.ev_h1;
  perform pg_temp.rec(15, 'the holder CAN edit an event they added (positive control)',
    o = 'ok:1' and t = 'rls-0004 holder edit', format('update %s; title now %L', o, t));

  -- events are select using (true), so this UPDATE finds the row and only the
  -- holder update policy's USING clause stands between it and the change.
  o := pg_temp.run_as(f.holder_id, format(
         'update public.events set title = %L where id = %L', 'rls-0004 HIJACK', f.ev_staff));
  select title into t from public.events where id = f.ev_staff;
  perform pg_temp.rec(16, 'the holder cannot edit an event somebody else added (silent, 0 rows)',
    o = 'ok:0' and t = 'rls-0004 fixture staff', format('update %s (want ok:0); staff title now %L', o, t));

  o  := pg_temp.run_as(f.holder_id, format(
          'update public.events set created_by = %L where id = %L', f.other_id, f.ev_h1));
  o2 := pg_temp.run_as(f.holder_id, format(
          'update public.events set mandatory = true where id = %L', f.ev_h1));
  select created_by, mandatory into who, m from public.events where id = f.ev_h1;
  perform pg_temp.rec(17, 'the holder cannot hand an event to someone else or make it mandatory',
    o = 'err:42501' and o2 = 'err:42501' and who = f.holder_id and not m,
    format('reassign %s, mandatory %s (want err:42501 both); created_by is holder: %s, mandatory: %s',
      o, o2, who = f.holder_id, m));

  o := pg_temp.run_as(f.holder_id, format('delete from public.events where id = %L', f.ev_staff));
  select count(*) into cnt from public.events where id = f.ev_staff;
  perform pg_temp.rec(18, 'the holder cannot delete an event somebody else added (silent, 0 rows)',
    o = 'ok:0' and cnt = 1, format('delete %s (want ok:0); staff event still there: %s', o, cnt = 1));

  o  := pg_temp.run_as(f.other_id, format(
          'update public.events set title = %L where id = %L', 'rls-0004 HIJACK', f.ev_h1));
  o2 := pg_temp.run_as(f.other_id, format('delete from public.events where id = %L', f.ev_h1));
  select title into t from public.events where id = f.ev_h1;
  perform pg_temp.rec(19, 'a non-holder cannot edit or delete the holder''s event',
    o = 'ok:0' and o2 = 'ok:0' and t = 'rls-0004 holder edit',
    format('update %s, delete %s (want ok:0 both); title now %L', o, o2, t));

  -- Staff keep every right they had: add as anyone, mark mandatory, edit and
  -- delete anyone's event, a holder's included.
  o := pg_temp.run_as(f.staff_id, pg_temp.ev_insert(f.ev_s2, f.other_id, true));
  o2 := pg_temp.run_as(f.staff_id, format(
          'update public.events set mandatory = true, title = %L where id = %L', 'rls-0004 staff took over', f.ev_h3));
  t := pg_temp.run_as(f.staff_id, format(
         'update public.events set title = %L where id = %L', 'rls-0004 staff edit', f.ev_staff));
  perform pg_temp.rec(20, 'staff are unaffected: add as anyone, mandatory, edit anyone''s (positive control)',
    o = 'ok:1' and o2 = 'ok:1' and t = 'ok:1'
      and pg_temp.run_as(f.staff_id, format('delete from public.events where id = %L', f.ev_s2)) = 'ok:1',
    format('insert-as-other+mandatory %s, edit holder event %s, edit own %s, delete (want ok:1 all)', o, o2, t));

  o  := pg_temp.run_as(f.holder_id, format(
          'update public.events set title = %L where id = %L', 'rls-0004 HIJACK', f.ev_h3));
  o2 := pg_temp.run_as(f.holder_id, format('delete from public.events where id = %L', f.ev_h3));
  select title into t from public.events where id = f.ev_h3;
  perform pg_temp.rec(21, 'once staff mark a holder''s event mandatory, the holder can no longer edit or delete it',
    o = 'ok:0' and o2 = 'ok:0' and t = 'rls-0004 staff took over',
    format('update %s, delete %s (want ok:0 both); title now %L', o, o2, t));

  o := pg_temp.run_as(f.holder_id, format('delete from public.events where id = %L', f.ev_h1));
  select count(*) into cnt from public.events where id = f.ev_h1;
  perform pg_temp.rec(22, 'the holder CAN delete an event they added (positive control)',
    o = 'ok:1' and cnt = 0, format('delete %s; rows left: %s', o, cnt));
end
$edits$;

-- -- public.events: upsert -----------------------------------------------------
-- supabase-js .upsert() is INSERT ... ON CONFLICT DO UPDATE. On the conflict
-- path Postgres skips the INSERT policy and applies the UPDATE policy to the
-- EXISTING row -- and raises rather than skipping it -- so this is its own
-- boundary, not a repeat of 16. The positive control upserts the holder's own
-- event (notes only: check 23 still reads its title).
do $upsert$
declare f t0004_fx; o text; o2 text; before text; t text; nt text;
begin
  select * into f from t0004_fx;
  select title into before from public.events where id = f.ev_staff;

  o := pg_temp.run_as(f.holder_id, format(
         'insert into public.events (id, title, kind, starts_at, ends_at, created_by) '
         || 'values (%L, %L, ''meeting'', now(), now() + interval ''1 hour'', %L) '
         || 'on conflict (id) do update set title = excluded.title',
         f.ev_staff, 'rls-0004 HIJACK', f.holder_id));
  select title into t from public.events where id = f.ev_staff;

  o2 := pg_temp.run_as(f.holder_id, format(
          'insert into public.events (id, title, kind, starts_at, ends_at, created_by) '
          || 'values (%L, %L, ''meeting'', now(), now() + interval ''1 hour'', %L) '
          || 'on conflict (id) do update set notes = %L',
          f.ev_h2, 'rls-0004 ignored', f.holder_id, 'rls-0004 upsert'));
  select notes into nt from public.events where id = f.ev_h2;

  perform pg_temp.rec(29, 'an upsert cannot take over somebody else''s event; it CAN update the holder''s own (positive control)',
    o = 'err:42501' and t is not distinct from before and o2 = 'ok:1' and nt = 'rls-0004 upsert',
    format('upsert onto staff event %s (want err:42501), title unchanged: %s; upsert onto own %s (want ok:1), notes now %L',
      o, t is not distinct from before, o2, nt));
end
$upsert$;

-- -- Revoke --------------------------------------------------------------------
do $revoke$
declare f t0004_fx; o text; cap text; ins text; upd text; del text; cnt int; t text;
begin
  select * into f from t0004_fx;

  o := pg_temp.run_as(f.admin_id,
         format('select public.admin_revoke_capability(%L, %L)', f.holder_id, 'events.create'));
  select count(*) into cnt from public.member_permissions
   where member_id = f.holder_id and capability = 'events.create';
  cap := pg_temp.val_as(f.holder_id, 'select public.has_capability(''events.create'')');
  ins := pg_temp.run_as(f.holder_id, pg_temp.ev_insert(gen_random_uuid(), f.holder_id, false));
  upd := pg_temp.run_as(f.holder_id, format(
           'update public.events set title = %L where id = %L', 'rls-0004 after revoke', f.ev_h2));
  del := pg_temp.run_as(f.holder_id, format('delete from public.events where id = %L', f.ev_h2));
  select title into t from public.events where id = f.ev_h2;
  perform pg_temp.rec(23, 'revoke takes effect at once: no add, no edit or delete of their own events',
    o like 'ok:%' and cnt = 0 and cap = 'false' and ins = 'err:42501' and upd = 'ok:0' and del = 'ok:0'
      and t = 'rls-0004 fixture',
    format('revoke %s, grant rows %s, has_capability %s, add %s (want err:42501), edit %s, delete %s (want ok:0), own event intact: %s',
      o, cnt, cap, ins, upd, del, t = 'rls-0004 fixture'));
end
$revoke$;

-- -- anon ----------------------------------------------------------------------
do $anon$
declare f t0004_fx; a text; b text; c text; d text; e text;
begin
  select * into f from t0004_fx;
  a := pg_temp.val_as(null, 'select count(*) from public.member_permissions');
  b := pg_temp.val_as(null, 'select count(*) from public.capabilities');
  c := pg_temp.val_as(null, 'select public.has_capability(''events.create'')');
  d := pg_temp.run_as(null, format('select public.admin_grant_capability(%L, %L)', f.other_id, 'events.create'));
  e := pg_temp.run_as(null, pg_temp.ev_insert(gen_random_uuid(), f.other_id, false));
  perform pg_temp.rec(24, 'anon has nothing: no read, no function, no grant, no event insert',
    a = 'err:42501' and b = 'err:42501' and c = 'err:42501' and d = 'err:42501' and e = 'err:42501',
    format('read grants %s, read capabilities %s, has_capability %s, grant %s, insert event %s (want err:42501 all)',
      a, b, c, d, e));
end
$anon$;

-- -- Structure: what the behaviour above cannot see ---------------------------
do $structure$
declare bad text; n int;
begin
  -- Grant layer. A write privilege that came back would turn the loud 42501
  -- refusals above into silent 0-row no-ops at best.
  select string_agg(x, ', ') into bad from (
    select format('%s:%s:%s', r, t, p) as x
      from unnest(array['anon', 'authenticated']) r,
           unnest(array['public.member_permissions', 'public.capabilities']) t,
           unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
     where has_table_privilege(r, t, p)
    union all
    select 'anon:' || t || ':SELECT'
      from unnest(array['public.member_permissions', 'public.capabilities']) t
     where has_table_privilege('anon', t, 'SELECT')) s;
  perform pg_temp.rec(25, 'no client role holds a write privilege on the two new tables; anon cannot read them',
    bad is null, coalesce('offending: ' || bad, 'none'));

  -- Policy layer. No write policy may exist on member_permissions at all, and
  -- every holder policy on events must pin created_by to the caller.
  select string_agg(policyname || ' (' || cmd || ')', ', ') into bad
    from pg_policies
   where schemaname = 'public' and tablename = 'member_permissions' and cmd <> 'SELECT';
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename = 'events' and policyname like '%capability holder%'
     and (cmd in ('INSERT', 'UPDATE') and coalesce(with_check, '') not like '%created_by = auth.uid()%'
       or cmd in ('UPDATE', 'DELETE') and coalesce(qual, '') not like '%created_by = auth.uid()%');
  perform pg_temp.rec(26, 'no write policy on member_permissions; every holder policy on events pins created_by = auth.uid()',
    bad is null and n = 0
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events'
            and policyname like '%capability holder%') = 3,
    format('member_permissions write policies: %s; holder policies missing the pin: %s', coalesce(bad, 'none'), n));

  -- The staff policy is still there and still means what it meant.
  perform pg_temp.rec(27, 'the existing staff policy on events is unchanged (is_staff() both ways)',
    exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'events' and policyname = 'events writable by staff'
               and cmd = 'ALL' and qual = 'is_staff()' and with_check = 'is_staff()'),
    'policy "events writable by staff": ' || coalesce((
      select format('cmd %s, using %s, check %s', cmd, qual, with_check) from pg_policies
       where schemaname = 'public' and tablename = 'events' and policyname = 'events writable by staff'), 'MISSING'));

  -- Functions: SECURITY DEFINER with a pinned search_path, and not executable
  -- by anon or PUBLIC.
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p
   where p.oid in ('public.has_capability(text)'::regprocedure,
                   'public.admin_grant_capability(uuid, text)'::regprocedure,
                   'public.admin_revoke_capability(uuid, text)'::regprocedure)
     and (not p.prosecdef
       or not coalesce(p.proconfig::text like '%search_path=public%', false)
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                   where x.grantee = 0 and x.privilege_type = 'EXECUTE'));
  perform pg_temp.rec(28, 'the three functions are SECURITY DEFINER, search_path pinned, authenticated-only',
    bad is null, coalesce('offending: ' || bad, 'none'));
end
$structure$;

select n, check_name as "check", result, detail
  from t0004_results
union all
select 999, 'summary',
       case when bool_or(result = 'FAIL') then 'FAIL' else 'PASS' end,
       format('%s PASS, %s FAIL, %s SKIP of %s checks',
              count(*) filter (where result = 'PASS'),
              count(*) filter (where result = 'FAIL'),
              count(*) filter (where result = 'SKIP'),
              count(*))
  from t0004_results
 order by 1;

rollback;

-- Nothing is left behind. Confirm with:
--   select count(*) from public.events where title like 'rls-0004%';   -- 0
