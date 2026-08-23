-- Add two subteams to the vocabulary: 'Strategy and Scouting' and 'Management'.
--
-- PURELY ADDITIVE. No existing value is renamed, recased, repunctuated,
-- reordered or removed, and this file contains no UPDATE, DELETE or backfill of
-- any kind. Applications already submitted keep their rankings exactly as
-- submitted; profiles.subteams and member_applications rows are read-only here.
--
-- Two CHECK constraints pin the subteam vocabulary and both are widened below,
-- because a value the app offers but a constraint rejects is a write error at
-- the worst possible moment (a student mid-application, or staff tagging a job):
--   member_applications_subteam_values_chk  (subteam_first/second/third)
--   tasks_subteam_values_chk                (tasks.subteam, nullable)
-- profiles.subteams (text[]) has NO constraint by design and needs no change.
--
-- Canonical 12 values (byte-for-byte; these strings ARE the data -- see the
-- header of src/subteams.js):
--   Mechanical, Electrical, Programming, CAD, Fabrication, Media,
--   Business/Outreach, Drive Team, Robot Construction, Field & Pit,
--   Strategy and Scouting, Management
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSE (exact SQL that undoes this file -- restores the 10-value lists)
--
--   alter table public.member_applications
--     drop constraint if exists member_applications_subteam_values_chk;
--   alter table public.member_applications
--     add constraint member_applications_subteam_values_chk
--     check (
--       subteam_first in (
--         'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
--         'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
--         'Field & Pit')
--       and subteam_second in (
--         'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
--         'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
--         'Field & Pit')
--       and (subteam_third is null or subteam_third in (
--         'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
--         'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
--         'Field & Pit'))
--     )
--     not valid;
--
--   alter table public.tasks
--     drop constraint if exists tasks_subteam_values_chk;
--   alter table public.tasks
--     add constraint tasks_subteam_values_chk
--     check (
--       subteam is null or subteam in (
--         'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
--         'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
--         'Field & Pit')
--     )
--     not valid;
--
-- The reverse is written NOT VALID on purpose: once a student has ranked
-- 'Strategy and Scouting' or a job is tagged 'Management', a VALIDATE would
-- fail, and forcing it through would mean rewriting a submitted answer. Reverse
-- the constraint, not the data. Also revert src/subteams.js in the same pass, or
-- the form will keep offering values the database now rejects.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. member_applications.subteam_first / _second / _third
--
-- Same NOT VALID pattern as subteams_vocabulary.sql: legacy application rows
-- carry the pre-consolidation taxonomy and are deliberately never rewritten, so
-- the widened constraint is enforced on every new INSERT/UPDATE while existing
-- rows are left exactly as submitted. Where no legacy row exists it validates
-- immediately.
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
           'Field & Pit',
           'Strategy and Scouting', 'Management')
      or subteam_second not in (
           'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
           'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
           'Field & Pit',
           'Strategy and Scouting', 'Management')
      or (subteam_third is not null and subteam_third not in (
           'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
           'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
           'Field & Pit',
           'Strategy and Scouting', 'Management'));

  alter table public.member_applications
    add constraint member_applications_subteam_values_chk
    check (
      subteam_first in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit',
        'Strategy and Scouting', 'Management')
      and subteam_second in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit',
        'Strategy and Scouting', 'Management')
      and (subteam_third is null or subteam_third in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit',
        'Strategy and Scouting', 'Management'))
    )
    not valid;

  if legacy_count = 0 then
    alter table public.member_applications
      validate constraint member_applications_subteam_values_chk;
    raise notice 'member_applications subteam CHECK widened to the canonical 12 values and VALIDATED (no legacy rows).';
  else
    raise notice 'member_applications subteam CHECK widened to the canonical 12 values, left NOT VALID: % existing row(s) use the old taxonomy and are untouched. New inserts/updates are enforced.', legacy_count;
  end if;
end
$ck$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. tasks.subteam (nullable -- "no subteam set" stays a valid state)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks
  drop constraint if exists tasks_subteam_values_chk;

do $ck$
declare
  legacy_count int;
begin
  select count(*) into legacy_count
    from public.tasks
   where subteam is not null
     and subteam not in (
           'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
           'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
           'Field & Pit',
           'Strategy and Scouting', 'Management');

  alter table public.tasks
    add constraint tasks_subteam_values_chk
    check (
      subteam is null or subteam in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit',
        'Strategy and Scouting', 'Management')
    )
    not valid;

  if legacy_count = 0 then
    alter table public.tasks
      validate constraint tasks_subteam_values_chk;
    raise notice 'tasks_subteam_values_chk widened to the canonical 12 values and VALIDATED (no non-canonical rows).';
  else
    raise notice 'tasks_subteam_values_chk widened to the canonical 12 values, left NOT VALID: % existing row(s) use a non-canonical subteam and are untouched. New inserts/updates are enforced.', legacy_count;
  end if;
end
$ck$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY
--
-- The Supabase SQL editor does not render NOTICE output, so the outcome comes
-- back as result rows.
--
-- 3a. Both constraints, and whether each covers every existing row.
--     validated = false is expected wherever pre-consolidation rows exist; the
--     CHECK still enforces every new insert/update.
-- ─────────────────────────────────────────────────────────────────────────────

select
  c.conrelid::regclass as table_name,
  c.conname            as constraint_name,
  c.convalidated       as validated
from pg_constraint c
where c.conname in (
  'member_applications_subteam_values_chk',
  'tasks_subteam_values_chk')
order by 1;

-- 3b. Positive control: the two new values are actually accepted now. Each
-- expression is the widened CHECK's own vocabulary test -- both must be true.
select
  'Strategy and Scouting' in (
    'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
    'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
    'Field & Pit',
    'Strategy and Scouting', 'Management') as strategy_and_scouting_allowed,
  'Management' in (
    'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
    'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
    'Field & Pit',
    'Strategy and Scouting', 'Management') as management_allowed;
