-- Subteam vocabulary consolidation.
--
-- The subteam list was duplicated in three places with three different sets of
-- strings (ProfilePage, JobsPage, MemberApplication). It now lives in ONE
-- module, src/subteams.js, and this migration re-pins the only DB constraint
-- that encodes the vocabulary -- member_applications_subteam_values_chk -- to
-- that canonical list.
--
-- Canonical 10 values (byte-for-byte; profiles.subteams stores these literals,
-- so NEVER rename/recase/repunctuate one without a data migration):
--   Mechanical, Electrical, Programming, CAD, Fabrication, Media,
--   Business/Outreach, Drive Team, Robot Construction, Field & Pit
--
-- Run once in the Supabase SQL editor BEFORE testing.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LEGACY DATA NOTE (read before running)
--
-- member_applications rows written before this change carry the OLD, different
-- taxonomy ('Mechanical Design (CAD)', 'Fabrication and Machining',
-- 'Assembly and Robot Construction', 'Electrical and Wiring',
-- 'Programming and Controls', 'Drive Team (selection by tryout)',
-- 'Field and Pit Crew', 'Media Outreach and Business'). Those are stated
-- interest on submitted applications -- historical answers -- and this file
-- deliberately does NOT rewrite them: there is no lossless mapping (e.g.
-- 'Mechanical Design (CAD)' straddles both 'Mechanical' and 'CAD'), and
-- guessing would silently misstate what a student actually chose.
--
-- So the new constraint is added NOT VALID when legacy rows exist: it is
-- enforced on every INSERT and UPDATE from now on (which is all that matters --
-- the form only ever writes canonical values, and member_applications has no
-- UPDATE policy at all, so existing rows are effectively immutable), while
-- existing rows are left as-is. On a database with no legacy rows the
-- constraint is validated immediately, so a fresh environment gets a fully
-- validated CHECK.
--
-- To retire the legacy values later: re-tag the affected rows by hand (staff
-- judgment, one row at a time), then run
--   alter table public.member_applications
--     validate constraint member_applications_subteam_values_chk;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.member_applications
  drop constraint if exists member_applications_subteam_values_chk;

do $ck$
declare
  legacy_count int;
begin
  select count(*) into legacy_count
    from public.member_applications
   where subteam_first  not in (
           'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
           'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
           'Field & Pit')
      or subteam_second not in (
           'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
           'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
           'Field & Pit')
      or (subteam_third is not null and subteam_third not in (
           'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
           'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
           'Field & Pit'));

  alter table public.member_applications
    add constraint member_applications_subteam_values_chk
    check (
      subteam_first in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit')
      and subteam_second in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit')
      and (subteam_third is null or subteam_third in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit'))
    )
    not valid;

  if legacy_count = 0 then
    alter table public.member_applications
      validate constraint member_applications_subteam_values_chk;
    raise notice 'subteam CHECK re-pinned to the canonical 10 values and VALIDATED (no legacy rows).';
  else
    raise notice 'subteam CHECK re-pinned to the canonical 10 values, left NOT VALID: % existing row(s) use the old taxonomy. New inserts/updates are enforced; see the LEGACY DATA NOTE in this file.', legacy_count;
  end if;
end
$ck$;

-- The pairwise-distinct CHECK is unchanged and intentionally left alone; it
-- constrains the relationship between the three choices, not the vocabulary.

-- The Supabase SQL editor does not render NOTICE output, so the outcome comes
-- back as a result row. validated = true  → the CHECK covers every existing row.
--                       validated = false → legacy rows were left as-is; the
--                       CHECK is still enforced on all new inserts/updates.
select
  c.conname                                          as constraint_name,
  c.convalidated                                     as validated,
  (select count(*) from public.member_applications)  as application_rows
from pg_constraint c
where c.conrelid = 'public.member_applications'::regclass
  and c.conname  = 'member_applications_subteam_values_chk';
