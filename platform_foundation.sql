-- ============================================================
-- Techmen platform: members + roles foundation
-- Builds on the existing `profiles` table from the attendance app.
--
-- HOW TO USE: hand this to Claude Code and ask it to migrate the
-- database to match, reconciling with the profiles table and signup
-- trigger you already have. Don't blind-paste it if you're unsure what
-- already exists -- let Claude Code adapt it to the current schema.
--
-- Designed so scouting, the learning environment, and the task list all
-- plug in later just by referencing profiles(id) and reusing has_role().
-- ============================================================

-- 1. PROFILES = the central member record (one row per person).
-- Additive columns, safe to run on the existing table.
alter table public.profiles add column if not exists grad_year int;
alter table public.profiles add column if not exists status text not null default 'active';
-- status should be one of: active, inactive, alumni.
-- Add this constraint once (it is not re-runnable, so guard or skip if present):
-- alter table public.profiles add constraint profiles_status_chk
--   check (status in ('active','inactive','alumni'));

-- 2. MEMBER_ROLES = a person can hold more than one role.
create table if not exists public.member_roles (
  member_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('student','mentor','lead','admin')),
  primary key (member_id, role)
);

-- Backfill from the single role column the app used before (safe to re-run).
-- Skip this line if your profiles table has no `role` column.
insert into public.member_roles (member_id, role)
select id, role from public.profiles
where role is not null
on conflict do nothing;

-- 3. has_role(): the one permission check every feature reuses.
-- SECURITY DEFINER lets it read member_roles without tripping that table's
-- own RLS, which also prevents infinite recursion inside policies.
create or replace function public.has_role(check_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_roles
    where member_id = auth.uid() and role = check_role
  );
$$;

-- 4. Auto-create a profile + default 'student' role on signup.
-- Reconcile with any signup trigger you already have rather than duplicating.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  insert into public.member_roles (member_id, role)
  values (new.id, 'student')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Row Level Security.
alter table public.profiles enable row level security;
alter table public.member_roles enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role('admin'))
  with check (id = auth.uid() or public.has_role('admin'));

drop policy if exists "roles readable by authenticated" on public.member_roles;
create policy "roles readable by authenticated"
  on public.member_roles for select to authenticated using (true);

drop policy if exists "roles writable by admin only" on public.member_roles;
create policy "roles writable by admin only"
  on public.member_roles for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- 6. BOOTSTRAP: make yourself the first admin. Run once, after you have
-- signed in at least once. Replace the email with your school email.
-- insert into public.member_roles (member_id, role)
-- select p.id, 'admin' from public.profiles p
-- join auth.users u on u.id = p.id
-- where u.email = 'you@school.org'
-- on conflict do nothing;

-- ============================================================
-- EXTENSION PATTERN -- the shape every future table follows.
-- Everything references profiles(id) and reuses has_role() for its rules.
--
--   create table public.tasks (
--     id uuid primary key default gen_random_uuid(),
--     title text not null,
--     assigned_to uuid references public.profiles(id) on delete set null,
--     created_by  uuid references public.profiles(id) on delete set null,
--     status text not null default 'open',
--     created_at timestamptz not null default now()
--   );
--   -- e.g. all members read; only leads/mentors write:
--   --   select: using ( true )
--   --   write:  using ( has_role('lead') or has_role('mentor') )
--
-- Same shape for scouting (scout_id -> profiles), the learning environment
-- (a member_skills table: member_id -> profiles, one row per skill/person),
-- and attendance (point attendance_events at profiles(id)).
-- ============================================================
