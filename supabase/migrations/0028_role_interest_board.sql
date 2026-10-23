-- ============================================================
-- 0028_role_interest_board: time slots and role requests per event day, so
-- the team can see interest and fill every slot (ledger 0017, part D1)
--
-- Run once in the Supabase SQL editor, AFTER 0016 (event rosters). Re-runnable.
--
-- WHY. Mr. Pina: "a comprehensive system for scheduling everybody concretely
-- for different roles. Let's do it by interest ... anyone should be able to
-- open up this page and put in a request for a role during the day for any
-- time slot, and they can see who else has put in a request and how much
-- interest there is in time slots."
--
-- WHAT THIS ADDS.
--   event_roles.role gains 'battery_captain' (the check is replaced with the
--     same eleven roles plus that one; nothing else about event_roles changes).
--   role_slots       per competition event: a day, a label, start and end
--                    times, and per role how many are needed (jsonb
--                    {role: count}). Staff only, through staff_save_slot /
--                    staff_delete_slot / staff_apply_slot_template.
--   role_requests    a member's request for one role in one slot. Approved
--                    active students and staff, for themselves, through
--                    role_request / role_withdraw. One per member per slot
--                    and role. Withdrawn requests are deleted (a request is
--                    interest, not a record; the roster is the record).
--   role_board(event)   the whole board as JSON for one event: slots, needs,
--                    every request with the member's name, the assigned
--                    roles from event_roles, and per cell requested, needed,
--                    assigned and state (unfilled | covered | over).
--   staff_assign_from_request(request)   staff: turns a request into an
--                    assignment through staff_assign_role, so the
--                    event_role_blocker eligibility check runs and event_roles
--                    stays the single record of who does what.
--   staff_apply_slot_template(event, template)   a saved template (Beach Blitz seeded) builds
--                    the Beach Blitz slots on the event's own dates.
--   role_board_open_events()   upcoming competition events with unfilled
--                    cells, for Home's Do this now.
--
-- WHO. Every approved active student and staff member reads the board and
-- requests for themselves. Parent-only accounts read nothing. Staff define
-- slots and assign. No client may write either table directly.
--
-- TO UNDO (before real use): drop function public.role_board(uuid),
-- public.role_board_open_events(), public.role_request(uuid, text),
-- public.role_withdraw(uuid, text), public.staff_save_slot(uuid, uuid, date,
-- text, timestamptz, timestamptz, jsonb, integer), public.staff_delete_slot(uuid),
-- public.staff_assign_from_request(uuid, text), public.staff_apply_slot_template(uuid, text),
-- public._role_board_member_ok(), public._role_slot_cells(uuid);
-- drop table public.role_requests, public.role_slots; put the 0016 role check
-- back (only if no event_roles row says battery_captain); paste
-- _merge_member_rules from 0026 again.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public.staff_assign_role(uuid, uuid, text, text)') is null then
    raise exception '0028 needs 0016_event_rosters.sql applied first';
  end if;
end
$prereq$;

-- ── 1. battery captain joins the role list ───────────────────────────────
do $roles$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.event_roles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%driver%operator%' loop
    execute format('alter table public.event_roles drop constraint %I', c);
  end loop;
  alter table public.event_roles add constraint event_roles_role_check check (role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew',
    'impact_presenter', 'pit_speaker', 'scouting_lead', 'scout', 'media', 'safety_captain', 'battery_captain'));
end
$roles$;

-- ── 2. tables ────────────────────────────────────────────────────────────
create table if not exists public.role_slots (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events(id) on delete cascade,
  day        date        not null,
  label      text        not null check (length(btrim(label)) between 1 and 80),
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  needs      jsonb       not null default '{}'::jsonb check (jsonb_typeof(needs) = 'object'),
  position   integer     not null default 0,
  match_from integer     check (match_from is null or match_from between 1 and 999),
  match_to   integer     check (match_to is null or match_to between 1 and 999),
  created_by uuid        references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (match_to is null or match_from is not null and match_to >= match_from)
);
-- A slot for match play names its matches (Q13 to Q24); its clock times are
-- estimates that follow the event's match clock (event_match_clock below).
alter table public.role_slots add column if not exists match_from integer;
alter table public.role_slots add column if not exists match_to integer;
create index if not exists role_slots_event_idx on public.role_slots (event_id, day, starts_at);

create table if not exists public.role_requests (
  id         uuid        primary key default gen_random_uuid(),
  slot_id    uuid        not null references public.role_slots(id) on delete cascade,
  member_id  uuid        not null references public.profiles(id) on delete cascade,
  role       text        not null,
  created_at timestamptz not null default now(),
  unique (slot_id, member_id, role)
);
create index if not exists role_requests_member_idx on public.role_requests (member_id);

create or replace function public._role_board_member_ok()
returns boolean language sql stable security definer set search_path = public as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.approved and coalesce(p.status, 'active') = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin'))
       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')
            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));
$fn$;
revoke all on function public._role_board_member_ok() from public, anon;
grant execute on function public._role_board_member_ok() to authenticated;

create or replace function public._role_valid(p_role text)
returns boolean language sql immutable set search_path = public as $fn$
  select p_role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew', 'impact_presenter', 'pit_speaker',
                    'scouting_lead', 'scout', 'media', 'safety_captain', 'battery_captain');
$fn$;

alter table public.role_slots enable row level security;
alter table public.role_requests enable row level security;
revoke all on public.role_slots, public.role_requests from public, anon, authenticated;
grant select on public.role_slots, public.role_requests to authenticated;
drop policy if exists role_slots_read on public.role_slots;
create policy role_slots_read on public.role_slots for select to authenticated using ((select public._role_board_member_ok()));
drop policy if exists role_requests_read on public.role_requests;
create policy role_requests_read on public.role_requests for select to authenticated using ((select public._role_board_member_ok()));

