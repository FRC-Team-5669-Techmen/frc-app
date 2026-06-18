-- Optional due date on jobs, so the Jobs page can sort/flag by deadline.
-- Run once in the Supabase SQL editor. Additive and nullable — existing jobs are
-- unaffected. tasks already has staff-write RLS and authenticated-read, so no
-- policy change is needed.
alter table public.tasks add column if not exists due_date date;
