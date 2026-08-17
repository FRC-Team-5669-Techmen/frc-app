-- ============================================================
-- Member application (per-season onboarding form)
-- Run once in the Supabase SQL editor, BEFORE testing the UI.
--
-- Replaces the Google Form. One row per member per season, written once on
-- final submit by the member themselves (src/MemberApplication.jsx), which
-- renders in the AccessGate slot until the row exists.
--
-- AUTHENTICATED ONLY. There is no anon path: every member record in this app
-- descends from auth.users (profiles.id IS the auth user id), so identity is
-- auth.uid() and nothing here is reachable without a session. The grants at
-- the bottom revoke anon explicitly -- Supabase's project bootstrap sets
-- ALTER DEFAULT PRIVILEGES granting anon on new tables in public, so policy
-- scoping alone is NOT what keeps anon out.
--
-- Contact fields live HERE and never on profiles: "profiles readable by
-- authenticated ... using (true)" would publish every parent's phone number
-- to every student on the team.
--
-- Depends on: public.profiles, public.seasons (supabase/seasons.sql),
--             public.is_staff() (supabase/session_integrity.sql).
-- Mutation test: supabase/member_applications_rls_test.sql
-- ============================================================

-- -- 1. Table ------------------------------------------------------------------
-- season_id matches seasons.id (uuid). "Current season" is NOT redefined here:
-- it is the existing app rule -- the season whose [start_date, end_date] spans
-- today (src/seasons.js, mirroring HoursBoard.jsx). ON DELETE RESTRICT so a
-- season can't be dropped out from under a roster of applications.
create table if not exists public.member_applications (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references public.profiles(id) on delete cascade,
  season_id    uuid        not null references public.seasons(id)  on delete restrict,
  submitted_at timestamptz not null default now(),

  -- Identity. Email is NOT stored: it lives on auth.users and is shown
  -- read-only on the form from the session.
  legal_first_name text not null,
  legal_last_name  text not null,
  student_phone    text not null,

  -- School. Preferred name / graduation year / shirt size are deliberately
  -- absent: those three already exist on profiles and are already team-visible
  -- by design, so the form writes them there instead of duplicating them.
  pathway          text not null,
  returning_member boolean not null,
  seasons_on_team  integer,

  -- Prior experience. SELF-REPORTED and display-only to staff: it must never
  -- create member_skills rows. member_skills carries certified_by -- a
  -- certification is granted by staff, never claimed by the member.
  prior_robotics         text[] not null default '{}',
  programming_languages  text[] not null default '{}',
  cad_tools              text[] not null default '{}',
  hands_on_experience    text[] not null default '{}',
  certifications_claimed text,

  -- Subteam interest: STATED INTEREST, which is application data. It does not
  -- write profiles.subteams -- that column is staff-set placement and stays so.
  subteam_first     text not null,
  subteam_second    text not null,
  subteam_third     text,
  subteam_rationale text not null,

  -- Commitment. build_season_acknowledged cannot be stored false: the CHECK
  -- makes an unchecked box a write error, not a soft validation.
  monday_lunch              text    not null,
  tuesday_after_school      text    not null,
  friday_after_school       text    not null,
  transport_after_5pm       text    not null,
  seasonal_conflicts        text[]  not null default '{}',
  conflict_detail           text,
  build_season_acknowledged boolean not null,

  -- Parent / guardian contact (the reason this table is not profiles).
  parent_name        text not null,
  parent_email       text not null,
  parent_phone       text not null,
  parent_two_name    text,
  parent_two_contact text,

  -- Logistics
  dietary_restrictions    text,
  emergency_contact_name  text not null,
  emergency_contact_phone text not null,

  -- Discord. discord_server_confirmed is STAFF-SET, not student-set: the
  -- member has no update path (see RLS below), staff set it via
  -- staff_set_discord_confirmed().
  discord_username         text    not null,
  discord_server_confirmed boolean not null default false,

  -- Acknowledgment
  conduct_acknowledged boolean not null,

  constraint member_applications_member_season_uniq unique (member_id, season_id)
);

