-- ============================================================
-- 0035_meet_a_team test: who reads and writes Meet a team notes, who sees
-- contacts, the meet_team role, and give everyone a slot. Run AFTER 0035.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK. ONE ROW PER CHECK
-- plus a summary row.
-- Actors: synthetic students S1 to S6 (created and rolled back here), a
-- mentor M, a parent-only account P, and anon.
-- Fixture: a competition that started an hour ago, with three slots
-- tomorrow: Q1 (scout 2, meet_team 2), Q2 (scout 2, meet_team 2), Q3
-- (scout 2, meet_team 1). S1 is assigned scout in Q1; S6 is assigned scout
-- in all three.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.staff_meet_team_fill(uuid, boolean)') is null then
    raise exception 'Cannot test: 0035_meet_a_team.sql has not been applied';
  end if;
end
$applied$;

create temp table t35_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t35_fx (m uuid, p uuid, ev uuid, q1 uuid, q2 uuid, q3 uuid, n1 uuid, n2 uuid) on commit drop;
create temp table t35_s (i int primary key, id uuid not null) on commit drop;
grant all on t35_fx, t35_results, t35_s to anon, authenticated, service_role;

insert into t35_s (i, id) select g, gen_random_uuid() from generate_series(1, 6) g;
insert into auth.users (id, email) select id, 't35.s' || i || '@boscotech.edu' from t35_s;
insert into public.profiles (id) select id from t35_s on conflict (id) do nothing;
update public.profiles p set full_name = 'Meet Student ' || s.i, approved = true, status = 'active' from t35_s s where p.id = s.id;
insert into public.member_roles (member_id, role) select id, 'student' from t35_s on conflict do nothing;

insert into t35_fx (m, p)
select (select r.member_id from public.member_roles r where r.role = 'mentor' order by r.member_id limit 1),
       (select r.member_id from public.member_roles r where r.role = 'parent'
         and not exists (select 1 from public.member_roles x where x.member_id = r.member_id and x.role in ('student', 'mentor', 'lead', 'admin'))
         order by r.member_id limit 1);
update public.profiles set approved = true where id = (select p from t35_fx);

do $pre$
declare f t35_fx;
begin
  select * into f from t35_fx;
  if f.m is null or f.p is null then raise exception 'Cannot test: need a mentor and a parent-only account'; end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  perform set_config('role', 'authenticated', true);
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
  insert into t35_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
$fn$;
create function pg_temp.call_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  if p_who is null then
    perform set_config('role', 'anon', true);
  else
    perform pg_temp.act(p_who);
  end if;
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
create function pg_temp.sid(n int) returns uuid language sql as $fn$ select id from t35_s where i = n $fn$;
create function pg_temp.save_sql(p_id uuid, p_ev uuid, p_team int, p_well text, p_copy text, p_contact jsonb) returns text language sql as $fn$
  select format($q$select public.team_connection_save(%L::uuid, %L::uuid, %s, 'Robo Team', %L::jsonb, %L, '["student_led","subteams"]'::jsonb, 'Captains per subteam',
                  '["mentoring"]'::jsonb, null, %L, true, 'Email their lead')::text$q$, p_id, p_ev, p_team, p_contact, p_well, p_copy)
$fn$;

insert into public.events (id, title, kind, starts_at, ends_at)
select gen_random_uuid(), '0035 test regional', 'competition', now() - interval '1 hour', now() + interval '3 days';
update t35_fx set ev = (select id from public.events where title = '0035 test regional');
do $slots$
declare f t35_fx; d date := (now() at time zone 'America/Los_Angeles')::date + 1;
begin
  select * into f from t35_fx;
  insert into public.role_slots (event_id, day, label, starts_at, ends_at, needs, position) values
    (f.ev, d, 'Q1', (d::text || ' 09:00')::timestamp at time zone 'America/Los_Angeles', (d::text || ' 10:00')::timestamp at time zone 'America/Los_Angeles', '{"scout":2,"meet_team":2}', 1),
    (f.ev, d, 'Q2', (d::text || ' 10:00')::timestamp at time zone 'America/Los_Angeles', (d::text || ' 11:00')::timestamp at time zone 'America/Los_Angeles', '{"scout":2,"meet_team":2}', 2),
    (f.ev, d, 'Q3', (d::text || ' 11:00')::timestamp at time zone 'America/Los_Angeles', (d::text || ' 12:00')::timestamp at time zone 'America/Los_Angeles', '{"scout":2,"meet_team":1}', 3);
  update t35_fx set q1 = (select id from public.role_slots where event_id = f.ev and label = 'Q1'),
                    q2 = (select id from public.role_slots where event_id = f.ev and label = 'Q2'),
                    q3 = (select id from public.role_slots where event_id = f.ev and label = 'Q3');
  select * into f from t35_fx;
  insert into public.role_requests (slot_id, member_id, role, status) values
    (f.q1, pg_temp.sid(1), 'scout', 'assigned'),
    (f.q1, pg_temp.sid(6), 'scout', 'assigned'), (f.q2, pg_temp.sid(6), 'scout', 'assigned'), (f.q3, pg_temp.sid(6), 'scout', 'assigned');
