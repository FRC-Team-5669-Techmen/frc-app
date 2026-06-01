-- Run this in the Supabase SQL editor to create the logged_hours table.

create table if not exists public.logged_hours (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  hours       numeric(5,2) not null check (hours > 0 and hours <= 24),
  type        text not null check (type in ('volunteering', 'outreach', 'competition')),
  description text,
  status      text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

alter table public.logged_hours enable row level security;

-- Members: view their own entries
create policy "lh select own" on public.logged_hours
  for select using (member_id = auth.uid());

-- Members: submit new pending entries only
create policy "lh insert own pending" on public.logged_hours
  for insert with check (member_id = auth.uid() and status = 'pending');

-- Members: delete their own pending entries (cannot delete once verified/rejected)
create policy "lh delete own pending" on public.logged_hours
  for delete using (member_id = auth.uid() and status = 'pending');

-- Staff: view all entries (for future review)
create policy "lh staff select" on public.logged_hours
  for select using (public.is_staff());

-- Staff: update status and reviewed_by (verify / reject)
create policy "lh staff update" on public.logged_hours
  for update using (public.is_staff());

grant all on public.logged_hours to authenticated;
