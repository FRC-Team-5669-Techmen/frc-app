-- Onboarding tour persistence. The guided tour auto-runs once when this is null
-- and is marked done (set to now()) when the member finishes or skips it, so it
-- never repeats and persists across devices.
-- The existing "profiles update own or admin" policy already lets a member set
-- this column; no new RLS policy is needed.
alter table public.profiles add column if not exists onboarded_at timestamptz;
