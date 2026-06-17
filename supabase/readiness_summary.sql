-- Readiness Command Dashboard: one staff-only, read-only aggregate RPC so the
-- client makes a single call. Reuses existing tables and helpers; adds no
-- schema. The 7-day hours figure mirrors the pairing logic in hoursUtils.js
-- (buildBreakdown): in/out events paired within a UTC calendar day, plus any
-- currently-open session counted up to now.
-- Run once in the Supabase SQL editor.

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
          select user_id, type, event_time,
                 (event_time at time zone 'UTC')::date as d
          from public.attendance_events
          where event_time >= now() - interval '7 days'
        ),
        paired as (
          select type, event_time,
                 lag(type)       over w as prev_type,
                 lag(event_time) over w as prev_time
          from ev
          window w as (partition by user_id, d order by event_time)
        ),
        closed as (
          select coalesce(sum(extract(epoch from (event_time - prev_time))), 0) as secs
          from paired
          where type = 'out' and prev_type = 'in'
        ),
        open_s as (
          select coalesce(sum(extract(epoch from (now() - le.event_time))), 0) as secs
          from (
            select distinct on (user_id) user_id, type, event_time
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

grant execute on function public.readiness_summary() to authenticated;
