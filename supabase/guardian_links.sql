-- ============================================================
-- Guardian links + parent read scope
-- Run once in the Supabase SQL editor, BEFORE testing the parent dashboard.
--
-- Links an approved parent (role 'parent') to one or more students so the
-- parent dashboard can show each child's live status, hours, and skills.
-- Linking is staff-managed via SECURITY DEFINER RPCs (jobs_board pattern);
-- members never write guardian_links directly.
-- ============================================================

-- ── 1. guardian_links ───────────────────────────────────────────────────────
create table if not exists public.guardian_links (
  parent_id  uuid not null,
  student_id uuid not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint guardian_links_parent_fk  foreign key (parent_id)  references public.profiles(id) on delete cascade,
  constraint guardian_links_student_fk foreign key (student_id) references public.profiles(id) on delete cascade,
  primary key (parent_id, student_id)   -- unique(parent_id, student_id)
);

alter table public.guardian_links enable row level security;

-- Readable by staff, and by the parent about their own links.
drop policy if exists "guardian_links read" on public.guardian_links;
create policy "guardian_links read"
  on public.guardian_links for select to authenticated
  using (public.is_staff() or parent_id = auth.uid());

-- Writable by staff only (RPCs below are the supported path).
drop policy if exists "guardian_links staff write" on public.guardian_links;
create policy "guardian_links staff write"
  on public.guardian_links for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.guardian_links to authenticated;

-- ── 2. logged_hours: let a parent read their linked students' entries ────────
-- attendance_events, member_skills, skills, and profiles are already readable
-- by any authenticated member; logged_hours was owner/staff-only, so a parent
-- needs this scoped policy to see a child's logged-hours summary.
drop policy if exists "lh parent select" on public.logged_hours;
create policy "lh parent select"
  on public.logged_hours for select to authenticated
  using (
    exists (
      select 1 from public.guardian_links gl
      where gl.parent_id = auth.uid()
        and gl.student_id = public.logged_hours.member_id
    )
  );

-- ── 3. link / unlink RPCs (staff only) ──────────────────────────────────────
create or replace function public.link_guardian(p_parent uuid, p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;
  if p_parent = p_student then
    raise exception 'A member cannot be their own guardian';
  end if;
  insert into public.guardian_links (parent_id, student_id, created_by)
  values (p_parent, p_student, auth.uid())
  on conflict (parent_id, student_id) do nothing;
end;
$fn$;

grant execute on function public.link_guardian(uuid, uuid) to authenticated;

create or replace function public.unlink_guardian(p_parent uuid, p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;
  delete from public.guardian_links
  where parent_id = p_parent and student_id = p_student;
end;
$fn$;

grant execute on function public.unlink_guardian(uuid, uuid) to authenticated;