-- -- 2. Value constraints ------------------------------------------------------
-- Added separately (and guarded) so this file stays re-runnable.
do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'member_applications_pathway_chk' and conrelid = 'public.member_applications'::regclass) then
    alter table public.member_applications add constraint member_applications_pathway_chk
      check (pathway in ('CSEE', 'MSET', 'MAT', 'IDEA', 'ACE', 'BMET', 'Freshman - in rotation'));
  end if;

  -- The eight-value subteam taxonomy, shared by all three ranked choices.
  if not exists (select 1 from pg_constraint where conname = 'member_applications_subteam_values_chk' and conrelid = 'public.member_applications'::regclass) then
    alter table public.member_applications add constraint member_applications_subteam_values_chk
      check (
        subteam_first in (
          'Mechanical Design (CAD)', 'Fabrication and Machining',
          'Assembly and Robot Construction', 'Electrical and Wiring',
          'Programming and Controls', 'Drive Team (selection by tryout)',
          'Field and Pit Crew', 'Media Outreach and Business')
        and subteam_second in (
          'Mechanical Design (CAD)', 'Fabrication and Machining',
          'Assembly and Robot Construction', 'Electrical and Wiring',
          'Programming and Controls', 'Drive Team (selection by tryout)',
          'Field and Pit Crew', 'Media Outreach and Business')
        and (subteam_third is null or subteam_third in (
          'Mechanical Design (CAD)', 'Fabrication and Machining',
          'Assembly and Robot Construction', 'Electrical and Wiring',
          'Programming and Controls', 'Drive Team (selection by tryout)',
          'Field and Pit Crew', 'Media Outreach and Business'))
      );
  end if;

  -- Ranked choices are pairwise distinct where non-null.
  if not exists (select 1 from pg_constraint where conname = 'member_applications_subteams_distinct_chk' and conrelid = 'public.member_applications'::regclass) then
    alter table public.member_applications add constraint member_applications_subteams_distinct_chk
      check (
        subteam_first <> subteam_second
        and (subteam_third is null
             or (subteam_third <> subteam_first and subteam_third <> subteam_second))
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'member_applications_availability_chk' and conrelid = 'public.member_applications'::regclass) then
    alter table public.member_applications add constraint member_applications_availability_chk
      check (
        monday_lunch in ('Yes', 'No', 'Sometimes')
        and tuesday_after_school in ('Yes', 'No', 'Sometimes')
        and friday_after_school in ('Yes', 'No', 'Sometimes')
      );
  end if;

  -- Acknowledgments are not storable as false.
  if not exists (select 1 from pg_constraint where conname = 'member_applications_build_ack_chk' and conrelid = 'public.member_applications'::regclass) then
    alter table public.member_applications add constraint member_applications_build_ack_chk
      check (build_season_acknowledged = true);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'member_applications_conduct_ack_chk' and conrelid = 'public.member_applications'::regclass) then
    alter table public.member_applications add constraint member_applications_conduct_ack_chk
      check (conduct_acknowledged = true);
  end if;
end
$ck$;

-- Staff list view reads current-season rows; members read their own history.
create index if not exists member_applications_season_idx on public.member_applications (season_id);
create index if not exists member_applications_member_idx on public.member_applications (member_id, submitted_at desc);

-- -- 3. RLS --------------------------------------------------------------------
alter table public.member_applications enable row level security;

-- Insert: only for yourself. This is the single write the member ever makes --
-- the form holds every answer in component state and writes once on submit, so
-- a partial fill never creates a row.
drop policy if exists "member_applications insert own" on public.member_applications;
create policy "member_applications insert own"
  on public.member_applications for insert to authenticated
  with check (member_id = auth.uid());

-- Select: your own rows (the gate check + returning-member prefill) or staff
-- (the roster view). Parent contact stays invisible to the rest of the team.
drop policy if exists "member_applications select own or staff" on public.member_applications;
create policy "member_applications select own or staff"
  on public.member_applications for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

-- NO update policy and NO delete policy, for anyone -- deliberately.
-- Rationale is the one documented in supabase/admin_member_management.sql: a
-- direct client write that no row-level policy matches silently affects 0 rows
-- and raises nothing, so a staff correction can appear to work and never
-- persist. Corrections therefore route through SECURITY DEFINER functions that
-- enforce the role themselves and raise loudly. The only such write today is
-- the staff-set Discord confirmation below; add further ones the same way
-- rather than opening a broad update policy.

-- -- 4. staff_set_discord_confirmed(): the one staff write path ---------------
create or replace function public.staff_set_discord_confirmed(
  p_application uuid,
  p_confirmed   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;
  if p_confirmed is null then
    raise exception 'A confirmed value is required';
  end if;

  update public.member_applications
     set discord_server_confirmed = p_confirmed
   where id = p_application;

  if not found then
    raise exception 'Application not found';
  end if;
end;
$fn$;

-- -- 5. Grants -----------------------------------------------------------------
-- Grant only what a policy backs: select + insert. No update/delete grant, so
-- the missing policies can't be the only thing standing between a client and a
-- write.
grant select, insert on public.member_applications to authenticated;

-- Explicit anon revoke. NOT redundant with the `to authenticated` policy
-- scoping: ALTER DEFAULT PRIVILEGES in a Supabase project grants anon on new
-- public tables, and the grant layer is checked independently of RLS.
revoke all on public.member_applications from anon;
revoke all on function public.staff_set_discord_confirmed(uuid, boolean) from public, anon;
grant execute on function public.staff_set_discord_confirmed(uuid, boolean) to authenticated;
