-- ============================================================
-- Discord calendar posting — tracking + audit tables
-- Run once in the Supabase SQL editor BEFORE the Vercel cron is switched
-- out of report-only mode. The cron reads/writes these with the SERVICE
-- ROLE; no client ever writes them.
--
-- See api/README.md for the function, env vars, and cron schedule.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. discord_calendar_posts — the no-double-post ledger
--
-- One row per (event, post kind). The UNIQUE constraint IS the correctness
-- guarantee: double-posting is impossible at the database level, not merely
-- unlikely because the app checked first. A concurrent/retried cron run gets
-- 23505 on the second insert and skips.
--
-- DELIBERATELY NO FOREIGN KEY on event_id.
-- public.events has no `cancelled` column — staff cancel by DELETING the row
-- (SchedulePage's delete button). A FK with `on delete cascade` would destroy
-- this row at the exact moment we need it, and `on delete set null` would lose
-- the key. The tracking row must OUTLIVE the event so the posted message can be
-- edited to "cancelled". event_snapshot carries the last known event for the
-- same reason: the row is gone, but the message still has to render.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.discord_calendar_posts (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null,                     -- no FK, see above
  post_kind      text not null
                   check (post_kind in ('calendar', 'reminder_24h', 'reminder_2h')),
  channel_id     text not null,
  channel_name   text not null,
  message_id     text,                              -- null for superseded/archived
  content_hash   text not null,                     -- of the rendered payload
  event_snapshot jsonb not null,                    -- last known event row
  -- pending  = row reserved (the unique constraint claimed) but the Discord
  --            write has not confirmed yet. See api/_lib/calendarSync.js:
  --            the reservation is taken BEFORE the API call so the database,
  --            not application logic, is what prevents a double post.
  -- posted    = message live, message_id set
  -- cancelled = event row deleted; message edited to struck-through CANCELLED
  -- superseded= reminder whose window had already passed when first seen
  -- archived  = message gone from Discord, or event deleted after it ended
  status         text not null default 'pending'
                   check (status in ('pending', 'posted', 'cancelled', 'superseded', 'archived')),
  -- Last known event window, mirrored out of event_snapshot so the cancellation
  -- sweep ("which tracked events no longer exist?") is an indexed query rather
  -- than a jsonb scan.
  event_starts_at timestamptz,
  event_ends_at   timestamptz,
  posted_at      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  cancelled_at   timestamptz,
  unique (event_id, post_kind)
);

create index if not exists dcp_event_idx  on public.discord_calendar_posts (event_id);
create index if not exists dcp_status_idx on public.discord_calendar_posts (status);
create index if not exists dcp_ends_idx   on public.discord_calendar_posts (event_ends_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. discord_calendar_log — every action, including the ones not taken
--
-- Report-only mode writes ONLY here (never to discord_calendar_posts), so the
-- dry runs never burn a dedupe key and switching to live posts everything as if
-- for the first time.
--
-- action vocabulary (kept open — text, not a CHECK — so a new action does not
-- need a migration):
--   run_start, run_end, resolve, plan_create, plan_edit, plan_cancel,
--   created, edited, cancelled, superseded, archived, skipped,
--   rate_limited, message_missing, error
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.discord_calendar_log (
  id         bigint generated always as identity primary key,
  run_id     uuid not null,
  event_id   uuid,
  post_kind  text,
  action     text not null,
  report_only boolean not null default false,
  detail     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dcl_run_idx     on public.discord_calendar_log (run_id);
create index if not exists dcl_created_idx on public.discord_calendar_log (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — staff read, nobody writes
--
-- Same shape as notifications_sent (push_notifications.sql): the service role
-- bypasses RLS and is the only writer. There is no insert/update/delete policy
-- for `authenticated` or `anon` at all, so a client write is silently 0 rows —
-- which is the intent. Staff get SELECT so the log is inspectable in the app or
-- the SQL editor without reaching for the service key.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.discord_calendar_posts enable row level security;
alter table public.discord_calendar_log   enable row level security;

drop policy if exists "dcp readable by staff" on public.discord_calendar_posts;
create policy "dcp readable by staff"
  on public.discord_calendar_posts for select to authenticated
  using (public.is_staff());

drop policy if exists "dcl readable by staff" on public.discord_calendar_log;
create policy "dcl readable by staff"
  on public.discord_calendar_log for select to authenticated
  using (public.is_staff());

grant select on public.discord_calendar_posts to authenticated;
grant select on public.discord_calendar_log   to authenticated;

-- The bootstrap ALTER DEFAULT PRIVILEGES grants anon on new public tables, so
-- policy scoping alone is not the anon barrier (see parent_responses.sql).
revoke all on public.discord_calendar_posts from anon;
revoke all on public.discord_calendar_log   from anon;
