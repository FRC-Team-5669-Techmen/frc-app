-- Session-integrity tooling: audit trail, admin manual entry / adjustment of
-- attendance events, student correction requests, and aligning logged_hours.type
-- to the six hour categories.
--
-- A "session" is a derived IN/OUT pairing from attendance_events, not a stored
-- row. The forgot-to-sign-out cap lives in the derivation layer (hoursUtils.js),
-- NOT in this schema — no synthetic events are ever written.
--
-- Run once in the Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) attendance_events.manual_entry — flags an admin/mentor-inserted pair
--    (offsite or no-signal shop work) so displays can mark it.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.attendance_events
  add column if not exists manual_entry boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) AUDIT TRAIL — shared infra for manual entry/adjustment and corrections.
--    Logs every insert/edit/delete to attendance_events made through the
--    privileged RPCs below: who, when, target row, old value, new value, reason.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.attendance_audit (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid,                                          -- target attendance_events row (kept after delete)
  member_id  uuid references public.profiles(id),           -- whose attendance the event belongs to
  actor_id   uuid references public.profiles(id),           -- who made the change
  action     text not null check (action in ('insert', 'edit', 'delete')),
  reason     text,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attendance_audit_event_idx  on public.attendance_audit (event_id);
create index if not exists attendance_audit_member_idx on public.attendance_audit (member_id, created_at desc);

alter table public.attendance_audit enable row level security;
-- Staff read all; a member can read audit rows about their own attendance.
-- No insert/update/delete policies: only the SECURITY DEFINER RPCs write here.
drop policy if exists "aa staff select"      on public.attendance_audit;
drop policy if exists "aa member select own" on public.attendance_audit;
create policy "aa staff select"      on public.attendance_audit for select using (public.is_staff());
create policy "aa member select own" on public.attendance_audit for select using (member_id = auth.uid());
grant select on public.attendance_audit to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Helper: apply an edit to one attendance_events row + write the audit row.
--    Reused by the staff edit RPC and the correction-approval RPC so the audit
--    trail is identical no matter which flow triggered the change.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._apply_event_edit(
  p_event uuid, p_event_time timestamptz, p_category text, p_actor uuid, p_reason text
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare v_old jsonb; v_member uuid;
begin
  if p_category is not null
     and p_category not in ('build', 'outreach', 'volunteer', 'competition', 'fundraising', 'mentoring') then
    raise exception 'Invalid category: %', p_category;
  end if;

  select to_jsonb(ae), ae.user_id into v_old, v_member
    from public.attendance_events ae where ae.id = p_event;
  if v_member is null then raise exception 'Event % not found', p_event; end if;

  update public.attendance_events
     set event_time = coalesce(p_event_time, event_time),
         category   = coalesce(p_category, category)
   where id = p_event;

  insert into public.attendance_audit (event_id, member_id, actor_id, action, reason, old_value, new_value)
  values (p_event, v_member, p_actor, 'edit', p_reason, v_old,
          (select to_jsonb(ae) from public.attendance_events ae where ae.id = p_event));
end;
$fn$;
revoke all on function public._apply_event_edit(uuid, timestamptz, text, uuid, text) from public, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ADMIN MANUAL ENTRY / ADJUSTMENT (shop attendance). All writes hit the audit.
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a) Insert a matched IN/OUT pair (manual_entry = true). Category + reason required.
create or replace function public.staff_add_manual_session(
  p_member uuid, p_in timestamptz, p_out timestamptz, p_category text, p_reason text
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare v_in uuid; v_out uuid;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required'; end if;
  if p_in is null or p_out is null then raise exception 'Both check-in and check-out times are required'; end if;
  if p_out <= p_in then raise exception 'Check-out must be after check-in'; end if;
  if p_category not in ('build', 'outreach', 'volunteer', 'competition', 'fundraising', 'mentoring') then
    raise exception 'Invalid category: %', p_category;
  end if;

  insert into public.attendance_events (user_id, type, event_time, location, method, category, verified, manual_entry, overridden_by)
  values (p_member, 'in',  p_in,  'manual', 'manual', p_category, true, true, auth.uid())
  returning id into v_in;

  insert into public.attendance_events (user_id, type, event_time, location, method, category, verified, manual_entry, overridden_by)
  values (p_member, 'out', p_out, 'manual', 'manual', p_category, true, true, auth.uid())
  returning id into v_out;

  insert into public.attendance_audit (event_id, member_id, actor_id, action, reason, new_value)
  values
    (v_in,  p_member, auth.uid(), 'insert', p_reason,
       jsonb_build_object('type', 'in',  'event_time', p_in,  'category', p_category, 'manual_entry', true)),
    (v_out, p_member, auth.uid(), 'insert', p_reason,
       jsonb_build_object('type', 'out', 'event_time', p_out, 'category', p_category, 'manual_entry', true));
end;
$fn$;
grant execute on function public.staff_add_manual_session(uuid, timestamptz, timestamptz, text, text) to authenticated;

-- 4b) Edit an existing event's time and/or category.
create or replace function public.staff_edit_event(
  p_event uuid, p_event_time timestamptz, p_category text, p_reason text
) returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required'; end if;
  perform public._apply_event_edit(p_event, p_event_time, p_category, auth.uid(), p_reason);
end;
$fn$;
grant execute on function public.staff_edit_event(uuid, timestamptz, text, text) to authenticated;

-- 4c) Void (hard-delete) a wrong event, snapshotting it into the audit first.
create or replace function public.staff_void_event(p_event uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $fn$
declare v_old jsonb; v_member uuid;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required'; end if;

  select to_jsonb(ae), ae.user_id into v_old, v_member
    from public.attendance_events ae where ae.id = p_event;
  if v_member is null then raise exception 'Event % not found', p_event; end if;

  delete from public.attendance_events where id = p_event;

  insert into public.attendance_audit (event_id, member_id, actor_id, action, reason, old_value)
  values (p_event, v_member, auth.uid(), 'delete', p_reason, v_old);
end;
$fn$;
grant execute on function public.staff_void_event(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) CORRECTION REQUESTS — student flags a wrong derived session; staff resolve
--    following the same verify/reject UX as logged_hours.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.session_corrections (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.profiles(id) on delete cascade,
  checkin_id        uuid references public.attendance_events(id) on delete set null,
  checkout_id       uuid references public.attendance_events(id) on delete set null,
  note              text not null,                 -- student's explanation (required)
  proposed_in       timestamptz,                   -- optional suggested corrected values
  proposed_out      timestamptz,
  proposed_category text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolution_note   text,
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists session_corrections_pending_idx on public.session_corrections (status, created_at desc);
create index if not exists session_corrections_member_idx  on public.session_corrections (member_id, created_at desc);

alter table public.session_corrections enable row level security;
-- Member reads own; staff read all. All writes go through the RPCs below.
drop policy if exists "sc member select own" on public.session_corrections;
drop policy if exists "sc staff select"      on public.session_corrections;
create policy "sc member select own" on public.session_corrections for select using (member_id = auth.uid());
create policy "sc staff select"      on public.session_corrections for select using (public.is_staff());
grant select on public.session_corrections to authenticated;

-- 5a) Student submits a correction request against their own event(s).
create or replace function public.request_session_correction(
  p_checkin uuid, p_checkout uuid, p_note text,
  p_proposed_in timestamptz, p_proposed_out timestamptz, p_proposed_category text
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare v_id uuid;
begin
  if p_note is null or btrim(p_note) = '' then raise exception 'A note is required'; end if;
  if p_checkin is null and p_checkout is null then raise exception 'Reference at least one event'; end if;
  if p_proposed_category is not null
     and p_proposed_category not in ('build', 'outreach', 'volunteer', 'competition', 'fundraising', 'mentoring') then
    raise exception 'Invalid category: %', p_proposed_category;
  end if;
  -- Referenced events must belong to the caller.
  if p_checkin is not null and not exists (
       select 1 from public.attendance_events where id = p_checkin and user_id = auth.uid()) then
    raise exception 'Check-in event not found for you';
  end if;
  if p_checkout is not null and not exists (
       select 1 from public.attendance_events where id = p_checkout and user_id = auth.uid()) then
    raise exception 'Check-out event not found for you';
  end if;

  insert into public.session_corrections
    (member_id, checkin_id, checkout_id, note, proposed_in, proposed_out, proposed_category)
  values (auth.uid(), p_checkin, p_checkout, p_note, p_proposed_in, p_proposed_out, p_proposed_category)
  returning id into v_id;
  return v_id;
end;
$fn$;
grant execute on function public.request_session_correction(uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;

-- 5b) Staff approve (optionally with edited values) or reject. Approval applies
--     the change to the underlying events via _apply_event_edit (so it audits),
--     using explicit p_apply_* when provided, else the student's proposed values.
create or replace function public.resolve_session_correction(
  p_id uuid, p_approve boolean, p_resolution text,
  p_apply_in timestamptz, p_apply_out timestamptz, p_apply_category text
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare r public.session_corrections; v_in timestamptz; v_out timestamptz; v_cat text; v_reason text;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;

  select * into r from public.session_corrections where id = p_id for update;
  if r.id is null then raise exception 'Correction not found'; end if;
  if r.status <> 'pending' then return; end if;   -- idempotent

  if p_approve then
    v_in     := coalesce(p_apply_in,  r.proposed_in);
    v_out    := coalesce(p_apply_out, r.proposed_out);
    v_cat    := coalesce(p_apply_category, r.proposed_category);
    v_reason := 'Correction approved: ' || coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), r.note);

    -- Check-in event: apply a new time and/or category if either was supplied.
    if r.checkin_id is not null and (v_in is not null or v_cat is not null) then
      perform public._apply_event_edit(r.checkin_id, v_in, v_cat, auth.uid(), v_reason);
    end if;
    -- Check-out event: apply a new time (category mirrors the in side).
    if r.checkout_id is not null and (v_out is not null or v_cat is not null) then
      perform public._apply_event_edit(r.checkout_id, v_out, v_cat, auth.uid(), v_reason);
    end if;

    update public.session_corrections
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = p_resolution
     where id = p_id;
  else
    update public.session_corrections
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = p_resolution
     where id = p_id;
  end if;
end;
$fn$;
grant execute on function public.resolve_session_correction(uuid, boolean, text, timestamptz, timestamptz, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) ALIGN logged_hours.type TO THE SIX CATEGORIES.
--    Migrate the legacy 'volunteering' value to 'volunteer', then widen the
--    constraint to the full set. The read-time mapping (loggedTypeToCategory)
--    still maps any stray 'volunteering' → 'volunteer', so it keeps working.
-- ─────────────────────────────────────────────────────────────────────────────
update public.logged_hours set type = 'volunteer' where type = 'volunteering';

alter table public.logged_hours drop constraint if exists logged_hours_type_check;
alter table public.logged_hours
  add constraint logged_hours_type_check
  check (type in ('build', 'outreach', 'volunteer', 'competition', 'fundraising', 'mentoring'))
  not valid;
