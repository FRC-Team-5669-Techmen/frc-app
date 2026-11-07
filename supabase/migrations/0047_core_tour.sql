-- Guided core training. Additive and re-runnable. Applied by migrate.yml.
-- Self-reported completion, never a certification or a permission grant.
-- Rollback: remove the UI entry point first, then drop the two functions and
-- table below and restore _merge_member_rules from 0038. Completion history
-- would be lost, so export it before dropping the table.
create table if not exists public.tour_completions (
 member_id uuid not null references public.profiles(id) on delete cascade,
 core_version integer not null check (core_version = 1),
 track text not null check (track in ('member','scout','driver','pit','mentor','parent')),
 completed_at timestamptz not null default now(),
 primary key (member_id, core_version)
);
alter table public.tour_completions enable row level security;
revoke all on table public.tour_completions from public, anon, authenticated, service_role;
grant select on table public.tour_completions to authenticated;
drop policy if exists "tour completion read" on public.tour_completions;
create policy "tour completion read" on public.tour_completions for select to authenticated
using (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved and p.status='active')
 and (member_id=(select auth.uid()) or public.is_staff())
);

-- Does: Record completion of the current core walkthrough for the caller only.
-- No member argument: the caller can only complete their own core.
create or replace function public.tour_complete_core(p_track text, p_version integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare r public.tour_completions; staff boolean;
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.status='active'
   and exists(select 1 from public.member_roles mr where mr.member_id=p.id and mr.role in ('student','parent','mentor','lead','admin')))
 then raise exception using errcode='42501',message='An active approved team account is required.'; end if;
 staff := public.is_staff();
 if p_version is distinct from 1 or p_track is null or p_track not in ('member','scout','driver','pit','mentor','parent') then
  raise exception using errcode='22023',message='Choose a current training track.';
 end if;
 if (p_track='mentor' and not staff)
 or (not staff and public.has_role('parent') and p_track<>'parent')
 or (p_track='parent' and (staff or not public.has_role('parent'))) then
  raise exception using errcode='42501',message='Choose a track available to your account.';
 end if;
 insert into public.tour_completions(member_id,core_version,track) values(auth.uid(),p_version,p_track)
 on conflict(member_id,core_version) do nothing;
 select * into r from public.tour_completions where member_id=auth.uid() and core_version=p_version;
 return to_jsonb(r);
end
$fn$;

-- Does: Read current core training completion and unfinished active members, for staff only.
create or replace function public.tour_completion_overview(p_version integer)
returns table(member_id uuid,name text,track text,completed_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog as $fn$
begin
 if not public.is_staff() or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.status='active') then
  raise exception using errcode='42501',message='Only active team staff can read training progress.';
 end if;
 if p_version is distinct from 1 then raise exception using errcode='22023',message='Choose the current core version.'; end if;
 return query select p.id,coalesce(nullif(p.nickname,''),p.full_name),c.track,c.completed_at
 from public.profiles p left join public.tour_completions c on c.member_id=p.id and c.core_version=p_version
 where p.approved and p.status='active' and exists(select 1 from public.member_roles mr where mr.member_id=p.id and mr.role in ('student','parent','mentor','lead','admin'))
 order by coalesce(nullif(p.nickname,''),p.full_name),p.id;
end
$fn$;
revoke all on function public.tour_complete_core(text,integer), public.tour_completion_overview(integer) from public, anon, authenticated, service_role;
grant execute on function public.tour_complete_core(text,integer), public.tour_completion_overview(integer) to authenticated;

-- Keep account merge coverage complete. Existing kept-account completion wins.
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
    ('auto_routines', 'created_by', 'move'),
    ('auto_routines', 'updated_by', 'move'),
    ('auto_runs', 'member_id', 'move'),
    ('auto_runs', 'updated_by', 'move'),
    ('batteries', 'charge_set_by', 'move'),
    ('batteries', 'created_by', 'move'),
    ('batteries', 'updated_by', 'move'),
    ('battery_runs', 'member_id', 'move'),
    ('battery_runs', 'updated_by', 'move'),
    ('cert_requests', 'member_id', 'move'),
    ('cert_requests', 'reviewed_by', 'move'),
    ('discipline_records', 'member_id', 'move'),
    ('discipline_records', 'created_by', 'move'),
    ('discipline_records', 'appeal_by', 'move'),
    ('discord_announce_roles', 'created_by', 'move'),
    ('discord_announcements', 'sent_by', 'move'),
    ('drive_sessions', 'member_id', 'move'),
    ('drive_sessions', 'logged_by', 'move'),
    ('drive_sessions', 'updated_by', 'move'),
    ('drive_sessions', 'voided_by', 'move'),
    ('driver_ratings', 'driver_id', 'move'),
    ('driver_ratings', 'coach_id', 'move'),
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
    ('hp_attempts', 'member_id', 'move'),
    ('hp_attempts', 'logged_by', 'move'),
    ('hp_attempts', 'updated_by', 'move'),
    ('hp_attempts', 'voided_by', 'move'),
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
    ('event_match_clock', 'set_by', 'move'),
    ('role_requests', 'member_id', 'move'),
    ('role_requests', 'status_by', 'move'),
    ('role_slot_templates', 'created_by', 'move'),
    ('role_slots', 'created_by', 'move'),
    ('safety_violations', 'member_id', 'move'),
    ('safety_violations', 'logged_by', 'move'),
    ('session_corrections', 'member_id', 'move'),
    ('session_corrections', 'reviewed_by', 'move'),
    ('session_reviews', 'user_id', 'move'),
    ('session_reviews', 'reviewed_by', 'move'),
    ('signout_requests', 'member_id', 'move'),
    ('signout_requests', 'decided_by', 'move'),
    ('sim_matches', 'member_id', 'move'),
    ('sim_matches', 'driver_id', 'move'),
    ('sim_matches', 'operator_id', 'move'),
    ('sim_matches', 'human_player_id', 'move'),
    ('sim_matches', 'drive_coach_id', 'move'),
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
    ('team_weeks', 'posted_by', 'move'),
    ('team_connections', 'member_id', 'move'),
    ('team_connections', 'updated_by', 'move'),
    ('scouting_options', 'requested_by', 'move'),
    ('scouting_options', 'decided_by', 'move'),
    ('robot_matches', 'driver_id', 'move'),
    ('robot_matches', 'operator_id', 'move'),
    ('robot_matches', 'coach_id', 'move'),
    ('robot_matches', 'human_player_id', 'move'),
    ('robot_matches', 'created_by', 'move'),
    ('robot_matches', 'updated_by', 'move'),
    ('tour_completions', 'member_id', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated, service_role;
