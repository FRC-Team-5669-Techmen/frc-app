-- ============================================================
-- Access-request system + 'parent' role  (M3/M4 foundation)
-- Run once in the Supabase SQL editor, BEFORE testing the UI.
--
-- Adds: 'parent' role, approved_emails whitelist, access_requests table,
-- an extended claim_profile() approval order, and staff-only approve/deny RPCs.
-- Anti-lockout: the boscotech.edu domain auto-approve and every existing
-- approved user keep working untouched.
-- ============================================================

-- ── 1. 'parent' role on member_roles ────────────────────────────────────────
-- Drop the existing role CHECK (the inline one is named *_role_check) and
-- re-add it with 'parent'. is_staff() is intentionally NOT changed: parents
-- are not staff.
alter table public.member_roles drop constraint if exists member_roles_role_check;
alter table public.member_roles drop constraint if exists member_roles_role_chk;
alter table public.member_roles
  add constraint member_roles_role_chk
  check (role in ('student', 'mentor', 'lead', 'admin', 'parent'));

-- ── 2. approved_emails: per-email whitelist with the role to grant ───────────
-- Read by claim_profile() (SECURITY DEFINER, so it bypasses this RLS). Staff
-- are the only direct readers/writers from the client.
create table if not exists public.approved_emails (
  email        text primary key check (email = lower(email)),
  granted_role text not null check (granted_role in ('student', 'mentor', 'parent')),
  added_by     uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.approved_emails enable row level security;

drop policy if exists "approved_emails staff read"  on public.approved_emails;
create policy "approved_emails staff read"
  on public.approved_emails for select to authenticated
  using (public.is_staff());

drop policy if exists "approved_emails staff write" on public.approved_emails;
create policy "approved_emails staff write"
  on public.approved_emails for all to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.approved_emails to authenticated;

-- ── 3. access_requests: the request queue ───────────────────────────────────
create table if not exists public.access_requests (
  id             uuid primary key default gen_random_uuid(),
  email          text not null check (email = lower(email)),
  full_name      text,
  requested_role text check (requested_role in ('student', 'mentor', 'parent')),
  note           text,
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'denied')),
  reviewed_by    uuid references public.profiles(id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- At most one OPEN (pending) request per email.
create unique index if not exists access_requests_one_pending
  on public.access_requests (email)
  where status = 'pending';

alter table public.access_requests enable row level security;

-- A user may insert only a pending request for their own email.
drop policy if exists "access_requests insert own" on public.access_requests;
create policy "access_requests insert own"
  on public.access_requests for insert to authenticated
  with check (email = lower(auth.email()) and status = 'pending');

-- Reading and reviewing are staff-only. Requesters check their own status via
-- my_access_request_status() (SECURITY DEFINER) instead of a SELECT policy.
drop policy if exists "access_requests staff read" on public.access_requests;
create policy "access_requests staff read"
  on public.access_requests for select to authenticated
  using (public.is_staff());

drop policy if exists "access_requests staff update" on public.access_requests;
create policy "access_requests staff update"
  on public.access_requests for update to authenticated
  using  (public.is_staff())
  with check (public.is_staff());

grant all on public.access_requests to authenticated;

-- ── 4. claim_profile(): extended approval order ─────────────────────────────
-- Approved if: email domain is in allowed_domains, OR the email is in
-- approved_emails, OR the profile is already approved.
-- Role granted: the approved_emails.granted_role when the email was whitelisted;
-- otherwise the default 'student' (domain path + already-approved path).
create or replace function public.claim_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email     text := lower(auth.email());
  v_domain    text;
  v_matched   boolean;
  v_approved  boolean;
  v_granted   text;   -- granted_role from approved_emails, null if not whitelisted
begin
  if v_email is null then
    return false;
  end if;

  -- Make sure the caller's profile row exists before we touch it
  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;

  v_domain := split_part(v_email, '@', 2);

  select exists (
    select 1 from public.allowed_domains where domain = v_domain
  ) into v_matched;

  select granted_role into v_granted
  from public.approved_emails where email = v_email;

  select approved into v_approved from public.profiles where id = auth.uid();

  if v_matched or v_granted is not null or coalesce(v_approved, false) then
    update public.profiles set approved = true where id = auth.uid();
    -- Typed-approval path grants the stored role; every other path defaults to
    -- 'student'. on conflict do nothing keeps this idempotent and additive.
    insert into public.member_roles (member_id, role)
    values (auth.uid(), coalesce(v_granted, 'student'))
    on conflict do nothing;
    return true;
  end if;

  return false;
end;
$fn$;

grant execute on function public.claim_profile() to authenticated;

-- ── 5. my_access_request_status(): a requester checks their own status ───────
-- SECURITY DEFINER so a non-staff requester can read just their own latest
-- request without a SELECT policy on the table.
create or replace function public.my_access_request_status()
returns text
language sql
security definer
set search_path = public
as $$
  select status
  from public.access_requests
  where email = lower(auth.email())
  order by created_at desc
  limit 1;
$$;

grant execute on function public.my_access_request_status() to authenticated;

-- ── 6. approve_access_request(): staff approve with an assigned role ─────────
-- Whitelists the email with the chosen role, marks the request approved.
-- The approval email is a courtesy sent by the client edge function afterward;
-- the whitelist is the source of truth, so approval never depends on email.
create or replace function public.approve_access_request(p_request uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email  text;
  v_status text;
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;
  if p_role not in ('student', 'mentor', 'parent') then
    raise exception 'Invalid role: must be student, mentor, or parent';
  end if;

  select email, status into v_email, v_status
  from public.access_requests where id = p_request for update;
  if v_email is null then
    raise exception 'Request not found';
  end if;

  v_email := lower(v_email);

  -- Whitelist (or update the role on) the email.
  insert into public.approved_emails (email, granted_role, added_by)
  values (v_email, p_role, auth.uid())
  on conflict (email) do update
    set granted_role = excluded.granted_role,
        added_by     = excluded.added_by;

  update public.access_requests
  set status      = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request;
end;
$fn$;

grant execute on function public.approve_access_request(uuid, text) to authenticated;

-- ── 7. deny_access_request(): staff deny ────────────────────────────────────
create or replace function public.deny_access_request(p_request uuid)
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

  select status into v_status
  from public.access_requests where id = p_request for update;
  if v_status is null then
    raise exception 'Request not found';
  end if;

  update public.access_requests
  set status      = 'denied',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request;
end;
$fn$;

grant execute on function public.deny_access_request(uuid) to authenticated;
