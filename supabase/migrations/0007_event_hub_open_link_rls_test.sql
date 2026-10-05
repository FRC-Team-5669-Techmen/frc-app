-- ============================================================
-- 0007_event_hub_open_link test. Run AFTER 0007. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; its event, invites, tokens and queued
-- emails never persist, so nothing is emailed.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Needs one approved student WITH a current-season application (the list's
-- positive control); checks that need a student WITHOUT one say SKIP when
-- the database has none.
-- ============================================================

begin;

create temp table t7_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t7_fx (ev uuid default gen_random_uuid(), d1 uuid default gen_random_uuid(),
                         ok_student uuid, no_app_student uuid, staff_id uuid,
                         tok1 text, tok2 text) on commit drop;
grant all on t7_fx, t7_results to anon, authenticated, service_role;

insert into t7_fx (ok_student, no_app_student, staff_id)
select (select p.id from public.profiles p where public._hub_join_eligible(p.id) order by p.id limit 1),
       (select p.id from public.profiles p
         where p.approved and p.status = 'active'
           and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
           and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
           and not public._hub_join_eligible(p.id) order by p.id limit 1),
       (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead', 'admin') order by r.member_id limit 1);

do $pre$
begin
  if (select ok_student from t7_fx) is null then
    raise exception 'Cannot test: no approved student has a current-season application';
  end if;
end
$pre$;

insert into public.hub_events (id, title) select ev, 'RLS0007 fixture event' from t7_fx;
insert into public.hub_days (id, event_id, day_date, venue_closes_at)
select d1, ev, (now() + interval '10 days')::date, now() + interval '10 days' from t7_fx;

create function pg_temp.as_anon() returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end
$fn$;
create function pg_temp.as_owner() returns void language plpgsql as $fn$
begin
  perform set_config('role', 'none', true);
  reset role;
end
$fn$;
create function pg_temp.rec(n int, name text, ok boolean, detail text) returns void language sql as $fn$
  insert into t7_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
$fn$;
create function pg_temp.try_join(ev uuid, st uuid, nm text, em text, g boolean) returns text language plpgsql as $fn$
declare j jsonb;
begin
  j := public.hub_join(ev, st, nm, em, g);
  return case j ->> 'status' when 'in' then 'in:' || (j ->> 'token') else (j ->> 'status') || ':' || coalesce((j -> 'to')::text, '') end;
exception when others then
  return 'err:' || sqlstate || ':' || sqlerrm;
end
$fn$;
create function pg_temp.try_add(tok text, em text) returns text language plpgsql as $fn$
declare j jsonb;
begin
  j := public.hub_add_parent(tok, em);
  return 'ok:' || (j -> 'emails')::text;
exception when others then
  return 'err:' || sqlstate || ':' || sqlerrm;
end
$fn$;
grant execute on function pg_temp.try_join(uuid, uuid, text, text, boolean) to anon;
grant execute on function pg_temp.try_add(text, text) to anon;

-- 1-2. The list, read as anon: the eligible student IS listed, one without
-- an application is NOT.
do $c$
declare f t7_fx; j jsonb; has_ok boolean; has_no boolean;
begin
  select * into f from t7_fx;
  perform pg_temp.as_anon();
  j := public.hub_join_info(f.ev);
  perform pg_temp.as_owner();
  has_ok := exists (select 1 from jsonb_array_elements(j -> 'students') s where (s ->> 'id')::uuid = f.ok_student);
  has_no := f.no_app_student is not null
            and exists (select 1 from jsonb_array_elements(j -> 'students') s where (s ->> 'id')::uuid = f.no_app_student);
  perform pg_temp.rec(1, 'anon reads the open page: event title and a student with this season''s application are listed',
    j -> 'event' ->> 'title' = 'RLS0007 fixture event' and has_ok, format('listed %s; title %s', jsonb_array_length(j -> 'students'), j -> 'event' ->> 'title'));
  perform pg_temp.rec(2, 'a student WITHOUT this season''s application is not listed',
    case when f.no_app_student is null then null else not has_no end,
    case when f.no_app_student is null then 'no such student in this database' else format('listed: %s', has_no) end);
  perform pg_temp.rec(3, 'no staff account is listed',
    case when f.staff_id is null then null else not exists (select 1 from jsonb_array_elements(j -> 'students') s where (s ->> 'id')::uuid = f.staff_id) end,
    'staff id checked against the list');
end
$c$;

-- 4-7. Refusals, as anon, each with its own code.
do $c$
declare f t7_fx; r text;
begin
  select * into f from t7_fx;
  perform pg_temp.as_anon();
  r := pg_temp.try_join(f.ev, f.ok_student, 'Pat Parent', 'pat@example.invalid', false);
  perform pg_temp.as_owner();
  perform pg_temp.rec(4, 'not ticking "parent or guardian" is refused', r like 'err:P0001:hub:guardian%', r);
  perform pg_temp.as_anon();
  r := pg_temp.try_join(f.ev, f.ok_student, 'Pat Parent', 'not-an-email', true);
  perform pg_temp.as_owner();
  perform pg_temp.rec(5, 'a malformed email is refused', r like 'err:P0001:hub:email%', r);
  perform pg_temp.as_anon();
  r := pg_temp.try_join(f.ev, coalesce(f.no_app_student, gen_random_uuid()), 'Pat Parent', 'pat@example.invalid', true);
  perform pg_temp.as_owner();
  perform pg_temp.rec(6, 'a student who is not on the list is refused', r like 'err:P0001:hub:student%', r);
  perform pg_temp.as_anon();
  r := pg_temp.try_join(gen_random_uuid(), f.ok_student, 'Pat Parent', 'pat@example.invalid', true);
  perform pg_temp.as_owner();
  perform pg_temp.rec(7, 'an unknown event is refused', r like 'err:P0001:hub:not_open%', r);
end
$c$;

-- 8-14. Option B, as anon. The FIRST person for a student goes straight in;
-- once anyone has started, the page is not opened and the link goes to the
-- addresses already on the family. Then a second parent added from the page.
do $c$
declare f t7_fx; r1 text; r2 text; r3 text; v jsonb; n_inv int; em text[]; n_mail int; ph text; nm text; a1 text; a2 text; a3 text;
begin
  select * into f from t7_fx;
  -- An application phone copied in by "Add them" before anyone joined.
  insert into public.hub_invites (event_id, student_id, emails) values (f.ev, f.ok_student, '{}');
  insert into public.hub_responses (invite_id, parent_name, parent_phone)
  select i.id, 'Copied From Application', '5555550100' from public.hub_invites i where i.event_id = f.ev and i.student_id = f.ok_student;

  perform pg_temp.as_anon();
  r1 := pg_temp.try_join(f.ev, f.ok_student, 'Pat Parent', 'Pat@Example.invalid', true);
  r2 := pg_temp.try_join(f.ev, f.ok_student, 'Sam Second', 'sam@example.invalid', true);
  r3 := pg_temp.try_join(f.ev, f.ok_student, 'Sam Second', 'sam@example.invalid', true);
  perform pg_temp.as_owner();
  update t7_fx set tok1 = substr(r1, 4);

  perform pg_temp.rec(8, 'the first person for a student goes straight in, with a 22-character family link', r1 ~ '^in:[A-Za-z0-9_-]{22}$', left(r1, 12));

  set local role service_role;
  v := public.hub_family_call(substr(r1, 4), 'fetch', '{}'::jsonb);
  reset role;
  perform pg_temp.rec(9, 'that link opens the student''s family page (the 0005 entry point)',
    v -> 'student' ->> 'name' = public._hub_student_name(f.ok_student), coalesce(v -> 'student' ->> 'name', 'no student in the page'));

  select r.parent_phone, r.parent_name into ph, nm from public.hub_responses r join public.hub_invites i on i.id = r.invite_id
   where i.event_id = f.ev and i.student_id = f.ok_student;
  perform pg_temp.rec(10, 'going straight in, the contact becomes the person filling in, and a copied phone is cleared',
    ph is null and nm = 'Pat Parent', format('name %s, phone %s', nm, coalesce(ph, 'null')));

  perform pg_temp.rec(11, 'once someone started, a second person is NOT let in: the link is emailed to the family, address masked',
    r2 like 'emailed:%' and r2 not like '%pat@example%' and r2 like '%p•••@example.invalid%', r2);

  select count(*), max(i.emails) into n_inv, em from public.hub_invites i where i.event_id = f.ev and i.student_id = f.ok_student;
  select count(*) into n_mail from public.hub_outbox o where o.event_id = f.ev and o.kind = 'join_request';
  perform pg_temp.rec(12, 'the asker is not added to the family, and asking twice in an hour queues one email',
    n_inv = 1 and em = array['pat@example.invalid'] and n_mail = 1 and r3 like 'emailed:%', format('emails %s, join emails %s', em, n_mail));

  perform pg_temp.as_anon();
  a1 := pg_temp.try_add(substr(r1, 4), 'Sam@Example.invalid');
  a2 := pg_temp.try_add(substr(r1, 4), 'sam@example.invalid');
  a3 := pg_temp.try_add('AAAAAAAAAAAAAAAAAAAAAA', 'x@example.invalid');
  perform pg_temp.as_owner();
  select count(*) into n_mail from public.hub_outbox o where o.event_id = f.ev and o.kind = 'added';
  perform pg_temp.rec(13, 'a family adds a second parent from its page: the address joins the family, one email with their own link',
    a1 like 'ok:%sam@example.invalid%' and a2 like 'ok:%' and n_mail = 1, format('%s / emails queued %s', a1, n_mail));
  perform pg_temp.rec(14, 'adding a parent needs a working family link', a3 like 'err:P0002:hub:not_found%', a3);
end
$c$;

-- 15. Once the event is over, the open link is closed.
do $c$
declare f t7_fx; r text;
begin
  select * into f from t7_fx;
  update public.hub_days set venue_closes_at = now() - interval '1 hour' where id = f.d1;
  perform pg_temp.as_anon();
  r := pg_temp.try_join(f.ev, f.ok_student, 'Pat Parent', 'pat@example.invalid', true);
  perform pg_temp.as_owner();
  perform pg_temp.rec(15, 'after the event ends the open link refuses', r like 'err:P0001:hub:not_open%', r);
end
$c$;

-- 16. anon still cannot read the tables themselves.
do $c$
declare r text;
begin
  perform pg_temp.as_anon();
  begin
    perform 1 from public.hub_invites limit 1;
    r := 'read';
  exception when others then r := sqlstate;
  end;
  perform pg_temp.as_owner();
  perform pg_temp.rec(16, 'anon still has no direct read on hub_invites', r = '42501', r);
end
$c$;

-- 17. Each 0007 function is executable by exactly its caller: the three
-- entry points by anon and signed-in callers, the four helpers by neither.
-- (0005's check 5 skips these names; this is where they are checked.)
-- hub_add_parent is matched by name because 0008 replaces its signature.
do $c$
declare bad text; n int;
begin
  with want(name, open_to_callers, definer) as (values
    ('hub_join_info', true, true), ('hub_join', true, true), ('hub_add_parent', true, true),
    ('_hub_join_eligible', false, true), ('_hub_join_event', false, true), ('_hub_join_taken', false, true),
    ('_hub_mask_email', false, false))
  select count(p.oid), string_agg(w.name, ', ') filter (where p.oid is null
           or has_function_privilege('anon', p.oid, 'EXECUTE') <> w.open_to_callers
           or has_function_privilege('authenticated', p.oid, 'EXECUTE') <> w.open_to_callers
           or p.prosecdef <> w.definer
           or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.proname = w.name and p.pronamespace = 'public'::regnamespace;
  perform pg_temp.rec(17, 'the three entry points are open to anon and signed-in callers, the four helpers to neither; search_path pinned',
    n = 7 and bad is null, format('%s of 7 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t7_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t7_results
order by 1;

rollback;
