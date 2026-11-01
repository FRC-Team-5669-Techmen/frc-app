-- ============================================================
-- 0044 Member standing: the October correction, meeting attendance from
-- open sessions, unrecorded meetings, and a hold on mass probation.
--
-- WHAT WENT WRONG (2026-11-01, 5:10 AM): the daily standing_evaluate judged
-- October for the first time. October held one counted meeting since
-- standing_settings.starts_on, and _member_meetings (0025) counted a member
-- present only from a meeting_checkins scan or a mentor's manual IN during
-- the meeting. No member had either, so all 27 judged students scored
-- 0 of 1, all 27 got meetings probation, and the student plus every parent
-- address was emailed (54 mails).
--
-- WHAT THIS FILE DOES
--   1. A member whose session is already open when a meeting starts counts
--      present. Being signed in is being there; the old rule wanted a second
--      tap during the 15 minutes of the meeting, which nobody does.
--   2. A meeting where no attendance was taken at all (no check-in scan, no
--      IN during it, nobody signed in at its start) does not count for
--      anyone. A blank record is a missing record, not 100 percent absence.
--   3. standing_evaluate holds a run that would open probation or propose
--      removal for more than standing_settings.hold_over_pct percent of the
--      judged members (default 25, at least 3 members). The whole run rolls
--      back, nothing reaches a member or a family, and every admin gets one
--      alert (at most one per 20 hours). Null turns the hold off.
--   4. The October correction, once: the 27 meetings probations are
--      dismissed without a per-member notice (one correction mail goes out
--      separately), the October month judgments and the in-app "Meetings
--      probation started" notices are removed, and the standards start on
--      2026-11-02.
--
-- NEEDS 0014, 0015 and 0025. Re-defines 0025's _member_meetings, so apply
-- 0044 again after any re-paste of 0015 or 0025. Renames 0015's
-- standing_evaluate to _standing_evaluate_run and wraps it: a re-paste of
-- 0015 replaces the wrapper with the unwrapped run, so apply 0044 again
-- after it too.
-- ============================================================

-- ── 1 and 2. Meeting attendance ──────────────────────────────────────────────

