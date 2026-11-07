-- Seven feedback reports: standing evidence and pause accounting.
-- Needs the chain through 0047. Applied by migrate.yml.
-- Rollback: restore _letter_json from 0017 and _member_meetings from 0044;
-- restore _member_hours from 0015; remove the new triggers and functions.
-- Keep pauses and standing_record_evidence: dropping them loses recorded evidence.
-- Additive schema; older clients keep working during deployment.

create or replace function public._letter_json(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare
  sy date := public._school_year_start(public._la_today());
  s public.standing_settings;
  v_vol numeric;
  v_comp_miss integer := 0;
  v_role boolean := false;
  v_build_short integer;
  v_safety integer;
  v_written integer;
  v_train jsonb := public._training_list(p_member);
begin
  select * into s from public.standing_settings;
  v_vol := round(public._volunteer_hours(p_member, sy), 1);
  if to_regclass('public.event_attendance') is not null then
    execute 'select count(*) from public.event_attendance a join public.events e on e.id = a.event_id
              where a.member_id = $1 and a.status = ''absent'' and e.kind = ''competition'' and a.day >= $2'
      into v_comp_miss using p_member, sy;
    execute 'select exists (select 1 from public.event_roles r join public.events e on e.id = r.event_id
              where r.member_id = $1 and e.starts_at >= $2::timestamptz)'
      into v_role using p_member, public._la_start(sy);
  end if;
  select count(*) into v_build_short from public.standing_weeks w
   where w.member_id = p_member and w.week_start between s.build_season_start and s.build_season_end and not w.excused and not w.suspended and w.hours < s.build_weekly_hours;
  select count(*) into v_safety from public.safety_violations where member_id = p_member and public._la_date(logged_at) >= sy;
  select count(*) into v_written from public.discipline_records where member_id = p_member and level in ('written', 'suspension', 'removal') and public._la_date(created_at) >= sy;
  return jsonb_build_array(
    jsonb_build_object('key', 'standing', 'label', 'A full season with no meetings or hours probation',
      'met', not exists (select 1 from public.standing_records where member_id = p_member and kind in ('meetings', 'hours', 'removal') and opened_on >= sy and status <> 'dismissed')),
    jsonb_build_object('key', 'build_hours', 'label', '10 signed-in hours every build-season week',
      'met', v_build_short = 0, 'detail', v_build_short || ' short weeks'),
    jsonb_build_object('key', 'competitions', 'label', 'Every competition, every day', 'met', v_comp_miss = 0, 'detail', v_comp_miss || ' days missed'),
    jsonb_build_object('key', 'role', 'label', 'An assigned role at a competition or hosted event', 'met', v_role),
    jsonb_build_object('key', 'conduct', 'label', 'At most one safety violation and no written warning',
      'met', v_safety <= 1 and v_written = 0, 'detail', v_safety || ' safety, ' || v_written || ' written'),
    jsonb_build_object('key', 'grades', 'label', 'A 2.0 GPA or higher at every grade check',
      'met', not exists (select 1 from public.grade_checks where member_id = p_member and below and check_date >= sy)),
    jsonb_build_object('key', 'training', 'label', 'SAFE-1, RESP-1 and sub-team training complete',
      'met', not exists (select 1 from jsonb_array_elements(v_train) x where (x ->> 'required')::boolean and not (x ->> 'held')::boolean)),
    jsonb_build_object('key', 'volunteer', 'label', '10 volunteer hours, FLL included', 'met', v_vol >= 10, 'detail', v_vol || ' hours'),
    jsonb_build_object('key', 'contribution', 'label', 'A clear contribution to your sub-team, confirmed by its lead and a mentor',
      'met', exists (select 1 from public.letter_contributions where member_id = p_member and season_start = sy)));
end;
$fn$;

revoke execute on function public._letter_json(uuid) from public, anon, authenticated, service_role;

-- One meeting row explains both the aggregate and the mentor evidence view.
create or replace function public._standing_meeting_details(p_member uuid, p_from date, p_to date)
returns table (event_id uuid, title text, starts_at timestamptz, ends_at timestamptz,
  scan text, source text, source_id uuid, source_at timestamptz, geo_ok boolean, manual boolean,
  excused boolean, on_break boolean, suspended boolean, recorded boolean)
