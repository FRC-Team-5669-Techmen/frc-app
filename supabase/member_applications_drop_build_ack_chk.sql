-- ============================================================
-- Drop member_applications_build_ack_chk
-- Run once in the Supabase SQL editor.
--
-- BUG: MemberApplication.jsx only renders and requires the
-- build_season_acknowledged checkbox when BUILD_SEASON_SCHEDULED is true
-- (src/MemberApplication.jsx, gated on MEETING_SCHEDULE's "Build season"
-- line not being the TODO placeholder). While the schedule is still a
-- placeholder, the client submits build_season_acknowledged = false, and the
-- CHECK (which unconditionally requires true) rejects every single
-- submission with "violates check constraint member_applications_build_ack_chk".
--
-- FIX IS ON THE DATABASE SIDE, DELIBERATELY: a CHECK constraint cannot see
-- the client's BUILD_SEASON_SCHEDULED condition, so hard-coding "must be
-- true" here guarantees another mismatch the next time that client condition
-- changes. Enforcement belongs in the UI, which already has the necessary
-- context; the column becomes a plain boolean recording whether the student
-- actually saw and checked the box. A student who applied before the
-- schedule was published never saw the commitment, and false is the honest
-- value for that row -- not something to force to true.
-- ============================================================

alter table public.member_applications
  drop constraint if exists member_applications_build_ack_chk;
