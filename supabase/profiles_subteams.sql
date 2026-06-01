-- Migrate profiles.subteam (text) → profiles.subteams (text[]).
-- Run in Supabase SQL editor, then run the updated admin_roster.sql.

-- 1. Add the array column (safe to re-run: IF NOT EXISTS)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subteams text[] NOT NULL DEFAULT '{}';

-- 2. Backfill from the old single-value column
UPDATE public.profiles
  SET subteams = ARRAY[subteam]
  WHERE subteam IS NOT NULL AND subteam <> '';

-- 3. Drop the old column
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS subteam;
