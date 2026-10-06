-- ============================================================
-- 0010_event_hub_roster_names test. Run AFTER 0010. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK. The roles, applications and profile names
-- it sets on five accounts, its event, invites, links and queued emails
-- never persist, and nothing is emailed.
-- ONE ROW PER CHECK (n, check, result, detail) plus a "summary" row.
-- Needs five approved, active accounts: one with no application in any
-- season (N), and four more that hold no mentor, lead or admin role.
--
-- Inside the transaction the four are made into:
--   L  student + lead,    with a current-season application  (on the roster)
--   M  student + mentor,  with a current-season application  (not on it)
--   A  student + admin,   with a current-season application  (not on it)
--   S  student only,      with a current-season application  (on it)
-- and the profile names of L and N are set to an email and a joke title, so
-- the names the hub shows can only have come from the application.
--
--   1-2    a lead-student is listed on the open link and can be started
--   3-4    a mentor and an admin are not listed and are refused
--   5      a plain student is listed: exactly two of the four
--   6      the same rule everywhere: Add them and the readiness count
--   7      names come from the application, never the profile
--   8      no listed name contains an at sign
--   9      with no application, the profile name, and never an email
--   10     the family link of a lead-student is family scope, even with the
--          lead signed in, and refuses a staff action
--   11     the lead own signed-in view is unchanged (the staff board)
--   12     who may execute what
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public._hub_roster_student(uuid)') is null then
    raise exception 'Cannot test: 0010_event_hub_roster_names.sql has not been applied';
  end if;
  if public._hub_current_season() is null then
    raise exception 'Cannot test: no season spans today';
  end if;
end
$applied$;

create temp table t10_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t10_fx (
  n_ uuid, l uuid, m uuid, a uuid, s uuid,
  ev uuid default gen_random_uuid(), dy uuid default gen_random_uuid(),
  tok text, inv_l uuid, inv_s uuid
) on commit drop;

-- N: the lowest-id approved account with no application at all.
insert into t10_fx (n_)
select p.id from public.profiles p
 where p.approved and p.status = 'active'
   and not exists (select 1 from public.member_applications ma where ma.member_id = p.id)
 order by p.id limit 1;