language sql stable security definer set search_path = public
as $fn$
  select e.id, e.title, e.starts_at, e.ends_at, hit.scan, hit.source, hit.source_id, hit.source_at, hit.geo_ok, hit.manual,
    public._absence_excused(p_member, e.id, e.starts_at),
    exists (select 1 from public.team_weeks w where w.kind = 'break' and w.week_start = date_trunc('week', public._la_date(e.starts_at))::date),
    public._member_suspended(p_member, public._la_date(e.starts_at)),
    public._meeting_recorded(e.id, e.starts_at, e.ends_at)
  from public.events e
  left join lateral (
    select x.* from (
      select 'present'::text as scan, 'session_at_start'::text as source, a.id as source_id,
        a.event_time as source_at, a.geo_ok, coalesce(a.manual_entry, false) as manual
      from public.attendance_events a
      where a.user_id = p_member and a.type = 'in' and a.event_time <= e.starts_at
        and public._session_open_at(p_member, e.starts_at)
        and a.id = (select z.id from public.attendance_events z where z.user_id = p_member and z.event_time <= e.starts_at order by z.event_time desc, z.id desc limit 1)
      union all
      select case when a.event_time <= e.starts_at + interval '15 minutes' then 'present' else 'late' end,
        'attendance_in', a.id, a.event_time, a.geo_ok, coalesce(a.manual_entry, false)
      from public.attendance_events a where a.user_id = p_member and a.type = 'in'
        and a.event_time >= e.starts_at and a.event_time <= e.ends_at
      union all
      -- A scan explicitly linked to this meeting remains evidence if its time moves.
      select mc.status, 'meeting_checkin', mc.event_id, mc.scanned_at, null::boolean, false
      from public.meeting_checkins mc where mc.member_id = p_member and mc.event_id = e.id
    ) x order by (x.scan = 'present') desc, x.source_at, x.source_id limit 1
  ) hit on true
  where e.kind = 'meeting' and e.ends_at < now() and public._la_date(e.starts_at) between p_from and p_to;
$fn$;
revoke execute on function public._standing_meeting_details(uuid,date,date) from public, anon, authenticated, service_role;

create or replace function public._member_meetings(p_member uuid, p_from date, p_to date)
returns table (total integer, counted integer, attended integer, lates integer, misses integer)
language sql stable security definer set search_path = public
as $fn$
  select count(*) filter (where recorded)::int,
    count(*) filter (where recorded and (scan is not null or not (excused or on_break or suspended)))::int,
    count(*) filter (where recorded and scan is not null)::int,
    count(*) filter (where recorded and scan = 'late')::int,
    count(*) filter (where recorded and scan is null and not (excused or on_break or suspended))::int
  from public._standing_meeting_details(p_member, p_from, p_to);
$fn$;
revoke execute on function public._member_meetings(uuid,date,date) from public, anon, authenticated, service_role;

create index if not exists attendance_events_member_time_idx on public.attendance_events(user_id,event_time desc,id desc);

-- Pause times are server written on the original IN, preserving all existing
-- attendance read policies and the extended-session/sign-out approval rules.
alter table public.attendance_events add column if not exists pauses jsonb not null default '[]'::jsonb;
create or replace function public._protect_attendance_pauses()
returns trigger language plpgsql set search_path = public
as $fn$
begin
  if current_user in ('anon','authenticated') then
    if (tg_op = 'INSERT' and new.pauses <> '[]'::jsonb)
      or (tg_op = 'UPDATE' and new.pauses is distinct from old.pauses) then
      raise exception 'Use the pause control' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fn$;
revoke execute on function public._protect_attendance_pauses() from public, anon, authenticated, service_role;
drop trigger if exists protect_attendance_pauses on public.attendance_events;
create trigger protect_attendance_pauses before insert or update on public.attendance_events
for each row execute function public._protect_attendance_pauses();