-- Whether the member's newest attendance event at or before p_at is an IN no
-- older than 12 hours (the open-session cap of src/hoursUtils.js).
create or replace function public._session_open_at(p_member uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select coalesce((
    select a.type = 'in' and a.event_time > p_at - interval '12 hours'
      from public.attendance_events a
     where a.user_id = p_member and a.event_time <= p_at
     order by a.event_time desc, a.id desc
     limit 1), false);
$fn$;
revoke execute on function public._session_open_at(uuid, timestamptz) from public, anon, authenticated;

-- Whether attendance was taken at a meeting at all: a check-in scan, any IN
-- during it, or anyone signed in when it started.
create or replace function public._meeting_recorded(p_event uuid, p_start timestamptz, p_end timestamptz)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (select 1 from public.meeting_checkins mc where mc.event_id = p_event)
      or exists (select 1 from public.attendance_events a
                  where a.type = 'in' and a.event_time >= p_start and a.event_time <= p_end)
      or exists (select 1 from (select distinct a.user_id from public.attendance_events a
                                 where a.event_time > p_start - interval '12 hours' and a.event_time <= p_start) u
                  where public._session_open_at(u.user_id, p_start));
$fn$;
revoke execute on function public._meeting_recorded(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 0025's rules unchanged, plus: an open session at the start is present, and
-- an unrecorded meeting is left out of every count.
create or replace function public._member_meetings(p_member uuid, p_from date, p_to date)
returns table (total integer, counted integer, attended integer, lates integer, misses integer)
language sql stable security definer set search_path = public
as $fn$
  with m as (
    select e.id, e.starts_at,
           coalesce(mc.status,
             (select case when min(a.event_time) <= e.starts_at + interval '15 minutes' then 'present' else 'late' end
                from public.attendance_events a
               where a.user_id = p_member and a.type = 'in' and coalesce(a.manual_entry, false)
                 and a.event_time >= e.starts_at and a.event_time <= e.ends_at
              having count(*) > 0),
             case when public._session_open_at(p_member, e.starts_at) then 'present' end) as scan,
           public._absence_excused(p_member, e.id, e.starts_at) as excused,
           exists (select 1 from public.team_weeks w where w.kind = 'break'
                    and w.week_start = date_trunc('week', public._la_date(e.starts_at))::date) as on_break,
           public._member_suspended(p_member, public._la_date(e.starts_at)) as suspended,
           public._meeting_recorded(e.id, e.starts_at, e.ends_at) as recorded
      from public.events e
      left join public.meeting_checkins mc on mc.event_id = e.id and mc.member_id = p_member
     where e.kind = 'meeting' and e.ends_at < now()
       and public._la_date(e.starts_at) between p_from and p_to)
  select count(*) filter (where recorded)::int,
         count(*) filter (where recorded and (scan is not null or not (excused or on_break or suspended)))::int,
         count(*) filter (where recorded and scan is not null)::int,
         count(*) filter (where recorded and scan = 'late')::int,
         count(*) filter (where recorded and scan is null and not (excused or on_break or suspended))::int
    from m;
$fn$;
revoke execute on function public._member_meetings(uuid, date, date) from public, anon, authenticated;

-- ── 3. The hold ──────────────────────────────────────────────────────────────

alter table public.standing_settings add column if not exists hold_over_pct numeric default 25;
do $chk$
begin
  if not exists (select 1 from pg_constraint where conname = 'standing_settings_hold_over_pct_check') then
    alter table public.standing_settings add constraint standing_settings_hold_over_pct_check
      check (hold_over_pct is null or (hold_over_pct > 0 and hold_over_pct <= 100));
  end if;
end
$chk$;

do $rename$
begin
  if to_regprocedure('public._standing_evaluate_run()') is null then
    alter function public.standing_evaluate() rename to _standing_evaluate_run;
  end if;
end
$rename$;
revoke execute on function public._standing_evaluate_run() from public, anon, authenticated;

-- The same entry point pg_cron and /standing/team already call.
create or replace function public.standing_evaluate()
returns integer language plpgsql security definer set search_path = public
as $fn$
declare
  s        public.standing_settings;
  n        integer := 0;
  v_judged integer := 0;
  v_new    integer := 0;
  v_limit  integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select * into s from public.standing_settings;
  select count(*) into v_judged from public.profiles p where public._standing_member(p.id);
  v_limit := case when s.hold_over_pct is null then null
                  else greatest(3, ceil(v_judged * s.hold_over_pct / 100.0)::int) end;
  begin
    n := public._standing_evaluate_run();
    -- Every row the run wrote carries this transaction's now().
    select count(distinct r.member_id) into v_new
      from public.standing_records r
     where r.created_at = now() and r.kind in ('meetings', 'hours', 'removal');
    if v_limit is not null and v_new > v_limit then
      raise exception 'standing hold' using errcode = 'P5669';
    end if;
  exception when sqlstate 'P5669' then
    -- The run is rolled back: no week, month, record, notice or mail kept.
    if not exists (select 1 from public.member_notices
                    where kind = 'standing_hold' and created_at > now() - interval '20 hours') then
      perform public._notify_admins('standing_hold',
        'Standing check held: ' || v_new || ' of ' || v_judged || ' members at once',
        'The daily check would have opened probation or proposed removal for ' || v_new || ' of ' || v_judged
        || ' members in one run, over the ' || s.hold_over_pct || ' percent limit. Nothing was saved and no student or family was emailed.'
        || chr(10) || chr(10)
        || 'That many at once usually means attendance or hours were not recorded. Fix the records, or raise the limit in Settings on /standing/team, and the next run judges again.');
    end if;
    return 0;
  end;
  return n;
end;
$fn$;
revoke execute on function public.standing_evaluate() from public, anon;
grant execute on function public.standing_evaluate() to authenticated;

-- ── 4. The October correction (once; every statement is a no-op on re-run) ──

update public.standing_records r
   set status = 'dismissed', closed_on = date '2026-11-01', confirmed_at = now(),
       reason = r.reason || ' Withdrawn: October meeting attendance was not recorded (0044).'
 where r.kind = 'meetings' and r.status = 'open'
   and r.opened_on = date '2026-11-01' and r.reason like 'October:%';

delete from public.member_notices n
 where n.kind = 'probation' and n.title = 'Meetings probation started'
   and n.created_at >= timestamptz '2026-11-01 00:00:00-08' and n.created_at < timestamptz '2026-11-02 00:00:00-08'
   and exists (select 1 from public.standing_records r
                where r.member_id = n.member_id and r.reason like '%(0044).');

update public.notice_outbox
   set error = 'withdrawn by 0044'
 where sent_at is null and error is null
   and subject like 'Techmen 5669: Meetings probation started%';

delete from public.standing_months where month = date '2026-10-01';

update public.standing_settings set starts_on = date '2026-11-02' where starts_on < date '2026-11-02';
