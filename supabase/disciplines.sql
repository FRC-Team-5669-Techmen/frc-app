-- Disciplines catalog (mirrors the skills catalog table + RLS) and a member
-- disciplines multi-select stored as text[] on profiles (mirrors subteams).
-- Run once in the Supabase SQL editor.

-- 1. disciplines catalog
create table if not exists public.disciplines (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  category   text        not null default 'General',
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);

-- 2. RLS: everyone reads; staff write (same pattern as skills)
alter table public.disciplines enable row level security;

drop policy if exists "disciplines readable by authenticated" on public.disciplines;
create policy "disciplines readable by authenticated"
  on public.disciplines for select to authenticated using (true);

drop policy if exists "disciplines writable by staff" on public.disciplines;
create policy "disciplines writable by staff"
  on public.disciplines for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.disciplines to authenticated;

-- 3. Member disciplines: store the selected names, like profiles.subteams
alter table public.profiles
  add column if not exists disciplines text[] not null default '{}';

-- 4. Seed in the intended display order (global ascending sort_order so
-- categories surface in this order and rows sort within each category).
insert into public.disciplines (name, category, sort_order) values
  ('CAD & Design',                      'Build / Mechanical',    0),
  ('Machining & Fabrication',           'Build / Mechanical',    1),
  ('Welding',                           'Build / Mechanical',    2),
  ('3D Printing',                       'Build / Mechanical',    3),
  ('Mechanisms',                        'Build / Mechanical',    4),
  ('Drivetrain',                        'Build / Mechanical',    5),
  ('Pneumatics',                        'Build / Mechanical',    6),
  ('Wiring & Electrical',               'Electrical / Software', 7),
  ('Programming',                       'Electrical / Software', 8),
  ('Controls & Sensors',                'Electrical / Software', 9),
  ('Vision & Autonomous',              'Electrical / Software', 10),
  ('Drive Team',                        'Competition',          11),
  ('Pit Crew',                          'Competition',          12),
  ('Scouting',                          'Competition',          13),
  ('Strategy & Match Analysis',         'Competition',          14),
  ('Safety',                            'Competition',          15),
  ('Outreach & Community',              'Off-field',            16),
  ('Media & Design',                    'Off-field',            17),
  ('Business & Sponsorship',            'Off-field',            18),
  ('Engineering Notebook / Impact',     'Off-field',            19)
on conflict (name) do nothing;
