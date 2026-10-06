-- ============================================================
-- 0010_event_hub_roster_names -- student leads on the event hub roster, and
-- every student named by their application.
--
-- WHY
--   Two faults on the live Beach Blitz sign-up, found the night the link
--   went to parents:
--     * STUDENT LEADS WERE MISSING. Every hub roster filter required the
--       student role AND no role in (mentor, lead, admin). A lead is a
--       student who also holds lead, so a family could not pick them on the
--       open link, Add them on the mentor page skipped them, and the
--       readiness count did not include them. The filter was written out
--       three times (0005 _hub_sync_invites, 0005 then 0008 _hub_overview,
--       0007 _hub_join_eligible), so a fix in one place would have left the
--       other two disagreeing.
--     * STUDENTS SHOWED AS EMAIL ADDRESSES. _hub_student_name read
--       profiles.full_name then nickname, and some profiles carry a sign-in
--       email or a joke title there. The hub shows that name to parents on
--       the picker, the family page, the boards and in every email.
--
-- WHAT CHANGES
--   1. ONE ROSTER RULE, _hub_roster_student(student): approved, active, holds
--      the student role, holds NEITHER mentor NOR admin (lead no longer
--      excludes), and has an application for the current season. Every
--      roster site reads it:
--        * _hub_join_eligible (0007): now only calls it. Kept by name because
--          hub_join (0008) and hub_join_info (0007) call it.
--        * _hub_sync_invites (0005, Add them on the mentor page): the roster
--          it creates invites for. This now ALSO requires the application,
--          which it did not before; an invite already made is never removed.
--        * _hub_overview (0008, the readiness lines): the roster count and
--          the count still without an invite.
--      The boards, emails and CSV read invites, never the roster, so they
--      needed no change for this.
--   2. ONE NAME, _hub_student_name(student): the legal first and last name
--      from the application (this season first, else the latest), and only
--      when the student has no application at all the profile full name,
--      else the nickname. A name containing an at sign, or shaped like a
--      school email before the at sign (letters, a dot, a year), is never
--      used; with nothing usable it reads A student. _hub_clean_name is that
--      test. Everything the hub names a student through already calls
--      _hub_student_name (the picker, family page, boards, emails, mentor
--      page, CSV and day sheet are built from it), and _hub_family_surname
--      (Claimed by the X family) now takes the surname from it instead of
--      reading profiles.full_name itself.
--
-- WHAT A LEAD WHO IS ALSO A HUB FAMILY GETS
--   Their family is an ordinary family: one invite, links for the parent
--   emails, the family board. Nothing on the family path reads the signed-in
--   user: hub_family_call runs from the Edge Function as the service role,
--   and hub_join and hub_add_parent decide on the token and arguments alone,
--   so a lead signed in on the same phone gets family scope there, never
--   staff. Their own signed-in view is unchanged: a lead is is_staff(), so
--   /trips shows them the staff board, exactly as before this file.
--
-- APPLY: by hand, once, AFTER 0005 to 0008 (0009 may come before or after;
-- it touches none of these functions), in the Supabase SQL editor.
-- Re-runnable. Then 0010_event_hub_roster_names_rls_test.sql
-- (rollback-safe). No Edge Function redeploy. Pasting 0005, 0007 or 0008
-- again later reverts the functions it defines; paste 0010 again afterwards.
--
-- UNDO: paste 0005, then 0007, then 0008 (they restore _hub_sync_invites,
-- _hub_student_name, _hub_family_surname, _hub_join_eligible and
-- _hub_overview), then drop function public._hub_roster_student(uuid) and
-- public._hub_clean_name(text).
-- ============================================================

do $needs$
begin
  if to_regprocedure('public.hub_staff_place_pair(uuid, uuid, uuid)') is null
     or to_regprocedure('public._hub_join_eligible(uuid)') is null then
    raise exception 'Apply 0005, 0007 and 0008 first.';
  end if;
end
$needs$;

-- The roster: who a family may sign up, who Add them makes an invite for,
-- and who the readiness lines count. The ONLY copy of this rule.
create or replace function public._hub_roster_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.profiles p
     where p.id = p_student and p.approved and p.status = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
       and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'admin'))
       and exists (select 1 from public.member_applications ma
                    where ma.member_id = p.id and ma.season_id = public._hub_current_season()))
$fn$;

