-- ============================================================
-- 0029_driver_leaderboard: drive time and coach ratings for the driver
-- leaderboard at /drivers (ledger 0020)
--
-- Run once in the Supabase SQL editor, AFTER 0028. Re-runnable: tables and
-- indexes are "if not exists", functions are create or replace, every policy
-- is dropped (by the name this file gives it) and created again.
--
-- WHY. Choosing a driver should rest on a record, not on memory: who has
-- driven the real robot and for how long, who has practiced in MoSim (the
-- FRC driving simulator), and what the coaches saw. The record is kept across
-- seasons; the page scores one season at a time.
--
-- WHAT THIS ADDS.
--   drive_sessions   one row per session: the driver, the date (LA calendar
--                    date), minutes, kind (practice_field, match, test on the
--                    real robot; mosim in the simulator), an optional MoSim
--                    score, notes, who logged it, and a void (who, when, why).
--                    A voided session stays in the table and counts for
--                    nothing.
--   driver_ratings   one row per coach rating: the driver, the coach, five
--                    criteria from 1 to 5 (control, awareness, scoring,
--                    defense, consistency; a criterion not seen is NULL, at
--                    least one is given), a note, when. Ratings are history:
--                    the newest rating per coach is the one that counts, and
--                    that choice is made in src/driverScore.js, not here.
--   driver_rating_scores()   every rating WITHOUT its note, for the
--                    leaderboard. The note is read only by staff and by the
--                    driver it is about.
-- The Driver Score itself is computed in ONE place, src/driverScore.js. This
-- file stores facts; it does not score.
--
-- WHO.
--   read sessions   approved, active students and staff. Parent-only
--                   accounts read nothing (a parent who is also staff is
--                   staff). Signed out reads nothing.
--   read ratings    staff read every rating; a student reads the ratings
--                   about them. Everyone eligible reads the scores without
--                   notes through driver_rating_scores().
--   log             a student logs their own sessions; staff log for any
--                   approved active student or staff member
--                   (driver_log_session).
--   edit            staff (driver_edit_session).
--   void            staff any time; the driver their own session for 24
--                   hours after it was logged (driver_void_drive).
--   rate            staff, never themselves (driver_rate).
-- No client may insert, update or delete either table directly: every write
-- is one of the functions below (decision 0019, src/writeVia.js).
--
-- TO UNDO (before any real data is in it): drop function
-- public.driver_log_session(uuid, date, integer, text, integer, text),
-- public.driver_edit_session(uuid, date, integer, text, integer, text),
-- public.driver_void_drive(uuid, text),
-- public.driver_rate(uuid, integer, integer, integer, integer, integer, text),
-- public.driver_rating_scores(), public._driver_member_ok(),
-- public._driver_target_ok(uuid), public._driver_check_session(date, integer, text, integer, text);
-- drop table public.driver_ratings, public.drive_sessions; then paste
-- _merge_member_rules from 0028 again.
-- ============================================================

do $prereq$
begin
  if to_regclass('public.member_roles') is null or to_regclass('public.profiles') is null then
    raise exception '0029 needs the frozen foundation (profiles, member_roles) applied first';
  end if;
end
$prereq$;

create table if not exists public.drive_sessions (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.profiles(id) on delete restrict,
  session_date  date not null,
  minutes       integer not null check (minutes between 1 and 600),
  kind          text not null check (kind in ('practice_field', 'match', 'test', 'mosim')),
  sim_score     integer check (sim_score is null or sim_score between 0 and 100000),
  notes         text check (notes is null or length(notes) <= 1000),
  logged_by     uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  voided_at     timestamptz,
  voided_by     uuid references public.profiles(id) on delete set null,
  void_reason   text check (void_reason is null or length(void_reason) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint drive_sessions_score_mosim check (sim_score is null or kind = 'mosim')
);
create index if not exists drive_sessions_member_idx on public.drive_sessions (member_id, session_date desc);
create index if not exists drive_sessions_date_idx on public.drive_sessions (session_date);

create table if not exists public.driver_ratings (
  id            uuid primary key default gen_random_uuid(),
  driver_id     uuid not null references public.profiles(id) on delete restrict,
  coach_id      uuid not null references public.profiles(id) on delete restrict,
  control       smallint check (control is null or control between 1 and 5),
  awareness     smallint check (awareness is null or awareness between 1 and 5),
  scoring       smallint check (scoring is null or scoring between 1 and 5),
  defense       smallint check (defense is null or defense between 1 and 5),
  consistency   smallint check (consistency is null or consistency between 1 and 5),
  note          text check (note is null or length(note) <= 1000),
  rated_at      timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint driver_ratings_one_criterion check (coalesce(control, awareness, scoring, defense, consistency) is not null),
  constraint driver_ratings_not_self check (driver_id <> coach_id)
);
create index if not exists driver_ratings_driver_idx on public.driver_ratings (driver_id, rated_at desc);

-- Who may use the driver leaderboard: approved, active, a student or staff,
-- and not a parent-only account. Same shape as the battery log (0026),
-- written here so this file does not depend on it.
create or replace function public._driver_member_ok()
returns boolean language sql stable security definer set search_path = public as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.approved and coalesce(p.status, 'active') = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin'))
       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')
            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));
