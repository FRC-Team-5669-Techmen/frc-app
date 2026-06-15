-- Jobs / Tasks board with certification-gated claiming and mentor sign-off.
-- Members never UPDATE the tasks table directly. Every claim / release / submit /
-- verify transition goes through a SECURITY DEFINER RPC, so the cert gate cannot
-- be bypassed from the client.
-- Run once in the Supabase SQL editor.

-- 1. tasks
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  subteam      text,
  status       text not null default 'open'
                 check (status in ('open', 'claimed', 'awaiting_verification', 'completed')),
  claimed_by   uuid references public.profiles(id),
  verified_by  uuid references public.profiles(id),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- 2. task_required_skills: the certifications a member must hold to claim a task
create table if not exists public.task_required_skills (
  task_id  uuid not null references public.tasks(id)  on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  primary key (task_id, skill_id)
);

-- 3. RLS: tasks
alter table public.tasks enable row level security;

drop policy if exists "tasks readable by authenticated" on public.tasks;
create policy "tasks readable by authenticated"
  on public.tasks for select to authenticated using (true);

-- Staff create / edit / delete jobs. Members get NO direct update policy; their
-- transitions happen only through the RPCs below.
drop policy if exists "tasks writable by staff" on public.tasks;
create policy "tasks writable by staff"
  on public.tasks for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

-- 4. RLS: task_required_skills
alter table public.task_required_skills enable row level security;

drop policy if exists "task_skills readable by authenticated" on public.task_required_skills;
create policy "task_skills readable by authenticated"
  on public.task_required_skills for select to authenticated using (true);

drop policy if exists "task_skills writable by staff" on public.task_required_skills;
create policy "task_skills writable by staff"
  on public.task_required_skills for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.tasks to authenticated;
grant all on public.task_required_skills to authenticated;

-- 5. claim_task(): cert-gated claim. Open tasks only; caller must hold a
-- 'certified' member_skills row for every required skill or the claim is
-- rejected with the missing skill name(s).
create or replace function public.claim_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status  text;
  v_missing text;
begin
  select status into v_status from public.tasks where id = p_task for update;
  if v_status is null then
    raise exception 'Task not found';
  end if;
  if v_status <> 'open' then
    raise exception 'Task is not open for claiming';
  end if;

  -- Collect required skills the caller is not certified in
  select string_agg(s.name, ', ' order by s.name) into v_missing
  from public.task_required_skills trs
  join public.skills s on s.id = trs.skill_id
  where trs.task_id = p_task
    and not exists (
      select 1 from public.member_skills ms
      where ms.member_id = auth.uid()
        and ms.skill_id  = trs.skill_id
        and ms.status    = 'certified'
    );

  if v_missing is not null then
    raise exception 'Missing required certification(s): %', v_missing;
  end if;

  update public.tasks
  set claimed_by = auth.uid(),
      status     = 'claimed',
      updated_at = now()
  where id = p_task;
end;
$fn$;

grant execute on function public.claim_task(uuid) to authenticated;

-- 6. release_task(): the claimer drops a claimed task back to open.
create or replace function public.release_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status  text;
  v_claimed uuid;
begin
  select status, claimed_by into v_status, v_claimed
  from public.tasks where id = p_task for update;
  if v_status is null then
    raise exception 'Task not found';
  end if;
  if v_claimed is distinct from auth.uid() then
    raise exception 'You have not claimed this task';
  end if;
  if v_status <> 'claimed' then
    raise exception 'Task is not in a claimed state';
  end if;

  update public.tasks
  set status = 'open', claimed_by = null, updated_at = now()
  where id = p_task;
end;
$fn$;

grant execute on function public.release_task(uuid) to authenticated;

-- 7. submit_task(): the claimer marks a claimed task done, awaiting sign-off.
create or replace function public.submit_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status  text;
  v_claimed uuid;
begin
  select status, claimed_by into v_status, v_claimed
  from public.tasks where id = p_task for update;
  if v_status is null then
    raise exception 'Task not found';
  end if;
  if v_claimed is distinct from auth.uid() then
    raise exception 'You have not claimed this task';
  end if;
  if v_status <> 'claimed' then
    raise exception 'Task is not in a claimed state';
  end if;

  update public.tasks
  set status = 'awaiting_verification', updated_at = now()
  where id = p_task;
end;
$fn$;

grant execute on function public.submit_task(uuid) to authenticated;

-- 8. verify_task(): staff sign-off. Approve completes; reject sends it back to
-- 'claimed' so the same student can redo it (claimed_by is left untouched).
create or replace function public.verify_task(p_task uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status text;
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;

  select status into v_status from public.tasks where id = p_task for update;
  if v_status is null then
    raise exception 'Task not found';
  end if;
  if v_status <> 'awaiting_verification' then
    raise exception 'Task is not awaiting verification';
  end if;

  if p_approve then
    update public.tasks
    set status       = 'completed',
        verified_by  = auth.uid(),
        completed_at = now(),
        updated_at   = now()
    where id = p_task;
  else
    update public.tasks
    set status      = 'claimed',
        verified_by = null,
        updated_at  = now()
    where id = p_task;
  end if;
end;
$fn$;

grant execute on function public.verify_task(uuid, boolean) to authenticated;
