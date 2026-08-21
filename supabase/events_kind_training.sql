-- ============================================================
-- Add 'training' as a calendar event kind (public.events.kind)
--
-- Run once in the Supabase SQL editor. Additive only: this widens the
-- allowed vocabulary, it does not rewrite or re-tag any existing row.
--
-- Supersedes the constraint last set by supabase/categories_reduce_event_kind.sql
-- (section 2). The full vocabulary after this file is:
--   build, meeting, competition, potluck, outreach, volunteering, training, other
--
-- Matching UI/vocabulary changes shipped alongside (schema and UI ship together):
--   src/SchedulePage.jsx   KINDS               — the create/edit <select>
--   src/SchedulePage.css   .sch-kind-training  — the kind pill colour
--   supabase/functions/discord-calendar/lib/render.js
--                          KIND_COLORS / KIND_LABELS ('Training')
--
-- 'training' deliberately does NOT open the shop: SHOP_OPEN_KINDS stays
-- ['build'] in src/shopStatus.js and supabase/functions/calendar-feed/index.ts.
-- ============================================================

alter table public.events drop constraint if exists events_kind_check;

alter table public.events
  add constraint events_kind_check
  check (kind in ('build', 'meeting', 'competition', 'potluck',
                  'outreach', 'volunteering', 'training', 'other'));

-- Verify: should return zero rows (every stored kind is in the vocabulary).
select id, title, kind
from public.events
where kind not in ('build', 'meeting', 'competition', 'potluck',
                   'outreach', 'volunteering', 'training', 'other');
