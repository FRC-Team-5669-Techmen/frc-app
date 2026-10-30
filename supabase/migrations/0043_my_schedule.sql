-- ============================================================
-- 0043_my_schedule: each member's own competition schedule, and a push
-- before every station and ride (ledger 0033). Needs 0005 (the event family
-- hub: cars and seats), 0024 (_push_one) and 0031 (role board statuses).
--
-- WHY. Mr. Pina, 2026-10-30: "a function for someone to see their daily
-- schedule for each day of competition, just their own schedule, when they
-- have to be where", and "push notifications a few minutes before they have
-- to be at their station or at their role".
--
-- WHAT THIS DOES.
--   public.my_schedule_rides(p_from, p_to)   the caller's own seats in trip
--                    cars between two dates (14 days at most): trip, day, to
--                    venue or home, car, driver, leave-by, left and arrived
--                    times, and the day's meeting time and place. Only the
--                    caller's own seats; nothing about anyone else.
--   public.schedule_reminders_sent   a ledger of reminders already sent, one
--                    text key per member and slot or car. RLS on, NO policy,
--                    every client privilege revoked. The key holds no member
--                    column, so a merge has nothing to move.
--   public.schedule_reminders_run(p_now)   for pg_cron only (no client may
--                    call it): every member ASSIGNED in a role board slot that
--                    starts within the next 10 minutes gets one push naming
--                    their roles, the slot, its start and where to go; every
--                    student seated in a car that leaves within 15 minutes
--                    (and has not left) gets one push naming the car, driver
--                    and leave time. Backups and asks are never reminded.
--                    Each goes through _push_one (category role_reminder, a
--                    member turns it off in Notifications), which does nothing
--                    while push is not deployed. Returns how many it sent.
--   cron 'schedule-reminders'   every minute, where pg_cron exists.
-- ============================================================

do $prereq$
begin
  if to_regclass('public.hub_seats') is null then raise exception '0043 needs 0005_event_family_hub.sql applied first'; end if;
  if to_regprocedure('public._push_one(uuid,text,text,text,text,text,text)') is null then raise exception '0043 needs 0024_feedback_inbox.sql applied first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_requests' and column_name = 'status') then
    raise exception '0043 needs 0031_role_board_v2.sql applied first';
  end if;
end
$prereq$;

-- Does: List your own seats in trip cars between two dates: the car, driver, leave time, and the day's meeting time and place.
create or replace function public.my_schedule_rides(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sign in first.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 14 then
    raise exception using errcode = '22023', message = 'Choose up to 14 days.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'trip', e.title, 'trip_id', e.id, 'date', d.day_date, 'run', c.run, 'car_id', c.id,
             'description', c.description, 'driver', public._hub_driver_name(c.id), 'leave_by', c.leave_by,
             'left_at', c.left_at, 'arrived_at', c.arrived_at, 'meet_at', d.meet_at, 'meet_place', d.meet_place)
           order by d.day_date, (c.run = 'home'), c.leave_by)
      from public.hub_seats s
      join public.hub_invites i on i.id = s.invite_id
      join public.hub_cars c on c.id = s.car_id
      join public.hub_days d on d.id = s.day_id
      join public.hub_events e on e.id = d.event_id
     where i.student_id = auth.uid() and d.day_date between p_from and p_to), '[]'::jsonb);
end
$fn$;
revoke all on function public.my_schedule_rides(date, date) from public, anon;
grant execute on function public.my_schedule_rides(date, date) to authenticated, service_role;

create table if not exists public.schedule_reminders_sent (
  key     text        primary key check (length(key) between 3 and 200),
  sent_at timestamptz not null default now()
);
alter table public.schedule_reminders_sent enable row level security;
revoke all on table public.schedule_reminders_sent from public, anon, authenticated;

