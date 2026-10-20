-- ============================================================
-- 0016_event_rosters -- event roles, eligibility, event-day attendance,
-- conflicts, the family sign-up rule, the carpool lock
--
-- APPLY: by hand, in the Supabase SQL editor, the whole file at once, AFTER
-- 0015. Then run 0016_event_rosters_rls_test.sql and read its grid.
-- Re-runnable. The event family hub parts (the sign-up rule and the carpool
-- lock) are created only when the hub tables exist (0005); paste this file
-- again after the hub migrations if they come later.
--
-- WHY: the member handbook, Sections 4, 13, 16 and 18.
--   Mentors pick each event's roles (drive team, pit crew, Impact presenters,
--   pit speakers, scouts, scouting lead, media, safety captain) and record
--   why. Members on meetings or hours probation cannot take the drive team,
--   pit crew or speak for the team; grades probation blocks the drive team
--   and pit crew; a member who missed Kickoff without an emergency cannot be
--   on the drive team or pit crew that season; a suspended member does not
--   attend. Eligibility is checked again when the event starts.
--   The roster is posted at least 10 days before each event.
--   Every competition day is attended: missing one without an emergency puts
--   a member on probation.
--   Members declare conflicts (by February 1 for spring events).
--   Every event needs a family sign-up; for a mandatory event a mentor
--   reminds the family first, and still missing 48 hours later it is an
--   unexcused absence.
--   The carpool plan locks 72 hours before leaving: after that only a mentor
--   changes it, and nothing changes in the last 12 hours.
-- ============================================================

do $pre$
begin
  if to_regprocedure('public._open_probation(uuid, text, text, date)') is null then
    raise exception '0016_event_rosters: apply 0015_member_standing.sql first.';
  end if;
end
$pre$;

-- Kickoff, for the drive team and pit crew rule.
alter table public.standing_settings add column if not exists kickoff_event_id uuid references public.events(id) on delete set null;

-- ── 1. Roles ─────────────────────────────────────────────────────────────────
create table if not exists public.event_roles (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  member_id   uuid        not null references public.profiles(id) on delete cascade,
  role        text        not null check (role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew',
                                                   'impact_presenter', 'pit_speaker', 'scouting_lead', 'scout', 'media', 'safety_captain')),
  reason      text        not null check (length(btrim(reason)) between 3 and 300),
  assigned_by uuid        references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (event_id, member_id, role)
);
create table if not exists public.event_rosters (
  event_id  uuid        primary key references public.events(id) on delete cascade,
  posted_at timestamptz not null default now(),
  posted_by uuid        references public.profiles(id) on delete set null,
  note      text        check (note is null or length(note) <= 1000)
);
create table if not exists public.event_attendance (
  event_id  uuid        not null references public.events(id) on delete cascade,
  day       date        not null,
  member_id uuid        not null references public.profiles(id) on delete cascade,
  status    text        not null check (status in ('present', 'absent', 'excused')),
  note      text        check (note is null or length(note) <= 300),
  marked_by uuid        references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (event_id, day, member_id)
);
create table if not exists public.member_conflicts (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references public.profiles(id) on delete cascade,
  event_id     uuid        not null references public.events(id) on delete cascade,
  note         text        not null check (length(btrim(note)) between 3 and 500),
  declared_at  timestamptz not null default now(),
  withdrawn_at timestamptz
);
create unique index if not exists member_conflicts_live_idx on public.member_conflicts (member_id, event_id) where withdrawn_at is null;

alter table public.event_roles enable row level security;
alter table public.event_rosters enable row level security;
alter table public.event_attendance enable row level security;
alter table public.member_conflicts enable row level security;

-- A posted roster is the team record: every member reads roles once posted;
-- staff read them while being drafted.
drop policy if exists "event roles read" on public.event_roles;
create policy "event roles read" on public.event_roles for select to authenticated
  using (public.is_staff() or exists (select 1 from public.event_rosters r where r.event_id = event_roles.event_id));
