-- Close the remaining paths for non-canonical subteam values.
--
-- src/subteams.js is the single source of truth (the 10 canonical values).
-- member_applications was already pinned to it (subteams_vocabulary.sql).
-- This migration does the same for tasks.subteam, and separately reports
-- (without touching) profiles.subteams.
--
-- Canonical 10 values (byte-for-byte):
--   Mechanical, Electrical, Programming, CAD, Fabrication, Media,
--   Business/Outreach, Drive Team, Robot Construction, Field & Pit
--
-- Run once in the Supabase SQL editor. Read every result grid before deciding
-- anything about profiles.subteams -- this file deliberately does not touch it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AUDIT -- what's actually stored, before constraining anything.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Distinct tasks.subteam values (tasks.subteam is free text today; NULL is
-- "no subteam set" and is left alone by the constraint below either way).
select
  subteam,
  count(*) as task_count,
  (subteam is not null and subteam in (
     'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
     'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
     'Field & Pit')) as is_canonical
from public.tasks
group by subteam
order by is_canonical, subteam nulls first;

-- 1b. Distinct profiles.subteams values, unnested (profiles.subteams is a
-- text[] with no DB constraint -- report only, per instruction 4).
select
  value as subteam_value,
  count(*) as member_count,
  (value in (
     'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
     'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
     'Field & Pit')) as is_canonical
from public.profiles, unnest(subteams) as value
group by value
order by is_canonical, value;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONSTRAIN tasks.subteam -- same defensive NOT VALID pattern as
-- subteams_vocabulary.sql. tasks.subteam is nullable ("no subteam set" is a
-- valid state, unlike member_applications' required choices), so the check
-- allows null and otherwise requires a canonical value.
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
           'Field & Pit');

  alter table public.tasks
    add constraint tasks_subteam_values_chk
    check (
      subteam is null or subteam in (
        'Mechanical', 'Electrical', 'Programming', 'CAD', 'Fabrication',
        'Media', 'Business/Outreach', 'Drive Team', 'Robot Construction',
        'Field & Pit')
    )
    not valid;

  if legacy_count = 0 then
    alter table public.tasks
      validate constraint tasks_subteam_values_chk;
    raise notice 'tasks_subteam_values_chk added and VALIDATED (no non-canonical rows).';
  else
    raise notice 'tasks_subteam_values_chk added NOT VALID: % existing row(s) use a non-canonical subteam. New inserts/updates are enforced; existing rows are untouched.', legacy_count;
  end if;
end
$ck$;

-- The Supabase SQL editor does not render NOTICE output, so the outcome comes
-- back as a result row. validated = true  → the CHECK covers every existing
-- row (fresh/clean database). validated = false → non-canonical rows were
-- left as-is; the CHECK still enforces every new insert/update.
select
  c.conname                                as constraint_name,
  c.convalidated                           as validated,
  (select count(*) from public.tasks)      as task_rows
from pg_constraint c
where c.conrelid = 'public.tasks'::regclass
  and c.conname  = 'tasks_subteam_values_chk';
