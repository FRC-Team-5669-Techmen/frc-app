-- ============================================================
-- Notification triggers: schedule changes, skill sign-offs, check-in reminders
-- Run once in the Supabase SQL editor (additive; reuses the push_notifications
-- transport — pg_net, private.push_config, send-push / cron-notify).
-- No-ops until private.push_config is filled in (same as the other triggers).
-- ============================================================

-- ── 1. SCHEDULE CHANGES (events INSERT / UPDATE / DELETE → schedule_change) ──
-- Series coalescing: STATEMENT-level triggers fire once per SQL statement, so a
-- bulk series INSERT (one multi-row insert) and a whole-series DELETE (one
-- delete by series_id) each produce a single notification. A whole-series EDIT
-- is N single-row UPDATE statements; those are coalesced downstream because every
-- one uses the same ref_id (sched:edit:<series_id>:<day>), so send-push's dedupe
-- ledger collapses them to one push per member. Standalone changes send one.

-- Shared sender: broadcast to members who have schedule_change enabled.
create or replace function public.notify_schedule_change(p_title text, p_body text, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cfg     private.push_config;
  v_targets jsonb;
begin
  select * into v_cfg from private.push_config where id = 1;
  if v_cfg.edge_base_url is null then return; end if;  -- not deployed yet

  select jsonb_agg(jsonb_build_object(
           'member_id', p.id,
           'category',  'schedule_change',
           'kind',      'schedule_change',
           'ref_id',    p_ref,
           'title',     p_title,
           'body',      p_body,
           'url',       '/schedule'))
    into v_targets
  from public.profiles p
  where coalesce((p.notification_prefs->>'enabled')::boolean, true)
    and coalesce((p.notification_prefs->>'schedule_change')::boolean, true);

  if v_targets is null then return; end if;  -- nobody opted in

  perform net.http_post(
    url     := v_cfg.edge_base_url || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.hook_secret),
    body    := jsonb_build_object('targets', v_targets)
  );
end;
$fn$;

create or replace function public.notify_events_insert()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_cnt int; v_series uuid; v_title text; v_id uuid; v_key text; v_body text;
begin
  select count(*), (array_agg(series_id))[1], (array_agg(title order by starts_at))[1], (array_agg(id))[1]
    into v_cnt, v_series, v_title, v_id from new_rows;
  if v_cnt > 1 then
    v_key  := coalesce(v_series::text, v_id::text);
    v_body := v_cnt::text || ' events were added to the schedule.';
  else
    v_key  := v_id::text;
    v_body := coalesce(v_title, 'An event') || ' was added to the schedule.';
  end if;
  perform public.notify_schedule_change(
    'New on the schedule', v_body, 'sched:add:' || v_key || ':' || to_char(now(), 'YYYYMMDD'));
  return null;
end; $fn$;

create or replace function public.notify_events_update()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_cnt int; v_series uuid; v_title text; v_id uuid; v_key text; v_body text;
begin
  select count(*), (array_agg(series_id))[1], (array_agg(title))[1], (array_agg(id))[1]
    into v_cnt, v_series, v_title, v_id from new_rows;
  if v_series is not null then
    v_key  := v_series::text;
    v_body := coalesce(v_title, 'A recurring event') || ' was updated (whole series).';
  elsif v_cnt > 1 then
    v_key  := v_id::text;
    v_body := v_cnt::text || ' events were updated.';
  else
    v_key  := v_id::text;
    v_body := coalesce(v_title, 'An event') || ' was updated.';
  end if;
  perform public.notify_schedule_change(
    'Schedule updated', v_body, 'sched:edit:' || v_key || ':' || to_char(now(), 'YYYYMMDD'));
  return null;
end; $fn$;

create or replace function public.notify_events_delete()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_cnt int; v_series uuid; v_title text; v_id uuid; v_key text; v_body text;
begin
  select count(*), (array_agg(series_id))[1], (array_agg(title))[1], (array_agg(id))[1]
    into v_cnt, v_series, v_title, v_id from old_rows;
  if v_cnt > 1 then
    v_key  := coalesce(v_series::text, v_id::text);
    v_body := v_cnt::text || ' events were removed from the schedule.';
  else
    v_key  := v_id::text;
    v_body := coalesce(v_title, 'An event') || ' was canceled.';
  end if;
  perform public.notify_schedule_change(
    'Schedule change', v_body, 'sched:del:' || v_key || ':' || to_char(now(), 'YYYYMMDD'));
  return null;
end; $fn$;

drop trigger if exists trg_events_insert on public.events;
create trigger trg_events_insert
  after insert on public.events
  referencing new table as new_rows for each statement
  execute function public.notify_events_insert();

drop trigger if exists trg_events_update on public.events;
create trigger trg_events_update
  after update on public.events
  referencing new table as new_rows for each statement
  execute function public.notify_events_update();

drop trigger if exists trg_events_delete on public.events;
create trigger trg_events_delete
  after delete on public.events
  referencing old table as old_rows for each statement
  execute function public.notify_events_delete();

-- ── 2. SKILL SIGN-OFFS (member_skills → certified) ──────────────────────────
-- Mirrors notify_task_signoff. member_skills only has 'in_progress' / 'certified'
-- (no 'pending'/'submitted' state), so the wired event is becoming certified.
create or replace function public.notify_skill_signoff()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_cfg private.push_config; v_name text; v_body text;
begin
  if new.status <> 'certified' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'certified' then return new; end if;  -- no change

  select * into v_cfg from private.push_config where id = 1;
  if v_cfg.edge_base_url is null then return new; end if;

  select name into v_name from public.skills where id = new.skill_id;
  v_body := coalesce(v_name, 'A skill') || ' was signed off.';

  perform net.http_post(
    url     := v_cfg.edge_base_url || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.hook_secret),
    body    := jsonb_build_object('targets', jsonb_build_array(jsonb_build_object(
                 'member_id', new.member_id,
                 'category',  'skill_signoff',
                 'kind',      'skill_signoff',
                 'ref_id',    new.skill_id::text || ':certified',
                 'title',     'Skill certified',
                 'body',      v_body,
                 'url',       '/profile'
               )))
  );
  return new;
end; $fn$;

drop trigger if exists trg_skill_signoff on public.member_skills;
create trigger trg_skill_signoff
  after insert or update of status on public.member_skills
  for each row execute function public.notify_skill_signoff();

-- ── 3. CHECK-IN REMINDERS (scheduled) ───────────────────────────────────────
-- One evening run (~9 PM Pacific = 04:00 UTC), handled by cron-notify, which
-- reminds anyone still checked in (open check-in) to check out. Deduped to once
-- per member per day; respects the checkin_reminder pref (default OFF).
select cron.schedule('push-checkin-reminders', '0 4 * * *',
  $$ select public.invoke_cron_notify('checkin_reminder') $$);
