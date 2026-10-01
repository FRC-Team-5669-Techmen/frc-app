-- ============================================================
-- 0004_member_permissions -- per-member capabilities granted by an admin,
-- the first one being "can add calendar events" ('events.create').
--
-- APPLY: by hand, once, in the Supabase SQL editor, BEFORE the roster control
-- and the schedule form can use it. Re-runnable: a second paste changes
-- nothing. Then run 0004_member_permissions_rls_test.sql (rollback-safe) and
-- read its result grid; every row should say PASS.
--
-- WHY. Mr. Pina, 2026-09-03: "I need to be able to give student permissions to
-- add events to calendar." Built as a per-person grant an admin gives and
-- takes back on the admin roster, and generic: the next capability is a new
-- ROW in public.capabilities plus the policy that consults it, never a new
-- column on profiles.
--
-- WHY A LOOKUP TABLE AND NOT A CHECK CONSTRAINT. A CHECK listing the known
-- capabilities would have to be dropped and re-added, widened, by every later
-- migration that adds one, and re-pasting THIS file afterwards would silently
-- narrow it back (supabase/categories_reduce_event_kind.sql does exactly that
-- to the 'training' event kind if it is re-run after events_kind_training.sql).
-- A row inserted "on conflict do nothing" can never be reverted by a re-run,
-- and the foreign key still makes a misspelt capability impossible to store.
--
-- CREATES
--   public.capabilities                      the vocabulary, one row per key
--   public.member_permissions                (member_id, capability) grants
--   public.has_capability(text)              true for staff, OR for an
--                                            APPROVED member holding the grant
--   public.events_series_is_own(uuid)        true when a series id is null or
--                                            names no event anyone else created
--   public.admin_grant_capability(uuid,text) admin only, raises 42501 otherwise
--   public.admin_revoke_capability(uuid,text) admin only, raises 42501 otherwise
--   three ADDITIVE permissive policies on public.events, for a holder of
--   'events.create' who is not staff:
--     insert -- created_by must be the caller, mandatory must be false, and
--               series_id must be null or a series only the caller's events
--               are in
--     update -- only rows the caller created and that are not mandatory, only
--               while the caller still holds the capability, and the row must
--               still be theirs, still not mandatory, and still in no series
--               anyone else's events are in afterwards
--     delete -- only rows the caller created and that are not mandatory, only
--               while the caller still holds the capability
--
-- WHAT A HOLDER CAN AND CANNOT DO, decided here and enforced in RLS (the UI in
-- src/permissions.js canEditEvent() mirrors it exactly):
--   - add events of any kind, one at a time or as a repeating series;
--   - edit and delete ONLY the events they added themselves, never anyone
--     else's -- a student cannot move or cancel a staff build session;
--   - never mark an event mandatory. "Mandatory" reminds every active member
--     regardless of RSVP, which is the widest broadcast the app has, so it
--     stays staff-only. An event staff later marks mandatory becomes staff
--     territory and drops out of the holder's edit/delete rights;
--   - never put an event into somebody else's series. series_id is a plain
--     column the client mints, and staff's "Whole series (N)" edit and delete
--     act on every row sharing it -- so before this, a holder who copied a
--     staff series' id onto an event they added (one direct API insert) got
--     their row counted, retimed or deleted by staff's next series action. A
--     holder's own series, and an event in no series, are unaffected. The UI
--     never sends a foreign series_id (an insert mints a fresh one, an update
--     sends none); the database now refuses one (42501);
--   - lose all of the above the moment an admin revokes the capability, OR the
--     moment their profile stops being approved. A grant on an unapproved
--     profile (an account staff have not let in, or have since turned away)
--     confers nothing. Staff are unaffected: their path is is_staff(), exactly
--     as before.
-- Staff (is_staff(): mentor / lead / admin) keep every right they have today.
-- The existing "events writable by staff" policy is NOT dropped, altered or
-- re-created by this file; Postgres ORs permissive policies together.
--
-- NO RPC CREATES EVENTS, so there is no RPC to teach the capability to. Every
-- event is written by a direct client insert/update/delete from
-- src/SchedulePage.jsx (a repeating series is ONE multi-row client insert
-- sharing a client-minted series_id; supabase/event_series.sql only adds the
-- column). Checked across supabase/, sql/, supabase/functions/ and api/: the
-- Discord poster, the week-ahead post, calendar-feed and cron-notify only READ
-- public.events. A future RPC that inserts events must call
-- public.has_capability('events.create') itself, because a SECURITY DEFINER
-- body bypasses these policies.
--
-- CONSEQUENCE, by design: an event a holder adds is an ordinary row. The
-- statement-level schedule_change push trigger (notification_triggers.sql)
-- fires for it, the hourly Discord poster posts it to #calendar and posts the
-- 2h reminder to #announcements (pinging any subteam role its title or notes
-- name), the Sunday week-ahead post lists it, and it appears in every
-- member's calendar-feed. A 'build' event a holder adds also opens the shop on
-- the dashboard glance card for its window.
--
-- ASSUMES (checked first; the file raises rather than half-applies):
--   public.profiles, public.events                (base schema, events.sql)
--   profiles.approved                              (domain_roster_gate.sql)
--   events.created_by                              (events.sql)
--   events.series_id                               (event_series.sql)
--   events.mandatory                               (push_notifications.sql)
--   public.is_staff()                              (skills_catalog.sql)
--   public.is_admin()                              (feedback.sql)
--
-- REVERSE (returns the database to its prior state; events a holder already
-- added stay, they are ordinary rows owned by nobody special):
--   drop policy if exists "events insert by capability holder" on public.events;
--   drop policy if exists "events update own by capability holder" on public.events;
--   drop policy if exists "events delete own by capability holder" on public.events;
--   drop function if exists public.admin_grant_capability(uuid, text);
--   drop function if exists public.admin_revoke_capability(uuid, text);
--   drop function if exists public.events_series_is_own(uuid);
--   drop function if exists public.has_capability(text);
--   drop table if exists public.member_permissions;
--   drop table if exists public.capabilities;
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.events') is null then
    raise exception '0004: public.profiles / public.events missing -- apply supabase/events.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'created_by') then
    raise exception '0004: events.created_by missing -- apply supabase/events.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'mandatory') then
    raise exception '0004: events.mandatory missing -- apply supabase/push_notifications.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'series_id') then
    raise exception '0004: events.series_id missing -- apply supabase/event_series.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'approved') then
    raise exception '0004: profiles.approved missing -- apply supabase/domain_roster_gate.sql first';
  end if;
  if to_regprocedure('public.is_staff()') is null then
    raise exception '0004: public.is_staff() missing -- apply supabase/skills_catalog.sql first';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '0004: public.is_admin() missing -- apply supabase/feedback.sql first';
  end if;
