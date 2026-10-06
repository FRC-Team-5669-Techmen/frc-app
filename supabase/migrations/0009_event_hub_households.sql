-- ============================================================
-- 0009_event_hub_households -- parents with more than one student on the
-- team.
--
-- WHY
--   A family page is one student. A parent with two students on the trip
--   signs up twice on the open link with the same email, and before this
--   file the two pages knew nothing of each other:
--     * THE ONE-CHILD RULE MISREAD SIBLINGS. A parent driving one child
--       with the other child riding along was fine only while the first
--       child was aboard. Driving the second child alone (the first not
--       coming, or riding elsewhere) was refused as one student alone with
--       an adult who is not their parent, which is false: it is their child.
--     * THERE WAS NO WAY BETWEEN THE PAGES, and contacts were typed twice.
--
-- WHAT CHANGES
--   1. SIBLINGS. Two families are siblings when they are in the same event
--      and share at least one email address (_hub_siblings). The open link
--      already puts the joining parent email on the family, so signing up a
--      second student with the same email is all it takes. A brother or
--      sister counts as the driver own child:
--        * _hub_own_aboard: true also when a sibling of the driver family is
--          seated, so such a car is not red and may take one more rider;
--        * _hub_claim: a sibling may take the first seat of a car their
--          family drives, alone. Everyone else is refused exactly as before.
--   2. THE HOUSEHOLD ON THE PAGE. _hub_family_extras (so every page
--      hub_family_call returns) gains household: [{invite_id, student,
--      can_open, cars}] for each sibling family; can_open is true when the
--      email on the link in use is on that family; cars are the ids of the
--      cars that family drives, so the page can offer the family car.
--   3. hub_household_open(token, invite): from one of your pages to another.
--      It mints a fresh link to the sibling family for the email on the link
--      in use, and only when that email is on the sibling family. Called
--      from the browser with the anon key, like hub_add_parent. Nothing else
--      about any family is readable through it.
--
-- APPLY: by hand, once, AFTER 0005 to 0008, in the Supabase SQL editor.
-- Re-runnable. Then 0009_event_hub_households_rls_test.sql (rollback-safe).
-- No Edge Function redeploy. Pasting 0005 again later reverts _hub_claim and
-- _hub_own_aboard; pasting 0008 again reverts _hub_family_extras. Paste
-- 0009 again afterwards to put them back.
--
-- UNDO: drop function public.hub_household_open(text, uuid); paste 0005,
-- then 0008 (they restore _hub_claim, _hub_own_aboard and
-- _hub_family_extras); then drop function public._hub_siblings(uuid, uuid).
-- ============================================================

do $needs$
begin
  if to_regprocedure('public.hub_remove_family(text)') is null then
    raise exception 'Apply 0008_event_hub_families.sql first.';
  end if;
end
$needs$;

