-- ============================================================
-- Push notifications (web push)
-- Run once in the Supabase SQL editor. Safe to run before the Edge Functions
-- are deployed: the trigger/cron wiring no-ops until private.push_config is
-- filled in (see the DEPLOY section at the bottom).
-- ============================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── 1. push_subscriptions ───────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  endpoint   text primary key,                 -- unique per browser/device
  member_id  uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_member_idx on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;

-- A member manages only their own subscriptions. The send function reads all
-- via the service role (bypasses RLS).
drop policy if exists "push_subs select own" on public.push_subscriptions;
create policy "push_subs select own" on public.push_subscriptions
  for select to authenticated using (member_id = auth.uid());
drop policy if exists "push_subs insert own" on public.push_subscriptions;
create policy "push_subs insert own" on public.push_subscriptions
  for insert to authenticated with check (member_id = auth.uid());
drop policy if exists "push_subs update own" on public.push_subscriptions;
create policy "push_subs update own" on public.push_subscriptions
  for update to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());
drop policy if exists "push_subs delete own" on public.push_subscriptions;
create policy "push_subs delete own" on public.push_subscriptions
  for delete to authenticated using (member_id = auth.uid());

grant all on public.push_subscriptions to authenticated;

-- ── 2. profiles.notification_prefs (jsonb with defaults) ────────────────────
-- Categories: task_signoff (on), event_reminder (on), shop_status (OFF),
-- parent_digest (on). Master enabled flag + quiet hours (America/Los_Angeles).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{
    "enabled": true,
    "task_signoff": true,
    "event_reminder": true,
    "shop_status": false,
    "parent_digest": true,
    "quiet_hours": { "start": "21:00", "end": "07:00" }
  }'::jsonb;

-- ── 3. events.mandatory ─────────────────────────────────────────────────────
-- Mandatory events reach everyone regardless of RSVP.
alter table public.events add column if not exists mandatory boolean not null default false;

-- ── 4. notifications_sent (dedupe ledger) ───────────────────────────────────
create table if not exists public.notifications_sent (
  member_id uuid not null references public.profiles(id) on delete cascade,
  kind      text not null,
  ref_id    text not null,
  sent_at   timestamptz not null default now(),
  primary key (member_id, kind, ref_id)
);
-- No client access: only the send function (service role) reads/writes this.
alter table public.notifications_sent enable row level security;

-- ── 5. Private config for the trigger/cron HTTP calls ───────────────────────
-- Not exposed to PostgREST and not granted to authenticated, so the shared
-- secret never reaches clients. Only SECURITY DEFINER functions read it.
create schema if not exists private;
create table if not exists private.push_config (
  id            int primary key default 1 check (id = 1),
  edge_base_url text,   -- https://<project-ref>.functions.supabase.co
  hook_secret   text,   -- shared secret; must equal the PUSH_SECRET function env
  created_at    timestamptz not null default now()
);
insert into private.push_config (id) values (1) on conflict (id) do nothing;

-- ── 6. Immediate trigger: task sign-off result → claimant ───────────────────
-- Fires on the verify_task transition out of 'submitted'. completed = approved,
-- back to 'claimed' = rejected. Calls send-push via pg_net.
create or replace function public.notify_task_signoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cfg    private.push_config;
  v_result text;
  v_title  text;
  v_body   text;
  v_ttl    text;
begin
  if    old.status = 'submitted' and new.status = 'completed' then v_result := 'completed';
  elsif old.status = 'submitted' and new.status = 'claimed'   then v_result := 'rejected';
  else  return new;
  end if;

  select * into v_cfg from private.push_config where id = 1;
  if v_cfg.edge_base_url is null then return new; end if;  -- not deployed yet

  select title into v_ttl from public.tasks where id = new.task_id;
  if v_result = 'completed' then
    v_title := 'Job signed off';
    v_body  := coalesce(v_ttl, 'Your job') || ' was approved.';
  else
    v_title := 'Job sent back';
    v_body  := coalesce(v_ttl, 'Your job') || ' needs another look.';
  end if;

  perform net.http_post(
    url     := v_cfg.edge_base_url || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.hook_secret),
    body    := jsonb_build_object('targets', jsonb_build_array(jsonb_build_object(
                 'member_id', new.member_id,
                 'category',  'task_signoff',
                 'kind',      'task_signoff',
                 'ref_id',    new.task_id::text || ':' || v_result,
                 'title',     v_title,
                 'body',      v_body,
                 'url',       '/jobs'
               )))
  );
  return new;
end;
$fn$;

drop trigger if exists trg_task_signoff on public.task_claims;
create trigger trg_task_signoff
  after update of status on public.task_claims
  for each row execute function public.notify_task_signoff();

-- ── 7. Scheduled jobs (pg_cron → cron-notify) ───────────────────────────────
create or replace function public.invoke_cron_notify(p_job text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_cfg private.push_config;
begin
  select * into v_cfg from private.push_config where id = 1;
  if v_cfg.edge_base_url is null then return; end if;
  perform net.http_post(
    url     := v_cfg.edge_base_url || '/cron-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.hook_secret),
    body    := jsonb_build_object('job', p_job)
  );
end;
$fn$;

-- Event reminders: hourly (dedupe keeps it to one per member per day).
select cron.schedule('push-event-reminders', '0 * * * *',
  $$ select public.invoke_cron_notify('event_reminder') $$);
-- Parent daily digest: 03:00 UTC ≈ 8 PM Pacific.
select cron.schedule('push-parent-digest', '0 3 * * *',
  $$ select public.invoke_cron_notify('parent_digest') $$);
-- Shop status is opt-in/off by default and emitted by cron-notify only when a
-- transition is detected; it shares the hourly run via 'event_reminder'? No —
-- keep it separate and optional:
select cron.schedule('push-shop-status', '*/15 * * * *',
  $$ select public.invoke_cron_notify('shop_status') $$);

-- ============================================================
-- DEPLOY (after deploying the Edge Functions — see supabase/functions/):
--   1. Generate VAPID keys (npx web-push generate-vapid-keys).
--   2. Frontend env (Vercel): VITE_VAPID_PUBLIC_KEY = <public key>.
--   3. Function secrets:
--        VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@domain),
--        PUSH_SECRET (any long random string).
--   4. Fill private.push_config so the trigger/cron start firing:
--        update private.push_config set
--          edge_base_url = 'https://<project-ref>.functions.supabase.co',
--          hook_secret   = '<same value as PUSH_SECRET>'
--        where id = 1;
-- Until step 4, the trigger and cron are installed but no-op.
-- ============================================================
