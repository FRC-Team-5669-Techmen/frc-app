-- member_skills: one row per member per skill that has been started or certified.
-- Absence of a row means 'not started'; no status column needed for that state.

create table if not exists public.member_skills (
  member_id    uuid not null references public.profiles(id) on delete cascade,
  skill_id     uuid not null references public.skills(id)   on delete cascade,
  status       text not null check (status in ('in_progress', 'certified')),
  certified_by uuid          references public.profiles(id) on delete set null,
  updated_at   timestamptz   not null default now(),
  primary key (member_id, skill_id)
);

alter table public.member_skills enable row level security;

-- Everyone can read the full skills ladder
drop policy if exists "member_skills readable" on public.member_skills;
create policy "member_skills readable"
  on public.member_skills for select to authenticated using (true);

-- Members can insert/update their own rows to 'in_progress' only
-- and delete their own in_progress rows (to reset to not started).
-- The USING on in_progress rows prevents deleting a certified row.
drop policy if exists "member_skills self insert" on public.member_skills;
create policy "member_skills self insert"
  on public.member_skills for insert to authenticated
  with check (member_id = auth.uid() and status = 'in_progress');

drop policy if exists "member_skills self update" on public.member_skills;
create policy "member_skills self update"
  on public.member_skills for update to authenticated
  using  (member_id = auth.uid() and status = 'in_progress')
  with check (member_id = auth.uid() and status = 'in_progress');

drop policy if exists "member_skills self delete" on public.member_skills;
create policy "member_skills self delete"
  on public.member_skills for delete to authenticated
  using  (member_id = auth.uid() and status = 'in_progress');

-- Staff can write any row at any status (including 'certified')
drop policy if exists "member_skills staff write" on public.member_skills;
create policy "member_skills staff write"
  on public.member_skills for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());