-- Same event, at least one email in common, not the same family.
create or replace function public._hub_siblings(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(p_a is not null and p_b is not null and p_a <> p_b and exists (
    select 1 from public.hub_invites a
      join public.hub_invites b on b.id = p_b and b.event_id = a.event_id
     where a.id = p_a and a.emails && b.emails), false)
$fn$;

-- The driver own student is aboard: their family student coming and driving
-- this run (0005), or now a sibling seated in the car.
create or replace function public._hub_own_aboard(p_car uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce((
    select a.attending = 'yes'
           and (case when c.run = 'to' then a.to_mode else a.home_mode end) = 'driving'
      from public.hub_cars c
      join public.hub_day_answers a on a.invite_id = c.driver_invite_id and a.day_id = c.day_id
     where c.id = p_car), false)
  or exists (
    select 1 from public.hub_cars c
      join public.hub_seats s on s.car_id = c.id
     where c.id = p_car and public._hub_siblings(c.driver_invite_id, s.invite_id))
$fn$;

-- 0005 _hub_claim, with the sibling exemption (v_sib) on both halves of the
-- one-child check. Nothing else in it changed.
create or replace function public._hub_claim(p_car uuid, p_rider uuid, p_staff uuid,
                                             p_override text default null, p_via_pickup boolean default false)
returns text language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  c public.hub_cars; e public.hub_events; a public.hub_day_answers;
  v_rider_event uuid; v_riders int; v_pickups int; v_old uuid; v_override boolean := false;
  v_mode text; v_sib boolean;
begin
  select * into c from public.hub_cars where id = p_car for update;
  if not found then
    perform public._hub_refuse('car_gone', 'That car is no longer listed. Pick another.');
  end if;
  select * into e from public.hub_events where id = c.event_id;
  -- 0009: a brother or sister of the drivers student is the drivers own
  -- child, so the one-child rule does not stop them riding alone with that
  -- parent.
  v_sib := public._hub_siblings(c.driver_invite_id, p_rider);
  select i.event_id into v_rider_event from public.hub_invites i where i.id = p_rider;
  if v_rider_event is distinct from c.event_id then
    perform public._hub_refuse('bad_car', 'That car is not part of this event.');
  end if;
  if p_staff is null and now() >= public._hub_event_end(e.id) then
    perform public._hub_refuse('event_over', 'This event is over. Everything is read-only now.');
  end if;
  if c.left_at is not null then
    perform public._hub_refuse('car_left', 'That car already left.');
  end if;
  if c.driver_invite_id = p_rider then
    perform public._hub_refuse('own_car', 'Your student rides in your own car.');
  end if;
  select * into a from public.hub_day_answers where invite_id = p_rider and day_id = c.day_id;
  if coalesce(a.attending, '') <> 'yes' then
    perform public._hub_refuse('not_coming', 'Mark this day as Coming first.');
  end if;
  v_mode := case c.run when 'to' then a.to_mode else a.home_mode end;
  if v_mode = 'driving' then
    perform public._hub_refuse('you_drive', 'You are driving this run. Change your plan for this run first.');
  end if;
  if public._hub_car_pending(c.id) then
    perform public._hub_refuse('pending', 'This car is waiting on driver paperwork. Pick another.');
  end if;

  select count(*), count(*) filter (where s.via_pickup) into v_riders, v_pickups
    from public.hub_seats s where s.car_id = c.id;

  -- Already in this car: at most it becomes a pickup, which the pickup-leg
  -- half of the one-minor rule must allow.
  if exists (select 1 from public.hub_seats s where s.car_id = c.id and s.invite_id = p_rider) then
    if p_via_pickup and not (select s.via_pickup from public.hub_seats s where s.car_id = c.id and s.invite_id = p_rider) then
      if e.one_minor_rule and not v_sib and not public._hub_own_aboard(c.id) and v_pickups + 1 = 1
         and not (p_staff is not null and nullif(btrim(p_override), '') is not null) then
        perform public._hub_refuse('one_minor',
          'The home pickup leg would carry one student alone with an adult who is not their parent. Ask a mentor.');
      end if;
      update public.hub_seats set via_pickup = true where car_id = c.id and invite_id = p_rider;
      update public.hub_cars
         set minor_override_reason = case when p_staff is not null then nullif(btrim(p_override), '') end,
             minor_override_by = case when p_staff is not null and nullif(btrim(p_override), '') is not null then p_staff end,
             minor_override_at = case when p_staff is not null and nullif(btrim(p_override), '') is not null then now() end,
             updated_at = now()
       where id = c.id;
    end if;
    return 'unchanged';
  end if;
  if v_riders >= c.seats then
    perform public._hub_refuse('car_full', 'That car just filled. Pick another.');
  end if;

  if e.one_minor_rule and not v_sib and not public._hub_own_aboard(c.id)
     and (v_riders + 1 = 1 or (p_via_pickup and v_pickups + 1 = 1)) then
    if p_staff is not null and nullif(btrim(p_override), '') is not null then
      v_override := true;
    else
      perform public._hub_refuse('one_minor',
        case when v_riders + 1 = 1
             then 'This car would carry one student alone with an adult who is not their parent. Pick a car with another rider, or ask a mentor.'
             else 'The home pickup leg would carry one student alone with an adult who is not their parent. Ask a mentor.' end);
    end if;
  end if;

  select s.car_id into v_old from public.hub_seats s
   where s.day_id = c.day_id and s.run = c.run and s.invite_id = p_rider;
  if v_old is not null then
    if (select left_at from public.hub_cars where id = v_old) is not null then
      perform public._hub_refuse('car_left', 'Your student''s current car already left.');
    end if;
    perform public._hub_drop_seat(v_old, p_rider, case when p_staff is null then 'switch' else 'staff_move' end);
  end if;

  insert into public.hub_seats (car_id, day_id, run, invite_id, via_pickup, placed_by, override_reason)
  values (c.id, c.day_id, c.run, p_rider, p_via_pickup, p_staff, case when v_override then p_override end);

  update public.hub_cars
     set minor_override_reason = case when v_override then btrim(p_override) end,
         minor_override_by     = case when v_override then p_staff end,
         minor_override_at     = case when v_override then now() end,
         updated_at = now()
   where id = c.id;

  -- A seat means "team carpool" for this run.
  if c.run = 'to' then
    update public.hub_day_answers set to_mode = 'carpool', updated_at = now()
     where invite_id = p_rider and day_id = c.day_id and to_mode is distinct from 'carpool';
  else
    update public.hub_day_answers set home_mode = 'carpool', updated_at = now()
     where invite_id = p_rider and day_id = c.day_id and home_mode is distinct from 'carpool';
  end if;
  return 'placed';
end
$fn$;

-- 0008 _hub_family_extras, plus the household.
create or replace function public._hub_family_extras(p_invite uuid, p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  with me as (
    select t.email from public.hub_invite_tokens t
     where t.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8')) and t.invite_id = p_invite)
  select coalesce((
    select jsonb_build_object(
      'me', (select email from me),
      'guardians', coalesce((
        select jsonb_agg(jsonb_build_object('email', u.x, 'name', i.guardian_names ->> u.x) order by u.o)
          from unnest(i.emails) with ordinality u(x, o)), '[]'::jsonb),
      'household', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'invite_id', b.id,
                 'student', public._hub_student_name(b.student_id),
                 'can_open', coalesce((select email from me) = any(b.emails), false),
                 'cars', coalesce((select jsonb_agg(c.id) from public.hub_cars c where c.driver_invite_id = b.id), '[]'::jsonb))
               order by public._hub_student_name(b.student_id))
          from public.hub_invites b
         where b.event_id = i.event_id and b.id <> i.id and b.emails && i.emails), '[]'::jsonb))
      from public.hub_invites i where i.id = p_invite), '{}'::jsonb)