end
$slots$;

-- ── notes: write, read, contacts ─────────────────────────────────────────
do $a$
declare f t35_fx; r text; r2 text;
begin
  select * into f from t35_fx;
  r := pg_temp.call_as(pg_temp.sid(1), pg_temp.save_sql(null, f.ev, 254, 'Fast pit repairs', 'Pit checklist on the cart',
         '{"name":"Alex","role":"student","email":"alex@example.org","discord":"alex#1"}'));
  if r like '{%' then update t35_fx set n1 = (r::jsonb ->> 'id')::uuid; end if;
  select * into f from t35_fx;
  perform pg_temp.rec(1, 'a student saves a note with a contact: the note is theirs and the contact row exists',
    r like '{%' and (select member_id from public.team_connections where id = f.n1) = pg_temp.sid(1)
    and (select email from public.team_connection_contacts where connection_id = f.n1) = 'alex@example.org', left(r, 80));

  r := pg_temp.call_as(pg_temp.sid(2), format($q$select count(*)::text from public.team_connections where id = %L$q$, f.n1));
  r2 := pg_temp.call_as(pg_temp.sid(2), format($q$select count(*)::text from public.team_connection_contacts where connection_id = %L$q$, f.n1));
  perform pg_temp.rec(2, 'another student reads that note (1) and its contact (1)', r = '1' and r2 = '1', r || ' note, ' || r2 || ' contact');

  r := pg_temp.call_as(f.p, format($q$select count(*)::text from public.team_connections where id = %L$q$, f.n1));
  r2 := pg_temp.call_as(f.p, format($q$select count(*)::text from public.team_connection_contacts where connection_id = %L$q$, f.n1));
  perform pg_temp.rec(3, 'a parent-only account reads the note (1) but not the contact (0, against 1 for a student)', r = '1' and r2 = '0', r || ' note, ' || r2 || ' contact');

  r := pg_temp.call_as(f.p, format($q$select (public.meet_team_event(%L::uuid) -> 'connections' -> 0 -> 'contact')::text$q$, f.ev));
  r2 := pg_temp.call_as(pg_temp.sid(2), format($q$select (public.meet_team_event(%L::uuid) -> 'connections' -> 0 -> 'contact' ->> 'email')::text$q$, f.ev));
  perform pg_temp.rec(4, 'the shared list hides contacts from a parent (null) and shows them to a student (the email)', r in ('null') and r2 = 'alex@example.org', r || ' / ' || r2);

  r := pg_temp.call_as(null, 'select count(*)::text from public.team_connections');
  r2 := pg_temp.call_as(null, 'select count(*)::text from public.team_connection_contacts');
  perform pg_temp.rec(5, 'anon reads neither table (permission denied), and cannot call the list',
    r like 'err:42501:%' and r2 like 'err:42501:%'
    and pg_temp.call_as(null, format($q$select public.meet_team_event(%L::uuid)::text$q$, f.ev)) like 'err:42501:%', left(r, 40) || ' / ' || left(r2, 40));

  -- UPDATE finds rows through the SELECT policy: S2 CAN read the row, so 0 rows here is the update policy, not the read one.
  r := pg_temp.call_as(pg_temp.sid(2), format($q$with u as (update public.team_connections set does_well = 'hacked' where id = %L returning 1) select count(*)::text from u$q$, f.n1));
  r2 := pg_temp.call_as(pg_temp.sid(2), pg_temp.save_sql(f.n1, f.ev, 254, 'hacked', 'hacked', null));
  perform pg_temp.rec(6, 'another student cannot edit the note: direct update 0 rows, save refused, text unchanged',
    r = '0' and r2 like 'err:42501:%' and (select does_well from public.team_connections where id = f.n1) = 'Fast pit repairs', r || ' / ' || left(r2, 60));

  r := pg_temp.call_as(pg_temp.sid(1), pg_temp.save_sql(f.n1, f.ev, 254, 'Fast pit repairs and a clean cart', 'Pit checklist on the cart', '{"name":"Alex","role":"student","email":"alex@example.org"}'));
  perform pg_temp.rec(7, 'the author edits their own note (positive control for 6)',
    r like '{%' and (select does_well from public.team_connections where id = f.n1) = 'Fast pit repairs and a clean cart', left(r, 60));

  r := pg_temp.call_as(pg_temp.sid(2), format($q$with u as (update public.team_connection_contacts set email = 'x@x' where connection_id = %L returning 1) select count(*)::text from u$q$, f.n1));
  r2 := pg_temp.call_as(pg_temp.sid(2), format($q$with u as (delete from public.team_connections where id = %L returning 1) select count(*)::text from u$q$, f.n1));
  perform pg_temp.rec(8, 'another student cannot change the contact (0 rows) or delete the note (0 rows); delete through the function is refused',
    r = '0' and r2 = '0' and pg_temp.call_as(pg_temp.sid(2), format($q$select public.team_connection_delete(%L::uuid)::text$q$, f.n1)) like 'err:42501:%'
    and exists (select 1 from public.team_connections where id = f.n1) and (select email from public.team_connection_contacts where connection_id = f.n1) = 'alex@example.org', r || ' / ' || r2);

  -- As staff, whom the update policy lets through: only the column grant stands in the way.
  r := pg_temp.call_as(f.m, format($q$update public.team_connections set member_id = %L where id = %L$q$, pg_temp.sid(2), f.n1));
  r2 := pg_temp.call_as(pg_temp.sid(2), format($q$insert into public.team_connections (event_id, member_id, team_number, does_well, copy_this) values (%L, %L, 1, 'x', 'y')$q$, f.ev, pg_temp.sid(1)));
  perform pg_temp.rec(9, 'nobody moves a note to another member, staff included (column not granted), or writes one in another member''s name (policy)',
    r like 'err:42501:%' and r2 like 'err:42501:%' and (select member_id from public.team_connections where id = f.n1) = pg_temp.sid(1), left(r, 50) || ' / ' || left(r2, 50));

  r := pg_temp.call_as(f.p, pg_temp.save_sql(null, f.ev, 100, 'x', 'y', null));
  r2 := pg_temp.call_as(pg_temp.sid(2), pg_temp.save_sql(null, f.ev, 100, '   ', 'y', null));
  perform pg_temp.rec(10, 'a parent cannot log a note; a blank what-they-do-well is refused; nothing is written',
    r like 'err:42501:%' and r2 like 'err:22023:%' and not exists (select 1 from public.team_connections where team_number = 100 and event_id = f.ev), left(r, 50) || ' / ' || left(r2, 50));

  r := pg_temp.call_as(f.m, pg_temp.save_sql(f.n1, f.ev, 254, 'Edited by a mentor', 'Pit checklist on the cart', null));
  perform pg_temp.rec(11, 'staff edit anyone''s note; an empty contact removes the contact row; the author stays the author',
    r like '{%' and (select does_well from public.team_connections where id = f.n1) = 'Edited by a mentor'
    and not exists (select 1 from public.team_connection_contacts where connection_id = f.n1)
    and (select member_id from public.team_connections where id = f.n1) = pg_temp.sid(1), left(r, 60));

  r := pg_temp.call_as(pg_temp.sid(3), pg_temp.save_sql(null, f.ev, 1678, 'Strategy binder', 'Binder', null));
  if r like '{%' then update t35_fx set n2 = (r::jsonb ->> 'id')::uuid; end if;
  select * into f from t35_fx;
  r2 := pg_temp.call_as(f.m, format($q$select public.team_connection_delete(%L::uuid)::text$q$, f.n2));
  perform pg_temp.rec(12, 'staff delete another member''s note',
    r like '{%' and r2 like '{%' and not exists (select 1 from public.team_connections where id = f.n2), left(r2, 60));
