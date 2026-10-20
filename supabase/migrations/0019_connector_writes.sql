-- ============================================================
-- 0019_connector_writes: every write a page made straight into a table,
-- now a database function, so Claude can make it too (ledger 0014)
--
-- Run once in the Supabase SQL editor, AFTER 0001 to 0018. Re-runnable:
-- every object is create or replace, and nothing here changes a table, a
-- policy or a grant.
--
-- WHAT THIS IS. Until now 84 writes in 26 files under src/ went straight
-- from a page into a table, which the connector (0018) cannot call: it calls
-- functions, never tables. Each of those writes is now a function below, one
-- per thing a person does (a save that deleted then inserted is one function,
-- which also makes it all or nothing). The pages call these functions, and
-- fall back to their old direct write while this file has not been pasted
-- (src/writeVia.js), so the app behaves the same before and after the paste.
--
-- EVERY FUNCTION IS SECURITY INVOKER. It runs as the caller, so the table
-- policies that decided the direct write decide this one, row for row: the
-- same caller gets the same outcome (written, refused with the same code, or
-- 0 rows), which 0019_connector_writes_rls_test.sql proves by running the
-- old direct write and the function side by side for every caller.
-- RETURNING appears only where the page read the row back (a RETURNING needs
-- the read policy too), so a function asks for no more than the page did.
--
-- Small differences from the direct write, each deliberate:
--   - a timestamp the page took from the phone clock (updated_at,
--     reviewed_at, verified_at, onboarded_at, signed_at) is now() here;
--   - a column the page filled with the signed-in account (created_by,
--     member_id, user_id, assigned_by, reviewed_by, verified_by) is
--     auth.uid() here; the policies already required exactly that;
--   - a save of several statements is all or nothing.
--
-- THE Does: LINE above each function is its description for Claude:
-- tools/connector/build.mjs reads the first sentence after "Does:".
--
-- TO UNDO: drop every function this file creates. They are listed by name in
-- 0019_connector_writes_rls_test.sql check 1; nothing else changes, and the
-- pages fall back to their direct writes on their own.
-- ============================================================

do $prereq$
begin
  if to_regclass('public.discord_announce_roles') is null                                  -- 0003
     or to_regclass('public.hub_food_needs') is null                                       -- 0005
     or to_regclass('public.handbook_acknowledgments') is null                             -- 0013
     or to_regclass('public.fll_teams') is null                                            -- 0015
     or to_regclass('public.standing_settings') is null                                    -- 0015
     or to_regprocedure('public.connector_call(text, text, jsonb, text, text, jsonb)') is null   -- 0018
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'feedback' and column_name = 'tried')              -- 0002
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hub_events' and column_name = 'parent_service_hours_note') -- 0011
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attendance_events' and column_name = 'note')       -- 0014
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hub_events' and column_name = 'event_id')         -- 0016
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'standing_settings' and column_name = 'kickoff_event_id') -- 0016
  then
    raise exception '0019 needs 0001 to 0018 applied first (a table or column one of them creates is missing)';
  end if;
end
$prereq$;

-- ── Access requests ─────────────────────────────────────────────────────────

