-- ============================================================
-- 0008_event_hub_families -- the family hub as families actually use it: a
-- parent who drives other students without their own, more than one parent
-- on a family (and taking one off again), a family leaving the trip, more
-- adults per day, and the one-child rule made permanent.
--
-- WHAT CHANGES, AND WHY
--   1. ADULTS. hub_day_answers.adults was 0..4. A family bringing
--      grandparents and cousins to a competition is real, so it is now 0..30
--      (hub_day_answers_adults_chk) and _hub_save takes any whole number in
--      that range ("Choose 0 to 30 adults.").
--
--   2. A PARENT MAY DRIVE STUDENTS WITHOUT DRIVING THEIR OWN. New day answers
--      drive_to / drive_home mean "a parent drives a car for the team on this
--      run", whatever the family's own student does that day: rides the
--      carpool, goes another way, or is not coming at all. A family car
--      exists for a run when its offer and both driver checks are complete
--      AND (the student is coming and that run's mode is "driving", OR that
--      run's flag is on). One car per run, whichever answer made it.
--      Clearing the flag withdraws the car exactly as switching off "driving"
--      always has (riders dropped and emailed, pickups released, refused once
--      the car has left). _hub_own_aboard is UNCHANGED, so a flag car without
--      the family's own student falls under the one-child rule like a
--      mentor's car: one rider alone is refused, two are fine. Progress asks
--      for the car offer and the driver checks on any day a flag is on,
--      coming or not. Four consequences, each because 0005 could never have
--      a family car without the family's own student in it:
--        * that car can now turn red because the driver's OWN student left it
--          (the run's mode moved off "driving" with the flag still on and one
--          rider aboard). _hub_save emails mentors when one of the family's
--          cars turns red on a save, the way a rider leaving always has;
--        * withdrawing a car with two or more riders passes through "one
--          rider left" on its way to empty, so _hub_alert_if_red is told, by
--          the transaction-local setting hub.withdrawing_car, not to email
--          "needs a second rider" about a car that is being deleted;
--        * a car that has left no longer blocks a change to the attending
--          answer when that change would not remove it (the flag keeps it);
--        * the mentor page's driver list (_hub_overview) lists flag drivers,
--          so their paperwork can be marked on file.
--
--   3. THE ONE-CHILD RULE IS ALWAYS ON. Salesian policy (Archdiocese of Los
--      Angeles handbook 12.3.2) is not a per-event choice. Every event is
--      switched on and hub_events_one_minor_rule_on refuses switching one
--      off (23514). How the rule is computed does not change.
--      tools/sql-harness/race-0005.mjs creates its event with the rule OFF,
--      so it runs against 0005 only: with this file applied, its insert is
--      refused.
--
--   4. GUARDIANS. Each email now carries its own link, so one person can be
--      taken off a family without cutting off the others:
--        * hub_invite_tokens.email: whose link this is (lowercased; null for
--          a token minted before 0008, or for one emailed to several people
--          at once);
--        * hub_invites.guardian_names: lowercased email -> the name given;
--        * _hub_enqueue writes ONE OUTBOX ROW PER RECIPIENT for any email
--          that carries a link to more than one person, deduped as
--          <key>:<recipient>, and hub_outbox_mint_link records the recipient
--          on the token it mints. Someone already sent the same email under
--          the old single key (a reminder that went out before this file) is
--          not sent it again, and neither is someone already sent it under
--          their own key when they are later the only address left;
--        * hub_join records the joining parent's name; hub_add_parent takes
--          the new parent's name;
--        * hub_remove_guardian(token, email), from the family page, takes one
--          person off: their links stop working, mail to them that has not
--          gone out is cancelled, and if theirs was the family's contact
--          email it is cleared (a "lost your link" request matches it). A
--          family cannot remove its last address;
--          hub_staff_remove_guardian(invite, email) can;
--        * the family page (hub_family_call) carries 'me', the email on the
--          link it was opened with, and 'guardians', [{email, name}] in the
--          family's order.
--      _hub_invite_status no longer reads the 'invite:<id>' dedupe key, which
--      only the mentor's "Send invites" ever wrote: a family that came in
--      through the open link (0007) read 'none' forever and so was never
--      reminded by hub_cron_enqueue. It now reads every email that gave the
--      family its link (invite, welcome, added, join_request, resend,
--      lockin_open): 'sent', else 'pending' (pending or sending), else
--      'failed', else 'none'.
--
--   5. REMOVING A FAMILY FROM THE TRIP. hub_remove_family(token) from the
--      family page, hub_staff_remove_family(invite) from the mentor page. Its
--      seats and the cars it drives are released through the same rule
--      functions as any other change, so the other families and mentors are
--      told; its pickup requests and the food it would bring go; mentors get
--      one email saying who removed it; and the invite is deleted with
--      everything it entered. The student is then free on the open link
--      again. A family cannot remove itself after the event, or once a car it
--      is in has left; a mentor can.
--
--   6. MENTORS SEAT TWO AT ONCE. A car without its driver's own student (a
--      mentor's van, or a drive-flag car from 2) refuses its FIRST rider
--      under the one-child rule, which is right, but it left such a car
--      unfillable: a family's first claim is refused, and a mentor's 'move'
--      needs an override reason that then stays on the car and stops it ever
--      turning red. hub_staff_place_pair(car, first, second) seats two
--      students into an EMPTY car in one call, through _hub_claim for each,
--      and leaves no override on the car. The rule is not relaxed: the car
--      is never left holding one, and if either seat is refused (car full,
--      not coming, driving, left, pending paperwork, another event) the
--      whole call rolls back and nobody is seated.
--
-- APPLY: by hand, once, AFTER 0005, 0006 and 0007, in the Supabase SQL
-- editor. Re-runnable: a second paste changes nothing. Then
-- 0008_event_hub_families_rls_test.sql (rollback-safe) and read its grid.
-- The new entry points are called from the browser through PostgREST (the
-- anon key for families, the signed-in session for staff), and
-- hub_outbox_mint_link keeps its signature, so NO Edge Function redeploy is
-- needed. hub_add_parent(text, text) is replaced by hub_add_parent(text,
-- text, text default null); the deployed page's two-argument call resolves
-- to it unchanged.
--
-- RE-PASTING AN EARLIER FILE AFTER THIS ONE reverts what this file
-- redefines: 0005 and 0007 `create or replace` the same functions, 0005's
-- grant block revokes every hub function before granting its own list, and
-- 0007 would bring back a two-argument hub_add_parent beside this one,
-- making a two-argument call ambiguous. Paste 0008 again afterwards and all
-- of it is put back.
--
-- The fixture model ports this file for the browser tests only:
-- src/dev/fixture/features/eventhubfamilies.js carries the five new entry
-- points, and features/eventhub.js gates the drive flags, the adult range
-- and the guardians list on it. That port proves pages, never this SQL.
--
-- UNDO. Removed families, revoked links and cancelled mail are not brought
-- back by anything. Otherwise, in this order:
--   drop function if exists public.hub_remove_family(text), public.hub_staff_remove_family(uuid),
--     public.hub_staff_place_pair(uuid, uuid, uuid),
--     public.hub_remove_guardian(text, text), public.hub_staff_remove_guardian(uuid, text),
--     public.hub_add_parent(text, text, text), public._hub_remove_family(uuid, uuid),
--     public._hub_remove_guardian(uuid, text, uuid), public._hub_family_extras(uuid, text),
--     public._hub_mint_token_for(uuid, text);
--   paste 0005 and then 0007 again (they restore every function this file
--     redefines, hub_add_parent(text, text), and the grants);
--   alter table public.hub_events drop constraint if exists hub_events_one_minor_rule_on;
--   alter table public.hub_day_answers drop column if exists drive_to, drop column if exists drive_home;
--   alter table public.hub_invite_tokens drop constraint if exists hub_invite_tokens_email_chk,
--     drop column if exists email;
--   alter table public.hub_invites drop constraint if exists hub_invites_guardian_names_chk,
--     drop column if exists guardian_names;
--   drop index if exists public.hub_outbox_link_invite_idx;
--   -- adults back to 0..4 fails while an answer holds 5..30; lower those first:
--   alter table public.hub_day_answers drop constraint if exists hub_day_answers_adults_chk,
--     add constraint hub_day_answers_adults_check check (adults between 0 and 4);
-- The events switched on by section 1 stay on.
-- ============================================================

do $assumes$
begin
  if to_regprocedure('public.hub_family_call(text, text, jsonb)') is null
     or to_regprocedure('public._hub_mint_token(uuid)') is null
     or to_regprocedure('public.hub_join(uuid, uuid, text, text, boolean)') is null then
    raise exception 'Cannot apply 0008: apply 0005_event_family_hub.sql and 0007_event_hub_open_link.sql first';
  end if;
end
$assumes$;

-- ── 1. Columns and constraints ──────────────────────────────────────────────

alter table public.hub_day_answers add column if not exists drive_to boolean;
alter table public.hub_day_answers add column if not exists drive_home boolean;
alter table public.hub_invite_tokens add column if not exists email text;
alter table public.hub_invites add column if not exists guardian_names jsonb not null default '{}'::jsonb;

-- Every event on, before the constraint that keeps it so.
update public.hub_events set one_minor_rule = true where not one_minor_rule;

do $constraints$
declare r record; v_att int2;
begin
  -- adults: drop the inline 0..4 check, whatever Postgres named it, then 0..30.
  select a.attnum into v_att from pg_attribute a
   where a.attrelid = 'public.hub_day_answers'::regclass and a.attname = 'adults';
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.hub_day_answers'::regclass and c.contype = 'c'
              and c.conkey = array[v_att] and c.conname <> 'hub_day_answers_adults_chk' loop
    execute format('alter table public.hub_day_answers drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.hub_day_answers'::regclass
                    and conname = 'hub_day_answers_adults_chk') then
    alter table public.hub_day_answers add constraint hub_day_answers_adults_chk check (adults between 0 and 30);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.hub_events'::regclass
                    and conname = 'hub_events_one_minor_rule_on') then
    alter table public.hub_events add constraint hub_events_one_minor_rule_on check (one_minor_rule);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.hub_invite_tokens'::regclass
                    and conname = 'hub_invite_tokens_email_chk') then
    alter table public.hub_invite_tokens add constraint hub_invite_tokens_email_chk
      check (email is null or email = lower(btrim(email)));
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.hub_invites'::regclass
                    and conname = 'hub_invites_guardian_names_chk') then
    alter table public.hub_invites add constraint hub_invites_guardian_names_chk
      check (jsonb_typeof(guardian_names) = 'object');
  end if;