$fn$;

-- From one of your family pages to another: a fresh link to the sibling
-- page, for the email on the link in use, only if that email is on it.
create or replace function public.hub_household_open(p_token text, p_invite uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_from uuid := public._hub_invite_for_token(p_token);
  v_email text;
begin
  if v_from is null then
    raise exception using errcode = 'P0002', message = 'hub:not_found', detail = 'That link is not valid.';
  end if;
  select t.email into v_email from public.hub_invite_tokens t
   where t.token_hash = sha256(convert_to(p_token, 'UTF8')) and t.invite_id = v_from;
  if v_email is null or p_invite is null or p_invite = v_from or not exists (
       select 1 from public.hub_invites a
         join public.hub_invites b on b.id = p_invite and b.event_id = a.event_id
        where a.id = v_from and v_email = any(b.emails)) then
    perform public._hub_refuse('not_household',
      'That page is not on your email. Open it from the email we sent for that student.');
  end if;
  return jsonb_build_object('token', public._hub_mint_token_for(p_invite, v_email));
end
$fn$;

revoke all on function public._hub_siblings(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public._hub_own_aboard(uuid) from public, anon, authenticated, service_role;
revoke all on function public._hub_claim(uuid, uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public._hub_family_extras(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.hub_household_open(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.hub_household_open(text, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
