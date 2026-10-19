-- ============================================================
-- 0014_session_signout -- sign-out notes, mentor approval, meeting check-in
--
-- APPLY: by hand, in the Supabase SQL editor, the whole file at once. Then run
-- 0014_session_signout_rls_test.sql and read its result grid. Re-runnable:
-- every create is if-not-exists or or-replace, every constraint add is guarded
-- on pg_constraint, and every policy dropped is one this file creates.
--
-- WHY: the member handbook, Section 7 (Signing in and out) and Section 6
-- (Attendance). A student leaving scans out and writes a note of what they
-- did; the sign-out waits for a mentor, or a student Mr. Pina permits, and the
-- hours stop when it is approved. A student never approves their own. A scan
-- in the first 15 minutes of a team meeting logs present, a later scan logs
-- late, and a student already signed in who scans during the meeting keeps
-- the session open. FLL sessions sign out with a note and no approval.
--
-- WHAT IT CREATES
--   capability 'signout.approve'          granted per student on /roster
--   attendance_events.note                the sign-out note, on an OUT
--   attendance_events.cleanup_confirmed   "my area is clean", on an OUT
--   public.signout_requests               one pending request per member
--   public.meeting_checkins               one row per meeting and member
--   request_signout(note, cleanup, location, source)   the student asks
--   withdraw_signout()                    the student keeps working
--   approve_signout(request), approve_all_signouts()   an approver signs out
--   return_signout(request, reason)       an approver sends it back
--   meeting_checkin(event)                logs present or late
--   switch_to_fll(location, geo_ok, note) closes the build session, opens FLL
--   can_approve_signouts()                staff, or holds signout.approve
--   attendance_events_self_out guard      a non-staff member cannot write
--                                         their own OUT on a build session
--
-- BEFORE THIS FILE the app checks out exactly as it always has. After it, the
-- app detects the new functions (src/signout.js) and switches to requests.
--
-- WHAT IT ASSUMES IS ALREADY THERE:
--   public.attendance_events, public.profiles, public.events
--   public.is_staff()            supabase/skills_catalog.sql
--   public.has_capability(text)  supabase/migrations/0004_member_permissions.sql
--
-- TO REVERSE:
--   drop trigger if exists attendance_events_self_out on public.attendance_events;
--   drop function if exists public.attendance_events_self_out_guard();
--   drop table if exists public.signout_requests;
--   drop table if exists public.meeting_checkins;
--   drop function if exists public.request_signout(text, boolean, text, text);
--   drop function if exists public.withdraw_signout();
--   drop function if exists public.approve_signout(uuid);
--   drop function if exists public.approve_all_signouts();
--   drop function if exists public.return_signout(uuid, text);
--   drop function if exists public.meeting_checkin(uuid);
--   drop function if exists public.switch_to_fll(text, boolean, text);
--   drop function if exists public.can_approve_signouts();
--   delete from public.capabilities where key = 'signout.approve';
--   (the two attendance_events columns may stay; nothing else reads them)
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regprocedure('public.is_staff()') is null then
    raise exception '0014_session_signout: public.is_staff() does not exist. Apply supabase/skills_catalog.sql first.';
  end if;
  if to_regprocedure('public.has_capability(text)') is null then
    raise exception '0014_session_signout: public.has_capability(text) does not exist. Apply 0004_member_permissions.sql first.';
  end if;
end
$pre$;

-- ── 1. The capability ────────────────────────────────────────────────────────
insert into public.capabilities (key, label, description) values
  ('signout.approve', 'Can approve sign-outs',
   'Approve or send back other members'' sign-out requests. Never their own. Staff can already do this.')
on conflict (key) do nothing;

create or replace function public.can_approve_signouts()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_staff() or public.has_capability('signout.approve');
$fn$;
revoke execute on function public.can_approve_signouts() from public, anon;
grant execute on function public.can_approve_signouts() to authenticated;

-- ── 2. The note on an OUT ────────────────────────────────────────────────────
alter table public.attendance_events add column if not exists note text;
alter table public.attendance_events add column if not exists cleanup_confirmed boolean;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_events_note_len_chk') then
    alter table public.attendance_events
      add constraint attendance_events_note_len_chk check (note is null or length(note) <= 1000);
  end if;
end
$c$;

