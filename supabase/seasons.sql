-- Run this in the Supabase SQL editor to create the seasons table.
-- Update the seeded dates to match your team's actual schedule.

create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);

alter table public.seasons enable row level security;

-- All authenticated users can read seasons
create policy "seasons read" on public.seasons
  for select using (auth.role() = 'authenticated');

-- Staff can create, update, and delete seasons
create policy "seasons staff write" on public.seasons
  for all using (public.is_staff()) with check (public.is_staff());

grant all on public.seasons to authenticated;

-- Seed example seasons — adjust dates to match your team's actual schedule
insert into public.seasons (name, start_date, end_date) values
  ('2025 Build Season',       '2025-01-04', '2025-02-28'),
  ('2025 Competition Season', '2025-03-01', '2025-04-30'),
  ('2025 Off-Season',         '2025-05-01', '2025-12-31');
