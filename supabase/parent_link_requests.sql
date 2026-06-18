-- ============================================================
-- Self-service parent → student link requests + staff approval queue
-- Run once in the Supabase SQL editor, BEFORE testing the UI.
--
-- A parent-role member requests a link to a student from inside the app; staff
-- (mentor/lead/admin) approve or deny from the Access Requests page. Approving
-- creates the guardian_links row and closes the request — reliably, in one
-- click (see the idempotency note on approve_parent_link).
-- ============================================================

-- ── 1. parent_link_requests ─────────────────────────────────────────────────
create table if not exists public.parent_link_requests (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  note        text,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint plr_not_self check (parent_id <> student_id)
);

-- At most one OPEN (pending) request per (parent, student) pair. A new request
-- after a deny is fine; a second pending for the same pair is not.
create unique index if not exists parent_link_requests_one_pending
  on public.parent_link_requests (parent_id, student_id)
  where status = 'pending';

alter table public.parent_link_requests enable row level security;

-- Read: staff (the review queue) or the parent about their own requests.
-- Writes go exclusively through the SECURITY DEFINER RPCs below (no write
-- policy => direct client writes are denied), so status transitions stay
-- privileged and validated.
drop policy if exists "plr read" on public.parent_link_requests;
create policy "plr read"
  on public.parent_link_requests for select to authenticated
  using (public.is_staff() or parent_id = auth.uid());

grant all on public.parent_link_requests to authenticated;

-- ── 2. request_parent_link(): a parent asks to be linked to a student ───────
create or replace function public.request_parent_link(p_student uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not public.has_role('parent') then
    raise exception 'Only parent accounts can request a student link';
  end if;
  if p_student = auth.uid() then
    raise exception 'You cannot link to yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_student) then
    raise exception 'Student not found';
  end if;
  if exists (
    select 1 from public.guardian_links
    where parent_id = auth.uid() and student_id = p_student
  ) then
    raise exception 'You are already linked to this student';
  end if;

  -- Idempotent: reuse an existing pending request rather than tripping the
  -- one-pending unique index.
  select id into v_id from public.parent_link_requests
  where parent_id = auth.uid() and student_id = p_student and status = 'pending';
  if v_id is not null then
    return v_id;
  end if;

  insert into public.parent_link_requests (parent_id, student_id, note)
  values (auth.uid(), p_student, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$fn$;

grant execute on function public.request_parent_link(uuid, text) to authenticated;

-- ── 3. approve_parent_link(): staff approve → create link, close request ────
-- Root cause of the old "approve twice and it still failed" bug: an approval
-- that inserted into guardian_links WITHOUT `on conflict do nothing` raised a
-- primary-key violation whenever the pair was already linked, which aborted the
-- whole transaction so the request status never moved off 'pending' — and every
-- retry hit the same violation. Here the insert is conflict-safe and the status
-- update always runs, so a single approval is reliable and idempotent. The row
-- lock (for update) makes concurrent approvals safe too.
create or replace function public.approve_parent_link(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_parent  uuid;
  v_student uuid;
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;

  select parent_id, student_id
    into v_parent, v_student
  from public.parent_link_requests
  where id = p_request
  for update;

  if v_parent is null then
    raise exception 'Request not found';
  end if;

  insert into public.guardian_links (parent_id, student_id, created_by)
  values (v_parent, v_student, auth.uid())
  on conflict (parent_id, student_id) do nothing;

  update public.parent_link_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request;
end;
$fn$;

grant execute on function public.approve_parent_link(uuid) to authenticated;

-- ── 4. deny_parent_link(): staff deny ───────────────────────────────────────
create or replace function public.deny_parent_link(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;

  update public.parent_link_requests
  set status = 'denied', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request;
  if not found then
    raise exception 'Request not found';
  end if;
end;
$fn$;

grant execute on function public.deny_parent_link(uuid) to authenticated;