-- ── 3. Sign-out requests ─────────────────────────────────────────────────────
create table if not exists public.signout_requests (
  id                uuid        primary key default gen_random_uuid(),
  member_id         uuid        not null references public.profiles(id) on delete cascade,
  in_event_id       uuid        references public.attendance_events(id) on delete set null,
  note              text        not null,
  cleanup_confirmed boolean     not null default false,
  location          text,
  source            text        not null default 'nfc',
  status            text        not null default 'pending',
  requested_at      timestamptz not null default now(),
  decided_by        uuid        references public.profiles(id) on delete set null,
  decided_at        timestamptz,
  reason            text,
  out_event_id      uuid        references public.attendance_events(id) on delete set null
);

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'signout_requests_status_chk') then
    alter table public.signout_requests
      add constraint signout_requests_status_chk check (status in ('pending', 'approved', 'returned', 'withdrawn'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'signout_requests_source_chk') then
    alter table public.signout_requests
      add constraint signout_requests_source_chk check (source in ('nfc', 'button'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'signout_requests_note_chk') then
    alter table public.signout_requests
      add constraint signout_requests_note_chk check (length(btrim(note)) between 3 and 1000);
  end if;
end
$c$;

-- One open request per member: a second tap shows the first, never a second row.
create unique index if not exists signout_requests_one_pending_idx
  on public.signout_requests (member_id) where status = 'pending';
create index if not exists signout_requests_status_idx
  on public.signout_requests (status, requested_at);

alter table public.signout_requests enable row level security;

drop policy if exists "sr select own or approver" on public.signout_requests;
create policy "sr select own or approver"
  on public.signout_requests for select to authenticated
  using (member_id = auth.uid() or public.can_approve_signouts());

-- Nobody writes the table directly; the functions below are the only writers.
grant select on public.signout_requests to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.signout_requests from authenticated;
revoke all on public.signout_requests from anon;

-- ── 4. The student asks ──────────────────────────────────────────────────────
-- The open session is the newest event when it is an IN. A request with no
-- open session is refused, so a stale tab cannot queue a sign-out for nothing.
create or replace function public.request_signout(p_note text, p_cleanup boolean, p_location text, p_source text default 'nfc')
returns public.signout_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_last record;
  v_row  public.signout_requests;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'Write a short note of what you did' using errcode = '22023';
  end if;
  select id, type into v_last from public.attendance_events
   where user_id = v_uid order by event_time desc limit 1;
  if v_last.id is null or v_last.type <> 'in' then
    raise exception 'You are not signed in' using errcode = 'P0002';
  end if;
  select * into v_row from public.signout_requests where member_id = v_uid and status = 'pending';
  if found then return v_row; end if;
  insert into public.signout_requests (member_id, in_event_id, note, cleanup_confirmed, location, source)
  values (v_uid, v_last.id, btrim(p_note), coalesce(p_cleanup, false), p_location,
          case when p_source = 'button' then 'button' else 'nfc' end)
  returning * into v_row;
  return v_row;
end;
$fn$;

create or replace function public.withdraw_signout()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare n integer;
begin
  update public.signout_requests set status = 'withdrawn', decided_at = now()
   where member_id = auth.uid() and status = 'pending';
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- ── 5. An approver decides ───────────────────────────────────────────────────
-- Approving writes the OUT at the moment of approval: hours stop then.
create or replace function public.approve_signout(p_request uuid)
returns public.signout_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_req public.signout_requests;
  v_out uuid;
begin
  if not public.can_approve_signouts() then
    raise exception 'Only a mentor or a permitted student can approve sign-outs' using errcode = '42501';
  end if;
  select * into v_req from public.signout_requests where id = p_request for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if v_req.member_id = auth.uid() then
    raise exception 'You cannot approve your own sign-out' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then return v_req; end if;
  -- Still signed in? If the session was closed meanwhile, just close the request.
  if (select e.type from public.attendance_events e
       where e.user_id = v_req.member_id order by e.event_time desc limit 1) = 'in' then
    insert into public.attendance_events (user_id, type, location, method, note, cleanup_confirmed)
    values (v_req.member_id, 'out', coalesce(v_req.location, 'approved'), 'manual', v_req.note, v_req.cleanup_confirmed)
    returning id into v_out;
  end if;
  update public.signout_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), out_event_id = v_out
   where id = p_request
  returning * into v_req;
  return v_req;
end;
$fn$;

create or replace function public.approve_all_signouts()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare r record; n integer := 0;
begin
  if not public.can_approve_signouts() then
    raise exception 'Only a mentor or a permitted student can approve sign-outs' using errcode = '42501';
  end if;
  for r in select id from public.signout_requests
            where status = 'pending' and member_id <> auth.uid()
            order by requested_at loop
    perform public.approve_signout(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

create or replace function public.return_signout(p_request uuid, p_reason text)
returns public.signout_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare v_req public.signout_requests;
begin
  if not public.can_approve_signouts() then
    raise exception 'Only a mentor or a permitted student can send a sign-out back' using errcode = '42501';
  end if;
  update public.signout_requests
     set status = 'returned', decided_by = auth.uid(), decided_at = now(),
         reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_request and status = 'pending' and member_id <> auth.uid()
  returning * into v_req;
  if not found then raise exception 'No pending request to send back' using errcode = 'P0002'; end if;
  return v_req;
end;
$fn$;

revoke execute on function public.request_signout(text, boolean, text, text) from public, anon;
revoke execute on function public.withdraw_signout() from public, anon;
revoke execute on function public.approve_signout(uuid) from public, anon;
revoke execute on function public.approve_all_signouts() from public, anon;
revoke execute on function public.return_signout(uuid, text) from public, anon;
grant execute on function public.request_signout(text, boolean, text, text) to authenticated;
grant execute on function public.withdraw_signout() to authenticated;
grant execute on function public.approve_signout(uuid) to authenticated;
grant execute on function public.approve_all_signouts() to authenticated;
grant execute on function public.return_signout(uuid, text) to authenticated;

-- ── 6. A non-staff member cannot close their own build session ───────────────
-- They ask instead (request_signout). FLL (volunteer) sessions still close
-- with a direct OUT, as the handbook says. Staff, the approve functions (which
-- run as the approver), and server jobs (no auth.uid()) are unaffected.
create or replace function public.attendance_events_self_out_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_cat text;
begin
  if new.type <> 'out' or auth.uid() is null or new.user_id <> auth.uid() or public.is_staff() then
    return new;
  end if;
  -- switch_to_fll sets this for its own transaction only. A client cannot set
  -- it: every PostgREST request is its own transaction and set_config is not
  -- exposed.
  if current_setting('app.signout_switch', true) = 'on' then return new; end if;
  select category into v_cat from public.attendance_events
   where user_id = new.user_id and type = 'in'
   order by event_time desc limit 1;
  if coalesce(v_cat, 'build') = 'volunteer' then return new; end if;
  raise exception 'Sign-outs need approval: scan out and leave a note' using errcode = '42501';
end;
$fn$;
revoke execute on function public.attendance_events_self_out_guard() from public, anon, authenticated;

drop trigger if exists attendance_events_self_out on public.attendance_events;
create trigger attendance_events_self_out
  before insert on public.attendance_events
  for each row execute function public.attendance_events_self_out_guard();

-- ── 6b. Switch to FLL ────────────────────────────────────────────────────────
-- The handbook: Switch to FLL ends the build session with credit. One call
-- writes the OUT on the build session (with the note) and the volunteer IN, so
-- the two cannot come apart.
create or replace function public.switch_to_fll(p_location text, p_geo_ok boolean, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_last record;
  v_in   uuid;
  v_at   timestamptz;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select id, type, category, event_time into v_last from public.attendance_events
   where user_id = v_uid order by event_time desc limit 1;
  if v_last.id is null or v_last.type <> 'in' or coalesce(v_last.category, 'build') = 'volunteer' then
    raise exception 'No build session to switch from' using errcode = 'P0002';
  end if;
  -- Never before the IN it closes, and the volunteer IN strictly after it.
  v_at := greatest(now(), v_last.event_time + interval '1 millisecond');
  perform set_config('app.signout_switch', 'on', true);
  insert into public.attendance_events (user_id, type, location, method, event_time, note)
  values (v_uid, 'out', coalesce(p_location, 'fll-room'), 'nfc', v_at,
          coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Switched to FLL'));
  perform set_config('app.signout_switch', 'off', true);
  insert into public.attendance_events (user_id, type, location, method, category, geo_ok, event_time)
  values (v_uid, 'in', coalesce(p_location, 'fll-room'), 'nfc', 'volunteer', p_geo_ok, v_at + interval '1 millisecond')
  returning id into v_in;
  -- A pending build sign-out has nothing left to approve.
  update public.signout_requests set status = 'withdrawn', decided_at = now()
   where member_id = v_uid and status = 'pending';
  return v_in;
end;
$fn$;
revoke execute on function public.switch_to_fll(text, boolean, text) from public, anon;
grant execute on function public.switch_to_fll(text, boolean, text) to authenticated;

-- ── 7. Meeting check-in ──────────────────────────────────────────────────────
create table if not exists public.meeting_checkins (
  event_id   uuid        not null references public.events(id) on delete cascade,
  member_id  uuid        not null references public.profiles(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  status     text        not null,
  primary key (event_id, member_id)
);

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'meeting_checkins_status_chk') then
    alter table public.meeting_checkins
      add constraint meeting_checkins_status_chk check (status in ('present', 'late'));
  end if;
end
$c$;

alter table public.meeting_checkins enable row level security;

drop policy if exists "mc select own or staff" on public.meeting_checkins;
create policy "mc select own or staff"
  on public.meeting_checkins for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

grant select on public.meeting_checkins to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.meeting_checkins from authenticated;
revoke all on public.meeting_checkins from anon;

-- Present within the first 15 minutes, late after that, refused outside the
-- meeting. The first scan counts; a later one returns the row already there.
create or replace function public.meeting_checkin(p_event uuid)
returns public.meeting_checkins
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ev  record;
  v_row public.meeting_checkins;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select id, kind, starts_at, ends_at into v_ev from public.events where id = p_event;
  if v_ev.id is null or v_ev.kind <> 'meeting' then
    raise exception 'Not a team meeting' using errcode = 'P0002';
  end if;
  if now() < v_ev.starts_at or now() > v_ev.ends_at then
    raise exception 'The meeting is not on right now' using errcode = '22023';
  end if;
  insert into public.meeting_checkins (event_id, member_id, scanned_at, status)
  values (p_event, auth.uid(), now(),
          case when now() <= v_ev.starts_at + interval '15 minutes' then 'present' else 'late' end)
  on conflict (event_id, member_id) do nothing;
  select * into v_row from public.meeting_checkins where event_id = p_event and member_id = auth.uid();
  return v_row;
end;
$fn$;
revoke execute on function public.meeting_checkin(uuid) from public, anon;
grant execute on function public.meeting_checkin(uuid) to authenticated;
