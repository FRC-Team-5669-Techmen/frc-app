# Skills & Certifications - Build Plan

## What this is
A record of what each member is trained and certified on. It serves three jobs:
1. A shop-safety record of who is cleared on which equipment, with an audit trail
   of who signed off and when.
2. The eligibility layer the future task list reads to decide who can be assigned what.
3. The spine the future learning environment hangs lessons off of.

## Decisions baked in (change these if you want)
- All signed-in members can read the skills catalog and everyone's certification
  status, so anyone can answer "who is cleared to run the laser right now."
- v1 writes (certifying, editing the catalog) are mentor / lead / admin only.
  Students cannot self-certify or self-request. The "request training / in progress"
  flow is deferred to the learning environment module.
- Status values: not_started, in_progress, certified.

---

## Step 1 - Database migration (run in Supabase SQL editor)

Open the Supabase SQL Editor, paste this, and run it.

```sql
-- Skills catalog
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  description text,
  safety_critical boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Per-member certification record
create table if not exists public.member_skills (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','certified')),
  certified_by uuid references public.profiles(id) on delete set null,
  certified_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  unique (member_id, skill_id)
);

-- Helper: is the current user staff (mentor, lead, or admin)?
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_role('mentor')
      or public.has_role('lead')
      or public.has_role('admin');
$$;

-- RLS
alter table public.skills enable row level security;
alter table public.member_skills enable row level security;

drop policy if exists "skills readable by authenticated" on public.skills;
create policy "skills readable by authenticated"
  on public.skills for select to authenticated using (true);

drop policy if exists "skills managed by staff" on public.skills;
create policy "skills managed by staff"
  on public.skills for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "member_skills readable by authenticated" on public.member_skills;
create policy "member_skills readable by authenticated"
  on public.member_skills for select to authenticated using (true);

drop policy if exists "member_skills written by staff" on public.member_skills;
create policy "member_skills written by staff"
  on public.member_skills for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Starter catalog (edit freely in the app later)
insert into public.skills (name, category, safety_critical, sort_order) values
  ('Shop safety',          'Safety',      true,  1),
  ('CNC router',           'Fabrication', true,  2),
  ('Mill',                 'Fabrication', true,  3),
  ('Lathe',                'Fabrication', true,  4),
  ('Laser cutter',         'Fabrication', true,  5),
  ('3D printers (Bambu)',  'Fabrication', false, 6),
  ('Hand tools',           'Fabrication', false, 7),
  ('Soldering',            'Electrical',  false, 8),
  ('Wiring / crimping',    'Electrical',  false, 9),
  ('SolidWorks modeling',  'CAD',         false, 10),
  ('CAM / toolpaths',      'CAD',         false, 11),
  ('Robot code (Java)',    'Programming', false, 12),
  ('Git / version control','Programming', false, 13),
  ('Driving',              'Drive team',  false, 14),
  ('Operating',            'Drive team',  false, 15)
on conflict (name) do nothing;
```

---

## Step 2 - UI build (Claude Code, one milestone at a time)

### Milestone A - Catalog management (staff only)
> Build a skills catalog section, gated to staff (mentor, lead, or admin) using the
> is_staff() / has_role() check. Staff can view, add, edit, and reorder skills, each
> with a name, category, description, and a safety_critical toggle. Show the catalog
> grouped by category. Commit and push.

### Milestone B - Member skills view
> Add a Skills view showing a member's skills grouped by category, split into
> certified, in progress, and not started, as a growth ladder. Show it for the
> current member on their profile, and allow viewing any other member's status
> read-only. Mark safety_critical skills with a clear indicator. Commit and push.

### Milestone C - Certify screen (staff only)
> Build a certify screen gated to staff. A staff member picks a team member and sets
> their status on any skill (not_started, in_progress, certified). Upsert the
> member_skills row. When set to certified, record certified_by as the current user
> and certified_at as now. On certified skills, display who certified them and the
> date. Commit and push.

### Milestone D - Coverage matrix (optional, staff view)
> Build a coverage matrix for staff: a grid of members by skills showing each
> member's status at a glance, so mentors can spot gaps like only two people cleared
> on the CNC. Commit and push.

---

## Deferred (NOT in v1)
- Learning content attached to each skill -> the learning environment module.
- Task eligibility (only certified members assignable to a task) -> the task list module.
- Certification expiry / annual re-cert.
- Badges or gamification.
