-- ============================================================
-- Collective cert-gating for group jobs
-- Run once in the Supabase SQL editor.
--
-- Old behavior: claim_task required the claimant to hold EVERY required cert.
-- New behavior: required certs are covered collectively by the group, so a
-- member may claim a cert-gated job if they hold AT LEAST ONE of its required
-- certs (a member with none of them is blocked). Jobs with no required certs
-- are unchanged. "Full coverage" (the union of claimants covers every required
-- cert) is surfaced in the UI; the server only gates the individual claim.
--
-- No table/column changes — only the claim_task function body changes.
-- ============================================================

create or replace function public.claim_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status   text;
  v_max      int;
  v_count    int;
  v_req      int;   -- number of required certs on this task
  v_have     int;   -- how many of them the caller holds
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

  -- Collective cert gate: if the job requires any certs, the caller must hold at
  -- least one of them (the rest can be covered by other claimants).
  select count(*) into v_req
  from public.task_required_skills where task_id = p_task;

  if v_req > 0 then
    select count(*) into v_have
    from public.task_required_skills trs
    join public.member_skills ms
      on ms.skill_id  = trs.skill_id
     and ms.member_id = auth.uid()
     and ms.status    = 'certified'
    where trs.task_id = p_task;

    if v_have = 0 then
      raise exception 'You need at least one of this job''s required certifications to claim it';
    end if;
  end if;

  insert into public.task_claims (task_id, member_id, status, claimed_at)
  values (p_task, auth.uid(), 'claimed', now());
end;
$fn$;

grant execute on function public.claim_task(uuid) to authenticated;
