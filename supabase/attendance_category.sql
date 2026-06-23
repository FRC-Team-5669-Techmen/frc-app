-- Volunteer-hours category on attendance_events.
-- Adds a category column so summer FLL-room volunteering (the /checkin-volunteer
-- NFC route) logs VOLUNTEER hours separately from normal build hours, while the
-- in/out ledger model and the existing hours math stay unchanged.
-- Run once in the Supabase SQL editor.

-- category: 'normal' (default — existing build/attendance hours) or 'volunteer'
-- (FLL-room volunteering). The default + backfill keep every existing row 'normal'.
alter table public.attendance_events
  add column if not exists category text not null default 'normal';

-- Backfill any pre-existing NULLs. No-op once the NOT NULL default above lands,
-- but safe if the column already existed nullable from an earlier partial run.
update public.attendance_events set category = 'normal' where category is null;

-- Constrain to the known categories. NOT VALID enforces the rule on new rows
-- without re-validating history (all backfilled to 'normal', so it passes anyway).
alter table public.attendance_events
  drop constraint if exists attendance_events_category_check;

alter table public.attendance_events
  add constraint attendance_events_category_check
  check (category in ('normal', 'volunteer'))
  not valid;

-- RLS: no change. The existing "attendance insert own" policy already governs
-- these inserts; category is just another column on the member's own row. The
-- client sets it the same way it sets type/location/method (client-side insert,
-- matching the normal check-in path).
