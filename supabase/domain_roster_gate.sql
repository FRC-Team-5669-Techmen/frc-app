-- Domain-based roster access gate.
-- Signing in no longer grants access on its own. A member is approved only if
-- their email domain is on allowed_domains (or an admin approved them manually).
-- handle_new_user() now creates the profile row only; claim_profile() is the
-- single path to approved + the default student role.
-- Run once in the Supabase SQL editor.

-- 1. allowed_domains: the domains that auto-approve on sign-in
create table if not exists public.allowed_domains (
  domain     text primary key,
  added_by   uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Seed the team's school domains (lowercased)
insert into public.allowed_domains (domain) values
  ('boscotech.edu'),
  ('boscotech.net')
on conflict (domain) do nothing;

alter table public.allowed_domains enable row level security;

drop policy if exists "allowed_domains readable by authenticated" on public.allowed_domains;
create policy "allowed_domains readable by authenticated"
  on public.allowed_domains for select to authenticated using (true);

drop policy if exists "allowed_domains writable by admin" on public.allowed_domains;
create policy "allowed_domains writable by admin"
  on public.allowed_domains for all to authenticated
  using  (public.has_role('admin'))
  with check (public.has_role('admin'));

grant all on public.allowed_domains to authenticated;

-- 2. profiles.approved: the access gate, separate from profiles.status.
-- status keeps its own meaning (active / inactive / alumni) and is untouched.
alter table public.profiles add column if not exists approved boolean not null default false;

-- 3. ANTI-LOCKOUT: approve every existing profile before the trigger change
-- below takes effect, so nobody currently using the app is gated out on deploy.
update public.profiles set approved = true where approved = false;

-- 4. claim_profile(): the only path to approved + the default student role.
-- Approves the caller when their email domain is allowed (or they are already
-- approved), then ensures a single student role. Never grants any higher role;
-- elevation stays admin-only and manual.
create or replace function public.claim_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email    text := lower(auth.email());
  v_domain   text;
  v_matched  boolean;
  v_approved boolean;
begin
  if v_email is null then
    return false;
  end if;

  -- Make sure the caller's profile row exists before we touch it
  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;

  v_domain := split_part(v_email, '@', 2);

  select exists (
    select 1 from public.allowed_domains where domain = v_domain
  ) into v_matched;

  select approved into v_approved from public.profiles where id = auth.uid();

  if v_matched or coalesce(v_approved, false) then
    update public.profiles set approved = true where id = auth.uid();
    insert into public.member_roles (member_id, role)
    values (auth.uid(), 'student')
    on conflict do nothing;
    return true;
  end if;

  return false;
end;
$fn$;

grant execute on function public.claim_profile() to authenticated;

-- 5. handle_new_user(): create the profile only. No auto student role anymore;
-- claim_profile() grants it once the domain check passes. Keeps the Google
-- avatar capture from the prior version.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

-- 6. admin_get_members(): include the approved flag so the roster can surface
-- pending members. DROP required because the return type changed.
drop function if exists public.admin_get_members();

create function public.admin_get_members()
returns table (
  id       uuid,
  full_name text,
  email    text,
  status   text,
  approved boolean,
  roles    text[],
  subteams text[]
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_role('admin') then
    raise exception 'Permission denied: admin role required';
  end if;
  return query
    select
      p.id,
      p.full_name::text,
      u.email::text,
      p.status::text,
      p.approved,
      array_remove(array_agg(mr.role order by mr.role), null)::text[] as roles,
      coalesce(p.subteams, '{}')::text[]                               as subteams
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.member_roles mr on mr.member_id = p.id
    group by p.id, p.full_name, u.email, p.status, p.approved, p.subteams
    order by lower(p.full_name);
end;
$fn$;

grant execute on function public.admin_get_members() to authenticated;
