-- ── 1. New columns ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists nickname   text;
alter table public.profiles add column if not exists bio        text;
alter table public.profiles add column if not exists shirt_size text;
alter table public.profiles add column if not exists subteam    text;
alter table public.profiles add column if not exists avatar_url text;

-- ── 2. Signup trigger – capture Google photo on new account creation ─────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.member_roles (member_id, role)
  values (new.id, 'student')
  on conflict do nothing;

  return new;
end;
$$;

-- ── 3. Backfill avatar_url for members who already exist ────────────────────
-- References the Google-hosted URL stored in raw_user_meta_data; does not
-- copy or re-host the image.
update public.profiles p
set avatar_url = u.raw_user_meta_data->>'avatar_url'
from auth.users u
where u.id = p.id
  and p.avatar_url is null
  and u.raw_user_meta_data->>'avatar_url' is not null;
