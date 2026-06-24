-- Hour category system on attendance_events.
--
-- Supersedes attendance_category.sql's normal/volunteer pair AND the standalone
-- volunteer_hours_backfill.sql (removed — do NOT run that separately). Every
-- hour-accruing attendance session carries a category, and the hours boards
-- report by category instead of lumping everything as regular hours.
--
-- Categories: build (default), outreach, volunteer, competition, fundraising,
-- mentoring. The regular shop check-in flow defaults to 'build'.
--
-- Run once in the Supabase SQL editor.

-- 1) Ensure the column exists (added by attendance_category.sql). Idempotent.
alter table public.attendance_events
  add column if not exists category text not null default 'normal';

-- 2) Drop the old 2-value (normal/volunteer) constraint so we can migrate the
--    stored values and widen the allowed set.
alter table public.attendance_events
  drop constraint if exists attendance_events_category_check;

-- 3) Backfill volunteer-flow rows. The /checkin-volunteer route is the only path
--    that uses the FLL-room location (it deep-links with ?loc=fll-room and
--    geofences to the FLL room via verifyAtFLL), so location='fll-room' uniquely
--    marks a volunteer-originated event. Re-tag any not already 'volunteer'.
update public.attendance_events
   set category = 'volunteer'
 where location = 'fll-room'
   and category is distinct from 'volunteer';

-- 4) Migrate the legacy default 'normal' (and any nulls) → 'build', the new
--    regular-shop default.
update public.attendance_events
   set category = 'build'
 where category = 'normal' or category is null;

-- 5) Point the column default at the new regular-flow category.
alter table public.attendance_events
  alter column category set default 'build';

-- 6) Constrain to the six categories. NOT VALID enforces the rule on new
--    inserts/updates without re-validating history (all rows were migrated to a
--    valid value above, so a later VALIDATE CONSTRAINT would pass too).
alter table public.attendance_events
  add constraint attendance_events_category_check
  check (category in ('build', 'outreach', 'volunteer', 'competition', 'fundraising', 'mentoring'))
  not valid;

-- RLS: unchanged. The existing "attendance insert own" policy already governs
-- these inserts; category is just another column on the member's own row.
--
-- NOTE: logged_hours.type (volunteering / outreach / competition) is a separate
-- manual-entry table and is NOT migrated. The hours boards map its 'volunteering'
-- type into the 'volunteer' category bucket at read time (loggedTypeToCategory).
