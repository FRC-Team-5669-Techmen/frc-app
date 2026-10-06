-- ============================================================
-- 0011_event_hub_parent_service_hours -- a parent service hours note on a
-- hub event, and the data for the mentor service hours export.
--
-- WHY
--   Mr. Pina, 2026-10-06: "Driving, attending, and volunteering for Beach
--   Blitz are eligible for parent service hours." Parents should see that
--   where it motivates them: on the open link, near the top of the family
--   page, at the driver offer, at the adults question, and in Event info.
--   Mentors need a list of who drove and how many adults came, per family
--   per day, to sign the hours off.
--
-- WHAT CHANGES
--   1. hub_events.parent_service_hours_note (text, nullable). ONE stored
--      sentence per event; every spot on the pages shows it or a fixed short
--      label derived from it. Null means nothing renders anywhere. Mentors
--      edit it on the mentor page Setup tab, through the existing staff
--      write policy on hub_events (no grant or policy changes here).
--   2. Beach Blitz 2026 (the 0006 row) gets its note, only while the column
--      is still empty, so a second paste never overwrites a mentor edit.
--   3. _hub_event_json (0005) carries the note, so the family page, the
--      member board and the mentor page all receive it.
--   4. hub_join_info (0007) carries the note, so the open link shows it.
--   5. _hub_export (0005) gains, on each day, the date and drove: true when
--      the family listed a car for that day (a hub_cars row with this family
--      as driver, either run). The service hours CSV reads them. The form
--      records a COUNT of adults attending, never their names, so the export
--      cannot name every adult who came; this file adds no question for it.
--
-- Nothing here moves, renames or re-keys an existing answer. The functions
-- keep their signatures, so their grants stand as 0005 and 0007 set them.
--
-- APPLY: by hand, once, AFTER 0005 to 0010, in the Supabase SQL editor.
-- Re-runnable. No Edge Function redeploy (the family page reads the event
-- through hub_family_call, which the function passes on as it is). Pasting
-- 0005 or 0007 again later reverts the functions this file defines; paste
-- 0011 again afterwards.
--
-- UNDO: paste 0005, then 0007, then 0008 and 0010 (they restore the three
-- functions as they were), then
--   alter table public.hub_events drop column if exists parent_service_hours_note;
-- ============================================================

do $needs$
begin
  if to_regclass('public.hub_events') is null
     or to_regprocedure('public.hub_join_info(uuid)') is null
     or to_regprocedure('public._hub_roster_student(uuid)') is null then
    raise exception 'Apply 0005 to 0010 first.';
  end if;
end
$needs$;

-- ── 1. The note ─────────────────────────────────────────────────────────────

alter table public.hub_events
  add column if not exists parent_service_hours_note text
    check (parent_service_hours_note is null or length(btrim(parent_service_hours_note)) between 1 and 300);

-- ── 2. Beach Blitz 2026 ─────────────────────────────────────────────────────

update public.hub_events
   set parent_service_hours_note = 'Driving, attending, and volunteering at Beach Blitz all count toward parent service hours.',
       updated_at = now()
 where id = 'b1b12026-0000-4000-8000-000000000001'
   and parent_service_hours_note is null;

-- ── 3. The event as every page receives it (0005, plus the note) ────────────

create or replace function public._hub_event_json(p_event uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'venue_name', e.venue_name, 'venue_address', e.venue_address,
    'map_url', e.map_url, 'timezone', e.timezone,
    'phase1_due_at', e.phase1_due_at, 'lockin_opens_at', e.lockin_opens_at, 'lockin_due_at', e.lockin_due_at,
    'starts_on', (select min(d.day_date) from public.hub_days d where d.event_id = e.id),
    'ends_at', public._hub_event_end(e.id),
    'over', now() >= public._hub_event_end(e.id),
    'lockin_open', e.lockin_opens_at is not null and now() >= e.lockin_opens_at,
    'one_minor_rule', e.one_minor_rule, 'driver_paperwork_required', e.driver_paperwork_required,
    'links', e.links, 'info', e.info,
    'parent_service_hours_note', nullif(btrim(e.parent_service_hours_note), ''))
  from public.hub_events e where e.id = p_event
$fn$;

-- ── 4. The open link (0007, plus the note) ──────────────────────────────────

