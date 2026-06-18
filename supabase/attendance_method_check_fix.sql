-- Fix: admin/staff check-in failed with
--   new row for relation "attendance_events" violates check constraint
--   "attendance_events_method_check"
--
-- staff_override_attendance() writes method = 'override', but the legacy
-- method CHECK constraint didn't include it. Widen the constraint to cover
-- every method the app writes ('nfc' on tap check-in, 'auto_close' on the 10pm
-- auto-checkout, 'override' on staff/admin check-in), plus a couple of harmless
-- spares. NOT VALID enforces the rule on new rows without re-validating existing
-- data (so it can't fail on any historical value).
-- Run once in the Supabase SQL editor.

alter table public.attendance_events
  drop constraint if exists attendance_events_method_check;

alter table public.attendance_events
  add constraint attendance_events_method_check
  check (method in ('nfc', 'manual', 'kiosk', 'auto', 'auto_close', 'override'))
  not valid;
