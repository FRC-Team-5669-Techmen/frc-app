-- Backfill: attribute pre-existing FLL-room volunteer check-ins to category='volunteer'.
--
-- Context: the /checkin-volunteer route already tags every session it opens with
-- category='volunteer' at write time (see VolunteerCheckinPage.jsx), and the
-- attendance_category.sql migration added that column defaulting to 'normal'.
-- Going forward, volunteer attendance is attributed correctly with no backfill.
--
-- This file only matters for any volunteer-originated rows that were left at the
-- 'normal' default — e.g. rows written during a window where the client wasn't
-- yet sending category, or rows whose category was never set.
--
-- Reliable identifier: the volunteer route is the ONLY path that uses the FLL-room
-- location. It deep-links with ?loc=fll-room (default) and geofences to the FLL
-- room (verifyAtFLL); the normal /checkin path carries the shop NFC tag's loc.
-- So location = 'fll-room' uniquely marks a volunteer-originated event.
--
-- Run in the Supabase SQL editor. INSPECT FIRST, then run the UPDATE.

-- 1) Inspect candidates before changing anything. Confirm the 'fll-room' rows are
--    all genuinely volunteer sessions and the count matches expectations:
-- select category, count(*)
--   from public.attendance_events
--  where location = 'fll-room'
--  group by category
--  order by category;

-- 2) Re-tag any FLL-room rows still on the 'normal' default.
update public.attendance_events
   set category = 'volunteer'
 where location = 'fll-room'
   and category is distinct from 'volunteer';

-- If volunteer sessions were ever recorded from a DIFFERENT location and so can't
-- be told apart from regular shop hours, they are NOT reliably identifiable and
-- are intentionally left as 'normal' rather than guessed at.
