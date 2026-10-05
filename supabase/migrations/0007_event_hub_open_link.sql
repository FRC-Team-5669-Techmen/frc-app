-- ============================================================
-- 0007_event_hub_open_link -- ONE open link per event, like a Google Form.
--
-- Mr. Pina, 2026-10-05: "Anybody who receives a link may fill this out.
-- Whoever's filling this out must be a parent or guardian ... they have to
-- specify which student they're filling it out for. This student would have
-- had to fill out the application form." It runs on integrity, the way the
-- team's Google Forms always have.
--
-- So /join (or /join/<event id>) is public. A parent picks their student
-- from the students who filed THIS season's application, types their name and
-- email and ticks "I am this student's parent or guardian". Then (option B,
-- Mr. Pina's choice, 2026-10-05):
--   * NOBODY HAS STARTED for that student: they go straight into the family
--     page 0005 built (the invite is created on the spot if staff never made
--     one), the page is theirs to bookmark, and the link is emailed to them.
--   * SOMEONE HAS STARTED (the family was sent a link, or answers exist):
--     the page is NOT opened. The link is emailed to the addresses already
--     on that family, naming who asked, so nobody can read another family's
--     answers by picking a name.
-- MORE THAN ONE PARENT: hub_add_parent(token, email), from the family page,
-- adds an address to the family and emails that person their own link to
-- the same page. Staff add addresses on the mentor page as before.
--
-- APPLY: by hand, once, AFTER 0005 and 0006, in the Supabase SQL editor.
-- Re-runnable. Then 0007_event_hub_open_link_rls_test.sql (rollback-safe).
-- Both functions are called straight from the page with the anon key
-- (PostgREST /rpc), so NO Edge Function redeploy is needed.
--
-- UNDO: drop function if exists public.hub_join_info(uuid),
--         public.hub_join(uuid, uuid, text, text, boolean),
--         public.hub_add_parent(text, text), public._hub_join_eligible(uuid),
--         public._hub_join_event(uuid), public._hub_join_taken(uuid),
--         public._hub_mask_email(text);
-- ============================================================

do $assumes$
begin
  if to_regprocedure('public.hub_family_call(text, text, jsonb)') is null
     or to_regprocedure('public._hub_mint_token(uuid)') is null then
    raise exception 'Cannot apply 0007: apply 0005_event_family_hub.sql first';
  end if;
end
$assumes$;

-- A student a parent may pick: approved, active, a student and not staff,
-- with an application for the current season.
create or replace function public._hub_join_eligible(p_student uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.profiles p
     where p.id = p_student and p.approved and p.status = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
       and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
       and exists (select 1 from public.member_applications ma
                    where ma.member_id = p.id and ma.season_id = public._hub_current_season()))
$fn$;

-- The event a link names, or with no id the soonest event not yet over.
-- Null when there is none, or when it is over.
create or replace function public._hub_join_event(p_event uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $fn$
  select e.id from public.hub_events e
   where (p_event is null or e.id = p_event)
     and exists (select 1 from public.hub_days d where d.event_id = e.id)
     and now() < public._hub_event_end(e.id)
   order by (select min(d.day_date) from public.hub_days d where d.event_id = e.id), e.id
   limit 1
$fn$;

-- What the open page shows: the event and the students to pick from.
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
      'lockin_due_at', e.lockin_due_at),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', public._hub_student_name(p.id))
                       order by public._hub_student_name(p.id))
        from public.profiles p where public._hub_join_eligible(p.id)), '[]'::jsonb));
end
$fn$;

-- Has anyone started for this family? A link was sent or handed over (a
-- token exists), or answers were saved (by the family or by staff).
create or replace function public._hub_join_taken(p_invite uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select p_invite is not null and (
    exists (select 1 from public.hub_invite_tokens t where t.invite_id = p_invite)
    or exists (select 1 from public.hub_day_answers a where a.invite_id = p_invite)
    or exists (select 1 from public.hub_responses r where r.invite_id = p_invite and r.staff_updated_by is not null))
$fn$;

-- p•••@gmail.com
create or replace function public._hub_mask_email(p text)
returns text language sql immutable set search_path = public, pg_temp as $fn$
  select left(split_part(p, '@', 1), 1) || '•••@' || split_part(p, '@', 2)
$fn$;

-- Join. Returns {status:'in', token} (straight in), {status:'emailed', to}
-- (someone started; the link went to them), or {status:'ask_mentor'}.
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

  perform public._hub_enqueue(v_ev, 'welcome', array[v_email],
    format('Your %s page for %s', v_title, split_part(v_student, ' ', 1)),
    format(E'Thank you for signing up %s for %s.\n\nThis is your family''s page. Save it: you will come back before the event to confirm the carpool and food, and you can change your answers any time:\n{{link}}' || public._hub_sign(),
           v_student, v_title),
    v_invite, 'welcome:' || v_invite || ':' || v_email);

  return jsonb_build_object('status', 'in', 'token', public._hub_mint_token(v_invite), 'student', v_student);
end
$fn$;

-- From the family page: add another parent or guardian. The family's own
-- link is the credential (the same check as hub_family_call).
create or replace function public.hub_add_parent(p_token text, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare
  v_invite uuid := public._hub_invite_for_token(p_token);
  v_email text := lower(btrim(coalesce(p_email, '')));
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
  if not (v_email = any(i.emails)) then
    if cardinality(i.emails) >= 6 then
      perform public._hub_refuse('too_many', 'This family already has six emails. Ask a mentor to change them.');
    end if;
    update public.hub_invites set emails = emails || array[v_email] where id = v_invite;
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

revoke all on function public._hub_join_eligible(uuid) from public, anon, authenticated;
revoke all on function public._hub_join_event(uuid) from public, anon, authenticated;
revoke all on function public._hub_join_taken(uuid) from public, anon, authenticated;
revoke all on function public._hub_mask_email(text) from public, anon, authenticated;
revoke all on function public.hub_join_info(uuid) from public;
revoke all on function public.hub_join(uuid, uuid, text, text, boolean) from public;
revoke all on function public.hub_add_parent(text, text) from public;
grant execute on function public.hub_join_info(uuid) to anon, authenticated, service_role;
grant execute on function public.hub_join(uuid, uuid, text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.hub_add_parent(text, text) to anon, authenticated, service_role;