end
$constraints$;

-- Invite status and removing a family both look an invite's mail up by its
-- link, and deleting an invite cascades to that mail.
create index if not exists hub_outbox_link_invite_idx
  on public.hub_outbox (link_invite_id) where link_invite_id is not null;

-- The new columns need no grant of their own: hub_day_answers and
-- hub_invites are granted SELECT at table level to authenticated (narrowed
-- to staff by RLS) and nothing to anon, and hub_invite_tokens is granted to
-- nobody. A table-level grant covers columns added later.

-- ── 2. A parent driving for the team ────────────────────────────────────────

-- 0005's _hub_alert_if_red, plus: no "needs a second rider" email about a
-- car that is being withdrawn (hub.withdrawing_car, set by _hub_sync_cars and
-- _hub_remove_family while they drop its riders one by one).
create or replace function public._hub_alert_if_red(p_car uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars; e public.hub_events; d public.hub_days; v_problem text;
begin
  if coalesce(current_setting('hub.withdrawing_car', true), '') = p_car::text then return; end if;
  select * into c from public.hub_cars where id = p_car;
  if not found then return; end if;
  v_problem := public._hub_car_problem(p_car);
  if v_problem is null then return; end if;
  select * into e from public.hub_events where id = c.event_id;
  select * into d from public.hub_days where id = c.day_id;
  perform public._hub_enqueue(e.id, 'car_red', public._hub_mentor_emails(e.id),
    format('%s: %s''s car needs a second rider', e.title, public._hub_driver_name(p_car)),
    format(E'%s''s car on %s (%s) now has %s.\nIt cannot be marked Left until a second rider joins or a mentor records an override on the mentor page.',
           public._hub_driver_name(p_car), public._hub_day(d.venue_closes_at, e.timezone), public._hub_run_label(c.run),
           case v_problem when 'single_pickup' then 'one student on the home pickup leg who is not the driver''s own'
                          else 'one student who is not the driver''s own' end));
end
$fn$;

-- 0005's _hub_sync_cars, with the drive flags: a run has a family car when
-- the offer and both driver checks are complete AND (the student is coming
-- and the run's mode is "driving", OR the run's flag is on). Withdrawing a car
-- marks it hub.withdrawing_car while its riders are dropped.
create or replace function public._hub_sync_cars(p_invite uuid, p_day uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  a public.hub_day_answers; r public.hub_responses; c public.hub_cars;
  v_event uuid; v_run text; v_mode text; v_want boolean; v_riders int; s record; v_flag boolean;
begin
  select * into a from public.hub_day_answers where invite_id = p_invite and day_id = p_day;
  select * into r from public.hub_responses where invite_id = p_invite;
  select event_id into v_event from public.hub_days where id = p_day;
  foreach v_run in array array['to', 'home'] loop
    v_mode := case v_run when 'to' then a.to_mode else a.home_mode end;
    v_flag := case v_run when 'to' then a.drive_to else a.drive_home end;
    v_want := ((coalesce(a.attending, '') = 'yes' and v_mode = 'driving') or coalesce(v_flag, false))
              and a.offer_seats is not null and nullif(btrim(a.offer_description), '') is not null
              and a.offer_leave_by is not null and a.offer_takes_pickups is not null
              and coalesce(r.driver_25, false) and coalesce(r.driver_licensed, false);
    select * into c from public.hub_cars
     where day_id = p_day and run = v_run and driver_invite_id = p_invite for update;
    if v_want then
      if c.id is null then
        insert into public.hub_cars (event_id, day_id, run, driver_invite_id, seats, description, leave_by, takes_pickups)
        values (v_event, p_day, v_run, p_invite, a.offer_seats, btrim(a.offer_description), a.offer_leave_by, a.offer_takes_pickups);
      elsif c.left_at is null then
        select count(*) into v_riders from public.hub_seats where car_id = c.id;
        if a.offer_seats < v_riders then
          perform public._hub_refuse('seats_below_riders',
            format('%s students ride with you %s. Ask a mentor to move one before lowering seats.', v_riders, public._hub_run_label(v_run)));
        end if;
        update public.hub_cars
           set seats = a.offer_seats, description = btrim(a.offer_description), leave_by = a.offer_leave_by,
               takes_pickups = a.offer_takes_pickups, updated_at = now()
         where id = c.id;
      end if;
    elsif c.id is not null then
      if c.left_at is not null then
        perform public._hub_refuse('car_left', 'That car already left. Ask a mentor.');
      end if;
      perform set_config('hub.withdrawing_car', c.id::text, true);
      for s in select invite_id from public.hub_seats where car_id = c.id loop
        perform public._hub_drop_seat(c.id, s.invite_id, 'driver');
      end loop;
      perform set_config('hub.withdrawing_car', '', true);
      update public.hub_pickups set car_id = null, accepted_at = null, updated_at = now() where car_id = c.id;
      delete from public.hub_cars where id = c.id;
    end if;
  end loop;
end
$fn$;

-- 0005's _hub_progress: the car offer and the driver checks are asked on a
-- day where "driving" is an effective mode on a coming day, OR either drive
-- flag is on (whatever attending is). Same missing keys, same step.
create or replace function public._hub_progress(p_invite uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_event   uuid;
  e         public.hub_events;
  r         public.hub_responses;
  d         record;
  missing   jsonb := '[]'::jsonb;
  v_eff_to  text;
  v_eff_home text;
  unsure    int := 0;
  unconfirmed int := 0;
  coming    int := 0;
  v_needs_car boolean;
  s_days boolean := true; s_getting boolean := true; s_food boolean := true; s_contacts boolean := true;
begin
  select i.event_id into v_event from public.hub_invites i where i.id = p_invite;
  select * into e from public.hub_events where id = v_event;
  select * into r from public.hub_responses where invite_id = p_invite;

  if r.staying_nights is null then
    s_days := false;
    missing := missing || jsonb_build_object('step', 'days', 'key', 'staying');
  end if;

  for d in
    select dd.id, dd.day_date, dd.ask_pit_setup, dd.ask_school_ride,
           a.attending, a.adults, a.pit_setup, a.school_mode, a.to_mode, a.home_mode,
           a.drive_to, a.drive_home,
           a.offer_seats, a.offer_description, a.offer_leave_by, a.offer_takes_pickups, a.confirmed_at,
           coalesce((dd.day_date - 1) = any(r.staying_nights), false) as nb_before,
           coalesce(dd.day_date = any(r.staying_nights), false) as nb_after,
           pk.spot as pickup_spot
      from public.hub_days dd
      left join public.hub_day_answers a on a.invite_id = p_invite and a.day_id = dd.id
      left join public.hub_pickups pk on pk.invite_id = p_invite and pk.day_id = dd.id
     where dd.event_id = v_event
     order by dd.day_date
  loop
    -- 0008: a family that drives for the team (drive_to / drive_home) is
    -- asked for its car offer and driver checks on that day, whatever its
    -- own student's answer.
    v_needs_car := coalesce(d.drive_to, false) or coalesce(d.drive_home, false);
    if d.attending is null then
      s_days := false;
      missing := missing || jsonb_build_object('step', 'days', 'key', 'attending', 'day_id', d.id);
    elsif d.attending = 'unsure' then
      unsure := unsure + 1;
    end if;

    if coalesce(d.attending, '') = 'yes' then
      coming := coming + 1;
      if d.confirmed_at is null then unconfirmed := unconfirmed + 1; end if;
      if d.adults is null then
        s_days := false;
        missing := missing || jsonb_build_object('step', 'days', 'key', 'adults', 'day_id', d.id);
      end if;
      if d.ask_pit_setup and d.pit_setup is null then
        s_days := false;
        missing := missing || jsonb_build_object('step', 'days', 'key', 'pit_setup', 'day_id', d.id);
      end if;

      v_eff_to := coalesce(d.to_mode, case when d.nb_before then 'self' else 'carpool' end);
      v_eff_home := coalesce(d.home_mode, case when d.nb_after then 'self' else 'carpool' end);
      if d.ask_school_ride and not d.nb_before and v_eff_to = 'carpool' then
        if d.school_mode is null then
          s_getting := false;
          missing := missing || jsonb_build_object('step', 'getting', 'key', 'school_mode', 'day_id', d.id);
        elsif d.school_mode = 'pickup' and d.pickup_spot is null then
          s_getting := false;
          missing := missing || jsonb_build_object('step', 'getting', 'key', 'pickup', 'day_id', d.id);
        end if;
      end if;
      v_needs_car := v_needs_car or 'driving' in (v_eff_to, v_eff_home);
    end if;

    if v_needs_car then
      if d.offer_seats is null or nullif(btrim(d.offer_description), '') is null
         or d.offer_leave_by is null or d.offer_takes_pickups is null then
        s_getting := false;
        missing := missing || jsonb_build_object('step', 'getting', 'key', 'car', 'day_id', d.id);
      end if;
      if not coalesce(r.driver_25, false) or not coalesce(r.driver_licensed, false) then
        s_getting := false;
        missing := missing || jsonb_build_object('step', 'getting', 'key', 'driver_checks', 'day_id', d.id);
      end if;
    end if;
  end loop;

  if not (coalesce(r.allergies_none, false)
          or cardinality(coalesce(r.allergens, '{}'::text[])) > 0
          or nullif(btrim(r.allergy_other), '') is not null) then
    s_food := false;
    missing := missing || jsonb_build_object('step', 'food', 'key', 'allergies');
  end if;
  if r.medication is null then
    s_food := false;
    missing := missing || jsonb_build_object('step', 'food', 'key', 'medication');
  end if;

  if nullif(btrim(r.parent_name), '') is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'parent_name');
  end if;
  if not public._hub_is_phone(r.parent_phone) then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'parent_phone');
  end if;
  if not public._hub_is_email(r.parent_email) then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'parent_email');
  end if;
  if nullif(btrim(r.emergency_name), '') is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'emergency_name');
  end if;
  if not public._hub_is_phone(r.emergency_phone) then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'emergency_phone');
  end if;
  if r.first_reg_done is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'first_reg');
  end if;
  if nullif(btrim(e.links ->> 'school_form'), '') is not null and r.school_form_done is null then
    s_contacts := false; missing := missing || jsonb_build_object('step', 'contacts', 'key', 'school_form');
  end if;

  return jsonb_build_object(
    'phase1_done', s_days and s_getting and s_food and s_contacts,
    'lockin_done', s_days and s_getting and s_food and s_contacts and unsure = 0 and unconfirmed = 0,
    'steps', jsonb_build_object('days', s_days, 'getting', s_getting, 'food', s_food, 'contacts', s_contacts),
    'missing', missing,
    'unsure_days', unsure,
    'unconfirmed_days', unconfirmed,
    'coming_days', coming);
