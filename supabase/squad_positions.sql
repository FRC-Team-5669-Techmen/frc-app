-- Designated squad positions catalog (mirrors the skills/disciplines catalog
-- table + RLS) and a many-to-many of member assignments.
-- Run once in the Supabase SQL editor.

-- 1. positions catalog
create table if not exists public.positions (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null unique,
  description  text,
  target_count int         not null default 1 check (target_count >= 0),
  sort_order   int         not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.positions enable row level security;

drop policy if exists "positions readable by authenticated" on public.positions;
create policy "positions readable by authenticated"
  on public.positions for select to authenticated using (true);

drop policy if exists "positions writable by staff" on public.positions;
create policy "positions writable by staff"
  on public.positions for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.positions to authenticated;

-- 2. position_assignments (many-to-many: members hold positions)
create table if not exists public.position_assignments (
  position_id uuid not null references public.positions(id) on delete cascade,
  member_id   uuid not null references public.profiles(id)  on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (position_id, member_id)
);

alter table public.position_assignments enable row level security;

drop policy if exists "assignments readable by authenticated" on public.position_assignments;
create policy "assignments readable by authenticated"
  on public.position_assignments for select to authenticated using (true);

drop policy if exists "assignments writable by staff" on public.position_assignments;
create policy "assignments writable by staff"
  on public.position_assignments for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.position_assignments to authenticated;

-- 3. Seed positions in the intended display order, target_count 1 each
insert into public.positions (name, target_count, sort_order) values
  ('Drive Coach',        1,  0),
  ('Driver',             1,  1),
  ('Operator',           1,  2),
  ('Human Player',       1,  3),
  ('Pit Boss',           1,  4),
  ('Safety Captain',     1,  5),
  ('Team Captain',       1,  6),
  ('Lead Mechanical',    1,  7),
  ('Lead Electrical',    1,  8),
  ('Lead Programmer',    1,  9),
  ('Scouting Lead',      1, 10),
  ('Strategy Lead',      1, 11),
  ('Awards/Impact Lead', 1, 12),
  ('Media Lead',         1, 13)
on conflict (name) do nothing;