end
$pre$;

-- ── 1. The vocabulary ────────────────────────────────────────────────────────
-- Keys are 'resource.action'. The label is what the roster shows; it is
-- mirrored in src/permissions.js CAPABILITIES, and tests/permissions.test.js
-- fails if the two disagree.
create table if not exists public.capabilities (
  key         text        primary key
                check (key ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  label       text        not null,
  description text,
  created_at  timestamptz not null default now()
);

insert into public.capabilities (key, label, description) values
  ('events.create', 'Can add calendar events',
   'Add events to the team schedule, and edit or delete the events they added. '
   || 'Cannot mark an event mandatory. Staff can already do all of this.')
on conflict (key) do nothing;

alter table public.capabilities enable row level security;

drop policy if exists "capabilities readable by authenticated" on public.capabilities;
create policy "capabilities readable by authenticated"
  on public.capabilities for select to authenticated using (true);

-- Read-only to clients. A new capability arrives in a numbered migration, never
-- from the app. The bootstrap ALTER DEFAULT PRIVILEGES granted anon and
-- authenticated ALL on this table the moment it was created, so the writes are
-- revoked BY NAME (a bare "from public" would leave those direct grants).
revoke all on table public.capabilities from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.capabilities from authenticated;
grant select on table public.capabilities to authenticated;

-- ── 2. The grants ────────────────────────────────────────────────────────────
create table if not exists public.member_permissions (
  member_id  uuid        not null references public.profiles(id) on delete cascade,
  capability text        not null references public.capabilities(key) on delete cascade,
  -- set null, not cascade: deleting the admin who granted something must not
  -- take the grant away from the member who holds it.
  granted_by uuid        references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (member_id, capability)
);

create index if not exists member_permissions_capability_idx
  on public.member_permissions (capability);

alter table public.member_permissions enable row level security;

-- A member reads their own grants (the schedule needs to know whether to offer
-- the form); staff read everyone's (the roster). Nobody else.
drop policy if exists "member_permissions read own or staff" on public.member_permissions;
create policy "member_permissions read own or staff"
  on public.member_permissions for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

-- NO insert / update / delete policy, for anyone, admins included: every write
-- goes through admin_grant_capability / admin_revoke_capability below. And
-- because a missing policy fails SILENTLY at 0 rows (an update or delete that
-- "worked" and changed nothing -- the exact failure admin_set_member_role was
-- written to end), the writes are also revoked at the grant layer so a direct
-- write raises 42501 instead.
revoke all on table public.member_permissions from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.member_permissions from authenticated;
grant select on table public.member_permissions to authenticated;

-- ── 3. has_capability(): the one check every policy and RPC consults ─────────
-- True for staff (they can already do everything a capability grants) or for
-- an APPROVED member holding the capability. SECURITY DEFINER so a policy can
-- consult member_permissions and profiles without depending on the caller's
-- own read policies, and search_path pinned like every other definer function
-- here.
--
-- WHY APPROVAL IS CHECKED HERE. A grant row outlives the reason it was given:
-- an admin can grant a member who is later turned away (approved set back to
-- false), and the app's own gate (App.jsx shows the access gate, not the app,
-- to an unapproved account) is a client screen, not a boundary -- a direct API
-- call never meets it. So the capability is only as live as the profile.
-- The staff half is deliberately unchanged: is_staff() is what every staff
-- policy in this database already trusts, and narrowing it here alone would
-- make staff's rights depend on which policy asked.
create or replace function public.has_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_staff()
      or exists (
           select 1
             from public.member_permissions mp
             join public.profiles p on p.id = mp.member_id
            where mp.member_id = auth.uid()
              and mp.capability = p_capability
              and p.approved);
