-- ============================================================
-- Member skill-cert requests + staff approval queue
-- Run once in the Supabase SQL editor, BEFORE testing the UI.
--
-- A member requests certification in a skill from their skills dashboard; staff
-- (mentor/lead/admin) approve or deny from the Access Requests page. Approving
-- certifies the member (writes member_skills) and closes the request — reliably,
-- in one click. Mirrors parent_link_requests.
-- ============================================================

-- ── 1. cert_requests ────────────────────────────────────────────────────────
create table if not exists public.cert_requests (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  skill_id    uuid not null references public.skills(id)   on delete cascade,
  note        text,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- At most one OPEN (pending) request per (member, skill). A new request after a
-- deny is fine; a second pending for the same skill is not.
create unique index if not exists cert_requests_one_pending
  on public.cert_requests (member_id, skill_id)
  where status = 'pending';

alter table public.cert_requests enable row level security;

-- Read: staff (the review queue) or the member about their own requests.
-- All writes go through the SECURITY DEFINER RPCs below (no write policy =>
-- direct client writes are denied).
drop policy if exists "cr read" on public.cert_requests;
create policy "cr read"
  on public.cert_requests for select to authenticated
  using (public.is_staff() or member_id = auth.uid());

grant all on public.cert_requests to authenticated;

-- ── 2. request_cert(): a member asks to be certified in a skill ─────────────
create or replace function public.request_cert(p_skill uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.skills where id = p_skill) then
    raise exception 'Skill not found';
  end if;
  if exists (
    select 1 from public.member_skills
    where member_id = auth.uid() and skill_id = p_skill and status = 'certified'
  ) then
    raise exception 'You are already certified in this skill';
  end if;

  -- Idempotent: reuse an existing pending request rather than tripping the
  -- one-pending unique index.
  select id into v_id from public.cert_requests
  where member_id = auth.uid() and skill_id = p_skill and status = 'pending';
  if v_id is not null then
    return v_id;
  end if;

  insert into public.cert_requests (member_id, skill_id, note)
  values (auth.uid(), p_skill, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$fn$;

grant execute on function public.request_cert(uuid, text) to authenticated;

-- ── 3. approve_cert_request(): staff approve → certify, close request ───────
-- Idempotent + race-safe (mirrors approve_parent_link): the member_skills write
-- is an upsert to 'certified' and the status update always runs, so one click
-- reliably certifies even if the member already had an in-progress row, and the
-- row lock serializes concurrent approvals.
create or replace function public.approve_cert_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_member uuid;
  v_skill  uuid;
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;

  select member_id, skill_id
    into v_member, v_skill
  from public.cert_requests
  where id = p_request
  for update;

  if v_member is null then
    raise exception 'Request not found';
  end if;

  insert into public.member_skills (member_id, skill_id, status, certified_by, certified_at, updated_at)
  values (v_member, v_skill, 'certified', auth.uid(), now(), now())
  on conflict (member_id, skill_id) do update
    set status       = 'certified',
        certified_by = excluded.certified_by,
        certified_at = excluded.certified_at,
        updated_at   = now();

  update public.cert_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request;
end;
$fn$;

grant execute on function public.approve_cert_request(uuid) to authenticated;

-- ── 4. deny_cert_request(): staff deny ──────────────────────────────────────
create or replace function public.deny_cert_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;

  update public.cert_requests
  set status = 'denied', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request;
  if not found then
    raise exception 'Request not found';
  end if;
end;
$fn$;

grant execute on function public.deny_cert_request(uuid) to authenticated;