-- A role key as people say it: scouting_lead is "Scouting lead".
create or replace function public._role_words(p_role text)
returns text language sql immutable set search_path = pg_catalog as $fn$
  select case p_role when 'meet_team' then 'Meet a team'
    else upper(left(replace(p_role, '_', ' '), 1)) || substr(replace(p_role, '_', ' '), 2) end
$fn$;

-- Where a role happens (src/roleRules.js ROLE_PLACE holds the same map; tests/my-schedule.test.js keeps them equal).
create or replace function public._role_place(p_role text)
returns text language sql immutable set search_path = pg_catalog as $fn$
  select case
    when p_role in ('driver','operator','human_player','drive_coach','team_captain') then 'the field (drive team queue)'
    when p_role in ('scout','scouting_lead') then 'the stands'
    when p_role in ('pit_crew','battery_captain','safety_captain','pit_speaker','impact_presenter') then 'the pit'
    else 'your assignment' end
$fn$;

create or replace function public.schedule_reminders_run(p_now timestamptz default now())
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare v_n integer := 0; r record; v_mins integer; v_places text;
begin
  -- Stations: one push per member per slot, naming every role assigned in it.
  for r in
    select q.member_id, s.id as slot_id, s.label, s.starts_at,
           string_agg(public._role_words(q.role), ', ' order by q.role) as roles,
           array_agg(distinct public._role_place(q.role)) as places
      from public.role_requests q
      join public.role_slots s on s.id = q.slot_id
     where q.status = 'assigned' and s.starts_at > p_now and s.starts_at <= p_now + interval '10 minutes'
     group by q.member_id, s.id, s.label, s.starts_at
  loop
    insert into public.schedule_reminders_sent(key) values ('role:' || r.slot_id || ':' || r.member_id) on conflict do nothing;
    if not found then continue; end if;
    v_mins := greatest(1, ceil(extract(epoch from (r.starts_at - p_now)) / 60)::integer);
    v_places := array_to_string(r.places, ' and ');
    perform public._push_one(r.member_id, 'role_reminder', 'role_reminder', r.slot_id::text,
      'In ' || v_mins || ' min: ' || r.roles,
      r.label || ' starts at ' || to_char(r.starts_at at time zone 'America/Los_Angeles', 'FMHH12:MI AM') || '. Go to ' || v_places || '.',
      '/my-schedule');
    v_n := v_n + 1;
  end loop;
  -- Rides: 15 minutes before a car leaves, everyone seated in it.
  for r in
    select i.student_id as member_id, c.id as car_id, c.description, c.leave_by, c.run, public._hub_driver_name(c.id) as driver
      from public.hub_seats s
      join public.hub_invites i on i.id = s.invite_id
      join public.hub_cars c on c.id = s.car_id
     where c.leave_by > p_now and c.leave_by <= p_now + interval '15 minutes' and c.left_at is null
  loop
    insert into public.schedule_reminders_sent(key) values ('ride:' || r.car_id || ':' || r.member_id) on conflict do nothing;
    if not found then continue; end if;
    v_mins := greatest(1, ceil(extract(epoch from (r.leave_by - p_now)) / 60)::integer);
    perform public._push_one(r.member_id, 'role_reminder', 'ride_reminder', r.car_id::text,
      'Your car leaves in ' || v_mins || ' min',
      coalesce(nullif(btrim(r.driver), ''), 'Your driver') || ', ' || r.description || ', leaves at '
        || to_char(r.leave_by at time zone 'America/Los_Angeles', 'FMHH12:MI AM') || (case r.run when 'home' then ' for home.' else ' for the venue.' end),
      '/my-schedule');
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$fn$;
revoke all on function public.schedule_reminders_run(timestamptz) from public, anon, authenticated;
grant execute on function public.schedule_reminders_run(timestamptz) to service_role;

do $cron$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('schedule-reminders') where exists (select 1 from cron.job where jobname = 'schedule-reminders');
    perform cron.schedule('schedule-reminders', '* * * * *', $c$ select public.schedule_reminders_run() $c$);
  end if;
end
$cron$;