$fn$;

-- ── 3b. events_series_is_own(): a holder's event joins only their own series ──
-- True when p_series is null, or when every event already carrying it was
-- created by the caller -- which includes a fresh id nobody has used (the
-- repeating-series form mints one per series) and the holder's own series.
-- False the moment one event in it was created by anybody else, a null
-- created_by included (an event nobody claims is not the caller's).
--
-- SECURITY DEFINER, but NOT because a policy on events cannot read events: it
-- can (measured on PostgreSQL 16 -- an inline subquery in these policies runs,
-- because the events SELECT policy is a bare `using (true)` and so expands to
-- nothing further). It is a definer so the answer covers EVERY row of the
-- series whatever the caller may read: inline, the subquery would go through
-- the caller's own SELECT policy, and the day a later migration hides some
-- events from students it would start answering "no foreign rows here" about
-- rows it simply cannot see. events_series_id_idx (event_series.sql) serves
-- the lookup.
create or replace function public.events_series_is_own(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select p_series is null
      or not exists (
           select 1 from public.events e
            where e.series_id = p_series
              and e.created_by is distinct from auth.uid());
$fn$;

-- ── 4. Admin grant / revoke ──────────────────────────────────────────────────
-- Shaped like admin_set_member_role (admin_member_management.sql): the admin
-- check is INSIDE the body, so a non-admin call raises a real error rather
-- than appearing to work. 42501 is the errcode PostgREST maps to 403, and the
-- message keeps the "Permission denied" wording RosterPage already reads.
create or replace function public.admin_grant_capability(p_member uuid, p_capability text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Permission denied: admin role required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.capabilities where key = p_capability) then
    raise exception 'Unknown capability: %', p_capability using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_member) then
    raise exception 'Unknown member: %', p_member using errcode = '22023';
  end if;

  insert into public.member_permissions (member_id, capability, granted_by)
  values (p_member, p_capability, auth.uid())
  on conflict (member_id, capability) do nothing;
end;
$fn$;

create or replace function public.admin_revoke_capability(p_member uuid, p_capability text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Permission denied: admin role required' using errcode = '42501';
  end if;

  delete from public.member_permissions
   where member_id = p_member and capability = p_capability;
end;
$fn$;

-- Execute: authenticated only. The bootstrap default privileges granted anon
-- (and PUBLIC holds EXECUTE on every new function by default), so all three
-- are revoked by name first and then granted back to the one role intended.
-- has_capability and events_series_is_own must stay executable by
-- authenticated: the events policies below call them as the signed-in caller.
-- (events_series_is_own answers only about rows every member can already read
-- through "events readable by authenticated", so it discloses nothing.)
revoke execute on function public.has_capability(text)               from public, anon, authenticated;
revoke execute on function public.events_series_is_own(uuid)         from public, anon, authenticated;
revoke execute on function public.admin_grant_capability(uuid, text)  from public, anon, authenticated;
revoke execute on function public.admin_revoke_capability(uuid, text) from public, anon, authenticated;
grant  execute on function public.has_capability(text)               to authenticated;
grant  execute on function public.events_series_is_own(uuid)         to authenticated;
grant  execute on function public.admin_grant_capability(uuid, text)  to authenticated;
grant  execute on function public.admin_revoke_capability(uuid, text) to authenticated;

-- ── 5. public.events: what a holder may do ───────────────────────────────────
-- Additive and permissive: they OR with "events writable by staff", which is
-- untouched. For staff these add nothing (has_capability() is already true and
-- the staff policy already allows more), so staff behaviour cannot change.
--
-- SERIES. The insert and update checks also require series_id to be null or a
-- series only the caller's events are in (events_series_is_own, 3b). Without
-- it a holder could copy a staff series' id onto their own event, and staff's
-- "Whole series (N)" edit / delete would then count, retime or delete that row
-- along with theirs. Delete needs no such clause: a holder's delete already
-- reaches only their own rows, series or not.
--
-- UPDATE has to FIND its rows first, and events are select using (true), so a
-- holder's update of somebody else's event finds the row and is then filtered
-- out by THIS using clause: 0 rows, no error. That is the shape the RLS test
-- asserts, and why the client checks the affected row count.
drop policy if exists "events insert by capability holder" on public.events;
create policy "events insert by capability holder"
  on public.events for insert to authenticated
  with check (
    public.has_capability('events.create')
    and created_by = auth.uid()
    and mandatory = false
    and public.events_series_is_own(series_id)
  );

drop policy if exists "events update own by capability holder" on public.events;
create policy "events update own by capability holder"
  on public.events for update to authenticated
  using (
    public.has_capability('events.create')
    and created_by = auth.uid()
    and mandatory = false
  )
  with check (
    public.has_capability('events.create')
    and created_by = auth.uid()
    and mandatory = false
    and public.events_series_is_own(series_id)
  );

drop policy if exists "events delete own by capability holder" on public.events;
create policy "events delete own by capability holder"
  on public.events for delete to authenticated
  using (
    public.has_capability('events.create')
    and created_by = auth.uid()
    and mandatory = false
  );

-- ── Verify (optional; read-only) ─────────────────────────────────────────────
-- select key, label from public.capabilities order by key;
-- select polname, polcmd from pg_policy where polrelid = 'public.events'::regclass order by polname;
--   expect the two original policies plus the three "... by capability holder" ones
