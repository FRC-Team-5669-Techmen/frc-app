-- ============================================================
-- 0023_family_link_recovery: a mentor sends ONE family its event hub link,
-- the open link says how to fix a typo, and the family link shows the trip
-- (ledger 0016)
--
-- Run once in the Supabase SQL editor, AFTER 0005 to 0011 (the event family
-- hub) and 0017 (the family link). Re-runnable. Changes no table, no policy
-- and no existing function: it only adds four functions.
--
-- WHY. Beach Blitz 2026, 2026-10-22: a parent started a sign-up with a
-- mistyped email, so every page link went to the wrong inbox. Back on the
-- open link, the family-already-started screen showed only the masked
-- address, and the mentor page had no button to send the family the right
-- link. It was fixed by hand through the connector (set_emails, then
-- reset_links). Decision 43 stands: the open link still never shows a full
-- address.
--
-- WHAT THIS ADDS.
--   staff_send_trip_link(invite, email, student, trip)   staff only
--     Queues one email per address on ONE family, each carrying a fresh
--     link (the event-family function mints a token per email at send
--     time, hub_outbox_mint_link, 0008). Pass the invite (the mentor page),
--     or a student and optionally part of a trip title (the connector).
--     With an email, it must be on the family. Deduped per address per hour.
--   trip_join_contact(event)                              anon
--     The first alert email of an open event, for a mailto on the open
--     link. Null when the event has none.
--   family_hub_trips(family token)                       anon
--     The event hub sign-ups of THAT token student only, on events not over:
--     title, first day, done or not. No token, no address, no invite id.
--   family_hub_send_link(family token, event)            anon
--     Emails that sign-up link to the addresses already on it, deduped per
--     address per hour. Answers a count, never an address.
--
-- The family token is the application parent_token (0017), the same
-- credential /family/<token> already uses.
--
-- TO UNDO: drop function public.staff_send_trip_link(uuid, text, uuid, text),
-- public.trip_join_contact(uuid), public.family_hub_trips(uuid),
-- public.family_hub_send_link(uuid, uuid), public._hub_send_link_to(uuid, text[], text);
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public._hub_enqueue(uuid, text, text[], text, text, uuid, text)') is null
     or to_regprocedure('public._hub_mint_token_for(uuid, text)') is null then
    raise exception '0023 needs the event family hub (0005 to 0011) applied first';
  end if;
  if to_regprocedure('public.family_call(uuid, text, jsonb)') is null then
    raise exception '0023 needs 0017_families_and_records.sql applied first';
  end if;
end
$prereq$;