end
$fn$;

-- 0005's _hub_save, with: adults 0..30; the day fields drive_to and
-- drive_home; the new car_required sentence; a car that has left blocks a
-- change of attending only when that change would remove it; and mentors
-- emailed when a save turns one of the family's own cars red.
create or replace function public._hub_save(p_invite uuid, p_staff uuid, p_field text, p_value jsonb, p_day uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_event uuid; d public.hub_days; a public.hub_day_answers;
  v_text text; v_bool boolean; v_dates date[]; v_list text[]; v_int int; v_ts timestamptz;
  v_old text; v_run text; s record; v_red uuid[];
begin
  select event_id into v_event from public.hub_invites where id = p_invite;
  if v_event is null then perform public._hub_refuse('not_found', 'That link is not valid.'); end if;
  if p_staff is null and now() >= public._hub_event_end(v_event) then
    perform public._hub_refuse('event_over', 'This event is over. Everything is read-only now.');
  end if;
  insert into public.hub_responses (invite_id) values (p_invite) on conflict (invite_id) do nothing;

  -- ── answers about the whole family ──
  if p_field in ('staying_nights', 'allergies_none', 'allergens', 'allergy_other', 'dietary', 'medication',
                 'parent_name', 'parent_phone', 'parent_email', 'emergency_name', 'emergency_phone',
                 'first_reg_done', 'school_form_done', 'driver_phone_consent', 'rider_phone_consent',
                 'driver_25', 'driver_licensed') then
    case p_field
      when 'staying_nights' then
        if p_value is null or jsonb_typeof(p_value) = 'null' then
          v_dates := null;
        elsif jsonb_typeof(p_value) <> 'array' then
          perform public._hub_refuse('invalid', 'That is not a list of nights.');
        else
          begin
            select coalesce(array_agg(distinct x::date order by x::date), '{}') into v_dates
              from jsonb_array_elements_text(p_value) x;
          exception when others then
            perform public._hub_refuse('invalid', 'That is not a list of nights.');
          end;
          if exists (select 1 from unnest(v_dates) n
                      where n not in (select dd.day_date from public.hub_days dd where dd.event_id = v_event)
                         or n >= (select max(dd.day_date) from public.hub_days dd where dd.event_id = v_event)) then
            perform public._hub_refuse('invalid', 'That night is not part of this event.');
          end if;
        end if;
        update public.hub_responses set staying_nights = v_dates where invite_id = p_invite;
      when 'allergies_none' then
        v_bool := public._hub_jbool(p_value);
        update public.hub_responses
           set allergies_none = v_bool,
               allergens = case when v_bool then '{}' else allergens end,
               allergy_other = case when v_bool then null else allergy_other end
         where invite_id = p_invite;
      when 'allergens' then
        if jsonb_typeof(coalesce(p_value, '[]'::jsonb)) <> 'array' then
          perform public._hub_refuse('invalid', 'That is not a list of allergens.');
        end if;
        select coalesce(array_agg(distinct x order by x), '{}') into v_list
          from jsonb_array_elements_text(coalesce(p_value, '[]'::jsonb)) x;
        if not (v_list <@ array['peanut','tree_nut','milk','egg','wheat','soy','fish','shellfish','sesame']::text[]) then
          perform public._hub_refuse('invalid', 'That allergen is not on the list. Use Other.');
        end if;
        update public.hub_responses
           set allergens = v_list,
               allergies_none = case when cardinality(v_list) > 0 then false else allergies_none end
         where invite_id = p_invite;
      when 'allergy_other' then
        v_text := public._hub_jlen(public._hub_jtext(p_value), 300);
        update public.hub_responses
           set allergy_other = v_text,
               allergies_none = case when v_text is not null then false else allergies_none end
         where invite_id = p_invite;
      when 'dietary' then
        update public.hub_responses set dietary = public._hub_jlen(public._hub_jtext(p_value), 300) where invite_id = p_invite;
      when 'medication' then
        update public.hub_responses set medication = public._hub_jbool(p_value) where invite_id = p_invite;
      when 'parent_name' then
        update public.hub_responses set parent_name = public._hub_jlen(public._hub_jtext(p_value), 120) where invite_id = p_invite;
      when 'parent_phone' then
        update public.hub_responses set parent_phone = public._hub_jlen(public._hub_jtext(p_value), 40) where invite_id = p_invite;
      when 'parent_email' then
        update public.hub_responses set parent_email = public._hub_jlen(lower(public._hub_jtext(p_value)), 200) where invite_id = p_invite;
      when 'emergency_name' then
        update public.hub_responses set emergency_name = public._hub_jlen(public._hub_jtext(p_value), 120) where invite_id = p_invite;
      when 'emergency_phone' then
        update public.hub_responses set emergency_phone = public._hub_jlen(public._hub_jtext(p_value), 40) where invite_id = p_invite;
      when 'first_reg_done' then
        update public.hub_responses set first_reg_done = public._hub_jbool(p_value) where invite_id = p_invite;
      when 'school_form_done' then
        update public.hub_responses set school_form_done = public._hub_jbool(p_value) where invite_id = p_invite;
      when 'driver_phone_consent' then
        v_bool := public._hub_jbool(p_value);
        update public.hub_responses
           set driver_phone_consent_at = case when v_bool then coalesce(driver_phone_consent_at, now()) end
         where invite_id = p_invite;
      when 'rider_phone_consent' then
        v_bool := public._hub_jbool(p_value);
        update public.hub_responses
           set rider_phone_consent_at = case when v_bool then coalesce(rider_phone_consent_at, now()) end
         where invite_id = p_invite;
      when 'driver_25', 'driver_licensed' then
        v_bool := public._hub_jbool(p_value);
        if p_field = 'driver_25' then
          update public.hub_responses set driver_25 = v_bool where invite_id = p_invite;
        else
          update public.hub_responses set driver_licensed = v_bool where invite_id = p_invite;
        end if;
        for s in select id from public.hub_days where event_id = v_event loop
          perform public._hub_sync_cars(p_invite, s.id);
        end loop;
    end case;
    update public.hub_responses
       set updated_at = now(), staff_updated_by = coalesce(p_staff, staff_updated_by)
     where invite_id = p_invite;
    return;
  end if;

  -- ── answers about one day ──
  if p_field is null or p_field not in ('attending', 'adults', 'pit_setup', 'home_option', 'school_mode', 'pickup',
                                         'to_mode', 'home_mode', 'car_seats', 'car_description', 'car_leave_by',
                                         'car_takes_pickups', 'drive_to', 'drive_home') then
    perform public._hub_refuse('unknown_field', 'That answer is not part of this form.');
  end if;
  select * into d from public.hub_days where id = p_day and event_id = v_event;
  if d.id is null then
    perform public._hub_refuse('bad_day', 'That day is not part of this event.');
  end if;
  if p_staff is null and now() >= d.venue_closes_at then
    perform public._hub_refuse('day_over', 'That day is over. Its answers are read-only now.');
  end if;
  insert into public.hub_day_answers (invite_id, day_id) values (p_invite, p_day)
  on conflict (invite_id, day_id) do nothing;
  select * into a from public.hub_day_answers where invite_id = p_invite and day_id = p_day;
  -- 0008: which of the family's own cars are red before this save (a car
  -- without the family's own student can turn red when that student leaves).
  v_red := array(select c.id from public.hub_cars c
                  where c.driver_invite_id = p_invite and c.day_id = p_day
                    and public._hub_car_problem(c.id) is not null);

  case p_field
    when 'attending' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and v_text not in ('yes', 'no', 'unsure') then
        perform public._hub_refuse('invalid', 'Choose Coming, Not coming or Not sure yet.');
      end if;
      if v_text is distinct from 'yes' then
        if exists (select 1 from public.hub_seats st join public.hub_cars c on c.id = st.car_id
                    where st.invite_id = p_invite and st.day_id = p_day and c.left_at is not null)
           or exists (select 1 from public.hub_cars c where c.driver_invite_id = p_invite and c.day_id = p_day and c.left_at is not null
                        -- 0008: a car its drive flag keeps is not removed by this change
                        and not coalesce(case c.run when 'to' then a.drive_to else a.drive_home end, false)) then
          perform public._hub_refuse('car_left', 'A car for this day already left. Ask a mentor.');
        end if;
        for s in select car_id from public.hub_seats where invite_id = p_invite and day_id = p_day loop
          perform public._hub_drop_seat(s.car_id, p_invite, 'rider');
        end loop;
        perform public._hub_withdraw_pickup(p_invite, p_day);
      end if;
      update public.hub_day_answers
         set attending = v_text,
             confirmed_at = case when v_text = 'yes' and a.attending = 'yes' then confirmed_at end
       where invite_id = p_invite and day_id = p_day;
      perform public._hub_sync_cars(p_invite, p_day);
    when 'adults' then
      if p_value is null or jsonb_typeof(p_value) = 'null' then
        v_int := null;
      elsif jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
            or (p_value #>> '{}')::numeric not between 0 and 30 then
        perform public._hub_refuse('invalid', 'Choose 0 to 30 adults.');
      else
        v_int := (p_value #>> '{}')::int;
      end if;
      update public.hub_day_answers set adults = v_int where invite_id = p_invite and day_id = p_day;
    when 'pit_setup' then
      update public.hub_day_answers set pit_setup = public._hub_jbool(p_value) where invite_id = p_invite and day_id = p_day;
    when 'home_option' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and not exists (select 1 from jsonb_array_elements(d.home_options) o where o ->> 'key' = v_text) then
        perform public._hub_refuse('invalid', 'That ride-home choice is not offered.');
      end if;
      update public.hub_day_answers set home_option = v_text where invite_id = p_invite and day_id = p_day;
    when 'school_mode' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and v_text not in ('self', 'pickup') then
        perform public._hub_refuse('invalid', 'Choose how your student gets to Bosco Tech.');
      end if;
      if v_text is distinct from 'pickup' then
        perform public._hub_withdraw_pickup(p_invite, p_day);
      end if;
      update public.hub_day_answers set school_mode = v_text where invite_id = p_invite and day_id = p_day;
    when 'pickup' then
      -- { spot, consent, covers_home }: stored ONLY with consent. Without it,
      -- or with no spot, any stored request is withdrawn.
      if p_value is null or jsonb_typeof(p_value) <> 'object' then
        perform public._hub_refuse('invalid', 'That pickup request is incomplete.');
      end if;
      v_text := public._hub_jlen(public._hub_jtext(p_value -> 'spot'), 160);
      v_bool := coalesce(public._hub_jbool(p_value -> 'consent'), false);
      if v_text is null or not v_bool then
        perform public._hub_withdraw_pickup(p_invite, p_day);
      else
        if exists (select 1 from public.hub_pickups pk join public.hub_cars c on c.id = pk.car_id
                    where pk.invite_id = p_invite and pk.day_id = p_day and c.left_at is not null) then
          perform public._hub_refuse('car_left', 'That car already left.');
        end if;
        insert into public.hub_pickups (invite_id, day_id, spot, consent_at, covers_home)
        values (p_invite, p_day, v_text, now(), coalesce(public._hub_jbool(p_value -> 'covers_home'), true))
        on conflict (invite_id, day_id) do update
          set spot = excluded.spot,
              consent_at = coalesce(public.hub_pickups.consent_at, excluded.consent_at),
              covers_home = excluded.covers_home,
              updated_at = now();
        update public.hub_day_answers set school_mode = 'pickup' where invite_id = p_invite and day_id = p_day;
        -- No longer covering the ride home: the home leg is a plain seat.
        if not coalesce(public._hub_jbool(p_value -> 'covers_home'), true) then
          for s in select car_id from public.hub_seats
                    where invite_id = p_invite and day_id = p_day and run = 'home' and via_pickup loop
            update public.hub_seats set via_pickup = false where car_id = s.car_id and invite_id = p_invite;
            perform public._hub_alert_if_red(s.car_id);
          end loop;
        end if;
      end if;
    when 'to_mode', 'home_mode' then
      v_text := public._hub_jtext(p_value);
      if v_text is not null and v_text not in ('carpool', 'driving', 'self') then
        perform public._hub_refuse('invalid', 'Choose how your student travels.');
      end if;
      v_run := case p_field when 'to_mode' then 'to' else 'home' end;
      v_old := case p_field when 'to_mode' then a.to_mode else a.home_mode end;
      if exists (select 1 from public.hub_seats st join public.hub_cars c on c.id = st.car_id
                  where st.invite_id = p_invite and st.day_id = p_day and st.run = v_run and c.left_at is not null)
         or exists (select 1 from public.hub_cars c where c.driver_invite_id = p_invite and c.day_id = p_day
                     and c.run = v_run and c.left_at is not null) then
        perform public._hub_refuse('car_left', 'That car already left.');
      end if;
      if coalesce(v_text, 'carpool') <> 'carpool' then
        for s in select car_id from public.hub_seats where invite_id = p_invite and day_id = p_day and run = v_run loop
          perform public._hub_drop_seat(s.car_id, p_invite, 'rider');
        end loop;
      end if;
      if p_field = 'to_mode' then
        update public.hub_day_answers set to_mode = v_text where invite_id = p_invite and day_id = p_day;
        if v_text = 'driving' and a.home_mode is null
           and not coalesce(d.day_date = any((select r.staying_nights from public.hub_responses r where r.invite_id = p_invite)::date[]), false) then
          -- "I am driving" there means driving home too, unless changed.
          update public.hub_day_answers set home_mode = 'driving' where invite_id = p_invite and day_id = p_day;
          for s in select car_id from public.hub_seats where invite_id = p_invite and day_id = p_day and run = 'home' loop
            perform public._hub_drop_seat(s.car_id, p_invite, 'rider');
          end loop;
        end if;
      else
        update public.hub_day_answers set home_mode = v_text where invite_id = p_invite and day_id = p_day;
      end if;
      perform public._hub_sync_cars(p_invite, p_day);
    when 'car_seats', 'car_description', 'car_leave_by', 'car_takes_pickups' then
      if p_value is null or jsonb_typeof(p_value) = 'null'
         or (p_field = 'car_description' and public._hub_jtext(p_value) is null) then
        if exists (select 1 from public.hub_cars where driver_invite_id = p_invite and day_id = p_day) then
          perform public._hub_refuse('car_required',
            'Keep this filled in while you are driving. To stop driving, change your answer to "Will a parent drive?"');
        end if;
      end if;
      case p_field
        when 'car_seats' then
          if p_value is not null and jsonb_typeof(p_value) <> 'null'
             and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not in (1, 2, 3, 4, 5, 6, 7)) then
            perform public._hub_refuse('invalid', 'Choose 1 to 7 seats.');
          end if;
          update public.hub_day_answers set offer_seats = (p_value #>> '{}')::smallint
           where invite_id = p_invite and day_id = p_day;
        when 'car_description' then
          update public.hub_day_answers set offer_description = public._hub_jlen(public._hub_jtext(p_value), 80)
           where invite_id = p_invite and day_id = p_day;
        when 'car_leave_by' then
          begin
            v_ts := public._hub_jtext(p_value)::timestamptz;
          exception when others then
            perform public._hub_refuse('invalid', 'That is not a time.');
          end;
          update public.hub_day_answers set offer_leave_by = v_ts where invite_id = p_invite and day_id = p_day;
        when 'car_takes_pickups' then
          update public.hub_day_answers set offer_takes_pickups = public._hub_jbool(p_value)
           where invite_id = p_invite and day_id = p_day;
      end case;
      perform public._hub_sync_cars(p_invite, p_day);
    when 'drive_to', 'drive_home' then
      -- 0008: a parent drives a car for the team on this run whether or not
      -- their own student rides in it. The car follows (_hub_sync_cars).
      v_bool := public._hub_jbool(p_value);
      if p_field = 'drive_to' then
        update public.hub_day_answers set drive_to = v_bool where invite_id = p_invite and day_id = p_day;
      else
        update public.hub_day_answers set drive_home = v_bool where invite_id = p_invite and day_id = p_day;
      end if;
      perform public._hub_sync_cars(p_invite, p_day);
    else
      perform public._hub_refuse('unknown_field', 'That answer is not part of this form.');
  end case;

  -- 0008: one of the family's own cars turned red on this save; mentors are
  -- told, as when a rider leaves.
  for s in select c.id from public.hub_cars c
            where c.driver_invite_id = p_invite and c.day_id = p_day and not (c.id = any(v_red))
              and public._hub_car_problem(c.id) is not null loop
    perform public._hub_alert_if_red(s.id);
  end loop;

  update public.hub_day_answers set updated_at = now() where invite_id = p_invite and day_id = p_day;
  update public.hub_responses set updated_at = now(), staff_updated_by = coalesce(p_staff, staff_updated_by)
   where invite_id = p_invite;
end
$fn$;

-- 0005's _hub_family_view, with drive_to and drive_home on each day.
create or replace function public._hub_family_view(p_invite uuid, p_viewer text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare i public.hub_invites; r public.hub_responses; v_days jsonb; v_food jsonb; v_name text;
begin
  select * into i from public.hub_invites where id = p_invite;
  select * into r from public.hub_responses where invite_id = p_invite;
  v_name := public._hub_student_name(i.student_id);

  select coalesce(jsonb_object_agg(p.day_id, jsonb_build_object(
           'attending', a.attending, 'adults', a.adults, 'pit_setup', a.pit_setup,
           'home_option', a.home_option, 'school_mode', a.school_mode,
           'to_mode', a.to_mode, 'home_mode', a.home_mode,
           'eff_to', p.eff_to, 'eff_home', p.eff_home,
           'nearby_before', p.nearby_before, 'nearby_after', p.nearby_after,
           'car_seats', a.offer_seats, 'car_description', a.offer_description,
           'car_leave_by', a.offer_leave_by, 'car_takes_pickups', a.offer_takes_pickups,
           'drive_to', a.drive_to, 'drive_home', a.drive_home,
           'confirmed', a.confirmed_at is not null,
           'pickup', case when pk.id is null then null else jsonb_build_object(
               'spot', pk.spot, 'covers_home', pk.covers_home, 'accepted', pk.car_id is not null,
               'driver', case when pk.car_id is not null then public._hub_driver_name(pk.car_id) end) end)),
         '{}'::jsonb)
    into v_days
    from public._hub_plan(i.event_id) p
    left join public.hub_day_answers a on a.invite_id = p.invite_id and a.day_id = p.day_id
    left join public.hub_pickups pk on pk.invite_id = p.invite_id and pk.day_id = p.day_id
   where p.invite_id = p_invite;

  select coalesce(jsonb_agg(jsonb_build_object('id', fc.id, 'meal_id', fc.meal_id, 'need_id', fc.need_id,
                                               'what', fc.what, 'serves', fc.serves, 'allergen', fc.allergen)
                            order by fc.created_at), '[]'::jsonb)
    into v_food
    from public.hub_food_claims fc where fc.invite_id = p_invite;

  return jsonb_build_object(
    'invite_id', p_invite,
    'viewer', p_viewer,
    'now', now(),
    'student', jsonb_build_object('name', v_name, 'first', split_part(v_name, ' ', 1)),
    'event', public._hub_event_json(i.event_id),
    'progress', public._hub_progress(p_invite),
    'answers', jsonb_build_object(
      'response', jsonb_build_object(
        'staying_nights', r.staying_nights,
        'allergies_none', r.allergies_none, 'allergens', coalesce(r.allergens, '{}'::text[]),
        'allergy_other', r.allergy_other, 'dietary', r.dietary, 'medication', r.medication,
        'parent_name', r.parent_name, 'parent_phone', r.parent_phone, 'parent_email', r.parent_email,
        'emergency_name', r.emergency_name, 'emergency_phone', r.emergency_phone,
        'first_reg_done', r.first_reg_done, 'school_form_done', r.school_form_done,
        'driver_phone_consent', r.driver_phone_consent_at is not null,
        'rider_phone_consent', r.rider_phone_consent_at is not null,
        'driver_25', r.driver_25, 'driver_licensed', r.driver_licensed,
        'driver_paperwork_on_file', r.driver_paperwork_at is not null),
      'days', v_days,
      'food', v_food),
    'board', public._hub_board(i.event_id, p_viewer, case when p_viewer = 'family' then p_invite end));
end
$fn$;

-- 0005's _hub_overview: the driver list (paperwork) includes flag drivers.
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
   where p.approved and p.status = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'));

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

-- ── 3. Mail: one row, and one link, per person ──────────────────────────────

-- 0005's _hub_mint_token, recording whose link it is.
create or replace function public._hub_mint_token_for(p_invite uuid, p_email text)
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare v text;
begin
  v := rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
  insert into public.hub_invite_tokens (token_hash, invite_id, email)
  values (sha256(convert_to(v, 'UTF8')), p_invite, nullif(lower(btrim(coalesce(p_email, ''))), ''));
  return v;
end
$fn$;

-- One outbox row per recipient when an email carries a link to more than one
-- person, so each person's link is their own (and can be revoked on its
-- own). Without a link, or for one person, one row exactly as 0005 wrote it.
create or replace function public._hub_enqueue(p_event uuid, p_kind text, p_to text[], p_subject text,
                                               p_body text, p_link_invite uuid default null,
                                               p_dedupe text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_to text[]; v_r text;
begin
  if p_to is null or cardinality(p_to) = 0 then return; end if;
  if p_link_invite is not null then
    select array_agg(q.x order by q.o) into v_to
      from (select u.x, min(u.o) as o from unnest(p_to) with ordinality u(x, o)
             where u.x is not null group by u.x) q;
  end if;

  if p_link_invite is null or coalesce(cardinality(v_to), 0) <= 1 then
    -- The one person left was already sent this email under their own key,
    -- while the family had more than one address: not again.
    if p_dedupe is not null and cardinality(v_to) = 1
       and exists (select 1 from public.hub_outbox o where o.dedupe_key = p_dedupe || ':' || v_to[1]) then
      return;
    end if;
    insert into public.hub_outbox (event_id, kind, to_emails, subject, body, link_invite_id, dedupe_key)
    values (p_event, p_kind, p_to, p_subject, p_body, p_link_invite, p_dedupe)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    return;
  end if;

  foreach v_r in array v_to loop
    -- Already sent this email under the single key 0005 used (one row to the
    -- whole family): not again.
    continue when p_dedupe is not null and exists (
      select 1 from public.hub_outbox o where o.dedupe_key = p_dedupe and v_r = any(o.to_emails));
    insert into public.hub_outbox (event_id, kind, to_emails, subject, body, link_invite_id, dedupe_key)
    values (p_event, p_kind, array[v_r], p_subject, p_body, p_link_invite,
            case when p_dedupe is not null then p_dedupe || ':' || v_r end)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;
end
$fn$;

-- The link for one email, minted at send time; the token records its one
-- recipient. Null when the email carries no link.
create or replace function public.hub_outbox_mint_link(p_outbox uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $fn$
declare o public.hub_outbox;
begin
  select * into o from public.hub_outbox where id = p_outbox and status = 'sending';
  if o.link_invite_id is null then return null; end if;
  if (select count(distinct x) from unnest(o.to_emails) x) = 1 then
    return public._hub_mint_token_for(o.link_invite_id, o.to_emails[1]);
  end if;
  return public._hub_mint_token(o.link_invite_id);
end
$fn$;

-- Has this family been given its link? Every email that hands one over
-- counts, however the family came in.
create or replace function public._hub_invite_status(p_invite uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select case
           when bool_or(o.status = 'sent') then 'sent'
           when bool_or(o.status in ('pending', 'sending')) then 'pending'
           when bool_or(o.status = 'failed') then 'failed'
           else 'none'
         end
    from public.hub_outbox o
   where o.link_invite_id = p_invite
     and o.kind in ('invite', 'welcome', 'added', 'join_request', 'resend', 'lockin_open')
$fn$;

-- ── 4. Guardians ────────────────────────────────────────────────────────────

-- What the family page adds to every view: who is reading (the email on the
-- link it was opened with, or null) and the family's parents and guardians.
create or replace function public._hub_family_extras(p_invite uuid, p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce((
    select jsonb_build_object(
      'me', (select t.email from public.hub_invite_tokens t
              where t.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8')) and t.invite_id = i.id),
      'guardians', coalesce((
        select jsonb_agg(jsonb_build_object('email', u.x, 'name', i.guardian_names ->> u.x) order by u.o)
          from unnest(i.emails) with ordinality u(x, o)), '[]'::jsonb))
      from public.hub_invites i where i.id = p_invite), '{}'::jsonb)
$fn$;

-- 0005's hub_family_call: every page it returns carries 'me' and 'guardians'.
create or replace function public.hub_family_call(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_invite uuid; v jsonb; a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  v_invite := public._hub_invite_for_token(p_token);
  if v_invite is null then
    raise exception using errcode = 'P0002', message = 'hub:not_found', detail = 'That link is not valid.';
  end if;
  case p_action
    when 'fetch' then
      return public._hub_family_view(v_invite, 'family') || public._hub_family_extras(v_invite, p_token);
    when 'save' then
      perform public._hub_save(v_invite, null, a ->> 'field', a -> 'value', public._hub_uuid(a ->> 'day_id'));
      return jsonb_build_object('ok', true, 'saved_at', now(), 'progress', public._hub_progress(v_invite));
    when 'claim_seat' then
      v := public._hub_claim_with_home(public._hub_uuid(a ->> 'car_id'), v_invite, null);
    when 'unclaim_seat' then
      perform public._hub_unclaim(public._hub_uuid(a ->> 'car_id'), v_invite, null);
    when 'mark' then
      perform public._hub_mark(public._hub_uuid(a ->> 'car_id'), a ->> 'what', v_invite, null);
    when 'pickup_accept' then
      v := public._hub_pickup_accept(public._hub_uuid(a ->> 'pickup_id'), public._hub_uuid(a ->> 'car_id'), v_invite, null);
    when 'food_claim' then
      perform public._hub_food_claim(public._hub_uuid(a ->> 'meal_id'), public._hub_uuid(a ->> 'need_id'), v_invite, null, null,
                                     a ->> 'what', public._hub_int(a ->> 'serves'), a ->> 'allergen');
    when 'food_edit' then
      perform public._hub_food_change(public._hub_uuid(a ->> 'claim_id'), v_invite, null, false,
                                      a ->> 'what', public._hub_int(a ->> 'serves'), a ->> 'allergen');
    when 'food_drop' then
      perform public._hub_food_change(public._hub_uuid(a ->> 'claim_id'), v_invite, null, true);
    when 'confirm_day' then
      perform public._hub_confirm_day(v_invite, public._hub_uuid(a ->> 'day_id'), null);
    else
      perform public._hub_refuse('unknown_action', 'That action is not part of this page.');
  end case;
  return public._hub_family_view(v_invite, 'family') || public._hub_family_extras(v_invite, p_token)
         || jsonb_build_object('result', v);
end
$fn$;

-- 0007's hub_join: going straight in mints a link for the joining parent's
-- email and records their name.
create or replace function public.hub_join(p_event uuid, p_student uuid, p_name text, p_email text,
                                           p_guardian boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_ev uuid := public._hub_join_event(p_event);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_invite uuid; v_title text; v_student text; v_to text[];
begin
  if v_ev is null then
    perform public._hub_refuse('not_open', 'This sign-up is closed or the link is not right. Ask the team for the current link.');
  end if;
  if p_guardian is distinct from true then
    perform public._hub_refuse('guardian', 'Only a parent or guardian can fill this out. Please tick the box to confirm.');
  end if;
  if length(v_name) = 0 or length(v_name) > 120 then
    perform public._hub_refuse('name', 'Please enter your name.');
  end if;
  if not public._hub_is_email(v_email) or length(v_email) > 200 then
    perform public._hub_refuse('email', 'Please enter a working email address.');
  end if;
  if p_student is null or not public._hub_join_eligible(p_student) then
    perform public._hub_refuse('student', 'Pick your student from the list. Only students who filled out this season''s team application are listed.');
  end if;

  select title into v_title from public.hub_events where id = v_ev;
  v_student := public._hub_student_name(p_student);
  select id, emails into v_invite, v_to from public.hub_invites where event_id = v_ev and student_id = p_student;

  if public._hub_join_taken(v_invite) then
    if cardinality(v_to) = 0 then
      return jsonb_build_object('status', 'ask_mentor', 'student', v_student);
    end if;
    -- At most one of these an hour per (family, asker).
    perform public._hub_enqueue(v_ev, 'join_request', v_to,
      format('Your %s page for %s', v_title, split_part(v_student, ' ', 1)),
      format(E'%s (%s) opened the team''s sign-up for %s and asked for your family''s page. Here is the link:\n{{link}}\n\nIf they are family, send them this link, or add them on the page under "Add another parent or guardian". If you do not know them, you can ignore this email.',
             v_name, v_email, v_student) || public._hub_sign(),
      v_invite, 'join:' || v_invite || ':' || v_email || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24'));
    return jsonb_build_object('status', 'emailed', 'student', v_student,
      'to', (select jsonb_agg(public._hub_mask_email(x)) from unnest(v_to) x));
  end if;

  -- Nobody has started: straight in. The contact on file becomes the person
  -- filling it in (any phone copied from the application is cleared, so a
  -- first visitor never sees one).
  insert into public.hub_invites (event_id, student_id, emails)
  values (v_ev, p_student, array[v_email])
  on conflict (event_id, student_id) do nothing;
  select id into v_invite from public.hub_invites where event_id = v_ev and student_id = p_student;
  update public.hub_invites
     set emails = (select array_agg(distinct x) from unnest(emails || array[v_email]) x)
   where id = v_invite and not (v_email = any(emails));
  insert into public.hub_responses (invite_id, parent_name, parent_email)
  values (v_invite, v_name, v_email)
  on conflict (invite_id) do update
    set parent_name = excluded.parent_name, parent_email = excluded.parent_email, parent_phone = null;
  update public.hub_invites set guardian_names = guardian_names || jsonb_build_object(v_email, v_name)
   where id = v_invite;

  perform public._hub_enqueue(v_ev, 'welcome', array[v_email],
    format('Your %s page for %s', v_title, split_part(v_student, ' ', 1)),
    format(E'Thank you for signing up %s for %s.\n\nThis is your family''s page. Save it: you will come back before the event to confirm the carpool and food, and you can change your answers any time:\n{{link}}' || public._hub_sign(),
           v_student, v_title),
    v_invite, 'welcome:' || v_invite || ':' || v_email);

  return jsonb_build_object('status', 'in', 'token', public._hub_mint_token_for(v_invite, v_email), 'student', v_student);
end
$fn$;

-- 0007's hub_add_parent, taking the new parent's name.
drop function if exists public.hub_add_parent(text, text);

create or replace function public.hub_add_parent(p_token text, p_email text, p_name text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_invite uuid := public._hub_invite_for_token(p_token);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  i public.hub_invites; v_title text;
begin
  if v_invite is null then
    raise exception using errcode = 'P0002', message = 'hub:not_found', detail = 'That link is not valid.';
  end if;
  select * into i from public.hub_invites where id = v_invite;
  if now() >= public._hub_event_end(i.event_id) then
    perform public._hub_refuse('event_over', 'This event is over.');
  end if;
  if not public._hub_is_email(v_email) or length(v_email) > 200 then
    perform public._hub_refuse('email', 'Please enter a working email address.');
  end if;
  if length(v_name) > 120 then
    perform public._hub_refuse('name', 'Please keep the name to 120 characters or fewer.');
  end if;
  if not (v_email = any(i.emails)) then
    if cardinality(i.emails) >= 6 then
      perform public._hub_refuse('too_many', 'This family already has six emails. Ask a mentor to change them.');
    end if;
    update public.hub_invites set emails = emails || array[v_email] where id = v_invite;
  end if;
  if v_name is not null then
    update public.hub_invites set guardian_names = guardian_names || jsonb_build_object(v_email, v_name)
     where id = v_invite;
  end if;
  select title into v_title from public.hub_events where id = i.event_id;
  perform public._hub_enqueue(i.event_id, 'added', array[v_email],
    format('Your %s page for %s', v_title, split_part(public._hub_student_name(i.student_id), ' ', 1)),
    format(E'You were added to %s''s family page for %s. Here is your link. Save it: you will come back before the event to confirm the carpool and food.\n{{link}}',
           public._hub_student_name(i.student_id), v_title) || public._hub_sign(),
    v_invite, 'added:' || v_invite || ':' || v_email);
  return jsonb_build_object('ok', true, 'emails', (select to_jsonb(emails) from public.hub_invites where id = v_invite));
end
$fn$;

-- Take one person off a family. p_staff null = the family (it may not remove
-- its last address, and not after the event); a staff id = a mentor.
create or replace function public._hub_remove_guardian(p_invite uuid, p_email text, p_staff uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare i public.hub_invites; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select * into i from public.hub_invites where id = p_invite for update;
  if not found then
    perform public._hub_refuse('family_gone', 'That family is no longer on this trip.');
  end if;
  if p_staff is null and now() >= public._hub_event_end(i.event_id) then
    perform public._hub_refuse('event_over', 'This event is over.');
  end if;
  if not (v_email = any(i.emails)) then
    perform public._hub_refuse('not_on_family', 'That email is not on this family.');
  end if;
  if p_staff is null and cardinality(i.emails) = 1 then
    perform public._hub_refuse('last_guardian',
      'You are the only parent or guardian on this family. To take your family off the trip, use "Remove our family".');
  end if;

  update public.hub_invites
     set emails = array_remove(emails, v_email), guardian_names = guardian_names - v_email
   where id = p_invite;
  -- Their links, and only theirs.
  update public.hub_invite_tokens set revoked_at = now()
   where invite_id = p_invite and email = v_email and revoked_at is null;
  -- Mail to them that has not gone out would mint them a fresh link.
  update public.hub_outbox set status = 'skipped', last_error = 'guardian removed'
   where link_invite_id = p_invite and status in ('pending', 'failed') and to_emails = array[v_email];
  update public.hub_outbox set to_emails = array_remove(to_emails, v_email)
   where link_invite_id = p_invite and status in ('pending', 'failed')
     and v_email = any(to_emails) and cardinality(to_emails) > 1;
  -- "Lost your link?" matches the family's contact email as well as its
  -- addresses, so theirs stops being the family's contact.
  update public.hub_responses
     set parent_email = null, updated_at = now(), staff_updated_by = coalesce(p_staff, staff_updated_by)
   where invite_id = p_invite and lower(btrim(parent_email)) = v_email;
end
$fn$;

-- From the family page. self = the caller removed their own address (their
-- link has just stopped working).
create or replace function public.hub_remove_guardian(p_token text, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_invite uuid := public._hub_invite_for_token(p_token);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_me text;
begin
  if v_invite is null then
    raise exception using errcode = 'P0002', message = 'hub:not_found', detail = 'That link is not valid.';
  end if;
  select t.email into v_me from public.hub_invite_tokens t
   where t.token_hash = sha256(convert_to(p_token, 'UTF8')) and t.invite_id = v_invite;
  perform public._hub_remove_guardian(v_invite, v_email, null);
  return jsonb_build_object('ok', true, 'self', coalesce(v_me = v_email, false));
end
$fn$;

-- From the mentor page: may remove the last address.
create or replace function public.hub_staff_remove_guardian(p_invite uuid, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
begin
  if not public.is_staff() then
    perform public._hub_refuse('not_allowed', 'Staff only.');
  end if;
  perform public._hub_remove_guardian(p_invite, p_email, auth.uid());
  return jsonb_build_object('ok', true, 'self', false,
                            'emails', (select to_jsonb(emails) from public.hub_invites where id = p_invite));
end
$fn$;

-- ── 5. Removing a family from the trip ──────────────────────────────────────

-- p_staff null = the family itself (refused after the event, and once a car
-- it is in has left); a staff id = a mentor. Every seat and car goes through
-- the same rule functions as any other change, so everyone affected is told.
create or replace function public._hub_remove_family(p_invite uuid, p_staff uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare i public.hub_invites; e public.hub_events; v_student text; s record; c record;
begin
  select * into i from public.hub_invites where id = p_invite for update;
  if not found then
    perform public._hub_refuse('family_gone', 'That family is no longer on this trip.');
  end if;
  select * into e from public.hub_events where id = i.event_id;
  v_student := public._hub_student_name(i.student_id);

  if p_staff is null then
    if now() >= public._hub_event_end(e.id) then
      perform public._hub_refuse('event_over', 'This event is over.');
    end if;
    if exists (select 1 from public.hub_seats st join public.hub_cars ca on ca.id = st.car_id
                where st.invite_id = p_invite and ca.left_at is not null)
       or exists (select 1 from public.hub_cars ca where ca.driver_invite_id = p_invite and ca.left_at is not null) then
      perform public._hub_refuse('car_left', 'A car with your family in it has already left. Ask a mentor.');
    end if;
  end if;

  -- Its seats in other cars: the driver and mentors are told, as when any
  -- rider leaves.
  for s in select st.car_id from public.hub_seats st where st.invite_id = p_invite loop
    perform public._hub_drop_seat(s.car_id, p_invite, 'rider');
  end loop;

  -- The cars it drives: each rider is dropped and their family told why.
  for c in select ca.id from public.hub_cars ca where ca.driver_invite_id = p_invite for update loop
    perform set_config('hub.withdrawing_car', c.id::text, true);
    for s in select st.invite_id from public.hub_seats st where st.car_id = c.id loop
      perform public._hub_drop_seat(c.id, s.invite_id, 'driver', 'The driver''s family left the trip.');
    end loop;
    perform set_config('hub.withdrawing_car', '', true);
    update public.hub_pickups set car_id = null, accepted_at = null, updated_at = now() where car_id = c.id;
    delete from public.hub_cars where id = c.id;
  end loop;

  -- Its pickup requests.
  for s in select d.id from public.hub_days d where d.event_id = e.id loop
    perform public._hub_withdraw_pickup(p_invite, s.id);
  end loop;

  -- Food it would bring to meals that have not started: a claimed need
  -- reopens and mentors are told.
  for s in select fc.id from public.hub_food_claims fc join public.hub_meals m on m.id = fc.meal_id
            where fc.invite_id = p_invite and now() < m.starts_at loop
    perform public._hub_food_change(s.id, p_invite, p_staff, true);
  end loop;

  perform public._hub_enqueue(e.id, 'family_removed', public._hub_mentor_emails(e.id),
    format('%s''s family was removed from %s', v_student, e.title),
    format(E'%s''s family was removed from %s by %s.\nTheir seats, cars, pickup requests and food were released, and anyone affected has been emailed.',
           v_student, e.title,
           case when p_staff is null then 'the family, from its own page'
                else 'a mentor (' || coalesce(public._hub_student_name(p_staff), 'unknown') || ')' end));

  -- The invite, and with it its links, answers, contact details, anything
  -- left of the above, and every email that carries its link.
  delete from public.hub_invites where id = p_invite;
  return jsonb_build_object('ok', true, 'student', v_student);
end
$fn$;

-- From the family page: "Remove our family".
create or replace function public.hub_remove_family(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare v_invite uuid := public._hub_invite_for_token(p_token);
begin
  if v_invite is null then
    raise exception using errcode = 'P0002', message = 'hub:not_found', detail = 'That link is not valid.';
  end if;
  return public._hub_remove_family(v_invite, null);
end
$fn$;

-- From the mentor page.
create or replace function public.hub_staff_remove_family(p_invite uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
begin
  if not public.is_staff() then
    perform public._hub_refuse('not_allowed', 'Staff only.');
  end if;
  return public._hub_remove_family(p_invite, auth.uid());
end
$fn$;

-- ── 6. Mentors seat two at once ─────────────────────────────────────────────

-- Two students into an empty car, so a car without its driver's own student
-- is never left holding one. The first seat goes in under a temporary
-- override ("pair placement"), the second claim lifts the car to two, and the
-- override is cleared, so the car turns red again the moment one of the two
-- leaves. (_hub_claim already clears the car's override when the second seat
-- needs none; the explicit clear below is the contract, stated where it is
-- relied on.) Any refusal from either claim aborts the call: nobody is seated
-- and a student moved out of another car is back in it.
create or replace function public.hub_staff_place_pair(p_car uuid, p_first uuid, p_second uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare c public.hub_cars;
begin
  if not public.is_staff() then
    perform public._hub_refuse('not_allowed', 'Staff only.');
  end if;
  if p_first is null or p_second is null or p_first = p_second then
    perform public._hub_refuse('invalid', 'Pick two different students.');
  end if;
  select * into c from public.hub_cars where id = p_car for update;
  if exists (select 1 from public.hub_seats s where s.car_id = p_car) then
    perform public._hub_refuse('invalid', 'This is for a car with nobody in it yet.');
  end if;
  perform public._hub_claim(p_car, p_first, auth.uid(), 'pair placement');
  perform public._hub_claim(p_car, p_second, auth.uid(), null);
  update public.hub_cars
     set minor_override_reason = null, minor_override_by = null, minor_override_at = null, updated_at = now()
   where id = p_car;
  return jsonb_build_object('ok', true, 'riders', 2);
end
$fn$;

-- ── 7. Function grants ──────────────────────────────────────────────────────
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon, authenticated and service_role directly, so each new one is revoked
-- BY NAME and granted back to exactly who calls it. The internal helpers are
-- revoked from service_role too, as 0005 does: they run only inside the
-- SECURITY DEFINER entry points. The functions this file redefines keep the
-- grants 0005 and 0007 gave them (create or replace keeps a function's ACL).
--   anon, authenticated, service_role   hub_add_parent, hub_remove_guardian,
--                                       hub_remove_family (the family page,
--                                       PostgREST /rpc with the anon key)
--   authenticated                       hub_staff_remove_guardian,
--                                       hub_staff_remove_family,
--                                       hub_staff_place_pair (each checks
--                                       is_staff() inside)
--   nobody                              _hub_mint_token_for, _hub_family_extras,
--                                       _hub_remove_guardian, _hub_remove_family
revoke all on function public._hub_mint_token_for(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public._hub_family_extras(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public._hub_remove_guardian(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public._hub_remove_family(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.hub_add_parent(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.hub_remove_guardian(text, text) from public, anon, authenticated, service_role;
revoke all on function public.hub_remove_family(text) from public, anon, authenticated, service_role;
revoke all on function public.hub_staff_remove_guardian(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.hub_staff_remove_family(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hub_staff_place_pair(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.hub_add_parent(text, text, text) to anon, authenticated, service_role;
grant execute on function public.hub_remove_guardian(text, text) to anon, authenticated, service_role;
grant execute on function public.hub_remove_family(text) to anon, authenticated, service_role;
grant execute on function public.hub_staff_remove_guardian(uuid, text) to authenticated;
grant execute on function public.hub_staff_remove_family(uuid) to authenticated;
grant execute on function public.hub_staff_place_pair(uuid, uuid, uuid) to authenticated;

-- PostgREST reads function signatures from its schema cache; hub_add_parent
-- changed shape and five functions are new.
notify pgrst, 'reload schema';
