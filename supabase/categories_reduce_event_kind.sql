-- Two schema changes, applied together with their UI.
--   (1) Reduce hour categories from six to four: drop 'fundraising' and
--       'mentoring' from attendance_events.category and logged_hours.type.
--   (2) Add 'volunteering' as a calendar event kind (events.kind).
--
-- Run once in the Supabase SQL editor BEFORE testing.

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) REDUCE CATEGORIES → build / outreach / volunteer / competition
--
-- Re-tag existing 'fundraising' and 'mentoring' rows to 'outreach' first, then
-- tighten the check constraints (an existing dropped value would otherwise fail
-- validation). 'outreach' is the chosen fallback for both.
--
-- FLAG: 'fundraising' → 'outreach' is a clean fit (both community-facing). For
-- 'mentoring', 'outreach' is the instructed fallback, but in-shop mentoring
-- arguably maps better to 'build'. We do NOT guess per-row — everything goes to
-- 'outreach'; staff can reclassify individual sessions afterward via Team Hours
-- (edit session) if a 'build' classification is more accurate.
-- ─────────────────────────────────────────────────────────────────────────────

-- attendance_events.category
alter table public.attendance_events drop constraint if exists attendance_events_category_check;

update public.attendance_events
   set category = 'outreach'
 where category in ('fundraising', 'mentoring');

alter table public.attendance_events
  add constraint attendance_events_category_check
  check (category in ('build', 'outreach', 'volunteer', 'competition'))
  not valid;

-- logged_hours.type
alter table public.logged_hours drop constraint if exists logged_hours_type_check;

update public.logged_hours
   set type = 'outreach'
 where type in ('fundraising', 'mentoring');

alter table public.logged_hours
  add constraint logged_hours_type_check
  check (type in ('build', 'outreach', 'volunteer', 'competition'))
  not valid;

-- NOTE: the SECURITY DEFINER RPCs (staff_add_manual_session, staff_edit_event /
-- _apply_event_edit, request_session_correction, set_hour_goal) still list the
-- old six-value set in their inline guards, but these table CHECK constraints are
-- the authoritative gate — a 'fundraising'/'mentoring' write is now rejected on
-- every path. The UI no longer offers them, so no caller sends them.

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) ADD 'volunteering' EVENT KIND
--     Widen events.kind to include 'volunteering'. No data change (new option).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.events drop constraint if exists events_kind_check;

alter table public.events
  add constraint events_kind_check
  check (kind in ('build', 'meeting', 'competition', 'potluck', 'outreach', 'volunteering', 'other'))
  not valid;