-- 0007 name, kept for its callers (hub_join_info, hub_join).
create or replace function public._hub_join_eligible(p_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select public._hub_roster_student(p_student)
$fn$;

-- A name fit to show a parent, or null: trimmed, spaces collapsed, no at
-- sign, and not a bare email local part like jdoe.2029.
create or replace function public._hub_clean_name(p_name text)
returns text language sql immutable set search_path = public, pg_temp as $fn$
  select case when v = '' or position('@' in v) > 0 or v ~* '^[a-z0-9._-]+\.[0-9]{2,4}\Z' then null else v end
    from (select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')) as v) x
$fn$;

-- How the hub names a student, everywhere.
create or replace function public._hub_student_name(p_student uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(
    (select public._hub_clean_name(concat_ws(' ', btrim(ma.legal_first_name), btrim(ma.legal_last_name)))
       from public.member_applications ma
      where ma.member_id = p_student
      order by (ma.season_id = public._hub_current_season()) desc nulls last, ma.submitted_at desc, ma.id
      limit 1),
    (select coalesce(public._hub_clean_name(p.full_name), public._hub_clean_name(p.nickname))
       from public.profiles p
      where p.id = p_student
        and not exists (select 1 from public.member_applications ma where ma.member_id = p_student)),
    'A student')
$fn$;

-- Claimed by the <surname> family: the parent last word, else the student
-- surname as _hub_student_name gives it, else Team.
create or replace function public._hub_family_surname(p_invite uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(
           nullif(regexp_replace(public._hub_clean_name(r.parent_name), '^.*\s', ''), ''),
           nullif(regexp_replace(nullif(public._hub_student_name(i.student_id), 'A student'), '^.*\s', ''), ''),
           'Team')
    from public.hub_invites i
    left join public.hub_responses r on r.invite_id = i.id
   where i.id = p_invite
$fn$;

-- 0005s _hub_sync_invites (Add them): the roster is the one rule.
create or replace function public._hub_sync_invites(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_created int; v_filled int;
begin
  with roster as (
    select p.id from public.profiles p where public._hub_roster_student(p.id)),
  ins as (
    insert into public.hub_invites (event_id, student_id, emails)
    select p_event, ro.id, public._hub_app_emails(ro.id) from roster ro
    on conflict (event_id, student_id) do nothing
    returning id)
  select count(*) into v_created from ins;

  with upd as (
    update public.hub_invites i set emails = public._hub_app_emails(i.student_id)
     where i.event_id = p_event and cardinality(i.emails) = 0 and cardinality(public._hub_app_emails(i.student_id)) > 0
    returning i.id)
  select count(*) into v_filled from upd;

  insert into public.hub_responses (invite_id, parent_name, parent_phone, parent_email)
  select i.id, ma.parent_name, ma.parent_phone, lower(btrim(ma.parent_email))
    from public.hub_invites i
    join public.member_applications ma on ma.member_id = i.student_id and ma.season_id = public._hub_current_season()
   where i.event_id = p_event
  on conflict (invite_id) do update
    set parent_name  = coalesce(public.hub_responses.parent_name, excluded.parent_name),
        parent_phone = coalesce(public.hub_responses.parent_phone, excluded.parent_phone),
        parent_email = coalesce(public.hub_responses.parent_email, excluded.parent_email);

  return jsonb_build_object('created', v_created, 'emails_filled', v_filled);
end
$fn$;

-- 0008s _hub_overview: the readiness roster count reads the one rule.
create or replace function public._hub_overview(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  e public.hub_events; v_fam jsonb; v_att jsonb; v_car jsonb; v_food jsonb; v_drivers jsonb;
  v_roster int; v_missing int; v_out jsonb;
begin
  select * into e from public.hub_events where id = p_event;
  if e.id is null then perform public._hub_refuse('event_gone', 'That event does not exist.'); end if;

  select count(*), count(*) filter (where not exists (select 1 from public.hub_invites i where i.event_id = p_event and i.student_id = p.id))
    into v_roster, v_missing
    from public.profiles p
   where public._hub_roster_student(p.id);

  select coalesce(jsonb_agg(f order by f ->> 'name'), '[]'::jsonb) into v_fam
    from (select jsonb_build_object(
                   'invite_id', i.id, 'student_id', i.student_id,
                   'name', public._hub_student_name(i.student_id),
                   'emails', i.emails,
                   'invite_status', public._hub_invite_status(i.id),
                   'phase1_done', (pr ->> 'phase1_done')::boolean,
                   'lockin_done', (pr ->> 'lockin_done')::boolean,
                   'missing', jsonb_array_length(pr -> 'missing'),
                   'first_reg_done', r.first_reg_done,
                   'school_form_done', r.school_form_done) as f
            from public.hub_invites i
            left join public.hub_responses r on r.invite_id = i.id
            cross join lateral (select public._hub_progress(i.id) as pr) x
           where i.event_id = p_event) q;

  select coalesce(jsonb_agg(jsonb_build_object(
           'day_id', d.id, 'label', to_char(d.day_date, 'FMDay, Mon FMDD'),
           'yes', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending = 'yes'),
           'no', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending = 'no'),
           'unsure', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending = 'unsure'),
           'none', (select count(*) from public._hub_plan(p_event) p where p.day_id = d.id and p.attending is null))
           order by d.day_date), '[]'::jsonb)
    into v_att from public.hub_days d where d.event_id = p_event;

  select coalesce(jsonb_agg(jsonb_build_object(
           'day_id', d.id, 'label', to_char(d.day_date, 'FMDay, Mon FMDD'),
           'runs', (select jsonb_agg(jsonb_build_object(
                       'run', rr.run,
                       'needs_seat', (rr.b ->> 'needs_seat')::int,
                       'open_seats', (rr.b ->> 'open_seats')::int,
                       'unplaced', rr.b -> 'unplaced',
                       'open_pickups', case when jsonb_typeof(rr.b -> 'pickups') = 'array'
                                            then jsonb_array_length(rr.b -> 'pickups') else 0 end,
                       'pending', (select coalesce(jsonb_agg(jsonb_build_object('car_id', c ->> 'id', 'driver', c ->> 'driver')), '[]'::jsonb)
                                     from jsonb_array_elements(rr.b -> 'cars') c where c ->> 'status' = 'pending'),
                       'red', (select coalesce(jsonb_agg(jsonb_build_object('car_id', c ->> 'id', 'driver', c ->> 'driver', 'problem', c ->> 'problem')), '[]'::jsonb)
                                 from jsonb_array_elements(rr.b -> 'cars') c where c ->> 'problem' is not null))
                       order by rr.run desc)
                     from (select x.run, public._hub_board_run(d.id, x.run, 'staff', null) as b
                             from (values ('to'), ('home')) x(run)) rr))
           order by d.day_date), '[]'::jsonb)
    into v_car from public.hub_days d where d.event_id = p_event;

  select coalesce(jsonb_agg(jsonb_build_object(
           'meal_id', m.id, 'label', m.label, 'starts_at', m.starts_at,
           'open', (select coalesce(jsonb_agg(n.label order by n.position), '[]'::jsonb)
                      from public.hub_food_needs n
                     where n.meal_id = m.id and not exists (select 1 from public.hub_food_claims fc where fc.need_id = n.id)),
           'starter', (select count(*) from public.hub_food_needs n where n.meal_id = m.id and n.starter))
           order by m.starts_at, m.position), '[]'::jsonb)
    into v_food from public.hub_meals m where m.event_id = p_event;

  select coalesce(jsonb_agg(jsonb_build_object(
           'invite_id', i.id, 'driver', coalesce(nullif(btrim(r.parent_name), ''), public._hub_student_name(i.student_id) || '''s family'),
           'student', public._hub_student_name(i.student_id),
           'on_file', r.driver_paperwork_at is not null,
           'checks', coalesce(r.driver_25, false) and coalesce(r.driver_licensed, false))
           order by public._hub_student_name(i.student_id)), '[]'::jsonb)
    into v_drivers
    from public.hub_invites i
    left join public.hub_responses r on r.invite_id = i.id
   where i.event_id = p_event
     and exists (select 1 from public.hub_day_answers a where a.invite_id = i.id
                    and ('driving' in (a.to_mode, a.home_mode) or coalesce(a.drive_to, false) or coalesce(a.drive_home, false)));

  select jsonb_build_object(
           'pending', count(*) filter (where o.status in ('pending', 'sending')),
           'failed', count(*) filter (where o.status = 'failed'),
           'sent', count(*) filter (where o.status = 'sent'))
    into v_out from public.hub_outbox o where o.event_id = p_event;

  return jsonb_build_object(
    'event', public._hub_event_json(p_event),
    'alert_emails', e.alert_emails,
    'roster', v_roster, 'roster_without_invite', v_missing,
    'families', v_fam,
    'attendance', v_att, 'carpool', v_car, 'food', v_food, 'drivers', v_drivers,
    'school_form_on', nullif(btrim(e.links ->> 'school_form'), '') is not null,
    'outbox', v_out);
end
$fn$;

-- Internal helpers: nobody calls these directly. The functions redefined
-- above keep the grants 0005, 0007 and 0008 gave them.
revoke all on function public._hub_roster_student(uuid) from public, anon, authenticated, service_role;
revoke all on function public._hub_clean_name(text) from public, anon, authenticated, service_role;
revoke all on function public._hub_join_eligible(uuid) from public, anon, authenticated, service_role;
revoke all on function public._hub_student_name(uuid) from public, anon, authenticated, service_role;
revoke all on function public._hub_family_surname(uuid) from public, anon, authenticated, service_role;