drop policy if exists "event rosters read" on public.event_rosters;
create policy "event rosters read" on public.event_rosters for select to authenticated using (true);
drop policy if exists "event attendance read" on public.event_attendance;
create policy "event attendance read" on public.event_attendance for select to authenticated using (public._can_see_member(member_id));
drop policy if exists "conflicts read" on public.member_conflicts;
create policy "conflicts read" on public.member_conflicts for select to authenticated using (public._can_see_member(member_id));
grant select on public.event_roles, public.event_rosters, public.event_attendance, public.member_conflicts to authenticated;
revoke insert, update, delete, truncate on public.event_roles, public.event_rosters, public.event_attendance, public.member_conflicts from authenticated;
revoke all on public.event_roles, public.event_rosters, public.event_attendance, public.member_conflicts from anon;

create or replace function public._role_group(p_role text)
returns text language sql immutable set search_path = public
as $fn$
  select case when p_role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew') then 'field'
              when p_role in ('impact_presenter', 'pit_speaker') then 'speaking' else 'other' end;
$fn$;

-- Kickoff missed without an emergency: the member had joined before it, it
-- has ended, they have no check-in or present mark for it, and no approved
-- absence.
create or replace function public._missed_kickoff(p_member uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $fn$
declare k record;
begin
  select e.id, e.starts_at, e.ends_at into k
    from public.standing_settings s join public.events e on e.id = s.kickoff_event_id;
  if k.id is null or k.ends_at > now() then return false; end if;
  if public._member_since(p_member) > public._la_date(k.starts_at) then return false; end if;
  return not exists (select 1 from public.meeting_checkins where event_id = k.id and member_id = p_member)
     and not exists (select 1 from public.event_attendance where event_id = k.id and member_id = p_member and status in ('present', 'excused'))
     and not exists (select 1 from public.absence_requests where event_id = k.id and member_id = p_member and status = 'approved' and emergency);
end;
$fn$;

-- Why a member cannot take a role at an event, or null when they can.
create or replace function public.event_role_blocker(p_member uuid, p_event uuid, p_role text)
returns text language plpgsql stable security definer set search_path = public
as $fn$
declare ev record; g text := public._role_group(p_role);
begin
  select id, starts_at, ends_at into ev from public.events where id = p_event;
  if ev.id is null then return 'Event not found'; end if;
  if exists (select 1 from public.discipline_records d where d.member_id = p_member and d.level = 'suspension'
              and public._la_date(ev.starts_at) <= d.ends_on and public._la_date(ev.ends_at) >= d.starts_on) then
    return 'Suspended: does not attend';
  end if;
  if g in ('field', 'speaking') and exists (select 1 from public.standing_records r where r.member_id = p_member
              and r.kind in ('meetings', 'hours') and r.status in ('open', 'proposed')) then
    return 'On meetings or hours probation';
  end if;
  if g = 'field' and exists (select 1 from public.standing_records r where r.member_id = p_member and r.kind = 'grades' and r.status = 'open') then
    return 'On grades probation';
  end if;
  if g = 'field' and public._missed_kickoff(p_member) then
    return 'Missed Kickoff without an emergency';
  end if;
  return null;
end;
$fn$;
revoke execute on function public.event_role_blocker(uuid, uuid, text) from public, anon;
grant execute on function public.event_role_blocker(uuid, uuid, text) to authenticated;

create or replace function public.staff_assign_role(p_event uuid, p_member uuid, p_role text, p_reason text)
returns public.event_roles language plpgsql security definer set search_path = public
as $fn$
declare v public.event_roles; b text;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'Record why' using errcode = '22023'; end if;
  b := public.event_role_blocker(p_member, p_event, p_role);
  if b is not null then raise exception 'Not eligible: %', b using errcode = '22023'; end if;
  insert into public.event_roles (event_id, member_id, role, reason, assigned_by)
  values (p_event, p_member, p_role, btrim(p_reason), auth.uid())
  on conflict (event_id, member_id, role) do update set reason = excluded.reason, assigned_by = excluded.assigned_by, assigned_at = now()
  returning * into v;
  return v;
end;
$fn$;

create or replace function public.staff_unassign_role(p_role uuid)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare n integer;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  delete from public.event_roles where id = p_role;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- Posting tells every member with a role. It returns how many days ahead it
-- was posted, so the page can say when it is later than the 10 days.
create or replace function public.staff_post_roster(p_event uuid, p_note text default null)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare ev record; r record;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select id, title, starts_at into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  insert into public.event_rosters (event_id, posted_by, note) values (p_event, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (event_id) do update set posted_at = now(), posted_by = excluded.posted_by, note = excluded.note;
  for r in select member_id, string_agg(replace(role, '_', ' '), ', ' order by role) roles from public.event_roles where event_id = p_event group by member_id loop
    perform public._notify(r.member_id, 'roster', 'Your role at ' || ev.title, 'You are: ' || r.roles || '.', false);
  end loop;
  return greatest(0, extract(day from ev.starts_at - now())::int);
end;
$fn$;

-- Event-day attendance. Absent without an approved absence puts the member
-- on probation (Section 4: every competition, every day).
create or replace function public.staff_mark_event_day(p_event uuid, p_day date, p_member uuid, p_status text, p_note text default null)
returns public.event_attendance language plpgsql security definer set search_path = public
as $fn$
declare v public.event_attendance; ev record;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select id, title, kind, coalesce(mandatory, false) mandatory, starts_at, ends_at into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if p_day < public._la_date(ev.starts_at) or p_day > public._la_date(ev.ends_at) then
    raise exception 'That day is not part of the event' using errcode = '22023';
  end if;
  insert into public.event_attendance (event_id, day, member_id, status, note, marked_by)
  values (p_event, p_day, p_member, p_status, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (event_id, day, member_id) do update set status = excluded.status, note = excluded.note, marked_by = excluded.marked_by, marked_at = now()
  returning * into v;
  if p_status = 'absent' and (ev.kind = 'competition' or ev.mandatory)
     and not exists (select 1 from public.absence_requests a where a.member_id = p_member and a.event_id = p_event and a.status = 'approved')
     and public._standing_member(p_member) then
    perform public._open_probation(p_member, 'meetings', 'Missed ' || ev.title || ' on ' || to_char(p_day, 'Mon DD') || ' without an emergency.', p_day);
  end if;
  return v;
end;
$fn$;

create or replace function public.declare_conflict(p_event uuid, p_note text)
returns public.member_conflicts language plpgsql security definer set search_path = public
as $fn$
declare v public.member_conflicts;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event and starts_at > now()) then
    raise exception 'Only an upcoming event' using errcode = '22023';
  end if;
  select * into v from public.member_conflicts where member_id = auth.uid() and event_id = p_event and withdrawn_at is null;
  if found then
    update public.member_conflicts set note = btrim(p_note) where id = v.id returning * into v;
    return v;
  end if;
  insert into public.member_conflicts (member_id, event_id, note) values (auth.uid(), p_event, btrim(p_note)) returning * into v;
  return v;
end;
$fn$;

create or replace function public.withdraw_conflict(p_conflict uuid)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare n integer;
begin
  update public.member_conflicts set withdrawn_at = now() where id = p_conflict and member_id = auth.uid() and withdrawn_at is null;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- Spring events (January to June) are declared by February 1.
create or replace function public.conflict_deadline(p_starts timestamptz)
returns date language sql immutable set search_path = public
as $fn$
  select case when extract(month from (p_starts at time zone 'America/Los_Angeles')) between 1 and 6
              then make_date(extract(year from (p_starts at time zone 'America/Los_Angeles'))::int, 2, 1) end;
$fn$;

-- Checked when the event starts: a role a member is no longer eligible for
-- is reported to the admins (never silently removed).
create or replace function public.event_eligibility_check()
returns integer language plpgsql security definer set search_path = public
as $fn$
declare r record; n integer := 0; b text;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  for r in
    select er.id, er.member_id, er.role, e.id as event_id, e.title from public.event_roles er join public.events e on e.id = er.event_id
     where e.starts_at between now() - interval '1 hour' and now() + interval '1 day'
  loop
    b := public.event_role_blocker(r.member_id, r.event_id, r.role);
    if b is not null then
      perform public._notify_admins('eligibility', 'Not eligible at ' || r.title || ': ' || public._member_name(r.member_id),
        replace(r.role, '_', ' ') || ': ' || b || '. Change the roster before the event.');
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$fn$;

revoke execute on function public.staff_assign_role(uuid, uuid, text, text) from public, anon;
revoke execute on function public.staff_unassign_role(uuid) from public, anon;
revoke execute on function public.staff_post_roster(uuid, text) from public, anon;
revoke execute on function public.staff_mark_event_day(uuid, date, uuid, text, text) from public, anon;
revoke execute on function public.declare_conflict(uuid, text) from public, anon;
revoke execute on function public.withdraw_conflict(uuid) from public, anon;
revoke execute on function public.event_eligibility_check() from public, anon;
grant execute on function public.staff_assign_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.staff_unassign_role(uuid) to authenticated;
grant execute on function public.staff_post_roster(uuid, text) to authenticated;
grant execute on function public.staff_mark_event_day(uuid, date, uuid, text, text) to authenticated;
grant execute on function public.declare_conflict(uuid, text) to authenticated;
grant execute on function public.withdraw_conflict(uuid) to authenticated;
grant execute on function public.event_eligibility_check() to authenticated;
grant execute on function public.conflict_deadline(timestamptz) to authenticated;

select cron.unschedule('event-eligibility-daily') where exists (select 1 from cron.job where jobname = 'event-eligibility-daily');
select cron.schedule('event-eligibility-daily', '20 13 * * *', $cron$ select public.event_eligibility_check() $cron$);

-- ── 2. The family sign-up rule and the carpool lock (event family hub) ──────
create table if not exists public.event_signup_reminders (
  hub_event_id uuid        not null,
  student_id   uuid        not null references public.profiles(id) on delete cascade,
  reminded_at  timestamptz not null default now(),
  reminded_by  uuid        references public.profiles(id) on delete set null,
  missed_at    timestamptz,
  primary key (hub_event_id, student_id)
);
alter table public.event_signup_reminders enable row level security;
drop policy if exists "signup reminders staff read" on public.event_signup_reminders;
create policy "signup reminders staff read" on public.event_signup_reminders for select to authenticated using (public.is_staff());
grant select on public.event_signup_reminders to authenticated;
revoke insert, update, delete, truncate on public.event_signup_reminders from authenticated;
revoke all on public.event_signup_reminders from anon;

do $hub$
begin
  if to_regclass('public.hub_events') is null then
    raise notice '0016: the event family hub is not applied; the sign-up rule and the carpool lock are skipped. Paste this file again after 0005.';
    return;
  end if;

  execute 'alter table public.hub_events add column if not exists event_id uuid references public.events(id) on delete set null';
  execute 'alter table public.hub_events add column if not exists mandatory boolean not null default true';

  -- A mentor reminds every family whose sign-up is not finished. 48 hours
  -- later, a family still not signed up is an unexcused absence.
  execute $q$
  create or replace function public.staff_remind_signups(p_hub_event uuid)
  returns integer language plpgsql security definer set search_path = public as $fn$
  declare r record; n integer := 0; e record;
  begin
    if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
    select id, title into e from public.hub_events where id = p_hub_event;
    if e.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
    for r in
      select p.id from public.profiles p
       where public._hub_roster_student(p.id)
         and not exists (select 1 from public.hub_invites i where i.event_id = p_hub_event and i.student_id = p.id
                          and coalesce((public._hub_progress(i.id) ->> 'phase1_done')::boolean, false))
    loop
      insert into public.event_signup_reminders (hub_event_id, student_id, reminded_by) values (p_hub_event, r.id, auth.uid())
      on conflict (hub_event_id, student_id) do nothing;
      if found then
        perform public._notify(r.id, 'signup', 'Family sign-up needed: ' || e.title,
          'Every event needs a family sign-up in the app. This one is mandatory. Still missing 48 hours from now, it counts as an unexcused absence.', true);
        n := n + 1;
      end if;
    end loop;
    return n;
  end;
  $fn$ $q$;
  execute 'revoke execute on function public.staff_remind_signups(uuid) from public, anon';
  execute 'grant execute on function public.staff_remind_signups(uuid) to authenticated';

  execute $q$
  create or replace function public.event_signup_check()
  returns integer language plpgsql security definer set search_path = public as $fn$
  declare r record; n integer := 0;
  begin
    if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
    for r in
      select sr.hub_event_id, sr.student_id, he.title, he.mandatory from public.event_signup_reminders sr
        join public.hub_events he on he.id = sr.hub_event_id
       where sr.missed_at is null and sr.reminded_at <= now() - interval '48 hours'
    loop
      if exists (select 1 from public.hub_invites i where i.event_id = r.hub_event_id and i.student_id = r.student_id
                  and coalesce((public._hub_progress(i.id) ->> 'phase1_done')::boolean, false)) then
        update public.event_signup_reminders set missed_at = 'infinity' where hub_event_id = r.hub_event_id and student_id = r.student_id;
        continue;
      end if;
      update public.event_signup_reminders set missed_at = now() where hub_event_id = r.hub_event_id and student_id = r.student_id;
      if r.mandatory and public._standing_member(r.student_id) then
        perform public._open_probation(r.student_id, 'meetings', 'No family sign-up for ' || r.title || ' 48 hours after the reminder: an unexcused absence.', public._la_today());
      end if;
      n := n + 1;
    end loop;
    return n;
  end;
  $fn$ $q$;
  execute 'revoke execute on function public.event_signup_check() from public, anon';
  execute 'grant execute on function public.event_signup_check() to authenticated';

  -- The carpool lock. The departure is the day meet time (or the venue
  -- opening). Inside 72 hours only staff change seats or cars; inside 12
  -- hours nobody does. A cascade (a family or event removed) is not blocked.
  execute $q$
  create or replace function public.carpool_lock_guard()
  returns trigger language plpgsql security definer set search_path = public as $fn$
  declare v_day uuid; v_leave timestamptz;
  begin
    if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
    v_day := coalesce(new.day_id, old.day_id);
    select coalesce(meet_at, venue_opens_at) into v_leave from public.hub_days where id = v_day;
    if v_leave is null then return coalesce(new, old); end if;
    if now() >= v_leave - interval '12 hours' and now() < v_leave + interval '1 day' then
      raise exception 'The carpool plan is frozen in the last 12 hours before leaving' using errcode = '42501';
    end if;
    if now() >= v_leave - interval '72 hours' and now() < v_leave and not public.is_staff() then
      raise exception 'The carpool plan locked 72 hours before leaving. Ask a mentor to change it.' using errcode = '42501';
    end if;
    return coalesce(new, old);
  end;
  $fn$ $q$;
  execute 'revoke execute on function public.carpool_lock_guard() from public, anon, authenticated';
  execute 'drop trigger if exists hub_seats_carpool_lock on public.hub_seats';
  execute 'create trigger hub_seats_carpool_lock before insert or update or delete on public.hub_seats for each row execute function public.carpool_lock_guard()';
  execute 'drop trigger if exists hub_cars_carpool_lock on public.hub_cars';
  execute 'create trigger hub_cars_carpool_lock before insert or delete on public.hub_cars for each row execute function public.carpool_lock_guard()';

  perform cron.unschedule('event-signup-check') where exists (select 1 from cron.job where jobname = 'event-signup-check');
  perform cron.schedule('event-signup-check', '25 * * * *', $c$ select public.event_signup_check() $c$);
end
$hub$;