$fn$;
revoke all on function public._driver_member_ok() from public, anon;
grant execute on function public._driver_member_ok() to authenticated;

-- A member a session or rating may be about: approved, active, and a student
-- or staff member.
create or replace function public._driver_target_ok(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.profiles p
     where p.id = p_member and p.approved and coalesce(p.status, 'active') = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin')));
$fn$;
revoke all on function public._driver_target_ok(uuid) from public, anon, authenticated;

alter table public.drive_sessions enable row level security;
alter table public.driver_ratings enable row level security;
-- The bootstrap default privileges hand authenticated everything on a new
-- table, and a missing policy fails at 0 rows rather than raising: revoke the
-- writes outright so a direct write is refused, not silently empty.
revoke all on public.drive_sessions, public.driver_ratings from public, anon, authenticated;
grant select on public.drive_sessions, public.driver_ratings to authenticated;
drop policy if exists drive_sessions_read on public.drive_sessions;
create policy drive_sessions_read on public.drive_sessions for select to authenticated using ((select public._driver_member_ok()));
drop policy if exists driver_ratings_read on public.driver_ratings;
create policy driver_ratings_read on public.driver_ratings for select to authenticated
  using ((select public._driver_member_ok()) and ((select public.is_staff()) or driver_id = (select auth.uid())));

-- Does: Read every coach rating on the driver leaderboard, the five criteria and when, without the coach notes.
create or replace function public.driver_rating_scores()
returns table (id uuid, driver_id uuid, coach_id uuid, control smallint, awareness smallint, scoring smallint,
               defense smallint, consistency smallint, rated_at timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public._driver_member_ok() then raise exception 'The driver leaderboard is for approved students and staff.' using errcode = '42501'; end if;
  return query select r.id, r.driver_id, r.coach_id, r.control, r.awareness, r.scoring, r.defense, r.consistency, r.rated_at
                 from public.driver_ratings r order by r.rated_at desc;
end
$fn$;

create or replace function public._driver_check_session(p_date date, p_minutes integer, p_kind text, p_score integer, p_notes text)
returns void language plpgsql stable set search_path = public as $fn$
begin
  if p_kind is null or p_kind not in ('practice_field', 'match', 'test', 'mosim') then
    raise exception 'Kind is practice_field, match, test or mosim.' using errcode = '22023'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 600 then
    raise exception 'Minutes are between 1 and 600.' using errcode = '22023'; end if;
  if p_score is not null and p_kind <> 'mosim' then
    raise exception 'A score is for a MoSim session only.' using errcode = '22023'; end if;
  if p_score is not null and (p_score < 0 or p_score > 100000) then
    raise exception 'A MoSim score is between 0 and 100000.' using errcode = '22023'; end if;
  if p_date is null or p_date > (now() at time zone 'America/Los_Angeles')::date + 1 or p_date < date '2015-01-01' then
    raise exception 'The date is today or earlier.' using errcode = '22023'; end if;
  if p_notes is not null and length(p_notes) > 1000 then
    raise exception 'Notes are at most 1000 characters.' using errcode = '22023'; end if;
end
$fn$;
revoke all on function public._driver_check_session(date, integer, text, integer, text) from public, anon, authenticated;

-- Does: Log a drive session: real robot time (practice field, match or test) or MoSim time, its minutes and date. Students log their own; staff log for anyone.
create or replace function public.driver_log_session(p_member uuid default null, p_date date default null, p_minutes integer default null,
  p_kind text default null, p_score integer default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare s public.drive_sessions; v_member uuid := coalesce(p_member, auth.uid()); v_date date := coalesce(p_date, (now() at time zone 'America/Los_Angeles')::date);
begin
  if not public._driver_member_ok() then raise exception 'The driver leaderboard is for approved students and staff.' using errcode = '42501'; end if;
  if v_member <> auth.uid() and not public.is_staff() then
    raise exception 'You log your own drive time. A mentor can log it for someone else.' using errcode = '42501'; end if;
  if not public._driver_target_ok(v_member) then raise exception 'That member is not an approved, active student or staff member.' using errcode = '22023'; end if;
  perform public._driver_check_session(v_date, p_minutes, p_kind, p_score, p_notes);
  if not public.is_staff() and v_date < (now() at time zone 'America/Los_Angeles')::date - 60 then
    raise exception 'Log a session within 60 days. Ask a mentor for anything older.' using errcode = '22023'; end if;
  insert into public.drive_sessions (member_id, session_date, minutes, kind, sim_score, notes, logged_by, updated_by)
  values (v_member, v_date, p_minutes, p_kind, p_score, nullif(btrim(p_notes), ''), auth.uid(), auth.uid())
  returning * into s;
  return to_jsonb(s);
end
$fn$;

-- Does: Correct a logged drive session: its date, minutes, kind, MoSim score or notes. Staff only.
create or replace function public.driver_edit_session(p_session uuid, p_date date, p_minutes integer, p_kind text,
  p_score integer default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare s public.drive_sessions;
begin
  if not public.is_staff() or not public._driver_member_ok() then raise exception 'Only staff can change a drive session.' using errcode = '42501'; end if;
  perform public._driver_check_session(p_date, p_minutes, p_kind, p_score, p_notes);
  update public.drive_sessions set session_date = p_date, minutes = p_minutes, kind = p_kind, sim_score = p_score,
         notes = nullif(btrim(p_notes), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_session returning * into s;
  if s.id is null then raise exception 'No such session.' using errcode = 'P0002'; end if;
  return to_jsonb(s);
end
$fn$;

-- Does: Void a drive session so it counts for nothing (it stays on the record). Staff any time; the driver for 24 hours after logging it.
create or replace function public.driver_void_drive(p_session uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare s public.drive_sessions;
begin
  if not public._driver_member_ok() then raise exception 'The driver leaderboard is for approved students and staff.' using errcode = '42501'; end if;
  select * into s from public.drive_sessions where id = p_session for update;
  if s.id is null then raise exception 'No such session.' using errcode = 'P0002'; end if;
  if not public.is_staff() and (s.member_id <> auth.uid() or s.created_at < now() - interval '24 hours') then
    raise exception 'You can void your own session for 24 hours after logging it. Ask a mentor after that.' using errcode = '42501'; end if;
  if s.voided_at is not null then raise exception 'That session is already void.' using errcode = '22023'; end if;
  if p_reason is not null and length(p_reason) > 300 then raise exception 'A reason is at most 300 characters.' using errcode = '22023'; end if;
  update public.drive_sessions set voided_at = now(), voided_by = auth.uid(), void_reason = nullif(btrim(p_reason), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_session returning * into s;
  return to_jsonb(s);
end
$fn$;

-- Does: Rate a driver from 1 to 5 on control, awareness, scoring, defense and consistency, with a note. Staff only; the newest rating per coach counts.
create or replace function public.driver_rate(p_driver uuid, p_control integer default null, p_awareness integer default null,
  p_scoring integer default null, p_defense integer default null, p_consistency integer default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.driver_ratings;
begin
  if not public.is_staff() or not public._driver_member_ok() then raise exception 'Only staff can rate a driver.' using errcode = '42501'; end if;
  if p_driver is null or p_driver = auth.uid() then raise exception 'Rate another member, not yourself.' using errcode = '22023'; end if;
  if not public._driver_target_ok(p_driver) then raise exception 'That member is not an approved, active student or staff member.' using errcode = '22023'; end if;
  if coalesce(p_control, p_awareness, p_scoring, p_defense, p_consistency) is null then
    raise exception 'Give at least one rating from 1 to 5.' using errcode = '22023'; end if;
  if p_control not between 1 and 5 or p_awareness not between 1 and 5 or p_scoring not between 1 and 5
     or p_defense not between 1 and 5 or p_consistency not between 1 and 5 then
    raise exception 'Each rating is 1 to 5.' using errcode = '22023'; end if;
  if p_note is not null and length(p_note) > 1000 then raise exception 'A note is at most 1000 characters.' using errcode = '22023'; end if;
  insert into public.driver_ratings (driver_id, coach_id, control, awareness, scoring, defense, consistency, note)
  values (p_driver, auth.uid(), p_control, p_awareness, p_scoring, p_defense, p_consistency, nullif(btrim(p_note), ''))
  returning * into r;
  return to_jsonb(r);
end
$fn$;

revoke all on function public.driver_rating_scores() from public, anon;
revoke all on function public.driver_log_session(uuid, date, integer, text, integer, text) from public, anon;
revoke all on function public.driver_edit_session(uuid, date, integer, text, integer, text) from public, anon;
revoke all on function public.driver_void_drive(uuid, text) from public, anon;
revoke all on function public.driver_rate(uuid, integer, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.driver_rating_scores() to authenticated;
grant execute on function public.driver_log_session(uuid, date, integer, text, integer, text) to authenticated;
grant execute on function public.driver_edit_session(uuid, date, integer, text, integer, text) to authenticated;
grant execute on function public.driver_void_drive(uuid, text) to authenticated;
grant execute on function public.driver_rate(uuid, integer, integer, integer, integer, integer, text) to authenticated;

-- The connector (0018, 0021) records the rows a call wrote from the tables it
-- lists. Skipped when the connector is not applied.
do $connector$
begin
  if to_regclass('public.connector_log_tables') is not null then
    insert into public.connector_log_tables (table_name, note) values
      ('drive_sessions', 'Drive sessions (0029)'), ('driver_ratings', 'Driver ratings (0029)')
    on conflict (table_name) do nothing;
  end if;
end
$connector$;

-- The account merge (0020) must know every column that names a member. 0028
-- last replaced this list; it is copied here with the six driver columns
-- added. Paste 0029 again after any re-paste of 0020, 0022, 0024, 0026 or 0028.
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