with picks as (
  select p.id, row_number() over (order by p.id) as k from public.profiles p
   where p.approved and p.status = 'active'
     and p.id is distinct from (select n_ from t10_fx)
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin')))
update t10_fx set l = (select id from picks where k = 1), m = (select id from picks where k = 2),
                  a = (select id from picks where k = 3), s = (select id from picks where k = 4);

do $pre$
declare f t10_fx;
begin
  select * into f from t10_fx;
  if f.n_ is null then raise exception 'Cannot test: need an approved account with no application'; end if;
  if f.s is null then raise exception 'Cannot test: need four approved accounts with no mentor, lead or admin role'; end if;
end
$pre$;

-- The four roles, set outright (rolled back).
delete from public.member_roles where member_id in (select unnest(array[l, m, a, s]) from t10_fx);
insert into public.member_roles (member_id, role)
select l, 'student' from t10_fx union all select l, 'lead' from t10_fx
union all select m, 'student' from t10_fx union all select m, 'mentor' from t10_fx
union all select a, 'student' from t10_fx union all select a, 'admin' from t10_fx
union all select s, 'student' from t10_fx;

-- A current-season application for each of the four.
insert into public.member_applications (
  member_id, season_id, legal_first_name, legal_last_name, student_phone, pathway,
  returning_member, subteam_first, subteam_second, subteam_rationale,
  monday_lunch, tuesday_after_school, friday_after_school, transport_after_5pm,
  build_season_acknowledged, parent_name, parent_email, parent_phone,
  emergency_contact_name, emergency_contact_phone, discord_username, conduct_acknowledged)
select x.id, public._hub_current_season(), 'Rls', 'Fixture', '5555550100', 'MSET',
       true, 'Mechanical', 'Programming', 'RLS0010 fixture.',
       'Yes', 'Yes', 'Sometimes', 'Parent pickup',
       true, 'Rls Parent', 'rls0010.parent@example.invalid', '5555550199',
       'Rls Guardian', '5555550188', 'rls0010', true
  from (select unnest(array[l, m, a, s]) as id from t10_fx) x
on conflict (member_id, season_id) do nothing;

-- L: the application says Lena Testcase; the profile says an email and a
-- joke title. N: no application, so its profile is all there is.
update public.member_applications ma set legal_first_name = 'Lena', legal_last_name = 'Testcase'
  from t10_fx f where ma.member_id = f.l and ma.season_id = public._hub_current_season();
update public.profiles p set full_name = 'ltest.2029@example.invalid', nickname = 'Supreme Leader of Wires'
  from t10_fx f where p.id = f.l;
update public.profiles p set full_name = 'ntest.2030@example.invalid', nickname = 'Nora Nickname'
  from t10_fx f where p.id = f.n_;

insert into public.hub_events (id, title) select ev, 'RLS0010 fixture event' from t10_fx;
insert into public.hub_days (id, event_id, day_date, venue_closes_at)
select dy, ev, (now() + interval '10 days')::date, now() + interval '10 days' from t10_fx;

-- -- Helpers (pg_temp: they vanish with the transaction) ----------------------

create function pg_temp.act(p_role text, p_who uuid) returns void language plpgsql as $fn$
begin
  if p_role = 'authenticated' or (p_role = 'service_role' and p_who is not null) then
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', p_role)::text, true);
    perform set_config('request.jwt.claim.sub', p_who::text, true);
  else
    perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;
  perform set_config('role', p_role, true);
end
$fn$;

-- The first column of a one-row statement as (role, member), as text.
create function pg_temp.val_as(p_role text, p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_role, p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end
$fn$;

-- A returned value as jsonb, or null when it was an error.
create function pg_temp.j(p text) returns jsonb language sql as $fn$
  select case when p is null or p like 'err:%' then null else p::jsonb end
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_ok boolean, p_detail text) returns void language sql as $fn$
  insert into t10_results values (p_n, p_check,
    case when p_ok is null then 'FAIL' when p_ok then 'PASS' else 'FAIL' end, p_detail);
$fn$;

-- The open page as anon, and whether one id is on it.
create function pg_temp.info() returns jsonb language sql as $fn$
  select pg_temp.j(pg_temp.val_as('anon', null, format('select public.hub_join_info(%L)::text', (select ev from t10_fx))))
$fn$;
create function pg_temp.listed(p_info jsonb, p_id uuid) returns boolean language sql as $fn$
  select exists (select 1 from jsonb_array_elements(p_info -> 'students') s where (s ->> 'id')::uuid = p_id)
$fn$;
create function pg_temp.join_as_anon(p_student uuid, p_email text) returns text language sql as $fn$
  select pg_temp.val_as('anon', null, format('select public.hub_join(%L, %L, %L, %L, true)::text',
           (select ev from t10_fx), p_student, 'Rls Parent', p_email))
$fn$;
-- Count the invite_id keys holding a value anywhere under a json value.
create function pg_temp.ids_shown(p jsonb) returns int language sql as $fn$
  select count(*)::int from jsonb_path_query(p, 'strict $.**.invite_id', '{}', true) x where x <> 'null'::jsonb
$fn$;

-- 1-2. The lead-student L is on the open page and can be started.
do $c$
declare f t10_fx; j jsonb; r text;
begin
  select * into f from t10_fx;
  j := pg_temp.info();
  perform pg_temp.rec(1, 'a student who also holds lead, with this season application, is listed on the open link',
    pg_temp.listed(j, f.l), format('L listed: %s; students on the page: %s', pg_temp.listed(j, f.l), jsonb_array_length(j -> 'students')));
  r := pg_temp.join_as_anon(f.l, 'rls0010.lead.family@example.invalid');
  update t10_fx set tok = pg_temp.j(r) ->> 'token',
                    inv_l = (select i.id from public.hub_invites i where i.event_id = f.ev and i.student_id = f.l);
  perform pg_temp.rec(2, 'a parent starts the lead-student family on the open link and lands on its page',
    pg_temp.j(r) ->> 'status' = 'in' and pg_temp.j(r) ->> 'token' is not null
      and (select inv_l from t10_fx) is not null,
    case when r like 'err:%' then r else format('status %s, token %s', pg_temp.j(r) ->> 'status', (pg_temp.j(r) ->> 'token') is not null) end);
end
$c$;

-- 3-5. Mentor and admin are not on the page and are refused; the plain
-- student is on it. Exactly two of the four.
do $c$
declare f t10_fx; j jsonb; rm text; ra text; n int;
begin
  select * into f from t10_fx;
  j := pg_temp.info();
  rm := pg_temp.join_as_anon(f.m, 'rls0010.mentor.family@example.invalid');
  ra := pg_temp.join_as_anon(f.a, 'rls0010.admin.family@example.invalid');
  perform pg_temp.rec(3, 'a student who also holds mentor is not listed and cannot be started',
    not pg_temp.listed(j, f.m) and rm like 'err:P0001:hub:student%', format('listed %s; join %s', pg_temp.listed(j, f.m), rm));
  perform pg_temp.rec(4, 'a student who also holds admin is not listed and cannot be started',
    not pg_temp.listed(j, f.a) and ra like 'err:P0001:hub:student%', format('listed %s; join %s', pg_temp.listed(j, f.a), ra));
  select count(*)::int into n from unnest(array[f.l, f.m, f.a, f.s]) x where pg_temp.listed(j, x);
  perform pg_temp.rec(5, 'a plain student with this season application is listed: two of the four (lead and plain), not mentor or admin',
    pg_temp.listed(j, f.s) and n = 2, format('S listed %s; listed of L, M, A, S: %s (want 2)', pg_temp.listed(j, f.s), n));
end
$c$;

-- 6. The same rule in Add them (_hub_sync_invites) and in the readiness
-- count (_hub_overview): both agree with the open page.
do $c$
declare f t10_fx; j jsonb; got text; ov jsonb; n_page int; n_rule int;
begin
  select * into f from t10_fx;
  perform public._hub_sync_invites(f.ev);
  select string_agg(case x when f.l then 'L' when f.m then 'M' when f.a then 'A' when f.s then 'S' end, '' order by
                    case x when f.l then 1 when f.m then 2 when f.a then 3 else 4 end) into got
    from unnest(array[f.l, f.m, f.a, f.s]) x
   where exists (select 1 from public.hub_invites i where i.event_id = f.ev and i.student_id = x);
  update t10_fx set inv_s = (select i.id from public.hub_invites i where i.event_id = f.ev and i.student_id = f.s);
  j := pg_temp.info();
  ov := public._hub_overview(f.ev);
  n_page := jsonb_array_length(j -> 'students');
  select count(*)::int into n_rule from public.profiles p where public._hub_roster_student(p.id);
  perform pg_temp.rec(6, 'Add them makes invites for the lead and the plain student only, and the readiness roster count equals the open page list',
    got = 'LS' and (ov ->> 'roster')::int = n_page and n_page = n_rule and n_page >= 2
      and (ov ->> 'roster_without_invite')::int = (select count(*) from public.profiles p where public._hub_roster_student(p.id)
                                                      and not exists (select 1 from public.hub_invites i where i.event_id = f.ev and i.student_id = p.id)),
    format('invited of L, M, A, S: %s (want LS); readiness roster %s, open page %s, the rule %s; without invite %s',
           coalesce(got, 'none'), ov ->> 'roster', n_page, n_rule, ov ->> 'roster_without_invite'));
end
$c$;

-- 7. Names come from the application: the open page, the family page, the
-- mentor Families list, the surname, and the welcome email.
do $c$
declare f t10_fx; j jsonb; page jsonb; ov jsonb; on_page text; on_family text; on_mentor text; subj text; sur text;
begin
  select * into f from t10_fx;
  j := pg_temp.info();
  select s ->> 'name' into on_page from jsonb_array_elements(j -> 'students') s where (s ->> 'id')::uuid = f.l;
  page := pg_temp.j(pg_temp.val_as('service_role', null, format('select public.hub_family_call(%L, %L, %L)::text', f.tok, 'fetch', '{}')));
  on_family := page -> 'student' ->> 'name';
  ov := public._hub_overview(f.ev);
  select x ->> 'name' into on_mentor from jsonb_array_elements(ov -> 'families') x where (x ->> 'invite_id')::uuid = f.inv_l;
  select o.subject into subj from public.hub_outbox o where o.link_invite_id = f.inv_l order by o.created_at limit 1;
  update public.hub_responses set parent_name = null where invite_id = f.inv_l;
  sur := public._hub_family_surname(f.inv_l);
  perform pg_temp.rec(7, 'the lead-student is named Lena Testcase from the application everywhere, never by the profile email or nickname',
    on_page = 'Lena Testcase' and on_family = 'Lena Testcase' and on_mentor = 'Lena Testcase'
      and subj like '%Lena%' and subj not like '%@%' and subj not like '%Supreme%'
      and sur = 'Testcase',
    format('open page %s; family page %s; mentor list %s; welcome subject %s; surname %s', on_page, on_family, on_mentor, subj, sur));
end
$c$;

-- 8. No name on the open page contains an at sign or looks like an email.
do $c$
declare j jsonb; n int; bad text;
begin
  j := pg_temp.info();
  n := jsonb_array_length(j -> 'students');
  select string_agg(s ->> 'name', ', ') into bad from jsonb_array_elements(j -> 'students') s
   where position('@' in s ->> 'name') > 0 or (s ->> 'name') ~* '^[a-z0-9._-]+\.[0-9]{2,4}$';
  perform pg_temp.rec(8, 'no name on the open page contains an at sign or is an email local part',
    n >= 2 and bad is null, format('%s names listed; offending: %s', n, coalesce(bad, 'none')));
end
$c$;

-- 9. With no application at all, the profile is used, but never an email:
-- the nickname when the full name is an email, the full name when it is
-- clean, A student when both are junk. With an application, never the
-- profile, even a clean one.
do $c$
declare f t10_fx; a1 text; a2 text; a3 text; b1 text;
begin
  select * into f from t10_fx;
  a1 := public._hub_student_name(f.n_);
  update public.profiles set full_name = 'Nora Fullname' where id = f.n_;
  a2 := public._hub_student_name(f.n_);
  update public.profiles set full_name = 'nora@example.invalid', nickname = 'ntest.2030' where id = f.n_;
  a3 := public._hub_student_name(f.n_);
  update public.profiles set full_name = 'Clean Profile' where id = f.l;
  b1 := public._hub_student_name(f.l);
  perform pg_temp.rec(9, 'no application: the profile name, skipping an email; with an application: the application, never the profile',
    a1 = 'Nora Nickname' and a2 = 'Nora Fullname' and a3 = 'A student' and b1 = 'Lena Testcase',
    format('email full name -> %s; clean full name -> %s; both junk -> %s; application over a clean profile -> %s', a1, a2, a3, b1));
end
$c$;

-- 10. The family link of the lead-student is family scope. It is read the
-- way the Edge Function reads it (service role), once plainly and once with
-- the lead signed in on the same request. Neither shows another family
-- invite id, which the staff board shows; a staff action is refused.
do $c$
declare f t10_fx; plain jsonb; signed jsonb; staff_board jsonb; r text; n_plain int; n_signed int; n_staff int;
begin
  select * into f from t10_fx;
  insert into public.hub_day_answers (invite_id, day_id, attending) values (f.inv_s, f.dy, 'yes')
  on conflict do nothing;
  plain := pg_temp.j(pg_temp.val_as('service_role', null, format('select public.hub_family_call(%L, %L, %L)::text', f.tok, 'fetch', '{}')));
  signed := pg_temp.j(pg_temp.val_as('service_role', f.l, format('select public.hub_family_call(%L, %L, %L)::text', f.tok, 'fetch', '{}')));
  staff_board := public._hub_board(f.ev, 'staff', null);
  r := pg_temp.val_as('service_role', f.l, format('select public.hub_family_call(%L, %L, %L)::text', f.tok, 'sync_invites', '{}'));
  n_plain := pg_temp.ids_shown(plain -> 'board');
  n_signed := pg_temp.ids_shown(signed -> 'board');
  n_staff := pg_temp.ids_shown(staff_board);
  perform pg_temp.rec(10, 'the lead-student family link gives family scope (own page, no other family ids, no staff actions), signed in or not',
    plain ->> 'viewer' = 'family' and signed ->> 'viewer' = 'family'
      and (plain ->> 'invite_id')::uuid = f.inv_l and (signed ->> 'invite_id')::uuid = f.inv_l
      and n_plain = 0 and n_signed = 0 and n_staff >= 1
      and plain -> 'board' = public._hub_board(f.ev, 'family', f.inv_l)
      and r like 'err:P0001:hub:unknown_action%',
    format('viewer %s / %s; invite ids shown: plain %s, signed in %s, staff board %s; staff action through the link: %s',
           plain ->> 'viewer', signed ->> 'viewer', n_plain, n_signed, n_staff, r));
end
$c$;

-- 11. The lead signed in sees what they saw before 0010: a lead is staff, so
-- the staff board. A plain student sees the member board (the control that
-- the two differ).
do $c$
declare f t10_fx; bl jsonb; bs jsonb; n_l int; n_s int;
begin
  select * into f from t10_fx;
  bl := pg_temp.j(pg_temp.val_as('authenticated', f.l, format('select public.hub_member_board(%L)::text', f.ev)));
  bs := pg_temp.j(pg_temp.val_as('authenticated', f.s, format('select public.hub_member_board(%L)::text', f.ev)));
  n_l := pg_temp.ids_shown(bl -> 'board');
  n_s := pg_temp.ids_shown(bs -> 'board');
  perform pg_temp.rec(11, 'the lead own signed-in view is still the staff board; a plain student still gets the member board',
    bl -> 'board' = public._hub_board(f.ev, 'staff', null) and bs -> 'board' = public._hub_board(f.ev, 'member', null)
      and n_l >= 1 and n_s = 0,
    format('lead board shows %s invite ids, student board %s', n_l, n_s));
end
$c$;

-- 12. Grants: the helpers are callable by nobody; the open page still is.
do $c$
declare bad text; definer_ok boolean; open_ok boolean;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('_hub_roster_student', '_hub_clean_name', '_hub_join_eligible', '_hub_student_name', '_hub_family_surname')
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE'));
  select bool_and(p.prosecdef) into definer_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('_hub_roster_student', '_hub_student_name', '_hub_join_eligible');
  open_ok := has_function_privilege('anon', 'public.hub_join_info(uuid)', 'EXECUTE')
         and has_function_privilege('anon', 'public.hub_join(uuid, uuid, text, text, boolean)', 'EXECUTE');
  perform pg_temp.rec(12, 'the roster and naming helpers are executable by nobody, run as definer, and the open page is still open to anon',
    bad is null and definer_ok and open_ok,
    format('executable helpers: %s; definer %s; open page callable by anon %s', coalesce(bad, 'none'), definer_ok, open_ok));
end
$c$;

select n, check_name as check, result, detail from t10_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 and count(*) = 12 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP of %s checks', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'),
              count(*) filter (where result = 'SKIP'), count(*))
  from t10_results
order by 1;

rollback;