end
$a$;

-- ── the role, the template ───────────────────────────────────────────────
do $b$
declare f t35_fx; r text; t jsonb;
begin
  select * into f from t35_fx;
  r := pg_temp.call_as(f.m, format($q$select public.staff_add_to_slot(%L::uuid, %L::uuid, 'meet_team', 'backup')::text$q$, f.q3, pg_temp.sid(5)));
  perform pg_temp.rec(13, 'meet_team is a role the board takes (staff add as backup), and a made-up role is not',
    r like '{%' and (select status from public.role_requests where slot_id = f.q3 and member_id = pg_temp.sid(5) and role = 'meet_team') = 'backup'
    and pg_temp.call_as(f.m, format($q$select public.staff_add_to_slot(%L::uuid, %L::uuid, 'meet_teams', 'backup')::text$q$, f.q3, pg_temp.sid(5))) like 'err:22023:%', left(r, 60));

  select slots into t from public.role_slot_templates where name = 'Beach Blitz (3 days, Friday load-in)';
  perform pg_temp.rec(14, 'the Beach Blitz template: 3 Meet a team boxes in Qualifications 1 and 7, none in Playoffs 1 or Practice matches 1',
    case when t is null then null else
      (select (e -> 'needs' ->> 'meet_team') from jsonb_array_elements(t) e where e ->> 'label' = 'Qualifications 1') = '3'
      and (select (e -> 'needs' ->> 'meet_team') from jsonb_array_elements(t) e where e ->> 'label' = 'Qualifications 7') = '3'
      and (select e -> 'needs' ? 'meet_team' from jsonb_array_elements(t) e where e ->> 'label' = 'Playoffs 1') = false
      and (select e -> 'needs' ? 'meet_team' from jsonb_array_elements(t) e where e ->> 'label' = 'Practice matches 1') = false end,
    (select count(*) from jsonb_array_elements(t) e where e -> 'needs' ? 'meet_team')::text || ' template slots with boxes');
