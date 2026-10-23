-- ============================================================
-- 0024_feedback_inbox: the open app feedback items of 2026-10-22 that need
-- the database (ledger 0016)
--
-- Run once in the Supabase SQL editor, AFTER 0002 (feedback statuses), 0014
-- (sign-out requests) and 0015 (notices and the mail outbox), and after
-- supabase/access_requests.sql and supabase/push_notifications.sql. Re-runnable.
--
-- THREE PARTS, each additive. No existing function changes; two triggers
-- and one table are new.
--
--   A. SIGN-OUT SENT BACK (feedback 2b674b0c): when a mentor sends a sign-out
--      request back, the student gets a push notification with the note
--      (category signout_returned, opt-out in Notifications) and a notice in
--      the app. The page shows the state itself (src/HomePage.jsx).
--   B. ACCESS REQUEST EMAIL (feedback 2db35100): a new access request emails
--      every admin through notice_outbox (the notice-mail function sends it),
--      at most once a day per requesting address, and leaves an app notice.
--   C. FEEDBACK REPLIES (feedback bd3a4af7): an admin answers a report; the
--      sender reads their own reports, each status and every answer, from
--      the feedback button (my_feedback), and is told by a notice, an email
--      and a push. feedback_replies has RLS on, no policy and no client
--      grant: every read and write is a function below.
--
-- A trigger never blocks the write it rides on: each body is wrapped so a
-- failure to notify leaves the request, the send-back or the report as it was.
--
-- TO UNDO: drop trigger signout_returned_notify on public.signout_requests;
-- drop trigger access_request_notify on public.access_requests; drop function
-- public._signout_returned_notify(), public._access_request_notify(),
-- public._push_one(uuid, text, text, text, text, text, text),
-- public.feedback_reply(uuid, text), public.feedback_replies_for(uuid[]),
-- public.my_feedback(); drop table public.feedback_replies; paste
-- _merge_member_rules from 0022 again.
-- ============================================================

do $prereq$
begin
  if to_regclass('public.signout_requests') is null then
    raise exception '0024 needs 0014_session_signout.sql applied first';
  end if;
  if to_regclass('public.notice_outbox') is null or to_regclass('public.member_notices') is null then
    raise exception '0024 needs 0015_member_standing.sql applied first';
  end if;
  if to_regclass('public.access_requests') is null then
    raise exception '0024 needs supabase/access_requests.sql applied first';
  end if;
  if to_regprocedure('public.feedback_set_status(uuid[], text)') is null then
    raise exception '0024 needs 0002_feedback_console.sql applied first';
  end if;
end
$prereq$;

-- One push to one member through the send-push Edge Function, the same way
-- notify_task_signoff does it. Quietly nothing while push is not deployed
-- (no config row, or an empty one).
create or replace function public._push_one(p_member uuid, p_category text, p_kind text, p_ref text,
                                            p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public, private as $fn$
declare v_url text; v_secret text;
begin
  if to_regclass('private.push_config') is null then return; end if;
  execute 'select edge_base_url, hook_secret from private.push_config where id = 1' into v_url, v_secret;
  if v_url is null then return; end if;
  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object('targets', jsonb_build_array(jsonb_build_object(
                 'member_id', p_member, 'category', p_category, 'kind', p_kind, 'ref_id', p_ref,
                 'title', p_title, 'body', p_body, 'url', p_url))));
exception when others then
  return;
end
$fn$;

-- ── A. Sign-out sent back ───────────────────────────────────────────────────

create or replace function public._signout_returned_notify()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_body text;
begin
  if not (old.status = 'pending' and new.status = 'returned') then return new; end if;
  begin
    v_body := case when nullif(btrim(coalesce(new.reason, '')), '') is null
                   then 'A mentor sent your sign-out back. Finish up, then ask again.'
                   else 'A mentor sent your sign-out back: ' || btrim(new.reason) || ' Fix it, then ask again.' end;
    insert into public.member_notices (member_id, kind, title, body, created_by)
    values (new.member_id, 'signout_returned', 'Sign-out sent back', v_body, new.decided_by);
    perform public._push_one(new.member_id, 'signout_returned', 'signout_returned', new.id::text,
                             'Sign-out sent back', v_body, '/dashboard');
  exception when others then
    null;
  end;
  return new;
end
$fn$;

drop trigger if exists signout_returned_notify on public.signout_requests;
create trigger signout_returned_notify
  after update of status on public.signout_requests
  for each row execute function public._signout_returned_notify();