-- The one sender. Queues the link email to each address given, one row and
-- one dedupe key per address per hour (prefix names who asked). Answers how
-- many were queued now and how many had already gone this hour.
create or replace function public._hub_send_link_to(p_invite uuid, p_to text[], p_prefix text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  i public.hub_invites; e public.hub_events; v_student text; v_addr text; v_key text;
  v_queued int := 0; v_already int := 0;
begin
  select * into i from public.hub_invites where id = p_invite;
  select * into e from public.hub_events where id = i.event_id;
  v_student := public._hub_student_name(i.student_id);
  foreach v_addr in array coalesce(p_to, '{}'::text[]) loop
    continue when v_addr is null or btrim(v_addr) = '';
    v_key := p_prefix || ':' || p_invite || ':' || v_addr || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24');
    if exists (select 1 from public.hub_outbox o where o.dedupe_key = v_key) then
      v_already := v_already + 1;
      continue;
    end if;
    perform public._hub_enqueue(e.id, 'resend', array[v_addr],
      format('Your %s link for %s', e.title, split_part(v_student, ' ', 1)),
      format(E'Here is your family''s page for %s at %s:\n{{link}}\n\nIt opens your sign-up right where you left it. This link is just for your family.',
             v_student, e.title) || public._hub_sign(),
      p_invite, v_key);
    v_queued := v_queued + 1;
  end loop;
  return jsonb_build_object('queued', v_queued, 'already', v_already);
end
$fn$;

-- Does: Email one family their event sign-up link again, a fresh link to each email on the family, or to one of them.
create or replace function public.staff_send_trip_link(p_invite uuid default null, p_email text default null,
                                                      p_student uuid default null, p_trip text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_invite uuid := p_invite;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_trip text := nullif(btrim(coalesce(p_trip, '')), '');
  v_n int; v_titles text; i public.hub_invites; v_to text[]; v jsonb;
begin
  if not public.is_staff() then
    raise exception using errcode = '42501', message = 'hub:not_allowed', detail = 'Staff only.';
  end if;

  if v_invite is null then
    if p_student is null then
      perform public._hub_refuse('invalid', 'Say which family: a student, or the family on the mentor page.');
    end if;
    select count(*), string_agg(e.title, ', ' order by e.title) into v_n, v_titles
      from public.hub_invites x join public.hub_events e on e.id = x.event_id
     where x.student_id = p_student and now() < public._hub_event_end(e.id)
       and (v_trip is null or e.title ilike '%' || v_trip || '%');
    if v_n = 0 then
      perform public._hub_refuse('not_found', 'That student has no sign-up on a trip that is still coming up.');
    end if;
    if v_n > 1 then
      perform public._hub_refuse('ambiguous', 'That student is signed up for more than one trip: ' || v_titles || '. Say which.');
    end if;
    select x.id into v_invite
      from public.hub_invites x join public.hub_events e on e.id = x.event_id
     where x.student_id = p_student and now() < public._hub_event_end(e.id)
       and (v_trip is null or e.title ilike '%' || v_trip || '%');
  end if;

  select * into i from public.hub_invites where id = v_invite;
  if not found then
    perform public._hub_refuse('family_gone', 'That family is no longer on this trip.');
  end if;
  if now() >= public._hub_event_end(i.event_id) then
    perform public._hub_refuse('event_over', 'This event is over.');
  end if;
  if v_email is not null then
    if not (v_email = any(i.emails)) then
      perform public._hub_refuse('not_on_family', 'That email is not on this family. Save it on the family first.');
    end if;
    v_to := array[v_email];
  else
    v_to := i.emails;
  end if;
  if coalesce(cardinality(v_to), 0) = 0 then
    perform public._hub_refuse('no_email', 'This family has no email yet. Add one first.');
  end if;

  v := public._hub_send_link_to(v_invite, v_to, 'staff_link');
  return v || jsonb_build_object('ok', true, 'to', to_jsonb(v_to),
                                 'student', public._hub_student_name(i.student_id),
                                 'event', (select title from public.hub_events where id = i.event_id));
end
$fn$;

-- Does: The team contact email shown on an open trip sign-up page, for a parent who needs a mentor.
create or replace function public.trip_join_contact(p_event uuid default null)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select nullif(lower(btrim(e.alert_emails[1])), '')
    from public.hub_events e
   where e.id = public._hub_join_event(p_event)
$fn$;

-- The application a family token belongs to: the newest with that token.
-- Null for an unknown token.
create or replace function public._family_token_student(p_token uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $fn$
  select a.member_id from public.member_applications a
   where p_token is not null and a.parent_token = p_token
   order by a.submitted_at desc nulls last limit 1
$fn$;

-- Does: The trips a family token student is signed up for that are not over, each with done or not.
create or replace function public.family_hub_trips(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_student uuid;
begin
  if p_token is null or not exists (select 1 from public.member_applications where parent_token = p_token) then
    raise exception 'This link is not valid' using errcode = 'P0002';
  end if;
  v_student := public._family_token_student(p_token);
  if v_student is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'event_id', e.id,
             'title', e.title,
             'starts_on', (select min(d.day_date) from public.hub_days d where d.event_id = e.id),
             'signup_done', coalesce((public._hub_progress(i.id) ->> 'phase1_done')::boolean, false),
             'lockin_open', e.lockin_opens_at is not null and now() >= e.lockin_opens_at,
             'lockin_done', coalesce((public._hub_progress(i.id) ->> 'lockin_done')::boolean, false),
             'has_email', cardinality(i.emails) > 0)
           order by (select min(d.day_date) from public.hub_days d where d.event_id = e.id), e.title)
      from public.hub_invites i join public.hub_events e on e.id = i.event_id
     where i.student_id = v_student and now() < public._hub_event_end(e.id)), '[]'::jsonb);
end
$fn$;

-- Does: Email a family the sign-up link for one of its trips, to the emails already on that sign-up.
create or replace function public.family_hub_send_link(p_token uuid, p_event uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare v_student uuid; i public.hub_invites; v jsonb;
begin
  if p_token is null or not exists (select 1 from public.member_applications where parent_token = p_token) then
    raise exception 'This link is not valid' using errcode = 'P0002';
  end if;
  v_student := public._family_token_student(p_token);
  select * into i from public.hub_invites where event_id = p_event and student_id = v_student;
  if v_student is null or not found then
    perform public._hub_refuse('not_found', 'There is no sign-up for that trip on this family link.');
  end if;
  if now() >= public._hub_event_end(i.event_id) then
    perform public._hub_refuse('event_over', 'This event is over.');
  end if;
  if cardinality(i.emails) = 0 then
    perform public._hub_refuse('no_email', 'There is no email on this sign-up yet. Ask a mentor to add yours.');
  end if;
  v := public._hub_send_link_to(i.id, i.emails, 'family_link');
  return jsonb_build_object('ok', true, 'queued', v -> 'queued', 'already', v -> 'already',
                            'count', cardinality(i.emails));
end
$fn$;

-- Grants: revoked by name from everyone, then granted to who calls each.
revoke all on function public._hub_send_link_to(uuid, text[], text) from public, anon, authenticated, service_role;
revoke all on function public._family_token_student(uuid) from public, anon, authenticated, service_role;
revoke all on function public.staff_send_trip_link(uuid, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.trip_join_contact(uuid) from public, anon, authenticated, service_role;
revoke all on function public.family_hub_trips(uuid) from public, anon, authenticated, service_role;
revoke all on function public.family_hub_send_link(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_send_trip_link(uuid, text, uuid, text) to authenticated;
grant execute on function public.trip_join_contact(uuid) to anon, authenticated;
grant execute on function public.family_hub_trips(uuid) to anon, authenticated;
grant execute on function public.family_hub_send_link(uuid, uuid) to anon, authenticated;
