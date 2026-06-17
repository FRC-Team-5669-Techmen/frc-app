-- ============================================================
-- Recurring event series
-- Run once in the Supabase SQL editor (additive; ships with the UI change).
--
-- Events created in a single bulk/"repeat on multiple days" action share a
-- series_id so they can be edited or deleted as a group. Standalone events
-- have series_id = null and behave exactly as before.
-- ============================================================

alter table public.events add column if not exists series_id uuid;

create index if not exists events_series_id_idx on public.events (series_id);