-- ── 3. the board ─────────────────────────────────────────────────────────
-- A cell is (slot, role). requested counts every request; assigned counts
-- event_roles rows for that role at the event whose member requested this
-- slot or who holds the role for the whole event (event_roles has no slot).
-- state: unfilled when requests (or assignments) are fewer than needed,
-- covered when equal, over when more.
-- Does: Read the role interest board for an event: time slots, how many of each role are needed, who asked for each, and what is still unfilled.
create or replace function public.role_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare ev record;
begin
  if not public._role_board_member_ok() then raise exception 'The role board is for approved students and staff.' using errcode = '42501'; end if;
  select id, title, starts_at, ends_at, kind into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'title', ev.title, 'starts_at', ev.starts_at, 'ends_at', ev.ends_at, 'kind', ev.kind),
    'can_manage', public.is_staff(),
    'can_set_clock', public._event_clock_ok(p_event),
    'clock', (select to_jsonb(c) - 'set_by' || jsonb_build_object('set_by_name', public._member_name(c.set_by)) from public.event_match_clock c where c.event_id = p_event),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slots', jsonb_array_length(t.slots)) order by t.name) from public.role_slot_templates t), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'day', s.day, 'label', s.label, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'needs', s.needs, 'position', s.position,
        'match_from', s.match_from, 'match_to', s.match_to,
        'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'member_id', r.member_id, 'name', public._member_name(r.member_id), 'role', r.role,
                                 'assigned', exists (select 1 from public.event_roles er where er.event_id = s.event_id and er.member_id = r.member_id and er.role = r.role)) order by r.created_at)
                              from public.role_requests r where r.slot_id = s.id), '[]'::jsonb))
        order by s.day, s.starts_at, s.position) from public.role_slots s where s.event_id = p_event), '[]'::jsonb),
    'assigned', coalesce((select jsonb_agg(jsonb_build_object('member_id', er.member_id, 'name', public._member_name(er.member_id), 'role', er.role))
                            from public.event_roles er where er.event_id = p_event and (public.is_staff() or exists (select 1 from public.event_rosters x where x.event_id = p_event))), '[]'::jsonb),
    'me', auth.uid());
end
$fn$;

-- Unfilled cells for one event (needed > requested), used by the Home list.
create or replace function public._role_slot_cells(p_event uuid)
returns table (slot_id uuid, day date, label text, role text, needed integer, requested integer) language sql stable security definer set search_path = public as $fn$
  select s.id, s.day, s.label, n.key, (n.value #>> '{}')::integer,
         (select count(*)::integer from public.role_requests r where r.slot_id = s.id and r.role = n.key)
    from public.role_slots s cross join lateral jsonb_each(s.needs) n
   where s.event_id = p_event and jsonb_typeof(n.value) = 'number' and (n.value #>> '{}')::integer > 0;
$fn$;
revoke all on function public._role_slot_cells(uuid) from public, anon, authenticated;

-- Does: Upcoming competitions whose role board still has unfilled slots, with how many cells are unfilled.
create or replace function public.role_board_open_events()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public._role_board_member_ok() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'title', e.title, 'starts_at', e.starts_at,
             'unfilled', (select count(*) from public._role_slot_cells(e.id) c where c.requested < c.needed),
             'mine', (select count(*) from public.role_requests r join public.role_slots s on s.id = r.slot_id where s.event_id = e.id and r.member_id = auth.uid()))
             order by e.starts_at)
    from public.events e
   where e.ends_at > now() and e.starts_at < now() + interval '21 days'
     and exists (select 1 from public.role_slots s where s.event_id = e.id)
     and exists (select 1 from public._role_slot_cells(e.id) c where c.requested < c.needed)), '[]'::jsonb);
end
$fn$;

