-- ============================================================
-- Discord calendar posting — tracking + audit tables
-- Run once in the Supabase SQL editor. Creates the tracking + audit tables AND
-- schedules the hourly pg_cron job that drives the discord-calendar Edge
-- Function (section 4). The function reads/writes these with the SERVICE ROLE;
-- no client ever writes them.
--
-- See supabase/functions/discord-calendar/README.md for secrets, deploy, and
-- how to leave report-only mode.
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
  --            write has not confirmed yet. See the Edge Function's
  --            lib/calendarSync.js:
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
--   rate_limited, message_missing, auth_retry, reminder_missed, error
--
-- Two of those are diagnostics rather than actions taken:
--   auth_retry      one bounded retry of a READ that PostgREST rejected with a
--                   transient JWT error (clock skew between the Edge runtime
--                   and the database). Two of these in a row on one phase means
--                   the retry was exhausted.
--   reminder_missed an event started with no reminder row for it, so nobody was
--                   told. Written once per (event, kind), carrying the event id:
--                     select event_id, post_kind, detail
--                       from public.discord_calendar_log
--                      where action = 'reminder_missed'
--                      order by created_at desc;
--
-- Note also that `error` details now carry `fatal` true or false. A false one
-- is a phase that failed without stopping the run (today: cancellation_sweep).
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Scheduling — pg_cron → pg_net → the discord-calendar Edge Function
--
-- Same mechanism as push_notifications.sql section 7: a private config table
-- holding the functions base URL and a shared secret, a SECURITY DEFINER
-- function that POSTs via pg_net, and a cron.schedule entry. The Edge Function
-- checks that secret in an `x-cron-secret` header (send-push / cron-notify use
-- `x-push-secret` + PUSH_SECRET for the same purpose).
--
-- Separate config row rather than reusing private.push_config on purpose:
-- filling in push_config activates the push triggers and their crons, and per
-- CLAUDE.md the push deploy is deliberately still on hold. Chaining calendar
-- posting to that would force one to ship before the other.
--
-- Until edge_base_url is filled in, invoke_discord_calendar() returns without
-- calling anything — so applying this file early is harmless.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;

create table if not exists private.discord_calendar_config (
  id            int primary key default 1 check (id = 1),
  edge_base_url text,   -- https://<project-ref>.functions.supabase.co
  hook_secret   text,   -- must equal the DISCORD_CRON_SECRET function secret
  created_at    timestamptz not null default now()
);
insert into private.discord_calendar_config (id) values (1) on conflict (id) do nothing;

-- RLS on with no policies: anon/authenticated get nothing. The SECURITY DEFINER
-- function below is owned by postgres and bypasses RLS, so the shared secret is
-- readable there and nowhere else.
alter table private.discord_calendar_config enable row level security;

create or replace function public.invoke_discord_calendar()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_cfg private.discord_calendar_config;
begin
  select * into v_cfg from private.discord_calendar_config where id = 1;
  if v_cfg.edge_base_url is null then return; end if;   -- not deployed yet
  perform net.http_post(
    url     := v_cfg.edge_base_url || '/discord-calendar',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-cron-secret',  v_cfg.hook_secret),
    body    := '{}'::jsonb
  );
end;
$fn$;

-- Hourly, on the hour. Comfortably inside the 2-hour reminder window, so one
-- missed run cannot skip a reminder.
-- unschedule-then-schedule keeps this file re-runnable (cron.schedule raises on
-- a duplicate job name).
select cron.unschedule('discord-calendar-hourly')
where exists (select 1 from cron.job where jobname = 'discord-calendar-hourly');

select cron.schedule('discord-calendar-hourly', '0 * * * *',
  $$ select public.invoke_discord_calendar() $$);

-- ============================================================
-- DEPLOY
--   1. Run this whole file.
--   2. supabase secrets set DISCORD_BOT_TOKEN=… DISCORD_GUILD_ID=… \
--        DISCORD_CRON_SECRET=…            (DISCORD_CALENDAR_MODE stays unset =
--                                          report-only)
--   3. npx supabase functions deploy discord-calendar --no-verify-jwt
--   4. Fill in the config row — this is what actually starts the schedule:
--        update private.discord_calendar_config
--           set edge_base_url = 'https://<project-ref>.functions.supabase.co',
--               hook_secret   = '<the same value as DISCORD_CRON_SECRET>'
--         where id = 1;
--   5. Watch discord_calendar_log for report-only plan_* rows, then set
--        DISCORD_CALENDAR_MODE=live and redeploy the function.
--
-- To pause posting without touching the schedule:
--   update private.discord_calendar_config set edge_base_url = null where id = 1;
-- To stop the schedule entirely:
--   select cron.unschedule('discord-calendar-hourly');
-- ============================================================
