-- Open job creation to all members (previously staff-only).
-- Any authenticated member may now INSERT a job they own; edit/delete stay
-- staff-only (no member UPDATE/DELETE policy exists, and the existing
-- "tasks writable by staff" for-all policy is left intact for staff).
-- Run once in the Supabase SQL editor.

-- tasks: permissive member INSERT policy. RLS policies are OR'd, so this sits
-- alongside the staff for-all policy — a non-staff insert passes here as long as
-- the row is owned by the caller. UPDATE/DELETE remain staff-only because no
-- member policy grants them.
drop policy if exists "tasks insert own" on public.tasks;
create policy "tasks insert own"
  on public.tasks for insert to authenticated
  with check (created_by = auth.uid());

-- task_required_skills: let a job's creator attach required certs to a task they
-- just created (the form inserts these right after the task). Scoped to tasks the
-- caller owns; staff write policy is unchanged.
drop policy if exists "task_skills insert own task" on public.task_required_skills;
create policy "task_skills insert own task"
  on public.task_required_skills for insert to authenticated
  with check (exists (
    select 1 from public.tasks t
    where t.id = task_id and t.created_by = auth.uid()
  ));