-- ── 4. requests ──────────────────────────────────────────────────────────
-- Does: Ask for a role in one time slot of an event; several are allowed, and anyone can see who asked.
create or replace function public.role_request(p_slot uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.role_requests; s public.role_slots;
begin
  if not public._role_board_member_ok() then raise exception 'The role board is for approved students and staff.' using errcode = '42501'; end if;
  if not public._role_valid(p_role) then raise exception 'Unknown role.' using errcode = '22023'; end if;
  select * into s from public.role_slots where id = p_slot;
  if s.id is null then raise exception 'No such time slot.' using errcode = 'P0002'; end if;
  if not (s.needs ? p_role) then raise exception 'That role is not needed in this slot.' using errcode = '22023'; end if;
  if coalesce(s.ends_at, s.starts_at) < now() - interval '1 hour' then raise exception 'That time slot is over.' using errcode = '22023'; end if;
  insert into public.role_requests (slot_id, member_id, role) values (p_slot, auth.uid(), p_role)
  on conflict (slot_id, member_id, role) do update set role = excluded.role
  returning * into r;
  return to_jsonb(r);
end
$fn$;

-- Does: Take back your own request for a role in a time slot.
create or replace function public.role_withdraw(p_slot uuid, p_role text)
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if not public._role_board_member_ok() then raise exception 'The role board is for approved students and staff.' using errcode = '42501'; end if;
  delete from public.role_requests where slot_id = p_slot and role = p_role and member_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end
$fn$;

-- ── 5. staff ─────────────────────────────────────────────────────────────
create or replace function public._role_needs_ok(p_needs jsonb)
returns boolean language sql immutable set search_path = public as $fn$
  select jsonb_typeof(p_needs) = 'object' and not exists (
    select 1 from jsonb_each(p_needs) n
     where not public._role_valid(n.key) or jsonb_typeof(n.value) <> 'number' or (n.value #>> '{}') !~ '^[0-9]{1,2}$');
$fn$;

-- Does: Add or change a time slot on an event day, with how many of each role it needs. Staff only.
create or replace function public.staff_save_slot(p_id uuid, p_event uuid, p_day date, p_label text, p_starts_at timestamptz,
  p_ends_at timestamptz default null, p_needs jsonb default '{}'::jsonb, p_position integer default 0,
  p_match_from integer default null, p_match_to integer default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare s public.role_slots;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event) then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 80 then raise exception 'Give the slot a label.' using errcode = '22023'; end if;
  if p_starts_at is null or (p_ends_at is not null and p_ends_at <= p_starts_at) then raise exception 'The end must be after the start.' using errcode = '22023'; end if;
  if not public._role_needs_ok(coalesce(p_needs, '{}'::jsonb)) then raise exception 'Needs are known roles with a count from 0 to 99.' using errcode = '22023'; end if;
  if p_match_to is not null and (p_match_from is null or p_match_to < p_match_from) or p_match_from is not null and p_match_from not between 1 and 999 then
    raise exception 'Matches run from a first to a last number, such as 13 to 24.' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.role_slots (event_id, day, label, starts_at, ends_at, needs, position, match_from, match_to, created_by)
    values (p_event, p_day, btrim(p_label), p_starts_at, p_ends_at, coalesce(p_needs, '{}'::jsonb), coalesce(p_position, 0), p_match_from, coalesce(p_match_to, p_match_from), auth.uid()) returning * into s;
  else
    update public.role_slots set day = p_day, label = btrim(p_label), starts_at = p_starts_at, ends_at = p_ends_at,
           needs = coalesce(p_needs, '{}'::jsonb), position = coalesce(p_position, 0), match_from = p_match_from, match_to = coalesce(p_match_to, p_match_from), updated_at = now()
     where id = p_id and event_id = p_event returning * into s;
    if s.id is null then raise exception 'No such time slot.' using errcode = 'P0002'; end if;
  end if;
  return to_jsonb(s);
end
$fn$;

-- Does: Remove a time slot and its requests. Staff only.
create or replace function public.staff_delete_slot(p_slot uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  delete from public.role_slots where id = p_slot;
  get diagnostics n = row_count;
  return n;
end
$fn$;

-- Does: Turn a role request into an assignment on the event roster, after the eligibility check. Staff only.
create or replace function public.staff_assign_from_request(p_request uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.role_requests; s public.role_slots; v public.event_roles;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into r from public.role_requests where id = p_request;
  if r.id is null then raise exception 'No such request.' using errcode = 'P0002'; end if;
  select * into s from public.role_slots where id = r.slot_id;
  -- The one assignment path: staff_assign_role runs event_role_blocker and
  -- writes event_roles, so the posted roster stays the single record.
  v := public.staff_assign_role(s.event_id, r.member_id, r.role,
         coalesce(nullif(btrim(p_reason), ''), 'Asked for it on the role board (' || s.label || ')'));
  return to_jsonb(v);
end
$fn$;

-- ── 6. slot templates are data (E1: nothing hard-coded to one event) ────
-- A template is a saved list of slots: day offset from the event's first
-- day (Los Angeles), label, start and end as HH:MM, needs, and for match play
-- the match numbers. Beach Blitz 2026 is the first saved template; staff save
-- any event's slots as a new template and apply any template to any event.
create table if not exists public.role_slot_templates (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique check (length(btrim(name)) between 1 and 80),
  slots      jsonb       not null check (jsonb_typeof(slots) = 'array'),
  created_by uuid        references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.role_slot_templates enable row level security;
revoke all on public.role_slot_templates from public, anon, authenticated;
grant select on public.role_slot_templates to authenticated;
drop policy if exists role_slot_templates_read on public.role_slot_templates;
create policy role_slot_templates_read on public.role_slot_templates for select to authenticated using ((select public._role_board_member_ok()));

-- The Beach Blitz 2026 schedule as Mr. Pina gave it (2026-10-23). Match
-- numbers on the qualification blocks are a proposed split of ten per block,
-- edited on the board once the real schedule is out; times are estimates.
insert into public.role_slot_templates (name, slots) values ('Beach Blitz (3 days, Friday load-in)', $tpl$[
 {"day":0,"label":"Cars leave","start":"15:15","needs":{"safety_captain":1}},
 {"day":0,"label":"Load-in and pit setup","start":"17:00","end":"19:45","needs":{"pit_crew":3,"battery_captain":1,"safety_captain":1}},
 {"day":0,"label":"Inspection","start":"18:00","end":"18:30","needs":{"pit_crew":3,"driver":1,"battery_captain":1}},
 {"day":0,"label":"Practice matches 1","start":"18:30","end":"19:30","needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":0,"label":"Practice matches 2","start":"19:30","end":"20:30","needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":1,"label":"Qualifications 1","start":"09:35","end":"10:45","match_from":1,"match_to":10,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":1,"label":"Qualifications 2","start":"10:45","end":"12:00","match_from":11,"match_to":20,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":1,"label":"Qualifications 3","start":"13:00","end":"14:15","match_from":21,"match_to":30,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":1,"label":"Qualifications 4","start":"14:15","end":"15:30","match_from":31,"match_to":40,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":1,"label":"Qualifications 5","start":"15:30","end":"16:45","match_from":41,"match_to":50,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":1,"label":"Qualifications 6","start":"16:45","end":"18:00","match_from":51,"match_to":60,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":2,"label":"Qualifications 7","start":"08:30","end":"09:50","match_from":61,"match_to":70,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":2,"label":"Qualifications 8","start":"09:50","end":"11:15","match_from":71,"match_to":80,"needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":2,"label":"Alliance selection","start":"11:25","needs":{"scouting_lead":1,"drive_coach":1,"scout":2}},
 {"day":2,"label":"Playoffs 1","start":"13:00","end":"15:00","needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}},
 {"day":2,"label":"Playoffs 2","start":"15:00","end":"17:15","needs":{"scout":6,"scouting_lead":1,"driver":1,"operator":1,"human_player":1,"drive_coach":1,"pit_crew":3,"battery_captain":1}}
]$tpl$::jsonb) on conflict (name) do nothing;

-- Does: Build an event's time slots from a saved template in one step. Staff only; a slot with the same day and label is kept.
create or replace function public.staff_apply_slot_template(p_event uuid, p_template uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare ev record; d0 date; n integer := 0; t record; tpl public.role_slot_templates; d date;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select id, starts_at into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  select * into tpl from public.role_slot_templates where id = p_template;
  if tpl.id is null then raise exception 'No such template.' using errcode = 'P0002'; end if;
  d0 := (ev.starts_at at time zone 'America/Los_Angeles')::date;
  for t in select e.value as x, e.pos from jsonb_array_elements(tpl.slots) with ordinality as e(value, pos) loop
    d := d0 + coalesce((t.x ->> 'day')::integer, 0);
    if not exists (select 1 from public.role_slots s where s.event_id = p_event and s.label = t.x ->> 'label' and s.day = d) then
      if not public._role_needs_ok(coalesce(t.x -> 'needs', '{}'::jsonb)) then raise exception 'The template has a slot with unknown roles.' using errcode = '22023'; end if;
      insert into public.role_slots (event_id, day, label, starts_at, ends_at, needs, position, match_from, match_to, created_by)
      values (p_event, d, t.x ->> 'label',
              (d::text || ' ' || (t.x ->> 'start'))::timestamp at time zone 'America/Los_Angeles',
              case when t.x ? 'end' then (d::text || ' ' || (t.x ->> 'end'))::timestamp at time zone 'America/Los_Angeles' end,
              coalesce(t.x -> 'needs', '{}'::jsonb), t.pos, (t.x ->> 'match_from')::integer, (t.x ->> 'match_to')::integer, auth.uid());
      n := n + 1;
    end if;
  end loop;
  return n;
end
$fn$;

-- Does: Save an event's time slots as a reusable template under a name. Staff only.
create or replace function public.staff_save_slot_template(p_event uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare ev record; d0 date; tpl public.role_slot_templates;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Name the template.' using errcode = '22023'; end if;
  select id, starts_at into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.role_slots where event_id = p_event) then raise exception 'This event has no slots to save.' using errcode = '22023'; end if;
  d0 := (ev.starts_at at time zone 'America/Los_Angeles')::date;
  insert into public.role_slot_templates (name, slots, created_by)
  select btrim(p_name), jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day', s.day - d0, 'label', s.label,
           'start', to_char(s.starts_at at time zone 'America/Los_Angeles', 'HH24:MI'),
           'end', to_char(s.ends_at at time zone 'America/Los_Angeles', 'HH24:MI'),
           'match_from', s.match_from, 'match_to', s.match_to, 'needs', s.needs)) order by s.day, s.starts_at, s.position), auth.uid()
    from public.role_slots s where s.event_id = p_event
  on conflict (name) do update set slots = excluded.slots
  returning * into tpl;
  return jsonb_build_object('id', tpl.id, 'name', tpl.name, 'slots', jsonb_array_length(tpl.slots));
end
$fn$;

-- ── 7. the match clock (E4: schedules slip) ───────────────────────────────
-- One row per event: the match the field is on now, how far behind the
-- printed schedule it runs, and the minutes per match cycle used to estimate
-- later matches. Set by staff or the event's scouting lead from a phone. The
-- manual setting always wins; 'source' says where the last value came from.
create table if not exists public.event_match_clock (
  event_id      uuid        primary key references public.events(id) on delete cascade,
  current_match integer     check (current_match is null or current_match between 0 and 999),
  behind_minutes integer    not null default 0 check (behind_minutes between -240 and 600),
  cycle_minutes numeric(4,1) not null default 7 check (cycle_minutes between 2 and 30),
  source        text        not null default 'manual' check (source in ('manual', 'nexus', 'tba')),
  set_by        uuid        references public.profiles(id) on delete set null,
  set_at        timestamptz not null default now()
);
alter table public.event_match_clock enable row level security;
revoke all on public.event_match_clock from public, anon, authenticated;
grant select on public.event_match_clock to authenticated;
drop policy if exists event_match_clock_read on public.event_match_clock;
create policy event_match_clock_read on public.event_match_clock for select to authenticated using ((select public._role_board_member_ok()));

create or replace function public._event_clock_ok(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public._role_board_member_ok() and (public.is_staff()
    or exists (select 1 from public.event_roles r where r.event_id = p_event and r.member_id = auth.uid() and r.role = 'scouting_lead')
    or (to_regprocedure('public.has_capability(text)') is not null and public.has_capability('scouting.manage')));
$fn$;
revoke all on function public._event_clock_ok(uuid) from public, anon;
grant execute on function public._event_clock_ok(uuid) to authenticated;

-- Does: Set where an event's matches really are: the match on the field now, minutes behind schedule, minutes per match. Staff or the scouting lead.
create or replace function public.event_clock_set(p_event uuid, p_current_match integer default null, p_behind_minutes integer default null,
  p_cycle_minutes numeric default null, p_source text default 'manual')
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare c public.event_match_clock;
begin
  if not public._event_clock_ok(p_event) then raise exception 'Only staff or the scouting lead set the match clock.' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event) then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if coalesce(p_source, 'manual') not in ('manual', 'nexus', 'tba') then raise exception 'Source is manual, nexus or tba.' using errcode = '22023'; end if;
  if p_current_match is not null and p_current_match not between 0 and 999 then raise exception 'Match is 0 to 999.' using errcode = '22023'; end if;
  if p_behind_minutes is not null and p_behind_minutes not between -240 and 600 then raise exception 'Behind is -240 to 600 minutes.' using errcode = '22023'; end if;
  if p_cycle_minutes is not null and p_cycle_minutes not between 2 and 30 then raise exception 'A match cycle is 2 to 30 minutes.' using errcode = '22023'; end if;
  insert into public.event_match_clock (event_id, current_match, behind_minutes, cycle_minutes, source, set_by, set_at)
  values (p_event, p_current_match, coalesce(p_behind_minutes, 0), coalesce(p_cycle_minutes, 7), coalesce(p_source, 'manual'), auth.uid(), now())
  on conflict (event_id) do update set
    current_match = coalesce(excluded.current_match, event_match_clock.current_match),
    behind_minutes = case when p_behind_minutes is null then event_match_clock.behind_minutes else excluded.behind_minutes end,
    cycle_minutes = case when p_cycle_minutes is null then event_match_clock.cycle_minutes else excluded.cycle_minutes end,
    source = excluded.source, set_by = excluded.set_by, set_at = now()
  returning * into c;
  return to_jsonb(c);
end
$fn$;

revoke all on function public.role_board(uuid), public.role_board_open_events(), public.role_request(uuid, text), public.role_withdraw(uuid, text),
  public.staff_save_slot(uuid, uuid, date, text, timestamptz, timestamptz, jsonb, integer, integer, integer), public.staff_delete_slot(uuid),
  public.staff_assign_from_request(uuid, text), public.staff_apply_slot_template(uuid, uuid), public.staff_save_slot_template(uuid, text),
  public.event_clock_set(uuid, integer, integer, numeric, text) from public, anon;
grant execute on function public.role_board(uuid), public.role_board_open_events(), public.role_request(uuid, text), public.role_withdraw(uuid, text),
  public.staff_save_slot(uuid, uuid, date, text, timestamptz, timestamptz, jsonb, integer, integer, integer), public.staff_delete_slot(uuid),
  public.staff_assign_from_request(uuid, text), public.staff_apply_slot_template(uuid, uuid), public.staff_save_slot_template(uuid, text),
  public.event_clock_set(uuid, integer, integer, numeric, text) to authenticated;
revoke all on function public._role_valid(text), public._role_needs_ok(jsonb) from public, anon;

-- ============================================================
-- PART D2: auto routines and their runs (ledger 0017)
-- Mr. Pina: "Autos have to work more than twice in a row. We need some kind
-- of a function to log that, preferably in the app so it's documented and
-- organized." The streak and the competition-ready mark are computed in the
-- app (src/autos.js, AUTO_READY_STREAK = 5, a proposed default), never stored.
-- Same people as the battery log: approved active students and staff log and
-- read; parents nothing; a member edits their own run for 24 hours; staff
-- add, edit and retire routines. Nothing deleted.
-- ============================================================
create table if not exists public.auto_routines (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null check (length(btrim(name)) between 1 and 60),
  start_position text       check (start_position is null or length(start_position) <= 60),
  description   text        check (description is null or length(description) <= 1000),
  active        boolean     not null default true,
  created_by    uuid        references public.profiles(id) on delete set null,
  updated_by    uuid        references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists auto_routines_name_key on public.auto_routines (lower(btrim(name)));
create table if not exists public.auto_runs (
  id          uuid        primary key default gen_random_uuid(),
  routine_id  uuid        not null references public.auto_routines(id) on delete restrict,
  member_id   uuid        not null references public.profiles(id) on delete restrict,
  ran_at      timestamptz not null default now(),
  result      text        not null check (result in ('success', 'partial', 'fail')),
  problem     text        check (problem is null or length(problem) <= 500),
  battery_id  uuid        references public.batteries(id) on delete set null,
  location    text        check (location is null or length(location) <= 80),
  sim_match_id uuid,
  updated_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists auto_runs_routine_idx on public.auto_runs (routine_id, ran_at desc);

-- ============================================================
-- PART D3: simulated matches (ledger 0017)
-- One row per simulated match run in the shop: who drove, which battery and
-- auto, the HUB order, and what happened. Logging the after-screen also
-- writes an auto run (D2) and a battery run (B1, kind practice_match) in
-- the same transaction, so the three records agree.
-- ============================================================
create table if not exists public.sim_matches (
  id             uuid        primary key default gen_random_uuid(),
  member_id      uuid        not null references public.profiles(id) on delete restrict,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  driver_id      uuid        references public.profiles(id) on delete set null,
  operator_id    uuid        references public.profiles(id) on delete set null,
  human_player_id uuid       references public.profiles(id) on delete set null,
  drive_coach_id uuid        references public.profiles(id) on delete set null,
  battery_id     uuid        references public.batteries(id) on delete set null,
  routine_id     uuid        references public.auto_routines(id) on delete set null,
  alliance       text        not null default 'red' check (alliance in ('red', 'blue')),
  inactive_first text        not null check (inactive_first in ('red', 'blue')),
  auto_result    text        check (auto_result is null or auto_result in ('success', 'partial', 'fail')),
  auto_fuel      integer     check (auto_fuel is null or auto_fuel between 0 and 500),
  teleop_fuel    integer     check (teleop_fuel is null or teleop_fuel between 0 and 500),
  tower          text        check (tower is null or tower in ('none', 'level1', 'level2', 'level3', 'failed')),
  voltage_before numeric(5,2) check (voltage_before is null or voltage_before between 0 and 16),
  voltage_after  numeric(5,2) check (voltage_after is null or voltage_after between 0 and 16),
  brownout       text        not null default 'unknown' check (brownout in ('yes', 'no', 'unknown')),
  human_notes    text        check (human_notes is null or length(human_notes) <= 1000),
  problems       text        check (problems is null or length(problems) <= 1000),
  auto_run_id    uuid        references public.auto_runs(id) on delete set null,
  battery_run_id uuid        references public.battery_runs(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists sim_matches_started_idx on public.sim_matches (started_at desc);
do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'auto_runs_sim_match_fkey') then
    alter table public.auto_runs add constraint auto_runs_sim_match_fkey foreign key (sim_match_id) references public.sim_matches(id) on delete set null;
  end if;
end
$fk$;

alter table public.auto_routines enable row level security;
alter table public.auto_runs enable row level security;
alter table public.sim_matches enable row level security;
revoke all on public.auto_routines, public.auto_runs, public.sim_matches from public, anon, authenticated;
grant select on public.auto_routines, public.auto_runs, public.sim_matches to authenticated;
drop policy if exists auto_routines_read on public.auto_routines;
create policy auto_routines_read on public.auto_routines for select to authenticated using ((select public._role_board_member_ok()));
drop policy if exists auto_runs_read on public.auto_runs;
create policy auto_runs_read on public.auto_runs for select to authenticated using ((select public._role_board_member_ok()));
drop policy if exists sim_matches_read on public.sim_matches;
create policy sim_matches_read on public.sim_matches for select to authenticated using ((select public._role_board_member_ok()));

-- Does: Add an auto routine, or change its name, starting position, description, or retire it. Staff only.
create or replace function public.auto_save_routine(p_id uuid, p_name text, p_start text default null, p_description text default null, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare a public.auto_routines;
begin
  if not public.is_staff() or not public._role_board_member_ok() then raise exception 'Only staff can add or change auto routines.' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 60 then raise exception 'Name the routine (up to 60 characters).' using errcode = '22023'; end if;
  if exists (select 1 from public.auto_routines where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Another routine is already named %.', btrim(p_name) using errcode = '23505'; end if;
  if p_id is null then
    insert into public.auto_routines (name, start_position, description, active, created_by, updated_by)
    values (btrim(p_name), nullif(btrim(p_start), ''), nullif(btrim(p_description), ''), coalesce(p_active, true), auth.uid(), auth.uid()) returning * into a;
  else
    update public.auto_routines set name = btrim(p_name), start_position = nullif(btrim(p_start), ''), description = nullif(btrim(p_description), ''),
           active = coalesce(p_active, active), updated_by = auth.uid(), updated_at = now() where id = p_id returning * into a;
    if a.id is null then raise exception 'No such routine.' using errcode = 'P0002'; end if;
  end if;
  return to_jsonb(a);
end
$fn$;

create or replace function public._auto_insert_run(p_routine uuid, p_result text, p_problem text, p_battery uuid, p_location text, p_sim uuid)
returns public.auto_runs language plpgsql security definer set search_path = public as $fn$
declare a public.auto_routines; r public.auto_runs;
begin
  select * into a from public.auto_routines where id = p_routine;
  if a.id is null then raise exception 'No such routine.' using errcode = 'P0002'; end if;
  if not a.active then raise exception 'Routine % is retired.', a.name using errcode = '22023'; end if;
  if p_result is null or p_result not in ('success', 'partial', 'fail') then raise exception 'Result is success, partial or fail.' using errcode = '22023'; end if;
  if p_problem is not null and length(p_problem) > 500 then raise exception 'What went wrong is at most 500 characters.' using errcode = '22023'; end if;
  if p_location is not null and length(p_location) > 80 then raise exception 'Where is at most 80 characters.' using errcode = '22023'; end if;
  if p_battery is not null and not exists (select 1 from public.batteries where id = p_battery) then raise exception 'No such battery.' using errcode = '22023'; end if;
  insert into public.auto_runs (routine_id, member_id, result, problem, battery_id, location, sim_match_id, updated_by)
  values (p_routine, auth.uid(), p_result, nullif(btrim(p_problem), ''), p_battery, nullif(btrim(p_location), ''), p_sim, auth.uid()) returning * into r;
  return r;
end
$fn$;
revoke all on function public._auto_insert_run(uuid, text, text, uuid, text, uuid) from public, anon, authenticated;

-- Does: Log one run of an auto routine: success, partial or fail, what went wrong, the battery and where.
create or replace function public.auto_log_run(p_routine uuid, p_result text, p_problem text default null, p_battery uuid default null, p_location text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public._role_board_member_ok() then raise exception 'The auto log is for approved students and staff.' using errcode = '42501'; end if;
  return to_jsonb(public._auto_insert_run(p_routine, p_result, p_problem, p_battery, p_location, null));
end
$fn$;

-- Does: Correct an auto run: its author within 24 hours, staff any time.
create or replace function public.auto_edit_run(p_run uuid, p_result text, p_problem text default null, p_battery uuid default null, p_location text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.auto_runs;
begin
  if not public._role_board_member_ok() then raise exception 'The auto log is for approved students and staff.' using errcode = '42501'; end if;
  select * into r from public.auto_runs where id = p_run for update;
  if r.id is null then raise exception 'No such run.' using errcode = 'P0002'; end if;
  if not public.is_staff() and (r.member_id <> auth.uid() or r.created_at < now() - interval '24 hours') then
    raise exception 'You can correct your own run for 24 hours after logging it. Ask a mentor after that.' using errcode = '42501'; end if;
  if p_result is null or p_result not in ('success', 'partial', 'fail') then raise exception 'Result is success, partial or fail.' using errcode = '22023'; end if;
  update public.auto_runs set result = p_result, problem = nullif(btrim(p_problem), ''), battery_id = p_battery, location = nullif(btrim(p_location), ''),
         updated_by = auth.uid(), updated_at = now() where id = p_run returning * into r;
  return to_jsonb(r);
end
$fn$;

-- Does: Save a simulated match: who drove, battery, auto, HUB order, FUEL, TOWER, voltages and notes; also logs the auto run and the battery run.
create or replace function public.sim_save_match(p_started_at timestamptz, p_ended_at timestamptz, p_alliance text, p_inactive_first text,
  p_driver uuid default null, p_operator uuid default null, p_human_player uuid default null, p_drive_coach uuid default null,
  p_battery uuid default null, p_routine uuid default null, p_auto_result text default null, p_auto_fuel integer default null,
  p_teleop_fuel integer default null, p_tower text default null, p_voltage_before numeric default null, p_voltage_after numeric default null,
  p_brownout text default 'unknown', p_human_notes text default null, p_problems text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare m public.sim_matches; ar public.auto_runs; br jsonb;
begin
  if not public._role_board_member_ok() then raise exception 'The match simulator is for approved students and staff.' using errcode = '42501'; end if;
  if p_started_at is null then raise exception 'When did the match start?' using errcode = '22023'; end if;
  if coalesce(p_alliance, '') not in ('red', 'blue') or coalesce(p_inactive_first, '') not in ('red', 'blue') then raise exception 'Alliance and HUB order are red or blue.' using errcode = '22023'; end if;
  if p_routine is not null and p_auto_result is null then raise exception 'Record how the auto went, or clear the routine.' using errcode = '22023'; end if;
  insert into public.sim_matches (member_id, started_at, ended_at, driver_id, operator_id, human_player_id, drive_coach_id, battery_id, routine_id, alliance,
    inactive_first, auto_result, auto_fuel, teleop_fuel, tower, voltage_before, voltage_after, brownout, human_notes, problems)
  values (auth.uid(), p_started_at, p_ended_at, p_driver, p_operator, p_human_player, p_drive_coach, p_battery, p_routine, p_alliance,
    p_inactive_first, p_auto_result, p_auto_fuel, p_teleop_fuel, p_tower, p_voltage_before, p_voltage_after, coalesce(p_brownout, 'unknown'),
    nullif(btrim(p_human_notes), ''), nullif(btrim(p_problems), ''))
  returning * into m;
  if p_routine is not null then
    ar := public._auto_insert_run(p_routine, p_auto_result, case when p_auto_result <> 'success' then nullif(btrim(p_problems), '') end, p_battery, 'Simulated match', m.id);
    update public.sim_matches set auto_run_id = ar.id where id = m.id;
  end if;
  if p_battery is not null then
    br := public.battery_log_run(p_battery, 'practice_match', null, 'Simulated match', p_voltage_before, p_voltage_after, null,
            greatest(1, round(extract(epoch from coalesce(p_ended_at, p_started_at + interval '160 seconds') - p_started_at) / 60.0))::integer,
            coalesce(p_brownout, 'unknown'), null, nullif(btrim(p_problems), ''), p_started_at);
    update public.sim_matches set battery_run_id = (br ->> 'id')::uuid where id = m.id;
  end if;
  select * into m from public.sim_matches where id = m.id;
  return to_jsonb(m);
end
$fn$;

revoke all on function public.auto_save_routine(uuid, text, text, text, boolean), public.auto_log_run(uuid, text, text, uuid, text),
  public.auto_edit_run(uuid, text, text, uuid, text),
  public.sim_save_match(timestamptz, timestamptz, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, integer, integer, text, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.auto_save_routine(uuid, text, text, text, boolean), public.auto_log_run(uuid, text, text, uuid, text),
  public.auto_edit_run(uuid, text, text, uuid, text),
  public.sim_save_match(timestamptz, timestamptz, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, integer, integer, text, numeric, numeric, text, text, text) to authenticated;

-- ============================================================
-- PART D4: who completed this season's member application (ledger 0017)
-- The connector reads tables as him through select, and member_applications
-- is readable to staff already (member_applications.sql), but the season
-- logic lives in the app. This function answers it in one call.
-- ============================================================
-- Does: Which members completed this season's member application, with their names, and which active students have not.
create or replace function public.season_applications()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare s record;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select id, name, start_date, end_date into s from public.seasons
   where start_date <= public._la_today() and end_date >= public._la_today() order by start_date desc limit 1;
  if s.id is null then return jsonb_build_object('season', null, 'completed', '[]'::jsonb, 'missing', '[]'::jsonb); end if;
  return jsonb_build_object(
    'season', jsonb_build_object('id', s.id, 'name', s.name, 'start_date', s.start_date, 'end_date', s.end_date),
    'completed', coalesce((select jsonb_agg(jsonb_build_object('member_id', a.member_id, 'name', public._member_name(a.member_id), 'submitted_at', a.submitted_at) order by public._member_name(a.member_id))
                             from (select distinct on (member_id) member_id, submitted_at from public.member_applications where season_id = s.id order by member_id, submitted_at desc) a), '[]'::jsonb),
    'missing', coalesce((select jsonb_agg(jsonb_build_object('member_id', p.id, 'name', public._member_name(p.id)) order by public._member_name(p.id))
                           from public.profiles p
                          where p.approved and coalesce(p.status, 'active') = 'active'
                            and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student')
                            and not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
                            and not exists (select 1 from public.member_applications a where a.member_id = p.id and a.season_id = s.id)), '[]'::jsonb));
end
$fn$;
revoke all on function public.season_applications() from public, anon;
grant execute on function public.season_applications() to authenticated;

-- ── connector log tables and the merge rules ──
do $connector$
begin
  if to_regclass('public.connector_log_tables') is not null then
    insert into public.connector_log_tables (table_name, note) values
      ('role_slots', 'Role board slots (0028)'), ('role_requests', 'Role board requests (0028)'), ('role_slot_templates', 'Role board templates (0028)'), ('event_match_clock', 'Event match clock (0028)'),
      ('auto_routines', 'Auto routines (0028)'), ('auto_runs', 'Auto runs (0028)'), ('sim_matches', 'Simulated matches (0028)')
    on conflict (table_name) do nothing;
  end if;
end
$connector$;

-- The account merge (0020) must know every column that names a member. 0026
-- last replaced this list; copied here with the role board, auto and
-- simulated match columns. Paste 0028 again after any re-paste of 0020, 0022,
-- 0024 or 0026.
create or replace function public._merge_member_rules()
returns table (tbl text, col text, rule text) language sql immutable set search_path = public as $fn$
  select x.tbl, x.col, x.rule from (values
    ('profiles', 'id', 'profile'),
    ('scouting_records', 'member_id', 'keep'),
    ('scouting_revisions', 'member_id', 'keep'),
    ('scouting_revisions', 'changed_by', 'keep'),
    ('scouting_operations', 'member_id', 'keep'),
    ('member_roles', 'member_id', 'roles'),
    ('member_permissions', 'member_id', 'grants'),
    ('member_permissions', 'granted_by', 'move'),
    ('connector_codes', 'user_id', 'drop'),
    ('connector_tokens', 'user_id', 'drop'),
    ('connector_confirmations', 'user_id', 'drop'),
    ('connector_audit', 'user_id', 'keep'),
    ('connector_audit', 'undone_by', 'keep'),
    ('connector_settings', 'allowed_member', 'refuse'),
    ('connector_settings', 'updated_by', 'move'),
    ('member_admin_log', 'member_id', 'keep'),
    ('member_admin_log', 'actor_id', 'keep'),
    ('absence_requests', 'member_id', 'move'),
    ('absence_requests', 'decided_by', 'move'),
    ('access_requests', 'reviewed_by', 'move'),
    ('allowed_domains', 'added_by', 'move'),
    ('approved_emails', 'added_by', 'move'),
    ('attendance_audit', 'member_id', 'move'),
    ('attendance_audit', 'actor_id', 'move'),
    ('attendance_events', 'user_id', 'move'),
    ('attendance_events', 'overridden_by', 'move'),
    ('auto_routines', 'created_by', 'move'),
    ('auto_routines', 'updated_by', 'move'),
    ('auto_runs', 'member_id', 'move'),
    ('auto_runs', 'updated_by', 'move'),
    ('batteries', 'charge_set_by', 'move'),
    ('batteries', 'created_by', 'move'),
    ('batteries', 'updated_by', 'move'),
    ('battery_runs', 'member_id', 'move'),
    ('battery_runs', 'updated_by', 'move'),
    ('cert_requests', 'member_id', 'move'),
    ('cert_requests', 'reviewed_by', 'move'),
    ('discipline_records', 'member_id', 'move'),
    ('discipline_records', 'created_by', 'move'),
    ('discipline_records', 'appeal_by', 'move'),
    ('discord_announce_roles', 'created_by', 'move'),
    ('discord_announcements', 'sent_by', 'move'),
    ('driver_documents', 'owner_id', 'move'),
    ('driver_document_views', 'viewer_id', 'move'),
    ('event_attendance', 'member_id', 'move'),
    ('event_attendance', 'marked_by', 'move'),
    ('event_roles', 'member_id', 'move'),
    ('event_roles', 'assigned_by', 'move'),
    ('event_rosters', 'posted_by', 'move'),
    ('event_signup_reminders', 'student_id', 'move'),
    ('event_signup_reminders', 'reminded_by', 'move'),
    ('event_signups', 'member_id', 'move'),
    ('events', 'created_by', 'move'),
    ('feedback', 'member_id', 'move'),
    ('feedback', 'reviewed_by', 'move'),
    ('feedback_replies', 'author_id', 'move'),
    ('fll_mentors', 'member_id', 'move'),
    ('grade_checks', 'member_id', 'move'),
    ('grade_checks', 'set_by', 'move'),
    ('guardian_links', 'parent_id', 'move'),
    ('guardian_links', 'student_id', 'move'),
    ('guardian_links', 'created_by', 'move'),
    ('handbook_acknowledgments', 'member_id', 'move'),
    ('handbook_versions', 'published_by', 'move'),
    ('hour_adjustments', 'member_id', 'move'),
    ('hour_adjustments', 'created_by', 'move'),
    ('hour_goals', 'member_id', 'move'),
    ('hour_goals', 'updated_by', 'move'),
    ('hub_cars', 'minor_override_by', 'move'),
    ('hub_days', 'captain_id', 'move'),
    ('hub_events', 'created_by', 'move'),
    ('hub_invites', 'student_id', 'move'),
    ('hub_responses', 'driver_paperwork_by', 'move'),
    ('hub_responses', 'staff_updated_by', 'move'),
    ('hub_seats', 'placed_by', 'move'),
    ('incident_reports', 'member_id', 'move'),
    ('incident_reports', 'reported_by', 'move'),
    ('incident_reports', 'closed_by', 'move'),
    ('letter_contributions', 'member_id', 'move'),
    ('letter_contributions', 'confirmed_by', 'move'),
    ('logged_hours', 'member_id', 'move'),
    ('logged_hours', 'reviewed_by', 'move'),
    ('logged_hours', 'verified_by', 'move'),
    ('logged_hours_corrections', 'member_id', 'move'),
    ('logged_hours_corrections', 'reviewed_by', 'move'),
    ('media_exceptions', 'member_id', 'move'),
    ('media_exceptions', 'set_by', 'move'),
    ('meeting_checkins', 'member_id', 'move'),
    ('member_applications', 'member_id', 'move'),
    ('member_conflicts', 'member_id', 'move'),
    ('member_medical', 'member_id', 'move'),
    ('member_medical', 'updated_by', 'move'),
    ('member_notices', 'member_id', 'move'),
    ('member_notices', 'created_by', 'move'),
    ('member_skills', 'member_id', 'move'),
    ('member_skills', 'certified_by', 'move'),
    ('notice_outbox', 'member_id', 'move'),
    ('notifications_sent', 'member_id', 'move'),
    ('onboarding_items', 'member_id', 'move'),
    ('onboarding_items', 'marked_by', 'move'),
    ('parent_acknowledgments', 'member_id', 'move'),
    ('parent_link_requests', 'parent_id', 'move'),
    ('parent_link_requests', 'student_id', 'move'),
    ('parent_link_requests', 'reviewed_by', 'move'),
    ('position_assignments', 'member_id', 'move'),
    ('position_assignments', 'assigned_by', 'move'),
    ('push_subscriptions', 'member_id', 'move'),
    ('event_match_clock', 'set_by', 'move'),
    ('role_requests', 'member_id', 'move'),
    ('role_slot_templates', 'created_by', 'move'),
    ('role_slots', 'created_by', 'move'),
    ('safety_violations', 'member_id', 'move'),
    ('safety_violations', 'logged_by', 'move'),
    ('session_corrections', 'member_id', 'move'),
    ('session_corrections', 'reviewed_by', 'move'),
    ('session_reviews', 'user_id', 'move'),
    ('session_reviews', 'reviewed_by', 'move'),
    ('signout_requests', 'member_id', 'move'),
    ('signout_requests', 'decided_by', 'move'),
    ('sim_matches', 'member_id', 'move'),
    ('sim_matches', 'driver_id', 'move'),
    ('sim_matches', 'operator_id', 'move'),
    ('sim_matches', 'human_player_id', 'move'),
    ('sim_matches', 'drive_coach_id', 'move'),
    ('standing_months', 'member_id', 'move'),
    ('standing_records', 'member_id', 'move'),
    ('standing_records', 'confirmed_by', 'move'),
    ('standing_settings', 'updated_by', 'move'),
    ('standing_weeks', 'member_id', 'move'),
    ('study_sessions', 'member_id', 'move'),
    ('subteam_status_reports', 'reported_by', 'move'),
    ('surveys', 'created_by', 'move'),
    ('survey_responses', 'member_id', 'move'),
    ('task_claims', 'member_id', 'move'),
    ('task_claims', 'verified_by', 'move'),
    ('task_idea_cert_requirements', 'set_by', 'move'),
    ('task_updates', 'member_id', 'move'),
    ('tasks', 'claimed_by', 'move'),
    ('tasks', 'created_by', 'move'),
    ('tasks', 'verified_by', 'move'),
    ('team_weeks', 'posted_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated;