-- Does: Ask for access to the team app, with the email signed in, a name, the role wanted and a note.
-- Was: src/AccessGate.jsx, access_requests insert.
create or replace function public.access_request_submit(p_email text, p_full_name text, p_requested_role text, p_note text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.access_requests (email, full_name, requested_role, note)
  values (p_email, p_full_name, p_requested_role, p_note);
end
$fn$;

-- ── Discord announcement roles (admin) ──────────────────────────────────────

-- Does: Add a Discord role that announcements may ping.
-- Was: src/AnnouncePage.jsx, discord_announce_roles insert.
create or replace function public.announce_add_role(p_name text, p_role_id text, p_notes text, p_sort_order integer)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.discord_announce_roles (name, role_id, notes, sort_order)
  values (p_name, p_role_id, p_notes, p_sort_order);
end
$fn$;

-- Does: Change the name, id, notes or order of a Discord role announcements may ping.
-- Was: src/AnnouncePage.jsx, discord_announce_roles update.
create or replace function public.announce_edit_role(p_role uuid, p_name text, p_role_id text, p_notes text, p_sort_order integer)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.discord_announce_roles
     set name = p_name, role_id = p_role_id, notes = p_notes, sort_order = p_sort_order
   where id = p_role;
end
$fn$;

-- Does: Turn a Discord role on or off for announcements.
-- Was: src/AnnouncePage.jsx, discord_announce_roles update.
create or replace function public.announce_set_role_active(p_role uuid, p_active boolean)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.discord_announce_roles set active = p_active where id = p_role;
end
$fn$;

-- Does: Remove a Discord role from the announcement list; past posts keep their copy.
-- Was: src/AnnouncePage.jsx, discord_announce_roles delete.
create or replace function public.announce_delete_role(p_role uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.discord_announce_roles where id = p_role;
end
$fn$;

-- ── The signed-in member own profile ────────────────────────────────────────

-- Does: Mark the welcome tour finished for the signed-in member.
-- Was: src/App.jsx, profiles update.
create or replace function public.member_finish_tour()
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles set onboarded_at = now() where id = auth.uid();
end
$fn$;

-- Does: Make sure the signed-in member has a profile row (every tag tap does this first).
-- Was: src/CheckinPage.jsx and src/VolunteerCheckinPage.jsx, profiles upsert on id.
create or replace function public.member_ensure_profile()
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.profiles (id) values (auth.uid())
  on conflict (id) do update set id = excluded.id;
end
$fn$;

-- Does: Save the signed-in member profile: nickname, bio, shirt size, sub-teams, disciplines and graduation year.
-- Was: src/ProfilePage.jsx, profiles update.
create or replace function public.member_save_profile(p_nickname text, p_bio text, p_shirt_size text, p_subteams text[], p_disciplines text[], p_grad_year integer)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles
     set nickname = p_nickname, bio = p_bio, shirt_size = p_shirt_size,
         subteams = p_subteams, disciplines = p_disciplines, grad_year = p_grad_year
   where id = auth.uid();
end
$fn$;

-- Does: Use the photo from the sign-in account as the signed-in member picture.
-- Was: src/ProfilePage.jsx, profiles update.
create or replace function public.member_set_avatar(p_avatar_url text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles set avatar_url = p_avatar_url where id = auth.uid();
end
$fn$;

-- Does: Save which notifications the signed-in member wants, and their quiet hours.
-- Was: src/NotificationsPanel.jsx, profiles update.
create or replace function public.member_set_notification_prefs(p_prefs jsonb)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles set notification_prefs = p_prefs where id = auth.uid();
end
$fn$;

-- Does: Save the preferred name, graduation year and shirt size given on the member application.
-- Was: src/MemberApplication.jsx, profiles update.
create or replace function public.member_save_application_profile(p_nickname text, p_grad_year integer, p_shirt_size text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles set nickname = p_nickname, grad_year = p_grad_year, shirt_size = p_shirt_size
   where id = auth.uid();
end
$fn$;

-- Does: Submit the signed-in student member application for a season.
-- Was: src/MemberApplication.jsx, member_applications insert returning id. The
-- application arrives as one object with the page fields by column name.
create or replace function public.member_application_submit(p_application jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare
  r public.member_applications;
  v_id uuid;
begin
  r := jsonb_populate_record(null::public.member_applications, p_application);
  insert into public.member_applications (
    member_id, season_id, legal_first_name, legal_last_name, student_phone, pathway,
    returning_member, seasons_on_team, prior_robotics, programming_languages, cad_tools,
    hands_on_experience, certifications_claimed, subteam_first, subteam_second, subteam_third,
    subteam_rationale, monday_lunch, tuesday_after_school, friday_after_school, transport_after_5pm,
    seasonal_conflicts, conflict_detail, fll_volunteering_interest, build_season_acknowledged,
    parent_name, parent_email, parent_phone, parent_two_name, parent_two_contact,
    dietary_restrictions, emergency_contact_name, emergency_contact_phone, discord_username,
    conduct_acknowledged)
  values (
    auth.uid(), r.season_id, r.legal_first_name, r.legal_last_name, r.student_phone, r.pathway,
    r.returning_member, r.seasons_on_team, r.prior_robotics, r.programming_languages, r.cad_tools,
    r.hands_on_experience, r.certifications_claimed, r.subteam_first, r.subteam_second, r.subteam_third,
    r.subteam_rationale, r.monday_lunch, r.tuesday_after_school, r.friday_after_school, r.transport_after_5pm,
    r.seasonal_conflicts, r.conflict_detail, r.fll_volunteering_interest, r.build_season_acknowledged,
    r.parent_name, r.parent_email, r.parent_phone, r.parent_two_name, r.parent_two_contact,
    r.dietary_restrictions, r.emergency_contact_name, r.emergency_contact_phone, r.discord_username,
    r.conduct_acknowledged)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end
$fn$;

-- ── Attendance ──────────────────────────────────────────────────────────────

-- Does: Record a check-in or check-out for the signed-in member, the way a tag tap or the Check Out button does.
-- Was: src/CheckinPage.jsx, src/VolunteerCheckinPage.jsx, src/attendanceCheckout.js
-- and src/signout.js, attendance_events insert. A category left out takes
-- the column default, build, as the direct insert did.
create or replace function public.attendance_record(
  p_type text, p_location text, p_method text,
  p_category text default null, p_geo_ok boolean default null,
  p_note text default null, p_cleanup_confirmed boolean default null)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.attendance_events (user_id, type, location, method, category, geo_ok, note, cleanup_confirmed)
  values (auth.uid(), p_type, p_location, p_method, coalesce(p_category, 'build'), p_geo_ok, p_note, p_cleanup_confirmed);
end
$fn$;

-- ── Feedback ────────────────────────────────────────────────────────────────

-- Does: Send app feedback (a bug or an idea) from the signed-in member.
-- Was: src/FeedbackWidget.jsx, feedback insert.
create or replace function public.feedback_submit(
  p_category text, p_message text, p_image_paths jsonb, p_route text, p_viewport text,
  p_user_agent text, p_tried text default null, p_build text default null)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.feedback (member_id, category, message, image_paths, route, viewport, user_agent, tried, build)
  values (auth.uid(), p_category, p_message, coalesce(p_image_paths, '[]'::jsonb), p_route, p_viewport, p_user_agent, p_tried, p_build);
end
$fn$;

-- Does: Move one feedback report to a status in the old spelling (open, reviewed, dismissed).
-- Was: src/FeedbackPage.jsx, feedback update, the path used only before 0002.
-- p_reviewed false clears who reviewed it and when (a move back to new).
create or replace function public.feedback_set_legacy_status(p_report uuid, p_status text, p_reviewed boolean)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.feedback
     set status = p_status,
         reviewed_by = case when p_reviewed then auth.uid() else null end,
         reviewed_at = case when p_reviewed then now() else null end
   where id = p_report;
end
$fn$;

-- ── Handbook ────────────────────────────────────────────────────────────────

-- Does: Sign the team handbook as the signed-in member, in the role they sign as.
-- Was: src/HandbookPage.jsx, handbook_acknowledgments insert.
create or replace function public.handbook_sign(p_version text, p_signer_role text, p_lessons_passed integer)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.handbook_acknowledgments (member_id, version, signer_role, lessons_passed, signed_at)
  values (auth.uid(), p_version, p_signer_role, p_lessons_passed, now());
end
$fn$;

-- ── Event sign-ups ──────────────────────────────────────────────────────────

-- Does: Say going, maybe or cannot go to an event, for the signed-in member, keeping what they said they would bring.
-- Was: src/HomePage.jsx, event_signups upsert without the item.
create or replace function public.event_set_response(p_event uuid, p_response text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.event_signups (event_id, member_id, response, updated_at)
  values (p_event, auth.uid(), p_response, now())
  on conflict (event_id, member_id) do update
     set event_id = excluded.event_id, member_id = excluded.member_id,
         response = excluded.response, updated_at = excluded.updated_at;
end
$fn$;

-- Does: Sign the signed-in member up for an event with an answer and what they will bring.
-- Was: src/SchedulePage.jsx, event_signups upsert with the item.
create or replace function public.event_rsvp(p_event uuid, p_response text, p_item text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.event_signups (event_id, member_id, response, item, updated_at)
  values (p_event, auth.uid(), p_response, p_item, now())
  on conflict (event_id, member_id) do update
     set event_id = excluded.event_id, member_id = excluded.member_id,
         response = excluded.response, item = excluded.item, updated_at = excluded.updated_at;
end
$fn$;

-- Does: Clear the signed-in member answer for an event.
-- Was: src/HomePage.jsx and src/SchedulePage.jsx, event_signups delete.
create or replace function public.event_clear_response(p_event uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.event_signups where event_id = p_event and member_id = auth.uid();
end
$fn$;

-- ── Jobs ────────────────────────────────────────────────────────────────────

-- Does: Post a progress update on a job, with an optional photo already uploaded.
-- Was: src/JobsPage.jsx, task_updates insert.
create or replace function public.job_post_update(p_task uuid, p_body text, p_image_path text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.task_updates (task_id, member_id, body, image_path)
  values (p_task, auth.uid(), p_body, p_image_path);
end
$fn$;

-- Does: Set a whole job open, in progress or completed.
-- Was: src/JobsPage.jsx, tasks update. Completed stamps when; open clears it.
create or replace function public.staff_set_job_status(p_task uuid, p_status text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.tasks
     set status = p_status,
         updated_at = now(),
         completed_at = case when p_status = 'completed' then now()
                             when p_status = 'open' then null
                             else completed_at end
   where id = p_task;
end
$fn$;

-- Does: Add a job to the job board, or save changes to one, with its required skills.
-- Was: src/JobsPage.jsx, tasks insert returning id or tasks update, then
-- task_required_skills delete and insert. p_task null adds a job.
-- p_skill_ids null leaves the required skills alone (the board uses the
-- IDEA certification instead); an array replaces them on an edit and sets
-- them on a new job.
create or replace function public.staff_save_job(
  p_task uuid, p_title text, p_description text, p_subteam text, p_max_claimants integer,
  p_due_date date, p_links jsonb, p_images jsonb, p_skill_ids uuid[] default null)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid;
begin
  if p_task is null then
    insert into public.tasks (title, description, subteam, max_claimants, due_date, links, images, created_by)
    values (p_title, p_description, p_subteam, p_max_claimants, p_due_date, p_links, p_images, auth.uid())
    returning id into v_id;
  else
    update public.tasks
       set title = p_title, description = p_description, subteam = p_subteam,
           max_claimants = p_max_claimants, due_date = p_due_date, links = p_links,
           images = p_images, updated_at = now()
     where id = p_task;
    v_id := p_task;
    if p_skill_ids is not null then
      delete from public.task_required_skills where task_id = v_id;
    end if;
  end if;
  if p_skill_ids is not null and cardinality(p_skill_ids) > 0 then
    insert into public.task_required_skills (task_id, skill_id)
    select v_id, s from unnest(p_skill_ids) as s;
  end if;
  return v_id;
end
$fn$;

-- Does: Delete a job from the job board.
-- Was: src/JobsPage.jsx, tasks delete.
create or replace function public.staff_delete_job(p_task uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.tasks where id = p_task;
end
$fn$;

-- ── Logged hours ────────────────────────────────────────────────────────────

-- Does: Log hours worked away from the shop for the signed-in member, waiting for a mentor to verify.
-- Was: src/LogHoursPage.jsx, logged_hours insert returning the row.
create or replace function public.log_hours_submit(p_date date, p_hours numeric, p_type text, p_description text)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v public.logged_hours;
begin
  insert into public.logged_hours (member_id, date, hours, type, description, status)
  values (auth.uid(), p_date, p_hours, p_type, p_description, 'pending')
  returning * into v;
  return to_jsonb(v);
end
$fn$;

-- Does: Delete a logged-hours entry that is still waiting to be verified.
-- Was: src/LogHoursPage.jsx, logged_hours delete.
create or replace function public.log_hours_delete(p_entry uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.logged_hours where id = p_entry;
end
$fn$;

-- Does: Approve or reject a member logged hours.
-- Was: src/VerifyHoursPage.jsx, logged_hours update.
create or replace function public.staff_review_logged_hours(p_entry uuid, p_approve boolean)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  if p_approve then
    update public.logged_hours set status = 'verified', verified_by = auth.uid(), verified_at = now() where id = p_entry;
  else
    update public.logged_hours set status = 'rejected' where id = p_entry;
  end if;
end
$fn$;

-- ── Push notifications ──────────────────────────────────────────────────────

-- Does: Turn on notifications for this device for the signed-in member.
-- Was: src/NotificationsPanel.jsx, push_subscriptions upsert on endpoint.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.push_subscriptions (endpoint, member_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
     set endpoint = excluded.endpoint, member_id = excluded.member_id, p256dh = excluded.p256dh,
         auth = excluded.auth, user_agent = excluded.user_agent;
end
$fn$;

-- Does: Turn off notifications for this device.
-- Was: src/NotificationsPanel.jsx, push_subscriptions delete.
create or replace function public.push_unsubscribe(p_endpoint text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
end
$fn$;

-- ── Roster (admin) ──────────────────────────────────────────────────────────

-- Does: Approve a member who signed in, and give them the student role.
-- Was: src/RosterPage.jsx, profiles update then member_roles upsert ignoring a duplicate.
create or replace function public.admin_approve_member(p_member uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles set approved = true where id = p_member;
  insert into public.member_roles (member_id, role) values (p_member, 'student')
  on conflict (member_id, role) do nothing;
end
$fn$;

-- Does: Let everyone signing in from an email domain in without approval.
-- Was: src/RosterPage.jsx, allowed_domains insert.
create or replace function public.admin_add_allowed_domain(p_domain text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.allowed_domains (domain) values (p_domain);
end
$fn$;

-- Does: Stop letting an email domain in without approval.
-- Was: src/RosterPage.jsx, allowed_domains delete.
create or replace function public.admin_remove_allowed_domain(p_domain text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.allowed_domains where domain = p_domain;
end
$fn$;

-- Does: Mark a member active, inactive or alumni.
-- Was: src/RosterPage.jsx, profiles update.
create or replace function public.admin_set_member_status(p_member uuid, p_status text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles set status = p_status where id = p_member;
end
$fn$;

-- Does: Let a member check in without the location check, or put the check back.
-- Was: src/RosterPage.jsx, profiles update.
create or replace function public.admin_set_geofence_exempt(p_member uuid, p_exempt boolean)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.profiles set geofence_exempt = p_exempt where id = p_member;
end
$fn$;

-- ── Event rosters: the family sign-up hub link ──────────────────────────────

-- Does: Link an event to its family sign-up hub, or unlink it.
-- Was: src/RostersPage.jsx, two hub_events updates. p_unlink is the hub
-- linked now (null for none), p_link the hub to link (null to leave it unlinked).
create or replace function public.staff_link_family_hub(p_event uuid, p_unlink uuid, p_link uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  if p_unlink is not null then
    update public.hub_events set event_id = null where id = p_unlink;
  end if;
  if p_link is not null then
    update public.hub_events set event_id = p_event where id = p_link;
  end if;
end
$fn$;

-- ── The schedule ────────────────────────────────────────────────────────────

-- Does: Add an event to the team schedule.
-- Was: src/SchedulePage.jsx, events insert. Answers the new event (its id
-- is what undo needs).
create or replace function public.schedule_create_event(
  p_title text, p_kind text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_location text default null, p_notes text default null, p_rsvp_enabled boolean default false,
  p_capacity integer default null, p_mandatory boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v public.events;
begin
  insert into public.events (title, kind, starts_at, ends_at, location, notes, rsvp_enabled, capacity, mandatory, created_by)
  values (p_title, p_kind, p_starts_at, p_ends_at, p_location, p_notes, coalesce(p_rsvp_enabled, false), p_capacity, coalesce(p_mandatory, false), auth.uid())
  returning * into v;
  return jsonb_build_object('id', v.id, 'title', v.title, 'kind', v.kind, 'starts_at', v.starts_at, 'ends_at', v.ends_at, 'location', v.location);
end
$fn$;

-- Does: Add the same event on several days at once, as one repeating series.
-- Was: src/SchedulePage.jsx, one events insert of many rows. p_events is a
-- list of events by column name (title, kind, starts_at, ends_at, location,
-- notes, rsvp_enabled, capacity, mandatory, series_id). One statement, so the
-- schedule notification says "N events were added" once, as before.
create or replace function public.schedule_create_events(p_events jsonb)
returns integer language plpgsql security invoker set search_path = public as $fn$
declare n integer;
begin
  insert into public.events (title, kind, starts_at, ends_at, location, notes, rsvp_enabled, capacity, mandatory, series_id, created_by)
  select r.title, coalesce(r.kind, 'build'), r.starts_at, r.ends_at, r.location, r.notes,
         coalesce(r.rsvp_enabled, false), r.capacity, coalesce(r.mandatory, false), r.series_id, auth.uid()
    from jsonb_populate_recordset(null::public.events, p_events) as r;
  get diagnostics n = row_count;
  return n;
end
$fn$;

-- Does: Change an event on the schedule.
-- Was: src/SchedulePage.jsx, events update. Answers the ids it changed:
-- none means the calendar refused it.
create or replace function public.schedule_update_event(
  p_event uuid, p_title text, p_kind text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_location text, p_notes text, p_rsvp_enabled boolean, p_capacity integer, p_mandatory boolean)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v jsonb;
begin
  with u as (
    update public.events
       set title = p_title, kind = p_kind, starts_at = p_starts_at, ends_at = p_ends_at,
           location = p_location, notes = p_notes, rsvp_enabled = p_rsvp_enabled,
           capacity = p_capacity, mandatory = p_mandatory, updated_at = now()
     where id = p_event
    returning id)
  select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb) into v from u;
  return v;
end
$fn$;

-- Does: Change every event in a repeating series, moving each to the new time of day on its own date.
-- Was: src/SchedulePage.jsx, one events update per event in the series.
-- p_times is a list of {id, starts_at, ends_at}. One update per event, as
-- the page made, so the schedule notifications are the same. Answers the
-- ids it changed.
create or replace function public.schedule_update_series(
  p_title text, p_kind text, p_location text, p_notes text, p_rsvp_enabled boolean,
  p_capacity integer, p_mandatory boolean, p_times jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare
  t record;
  v_id uuid;
  v_out jsonb := '[]'::jsonb;
begin
  for t in select * from jsonb_to_recordset(p_times) as x(id uuid, starts_at timestamptz, ends_at timestamptz) loop
    v_id := null;
    update public.events
       set title = p_title, kind = p_kind, location = p_location, notes = p_notes,
           rsvp_enabled = p_rsvp_enabled, capacity = p_capacity, mandatory = p_mandatory,
           updated_at = now(), starts_at = t.starts_at, ends_at = t.ends_at
     where id = t.id
    returning id into v_id;
    if v_id is not null then v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id)); end if;
  end loop;
  return v_out;
end
$fn$;

-- Does: Delete one event from the schedule.
-- Was: src/SchedulePage.jsx, events delete. Answers the ids it removed.
create or replace function public.schedule_delete_event(p_event uuid)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v jsonb;
begin
  with d as (delete from public.events where id = p_event returning id)
  select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb) into v from d;
  return v;
end
$fn$;

-- Does: Delete every event in a repeating series.
-- Was: src/SchedulePage.jsx, events delete by series. Answers the ids it removed.
create or replace function public.schedule_delete_series(p_series uuid)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v jsonb;
begin
  with d as (delete from public.events where series_id = p_series returning id)
  select coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb) into v from d;
  return v;
end
$fn$;

-- ── Squad positions ─────────────────────────────────────────────────────────

-- Does: Put a member in a squad position.
-- Was: src/SquadPage.jsx, position_assignments insert.
create or replace function public.staff_assign_position(p_position uuid, p_member uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.position_assignments (position_id, member_id, assigned_by)
  values (p_position, p_member, auth.uid());
end
$fn$;

-- Does: Take a member out of a squad position.
-- Was: src/SquadPage.jsx, position_assignments delete.
create or replace function public.staff_unassign_position(p_position uuid, p_member uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.position_assignments where position_id = p_position and member_id = p_member;
end
$fn$;

-- Does: Add a squad position, or save changes to one.
-- Was: src/SquadPage.jsx, positions insert or update. p_position null adds one.
create or replace function public.staff_save_position(p_position uuid, p_name text, p_description text, p_target_count integer, p_sort_order integer)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  if p_position is null then
    insert into public.positions (name, description, target_count, sort_order)
    values (p_name, p_description, p_target_count, p_sort_order);
  else
    update public.positions
       set name = p_name, description = p_description, target_count = p_target_count, sort_order = p_sort_order
     where id = p_position;
  end if;
end
$fn$;

-- Does: Remove a squad position and everyone in it.
-- Was: src/SquadPage.jsx, positions delete.
create or replace function public.staff_delete_position(p_position uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.positions where id = p_position;
end
$fn$;

-- ── Member standing ─────────────────────────────────────────────────────────

-- Does: Add an FLL team that members can mentor.
-- Was: src/StandingTeamPage.jsx, fll_teams insert.
create or replace function public.staff_add_fll_team(p_name text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.fll_teams (name) values (p_name);
end
$fn$;

-- Does: Save the standing settings: when the standards start, the build season dates and the kickoff event.
-- Was: src/StandingTeamPage.jsx, standing_settings update. p_settings holds
-- starts_on, build_season_start, build_season_end and kickoff_event_id; a key
-- left out is left as it is, as the page did.
create or replace function public.admin_save_standing_settings(p_settings jsonb)
returns void language plpgsql security invoker set search_path = public as $fn$
declare
  r public.standing_settings;
  v_bad text;
begin
  select string_agg(k, ', ') into v_bad from jsonb_object_keys(coalesce(p_settings, '{}'::jsonb)) as k
   where k <> all (array['starts_on', 'build_season_start', 'build_season_end', 'kickoff_event_id']);
  if v_bad is not null then
    raise exception 'Unknown standing setting: %', v_bad using errcode = '42703';
  end if;
  r := jsonb_populate_record(null::public.standing_settings, p_settings);
  update public.standing_settings s
     set starts_on          = case when p_settings ? 'starts_on' then r.starts_on else s.starts_on end,
         build_season_start = case when p_settings ? 'build_season_start' then r.build_season_start else s.build_season_start end,
         build_season_end   = case when p_settings ? 'build_season_end' then r.build_season_end else s.build_season_end end,
         kickoff_event_id   = case when p_settings ? 'kickoff_event_id' then r.kickoff_event_id else s.kickoff_event_id end,
         updated_at = now()
   where s.id = true;
end
$fn$;

-- ── Surveys ─────────────────────────────────────────────────────────────────

-- Does: Submit the signed-in member answers to the open weekly survey.
-- Was: src/SurveyPage.jsx, survey_responses insert returning id and
-- submitted_at, then survey_answers insert. p_answers is a list of
-- {question_id, value}; a skipped question is left out. All or nothing.
create or replace function public.survey_submit(p_survey uuid, p_answers jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v public.survey_responses;
begin
  insert into public.survey_responses (survey_id, member_id) values (p_survey, auth.uid())
  returning * into v;
  if jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) > 0 then
    insert into public.survey_answers (response_id, question_id, value)
    select v.id, a.question_id, a.value from jsonb_to_recordset(p_answers) as a(question_id uuid, value jsonb);
  end if;
  return jsonb_build_object('id', v.id, 'submitted_at', v.submitted_at);
end
$fn$;

-- Does: Make a new weekly survey with a title and the window it is open.
-- Was: src/SurveysAdmin.jsx, surveys insert returning id.
create or replace function public.survey_create(p_title text, p_opens_at timestamptz, p_closes_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid;
begin
  insert into public.surveys (title, opens_at, closes_at, created_by)
  values (p_title, p_opens_at, p_closes_at, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end
$fn$;

-- Does: Open a survey (closing whichever one is open) or close it.
-- Was: src/SurveysAdmin.jsx, surveys update, close then open: only one survey may be open.
create or replace function public.survey_set_open(p_survey uuid, p_open boolean)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  if p_open then
    update public.surveys set is_open = false where is_open and id <> p_survey;
  end if;
  update public.surveys set is_open = p_open where id = p_survey;
end
$fn$;

-- Does: Change a survey title and the window it is open.
-- Was: src/SurveysAdmin.jsx, surveys update.
create or replace function public.survey_save_details(p_survey uuid, p_title text, p_opens_at timestamptz, p_closes_at timestamptz)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.surveys set title = p_title, opens_at = p_opens_at, closes_at = p_closes_at where id = p_survey;
end
$fn$;

-- Does: Copy a survey with its questions, closed and with no responses.
-- Was: src/SurveysAdmin.jsx, surveys insert returning id, then
-- survey_questions insert. p_questions is a list of {position, kind,
-- prompt, options, required}.
create or replace function public.survey_duplicate(p_title text, p_questions jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid;
begin
  insert into public.surveys (title, opens_at, closes_at, is_open, created_by)
  values (p_title, null, null, false, auth.uid())
  returning id into v_id;
  if jsonb_array_length(coalesce(p_questions, '[]'::jsonb)) > 0 then
    insert into public.survey_questions (survey_id, position, kind, prompt, options, required)
    select v_id, q.position, q.kind, q.prompt, coalesce(q.options, '[]'::jsonb), coalesce(q.required, false)
      from jsonb_to_recordset(p_questions) as q(position integer, kind text, prompt text, options jsonb, required boolean);
  end if;
  return jsonb_build_object('id', v_id);
end
$fn$;

-- Does: Delete a survey with its questions and responses.
-- Was: src/SurveysAdmin.jsx, surveys delete (the rest goes by cascade).
create or replace function public.survey_delete(p_survey uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.surveys where id = p_survey;
end
$fn$;

-- Does: Add a blank question to a survey.
-- Was: src/SurveysAdmin.jsx, survey_questions insert.
create or replace function public.survey_add_question(p_survey uuid, p_position integer)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.survey_questions (survey_id, position, kind, prompt, options, required)
  values (p_survey, p_position, 'single', 'New question', '[]'::jsonb, false);
end
$fn$;

-- Does: Save a survey question: its wording, kind, choices and whether it is required.
-- Was: src/SurveysAdmin.jsx, survey_questions update.
create or replace function public.survey_save_question(p_question uuid, p_prompt text, p_kind text, p_options jsonb, p_required boolean)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.survey_questions
     set prompt = p_prompt, kind = p_kind, options = p_options, required = p_required
   where id = p_question;
end
$fn$;

-- Does: Delete a survey question.
-- Was: src/SurveysAdmin.jsx, survey_questions delete.
create or replace function public.survey_delete_question(p_question uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.survey_questions where id = p_question;
end
$fn$;

-- Does: Put a survey questions in a new order.
-- Was: src/SurveysAdmin.jsx, one survey_questions update per question.
-- p_questions is every question id in the new order; each gets its place.
create or replace function public.survey_reorder_questions(p_questions uuid[])
returns void language plpgsql security invoker set search_path = public as $fn$
declare i integer;
begin
  for i in 1 .. coalesce(cardinality(p_questions), 0) loop
    update public.survey_questions set position = i where id = p_questions[i];
  end loop;
end
$fn$;

-- ── Trips: the event family hub (staff) ─────────────────────────────────────

-- Does: Start a new trip page for families.
-- Was: src/TripsPage.jsx, hub_events insert returning id.
create or replace function public.trips_create(p_title text)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid;
begin
  insert into public.hub_events (title) values (p_title) returning id into v_id;
  return jsonb_build_object('id', v_id);
end
$fn$;

-- Does: Mark the starter food needs on a trip as reviewed.
-- Was: src/TripsAdmin.jsx, hub_food_needs update.
create or replace function public.trips_mark_needs_reviewed(p_needs uuid[])
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.hub_food_needs set starter = false where id = any (p_needs);
end
$fn$;

-- Does: Add a food need to a trip meal, with how many are wanted.
-- Was: src/TripsAdmin.jsx, hub_food_needs insert.
create or replace function public.trips_add_food_need(p_meal uuid, p_label text, p_quantity integer)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.hub_food_needs (meal_id, label, quantity, position)
  values (p_meal, p_label, p_quantity, 99);
end
$fn$;

-- Does: Remove a food need from a trip.
-- Was: src/TripsAdmin.jsx, hub_food_needs delete.
create or replace function public.trips_remove_food_need(p_need uuid)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.hub_food_needs where id = p_need;
end
$fn$;

-- Does: Save a trip details: title, venue, deadlines, rules, mentor alerts, links, info sections and the parent service hours note.
-- Was: src/TripsAdmin.jsx, two hub_events updates (the details, and the
-- info sections). p_fields holds the fields by column name; a key left out
-- is left as it is, as the page did, and updated_at is stamped.
create or replace function public.trips_save_event(p_event uuid, p_fields jsonb)
returns void language plpgsql security invoker set search_path = public as $fn$
declare
  r public.hub_events;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_bad text;
begin
  select string_agg(k, ', ') into v_bad from jsonb_object_keys(f) as k
   where k <> all (array['title', 'venue_name', 'venue_address', 'map_url', 'phase1_due_at', 'lockin_opens_at',
                         'lockin_due_at', 'one_minor_rule', 'driver_paperwork_required', 'alert_emails', 'links',
                         'info', 'parent_service_hours_note', 'updated_at']);
  if v_bad is not null then
    raise exception 'Unknown trip field: %', v_bad using errcode = '42703';
  end if;
  r := jsonb_populate_record(null::public.hub_events, f);
  update public.hub_events e
     set title                     = case when f ? 'title' then r.title else e.title end,
         venue_name                = case when f ? 'venue_name' then r.venue_name else e.venue_name end,
         venue_address             = case when f ? 'venue_address' then r.venue_address else e.venue_address end,
         map_url                   = case when f ? 'map_url' then r.map_url else e.map_url end,
         phase1_due_at             = case when f ? 'phase1_due_at' then r.phase1_due_at else e.phase1_due_at end,
         lockin_opens_at           = case when f ? 'lockin_opens_at' then r.lockin_opens_at else e.lockin_opens_at end,
         lockin_due_at             = case when f ? 'lockin_due_at' then r.lockin_due_at else e.lockin_due_at end,
         one_minor_rule            = case when f ? 'one_minor_rule' then r.one_minor_rule else e.one_minor_rule end,
         driver_paperwork_required = case when f ? 'driver_paperwork_required' then r.driver_paperwork_required else e.driver_paperwork_required end,
         alert_emails              = case when f ? 'alert_emails' then r.alert_emails else e.alert_emails end,
         links                     = case when f ? 'links' then r.links else e.links end,
         info                      = case when f ? 'info' then r.info else e.info end,
         parent_service_hours_note = case when f ? 'parent_service_hours_note' then r.parent_service_hours_note else e.parent_service_hours_note end,
         updated_at                = now()
   where e.id = p_event;
end
$fn$;

-- Does: Save one trip day: meet time and place, captain, venue hours, drive times, ride-home choices and notes.
-- Was: src/TripsAdmin.jsx, hub_days update. p_fields holds the fields by
-- column name; a key left out is left as it is.
create or replace function public.trips_save_day(p_day uuid, p_fields jsonb)
returns void language plpgsql security invoker set search_path = public as $fn$
declare
  r public.hub_days;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_bad text;
begin
  select string_agg(k, ', ') into v_bad from jsonb_object_keys(f) as k
   where k <> all (array['title', 'position', 'captain_id', 'meet_place', 'meet_at', 'last_car_out_at',
                         'target_arrival_at', 'doors_at', 'venue_opens_at', 'venue_closes_at', 'pits_close_at',
                         'drive_to_range', 'drive_home_range', 'miles_to', 'miles_home', 'intro', 'home_options',
                         'notes', 'ask_pit_setup', 'ask_school_ride']);
  if v_bad is not null then
    raise exception 'Unknown trip day field: %', v_bad using errcode = '42703';
  end if;
  r := jsonb_populate_record(null::public.hub_days, f);
  update public.hub_days d
     set title             = case when f ? 'title' then r.title else d.title end,
         position          = case when f ? 'position' then r.position else d.position end,
         captain_id        = case when f ? 'captain_id' then r.captain_id else d.captain_id end,
         meet_place        = case when f ? 'meet_place' then r.meet_place else d.meet_place end,
         meet_at           = case when f ? 'meet_at' then r.meet_at else d.meet_at end,
         last_car_out_at   = case when f ? 'last_car_out_at' then r.last_car_out_at else d.last_car_out_at end,
         target_arrival_at = case when f ? 'target_arrival_at' then r.target_arrival_at else d.target_arrival_at end,
         doors_at          = case when f ? 'doors_at' then r.doors_at else d.doors_at end,
         venue_opens_at    = case when f ? 'venue_opens_at' then r.venue_opens_at else d.venue_opens_at end,
         venue_closes_at   = case when f ? 'venue_closes_at' then r.venue_closes_at else d.venue_closes_at end,
         pits_close_at     = case when f ? 'pits_close_at' then r.pits_close_at else d.pits_close_at end,
         drive_to_range    = case when f ? 'drive_to_range' then r.drive_to_range else d.drive_to_range end,
         drive_home_range  = case when f ? 'drive_home_range' then r.drive_home_range else d.drive_home_range end,
         miles_to          = case when f ? 'miles_to' then r.miles_to else d.miles_to end,
         miles_home        = case when f ? 'miles_home' then r.miles_home else d.miles_home end,
         intro             = case when f ? 'intro' then r.intro else d.intro end,
         home_options      = case when f ? 'home_options' then r.home_options else d.home_options end,
         notes             = case when f ? 'notes' then r.notes else d.notes end,
         ask_pit_setup     = case when f ? 'ask_pit_setup' then r.ask_pit_setup else d.ask_pit_setup end,
         ask_school_ride   = case when f ? 'ask_school_ride' then r.ask_school_ride else d.ask_school_ride end
   where d.id = p_day;
end
$fn$;

-- Does: Save a trip meal: its name, start time and the food truck footnote.
-- Was: src/TripsAdmin.jsx, hub_meals update.
create or replace function public.trips_save_meal(p_meal uuid, p_label text, p_starts_at timestamptz, p_truck_note text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.hub_meals set label = p_label, starts_at = p_starts_at, truck_note = p_truck_note where id = p_meal;
end
$fn$;

-- Does: Add a day to a trip.
-- Was: src/TripsAdmin.jsx, hub_days insert.
create or replace function public.trips_add_day(p_event uuid, p_day_date date, p_venue_closes_at timestamptz)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.hub_days (event_id, day_date, position, venue_closes_at)
  values (p_event, p_day_date, 9, p_venue_closes_at);
end
$fn$;

-- Does: Add a meal to a trip day.
-- Was: src/TripsAdmin.jsx, hub_meals insert.
create or replace function public.trips_add_meal(p_event uuid, p_day uuid, p_label text, p_starts_at timestamptz)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  insert into public.hub_meals (event_id, day_id, label, starts_at)
  values (p_event, p_day, p_label, p_starts_at);
end
$fn$;

-- ── Verify hours (staff) ────────────────────────────────────────────────────

-- Does: Count or do not count a session where the member forgot to check out.
-- Was: src/VerifyHoursPage.jsx, session_reviews update.
create or replace function public.staff_resolve_missed_checkout(p_review uuid, p_status text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.session_reviews
     set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_review;
end
$fn$;

-- Does: Set the time of night an open session closes on its own.
-- Was: src/VerifyHoursPage.jsx, app_settings update returning key. Answers
-- the settings it changed: none means it was not saved.
create or replace function public.staff_set_auto_close_cutoff(p_value text)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v jsonb;
begin
  with u as (update public.app_settings set value = p_value where key = 'auto_close_cutoff' returning key)
  select coalesce(jsonb_agg(jsonb_build_object('key', key)), '[]'::jsonb) into v from u;
  return v;
end
$fn$;

do $done$
begin
  raise notice '0019: % connector write functions created',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and not p.prosecdef
        and p.proname in (
          'access_request_submit', 'announce_add_role', 'announce_edit_role', 'announce_set_role_active',
          'announce_delete_role', 'member_finish_tour', 'member_ensure_profile', 'member_save_profile',
          'member_set_avatar', 'member_set_notification_prefs', 'member_save_application_profile',
          'member_application_submit', 'attendance_record', 'feedback_submit', 'feedback_set_legacy_status',
          'handbook_sign', 'event_set_response', 'event_rsvp', 'event_clear_response', 'job_post_update',
          'staff_set_job_status', 'staff_save_job', 'staff_delete_job', 'log_hours_submit', 'log_hours_delete',
          'staff_review_logged_hours', 'push_subscribe', 'push_unsubscribe', 'admin_approve_member',
          'admin_add_allowed_domain', 'admin_remove_allowed_domain', 'admin_set_member_status',
          'admin_set_geofence_exempt', 'staff_link_family_hub', 'schedule_create_event', 'schedule_create_events',
          'schedule_update_event', 'schedule_update_series', 'schedule_delete_event', 'schedule_delete_series',
          'staff_assign_position', 'staff_unassign_position', 'staff_save_position', 'staff_delete_position',
          'staff_add_fll_team', 'admin_save_standing_settings', 'survey_submit', 'survey_create', 'survey_set_open',
          'survey_save_details', 'survey_duplicate', 'survey_delete', 'survey_add_question', 'survey_save_question',
          'survey_delete_question', 'survey_reorder_questions', 'trips_create', 'trips_mark_needs_reviewed',
          'trips_add_food_need', 'trips_remove_food_need', 'trips_save_event', 'trips_save_day', 'trips_save_meal',
          'trips_add_day', 'trips_add_meal', 'staff_resolve_missed_checkout', 'staff_set_auto_close_cutoff'));
end
$done$;
