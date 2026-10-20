-- ============================================================
-- 0015_member_standing -- absences, standing, probation, records
--
-- APPLY: by hand, in the Supabase SQL editor, the whole file at once, AFTER
-- 0014. Then run 0015_member_standing_rls_test.sql and read its grid.
-- Re-runnable: creates are if-not-exists or or-replace, constraints are
-- guarded, every policy dropped is one this file creates, the cron job is
-- unscheduled before it is scheduled.
--
-- WHY: the member handbook, Sections 4, 6, 7, 8, 9, 11, 12, 13 and 14.
--   Absence requests: asked 24 hours ahead, approved or denied by a mentor;
--     one still unanswered when the meeting starts counts as approved; an
--     emergency can be filed until 11:59 PM the next school day; a mandatory
--     event is excused only by an emergency, or a religious holiday asked 14
--     days ahead.
--   Break and work weeks, posted 14 days ahead, fixed once started.
--   Meetings: 80 percent of a calendar month, never rounded; three lates in a
--     month are one absence.
--   Hours: 2 signed-in hours a week, 10 in build season; a fully excused week
--     never counts against you.
--   Probation starts automatically (meetings at month end, hours at week
--     end, grades at a grade check), closes after 4 clean weeks (an excused
--     week extends it), and a miss or short week on probation proposes
--     removal, which takes effect only when Mr. Pina confirms it.
--   Discipline (verbal, written, suspension, removal), the safety log (the
--     third in a school year goes to Mr. Pina), the injury and near miss log.
--   A mentor voids an idle session or a day of hours, with the reason sent
--     to the student. FLL mentor sign-ups, 2 to 4 per team, off a team after
--     2 weeks in a row with no volunteer session.
--   Notices in the app, and email to the student and parents.
--
-- NOTHING IS EVALUATED BEFORE standing_settings.starts_on (default: the
-- Monday after this file is pasted). Meeting check-ins only exist since 0014,
-- so judging earlier weeks would put every member on probation for weeks
-- nobody was tracking.
--
-- WHAT IT ASSUMES: 0004 (has_capability), 0014 (meeting_checkins,
-- signout_requests), sql/forgotten_checkout.sql (session_reviews),
-- supabase/member_applications.sql, supabase/guardian_links.sql,
-- supabase/feedback.sql (is_admin).
--
-- NOT DONE HERE: Discord notices and the Discord role on removal need a
-- Discord account linked to each member, which the app does not store.
-- ============================================================

do $pre$
begin
  if to_regclass('public.meeting_checkins') is null then
    raise exception '0015_member_standing: apply 0014_session_signout.sql first.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '0015_member_standing: public.is_admin() is missing (supabase/feedback.sql).';
  end if;
end
$pre$;

-- The review table from sql/forgotten_checkout.sql, created here when that
-- file was never pasted (the live project, 2026-10-19). Same shape.
create table if not exists public.session_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  checkin_id  uuid references public.attendance_events(id) on delete cascade not null unique,
  checkout_id uuid references public.attendance_events(id) on delete cascade not null unique,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'voided')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at  timestamptz default now()
);
alter table public.session_reviews enable row level security;
drop policy if exists "authenticated can read session_reviews" on public.session_reviews;
create policy "authenticated can read session_reviews" on public.session_reviews for select to authenticated using (true);

-- ── 0. Helpers ───────────────────────────────────────────────────────────────
create or replace function public._la_today()
returns date language sql stable set search_path = public
as $fn$ select (now() at time zone 'America/Los_Angeles')::date $fn$;

-- Midnight of an LA date, as an instant.
create or replace function public._la_start(p_day date)
returns timestamptz language sql immutable set search_path = public
as $fn$ select (p_day::timestamp at time zone 'America/Los_Angeles') $fn$;

create or replace function public._la_date(p_at timestamptz)
returns date language sql immutable set search_path = public
as $fn$ select (p_at at time zone 'America/Los_Angeles')::date $fn$;

-- The member, or a parent linked to them, or staff.
create or replace function public._can_see_member(p_member uuid)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select auth.uid() = p_member or public.is_staff()
      or exists (select 1 from public.guardian_links g where g.parent_id = auth.uid() and g.student_id = p_member);
$fn$;
grant execute on function public._can_see_member(uuid) to authenticated;

-- Who the standards apply to: approved, active, a student, not a mentor or admin.
create or replace function public._standing_member(p_member uuid)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (select 1 from public.profiles p where p.id = p_member and p.approved and coalesce(p.status, 'active') = 'active')
     and exists (select 1 from public.member_roles r where r.member_id = p_member and r.role = 'student')
     and not exists (select 1 from public.member_roles r where r.member_id = p_member and r.role in ('mentor', 'admin'));
$fn$;

-- ── 1. Settings ──────────────────────────────────────────────────────────────
create table if not exists public.standing_settings (
  id                  boolean primary key default true check (id),
  starts_on           date    not null,
  build_season_start  date    not null default date '2027-01-09',
  build_season_end    date    not null default date '2027-04-04',
  weekly_hours        numeric not null default 2,
  build_weekly_hours  numeric not null default 10,
  meeting_pct         numeric not null default 80,
  updated_by          uuid    references public.profiles(id) on delete set null,
  updated_at          timestamptz not null default now()
);
insert into public.standing_settings (id, starts_on)
values (true, (date_trunc('week', public._la_today()) + interval '7 days')::date)
on conflict (id) do nothing;

alter table public.standing_settings enable row level security;
drop policy if exists "standing settings read" on public.standing_settings;
create policy "standing settings read" on public.standing_settings for select to authenticated using (true);
drop policy if exists "standing settings admin write" on public.standing_settings;
create policy "standing settings admin write" on public.standing_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, update on public.standing_settings to authenticated;
revoke insert, delete, truncate on public.standing_settings from authenticated;
revoke all on public.standing_settings from anon;

