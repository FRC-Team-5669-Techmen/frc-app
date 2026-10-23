-- ============================================================
-- 0032_connector_team_reads: every member attendance in one read, and a
-- status change for many members at once (ledger 0024)
--
-- Applied by the Migrate workflow on push, in one transaction, AFTER 0030
-- (0031 is a separate role board change and is not needed here).
-- Re-runnable: functions are create or replace, the one constraint is
-- dropped by name and added again.
--
-- WHY. Mr. Pina runs the team through the Claude connector. On 2026-10-23 he
-- asked for the members to take off the roster (about 61 students, many who
-- never came) and the connector could not answer: there was no read of every
-- member attendance at once, only one member at a time.
--
-- WHAT THIS ADDS.
--   team_attendance_summary(p_since date default null)
--       One row per profile, plus one row per approved email that never made
--       an account: name, email, roles, status, approved, joined, signed-in
--       hours all time and since p_since, check-ins, first and last check-in,
--       verified logged hours, whether they applied this season, family trip
--       invites and answers, and the last app sign-in. Hours are
--       public._member_hours (0015), the one SQL pairing rule, called as is;
--       nothing here pairs check-ins itself. Staff only (is_staff()).
--   admin_set_member_status_bulk(p_members uuid[], p_status text, p_reason text)
--       Marks many members active, inactive or alumni in one change, each
--       through admin_set_member_status (0019), the same path the roster
--       page uses, and one member_admin_log row per member changed, with the
--       reason. Answers what changed, what was already so and what was not
--       found. Admin only. Never the caller own account.
--   member_admin_log.action gains set_status.
--
-- WHO. The read: mentors, leads, admins. The change: admins. Neither is
-- reachable signed out. Both are SECURITY DEFINER with search_path pinned.
--
-- TO UNDO: drop function public.team_attendance_summary(date),
-- public.admin_set_member_status_bulk(uuid[], text, text); put the
-- member_admin_log action check back to set_name, merge_from, merge_into
-- (after deleting any set_status rows).
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public._member_hours(uuid, timestamptz, timestamptz)') is null then
    raise exception '0032 needs 0015_member_standing.sql applied first';
  end if;
  if to_regprocedure('public.admin_set_member_status(uuid, text)') is null then
    raise exception '0032 needs 0019_connector_writes.sql applied first';
  end if;
  if to_regclass('public.member_admin_log') is null then
    raise exception '0032 needs 0020_member_admin.sql applied first';
  end if;
end
$prereq$;

-- ── the trail gains a status change ─────────────────────────────────────────
alter table public.member_admin_log drop constraint if exists member_admin_log_action_check;
alter table public.member_admin_log add constraint member_admin_log_action_check
  check (action in ('set_name', 'merge_from', 'merge_into', 'set_status'));

-- ── every member attendance, one read ───────────────────────────────────────

-- Does: List every member with their signed-in hours, check-ins, last check-in, logged hours, application and trip sign-ups, to see who has not shown up.
-- Staff only. p_since (a Los Angeles date) adds hours and check-ins since
-- that day; null leaves those columns null. Parents and approved emails with
-- no account are included and marked (is_parent_only, has_account) so the
-- caller filters them.
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
         coalesce(u.created_at, p.created_at),
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

-- ── many members, one status ────────────────────────────────────────────────

-- Does: Mark many members active, inactive or alumni in one change, with the reason; answers who changed.
-- Admin only. Each member goes through admin_set_member_status, the roster
-- page path, and gets one member_admin_log row. Refuses the caller own
-- account, an unknown status, a blank reason, more than 200 members.
create or replace function public.admin_set_member_status_bulk(p_members uuid[], p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed jsonb := '[]'::jsonb;
  v_same jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_id uuid;
  v_old text;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change member status.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'inactive', 'alumni') then
    raise exception 'Status must be active, inactive or alumni.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for the change.' using errcode = '22023';
  end if;
  if p_members is null or cardinality(p_members) = 0 then
    raise exception 'Name at least one member.' using errcode = '22023';
  end if;
  if cardinality(p_members) > 200 then
    raise exception 'At most 200 members in one change.' using errcode = '22023';
  end if;
  if auth.uid() = any(p_members) then
    raise exception 'Your own account is not changed this way.' using errcode = '22023';
  end if;

  for v_id in select distinct m from unnest(p_members) as m where m is not null loop
    select coalesce(p.status, 'active'), coalesce(nullif(p.nickname, ''), p.full_name, 'Member')
      into v_old, v_name
      from public.profiles p where p.id = v_id;
    if not found then
      v_missing := v_missing || to_jsonb(v_id);
      continue;
    end if;
    if v_old = p_status then
      v_same := v_same || jsonb_build_object('id', v_id, 'name', v_name, 'status', v_old);
      continue;
    end if;
    perform public.admin_set_member_status(v_id, p_status);
    insert into public.member_admin_log (member_id, actor_id, action, reason, old_value, new_value)
    values (v_id, auth.uid(), 'set_status', v_reason, jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
    v_changed := v_changed || jsonb_build_object('id', v_id, 'name', v_name, 'from', v_old, 'to', p_status);
  end loop;

  return jsonb_build_object('status', p_status, 'reason', v_reason,
                            'changed', v_changed, 'unchanged', v_same, 'not_found', v_missing,
                            'changed_count', jsonb_array_length(v_changed));
end
$fn$;

revoke all on function public.admin_set_member_status_bulk(uuid[], text, text) from public, anon;
grant execute on function public.admin_set_member_status_bulk(uuid[], text, text) to authenticated;
