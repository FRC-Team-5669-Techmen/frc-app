-- ============================================================
-- Event signups / RSVP  (builds on supabase/events.sql)
-- Run once in the Supabase SQL editor, BEFORE testing the RSVP UI.
--
-- Plain own-row writes, no RPCs: there is no cert gate or privileged
-- transition here (unlike jobs_board). A member writes only their own signup;
-- staff may manage any.
-- ============================================================

-- ── 1. Additive columns on the existing events table ────────────────────────
alter table public.events add column if not exists rsvp_enabled boolean not null default false;
alter table public.events add column if not exists capacity     int;

-- ── 2. event_signups: one row per member per event ──────────────────────────
create table if not exists public.event_signups (
  event_id   uuid not null references public.events(id)   on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  response   text not null default 'going' check (response in ('going', 'maybe', 'declined')),
  item       text,                                    -- "bringing" / volunteer role
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

alter table public.event_signups enable row level security;

-- Everyone signed in sees the attendee list.
drop policy if exists "event_signups readable" on public.event_signups;
create policy "event_signups readable"
  on public.event_signups for select to authenticated using (true);

-- A member writes only their own row; staff may write/delete any.
drop policy if exists "event_signups insert own or staff" on public.event_signups;
create policy "event_signups insert own or staff"
  on public.event_signups for insert to authenticated
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists "event_signups update own or staff" on public.event_signups;
create policy "event_signups update own or staff"
  on public.event_signups for update to authenticated
  using  (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists "event_signups delete own or staff" on public.event_signups;
create policy "event_signups delete own or staff"
  on public.event_signups for delete to authenticated
  using (member_id = auth.uid() or public.is_staff());

grant all on public.event_signups to authenticated;
