-- ============================================================
-- 0034: team_attendance_summary on the live profiles table.
-- Needs 0032. Re-runnable (create or replace).
--
-- WHY: 0032 read profiles.created_at, a column the live profiles table does
-- not have (the SQL harness stub has it; the live Supabase starter table does
-- not). The function failed with undefined_column, so the connector's
-- team_attendance tool answered "not set up yet" on 2026-10-23 even though
-- the Migrate workflow had applied 0032. The account's creation time now
-- comes from auth.users only. Nothing else changes.
--
-- TO UNDO: paste the function from 0032 again (it will fail the same way).
-- ============================================================

create or replace function public.team_attendance_summary(p_since date default null)
returns table (
  member_id             uuid,
  full_name             text,
  nickname              text,
  email                 text,
  roles                 text[],
  status                text,
  approved              boolean,
  has_account           boolean,
  is_parent_only        boolean,
  created_at            timestamptz,
  hours_total           numeric,
  hours_since           numeric,
  check_ins             integer,
  check_ins_since       integer,
  first_check_in        timestamptz,
  last_check_in         timestamptz,
  logged_hours_verified numeric,
  has_season_application boolean,
  trip_invites          integer,
  trip_answers          integer,
  last_sign_in          timestamptz
)
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_since timestamptz := case when p_since is null then null
                              else (p_since::timestamp at time zone 'America/Los_Angeles') end;
  v_season uuid;
begin
  if not public.is_staff() then
    raise exception 'Only staff can read the whole team attendance.' using errcode = '42501';
  end if;

  -- This season: the one spanning today in Los Angeles, else the latest started.
  select s.id into v_season
    from public.seasons s
   where s.start_date <= (now() at time zone 'America/Los_Angeles')::date
   order by (s.end_date >= (now() at time zone 'America/Los_Angeles')::date) desc, s.start_date desc
   limit 1;

  return query
  with r as (
    select mr.member_id as id, array_agg(mr.role::text order by mr.role::text) as roles
      from public.member_roles mr group by mr.member_id),
  ci as (
    select a.user_id as id,
           count(*)::int as n,
           count(*) filter (where v_since is not null and a.event_time >= v_since)::int as n_since,
           min(a.event_time) as first_at,
           max(a.event_time) as last_at
      from public.attendance_events a
     where a.type = 'in'
     group by a.user_id),
  lh as (
    select l.member_id as id, sum(l.hours) as verified
      from public.logged_hours l where l.status = 'verified' group by l.member_id),
  hub as (
    select i.student_id as id, count(*)::int as invites, count(hr.invite_id)::int as answers
      from public.hub_invites i left join public.hub_responses hr on hr.invite_id = i.id
     group by i.student_id)
  select p.id,
         p.full_name::text,
         p.nickname::text,
         u.email::text,
         coalesce(r.roles, '{}'::text[]),
         coalesce(p.status, 'active')::text,
         coalesce(p.approved, false),
         u.id is not null,
         ('parent' = any(coalesce(r.roles, '{}'::text[]))
           and not (coalesce(r.roles, '{}'::text[]) && array['student', 'mentor', 'lead', 'admin'])),
         u.created_at,
         public._member_hours(p.id, timestamptz '2000-01-01 00:00+00', now()),
         case when v_since is null then null else public._member_hours(p.id, v_since, now()) end,
         coalesce(ci.n, 0),
         case when v_since is null then null else coalesce(ci.n_since, 0) end,
         ci.first_at,
         ci.last_at,
         coalesce(lh.verified, 0)::numeric,
         exists (select 1 from public.member_applications ma where ma.member_id = p.id and ma.season_id = v_season),
         coalesce(hub.invites, 0),
         coalesce(hub.answers, 0),
         u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join r on r.id = p.id
    left join ci on ci.id = p.id
    left join lh on lh.id = p.id
    left join hub on hub.id = p.id
  union all
  -- Approved to join, never signed in: no profile, no hours.
  select null::uuid, null::text, null::text, ae.email::text, array[ae.granted_role::text], 'active'::text, true, false,
         ae.granted_role = 'parent', ae.created_at,
         0::numeric, case when v_since is null then null else 0::numeric end,
         0, case when v_since is null then null else 0 end,
         null::timestamptz, null::timestamptz, 0::numeric, false, 0, 0, null::timestamptz
    from public.approved_emails ae
   where not exists (select 1 from auth.users u2 where lower(u2.email) = ae.email);
end
$fn$;

revoke all on function public.team_attendance_summary(date) from public, anon;
grant execute on function public.team_attendance_summary(date) to authenticated;