create or replace function public.hub_join_info(p_event uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_ev uuid := public._hub_join_event(p_event); e public.hub_events;
begin
  if v_ev is null then
    perform public._hub_refuse('not_open', 'This sign-up is closed or the link is not right. Ask the team for the current link.');
  end if;
  select * into e from public.hub_events where id = v_ev;
  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'title', e.title, 'venue_name', e.venue_name, 'timezone', e.timezone,
      'first_day', (select min(d.day_date) from public.hub_days d where d.event_id = e.id),
      'last_day',  (select max(d.day_date) from public.hub_days d where d.event_id = e.id),
      'lockin_due_at', e.lockin_due_at,
      'parent_service_hours_note', nullif(btrim(e.parent_service_hours_note), '')),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', public._hub_student_name(p.id))
                       order by public._hub_student_name(p.id))
        from public.profiles p where public._hub_join_eligible(p.id)), '[]'::jsonb));
end
$fn$;

-- ── 5. The staff export (0005, plus date and drove on each day) ─────────────

create or replace function public._hub_export(p_event uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(row order by row ->> 'student'), '[]'::jsonb) from (
    select jsonb_build_object(
      'student', public._hub_student_name(i.student_id),
      'emails', array_to_string(i.emails, '; '),
      'invite', public._hub_invite_status(i.id),
      'phase1_done', (public._hub_progress(i.id) ->> 'phase1_done'),
      'lockin_done', (public._hub_progress(i.id) ->> 'lockin_done'),
      'parent_name', r.parent_name, 'parent_phone', r.parent_phone, 'parent_email', r.parent_email,
      'emergency_name', r.emergency_name, 'emergency_phone', r.emergency_phone,
      'staying_nights', array_to_string(r.staying_nights, '; '),
      'allergies_none', r.allergies_none, 'allergens', array_to_string(r.allergens, '; '),
      'allergy_other', r.allergy_other, 'dietary', r.dietary, 'medication', r.medication,
      'first_reg_done', r.first_reg_done, 'school_form_done', r.school_form_done,
      'driver_25', r.driver_25, 'driver_licensed', r.driver_licensed,
      'driver_paperwork_on_file', r.driver_paperwork_at is not null,
      'driver_phone_consent', r.driver_phone_consent_at is not null,
      'rider_phone_consent', r.rider_phone_consent_at is not null,
      'days', (select coalesce(jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day_date, 'Dy'),
                 'date', p.day_date,
                 'attending', p.attending, 'adults', p.adults, 'confirmed', a.confirmed_at is not null,
                 'pit_setup', a.pit_setup, 'home_option', a.home_option,
                 'to', p.eff_to, 'home', p.eff_home, 'school', p.school_mode,
                 'pickup_spot', pk.spot,
                 'to_car', (select public._hub_driver_name(s.car_id) from public.hub_seats s
                             where s.invite_id = i.id and s.day_id = p.day_id and s.run = 'to'),
                 'home_car', (select public._hub_driver_name(s.car_id) from public.hub_seats s
                               where s.invite_id = i.id and s.day_id = p.day_id and s.run = 'home'),
                 'drove', exists (select 1 from public.hub_cars c
                                   where c.driver_invite_id = i.id and c.day_id = p.day_id))
                 order by p.day_date), '[]'::jsonb)
                 from public._hub_plan(i.event_id) p
                 left join public.hub_day_answers a on a.invite_id = p.invite_id and a.day_id = p.day_id
                 left join public.hub_pickups pk on pk.invite_id = p.invite_id and pk.day_id = p.day_id
                where p.invite_id = i.id),
      'food', (select string_agg(m.label || ': ' || fc.what || ' (serves ' || fc.serves || ')', '; ' order by m.starts_at)
                 from public.hub_food_claims fc join public.hub_meals m on m.id = fc.meal_id
                where fc.invite_id = i.id)) as row
      from public.hub_invites i
      left join public.hub_responses r on r.invite_id = i.id
     where i.event_id = p_event) q
$fn$;

-- create or replace keeps each function ACL; these restate it exactly as
-- 0005 (section 15) and 0007 set it, so nothing here widens or narrows it.
revoke all on function public._hub_event_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public._hub_export(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hub_join_info(uuid) from public;
grant execute on function public.hub_join_info(uuid) to anon, authenticated, service_role;
