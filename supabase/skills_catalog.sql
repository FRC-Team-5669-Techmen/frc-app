-- ── 1. is_staff() helper ────────────────────────────────────────────────────
-- Reusable permission check: true for mentor, lead, or admin.
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_roles
    where member_id = auth.uid()
      and role in ('mentor', 'lead', 'admin')
  );
$$;

grant execute on function public.is_staff() to authenticated;

-- ── 2. skills table ──────────────────────────────────────────────────────────
create table if not exists public.skills (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  category        text        not null default 'General',
  description     text,
  safety_critical boolean     not null default false,
  sort_order      int         not null default 0,
  created_at      timestamptz not null default now()
);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
alter table public.skills enable row level security;

drop policy if exists "skills readable by authenticated" on public.skills;
create policy "skills readable by authenticated"
  on public.skills for select to authenticated using (true);

drop policy if exists "skills writable by staff" on public.skills;
create policy "skills writable by staff"
  on public.skills for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());
