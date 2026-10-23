-- ============================================================
-- 0025_absence_handbook: the absence rules made to match the handbook text
-- in the tree (src/handbook/handbook.md, version 2026-10-20, Sections 4, 6
-- and 11), feedback d56ab62c ("Adjust the absence function to adhere to the
-- handbook perfectly"), ledger 0016
--
-- Run once in the Supabase SQL editor, AFTER 0014 and 0015. Re-runnable. It
-- re-defines four 0015 functions with the SAME signatures, so pasting 0015
-- again later puts the old rules back; paste 0025 again after it.
--
-- WHAT CHANGES, each a sentence of the handbook the old code did not follow:
--   1. Section 6, "An emergency is your own illness or injury, or a death,
--      hospital stay or serious illness in your close family." 0015 also took
--      a medical visit as an emergency. A medical visit is excused when it is
--      asked 24 hours ahead, like the other reasons; as an emergency only
--      illness (own illness or injury) and family emergency are accepted.
--   2. Section 6, "File it by 11:59 PM the next school day." 0015 counted
--      the next weekday. A posted break week (Section 4: school breaks are
--      posted in the app) has no school days, so the deadline moves past it.
--      Holidays not posted as a break week are still not known (decision 48).
--   3. Section 6, "A request still unanswered at the meeting is approved."
--      0015 counted it as excused but still let a mentor deny it afterwards,
--      which turned it into an unexcused absence after the fact. Now a
--      request filed before the event started and still pending when it
--      started is approved by the rule: decide_absence refuses to deny it and
--      records it as approved.
--   4. Section 6, "No phone, or the tag fails? Tell a mentor right away. The
--      mentor checks you in or out in the app and logs why." 0015 counted
--      only a tag scan as attending, so a member a mentor checked in during
--      the meeting was marked absent. Now a staff check-in (a manual IN,
--      staff_add_event, which logs the reason) between the meeting start and
--      end counts: present inside the first 15 minutes, late after.
--
-- NOT CHANGED, and why: who decides (Section 6 says a mentor; is_staff()
-- also admits a lead, which is decision 09, still open), the 24-hour rule,
-- the mandatory-event rule (Section 4), three lates per absence, 80 percent
-- never rounded, and a fully excused week (Section 6 and 11), all of which
-- already match.
--
-- TO UNDO: paste the four functions from 0015 again
-- (_next_school_day, request_absence, decide_absence, _member_meetings).
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public.request_absence(uuid, text, text, boolean)') is null
     or to_regclass('public.meeting_checkins') is null then
    raise exception '0025 needs 0014_session_signout.sql and 0015_member_standing.sql applied first';
  end if;
end
$prereq$;

-- 2. The next school day: Monday to Friday, never inside a posted break week.
create or replace function public._next_school_day(p_day date)
returns date language plpgsql stable security definer set search_path = public
as $fn$
declare d date := p_day + 1; n int := 0;
begin
  while n < 400 loop
    if extract(isodow from d)::int between 1 and 5
       and not exists (select 1 from public.team_weeks w where w.kind = 'break' and w.week_start = date_trunc('week', d)::date) then
      return d;
    end if;
    d := d + 1; n := n + 1;
  end loop;
  return p_day + 1;
end;
$fn$;
revoke execute on function public._next_school_day(date) from public, anon, authenticated;

-- 1. As 0015, with an emergency limited to the handbook definition.
create or replace function public.request_absence(p_event uuid, p_reason text, p_note text default null, p_emergency boolean default false)
returns public.absence_requests language plpgsql security definer set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  ev    record;
  v     public.absence_requests;
  v_mandatory boolean;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select id, kind, starts_at, ends_at, coalesce(mandatory, false) as mandatory into ev
    from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  v_mandatory := ev.mandatory or ev.kind = 'competition';
  if ev.kind <> 'meeting' and not v_mandatory then
    raise exception 'Only team meetings and mandatory events need an absence request' using errcode = '22023';
  end if;
  if p_emergency then
    if p_reason not in ('illness', 'family_emergency') then
      raise exception 'An emergency is your own illness or injury, or a death, hospital stay or serious illness in your close family' using errcode = '22023';
    end if;
    if now() > public._la_start(public._next_school_day(public._la_date(ev.starts_at)) + 1) then
      raise exception 'An emergency is filed by 11:59 PM the next school day' using errcode = '22023';
    end if;
  else
    if v_mandatory and not (p_reason = 'religious' and now() <= ev.starts_at - interval '14 days') then
      raise exception 'Only an emergency excuses a mandatory event (a religious holiday is asked 14 days ahead)' using errcode = '22023';
    end if;
    if now() > ev.starts_at - interval '24 hours' then
      raise exception 'Ask at least 24 hours ahead, or file it as an emergency' using errcode = '22023';
    end if;
  end if;
  select * into v from public.absence_requests
   where member_id = v_uid and event_id = p_event and status in ('pending', 'approved');
  if found then return v; end if;
  insert into public.absence_requests (member_id, event_id, reason, emergency, note)
  values (v_uid, p_event, p_reason, coalesce(p_emergency, false), nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v;
  return v;
end;
$fn$;

-- 3. As 0015, except a request the meeting found unanswered is approved.
create or replace function public.decide_absence(p_request uuid, p_approve boolean, p_note text default null)
returns public.absence_requests language plpgsql security definer set search_path = public
as $fn$
declare v public.absence_requests; v_starts timestamptz;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select e.starts_at into v_starts
    from public.absence_requests a join public.events e on e.id = a.event_id
   where a.id = p_request;
  if exists (select 1 from public.absence_requests a
              where a.id = p_request and a.status = 'pending' and a.member_id <> auth.uid()
                and a.requested_at <= v_starts and now() >= v_starts) then
    if not p_approve then
      raise exception 'This request was still unanswered when the event started, so it is approved (handbook Section 6)' using errcode = '22023';
    end if;
  end if;
  update public.absence_requests
     set status = case when p_approve then 'approved' else 'denied' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_request and status = 'pending' and member_id <> auth.uid()
  returning * into v;
  if not found then raise exception 'No pending request' using errcode = 'P0002'; end if;
  perform public._notify(v.member_id, 'absence',
    case when p_approve then 'Absence approved' else 'Absence denied' end,
    coalesce(v.decision_note, ''), false);
  return v;
end;
$fn$;

-- 4. As 0015, with a mentor check-in during the meeting counted as a scan.
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
              having count(*) > 0)) as scan,
           public._absence_excused(p_member, e.id, e.starts_at) as excused,
           exists (select 1 from public.team_weeks w where w.kind = 'break'
                    and w.week_start = date_trunc('week', public._la_date(e.starts_at))::date) as on_break,
           public._member_suspended(p_member, public._la_date(e.starts_at)) as suspended
      from public.events e
      left join public.meeting_checkins mc on mc.event_id = e.id and mc.member_id = p_member
     where e.kind = 'meeting' and e.ends_at < now()
       and public._la_date(e.starts_at) between p_from and p_to)
  select count(*)::int,
         count(*) filter (where scan is not null or not (excused or on_break or suspended))::int,
         count(*) filter (where scan is not null)::int,
         count(*) filter (where scan = 'late')::int,
         count(*) filter (where scan is null and not (excused or on_break or suspended))::int
    from m;
$fn$;

revoke execute on function public.request_absence(uuid, text, text, boolean) from public, anon;
revoke execute on function public.decide_absence(uuid, boolean, text) from public, anon;
revoke execute on function public._member_meetings(uuid, date, date) from public, anon, authenticated;
grant execute on function public.request_absence(uuid, text, text, boolean) to authenticated;
grant execute on function public.decide_absence(uuid, boolean, text) to authenticated;
