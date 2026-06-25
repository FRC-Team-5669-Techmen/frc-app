-- Admin hours management — per-member staff tools, all behind SECURITY DEFINER
-- RPCs (RLS silently drops client-side cross-user writes, so every mutation here
-- runs definer-side and re-checks is_staff()). Three groups:
--   1) Edit / delete a logged_hours row.
--   2) Add / edit / delete a single attendance_events row (sessions are NOT
--      stored — they recompute from events via buildBreakdown/sessionsFromEvents).
--   3) NEW hour_adjustments table — labeled signed credits/debits folded into the
--      same per-category breakdown the by-member hours page reads.
--
-- Reuses the attendance_audit table + is_staff() helper from session_integrity.sql.
-- Category set is the current four (build/outreach/volunteer/competition).
--
-- Run once in the Supabase SQL editor BEFORE testing.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) LOGGED HOURS — staff edit / delete (any member, any status).
--    "lh staff update" RLS already allows staff updates, but there is no staff
--    DELETE policy and the task mandates RPCs, so both go definer-side here.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.staff_edit_logged_hours(
  p_entry uuid, p_type text, p_hours numeric, p_date date
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare v_owner uuid;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;

  select member_id into v_owner from public.logged_hours where id = p_entry;
  if v_owner is null then raise exception 'Entry not found'; end if;

  if p_type is not null and p_type not in ('build', 'outreach', 'volunteer', 'competition') then
    raise exception 'Invalid category: %', p_type;
  end if;
  if p_hours is not null and (p_hours <= 0 or p_hours > 24) then
    raise exception 'Hours must be between 0 and 24';
  end if;
  if p_date is not null and p_date > current_date then
    raise exception 'Date cannot be in the future';
  end if;

  update public.logged_hours
     set type  = coalesce(p_type,  type),
         hours = coalesce(p_hours, hours),
         date  = coalesce(p_date,  date)
   where id = p_entry;
end;
$fn$;
grant execute on function public.staff_edit_logged_hours(uuid, text, numeric, date) to authenticated;

create or replace function public.staff_delete_logged_hours(p_entry uuid)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if not exists (select 1 from public.logged_hours where id = p_entry) then
    raise exception 'Entry not found';
  end if;
  delete from public.logged_hours where id = p_entry;
end;
$fn$;
grant execute on function public.staff_delete_logged_hours(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ATTENDANCE EVENTS — staff add a single event / edit (type + time + category)
--    / delete. Deleting reuses staff_void_event from session_integrity.sql. All
--    write to attendance_audit. Sessions recompute downstream from the events.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a) Add ONE event (e.g. a forgotten OUT). manual_entry = true, verified.
create or replace function public.staff_add_event(
  p_member uuid, p_type text, p_event_time timestamptz, p_category text, p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare v_id uuid;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required'; end if;
  if p_type not in ('in', 'out') then raise exception 'Type must be in or out'; end if;
  if p_event_time is null then raise exception 'An event time is required'; end if;
  if p_category is not null and p_category not in ('build', 'outreach', 'volunteer', 'competition') then
    raise exception 'Invalid category: %', p_category;
  end if;

  insert into public.attendance_events
    (user_id, type, event_time, location, method, category, verified, manual_entry, overridden_by)
  values
    (p_member, p_type, p_event_time, 'manual', 'manual',
     coalesce(p_category, 'build'), true, true, auth.uid())
  returning id into v_id;

  insert into public.attendance_audit (event_id, member_id, actor_id, action, reason, new_value)
  values (v_id, p_member, auth.uid(), 'insert', p_reason,
          jsonb_build_object('type', p_type, 'event_time', p_event_time, 'category', coalesce(p_category, 'build'), 'manual_entry', true));
  return v_id;
end;
$fn$;
grant execute on function public.staff_add_event(uuid, text, timestamptz, text, text) to authenticated;

-- 2b) Edit an event's type and/or time and/or category. Unlike staff_edit_event
--     (session_integrity.sql) this can also flip the type (in <-> out), needed to
--     fix a scan recorded as the wrong direction.
create or replace function public.staff_set_event(
  p_event uuid, p_type text, p_event_time timestamptz, p_category text, p_reason text
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare v_old jsonb; v_member uuid;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required'; end if;
  if p_type is not null and p_type not in ('in', 'out') then raise exception 'Type must be in or out'; end if;
  if p_category is not null and p_category not in ('build', 'outreach', 'volunteer', 'competition') then
    raise exception 'Invalid category: %', p_category;
  end if;

  select to_jsonb(ae), ae.user_id into v_old, v_member
    from public.attendance_events ae where ae.id = p_event;
  if v_member is null then raise exception 'Event % not found', p_event; end if;

  update public.attendance_events
     set type       = coalesce(p_type, type),
         event_time = coalesce(p_event_time, event_time),
         category   = coalesce(p_category, category)
   where id = p_event;

  insert into public.attendance_audit (event_id, member_id, actor_id, action, reason, old_value, new_value)
  values (p_event, v_member, auth.uid(), 'edit', p_reason, v_old,
          (select to_jsonb(ae) from public.attendance_events ae where ae.id = p_event));
end;
$fn$;
grant execute on function public.staff_set_event(uuid, text, timestamptz, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) HOUR ADJUSTMENTS — labeled signed credits/debits. The audit-trail-safe way
--    to correct a member's totals without rewriting attendance/logged history.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.hour_adjustments (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.profiles(id) on delete cascade,
  category   text not null check (category in ('build', 'outreach', 'volunteer', 'competition')),
  hours      numeric not null,            -- signed: positive credit, negative debit
  reason     text not null,
  created_by uuid references public.profiles(id),  -- staff who made it
  created_at timestamptz not null default now()
);
create index if not exists hour_adjustments_member_idx on public.hour_adjustments (member_id, created_at desc);

alter table public.hour_adjustments enable row level security;
-- Member reads own; staff read all. Writes go through the RPC below.
drop policy if exists "hadj member select own" on public.hour_adjustments;
drop policy if exists "hadj staff select"      on public.hour_adjustments;
create policy "hadj member select own" on public.hour_adjustments for select using (member_id = auth.uid());
create policy "hadj staff select"      on public.hour_adjustments for select using (public.is_staff());
grant select on public.hour_adjustments to authenticated;

create or replace function public.staff_add_hour_adjustment(
  p_member uuid, p_category text, p_hours numeric, p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare v_id uuid;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required'; end if;
  if p_category not in ('build', 'outreach', 'volunteer', 'competition') then
    raise exception 'Invalid category: %', p_category;
  end if;
  if p_hours is null or p_hours = 0 then raise exception 'Adjustment hours must be non-zero'; end if;
  if not exists (select 1 from public.profiles where id = p_member) then
    raise exception 'Member not found';
  end if;

  insert into public.hour_adjustments (member_id, category, hours, reason, created_by)
  values (p_member, p_category, p_hours, p_reason, auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;
grant execute on function public.staff_add_hour_adjustment(uuid, text, numeric, text) to authenticated;