create or replace function public.set_session_paused(p_in uuid, p_paused boolean)
returns public.attendance_events language plpgsql security definer set search_path = public
as $fn$
declare v public.attendance_events; last_id uuid; n int; t timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved and p.status = 'active')
    or not (public.has_role('student') or public.is_staff()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_paused is null then raise exception 'Choose pause or resume' using errcode = '22023'; end if;
  select * into v from public.attendance_events where id = p_in for update;
  if v.id is null or v.user_id <> auth.uid() then raise exception 'Not your session' using errcode = '42501'; end if;
  select id into last_id from public.attendance_events where user_id = auth.uid() order by event_time desc, id desc limit 1;
  if v.type <> 'in' or last_id <> v.id or not (public._la_date(v.event_time) = public._la_today() or t - v.event_time <= interval '12 hours') then
    raise exception 'This session has ended. Refresh your status.' using errcode = 'P0002';
  end if;
  n := jsonb_array_length(v.pauses);
  if p_paused and (n = 0 or v.pauses -> (n-1) ->> 'end' is not null) then
    update public.attendance_events set pauses = pauses || jsonb_build_array(jsonb_build_object('start', t, 'end', null)) where id = v.id returning * into v;
  elsif not p_paused and n > 0 and v.pauses -> (n-1) ->> 'end' is null then
    update public.attendance_events set pauses = jsonb_set(pauses, array[(n-1)::text, 'end'], to_jsonb(t)) where id = v.id returning * into v;
  end if;
  return v;
end;
$fn$;
revoke execute on function public.set_session_paused(uuid,boolean) from public, anon, service_role;
grant execute on function public.set_session_paused(uuid,boolean) to authenticated;

-- Approval, FLL switch, manual OUT and auto-close all end an open pause at
-- the recorded OUT time. This trigger grants no path around the OUT guard.
create or replace function public._end_attendance_pause()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare v public.attendance_events; n int;
begin
  if new.type <> 'out' then return new; end if;
  select * into v from public.attendance_events where user_id = new.user_id and type = 'in' and event_time <= new.event_time
    order by event_time desc, id desc limit 1 for update;
  n := jsonb_array_length(v.pauses);
  if n > 0 and v.pauses -> (n-1) ->> 'end' is null then
    update public.attendance_events set pauses = jsonb_set(pauses, array[(n-1)::text, 'end'], to_jsonb(greatest(new.event_time, (v.pauses -> (n-1) ->> 'start')::timestamptz))) where id = v.id;
  end if;
  return new;
end;
$fn$;
revoke execute on function public._end_attendance_pause() from public, anon, authenticated, service_role;
drop trigger if exists end_attendance_pause on public.attendance_events;
create trigger end_attendance_pause after insert on public.attendance_events for each row execute function public._end_attendance_pause();

create or replace function public._pause_seconds(p_pauses jsonb, p_start timestamptz, p_end timestamptz)
returns numeric language sql stable set search_path = public
as $fn$
  with r as (select greatest(p_start, (x ->> 'start')::timestamptz) as a,
    least(p_end, coalesce((x ->> 'end')::timestamptz, p_end)) as b from jsonb_array_elements(coalesce(p_pauses, '[]'::jsonb)) x),
  merged as (select unnest(range_agg(tstzrange(a,b,'[)'))) as span from r where b > a)
  select coalesce(sum(extract(epoch from upper(span)-lower(span))),0) from merged;
$fn$;
revoke execute on function public._pause_seconds(jsonb,timestamptz,timestamptz) from public, anon, authenticated, service_role;

create or replace function public._member_hours(p_member uuid, p_from timestamptz, p_to timestamptz)
returns numeric language sql stable security definer set search_path = public
as $fn$
  with ev as (
    select id, type, event_time, category, pauses,
           lead(id) over w as nid, lead(type) over w as ntype, lead(event_time) over w as ntime
      from public.attendance_events
     where user_id = p_member and event_time >= p_from - interval '1 day' and event_time < p_to + interval '13 hours'
    window w as (order by event_time, id))
  select coalesce(round(sum(extract(epoch from least(ntime, event_time + interval '12 hours') - event_time) - public._pause_seconds(pauses,event_time,least(ntime,event_time + interval '12 hours'))) / 3600.0, 2), 0)
    from ev
   where type = 'in' and ntype = 'out' and event_time >= p_from and event_time < p_to
     and coalesce(category, 'build') <> 'volunteer'
     and not exists (select 1 from public.session_reviews r where r.checkout_id = ev.nid and r.status in ('pending', 'voided'));
$fn$;

revoke execute on function public._member_hours(uuid,timestamptz,timestamptz) from public, anon, authenticated, service_role;

-- Immutable evidence is staff-only, even when the member can read the
-- standing summary. Historical rows are explicitly reconstructed on request.
create table if not exists public.standing_record_evidence (
  record_id uuid primary key references public.standing_records(id) on delete cascade,
  evidence jsonb not null
);
alter table public.standing_record_evidence enable row level security;
revoke all on public.standing_record_evidence from public, anon, authenticated, service_role;

create or replace function public._standing_evidence(p_record uuid, p_origin text)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare r public.standing_records; f date; t date; basis text;
begin
  select * into r from public.standing_records where id = p_record;
  if r.id is null then return null; end if;
  basis := case when r.kind = 'hours' or (r.kind = 'removal' and r.reason not like 'Under 80 percent%') then 'week' else 'month' end;
  t := r.opened_on;
  f := case when basis = 'week' then date_trunc('week', case when r.kind = 'hours' then t - 1 else t end)::date else date_trunc('month', t - 1)::date end;
  t := case when basis = 'week' then f + 7 else (f + interval '1 month')::date end;
  return jsonb_build_object('origin', p_origin, 'record_id', r.id, 'kind', r.kind, 'reason', r.reason,
    'captured_at', now(), 'from', f, 'to', t - 1, 'basis', basis,
    'judged_week', (select to_jsonb(w) from public.standing_weeks w where w.member_id = r.member_id and w.week_start = f),
    'judged_month', (select to_jsonb(m) from public.standing_months m where m.member_id = r.member_id and m.month = f),
    'standards_since', public._member_since(r.member_id),
    'meetings', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('before_standards',public._la_date(d.starts_at)<public._member_since(r.member_id)) order by starts_at),'[]'::jsonb) from public._standing_meeting_details(r.member_id, f,t-1) d),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a) order by event_time,id),'[]'::jsonb) from public.attendance_events a where a.user_id = r.member_id and a.event_time >= public._la_start(f) - interval '12 hours' and a.event_time < public._la_start(t) + interval '12 hours'),
    'logged_hours', (select coalesce(jsonb_agg(to_jsonb(l) order by l.date,l.id),'[]'::jsonb) from public.logged_hours l where l.member_id=r.member_id and l.date >= f and l.date < t),
    'reviews', (select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from public.session_reviews v where v.user_id = r.member_id),
    'event_attendance', (select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from public.event_attendance v where v.member_id = r.member_id and v.day >= f and v.day < t));
