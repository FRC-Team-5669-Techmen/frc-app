-- ============================================================
-- 0033_human_player_leaderboard: human player drill attempts for the human
-- player leaderboard at /human-player (ledger 0025)
--
-- Applied by the Migrate workflow after 0031 (and 0032 when it exists), or
-- pasted once in the Supabase SQL editor. Re-runnable: the table and indexes
-- are "if not exists", functions are create or replace, every policy is
-- dropped (by the name this file gives it) and created again.
--
-- WHY. Mr. Pina wants to rank who the best human player is, in a way that
-- predicts who scores the most FUEL at a real competition. Three drills, every
-- attempt logged: accuracy (a fixed set of shots), rate (a timed burst) and a
-- match run on the real match clock with the HUB going active and inactive.
--
-- WHAT THIS ADDS.
--   hp_attempts   one row per attempt: the player, the date (LA calendar
--                 date), the drill (accuracy, rate, match), FUEL made (in a
--                 match run, made while the HUB was active), shots attempted
--                 (every shot, made or missed, active or inactive), made while
--                 the HUB was inactive (match runs only), seconds (rate and
--                 match), the alliance and the alliance inactive first (match
--                 runs only), notes, who logged it, and a void (who, when,
--                 why). A voided attempt stays in the table and counts for
--                 nothing.
-- The Human Player Score is computed in ONE place, src/humanPlayerScore.js.
-- This file stores facts; it does not score.
--
-- WHO.
--   read     approved, active students and staff. Parent-only accounts read
--            nothing (a parent who is also staff is staff). Signed out reads
--            nothing.
--   log      a student logs their own attempts, within 60 days; staff log for
--            any approved active student or staff member (hp_log_attempt).
--   edit     staff (hp_edit_attempt).
--   void     staff any time; the player their own attempt for 24 hours after
--            it was logged (hp_void_attempt).
-- No client may insert, update or delete the table directly: every write is
-- one of the functions below (decision 0019, src/writeVia.js).
--
-- TO UNDO (before any real data is in it): drop function
-- public.hp_log_attempt(uuid, date, text, integer, integer, integer, integer, text, text, text),
-- public.hp_edit_attempt(uuid, date, integer, integer, integer, integer, text),
-- public.hp_void_attempt(uuid, text), public._hp_member_ok(), public._hp_target_ok(uuid),
-- public._hp_check(text, date, integer, integer, integer, integer, text, text, text);
-- drop table public.hp_attempts; then paste _merge_member_rules from 0031 again.
-- ============================================================

do $prereq$
begin
  if to_regclass('public.member_roles') is null or to_regclass('public.profiles') is null then
    raise exception '0033 needs the frozen foundation (profiles, member_roles) applied first';
  end if;
end
$prereq$;

create table if not exists public.hp_attempts (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.profiles(id) on delete restrict,
  attempt_date    date not null,
  drill           text not null check (drill in ('accuracy', 'rate', 'match')),
  made            integer not null check (made between 0 and 1000),
  attempted       integer not null check (attempted between 1 and 1000),
  made_inactive   integer not null default 0 check (made_inactive between 0 and 1000),
  seconds         integer check (seconds is null or seconds between 5 and 600),
  alliance        text check (alliance is null or alliance in ('red', 'blue')),
  inactive_first  text check (inactive_first is null or inactive_first in ('red', 'blue')),
  notes           text check (notes is null or length(notes) <= 1000),
  logged_by       uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  voided_at       timestamptz,
  voided_by       uuid references public.profiles(id) on delete set null,
  void_reason     text check (void_reason is null or length(void_reason) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint hp_attempts_made_fits check (made + made_inactive <= attempted)
);
create index if not exists hp_attempts_member_idx on public.hp_attempts (member_id, attempt_date desc);
create index if not exists hp_attempts_date_idx on public.hp_attempts (attempt_date);

-- Who may use the human player leaderboard: approved, active, a student or
-- staff, and not a parent-only account. Same shape as the driver leaderboard
-- (0029), written here so this file does not depend on it.
create or replace function public._hp_member_ok()
returns boolean language sql stable security definer set search_path = public as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.approved and coalesce(p.status, 'active') = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin'))
       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')
            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));
$fn$;
revoke all on function public._hp_member_ok() from public, anon;
grant execute on function public._hp_member_ok() to authenticated;

