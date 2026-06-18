-- ============================================================
-- Jobs: richer content (links + images), progress updates, per-job time
-- tracking, and an admin "undo completion".
-- Run once in the Supabase SQL editor, BEFORE testing the UI.
-- ============================================================

-- ── 1. tasks: reference links + uploaded image paths (jsonb arrays) ─────────
-- links:  [{ "label": "...", "url": "..." }]
-- images: ["task/<id>/<uuid>.jpg", ...]  (paths in the 'jobs' storage bucket)
alter table public.tasks add column if not exists links  jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists images jsonb not null default '[]'::jsonb;

-- ── 2. attendance_events.job_id: link a check-in session to a job ───────────
-- Reuse the existing attendance stream rather than a parallel time system. The
-- job is stamped on the 'in' event of a session; total time per member per job
-- = sum of that session's duration. set_session_job() (below) is the only writer
-- for members (attendance_events has no member UPDATE policy).
alter table public.attendance_events
  add column if not exists job_id uuid references public.tasks(id) on delete set null;
create index if not exists attendance_events_job_idx on public.attendance_events (job_id);

-- ── 3. task_updates: progress thread ────────────────────────────────────────
create table if not exists public.task_updates (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id)    on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  body       text,
  image_path text,
  created_at timestamptz not null default now(),
  constraint task_updates_nonempty
    check (coalesce(btrim(body), '') <> '' or image_path is not null)
);
create index if not exists task_updates_task_idx on public.task_updates (task_id, created_at);

alter table public.task_updates enable row level security;

drop policy if exists "task_updates readable" on public.task_updates;
create policy "task_updates readable"
  on public.task_updates for select to authenticated using (true);

-- A member may post on a job they have claimed; staff may post on any job.
-- member_id is always the author.
drop policy if exists "task_updates insert" on public.task_updates;
create policy "task_updates insert"
  on public.task_updates for insert to authenticated
  with check (
    member_id = auth.uid()
    and (
      public.is_staff()
      or exists (
        select 1 from public.task_claims tc
        where tc.task_id = task_updates.task_id and tc.member_id = auth.uid()
      )
    )
  );

drop policy if exists "task_updates delete own or staff" on public.task_updates;
create policy "task_updates delete own or staff"
  on public.task_updates for delete to authenticated
  using (member_id = auth.uid() or public.is_staff());

grant all on public.task_updates to authenticated;

-- ── 4. set_session_job(): member links their current open session to a job ──
-- Simplest reliable time link: the member taps "I'm on this job" in the job
-- detail; it stamps their currently-open check-in ('in' with no following
-- 'out') with the job id. Requires a claim on the job and being checked in.
create or replace function public.set_session_job(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id   uuid;
  v_type text;
begin
  if not exists (
    select 1 from public.task_claims where task_id = p_task and member_id = auth.uid()
  ) then
    raise exception 'Claim this job before logging time to it';
  end if;

  select id, type into v_id, v_type
  from public.attendance_events
  where user_id = auth.uid()
  order by event_time desc
  limit 1;

  if v_id is null or v_type <> 'in' then
    raise exception 'Check in first, then you can log this session to the job';
  end if;

  update public.attendance_events set job_id = p_task where id = v_id;
end;
$fn$;

grant execute on function public.set_session_job(uuid) to authenticated;

-- ── 5. admin_revert_claim(): undo a completed/approved claim ────────────────
-- Restores an approved claim to its pre-approval state ('submitted', verifier
-- cleared) so staff can re-review, and reopens the job if it had been marked
-- completed. Admin only; the UI gates it behind a confirmation.
create or replace function public.admin_revert_claim(p_task uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status text;
begin
  if not public.has_role('admin') then
    raise exception 'Permission denied: admin role required';
  end if;

  select status into v_status from public.task_claims
  where task_id = p_task and member_id = p_member for update;
  if v_status is null then
    raise exception 'Claim not found';
  end if;
  if v_status <> 'completed' then
    raise exception 'Only an approved claim can be reverted';
  end if;

  update public.task_claims
  set status = 'submitted', verified_by = null, verified_at = null
  where task_id = p_task and member_id = p_member;

  -- If the whole job had been marked completed, reopen it so it's actionable.
  update public.tasks
  set status = 'open', completed_at = null, updated_at = now()
  where id = p_task and status = 'completed';
end;
$fn$;

grant execute on function public.admin_revert_claim(uuid, uuid) to authenticated;

-- ── 6. Storage bucket 'jobs' for job + progress images ──────────────────────
insert into storage.buckets (id, name, public)
values ('jobs', 'jobs', true)
on conflict (id) do nothing;

-- Public read (reference photos, not sensitive); authenticated upload;
-- uploader or staff may delete.
drop policy if exists "jobs images read" on storage.objects;
create policy "jobs images read"
  on storage.objects for select to public
  using (bucket_id = 'jobs');

drop policy if exists "jobs images upload" on storage.objects;
create policy "jobs images upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'jobs');

drop policy if exists "jobs images delete" on storage.objects;
create policy "jobs images delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'jobs' and (owner = auth.uid() or public.is_staff()));