-- ── 2. Notices and the mail outbox ──────────────────────────────────────────
create table if not exists public.member_notices (
  id         uuid        primary key default gen_random_uuid(),
  member_id  uuid        not null references public.profiles(id) on delete cascade,
  kind       text        not null,
  title      text        not null,
  body       text        not null default '',
  created_by uuid        references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists member_notices_member_idx on public.member_notices (member_id, created_at desc);
alter table public.member_notices enable row level security;
drop policy if exists "notices read own parent staff" on public.member_notices;
create policy "notices read own parent staff" on public.member_notices for select to authenticated
  using (public._can_see_member(member_id));
grant select on public.member_notices to authenticated;
revoke insert, update, delete, truncate on public.member_notices from authenticated;
revoke all on public.member_notices from anon;

create table if not exists public.notice_outbox (
  id         uuid        primary key default gen_random_uuid(),
  to_email   text        not null,
  subject    text        not null,
  body       text        not null,
  member_id  uuid        references public.profiles(id) on delete set null,
  kind       text        not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);
create index if not exists notice_outbox_unsent_idx on public.notice_outbox (created_at) where sent_at is null;
alter table public.notice_outbox enable row level security;
drop policy if exists "outbox staff read" on public.notice_outbox;
create policy "outbox staff read" on public.notice_outbox for select to authenticated using (public.is_admin());
grant select on public.notice_outbox to authenticated;
revoke insert, update, delete, truncate on public.notice_outbox from authenticated;
revoke all on public.notice_outbox from anon;

create or replace function public.mark_notice_read(p_notice uuid)
returns void language sql security definer set search_path = public
as $fn$ update public.member_notices set read_at = coalesce(read_at, now()) where id = p_notice and member_id = auth.uid(); $fn$;
revoke execute on function public.mark_notice_read(uuid) from public, anon;
grant execute on function public.mark_notice_read(uuid) to authenticated;

-- The parent addresses on file: the newest application, both parents.
create or replace function public._parent_emails(p_member uuid)
returns text[] language sql stable security definer set search_path = public
as $fn$
  select coalesce(array_remove(array[
           nullif(lower(btrim(a.parent_email)), ''),
           case when a.parent_two_contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(btrim(a.parent_two_contact)) end
         ], null), '{}')
    from public.member_applications a
   where a.member_id = p_member
   order by a.submitted_at desc nulls last
   limit 1;
$fn$;

create or replace function public._member_email(p_member uuid)
returns text language sql stable security definer set search_path = public
as $fn$ select lower(email) from auth.users where id = p_member $fn$;

create or replace function public._member_name(p_member uuid)
returns text language sql stable security definer set search_path = public
as $fn$ select coalesce(nullif(btrim(nickname), ''), nullif(btrim(full_name), ''), 'Member') from public.profiles where id = p_member $fn$;

-- One notice in the app, and mail to the student and (when asked) parents.
create or replace function public._notify(p_member uuid, p_kind text, p_title text, p_body text, p_parents boolean)
returns void language plpgsql security definer set search_path = public
as $fn$
declare v_to text; v_name text := public._member_name(p_member);
begin
  insert into public.member_notices (member_id, kind, title, body, created_by)
  values (p_member, p_kind, p_title, coalesce(p_body, ''), auth.uid());
  v_to := public._member_email(p_member);
  if v_to is not null then
    insert into public.notice_outbox (to_email, subject, body, member_id, kind)
    values (v_to, 'Techmen 5669: ' || p_title, coalesce(p_body, ''), p_member, p_kind);
  end if;
  if p_parents then
    insert into public.notice_outbox (to_email, subject, body, member_id, kind)
    select e, 'Techmen 5669: ' || p_title || ' (' || v_name || ')',
           'This is about ' || v_name || '.' || chr(10) || chr(10) || coalesce(p_body, ''), p_member, p_kind
      from unnest(public._parent_emails(p_member)) e;
  end if;
end;
$fn$;
revoke execute on function public._notify(uuid, text, text, text, boolean) from public, anon, authenticated;

-- Mail to every admin (the third safety violation, removal proposals).
create or replace function public._notify_admins(p_kind text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  insert into public.notice_outbox (to_email, subject, body, kind)
  select lower(u.email), 'Techmen 5669: ' || p_title, p_body, p_kind
    from public.member_roles r join auth.users u on u.id = r.member_id
   where r.role = 'admin' and u.email is not null;
  insert into public.member_notices (member_id, kind, title, body, created_by)
  select r.member_id, p_kind, p_title, p_body, auth.uid() from public.member_roles r where r.role = 'admin';
end;
$fn$;
revoke execute on function public._notify_admins(text, text, text) from public, anon, authenticated;

-- ── 3. Break and work weeks ──────────────────────────────────────────────────
create table if not exists public.team_weeks (
  week_start date        primary key check (extract(isodow from week_start) = 1),
  kind       text        not null check (kind in ('break', 'work')),
  note       text        check (note is null or length(note) <= 200),
  posted_by  uuid        references public.profiles(id) on delete set null,
  posted_at  timestamptz not null default now()
);
alter table public.team_weeks enable row level security;
drop policy if exists "team weeks read" on public.team_weeks;
create policy "team weeks read" on public.team_weeks for select to authenticated using (true);
grant select on public.team_weeks to authenticated;
revoke insert, update, delete, truncate on public.team_weeks from authenticated;
revoke all on public.team_weeks from anon;

-- Posted 14 days ahead; a week that has started never changes.
create or replace function public.staff_set_week(p_week date, p_kind text, p_note text default null)
returns public.team_weeks language plpgsql security definer set search_path = public
as $fn$
declare v public.team_weeks;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if extract(isodow from p_week) <> 1 then raise exception 'A week starts on a Monday' using errcode = '22023'; end if;
  if p_week < public._la_today() + 14 then
    raise exception 'A school break week is posted at least 14 days ahead' using errcode = '22023';
  end if;
  if p_kind is null then
    delete from public.team_weeks where week_start = p_week returning * into v;
    return v;
  end if;
  insert into public.team_weeks (week_start, kind, note, posted_by) values (p_week, p_kind, p_note, auth.uid())
  on conflict (week_start) do update set kind = excluded.kind, note = excluded.note, posted_by = excluded.posted_by, posted_at = now()
  returning * into v;
  return v;
end;
$fn$;
revoke execute on function public.staff_set_week(date, text, text) from public, anon;
grant execute on function public.staff_set_week(date, text, text) to authenticated;

-- ── 4. Absence requests ─────────────────────────────────────────────────────
create table if not exists public.absence_requests (
  id            uuid        primary key default gen_random_uuid(),
  member_id     uuid        not null references public.profiles(id) on delete cascade,
  event_id      uuid        not null references public.events(id) on delete cascade,
  reason        text        not null check (reason in ('illness', 'family_emergency', 'school_event', 'medical', 'religious', 'test_or_college')),
  emergency     boolean     not null default false,
  note          text        check (note is null or length(note) <= 500),
  status        text        not null default 'pending' check (status in ('pending', 'approved', 'denied', 'withdrawn')),
  requested_at  timestamptz not null default now(),
  decided_by    uuid        references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text
);
create unique index if not exists absence_requests_one_live_idx
  on public.absence_requests (member_id, event_id) where status in ('pending', 'approved');
create index if not exists absence_requests_status_idx on public.absence_requests (status, requested_at);
alter table public.absence_requests enable row level security;
drop policy if exists "absence read own parent staff" on public.absence_requests;
create policy "absence read own parent staff" on public.absence_requests for select to authenticated
  using (public._can_see_member(member_id));
grant select on public.absence_requests to authenticated;
revoke insert, update, delete, truncate on public.absence_requests from authenticated;
revoke all on public.absence_requests from anon;

-- The next school day after an LA date (Monday to Friday; holidays not known).
create or replace function public._next_school_day(p_day date)
returns date language sql immutable set search_path = public
as $fn$
  select case extract(isodow from p_day)::int when 5 then p_day + 3 when 6 then p_day + 2 else p_day + 1 end;
$fn$;

-- Emergency reasons are own illness or a family emergency.
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
    if p_reason not in ('illness', 'family_emergency', 'medical') then
      raise exception 'An emergency is your own illness or injury, or a family emergency' using errcode = '22023';
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

create or replace function public.withdraw_absence(p_request uuid)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare n integer;
begin
  update public.absence_requests set status = 'withdrawn', decided_at = now()
   where id = p_request and member_id = auth.uid() and status = 'pending';
  get diagnostics n = row_count;
  return n;
end;
$fn$;

create or replace function public.decide_absence(p_request uuid, p_approve boolean, p_note text default null)
returns public.absence_requests language plpgsql security definer set search_path = public
as $fn$
declare v public.absence_requests;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
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

revoke execute on function public.request_absence(uuid, text, text, boolean) from public, anon;
revoke execute on function public.withdraw_absence(uuid) from public, anon;
revoke execute on function public.decide_absence(uuid, boolean, text) from public, anon;
grant execute on function public.request_absence(uuid, text, text, boolean) to authenticated;
grant execute on function public.withdraw_absence(uuid) to authenticated;
grant execute on function public.decide_absence(uuid, boolean, text) to authenticated;

-- Excused: approved, or still unanswered when the event started.
create or replace function public._absence_excused(p_member uuid, p_event uuid, p_starts timestamptz)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (select 1 from public.absence_requests a
                  where a.member_id = p_member and a.event_id = p_event
                    and (a.status = 'approved' or (a.status = 'pending' and a.requested_at <= p_starts and now() >= p_starts)));
$fn$;

-- ── 5. Grade checks ──────────────────────────────────────────────────────────
create table if not exists public.grade_checks (
  id         uuid        primary key default gen_random_uuid(),
  member_id  uuid        not null references public.profiles(id) on delete cascade,
  check_date date        not null,
  below      boolean     not null,
  note       text        check (note is null or length(note) <= 300),
  set_by     uuid        references public.profiles(id) on delete set null,
  set_at     timestamptz not null default now(),
  unique (member_id, check_date)
);
alter table public.grade_checks enable row level security;
drop policy if exists "grade checks read own parent staff" on public.grade_checks;
create policy "grade checks read own parent staff" on public.grade_checks for select to authenticated
  using (public._can_see_member(member_id));
grant select on public.grade_checks to authenticated;
revoke insert, update, delete, truncate on public.grade_checks from authenticated;
revoke all on public.grade_checks from anon;

-- ── 6. Discipline, safety, incidents ─────────────────────────────────────────
create table if not exists public.discipline_records (
  id              uuid        primary key default gen_random_uuid(),
  member_id       uuid        not null references public.profiles(id) on delete cascade,
  level           text        not null check (level in ('verbal', 'written', 'suspension', 'removal')),
  rule            text        not null check (length(btrim(rule)) between 3 and 300),
  note            text        check (note is null or length(note) <= 1000),
  starts_on       date,
  ends_on         date,
  created_by      uuid        references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  appeal_note     text,
  appeal_at       timestamptz,
  appeal_decision text        check (appeal_decision is null or appeal_decision in ('upheld', 'withdrawn')),
  appeal_by       uuid        references public.profiles(id) on delete set null,
  constraint discipline_suspension_dates_chk check (
    level <> 'suspension' or (starts_on is not null and ends_on is not null and ends_on >= starts_on + 6 and ends_on <= starts_on + 27))
);
create index if not exists discipline_records_member_idx on public.discipline_records (member_id, created_at desc);
alter table public.discipline_records enable row level security;
drop policy if exists "discipline read own parent staff" on public.discipline_records;
create policy "discipline read own parent staff" on public.discipline_records for select to authenticated
  using (public._can_see_member(member_id));
grant select on public.discipline_records to authenticated;
revoke insert, update, delete, truncate on public.discipline_records from authenticated;
revoke all on public.discipline_records from anon;

create table if not exists public.safety_violations (
  id         uuid        primary key default gen_random_uuid(),
  member_id  uuid        not null references public.profiles(id) on delete cascade,
  rule       text        not null check (length(btrim(rule)) between 3 and 200),
  note       text        check (note is null or length(note) <= 1000),
  logged_by  uuid        references public.profiles(id) on delete set null,
  logged_at  timestamptz not null default now()
);
create index if not exists safety_violations_member_idx on public.safety_violations (member_id, logged_at);
alter table public.safety_violations enable row level security;
drop policy if exists "safety read own parent staff" on public.safety_violations;
create policy "safety read own parent staff" on public.safety_violations for select to authenticated
  using (public._can_see_member(member_id));
grant select on public.safety_violations to authenticated;
revoke insert, update, delete, truncate on public.safety_violations from authenticated;
revoke all on public.safety_violations from anon;

create table if not exists public.incident_reports (
  id            uuid        primary key default gen_random_uuid(),
  kind          text        not null check (kind in ('injury', 'near_miss', 'damaged_tool', 'battery')),
  member_id     uuid        references public.profiles(id) on delete set null,
  description   text        not null check (length(btrim(description)) between 3 and 2000),
  occurred_at   timestamptz not null default now(),
  reported_by   uuid        references public.profiles(id) on delete set null,
  reported_at   timestamptz not null default now(),
  parent_called boolean     not null default false,
  office_told   boolean     not null default false,
  closed_by     uuid        references public.profiles(id) on delete set null,
  closed_at     timestamptz
);
alter table public.incident_reports enable row level security;
drop policy if exists "incidents read reporter staff" on public.incident_reports;
create policy "incidents read reporter staff" on public.incident_reports for select to authenticated
  using (reported_by = auth.uid() or public.is_staff());
grant select on public.incident_reports to authenticated;
revoke insert, update, delete, truncate on public.incident_reports from authenticated;
revoke all on public.incident_reports from anon;

-- The school year runs August 1 to July 31.
create or replace function public._school_year_start(p_day date)
returns date language sql immutable set search_path = public
as $fn$ select make_date(case when extract(month from p_day) >= 8 then extract(year from p_day)::int else extract(year from p_day)::int - 1 end, 8, 1) $fn$;

create or replace function public.staff_log_discipline(p_member uuid, p_level text, p_rule text, p_note text default null,
                                                       p_starts date default null, p_ends date default null)
returns public.discipline_records language plpgsql security definer set search_path = public
as $fn$
declare v public.discipline_records; v_title text;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_level = 'removal' and not public.is_admin() then
    raise exception 'Only Mr. Pina removes a member' using errcode = '42501';
  end if;
  if p_member = auth.uid() then raise exception 'Not for yourself' using errcode = '42501'; end if;
  insert into public.discipline_records (member_id, level, rule, note, starts_on, ends_on, created_by)
  values (p_member, p_level, btrim(p_rule), nullif(btrim(coalesce(p_note, '')), ''), p_starts, p_ends, auth.uid())
  returning * into v;
  v_title := case p_level when 'verbal' then 'Verbal warning' when 'written' then 'Written warning'
                          when 'suspension' then 'Suspension' else 'Removal from the team' end;
  perform public._notify(p_member, 'discipline', v_title,
    'Rule: ' || v.rule
    || case when p_level = 'suspension' then chr(10) || 'From ' || p_starts || ' through ' || p_ends || '. No team activities in that time.' else '' end
    || case when p_level = 'written' then chr(10) || 'You may appeal to Mr. Pina within 5 school days, in the app.' else '' end,
    p_level <> 'verbal');
  if p_level = 'removal' then
    update public.profiles set status = 'inactive' where id = p_member;
  end if;
  return v;
end;
$fn$;

create or replace function public.appeal_discipline(p_record uuid, p_note text)
returns public.discipline_records language plpgsql security definer set search_path = public
as $fn$
declare v public.discipline_records;
begin
  if p_note is null or length(btrim(p_note)) < 3 then raise exception 'Say why' using errcode = '22023'; end if;
  update public.discipline_records set appeal_note = btrim(p_note), appeal_at = now()
   where id = p_record and member_id = auth.uid() and level = 'written' and appeal_at is null
     and now() <= created_at + interval '7 days'
  returning * into v;
  if not found then raise exception 'Only a written warning, within 5 school days, once' using errcode = 'P0002'; end if;
  perform public._notify_admins('appeal', 'Appeal of a written warning', public._member_name(v.member_id) || ': ' || v.appeal_note);
  return v;
end;
$fn$;

create or replace function public.admin_decide_appeal(p_record uuid, p_uphold boolean)
returns public.discipline_records language plpgsql security definer set search_path = public
as $fn$
declare v public.discipline_records;
begin
  if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  update public.discipline_records set appeal_decision = case when p_uphold then 'upheld' else 'withdrawn' end, appeal_by = auth.uid()
   where id = p_record and appeal_at is not null and appeal_decision is null
  returning * into v;
  if not found then raise exception 'No open appeal' using errcode = 'P0002'; end if;
  perform public._notify(v.member_id, 'discipline',
    case when p_uphold then 'Appeal decided: the warning stands' else 'Appeal decided: the warning is withdrawn' end, '', true);
  return v;
end;
$fn$;

create or replace function public.staff_log_safety(p_member uuid, p_rule text, p_note text default null)
returns public.safety_violations language plpgsql security definer set search_path = public
as $fn$
declare v public.safety_violations; n integer;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  insert into public.safety_violations (member_id, rule, note, logged_by)
  values (p_member, btrim(p_rule), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into v;
  select count(*) into n from public.safety_violations
   where member_id = p_member and public._la_date(logged_at) >= public._school_year_start(public._la_today());
  perform public._notify(p_member, 'safety', 'Safety violation logged',
    'Rule: ' || v.rule || chr(10) || 'This is number ' || n || ' this school year.', true);
  if n >= 3 then
    perform public._notify_admins('safety_third', 'Third safety violation: ' || public._member_name(p_member),
      'Decide within 5 school days. No tools until then. Latest: ' || v.rule);
  end if;
  return v;
end;
$fn$;

create or replace function public.report_incident(p_kind text, p_member uuid, p_description text, p_occurred timestamptz default null)
returns public.incident_reports language plpgsql security definer set search_path = public
as $fn$
declare v public.incident_reports;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  insert into public.incident_reports (kind, member_id, description, occurred_at, reported_by)
  values (p_kind, p_member, btrim(p_description), coalesce(p_occurred, now()), auth.uid())
  returning * into v;
  perform public._notify_admins('incident', 'Incident logged: ' || replace(p_kind, '_', ' '), v.description);
  return v;
end;
$fn$;

create or replace function public.staff_update_incident(p_incident uuid, p_parent_called boolean, p_office_told boolean, p_close boolean)
returns public.incident_reports language plpgsql security definer set search_path = public
as $fn$
declare v public.incident_reports;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  update public.incident_reports set parent_called = p_parent_called, office_told = p_office_told,
         closed_by = case when p_close then auth.uid() end, closed_at = case when p_close then now() end
   where id = p_incident returning * into v;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  return v;
end;
$fn$;

revoke execute on function public.staff_log_discipline(uuid, text, text, text, date, date) from public, anon;
revoke execute on function public.appeal_discipline(uuid, text) from public, anon;
revoke execute on function public.admin_decide_appeal(uuid, boolean) from public, anon;
revoke execute on function public.staff_log_safety(uuid, text, text) from public, anon;
revoke execute on function public.report_incident(text, uuid, text, timestamptz) from public, anon;
revoke execute on function public.staff_update_incident(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.staff_log_discipline(uuid, text, text, text, date, date) to authenticated;
grant execute on function public.appeal_discipline(uuid, text) to authenticated;
grant execute on function public.admin_decide_appeal(uuid, boolean) to authenticated;
grant execute on function public.staff_log_safety(uuid, text, text) to authenticated;
grant execute on function public.report_incident(text, uuid, text, timestamptz) to authenticated;
grant execute on function public.staff_update_incident(uuid, boolean, boolean, boolean) to authenticated;

-- ── 7. Voiding idle time ─────────────────────────────────────────────────────
-- A mentor ends a session that is not being worked and voids it; or voids
-- every session of a day (cleanup skipped). The reason goes to the student.
create or replace function public.staff_void_session(p_member uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare v_last record; v_out uuid;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'A reason is required' using errcode = '22023'; end if;
  select id, type into v_last from public.attendance_events where user_id = p_member order by event_time desc limit 1;
  if v_last.id is null or v_last.type <> 'in' then raise exception 'Not signed in' using errcode = 'P0002'; end if;
  insert into public.attendance_events (user_id, type, location, method, note)
  values (p_member, 'out', 'voided', 'manual', 'Voided: ' || btrim(p_reason)) returning id into v_out;
  insert into public.session_reviews (user_id, checkin_id, checkout_id, status, reviewed_by, reviewed_at)
  values (p_member, v_last.id, v_out, 'voided', auth.uid(), now());
  update public.signout_requests set status = 'withdrawn', decided_at = now() where member_id = p_member and status = 'pending';
  perform public._notify(p_member, 'void', 'Session voided', 'A mentor voided your session: ' || btrim(p_reason), false);
  return 1;
end;
$fn$;

create or replace function public.staff_void_day(p_member uuid, p_day date, p_reason text)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare r record; n integer := 0;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'A reason is required' using errcode = '22023'; end if;
  for r in
    with ev as (
      select id, type, event_time, lead(id) over w nid, lead(type) over w ntype
        from public.attendance_events where user_id = p_member
       window w as (order by event_time, id))
    select id, nid from ev where type = 'in' and ntype = 'out' and public._la_date(event_time) = p_day
  loop
    insert into public.session_reviews (user_id, checkin_id, checkout_id, status, reviewed_by, reviewed_at)
    values (p_member, r.id, r.nid, 'voided', auth.uid(), now())
    on conflict (checkin_id) do update set status = 'voided', reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
    n := n + 1;
  end loop;
  if n > 0 then
    perform public._notify(p_member, 'void', 'Hours voided for ' || to_char(p_day, 'Mon DD'), 'A mentor voided that day: ' || btrim(p_reason), true);
  end if;
  return n;
end;
$fn$;
revoke execute on function public.staff_void_session(uuid, text) from public, anon;
revoke execute on function public.staff_void_day(uuid, date, text) from public, anon;
grant execute on function public.staff_void_session(uuid, text) to authenticated;
grant execute on function public.staff_void_day(uuid, date, text) to authenticated;

-- ── 8. FLL mentors ───────────────────────────────────────────────────────────
create table if not exists public.fll_teams (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique check (length(btrim(name)) between 1 and 80),
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.fll_mentors (
  id             uuid        primary key default gen_random_uuid(),
  team_id        uuid        not null references public.fll_teams(id) on delete cascade,
  member_id      uuid        not null references public.profiles(id) on delete cascade,
  joined_at      timestamptz not null default now(),
  removed_at     timestamptz,
  removed_reason text
);
create unique index if not exists fll_mentors_live_idx on public.fll_mentors (team_id, member_id) where removed_at is null;
alter table public.fll_teams enable row level security;
alter table public.fll_mentors enable row level security;
drop policy if exists "fll teams read" on public.fll_teams;
create policy "fll teams read" on public.fll_teams for select to authenticated using (true);
drop policy if exists "fll teams staff write" on public.fll_teams;
create policy "fll teams staff write" on public.fll_teams for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "fll mentors read" on public.fll_mentors;
create policy "fll mentors read" on public.fll_mentors for select to authenticated using (true);
grant select, insert, update, delete on public.fll_teams to authenticated;
grant select on public.fll_mentors to authenticated;
revoke insert, update, delete, truncate on public.fll_mentors from authenticated;
revoke all on public.fll_teams, public.fll_mentors from anon;

create or replace function public.fll_join(p_team uuid)
returns public.fll_mentors language plpgsql security definer set search_path = public
as $fn$
declare v public.fll_mentors; n integer;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform 1 from public.fll_teams where id = p_team and active for update;
  if not found then raise exception 'No such FLL team' using errcode = 'P0002'; end if;
  select * into v from public.fll_mentors where team_id = p_team and member_id = auth.uid() and removed_at is null;
  if found then return v; end if;
  select count(*) into n from public.fll_mentors where team_id = p_team and removed_at is null;
  if n >= 4 then raise exception 'That FLL team has its 4 mentors' using errcode = '22023'; end if;
  insert into public.fll_mentors (team_id, member_id) values (p_team, auth.uid()) returning * into v;
  return v;
end;
$fn$;

create or replace function public.fll_leave(p_team uuid, p_member uuid default null)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare n integer; v_member uuid := coalesce(p_member, auth.uid());
begin
  if v_member <> auth.uid() and not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  update public.fll_mentors set removed_at = now(), removed_reason = case when v_member = auth.uid() then 'left' else 'removed by a mentor' end
   where team_id = p_team and member_id = v_member and removed_at is null;
  get diagnostics n = row_count;
  return n;
end;
$fn$;
revoke execute on function public.fll_join(uuid) from public, anon;
revoke execute on function public.fll_leave(uuid, uuid) from public, anon;
grant execute on function public.fll_join(uuid) to authenticated;
grant execute on function public.fll_leave(uuid, uuid) to authenticated;

-- ── 9. Weekly and monthly results, standing records ─────────────────────────
create table if not exists public.standing_weeks (
  member_id    uuid        not null references public.profiles(id) on delete cascade,
  week_start   date        not null,
  hours        numeric     not null,
  required     numeric     not null,
  meetings     integer     not null,
  misses       integer     not null,
  excused      boolean     not null,
  suspended    boolean     not null,
  ok           boolean     not null,
  evaluated_at timestamptz not null default now(),
  primary key (member_id, week_start)
);
create table if not exists public.standing_months (
  member_id     uuid        not null references public.profiles(id) on delete cascade,
  month         date        not null,
  counted       integer     not null,
  attended      integer     not null,
  lates         integer     not null,
  misses        integer     not null,
  late_absences integer     not null,
  ok            boolean     not null,
  evaluated_at  timestamptz not null default now(),
  primary key (member_id, month)
);
create table if not exists public.standing_records (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references public.profiles(id) on delete cascade,
  kind         text        not null check (kind in ('meetings', 'hours', 'grades', 'removal')),
  reason       text        not null,
  opened_on    date        not null,
  clean_weeks  integer     not null default 0,
  status       text        not null default 'open' check (status in ('open', 'closed', 'failed', 'proposed', 'removed', 'dismissed')),
  closed_on    date,
  confirmed_by uuid        references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists standing_records_one_open_idx
  on public.standing_records (member_id, kind) where status in ('open', 'proposed');
alter table public.standing_weeks enable row level security;
alter table public.standing_months enable row level security;
alter table public.standing_records enable row level security;
drop policy if exists "standing weeks read" on public.standing_weeks;
create policy "standing weeks read" on public.standing_weeks for select to authenticated using (public._can_see_member(member_id));
drop policy if exists "standing months read" on public.standing_months;
create policy "standing months read" on public.standing_months for select to authenticated using (public._can_see_member(member_id));
drop policy if exists "standing records read" on public.standing_records;
create policy "standing records read" on public.standing_records for select to authenticated using (public._can_see_member(member_id));
grant select on public.standing_weeks, public.standing_months, public.standing_records to authenticated;
revoke insert, update, delete, truncate on public.standing_weeks, public.standing_months, public.standing_records from authenticated;
revoke all on public.standing_weeks, public.standing_months, public.standing_records from anon;

-- Signed-in hours with the check-in inside [p_from, p_to). Mirrors
-- src/hoursUtils.js sessionsFromEvents for a closed week: each IN pairs with
-- the next event when that is an OUT, capped at 12 hours; FLL (volunteer)
-- sessions and sessions under review or voided do not count.
-- DUPLICATE of the client rule, by necessity (a cron cannot run the client);
-- tests/standing.test.js holds the cap and the exclusions equal.
create or replace function public._member_hours(p_member uuid, p_from timestamptz, p_to timestamptz)
returns numeric language sql stable security definer set search_path = public
as $fn$
  with ev as (
    select id, type, event_time, category,
           lead(id) over w as nid, lead(type) over w as ntype, lead(event_time) over w as ntime
      from public.attendance_events
     where user_id = p_member and event_time >= p_from - interval '1 day' and event_time < p_to + interval '13 hours'
    window w as (order by event_time, id))
  select coalesce(round(sum(extract(epoch from least(ntime, event_time + interval '12 hours') - event_time)) / 3600.0, 2), 0)
    from ev
   where type = 'in' and ntype = 'out' and event_time >= p_from and event_time < p_to
     and coalesce(category, 'build') <> 'volunteer'
     and not exists (select 1 from public.session_reviews r where r.checkout_id = ev.nid and r.status in ('pending', 'voided'));
$fn$;

create or replace function public._member_suspended(p_member uuid, p_day date)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (select 1 from public.discipline_records d where d.member_id = p_member and d.level = 'suspension'
                    and p_day between d.starts_on and d.ends_on);
$fn$;

-- The first day the standards apply to a member: the later of the setting
-- and the day they joined (their first application this season, else the
-- account created_at).
create or replace function public._member_since(p_member uuid)
returns date language sql stable security definer set search_path = public
as $fn$
  select greatest((select starts_on from public.standing_settings),
                  coalesce((select public._la_date(min(submitted_at)) from public.member_applications where member_id = p_member),
                           (select public._la_date(created_at) from auth.users where id = p_member),
                           date '2000-01-01'));
$fn$;

-- Meetings of one member in [p_from, p_to] by LA date: counted (not excused,
-- not in a break week, not suspended), attended (present or late), lates,
-- unexcused misses, and every meeting excused.
create or replace function public._member_meetings(p_member uuid, p_from date, p_to date)
returns table (total integer, counted integer, attended integer, lates integer, misses integer)
language sql stable security definer set search_path = public
as $fn$
  with m as (
    select e.id, e.starts_at,
           mc.status as scan,
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

create or replace function public._open_probation(p_member uuid, p_kind text, p_reason text, p_on date)
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  if exists (select 1 from public.standing_records where member_id = p_member and kind = p_kind and status = 'open') then return; end if;
  insert into public.standing_records (member_id, kind, reason, opened_on) values (p_member, p_kind, p_reason, p_on);
  perform public._notify(p_member, 'probation',
    initcap(p_kind) || ' probation started',
    p_reason || chr(10) || chr(10)
    || case when p_kind = 'grades' then 'Until the next grade check: normal attendance rules, competitions included, no drive team or pit crew.'
            else 'For 4 clean weeks: make your hours every week and attend every meeting. One unexcused miss or one short week and you are removed. Competitions included; no drive team, pit crew or speaking for the team.' end,
    true);
end;
$fn$;

create or replace function public._propose_removal(p_member uuid, p_reason text, p_on date)
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  if exists (select 1 from public.standing_records where member_id = p_member and kind = 'removal' and status = 'proposed') then return; end if;
  update public.standing_records set status = 'failed', closed_on = p_on
   where member_id = p_member and kind in ('meetings', 'hours') and status = 'open';
  insert into public.standing_records (member_id, kind, reason, opened_on, status) values (p_member, 'removal', p_reason, p_on, 'proposed');
  perform public._notify_admins('removal_proposed', 'Removal to confirm: ' || public._member_name(p_member), p_reason);
end;
$fn$;

-- The evaluation. Idempotent: a week or month is judged once, in order.
-- Run daily by pg_cron, or by an admin from /standing/team.
create or replace function public.standing_evaluate()
returns integer language plpgsql security definer set search_path = public
as $fn$
declare
  s        public.standing_settings;
  v_today  date := public._la_today();
  m        record;
  wk       date;
  mo       date;
  v_since  date;
  v_hours  numeric;
  v_req    numeric;
  mt       record;
  v_exc    boolean;
  v_susp   boolean;
  v_ok     boolean;
  n        integer := 0;
  v_fll    record;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select * into s from public.standing_settings;
  for m in select p.id from public.profiles p where public._standing_member(p.id) loop
    v_since := public._member_since(m.id);
    -- Weeks, Monday to Sunday, fully in the past.
    wk := date_trunc('week', v_since)::date;
    if wk < v_since then wk := wk + 7; end if;
    while wk + 7 <= v_today loop
      if not exists (select 1 from public.standing_weeks where member_id = m.id and week_start = wk) then
        v_hours := public._member_hours(m.id, public._la_start(wk), public._la_start(wk + 7));
        v_req := case when wk between s.build_season_start and s.build_season_end then s.build_weekly_hours else s.weekly_hours end;
        select * into mt from public._member_meetings(m.id, wk, wk + 6);
        v_susp := public._member_suspended(m.id, wk) or public._member_suspended(m.id, wk + 6);
        v_exc := exists (select 1 from public.team_weeks where week_start = wk and kind = 'break')
              or (mt.total > 0 and mt.counted = 0);
        v_ok := v_exc or v_susp or (v_hours >= v_req and mt.misses = 0);
        insert into public.standing_weeks (member_id, week_start, hours, required, meetings, misses, excused, suspended, ok)
        values (m.id, wk, v_hours, v_req, mt.total, mt.misses, v_exc, v_susp, v_ok);
        n := n + 1;
        if not (v_exc or v_susp) then
          if exists (select 1 from public.standing_records where member_id = m.id and kind in ('meetings', 'hours') and status = 'open') then
            if v_ok then
              update public.standing_records set clean_weeks = clean_weeks + 1
               where member_id = m.id and kind in ('meetings', 'hours') and status = 'open';
              for v_fll in select id, kind from public.standing_records
                             where member_id = m.id and kind in ('meetings', 'hours') and status = 'open' and clean_weeks >= 4 loop
                update public.standing_records set status = 'closed', closed_on = wk + 6 where id = v_fll.id;
                perform public._notify(m.id, 'probation', initcap(v_fll.kind) || ' probation closed', 'Four clean weeks. You are back in good standing for ' || v_fll.kind || '.', true);
              end loop;
            else
              perform public._propose_removal(m.id,
                case when mt.misses > 0 then 'Missed a meeting on probation, week of ' || wk else 'Short week on probation, week of ' || wk || ': ' || v_hours || ' of ' || v_req || ' hours' end, wk + 6);
            end if;
          elsif v_hours < v_req then
            perform public._open_probation(m.id, 'hours', 'Week of ' || to_char(wk, 'Mon DD') || ': ' || v_hours || ' of ' || v_req || ' hours.', wk + 7);
          end if;
        end if;
      end if;
      wk := wk + 7;
    end loop;
    -- Months, fully in the past.
    mo := date_trunc('month', v_since)::date;
    while (mo + interval '1 month')::date <= v_today loop
      if not exists (select 1 from public.standing_months where member_id = m.id and month = mo) then
        select * into mt from public._member_meetings(m.id, greatest(mo, v_since), (mo + interval '1 month')::date - 1);
        -- Never rounded: attended minus every third late, against counted.
        v_ok := mt.counted = 0 or (mt.attended - (mt.lates / 3)) * 100 >= s.meeting_pct * mt.counted;
        insert into public.standing_months (member_id, month, counted, attended, lates, misses, late_absences, ok)
        values (m.id, mo, mt.counted, mt.attended, mt.lates, mt.misses, mt.lates / 3, v_ok);
        n := n + 1;
        if not v_ok then
          if exists (select 1 from public.standing_records where member_id = m.id and kind in ('meetings', 'hours') and status = 'open') then
            perform public._propose_removal(m.id, 'Under 80 percent of meetings again, on probation: ' || to_char(mo, 'FMMonth YYYY'), (mo + interval '1 month')::date);
          else
            perform public._open_probation(m.id, 'meetings',
              to_char(mo, 'FMMonth') || ': ' || (mt.attended - mt.lates / 3) || ' of ' || mt.counted || ' meetings (80 percent needed; 3 lates count as 1 absence).',
              (mo + interval '1 month')::date);
          end if;
        end if;
      end if;
      mo := (mo + interval '1 month')::date;
    end loop;
  end loop;

  -- FLL mentors: off a team after two weeks in a row with no FLL session.
  for v_fll in
    select f.id, f.member_id, f.team_id, f.joined_at from public.fll_mentors f where f.removed_at is null
  loop
    wk := date_trunc('week', v_today)::date - 14;
    if public._la_date(v_fll.joined_at) <= wk
       and not exists (select 1 from public.attendance_events a where a.user_id = v_fll.member_id and a.type = 'in'
                          and a.category = 'volunteer' and a.event_time >= public._la_start(wk) and a.event_time < public._la_start(wk + 14))
    then
      update public.fll_mentors set removed_at = now(), removed_reason = 'two weeks with no FLL session' where id = v_fll.id;
      perform public._notify(v_fll.member_id, 'fll', 'Off your FLL team',
        'Two weeks in a row with no FLL session. Sign up again in the app when you can go every week.', false);
    end if;
  end loop;
  return n;
end;
$fn$;
revoke execute on function public.standing_evaluate() from public, anon;
grant execute on function public.standing_evaluate() to authenticated;

-- Mr. Pina confirms each probation and removal. Confirming a removal takes
-- the member off the roster; dismissing it closes the proposal.
create or replace function public.admin_confirm_standing(p_record uuid, p_confirm boolean, p_note text default null)
returns public.standing_records language plpgsql security definer set search_path = public
as $fn$
declare v public.standing_records;
begin
  if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  select * into v from public.standing_records where id = p_record for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if v.kind = 'removal' and v.status = 'proposed' then
    update public.standing_records set status = case when p_confirm then 'removed' else 'dismissed' end,
           confirmed_by = auth.uid(), confirmed_at = now(), closed_on = public._la_today()
     where id = p_record returning * into v;
    if p_confirm then
      update public.profiles set status = 'inactive' where id = v.member_id;
      perform public._notify(v.member_id, 'removal', 'Removed from the team',
        v.reason || coalesce(chr(10) || p_note, '') || chr(10) || 'You may reapply in the next spring cycle.', true);
    end if;
  elsif v.kind in ('meetings', 'hours', 'grades') then
    if not p_confirm then
      update public.standing_records set status = 'dismissed', confirmed_by = auth.uid(), confirmed_at = now(), closed_on = public._la_today()
       where id = p_record returning * into v;
      perform public._notify(v.member_id, 'probation', initcap(v.kind) || ' probation withdrawn', coalesce(p_note, ''), true);
    else
      update public.standing_records set confirmed_by = auth.uid(), confirmed_at = now() where id = p_record returning * into v;
    end if;
  else
    raise exception 'Nothing to confirm' using errcode = 'P0002';
  end if;
  return v;
end;
$fn$;

-- A grade check: below 2.0 opens grades probation (a new one when already on
-- it); at or above 2.0 closes it.
create or replace function public.admin_record_grade_check(p_member uuid, p_check date, p_below boolean, p_note text default null)
returns public.grade_checks language plpgsql security definer set search_path = public
as $fn$
declare v public.grade_checks;
begin
  if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  insert into public.grade_checks (member_id, check_date, below, note, set_by)
  values (p_member, p_check, p_below, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (member_id, check_date) do update set below = excluded.below, note = excluded.note, set_by = excluded.set_by, set_at = now()
  returning * into v;
  if exists (select 1 from public.standing_records where member_id = p_member and kind = 'grades' and status = 'open') then
    update public.standing_records set status = 'closed', closed_on = p_check
     where member_id = p_member and kind = 'grades' and status = 'open';
    if not p_below then
      perform public._notify(p_member, 'probation', 'Grades probation closed', 'Your grades are at 2.0 or above at this check.', true);
    end if;
  end if;
  if p_below then
    perform public._open_probation(p_member, 'grades', 'GPA under 2.0 at the grade check of ' || to_char(p_check, 'Mon DD') || '.', p_check);
  end if;
  return v;
end;
$fn$;
revoke execute on function public.admin_confirm_standing(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_record_grade_check(uuid, date, boolean, text) from public, anon;
grant execute on function public.admin_confirm_standing(uuid, boolean, text) to authenticated;
grant execute on function public.admin_record_grade_check(uuid, date, boolean, text) to authenticated;

-- ── 10. The member page reads one call ───────────────────────────────────────
create or replace function public.member_standing(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare
  s       public.standing_settings;
  v_today date := public._la_today();
  wk      date := date_trunc('week', public._la_today())::date;
  mo      date := date_trunc('month', public._la_today())::date;
  mt      record;
  v_week  numeric;
  v_req   numeric;
  v_open  jsonb;
begin
  if not public._can_see_member(p_member) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from public.standing_settings;
  v_week := public._member_hours(p_member, public._la_start(wk), public._la_start(wk + 7));
  v_req := case when wk between s.build_season_start and s.build_season_end then s.build_weekly_hours else s.weekly_hours end;
  select * into mt from public._member_meetings(p_member, greatest(mo, public._member_since(p_member)), v_today);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.opened_on desc), '[]') into v_open
    from public.standing_records r where r.member_id = p_member;
  return jsonb_build_object(
    'member', p_member,
    'name', public._member_name(p_member),
    'applies', public._standing_member(p_member),
    'since', public._member_since(p_member),
    'standing', case
       when exists (select 1 from public.standing_records where member_id = p_member and status = 'removed') then 'removed'
       when exists (select 1 from public.standing_records where member_id = p_member and status in ('open', 'proposed')) then 'probation'
       else 'good' end,
    'records', v_open,
    'week', jsonb_build_object('start', wk, 'hours', v_week, 'required', v_req),
    'month', jsonb_build_object('start', mo, 'counted', mt.counted, 'attended', mt.attended, 'lates', mt.lates, 'misses', mt.misses,
                                'late_absences', mt.lates / 3, 'pct', s.meeting_pct),
    'weeks', (select coalesce(jsonb_agg(to_jsonb(w) order by w.week_start desc), '[]') from (
                select * from public.standing_weeks where member_id = p_member order by week_start desc limit 12) w),
    'months', (select coalesce(jsonb_agg(to_jsonb(x) order by x.month desc), '[]') from (
                select * from public.standing_months where member_id = p_member order by month desc limit 12) x),
    'grades', (select coalesce(jsonb_agg(to_jsonb(g) order by g.check_date desc), '[]') from public.grade_checks g where g.member_id = p_member),
    'safety', (select coalesce(jsonb_agg(to_jsonb(v) order by v.logged_at desc), '[]') from public.safety_violations v
                where v.member_id = p_member and public._la_date(v.logged_at) >= public._school_year_start(v_today)),
    'discipline', (select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]') from public.discipline_records d
                where d.member_id = p_member and public._la_date(d.created_at) >= public._school_year_start(v_today)),
    'absences', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'event_id', a.event_id, 'title', e.title, 'starts_at', e.starts_at,
                    'reason', a.reason, 'emergency', a.emergency, 'status', a.status, 'note', a.note, 'decision_note', a.decision_note)
                    order by e.starts_at desc), '[]')
                  from public.absence_requests a join public.events e on e.id = a.event_id where a.member_id = p_member),
    'fll', (select coalesce(jsonb_agg(jsonb_build_object('team', t.name, 'team_id', t.id)), '[]')
              from public.fll_mentors f join public.fll_teams t on t.id = f.team_id where f.member_id = p_member and f.removed_at is null)
  );
end;
$fn$;
revoke execute on function public.member_standing(uuid) from public, anon;
grant execute on function public.member_standing(uuid) to authenticated;

-- The staff overview: one row per member the standards apply to.
create or replace function public.staff_standing_overview()
returns table (member_id uuid, name text, standing text, open_kinds text[], week_hours numeric, week_required numeric,
               month_counted integer, month_attended integer, month_lates integer, safety_count integer)
language plpgsql stable security definer set search_path = public
as $fn$
declare s public.standing_settings; wk date := date_trunc('week', public._la_today())::date; mo date := date_trunc('month', public._la_today())::date;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into s from public.standing_settings;
  return query
  select p.id, public._member_name(p.id),
         case when exists (select 1 from public.standing_records r where r.member_id = p.id and r.status in ('open', 'proposed')) then 'probation' else 'good' end,
         coalesce((select array_agg(r.kind || ':' || r.status order by r.kind) from public.standing_records r where r.member_id = p.id and r.status in ('open', 'proposed')), '{}'),
         public._member_hours(p.id, public._la_start(wk), public._la_start(wk + 7)),
         case when wk between s.build_season_start and s.build_season_end then s.build_weekly_hours else s.weekly_hours end,
         mm.counted, mm.attended, mm.lates,
         (select count(*)::int from public.safety_violations v where v.member_id = p.id and public._la_date(v.logged_at) >= public._school_year_start(public._la_today()))
    from public.profiles p
    cross join lateral public._member_meetings(p.id, greatest(mo, public._member_since(p.id)), public._la_today()) mm
   where public._standing_member(p.id)
   order by 2;
end;
$fn$;
revoke execute on function public.staff_standing_overview() from public, anon;
grant execute on function public.staff_standing_overview() to authenticated;

-- ── 11. The daily evaluation ─────────────────────────────────────────────────
-- 6:10 AM Los Angeles (13:10 UTC in PDT, 14:10 in PST; 13:10 UTC keeps it
-- before school either way). Pure SQL: needs no function deploy.
select cron.unschedule('standing-evaluate-daily') where exists (select 1 from cron.job where jobname = 'standing-evaluate-daily');
select cron.schedule('standing-evaluate-daily', '10 13 * * *', $cron$ select public.standing_evaluate() $cron$);

-- ── 12. Mail delivery ────────────────────────────────────────────────────────
-- The notice-mail Edge Function drains notice_outbox (deploy it by hand,
-- JWT verification off; it checks x-cron-secret). Its config row, like the
-- calendar poster: null edge_base_url keeps it paused.
create schema if not exists private;
create table if not exists private.notice_mail_config (
  id            boolean primary key default true check (id),
  edge_base_url text,
  hook_secret   text
);
insert into private.notice_mail_config (id) values (true) on conflict (id) do nothing;
revoke all on private.notice_mail_config from public, anon, authenticated;

create or replace function public.invoke_notice_mail()
returns void language plpgsql security definer set search_path = public, private
as $fn$
declare c private.notice_mail_config;
begin
  select * into c from private.notice_mail_config;
  if c.edge_base_url is null or c.hook_secret is null then return; end if;
  if not exists (select 1 from public.notice_outbox where sent_at is null) then return; end if;
  perform net.http_post(
    url := rtrim(c.edge_base_url, '/') || '/notice-mail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', c.hook_secret),
    body := '{}'::jsonb);
end;
$fn$;
revoke execute on function public.invoke_notice_mail() from public, anon, authenticated;

select cron.unschedule('notice-mail-tick') where exists (select 1 from cron.job where jobname = 'notice-mail-tick');
select cron.schedule('notice-mail-tick', '*/10 * * * *', $cron$ select public.invoke_notice_mail() $cron$);
