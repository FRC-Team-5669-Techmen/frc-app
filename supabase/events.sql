-- ============================================================
-- Team schedule (events)
-- Run once in the Supabase SQL editor, BEFORE testing the schedule UI.
--
-- Readable by every authenticated member; only staff create / edit / delete.
-- No RPCs: there is no privileged transition logic, just a staff-write policy
-- like public.tasks in jobs_board.sql.
-- ============================================================

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  kind       text not null default 'build'
               check (kind in ('build', 'meeting', 'competition', 'potluck', 'outreach', 'other')),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  location   text,
  notes      text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_starts_at_idx on public.events (starts_at);

alter table public.events enable row level security;

-- Everyone signed in can read the schedule.
drop policy if exists "events readable by authenticated" on public.events;
create policy "events readable by authenticated"
  on public.events for select to authenticated using (true);

-- Staff create / edit / delete. No direct writes for anyone else.
drop policy if exists "events writable by staff" on public.events;
create policy "events writable by staff"
  on public.events for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.events to authenticated;