-- ── B. Access request email ─────────────────────────────────────────────────

create or replace function public._access_request_notify()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_subject text; v_body text; v_who text;
begin
  if new.status <> 'pending' then return new; end if;
  begin
    v_subject := 'Techmen 5669: access request from ' || new.email;
    -- At most one a day per requesting address.
    if exists (select 1 from public.notice_outbox o
                where o.kind = 'access_request' and o.subject = v_subject and o.created_at > now() - interval '1 day') then
      return new;
    end if;
    v_who := coalesce(nullif(btrim(coalesce(new.full_name, '')), ''), new.email);
    v_body := v_who || ' (' || new.email || ') asked for access'
              || coalesce(' as ' || new.requested_role, '') || '.'
              || coalesce(chr(10) || chr(10) || 'Their note: ' || nullif(btrim(coalesce(new.note, '')), ''), '')
              || chr(10) || chr(10) || 'Approve or deny: https://frc-app-liard.vercel.app/access-requests';
    insert into public.notice_outbox (to_email, subject, body, kind)
    select lower(u.email), v_subject, v_body, 'access_request'
      from public.member_roles r join auth.users u on u.id = r.member_id
     where r.role = 'admin' and u.email is not null
     group by lower(u.email);
    insert into public.member_notices (member_id, kind, title, body)
    select distinct r.member_id, 'access_request', 'Access request from ' || v_who, v_body
      from public.member_roles r where r.role = 'admin';
  exception when others then
    null;
  end;
  return new;
end
$fn$;

drop trigger if exists access_request_notify on public.access_requests;
create trigger access_request_notify
  after insert on public.access_requests
  for each row execute function public._access_request_notify();

-- ── C. Feedback replies ─────────────────────────────────────────────────────

create table if not exists public.feedback_replies (
  id          uuid        primary key default gen_random_uuid(),
  feedback_id uuid        not null references public.feedback(id) on delete cascade,
  author_id   uuid        references public.profiles(id) on delete set null,
  body        text        not null check (body ~ '\S' and char_length(body) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_replies_feedback_idx on public.feedback_replies (feedback_id, created_at);
alter table public.feedback_replies enable row level security;
revoke all on table public.feedback_replies from public, anon, authenticated;

-- Does: Answer a feedback report; the member who sent it is told in the app, by email and by push.
create or replace function public.feedback_reply(p_feedback uuid, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = public as $fn$
declare f public.feedback; v_body text := btrim(coalesce(p_body, '')); r public.feedback_replies; v_to text; v_excerpt text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can answer feedback' using errcode = '42501';
  end if;
  if v_body = '' or char_length(v_body) > 2000 then
    raise exception 'Write an answer of up to 2000 characters' using errcode = '22023';
  end if;
  select * into f from public.feedback where id = p_feedback;
  if not found then raise exception 'No such report' using errcode = 'P0002'; end if;

  insert into public.feedback_replies (feedback_id, author_id, body)
  values (p_feedback, auth.uid(), v_body) returning * into r;
  -- An answer is a look: a New report becomes Seen.
  update public.feedback set status = 'seen', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_feedback and status = 'new';

  if f.member_id is not null and f.member_id is distinct from auth.uid() then
    v_excerpt := left(regexp_replace(f.message, '\s+', ' ', 'g'), 140);
    insert into public.member_notices (member_id, kind, title, body, created_by)
    values (f.member_id, 'feedback_reply', 'Answer to your feedback', v_body, auth.uid());
    v_to := lower((select email from auth.users where id = f.member_id));
    if v_to is not null then
      insert into public.notice_outbox (to_email, subject, body, member_id, kind)
      values (v_to, 'Techmen 5669: answer to your feedback',
              v_body || chr(10) || chr(10) || 'You wrote: ' || v_excerpt
              || chr(10) || chr(10) || 'See all your reports under the feedback button in the app.',
              f.member_id, 'feedback_reply');
    end if;
    perform public._push_one(f.member_id, 'feedback_reply', 'feedback_reply', r.id::text,
                             'Answer to your feedback', left(v_body, 180), '/dashboard?feedback=mine');
  end if;
  return jsonb_build_object('id', r.id, 'feedback_id', r.feedback_id, 'body', r.body, 'created_at', r.created_at);
end
$fn$;

-- Does: The answers on some feedback reports, oldest first, for the admin inbox.
create or replace function public.feedback_replies_for(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can read the inbox' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'feedback_id', r.feedback_id, 'body', r.body, 'created_at', r.created_at,
                                        'author', coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.full_name), ''), 'Admin'))
                     order by r.created_at)
      from public.feedback_replies r left join public.profiles p on p.id = r.author_id
     where r.feedback_id = any(coalesce(p_ids, '{}'::uuid[]))), '[]'::jsonb);