-- A member an attempt may be about: approved, active, and a student or staff member.
create or replace function public._hp_target_ok(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.profiles p
     where p.id = p_member and p.approved and coalesce(p.status, 'active') = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin')));
$fn$;
revoke all on function public._hp_target_ok(uuid) from public, anon, authenticated;

alter table public.hp_attempts enable row level security;
-- The bootstrap default privileges hand authenticated everything on a new
-- table, and a missing policy fails at 0 rows rather than raising: revoke the
-- writes outright so a direct write is refused, not silently empty.
revoke all on public.hp_attempts from public, anon, authenticated;
grant select on public.hp_attempts to authenticated;
drop policy if exists hp_attempts_read on public.hp_attempts;
create policy hp_attempts_read on public.hp_attempts for select to authenticated using ((select public._hp_member_ok()));

create or replace function public._hp_check(p_drill text, p_date date, p_made integer, p_attempted integer, p_made_inactive integer,
  p_seconds integer, p_alliance text, p_inactive_first text, p_notes text)
returns void language plpgsql stable set search_path = public as $fn$
begin
  if p_drill is null or p_drill not in ('accuracy', 'rate', 'match') then
    raise exception 'The drill is accuracy, rate or match.' using errcode = '22023'; end if;
  if p_made is null or p_made < 0 or p_made > 1000 then
    raise exception 'Made is a whole number from 0 to 1000.' using errcode = '22023'; end if;
  if p_attempted is null or p_attempted < 1 or p_attempted > 1000 then
    raise exception 'Shots taken is a whole number from 1 to 1000.' using errcode = '22023'; end if;
  if p_made_inactive is null or p_made_inactive < 0 then
    raise exception 'Made while inactive is 0 or more.' using errcode = '22023'; end if;
  if p_made + p_made_inactive > p_attempted then
    raise exception 'More made than shots taken.' using errcode = '22023'; end if;
  if p_drill = 'accuracy' and (p_attempted > 200 or p_seconds is not null) then
    raise exception 'An accuracy set is at most 200 shots, with no clock.' using errcode = '22023'; end if;
  if p_drill <> 'accuracy' and (p_seconds is null or p_seconds < 5 or p_seconds > 600) then
    raise exception 'Seconds are between 5 and 600.' using errcode = '22023'; end if;
  if p_drill <> 'match' and (p_made_inactive <> 0 or p_alliance is not null or p_inactive_first is not null) then
    raise exception 'Made while inactive and the HUB order are for a match run only.' using errcode = '22023'; end if;
  if p_alliance is not null and p_alliance not in ('red', 'blue') then
    raise exception 'The alliance is red or blue.' using errcode = '22023'; end if;
  if p_inactive_first is not null and p_inactive_first not in ('red', 'blue') then
    raise exception 'The alliance inactive first is red or blue.' using errcode = '22023'; end if;
  if p_date is null or p_date > (now() at time zone 'America/Los_Angeles')::date + 1 or p_date < date '2015-01-01' then
    raise exception 'The date is today or earlier.' using errcode = '22023'; end if;
  if p_notes is not null and length(p_notes) > 1000 then
    raise exception 'Notes are at most 1000 characters.' using errcode = '22023'; end if;
end
$fn$;
revoke all on function public._hp_check(text, date, integer, integer, integer, integer, text, text, text) from public, anon, authenticated;

-- Does: Log a human player drill attempt: accuracy (made of a fixed set of shots), rate (made in a timed burst) or a match run (made while the HUB was active, made while inactive, shots). Students log their own; staff log for anyone.
create or replace function public.hp_log_attempt(p_member uuid default null, p_date date default null, p_drill text default null,
  p_made integer default null, p_attempted integer default null, p_made_inactive integer default 0, p_seconds integer default null,
  p_alliance text default null, p_inactive_first text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare a public.hp_attempts; v_member uuid := coalesce(p_member, auth.uid()); v_date date := coalesce(p_date, (now() at time zone 'America/Los_Angeles')::date);
begin
  if not public._hp_member_ok() then raise exception 'The human player leaderboard is for approved students and staff.' using errcode = '42501'; end if;
  if v_member <> auth.uid() and not public.is_staff() then
    raise exception 'You log your own attempts. A mentor can log them for someone else.' using errcode = '42501'; end if;
  if not public._hp_target_ok(v_member) then raise exception 'That member is not an approved, active student or staff member.' using errcode = '22023'; end if;
  perform public._hp_check(p_drill, v_date, p_made, p_attempted, coalesce(p_made_inactive, 0), p_seconds, p_alliance, p_inactive_first, p_notes);
  if not public.is_staff() and v_date < (now() at time zone 'America/Los_Angeles')::date - 60 then
    raise exception 'Log an attempt within 60 days. Ask a mentor for anything older.' using errcode = '22023'; end if;
  insert into public.hp_attempts (member_id, attempt_date, drill, made, attempted, made_inactive, seconds, alliance, inactive_first, notes, logged_by, updated_by)
  values (v_member, v_date, p_drill, p_made, p_attempted, coalesce(p_made_inactive, 0), p_seconds, p_alliance, p_inactive_first, nullif(btrim(p_notes), ''), auth.uid(), auth.uid())
  returning * into a;
  return to_jsonb(a);
end
$fn$;

-- Does: Correct a logged human player attempt: its date, made, shots, made while inactive, seconds or notes (the drill stays). Staff only.
create or replace function public.hp_edit_attempt(p_attempt uuid, p_date date, p_made integer, p_attempted integer,
  p_made_inactive integer default 0, p_seconds integer default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare a public.hp_attempts;
begin
  if not public.is_staff() or not public._hp_member_ok() then raise exception 'Only staff can change an attempt.' using errcode = '42501'; end if;
  select * into a from public.hp_attempts where id = p_attempt for update;
  if a.id is null then raise exception 'No such attempt.' using errcode = 'P0002'; end if;
  perform public._hp_check(a.drill, p_date, p_made, p_attempted, coalesce(p_made_inactive, 0), p_seconds, a.alliance, a.inactive_first, p_notes);
  update public.hp_attempts set attempt_date = p_date, made = p_made, attempted = p_attempted, made_inactive = coalesce(p_made_inactive, 0),
         seconds = p_seconds, notes = nullif(btrim(p_notes), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_attempt returning * into a;
  return to_jsonb(a);
end
$fn$;

-- Does: Void a human player attempt so it counts for nothing (it stays on the record). Staff any time; the player for 24 hours after logging it.
create or replace function public.hp_void_attempt(p_attempt uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare a public.hp_attempts;
begin
  if not public._hp_member_ok() then raise exception 'The human player leaderboard is for approved students and staff.' using errcode = '42501'; end if;
  select * into a from public.hp_attempts where id = p_attempt for update;
  if a.id is null then raise exception 'No such attempt.' using errcode = 'P0002'; end if;
  if not public.is_staff() and (a.member_id <> auth.uid() or a.created_at < now() - interval '24 hours') then
    raise exception 'You can void your own attempt for 24 hours after logging it. Ask a mentor after that.' using errcode = '42501'; end if;
  if a.voided_at is not null then raise exception 'That attempt is already void.' using errcode = '22023'; end if;
  if p_reason is not null and length(p_reason) > 300 then raise exception 'A reason is at most 300 characters.' using errcode = '22023'; end if;
  update public.hp_attempts set voided_at = now(), voided_by = auth.uid(), void_reason = nullif(btrim(p_reason), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_attempt returning * into a;
  return to_jsonb(a);
end
$fn$;

revoke all on function public.hp_log_attempt(uuid, date, text, integer, integer, integer, integer, text, text, text) from public, anon;
revoke all on function public.hp_edit_attempt(uuid, date, integer, integer, integer, integer, text) from public, anon;
revoke all on function public.hp_void_attempt(uuid, text) from public, anon;
grant execute on function public.hp_log_attempt(uuid, date, text, integer, integer, integer, integer, text, text, text) to authenticated;
grant execute on function public.hp_edit_attempt(uuid, date, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.hp_void_attempt(uuid, text) to authenticated;

-- The connector (0018, 0021) records the rows a call wrote from the tables it
-- lists. Skipped when the connector is not applied.
do $connector$
begin
  if to_regclass('public.connector_log_tables') is not null then
    insert into public.connector_log_tables (table_name, note) values ('hp_attempts', 'Human player attempts (0033)')
    on conflict (table_name) do nothing;
  end if;
end
$connector$;

-- The account merge (0020) must know every column that names a member. 0031
-- last replaced this list; it is copied here with the four hp_attempts
-- columns added. Paste 0033 again after any re-paste of 0020, 0022, 0024,
-- 0026, 0028, 0029 or 0031.
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
    ('team_weeks', 'posted_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated;
