-- ============================================================
-- platform_foundation migration — paste into Supabase Dashboard → SQL Editor
-- Reconciles with existing profiles table and handle_new_user trigger.
-- ============================================================

-- 1. Additive columns on profiles
alter table public.profiles add column if not exists grad_year int;
alter table public.profiles add column if not exists status text not null default 'active';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_status_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_status_chk
      check (status in ('active','inactive','alumni'));
  end if;
end $$;

-- 2. Member roles table (supports multiple roles per person)
create table if not exists public.member_roles (
  member_id uuid not null references public.profiles(id) on delete cascade,
  role      text not null check (role in ('student','mentor','lead','admin')),
  primary key (member_id, role)
);

-- Backfill every existing profile with the default student role
insert into public.member_roles (member_id, role)
select id, 'student' from public.profiles
on conflict do nothing;

-- Also backfill from profiles.role if that column exists
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    execute $q$
      insert into public.member_roles (member_id, role)
      select id, role from public.profiles where role is not null
      on conflict do nothing
    $q$;
  end if;
end $$;

-- 3. has_role(): the one permission check every feature reuses.
-- SECURITY DEFINER lets it read member_roles without tripping RLS on that table.
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

-- 4. Update existing handle_new_user trigger to also assign student role on signup.
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

-- 5. RLS: profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin"
  on public.profiles for update to authenticated
  using  (id = auth.uid() or public.has_role('admin'))
  with check (id = auth.uid() or public.has_role('admin'));

-- 6. RLS: member_roles
alter table public.member_roles enable row level security;

drop policy if exists "roles readable by authenticated" on public.member_roles;
create policy "roles readable by authenticated"
  on public.member_roles for select to authenticated using (true);

drop policy if exists "roles writable by admin only" on public.member_roles;
create policy "roles writable by admin only"
  on public.member_roles for all to authenticated
  using  (public.has_role('admin'))
  with check (public.has_role('admin'));

-- 7. attendance_events: ensure user_id references profiles(id).
-- Drops any existing FK on user_id (was likely -> auth.users) and re-points to profiles.
do $$
declare v_con text;
begin
  select tc.constraint_name into v_con
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on  tc.constraint_name = kcu.constraint_name
    and tc.table_schema    = kcu.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and tc.table_name   = 'attendance_events'
    and kcu.column_name = 'user_id'
  limit 1;
  if v_con is not null then
    execute 'alter table public.attendance_events drop constraint ' || quote_ident(v_con);
  end if;
end $$;

alter table public.attendance_events
  add constraint attendance_events_user_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- 8. RLS: attendance_events
-- All members can read (needed for team hours board).
-- Members can only insert their own rows.
alter table public.attendance_events enable row level security;

drop policy if exists "attendance read all members" on public.attendance_events;
create policy "attendance read all members"
  on public.attendance_events for select to authenticated
  using (true);

drop policy if exists "attendance insert own" on public.attendance_events;
create policy "attendance insert own"
  on public.attendance_events for insert to authenticated
  with check (user_id = auth.uid());