end
$fn$;

-- Does: The signed-in member own feedback reports, newest first, each with its status and every answer.
create or replace function public.my_feedback()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'created_at' desc) from (
      select jsonb_build_object(
               'id', f.id, 'created_at', f.created_at, 'route', f.route, 'category', f.category,
               'message', left(f.message, 600), 'status', f.status,
               'replies', coalesce((select jsonb_agg(jsonb_build_object('body', r.body, 'created_at', r.created_at) order by r.created_at)
                                      from public.feedback_replies r where r.feedback_id = f.id), '[]'::jsonb)) as x
        from public.feedback f
       where f.member_id = auth.uid()
       order by f.created_at desc
       limit 50) s), '[]'::jsonb);
end
$fn$;

-- The account merge (0020) must know every column that names a member, and
-- refuses to run while one is unknown. 0022 last replaced this list; it is
-- copied here with feedback_replies.author_id added (an answer moves with its
-- author). Re-pasting 0020 or 0022 after this file drops that row; paste 0024
-- again after either.
create or replace function public._merge_member_rules()
returns table (tbl text, col text, rule text) language sql immutable set search_path = public as $fn$
  select x.tbl, x.col, x.rule from (values
    ('profiles', 'id', 'profile'),
    ('scouting_records', 'member_id', 'keep'),
    ('scouting_revisions', 'member_id', 'keep'),
    ('scouting_revisions', 'changed_by', 'keep'),
    ('scouting_operations', 'member_id', 'keep'),
    ('member_roles', 'member_id', 'roles'),
    ('member_permissions', 'member_id', 'grants'),
    ('member_permissions', 'granted_by', 'move'),
    ('connector_codes', 'user_id', 'drop'),
    ('connector_tokens', 'user_id', 'drop'),
    ('connector_confirmations', 'user_id', 'drop'),
    ('connector_audit', 'user_id', 'keep'),
    ('connector_audit', 'undone_by', 'keep'),
    ('connector_settings', 'allowed_member', 'refuse'),
    ('connector_settings', 'updated_by', 'move'),
    ('member_admin_log', 'member_id', 'keep'),
    ('member_admin_log', 'actor_id', 'keep'),
    ('absence_requests', 'member_id', 'move'),
    ('absence_requests', 'decided_by', 'move'),
    ('access_requests', 'reviewed_by', 'move'),
    ('allowed_domains', 'added_by', 'move'),
    ('approved_emails', 'added_by', 'move'),
    ('attendance_audit', 'member_id', 'move'),
    ('attendance_audit', 'actor_id', 'move'),
    ('attendance_events', 'user_id', 'move'),
    ('attendance_events', 'overridden_by', 'move'),
    ('cert_requests', 'member_id', 'move'),
    ('cert_requests', 'reviewed_by', 'move'),
    ('discipline_records', 'member_id', 'move'),
    ('discipline_records', 'created_by', 'move'),
    ('discipline_records', 'appeal_by', 'move'),
    ('discord_announce_roles', 'created_by', 'move'),
    ('discord_announcements', 'sent_by', 'move'),
    ('driver_documents', 'owner_id', 'move'),
    ('driver_document_views', 'viewer_id', 'move'),
    ('event_attendance', 'member_id', 'move'),
    ('event_attendance', 'marked_by', 'move'),
    ('event_roles', 'member_id', 'move'),
    ('event_roles', 'assigned_by', 'move'),
    ('event_rosters', 'posted_by', 'move'),
    ('event_signup_reminders', 'student_id', 'move'),
    ('event_signup_reminders', 'reminded_by', 'move'),
    ('event_signups', 'member_id', 'move'),
    ('events', 'created_by', 'move'),
    ('feedback', 'member_id', 'move'),
    ('feedback', 'reviewed_by', 'move'),
    ('feedback_replies', 'author_id', 'move'),
    ('fll_mentors', 'member_id', 'move'),
    ('grade_checks', 'member_id', 'move'),
    ('grade_checks', 'set_by', 'move'),
    ('guardian_links', 'parent_id', 'move'),
    ('guardian_links', 'student_id', 'move'),
    ('guardian_links', 'created_by', 'move'),
    ('handbook_acknowledgments', 'member_id', 'move'),
    ('handbook_versions', 'published_by', 'move'),
    ('hour_adjustments', 'member_id', 'move'),
    ('hour_adjustments', 'created_by', 'move'),
    ('hour_goals', 'member_id', 'move'),
    ('hour_goals', 'updated_by', 'move'),
    ('hub_cars', 'minor_override_by', 'move'),
    ('hub_days', 'captain_id', 'move'),
    ('hub_events', 'created_by', 'move'),
    ('hub_invites', 'student_id', 'move'),
    ('hub_responses', 'driver_paperwork_by', 'move'),
    ('hub_responses', 'staff_updated_by', 'move'),
    ('hub_seats', 'placed_by', 'move'),
    ('incident_reports', 'member_id', 'move'),
    ('incident_reports', 'reported_by', 'move'),
    ('incident_reports', 'closed_by', 'move'),
    ('letter_contributions', 'member_id', 'move'),
    ('letter_contributions', 'confirmed_by', 'move'),
    ('logged_hours', 'member_id', 'move'),
    ('logged_hours', 'reviewed_by', 'move'),
    ('logged_hours', 'verified_by', 'move'),
    ('logged_hours_corrections', 'member_id', 'move'),
    ('logged_hours_corrections', 'reviewed_by', 'move'),
    ('media_exceptions', 'member_id', 'move'),
    ('media_exceptions', 'set_by', 'move'),
    ('meeting_checkins', 'member_id', 'move'),
    ('member_applications', 'member_id', 'move'),
    ('member_conflicts', 'member_id', 'move'),
    ('member_medical', 'member_id', 'move'),
    ('member_medical', 'updated_by', 'move'),
    ('member_notices', 'member_id', 'move'),
    ('member_notices', 'created_by', 'move'),
    ('member_skills', 'member_id', 'move'),
    ('member_skills', 'certified_by', 'move'),
    ('notice_outbox', 'member_id', 'move'),
    ('notifications_sent', 'member_id', 'move'),
    ('onboarding_items', 'member_id', 'move'),
    ('onboarding_items', 'marked_by', 'move'),
    ('parent_acknowledgments', 'member_id', 'move'),
    ('parent_link_requests', 'parent_id', 'move'),
    ('parent_link_requests', 'student_id', 'move'),
    ('parent_link_requests', 'reviewed_by', 'move'),
    ('position_assignments', 'member_id', 'move'),
    ('position_assignments', 'assigned_by', 'move'),
    ('push_subscriptions', 'member_id', 'move'),
    ('safety_violations', 'member_id', 'move'),
    ('safety_violations', 'logged_by', 'move'),
    ('session_corrections', 'member_id', 'move'),
    ('session_corrections', 'reviewed_by', 'move'),
    ('session_reviews', 'user_id', 'move'),
    ('session_reviews', 'reviewed_by', 'move'),
    ('signout_requests', 'member_id', 'move'),
    ('signout_requests', 'decided_by', 'move'),
    ('standing_months', 'member_id', 'move'),
    ('standing_records', 'member_id', 'move'),
    ('standing_records', 'confirmed_by', 'move'),
    ('standing_settings', 'updated_by', 'move'),
    ('standing_weeks', 'member_id', 'move'),
    ('study_sessions', 'member_id', 'move'),
    ('subteam_status_reports', 'reported_by', 'move'),
    ('surveys', 'created_by', 'move'),
    ('survey_responses', 'member_id', 'move'),
    ('task_claims', 'member_id', 'move'),
    ('task_claims', 'verified_by', 'move'),
    ('task_idea_cert_requirements', 'set_by', 'move'),
    ('task_updates', 'member_id', 'move'),
    ('tasks', 'claimed_by', 'move'),
    ('tasks', 'created_by', 'move'),
    ('tasks', 'verified_by', 'move'),
    ('team_weeks', 'posted_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated;

revoke all on function public._push_one(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public._signout_returned_notify() from public, anon, authenticated;
revoke all on function public._access_request_notify() from public, anon, authenticated;
revoke all on function public.feedback_reply(uuid, text) from public, anon, authenticated;
revoke all on function public.feedback_replies_for(uuid[]) from public, anon, authenticated;
revoke all on function public.my_feedback() from public, anon, authenticated;
grant execute on function public.feedback_reply(uuid, text) to authenticated;
grant execute on function public.feedback_replies_for(uuid[]) to authenticated;
grant execute on function public.my_feedback() to authenticated;
