-- ============================================================
-- Multi-claim jobs (group activities)
-- Refactors jobs_board.sql. Run once in the Supabase SQL editor BEFORE testing.
--
-- The per-claimant lifecycle moves from tasks (claimed_by/status) into a new
-- task_claims table; tasks.status becomes staff-controlled availability.
-- Solo jobs (max_claimants = 1, the default) behave exactly as before.
-- tasks.claimed_by / tasks.verified_by are DEPRECATED but NOT dropped (live
-- data; dropping is destructive). They are left in place, unused by new logic.
-- ============================================================

-- ── 1. tasks: availability status + capacity ────────────────────────────────
alter table public.tasks add column if not exists max_claimants int default 1;

-- ── 2. task_claims: one row per member per task ─────────────────────────────
create table if not exists public.task_claims (
  task_id      uuid not null references public.tasks(id)    on delete cascade,
  member_id    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'claimed' check (status in ('claimed', 'submitted', 'completed')),
  claimed_at   timestamptz not null default now(),
  submitted_at timestamptz,
  verified_by  uuid references public.profiles(id),
  verified_at  timestamptz,
  primary key (task_id, member_id)
);

alter table public.task_claims enable row level security;

-- Everyone sees who is on a job.
drop policy if exists "task_claims readable" on public.task_claims;
create policy "task_claims readable"
  on public.task_claims for select to authenticated using (true);

-- Members never write directly (transitions go through the RPCs below, which
-- are SECURITY DEFINER and bypass RLS). Staff may manage any claim.
drop policy if exists "task_claims staff write" on public.task_claims;
create policy "task_claims staff write"
  on public.task_claims for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.task_claims to authenticated;

-- ── 3. Backfill from the old single-claim model ─────────────────────────────
insert into public.task_claims (task_id, member_id, status, claimed_at, submitted_at, verified_by, verified_at)
select
  t.id,
  t.claimed_by,
  case t.status
    when 'completed'             then 'completed'
    when 'awaiting_verification' then 'submitted'
    else                              'claimed'
  end,
  coalesce(t.updated_at, t.created_at),
  case when t.status in ('awaiting_verification', 'completed') then t.updated_at end,
  case when t.status = 'completed' then t.verified_by end,
  case when t.status = 'completed' then t.completed_at end
from public.tasks t
where t.claimed_by is not null
on conflict (task_id, member_id) do nothing;

-- ── 4. Re-point tasks.status to availability (open/closed/completed) ─────────
-- Old per-claim statuses ('claimed', 'awaiting_verification') become 'open'
-- (the claim now lives in task_claims); 'completed' stays. Drop the old CHECK
-- first so the backfilled values are valid, then re-add the tighter one.
alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks
  set status = 'open'
  where status in ('claimed', 'awaiting_verification');

-- Existing rows keep solo behavior: the max_claimants column default (1)
-- already backfilled every existing row when the column was added above.

alter table public.tasks
  add constraint tasks_status_check check (status in ('open', 'closed', 'completed'));

-- ── 5. RPCs (SECURITY DEFINER, cert gate preserved, per claimant) ───────────

-- claim_task: locks the task row FOR UPDATE for race-safe capacity, then claims
-- only if open, no existing claim, capacity free, and every required cert held.
create or replace function public.claim_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status  text;
  v_max     int;
  v_count   int;
  v_missing text;
begin
  -- Lock the task row first so concurrent claimers serialize on it.
  select status, max_claimants into v_status, v_max
  from public.tasks where id = p_task for update;
  if v_status is null then
    raise exception 'Task not found';
  end if;
  if v_status <> 'open' then
    raise exception 'Task is not open for claiming';
  end if;

  if exists (select 1 from public.task_claims where task_id = p_task and member_id = auth.uid()) then
    raise exception 'You have already claimed this task';
  end if;

  if v_max is not null then
    select count(*) into v_count from public.task_claims where task_id = p_task;
    if v_count >= v_max then
      raise exception 'This job is full';
    end if;
  end if;

  -- Cert gate: collect required skills the caller is not certified in (verbatim
  -- from the original jobs_board claim_task).
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

  insert into public.task_claims (task_id, member_id, status, claimed_at)
  values (p_task, auth.uid(), 'claimed', now());
end;
$fn$;

grant execute on function public.claim_task(uuid) to authenticated;

-- release_task: drop the caller's own claim, only while still 'claimed'.
create or replace function public.release_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_status text;
begin
  select status into v_status from public.task_claims
  where task_id = p_task and member_id = auth.uid();
  if v_status is null then
    raise exception 'You have not claimed this task';
  end if;
  if v_status <> 'claimed' then
    raise exception 'You cannot release after submitting';
  end if;
  delete from public.task_claims where task_id = p_task and member_id = auth.uid();
end;
$fn$;

grant execute on function public.release_task(uuid) to authenticated;

-- submit_task: the caller marks their own claim submitted for sign-off.
create or replace function public.submit_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_status text;
begin
  select status into v_status from public.task_claims
  where task_id = p_task and member_id = auth.uid();
  if v_status is null then
    raise exception 'You have not claimed this task';
  end if;
  if v_status <> 'claimed' then
    raise exception 'This claim is not in a claimed state';
  end if;
  update public.task_claims
  set status = 'submitted', submitted_at = now()
  where task_id = p_task and member_id = auth.uid();
end;
$fn$;

grant execute on function public.submit_task(uuid) to authenticated;

-- verify_task: SIGNATURE CHANGED — now takes the member. Staff sign-off per
-- claimant. Drop the old 2-arg version so only the new one exists.
drop function if exists public.verify_task(uuid, boolean);

create or replace function public.verify_task(p_task uuid, p_member uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_status text;
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;

  select status into v_status from public.task_claims
  where task_id = p_task and member_id = p_member for update;
  if v_status is null then
    raise exception 'Claim not found';
  end if;
  if v_status <> 'submitted' then
    raise exception 'This claim is not awaiting verification';
  end if;

  if p_approve then
    update public.task_claims
    set status = 'completed', verified_by = auth.uid(), verified_at = now()
    where task_id = p_task and member_id = p_member;
  else
    update public.task_claims
    set status = 'claimed', submitted_at = null, verified_by = null, verified_at = null
    where task_id = p_task and member_id = p_member;
  end if;
end;
$fn$;

grant execute on function public.verify_task(uuid, uuid, boolean) to authenticated;