end
$b$;

-- ── give everyone a slot ─────────────────────────────────────────────────
do $c$
declare f t35_fx; r text; pv jsonb; ap jsonb; before_n int; unslotted int; l1 int; l2 int; l3 int;
begin
  select * into f from t35_fx;
  r := pg_temp.call_as(pg_temp.sid(2), format($q$select public.staff_meet_team_fill(%L::uuid, true)::text$q$, f.ev));
  perform pg_temp.rec(15, 'a student cannot give everyone a slot (42501, nothing written)',
    r like 'err:42501:%' and not exists (select 1 from public.role_requests where role = 'meet_team' and status = 'assigned' and slot_id in (f.q1, f.q2, f.q3)), left(r, 50));

  select count(*) into unslotted from public._meet_team_students(f.ev);
  select count(*) into before_n from public.role_requests where role = 'meet_team';
  r := pg_temp.call_as(f.m, format($q$select public.staff_meet_team_fill(%L::uuid, false)::text$q$, f.ev));
  pv := case when r like '{%' then r::jsonb end;
  perform pg_temp.rec(16, 'the preview names everyone (placed + not placed = every unslotted active student) and writes nothing',
    pv is not null and jsonb_array_length(pv -> 'placed') + jsonb_array_length(pv -> 'unplaced') = unslotted
    and jsonb_array_length(pv -> 'placed') > 0
    and (select count(*) from public.role_requests where role = 'meet_team') = before_n,
    coalesce(jsonb_array_length(pv -> 'placed')::text || ' placed, ' || jsonb_array_length(pv -> 'unplaced') || ' not, of ' || unslotted, left(r, 60)));

  r := pg_temp.call_as(f.m, format($q$select public.staff_meet_team_fill(%L::uuid, true)::text$q$, f.ev));
  ap := case when r like '{%' then r::jsonb end;
  perform pg_temp.rec(17, 'apply writes exactly what the preview showed (same members, same slots)',
    ap is not null and (select jsonb_agg(x order by x ->> 'member_id') from jsonb_array_elements(ap -> 'placed') x)
                     = (select jsonb_agg(x order by x ->> 'member_id') from jsonb_array_elements(pv -> 'placed') x)
    and (select count(*) from public.role_requests where role = 'meet_team' and status = 'assigned' and slot_id in (f.q1, f.q2, f.q3)) = jsonb_array_length(ap -> 'placed'),
    left(r, 60));

  perform pg_temp.rec(18, 'S1 (scout in Q1) is placed, and not in Q1; S5 (a backup in Q3) is assigned a box',
    exists (select 1 from public.role_requests where member_id = pg_temp.sid(1) and role = 'meet_team' and status = 'assigned')
    and not exists (select 1 from public.role_requests where member_id = pg_temp.sid(1) and role = 'meet_team' and slot_id = f.q1)
    and exists (select 1 from public.role_requests where member_id = pg_temp.sid(5) and role = 'meet_team' and status = 'assigned'),
    (select string_agg(s.label, ',') from public.role_requests r join public.role_slots s on s.id = r.slot_id where r.member_id = pg_temp.sid(1) and r.role = 'meet_team'));

  perform pg_temp.rec(19, 'S6 (scout in every Meet a team slot) is not placed and the reason says so',
    not exists (select 1 from public.role_requests where member_id = pg_temp.sid(6) and role = 'meet_team')
    and exists (select 1 from jsonb_array_elements(ap -> 'unplaced') x where (x ->> 'member_id')::uuid = pg_temp.sid(6) and x ->> 'reason' ilike '%another role%'),
    (select x ->> 'reason' from jsonb_array_elements(ap -> 'unplaced') x where (x ->> 'member_id')::uuid = pg_temp.sid(6)));

  select count(*) filter (where slot_id = f.q1), count(*) filter (where slot_id = f.q2), count(*) filter (where slot_id = f.q3)
    into l1, l2, l3 from public.role_requests where role = 'meet_team' and status = 'assigned';
  -- Evenly by fill: no slot is two or more boxes' worth fuller than another in fill terms.
  perform pg_temp.rec(20, 'the spread is even: fills (assigned / needed) differ by at most one box''s worth',
    greatest(l1 / 2.0, l2 / 2.0, l3 / 1.0) - least(l1 / 2.0, l2 / 2.0, l3 / 1.0) <= 1.0 and l1 + l2 + l3 = jsonb_array_length(ap -> 'placed'),
    format('Q1 %s/2, Q2 %s/2, Q3 %s/1', l1, l2, l3));

  r := pg_temp.call_as(f.m, format($q$select public.staff_meet_team_fill(%L::uuid, true)::text$q$, f.ev));
  perform pg_temp.rec(21, 'a second run places nobody new (everyone slotted is skipped) and reports the count already slotted',
    r like '{%' and jsonb_array_length(r::jsonb -> 'placed') = 0 and (r::jsonb ->> 'already')::int = jsonb_array_length(ap -> 'placed'), left(r, 80));