end;
$fn$;
revoke execute on function public._standing_evidence(uuid,text) from public, anon, authenticated, service_role;

create or replace function public._capture_standing_evidence()
returns trigger language plpgsql security definer set search_path = public
as $fn$
begin
  insert into public.standing_record_evidence(record_id,evidence) values (new.id,public._standing_evidence(new.id,'evaluation')) on conflict do nothing;
  return new;
end;
$fn$;
revoke execute on function public._capture_standing_evidence() from public, anon, authenticated, service_role;
drop trigger if exists capture_standing_evidence on public.standing_records;
create trigger capture_standing_evidence after insert on public.standing_records for each row execute function public._capture_standing_evidence();

create or replace function public.staff_standing_evidence(p_record uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  return coalesce((select evidence from public.standing_record_evidence where record_id = p_record), public._standing_evidence(p_record,'reconstructed'));
end;
$fn$;
revoke execute on function public.staff_standing_evidence(uuid) from public, anon, service_role;
grant execute on function public.staff_standing_evidence(uuid) to authenticated;

create or replace function public._volunteer_hours(p_member uuid, p_from date)
returns numeric language sql stable security definer set search_path = public
as $fn$
  with ev as (
    select type, event_time, category, pauses, lead(type) over w ntype, lead(event_time) over w ntime
      from public.attendance_events where user_id = p_member and event_time >= public._la_start(p_from) - interval '1 day'
    window w as (order by event_time, id))
  select coalesce(sum(extract(epoch from least(ntime, event_time + interval '12 hours') - event_time) - public._pause_seconds(pauses,event_time,least(ntime,event_time + interval '12 hours'))) / 3600.0, 0)
       + coalesce((select sum(hours) from public.logged_hours l where l.member_id = p_member and l.status = 'verified'
                     and l.type in ('volunteer', 'volunteering', 'outreach') and l.date >= p_from), 0)
    from ev where type = 'in' and ntype = 'out' and category = 'volunteer' and event_time >= public._la_start(p_from);
$fn$;

revoke execute on function public._volunteer_hours(uuid,date) from public, anon, authenticated, service_role;

create or replace function public.readiness_summary()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_result json;
begin
  if not public.is_staff() then
    raise exception 'Permission denied: staff role required';
  end if;

  select json_build_object(

    'generated_at', now(),

    -- Members currently checked in: their latest event is today and is an 'in'.
    'live_presence', coalesce((
      select json_agg(json_build_object(
               'member_id', last.user_id,
               'name',      last.full_name,
               'since',     last.event_time
             ) order by last.event_time)
      from (
        select distinct on (ae.user_id)
               ae.user_id, p.full_name, ae.event_time, ae.type
        from public.attendance_events ae
        join public.profiles p on p.id = ae.user_id
        order by ae.user_id, ae.event_time desc
      ) last
      where last.type = 'in'
        and (last.event_time at time zone 'America/Los_Angeles')::date
            = (now() at time zone 'America/Los_Angeles')::date
    ), '[]'::json),

    -- 7-day pulse
    'pulse_7d', json_build_object(

      -- Total build hours over the last 7 days (closed in/out pairs per UTC day
      -- + open sessions), mirroring hoursUtils.buildBreakdown.
      'total_hours', (
        with ev as (
          select user_id, type, event_time, pauses,
                 (event_time at time zone 'UTC')::date as d
          from public.attendance_events
          where event_time >= now() - interval '7 days'
        ),
        paired as (
          select type, event_time,
                 lag(type)       over w as prev_type,
                 lag(pauses) over w as prev_pauses,
                 lag(event_time) over w as prev_time
          from ev
          window w as (partition by user_id, d order by event_time)
        ),
        closed as (
          select coalesce(sum(extract(epoch from (event_time - prev_time)) - public._pause_seconds(prev_pauses,prev_time,event_time)), 0) as secs
          from paired
          where type = 'out' and prev_type = 'in'
        ),
        open_s as (
          select coalesce(sum(extract(epoch from (now() - le.event_time)) - public._pause_seconds(le.pauses,le.event_time,now())), 0) as secs
          from (
            select distinct on (user_id) user_id, type, event_time, pauses
            from public.attendance_events
            order by user_id, event_time desc
          ) le
          where le.type = 'in'
            and le.event_time >= now() - interval '7 days'
        )
        select round(((closed.secs + open_s.secs) / 3600.0)::numeric, 1)
        from closed, open_s
      ),

      -- Anyone with any attendance event in the last 7 days
      'active_count', (
        select count(distinct user_id)
        from public.attendance_events
        where event_time >= now() - interval '7 days'
      ),

      -- Active, approved roster members with no attendance event in 7+ days
      'at_risk', coalesce((
        select json_agg(json_build_object('member_id', p.id, 'name', p.full_name)
                        order by p.full_name)
        from public.profiles p
        where p.status = 'active'
          and p.approved = true
          and not exists (
            select 1 from public.attendance_events ae
            where ae.user_id = p.id
              and ae.event_time >= now() - interval '7 days'
          )
      ), '[]'::json)
    ),

    -- Certified coverage for every safety-critical skill; low flags < 2 holders.
    'cert_readiness', coalesce((
      select json_agg(json_build_object(
               'skill_id',        s.id,
               'name',            s.name,
               'certified_count', c.cnt,
               'low',             c.cnt < 2
             ) order by c.cnt, s.name)
      from public.skills s
      join lateral (
        select count(*) as cnt
        from public.member_skills ms
        where ms.skill_id = s.id and ms.status = 'certified'
      ) c on true
      where s.safety_critical = true
    ), '[]'::json),

    -- Per subteam: distinct contributors + task status breakdown
    'project_staffing', coalesce((
      select json_agg(json_build_object(
               'subteam',               coalesce(t.subteam, 'Other'),
               'contributors',          t.contributors,
               'open',                  t.open_c,
               'claimed',               t.claimed_c,
               'awaiting_verification', t.awaiting_c,
               'completed',             t.completed_c
             ) order by coalesce(t.subteam, 'Other'))
      from (
        -- Multi-claim model: open is task-level (tasks.status), the rest are
        -- per-claimant counts from task_claims.
        select t.subteam,
               count(distinct tc.member_id)                              as contributors,
               count(distinct t.id) filter (where t.status = 'open')     as open_c,
               count(*) filter (where tc.status = 'claimed')             as claimed_c,
               count(*) filter (where tc.status = 'submitted')           as awaiting_c,
               count(*) filter (where tc.status = 'completed')           as completed_c
        from public.tasks t
        left join public.task_claims tc on tc.task_id = t.id
        group by t.subteam
      ) t
    ), '[]'::json),

    -- Everything waiting on a staffer, with deep-linkable items
    'action_queue', json_build_object(

      'total', (
        (select count(*) from public.logged_hours where status = 'pending') +
        (select count(*) from public.task_claims where status = 'submitted') +
        (select count(*) from public.profiles where approved = false)
      ),

      'hours_pending', coalesce((
        select json_agg(json_build_object(
                 'id',   lh.id,
                 'name', p.full_name,
                 'date', lh.date,
                 'hours', lh.hours,
                 'type', lh.type
               ) order by lh.date)
        from public.logged_hours lh
        join public.profiles p on p.id = lh.member_id
        where lh.status = 'pending'
      ), '[]'::json),

      'tasks_pending', coalesce((
        select json_agg(json_build_object(
                 'id',      t.id,
                 'title',   t.title,
                 'subteam', t.subteam
               ) order by t.updated_at)
        from public.tasks t
        where exists (
          select 1 from public.task_claims tc
          where tc.task_id = t.id and tc.status = 'submitted'
        )
      ), '[]'::json),

      'roster_pending', coalesce((
        select json_agg(json_build_object(
                 'id',    p.id,
                 'name',  p.full_name,
                 'email', u.email
               ) order by p.full_name)
        from public.profiles p
        join auth.users u on u.id = p.id
        where p.approved = false
      ), '[]'::json)
    ),

    -- Study pulse: members who logged study in the last 7 days, and active
    -- members whose current self-study streak has broken (streak = 0).
    'study_pulse', json_build_object(
      'logged_7d', (
        select count(distinct member_id)
        from public.study_sessions
        where date >= (now() at time zone 'America/Los_Angeles')::date - 6
      ),
      'streak_zero', coalesce((
        select json_agg(json_build_object('member_id', p.id, 'name', p.full_name)
                        order by p.full_name)
        from public.profiles p
        where p.status = 'active'
          and p.approved = true
          and public.study_current_streak(
                p.id,
                coalesce((select value::int from public.app_settings
                          where key = 'study_daily_goal_minutes'), 60)
              ) = 0
      ), '[]'::json)
    ),

    -- Squad coverage: every designated position with its holders and gap flags
    'squad_coverage', coalesce((
      select json_agg(json_build_object(
               'position_id',  p.id,
               'name',         p.name,
               'target_count', p.target_count,
               'holder_count', h.cnt,
               'holders',      h.names,
               'vacant',       h.cnt = 0,
               'under_target', h.cnt < p.target_count
             ) order by p.sort_order, p.name)
      from public.positions p
      join lateral (
        select count(*) as cnt,
               coalesce(json_agg(pr.full_name order by pr.full_name)
                        filter (where pr.full_name is not null), '[]'::json) as names
        from public.position_assignments pa
        join public.profiles pr on pr.id = pa.member_id
        where pa.position_id = p.id
      ) h on true
    ), '[]'::json)

  ) into v_result;

  return v_result;
end;
$fn$;

revoke execute on function public.readiness_summary() from public, anon, service_role;
grant execute on function public.readiness_summary() to authenticated;

-- Verified FRC work belongs in the weekly requirement as well as dashboard
-- totals. Keep _member_hours attendance-only: team summary already adds logs.
create or replace function public._standing_week_hours(p_member uuid,p_from timestamptz,p_to timestamptz)
returns numeric language sql stable security definer set search_path = public
as $fn$
  select public._member_hours(p_member,p_from,p_to)
    + coalesce((select sum(l.hours) from public.logged_hours l
      where l.member_id=p_member and l.status='verified'
        and l.type not in ('volunteer','volunteering')
        and l.date >= public._la_date(p_from) and l.date < public._la_date(p_to)),0);
$fn$;
revoke execute on function public._standing_week_hours(uuid,timestamptz,timestamptz) from public, anon, authenticated, service_role;

-- Retain the installed rule/hold bodies and their ACLs. Only the weekly-hours
-- dependency changes. This is idempotent and also preserves live corrections.
do $weekly$
declare sig text; definition text;
begin
  foreach sig in array array['public.member_standing(uuid)','public.staff_standing_overview()','public._standing_evaluate_run()'] loop
    definition := pg_get_functiondef(to_regprocedure(sig));
    if definition is null then raise exception 'Standing prerequisite missing: %',sig; end if;
    definition := replace(definition,'public._member_hours(','public._standing_week_hours(');
    if position('public._standing_week_hours(' in definition)=0 then raise exception 'Standing hours dependency missing: %',sig; end if;
    execute definition;
  end loop;
end
$weekly$;
