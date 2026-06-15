-- Staff attendance override + audit trail.
-- Lets staff check any member in or out (bypassing the geofence). The event's
-- user_id stays the target member so the hours math is unchanged; overridden_by
-- records which staffer acted, for the audit trail and the activity feed badge.
-- Run once in the Supabase SQL editor.

-- 1. Columns on attendance_events.
-- overridden_by: the staffer who created the event (null for normal check-ins).
-- verified: the override RPC stamps true; the column is added here because the
-- table did not previously have it.
alter table public.attendance_events
  add column if not exists overridden_by uuid references public.profiles(id);

alter table public.attendance_events
  add column if not exists verified boolean not null default false;

-- 2. staff_override_attendance(): staff-only check-in/out for another member.
-- SECURITY DEFINER so the insert bypasses RLS without loosening the direct
-- "attendance insert own" policy for non-staff clients. is_staff() is enforced
-- at the top, so only mentors / leads / admins can use it.
create or replace function public.staff_override_attendance(target_member uuid, new_type text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;
  if new_type not in ('in', 'out') then
    raise exception 'Invalid type: must be in or out';
  end if;

  insert into public.attendance_events (user_id, type, location, method, verified, overridden_by)
  values (target_member, new_type, 'override', 'override', true, auth.uid());
end;
$fn$;

grant execute on function public.staff_override_attendance(uuid, text) to authenticated;

-- 3. RLS: nothing further is required.
-- staff_override_attendance() runs SECURITY DEFINER, so its insert bypasses RLS;
-- non-staff direct inserts remain blocked by the existing "attendance insert own"
-- policy. The activity feed reads attendance_events + profiles, both already
-- readable by any authenticated member.