end
$c$;

-- ── progress and Do this now ─────────────────────────────────────────────
do $d$
declare f t35_fx; r text; p jsonb; t1 text; t2 text;
begin
  select * into f from t35_fx;
  r := pg_temp.call_as(f.m, format($q$select public.meet_team_progress(%L::uuid)::text$q$, f.ev));
  p := case when r like '{%' then r::jsonb end;
  perform pg_temp.rec(22, 'progress: S1 done, S2 slotted, S6 no slot; a student cannot read it',
    p is not null
    and (select x ->> 'state' from jsonb_array_elements(p -> 'people') x where (x ->> 'member_id')::uuid = pg_temp.sid(1)) = 'done'
    and (select x ->> 'state' from jsonb_array_elements(p -> 'people') x where (x ->> 'member_id')::uuid = pg_temp.sid(2)) = 'slotted'
    and (select x ->> 'state' from jsonb_array_elements(p -> 'people') x where (x ->> 'member_id')::uuid = pg_temp.sid(6)) = 'no_slot'
    and pg_temp.call_as(pg_temp.sid(2), format($q$select public.meet_team_progress(%L::uuid)::text$q$, f.ev)) like 'err:42501:%',
    coalesce(format('%s done, %s slotted, %s no slot', p ->> 'done', p ->> 'slotted', p ->> 'no_slot'), left(r, 60)));

  t1 := pg_temp.call_as(pg_temp.sid(2), 'select public.meet_team_todo()::text');
  t2 := pg_temp.call_as(pg_temp.sid(1), 'select public.meet_team_todo()::text');
  perform pg_temp.rec(23, 'Do this now: S2 (slotted, nothing logged) sees the event with a slot time; S1 (logged one) sees nothing for it',
    t1 like '[%' and exists (select 1 from jsonb_array_elements(t1::jsonb) x where (x ->> 'event_id')::uuid = f.ev and x -> 'slot' ->> 'starts_at' is not null)
    and t2 like '[%' and not exists (select 1 from jsonb_array_elements(t2::jsonb) x where (x ->> 'event_id')::uuid = f.ev),
    left(t1, 80));

  r := pg_temp.call_as(pg_temp.sid(2), format($q$select (public.meet_team_event(%L::uuid) -> 'my_slots' -> 0 ->> 'label')$q$, f.ev));
  perform pg_temp.rec(24, 'the member''s own Meet a team slot comes back with the shared list',
    r in ('Q1', 'Q2', 'Q3'), r);
end
$d$;

select n, check_name as check, result, detail from t35_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t35_results
order by 1;

rollback;
