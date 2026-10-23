-- ============================================================
-- 0023_family_link_recovery test. Run AFTER 0023. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK; its events, invites and queued emails
-- never persist, so nothing is emailed.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Actors: student A (with an application, so a family token), student B
-- (any other non-staff student), a staff member S.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.staff_send_trip_link(uuid, text, uuid, text)') is null then
    raise exception 'Cannot test: 0023_family_link_recovery.sql has not been applied';
  end if;
end
$applied$;

create temp table t23_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t23_fx (
  ev uuid default gen_random_uuid(), ev_over uuid default gen_random_uuid(), ev_none uuid default gen_random_uuid(),
  a uuid, b uuid, s uuid, tok uuid,
  inv_a uuid default gen_random_uuid(), inv_b uuid default gen_random_uuid(),
  inv_a_over uuid default gen_random_uuid(), inv_a_none uuid default gen_random_uuid()) on commit drop;
grant all on t23_fx, t23_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by (exists (select 1 from public.member_applications m where m.member_id = p.id)) desc, p.id) as rn
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
)
insert into t23_fx (a, b, s)
select (select id from ns where rn = 1), (select id from ns where rn = 2),
       (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead', 'admin') order by r.member_id limit 1);
update t23_fx f set tok = m.parent_token
  from (select parent_token, member_id from public.member_applications order by submitted_at desc nulls last) m where m.member_id = f.a;

do $pre$
declare f t23_fx;
begin
  select * into f from t23_fx;
  if f.b is null or f.s is null then raise exception 'Cannot test: need two non-staff students and a staff member'; end if;
  if f.tok is null then raise exception 'Cannot test: the first student has no application'; end if;
end
$pre$;

-- Three fixture events: one coming up (with an alert email), one over, one
-- coming up with a family that has no email.
insert into public.hub_events (id, title, alert_emails)
select ev, 'RLS0023 Coming Trip', array['Coach@Example.invalid', 'second@example.invalid'] from t23_fx
union all select ev_over, 'RLS0023 Past Trip', array['past@example.invalid'] from t23_fx
union all select ev_none, 'RLS0023 Quiet Trip', '{}'::text[] from t23_fx;
insert into public.hub_days (event_id, day_date, venue_closes_at)
select ev, (now() + interval '10 days')::date, now() + interval '10 days' from t23_fx
union all select ev_over, (now() - interval '10 days')::date, now() - interval '10 days' from t23_fx
union all select ev_none, (now() + interval '12 days')::date, now() + interval '12 days' from t23_fx;
insert into public.hub_invites (id, event_id, student_id, emails)
select inv_a, ev, a, array['mom@example.invalid', 'dad@example.invalid'] from t23_fx
union all select inv_b, ev, b, array['other@example.invalid'] from t23_fx
union all select inv_a_over, ev_over, a, array['mom@example.invalid'] from t23_fx
union all select inv_a_none, ev_none, a, '{}'::text[] from t23_fx;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  if p_who is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_who::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end
$fn$;
create function pg_temp.clear() returns void language plpgsql as $fn$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;
create function pg_temp.rec(n int, name text, ok boolean, detail text) returns void language sql as $fn$
  insert into t23_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
$fn$;
-- Run one call as someone; answer its jsonb, or err:<sqlstate>:<message>.
create function pg_temp.call_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.clear();
  return v;
end
$fn$;
create function pg_temp.queued(p_invite uuid) returns int language sql as $fn$
  select count(*)::int from public.hub_outbox where link_invite_id = p_invite
$fn$;

-- 1-2. A mentor sends one family its link: one email per address, each with
-- the family link, kind resend; again in the same hour sends nothing.
do $c$
declare f t23_fx; r text; n int; ok_rows boolean;
begin
  select * into f from t23_fx;
  r := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(%L::uuid)::text', f.inv_a));
  n := pg_temp.queued(f.inv_a);
  select bool_and(o.kind = 'resend' and cardinality(o.to_emails) = 1 and o.status = 'pending')
         and count(*) = 2
         and bool_or(o.to_emails[1] = 'mom@example.invalid') and bool_or(o.to_emails[1] = 'dad@example.invalid')
    into ok_rows from public.hub_outbox o where o.link_invite_id = f.inv_a;
  perform pg_temp.rec(1, 'staff Send link queues one link email per address on the family',
    r like '{%' and (r::jsonb ->> 'queued')::int = 2 and n = 2 and coalesce(ok_rows, false), format('%s; rows %s', r, n));
  r := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(%L::uuid)::text', f.inv_a));
  perform pg_temp.rec(2, 'the same send again within the hour queues nothing (deduped per address)',
    r like '{%' and (r::jsonb ->> 'queued')::int = 0 and (r::jsonb ->> 'already')::int = 2 and pg_temp.queued(f.inv_a) = 2,
    format('%s; rows %s', r, pg_temp.queued(f.inv_a)));
end
$c$;

-- 3-4. Not staff: a student is refused and nothing lands; anon cannot call it.
do $c$
declare f t23_fx; r text;
begin
  select * into f from t23_fx;
  r := pg_temp.call_as(f.b, format('select public.staff_send_trip_link(%L::uuid)::text', f.inv_b));
  perform pg_temp.rec(3, 'a student calling Send link is refused and nothing is queued',
    r like 'err:42501:%' and pg_temp.queued(f.inv_b) = 0, format('%s; rows %s', r, pg_temp.queued(f.inv_b)));
  r := pg_temp.call_as(null, format('select public.staff_send_trip_link(%L::uuid)::text', f.inv_b));
  perform pg_temp.rec(4, 'anon cannot run Send link at all',
    r like 'err:42501:%' and pg_temp.queued(f.inv_b) = 0, r);
end
$c$;

-- 5-6. One email: refused unless it is on the family; on the family, one row.
do $c$
declare f t23_fx; r text; r2 text;
begin
  select * into f from t23_fx;
  r := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(%L::uuid, %L)::text', f.inv_b, 'stranger@example.invalid'));
  perform pg_temp.rec(5, 'an email that is not on the family is refused and nothing is queued',
    r like 'err:P0001:hub:not_on_family%' and pg_temp.queued(f.inv_b) = 0, r);
  r2 := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(%L::uuid, %L)::text', f.inv_b, ' Other@Example.invalid '));
  perform pg_temp.rec(6, 'an email on the family (any case, spaces) queues exactly one email to it',
    r2 like '{%' and (r2::jsonb ->> 'queued')::int = 1
    and (select count(*) from public.hub_outbox o where o.link_invite_id = f.inv_b and o.to_emails = array['other@example.invalid']) = 1,
    r2);
end
$c$;

-- 7-9. By student (the connector): resolves the one coming trip; a trip
-- title that matches none is refused; an event that is over is refused.
do $c$
declare f t23_fx; r text; r2 text; r3 text; before int;
begin
  select * into f from t23_fx;
  -- Student A has two coming trips (ev, ev_none): no trip said is ambiguous.
  r := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(null, null, %L::uuid)::text', f.a));
  perform pg_temp.rec(7, 'by student with two coming trips and no trip said: refused as ambiguous, naming both',
    r like 'err:P0001:hub:ambiguous%', r);
  r2 := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(null, null, %L::uuid, %L)::text', f.b, 'coming'));
  perform pg_temp.rec(8, 'by student and part of the trip title: sends that family (positive control)',
    r2 like '{%' and r2::jsonb ->> 'event' = 'RLS0023 Coming Trip' and (r2::jsonb ->> 'queued')::int = 0
    and (r2::jsonb ->> 'already')::int = 1, r2);
  before := pg_temp.queued(f.inv_a_over);
  r3 := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(%L::uuid)::text', f.inv_a_over));
  perform pg_temp.rec(9, 'a family on an event that is over is refused and nothing is queued',
    r3 like 'err:P0001:hub:event_over%' and pg_temp.queued(f.inv_a_over) = before, r3);
end
$c$;

-- 10. A family with no email is refused with its own code.
do $c$
declare f t23_fx; r text;
begin
  select * into f from t23_fx;
  r := pg_temp.call_as(f.s, format('select public.staff_send_trip_link(%L::uuid)::text', f.inv_a_none));
  perform pg_temp.rec(10, 'a family with no email is refused (no_email)', r like 'err:P0001:hub:no_email%', r);
end
$c$;

-- 11-12. The open link contact: the first alert email of an open event, as
-- anon; null for an event with none; null for an event that is over.
do $c$
declare f t23_fx; r text; r2 text; r3 text;
begin
  select * into f from t23_fx;
  r := pg_temp.call_as(null, format('select public.trip_join_contact(%L::uuid)', f.ev));
  r2 := pg_temp.call_as(null, format('select public.trip_join_contact(%L::uuid)', f.ev_none));
  r3 := pg_temp.call_as(null, format('select public.trip_join_contact(%L::uuid)', f.ev_over));
  perform pg_temp.rec(11, 'anon reads the contact of an open event: its first alert email, lowercased',
    r = 'coach@example.invalid', r);
  perform pg_temp.rec(12, 'no contact for an event with no alert email, nor for one that is over',
    r2 = 'null' and r3 = 'null', format('none %s; over %s', r2, r3));
end
$c$;

-- 13-16. The family link: the token student trips only, never another
-- student, never an address or token; an unknown token is refused.
do $c$
declare f t23_fx; r text; j jsonb; r2 text;
begin
  select * into f from t23_fx;
  r := pg_temp.call_as(null, format('select public.family_hub_trips(%L::uuid)::text', f.tok));
  j := case when r like '[%' then r::jsonb else '[]'::jsonb end;
  perform pg_temp.rec(13, 'the family link lists the token student coming trips (both), with done or not',
    jsonb_array_length(j) = 2
    and exists (select 1 from jsonb_array_elements(j) x where x ->> 'title' = 'RLS0023 Coming Trip' and x ? 'signup_done')
    and exists (select 1 from jsonb_array_elements(j) x where x ->> 'title' = 'RLS0023 Quiet Trip' and (x ->> 'has_email')::boolean = false),
    r);
  perform pg_temp.rec(14, 'it lists no trip that is over and no other student sign-up',
    r like '[%' and not exists (select 1 from jsonb_array_elements(j) x where x ->> 'title' = 'RLS0023 Past Trip')
    and (select count(*) from jsonb_array_elements(j) x where (x ->> 'event_id')::uuid = f.ev) = 1,
    format('%s trips', jsonb_array_length(j)));
  perform pg_temp.rec(15, 'it carries no email address, token or invite id',
    r like '[%' and position('@' in r) = 0 and position('token' in r) = 0 and position('invite' in r) = 0
    and position(f.inv_a::text in r) = 0, r);
  r2 := pg_temp.call_as(null, format('select public.family_hub_trips(%L::uuid)::text', gen_random_uuid()));
  perform pg_temp.rec(16, 'an unknown family token is refused', r2 like 'err:P0002:%', r2);
end
$c$;

-- 17-20. Send me the sign-up link, from the family link.
do $c$
declare f t23_fx; r text; r2 text; r3 text; r4 text; before_a int; before_b int;
begin
  select * into f from t23_fx;
  -- The staff sends above used this hour for inv_a; a fresh family sends
  -- under its own key, so it queues both addresses once.
  before_a := pg_temp.queued(f.inv_a);
  r := pg_temp.call_as(null, format('select public.family_hub_send_link(%L::uuid, %L::uuid)::text', f.tok, f.ev));
  perform pg_temp.rec(17, 'Send me the sign-up link queues one email per address on that sign-up, and answers no address',
    r like '{%' and (r::jsonb ->> 'queued')::int = 2 and (r::jsonb ->> 'count')::int = 2
    and pg_temp.queued(f.inv_a) = before_a + 2 and position('@' in r) = 0, format('%s; rows %s', r, pg_temp.queued(f.inv_a)));
  r2 := pg_temp.call_as(null, format('select public.family_hub_send_link(%L::uuid, %L::uuid)::text', f.tok, f.ev));
  perform pg_temp.rec(18, 'pressing it again within the hour queues nothing',
    r2 like '{%' and (r2::jsonb ->> 'queued')::int = 0 and pg_temp.queued(f.inv_a) = before_a + 2, r2);
  before_b := pg_temp.queued(f.inv_b);
  -- B is on ev too, but the token is A: a sign-up only ever means A.
  r3 := pg_temp.call_as(null, format('select public.family_hub_send_link(%L::uuid, %L::uuid)::text', f.tok, f.ev_over));
  perform pg_temp.rec(19, 'a trip that is over is refused',
    r3 like 'err:P0001:hub:event_over%', r3);
  r4 := pg_temp.call_as(null, format('select public.family_hub_send_link(%L::uuid, %L::uuid)::text', gen_random_uuid(), f.ev));
  perform pg_temp.rec(20, 'an unknown token is refused and no other family is emailed',
    r4 like 'err:P0002:%' and pg_temp.queued(f.inv_b) = before_b, format('%s; B rows %s', r4, pg_temp.queued(f.inv_b)));
end
$c$;

-- 21. Every email the family button queued went to an address on that
-- family, and none to the other family on the same trip.
do $c$
declare f t23_fx; stray int;
begin
  select * into f from t23_fx;
  select count(*) into stray from public.hub_outbox o
   where o.dedupe_key like 'family_link:%'
     and (o.link_invite_id <> f.inv_a or not (o.to_emails[1] = any(array['mom@example.invalid', 'dad@example.invalid'])));
  perform pg_temp.rec(21, 'the family button emailed only its own sign-up addresses',
    stray = 0 and (select count(*) from public.hub_outbox o where o.dedupe_key like 'family_link:%') = 2,
    format('stray %s', stray));
end
$c$;

-- 22. Grants and definitions: the three family entry points open to anon
-- and signed-in callers, Send link to signed-in only, helpers to nobody;
-- every one SECURITY DEFINER with search_path pinned.
do $c$
declare bad text; n int;
begin
  with want(sig, anon_ok, auth_ok) as (values
    ('public.staff_send_trip_link(uuid, text, uuid, text)', false, true),
    ('public.trip_join_contact(uuid)', true, true),
    ('public.family_hub_trips(uuid)', true, true),
    ('public.family_hub_send_link(uuid, uuid)', true, true),
    ('public._hub_send_link_to(uuid, text[], text)', false, false),
    ('public._family_token_student(uuid)', false, false))
  select count(p.oid), string_agg(w.sig, ', ') filter (where p.oid is null
           or has_function_privilege('anon', p.oid, 'EXECUTE') <> w.anon_ok
           or has_function_privilege('authenticated', p.oid, 'EXECUTE') <> w.auth_ok
           or not p.prosecdef
           or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
    into n, bad
    from want w left join pg_proc p on p.oid = to_regprocedure(w.sig);
  perform pg_temp.rec(22, 'grants: family entry points anon and signed-in, Send link signed-in only, helpers nobody; definer, search_path pinned',
    n = 6 and bad is null, format('%s of 6 found; wrong: %s', n, coalesce(bad, 'none')));
end
$c$;

select n, check_name as check, result, detail from t23_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t23_results
order by 1;

rollback;
