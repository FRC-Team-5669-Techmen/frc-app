-- ============================================================
-- 0035_meet_a_team: every member meets another team at a competition and
-- writes down what that team does well (ledger 0026)
--
-- Applied by migrate.yml in one transaction, AFTER 0031 (role board v2).
-- Re-runnable: every step checks before it changes anything.
--
-- WHY. Mr. Pina, 2026-10-23: "An assignment for every team member to
-- complete during competition, with its own separate time slot. Every
-- student goes out, talks to another team and connects with them. Not in a
-- scouting way: what does this team do well? How are they organized? We have
-- a lot of elite teams around us and we want to operate like them." First
-- use: Beach Blitz, Oct 30 to Nov 1 2026.
--
-- WHAT THIS ADDS.
--   team_connections            one note per member per team met at an event:
--                               team, what they do well, how they are
--                               organized (chips + note), resources they
--                               offer (chips + note), one thing to copy,
--                               follow up. Every approved member (parents
--                               too) reads every note; a member writes only
--                               their own; staff edit or delete any.
--   team_connection_contacts    who we talked to and how to reach them, one
--                               row per note. Students and staff only: a
--                               parent-only account and anon read none.
--   team_connection_save / team_connection_delete   the writes (SECURITY
--                               INVOKER, so the policies decide).
--   meet_team_event(event)      the shared list for an event, the caller's
--                               own slot and status, the scouting team list.
--   meet_team_progress(event)   staff: every active student done, slotted
--                               (assigned a Meet a team box, nothing logged)
--                               or without a slot.
--   staff_meet_team_fill(event, apply)   staff: put every active student who
--                               has no Meet a team assignment into a box,
--                               evenly, never in a slot overlapping another
--                               role they are assigned. apply false is the
--                               preview; true writes it.
--   meet_team_todo()            Home's Do this now: events running today
--                               with Meet a team boxes where the caller has
--                               logged nothing yet, with their slot.
--   meet_team joins the role vocabulary (event_roles check, _role_valid),
--   the Beach Blitz template, and the live Beach Blitz event's slots: 3
--   boxes in each Saturday qualification slot and each Sunday morning
--   qualification or playoff slot. Existing needs and requests are kept.
--
-- TO UNDO: drop function public.team_connection_save(uuid, uuid, integer,
-- text, jsonb, text, jsonb, text, jsonb, text, text, boolean, text),
-- public.team_connection_delete(uuid), public.meet_team_event(uuid),
-- public.meet_team_progress(uuid), public.staff_meet_team_fill(uuid,
-- boolean), public.meet_team_todo(), public._meet_team_reader(),
-- public._meet_team_students(uuid); drop table
-- public.team_connection_contacts, public.team_connections; remove the
-- meet_team key from role_slots.needs and the template; put 0031's role
-- check and _role_valid back (only if no event_roles row says meet_team);
-- paste _merge_member_rules from 0031 again.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public.staff_set_request_status(uuid, text)') is null then
    raise exception '0035 needs 0031_role_board_v2.sql applied first';
  end if;
end
$prereq$;

-- ── 1. meet_team joins the role list ────────────────────────────────────
do $roles$
declare c text;
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_roles'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%meet_team%') then
    for c in select conname from pg_constraint where conrelid = 'public.event_roles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%driver%operator%' loop
      execute format('alter table public.event_roles drop constraint %I', c);
    end loop;
    alter table public.event_roles add constraint event_roles_role_check check (role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew',
      'impact_presenter', 'pit_speaker', 'scouting_lead', 'scout', 'media', 'safety_captain', 'battery_captain', 'team_captain', 'meet_team'));
  end if;
end
$roles$;

create or replace function public._role_valid(p_role text)
returns boolean language sql immutable set search_path = public as $fn$
  select p_role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew', 'impact_presenter', 'pit_speaker',
                    'scouting_lead', 'scout', 'media', 'safety_captain', 'battery_captain', 'team_captain', 'meet_team');
$fn$;
revoke all on function public._role_valid(text) from public, anon;

-- ── 2. the tables ───────────────────────────────────────────────────────
create table if not exists public.team_connections (
  id             uuid        primary key default gen_random_uuid(),
  event_id       uuid        not null references public.events(id) on delete cascade,
  member_id      uuid        not null references public.profiles(id) on delete cascade,
  team_number    integer     not null check (team_number between 1 and 99999),
  team_name      text        check (team_name is null or length(team_name) <= 120),
  does_well      text        not null check (length(btrim(does_well)) between 1 and 1000),
  org_tags       text[]      not null default '{}' check (org_tags <@ array['student_led', 'mentor_led', 'subteams', 'captains', 'business_team', 'outreach_team', 'scouting_team', 'strategy_team']::text[]),
  org_note       text        check (org_note is null or length(org_note) <= 1000),
  resource_tags  text[]      not null default '{}' check (resource_tags <@ array['shared_cad_code', 'mentoring', 'machining', 'spare_parts', 'sponsor_contacts', 'outreach_events', 'training_material']::text[]),
  resource_note  text        check (resource_note is null or length(resource_note) <= 1000),
  copy_this      text        not null check (length(btrim(copy_this)) between 1 and 1000),
  follow_up      boolean     not null default false,
  follow_up_note text        check (follow_up_note is null or length(follow_up_note) <= 1000),
  updated_by     uuid        references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists team_connections_event_idx on public.team_connections (event_id, team_number);
create index if not exists team_connections_member_idx on public.team_connections (member_id);

create table if not exists public.team_connection_contacts (
  connection_id uuid        primary key references public.team_connections(id) on delete cascade,
  name          text        check (name is null or length(name) <= 120),
  role          text        check (role is null or role in ('student', 'mentor', 'lead')),
  email         text        check (email is null or length(email) <= 200),
  discord       text        check (discord is null or length(discord) <= 100),
  social        text        check (social is null or length(social) <= 200),
  updated_at    timestamptz not null default now()
);

-- Who may read the notes: any approved account with a team role, parents
-- included. Contacts use _role_board_member_ok() (0028): approved active
-- students and staff, never a parent-only account.
create or replace function public._meet_team_reader()
returns boolean language sql stable security definer set search_path = public as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.approved
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin', 'parent')));
$fn$;
revoke all on function public._meet_team_reader() from public, anon;
grant execute on function public._meet_team_reader() to authenticated;

alter table public.team_connections enable row level security;
alter table public.team_connection_contacts enable row level security;
-- The bootstrap default privileges grant authenticated everything on a new
-- table: take it all back, then grant only what the policies below gate.
-- UPDATE is granted per column, so member_id, event_id, id and created_at
-- can never be changed by a client (a column revoke under a table grant
-- would do nothing).
revoke all on public.team_connections, public.team_connection_contacts from public, anon, authenticated;
grant select, insert, delete on public.team_connections to authenticated;
grant update (team_number, team_name, does_well, org_tags, org_note, resource_tags, resource_note, copy_this, follow_up, follow_up_note, updated_by, updated_at)
  on public.team_connections to authenticated;
grant select, insert, delete on public.team_connection_contacts to authenticated;
grant update (name, role, email, discord, social, updated_at) on public.team_connection_contacts to authenticated;

drop policy if exists team_connections_read on public.team_connections;
create policy team_connections_read on public.team_connections for select to authenticated
  using ((select public._meet_team_reader()));
drop policy if exists team_connections_insert on public.team_connections;
create policy team_connections_insert on public.team_connections for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public._role_board_member_ok()));
drop policy if exists team_connections_update on public.team_connections;
create policy team_connections_update on public.team_connections for update to authenticated
  using ((member_id = (select auth.uid()) and (select public._role_board_member_ok())) or (select public.is_staff()))
  with check ((member_id = (select auth.uid()) and (select public._role_board_member_ok())) or (select public.is_staff()));
drop policy if exists team_connections_delete on public.team_connections;
create policy team_connections_delete on public.team_connections for delete to authenticated
  using ((member_id = (select auth.uid()) and (select public._role_board_member_ok())) or (select public.is_staff()));

drop policy if exists team_connection_contacts_read on public.team_connection_contacts;
create policy team_connection_contacts_read on public.team_connection_contacts for select to authenticated
  using ((select public._role_board_member_ok()));
drop policy if exists team_connection_contacts_write on public.team_connection_contacts;
create policy team_connection_contacts_write on public.team_connection_contacts for all to authenticated
  using ((select public._role_board_member_ok()) and exists (select 1 from public.team_connections c where c.id = connection_id
           and (c.member_id = (select auth.uid()) or (select public.is_staff()))))
  with check ((select public._role_board_member_ok()) and exists (select 1 from public.team_connections c where c.id = connection_id
           and (c.member_id = (select auth.uid()) or (select public.is_staff()))));

-- ── 3. the writes ───────────────────────────────────────────────────────
-- Does: Save a Meet a team note about another team at a competition: what they do well, how they are organized, what they offer and one thing to copy. New when no id; your own note, or any note for staff, when an id is given.
create or replace function public.team_connection_save(
  p_id uuid, p_event uuid, p_team integer, p_team_name text, p_contact jsonb,
  p_does_well text, p_org_tags jsonb, p_org_note text, p_resource_tags jsonb, p_resource_note text,
  p_copy text, p_follow_up boolean, p_follow_up_note text)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare
  v_id uuid;
  v_org text[] := array(select jsonb_array_elements_text(coalesce(p_org_tags, '[]'::jsonb)));
  v_res text[] := array(select jsonb_array_elements_text(coalesce(p_resource_tags, '[]'::jsonb)));
  c jsonb := coalesce(p_contact, '{}'::jsonb);
  c_name text := nullif(btrim(c ->> 'name'), '');
  c_role text := nullif(btrim(c ->> 'role'), '');
  c_email text := nullif(btrim(c ->> 'email'), '');
  c_discord text := nullif(btrim(c ->> 'discord'), '');
  c_social text := nullif(btrim(c ->> 'social'), '');
begin
  if auth.uid() is null or not public._role_board_member_ok() then
    raise exception 'Meet a team notes are for approved students and staff.' using errcode = '42501';
  end if;
  if p_team is null or p_team not between 1 and 99999 then raise exception 'Pick the team number.' using errcode = '22023'; end if;
  if coalesce(btrim(p_does_well), '') = '' then raise exception 'Say what they do well.' using errcode = '22023'; end if;
  if coalesce(btrim(p_copy), '') = '' then raise exception 'Name one thing we should copy.' using errcode = '22023'; end if;
  if c_role is not null and c_role not in ('student', 'mentor', 'lead') then raise exception 'Their role is student, mentor or lead.' using errcode = '22023'; end if;
  if p_id is null then
    if not exists (select 1 from public.events where id = p_event) then raise exception 'Event not found' using errcode = 'P0002'; end if;
    insert into public.team_connections (event_id, member_id, team_number, team_name, does_well, org_tags, org_note, resource_tags, resource_note, copy_this, follow_up, follow_up_note, updated_by)
    values (p_event, auth.uid(), p_team, nullif(btrim(p_team_name), ''), btrim(p_does_well), v_org, nullif(btrim(p_org_note), ''), v_res, nullif(btrim(p_resource_note), ''),
            btrim(p_copy), coalesce(p_follow_up, false), nullif(btrim(p_follow_up_note), ''), auth.uid())
    returning id into v_id;
  else
    update public.team_connections
       set team_number = p_team, team_name = nullif(btrim(p_team_name), ''), does_well = btrim(p_does_well), org_tags = v_org, org_note = nullif(btrim(p_org_note), ''),
           resource_tags = v_res, resource_note = nullif(btrim(p_resource_note), ''), copy_this = btrim(p_copy), follow_up = coalesce(p_follow_up, false),
           follow_up_note = nullif(btrim(p_follow_up_note), ''), updated_by = auth.uid(), updated_at = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'You can change only your own notes.' using errcode = '42501'; end if;
  end if;
  if coalesce(c_name, c_role, c_email, c_discord, c_social) is null then
    delete from public.team_connection_contacts where connection_id = v_id;
  else
    insert into public.team_connection_contacts (connection_id, name, role, email, discord, social, updated_at)
    values (v_id, c_name, c_role, c_email, c_discord, c_social, now())
    on conflict (connection_id) do update set name = excluded.name, role = excluded.role, email = excluded.email,
      discord = excluded.discord, social = excluded.social, updated_at = now();
  end if;
  return jsonb_build_object('id', v_id, 'event_id', p_event, 'team_number', p_team);
end
$fn$;

-- Does: Delete a Meet a team note. Your own, or any note for staff.
create or replace function public.team_connection_delete(p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v_row public.team_connections;
begin
  delete from public.team_connections where id = p_id returning * into v_row;
  if v_row.id is null then raise exception 'You can delete only your own notes.' using errcode = '42501'; end if;
  return jsonb_build_object('id', v_row.id, 'event_id', v_row.event_id, 'team_number', v_row.team_number);
end
$fn$;

-- ── 4. the reads ────────────────────────────────────────────────────────
-- Every active student, for progress and the slot fill. One definition, so
-- the two can never disagree about who counts.
create or replace function public._meet_team_students(p_event uuid)
returns table (member_id uuid, name text) language sql stable security definer set search_path = public as $fn$
  select p.id, public._member_name(p.id)
    from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active'
     and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'student');
$fn$;
revoke all on function public._meet_team_students(uuid) from public, anon, authenticated;

-- Does: Read the Meet a team notes for an event: every team met, what they do well, how they are organized, what they offer, and who logged each.
create or replace function public.meet_team_event(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare ev record; v_contacts boolean; v_teams jsonb := '[]'::jsonb;
begin
  if not public._meet_team_reader() then raise exception 'Meet a team is for team members.' using errcode = '42501'; end if;
  select id, title, starts_at, ends_at, kind into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  v_contacts := public._role_board_member_ok();
  if to_regclass('public.scouting_records') is not null then
    execute $q$select coalesce(jsonb_agg(jsonb_build_object('team_number', t.team_number, 'name', t.name) order by t.team_number), '[]'::jsonb)
                 from (select team_number, max(payload ->> 'name') as name from public.scouting_records
                        where event_id = $1 and kind = 'team' and team_number is not null group by team_number) t$q$
      into v_teams using p_event;
  end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'title', ev.title, 'starts_at', ev.starts_at, 'ends_at', ev.ends_at, 'kind', ev.kind),
    'me', auth.uid(),
    'can_manage', public.is_staff(),
    'can_write', public._role_board_member_ok(),
    'contacts_visible', v_contacts,
    'teams', v_teams,
    'has_slots', exists (select 1 from public.role_slots s where s.event_id = p_event and s.needs ? 'meet_team'),
    'my_slots', coalesce((select jsonb_agg(jsonb_build_object('slot_id', s.id, 'label', s.label, 'day', s.day, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', r.status)
                                  order by s.starts_at, s.position)
                            from public.role_requests r join public.role_slots s on s.id = r.slot_id
                           where s.event_id = p_event and r.member_id = auth.uid() and r.role = 'meet_team'), '[]'::jsonb),
    'connections', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'team_number', c.team_number, 'team_name', c.team_name, 'member_id', c.member_id, 'logged_by', public._member_name(c.member_id),
        'mine', c.member_id = auth.uid(), 'does_well', c.does_well, 'org_tags', to_jsonb(c.org_tags), 'org_note', c.org_note,
        'resource_tags', to_jsonb(c.resource_tags), 'resource_note', c.resource_note, 'copy_this', c.copy_this,
        'follow_up', c.follow_up, 'follow_up_note', c.follow_up_note, 'created_at', c.created_at, 'updated_at', c.updated_at,
        'contact', case when v_contacts then (select jsonb_build_object('name', k.name, 'role', k.role, 'email', k.email, 'discord', k.discord, 'social', k.social)
                                                from public.team_connection_contacts k where k.connection_id = c.id) end)
        order by c.team_number, c.created_at)
      from public.team_connections c where c.event_id = p_event), '[]'::jsonb));
end
$fn$;

-- Does: Show who has done Meet a team for an event: done, assigned a slot but nothing logged yet, or no slot. Staff only.
create or replace function public.meet_team_progress(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare ev record; v_people jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select id, title into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(x order by x ->> 'state', x ->> 'name'), '[]'::jsonb) into v_people from (
    select jsonb_build_object('member_id', st.member_id, 'name', st.name,
             'logged', (select count(*) from public.team_connections c where c.event_id = p_event and c.member_id = st.member_id),
             'teams', coalesce((select jsonb_agg(distinct c.team_number) from public.team_connections c where c.event_id = p_event and c.member_id = st.member_id), '[]'::jsonb),
             'slots', coalesce((select jsonb_agg(jsonb_build_object('slot_id', s.id, 'label', s.label, 'day', s.day, 'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.starts_at)
                                  from public.role_requests r join public.role_slots s on s.id = r.slot_id
                                 where s.event_id = p_event and r.member_id = st.member_id and r.role = 'meet_team' and r.status = 'assigned'), '[]'::jsonb),
             'state', case when exists (select 1 from public.team_connections c where c.event_id = p_event and c.member_id = st.member_id) then 'done'
                           when exists (select 1 from public.role_requests r join public.role_slots s on s.id = r.slot_id
                                         where s.event_id = p_event and r.member_id = st.member_id and r.role = 'meet_team' and r.status = 'assigned') then 'slotted'
                           else 'no_slot' end) as x
      from public._meet_team_students(p_event) st) q;
  return jsonb_build_object('event', jsonb_build_object('id', ev.id, 'title', ev.title),
    'done', (select count(*) from jsonb_array_elements(v_people) e where e ->> 'state' = 'done'),
    'slotted', (select count(*) from jsonb_array_elements(v_people) e where e ->> 'state' = 'slotted'),
    'no_slot', (select count(*) from jsonb_array_elements(v_people) e where e ->> 'state' = 'no_slot'),
    'people', v_people);
end
$fn$;

-- ── 5. give everyone a slot ─────────────────────────────────────────────
-- The plan, in order: Meet a team slots of the event not yet over; every
-- active student holding no ASSIGNED meet_team box in them; a slot is free
-- for a student unless it overlaps in time a slot where they hold another
-- assigned role (a slot with no end counts as one hour). Students with the
-- fewest free slots go first, then by name; each goes to their free slot
-- with the lowest fill (assigned / needed), then fewest assigned, then the
-- earliest. Boxes may overfill once every box is taken (the board allows
-- it). src/meetTeam.js planMeetTeam is the same rule for fixture mode and
-- tests/meet-team-plan.test.js; the 0035 test holds this copy to the same
-- outcome. A duplicate on purpose: change both.
-- Does: Give every active student without a Meet a team slot one, spread evenly across the Meet a team boxes, skipping slots where they hold another role. Staff only; preview unless apply is true.
create or replace function public.staff_meet_team_fill(p_event uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  ev record; st record; v_free uuid[]; v_pick record; v_loads jsonb := '{}'::jsonb;
  v_placed jsonb := '[]'::jsonb; v_unplaced jsonb := '[]'::jsonb; v_slots integer; v_boxes integer; v_already integer;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select id, title into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  select count(*), coalesce(sum((s.needs ->> 'meet_team')::integer), 0),
         coalesce(jsonb_object_agg(s.id::text, (select count(*) from public.role_requests r where r.slot_id = s.id and r.role = 'meet_team' and r.status = 'assigned')), '{}'::jsonb)
    into v_slots, v_boxes, v_loads
    from public.role_slots s
   where s.event_id = p_event and jsonb_typeof(s.needs -> 'meet_team') = 'number' and (s.needs ->> 'meet_team')::integer > 0
     and coalesce(s.ends_at, s.starts_at + interval '1 hour') > now();
  select count(*) into v_already from public._meet_team_students(p_event) x
   where exists (select 1 from public.role_requests r join public.role_slots s on s.id = r.slot_id
                  where s.event_id = p_event and r.member_id = x.member_id and r.role = 'meet_team' and r.status = 'assigned');
  for st in
    select q.member_id, q.name, q.free from (
      select x.member_id, x.name,
             array(select s.id from public.role_slots s
                    where s.id::text in (select jsonb_object_keys(v_loads))
                      and not exists (select 1 from public.role_requests o join public.role_slots s2 on s2.id = o.slot_id
                                       where o.member_id = x.member_id and o.status = 'assigned' and o.role <> 'meet_team' and s2.event_id = p_event
                                         and s2.starts_at < coalesce(s.ends_at, s.starts_at + interval '1 hour')
                                         and coalesce(s2.ends_at, s2.starts_at + interval '1 hour') > s.starts_at)) as free
        from public._meet_team_students(p_event) x
       where not exists (select 1 from public.role_requests r join public.role_slots s on s.id = r.slot_id
                          where s.event_id = p_event and r.member_id = x.member_id and r.role = 'meet_team' and r.status = 'assigned')) q
     order by cardinality(q.free), lower(q.name), q.member_id
  loop
    if v_slots = 0 then
      v_unplaced := v_unplaced || jsonb_build_object('member_id', st.member_id, 'name', st.name, 'reason', 'This event has no Meet a team boxes yet.');
      continue;
    end if;
    if cardinality(st.free) = 0 then
      v_unplaced := v_unplaced || jsonb_build_object('member_id', st.member_id, 'name', st.name, 'reason', 'Holds another role in every Meet a team slot.');
      continue;
    end if;
    select s.id, s.label, s.day, s.starts_at, s.ends_at into v_pick
      from public.role_slots s
     where s.id = any(st.free)
     order by (v_loads ->> s.id::text)::numeric / (s.needs ->> 'meet_team')::numeric, (v_loads ->> s.id::text)::integer, s.starts_at, s.position, s.id
     limit 1;
    v_loads := jsonb_set(v_loads, array[v_pick.id::text], to_jsonb((v_loads ->> v_pick.id::text)::integer + 1));
    v_placed := v_placed || jsonb_build_object('member_id', st.member_id, 'name', st.name, 'slot_id', v_pick.id, 'label', v_pick.label,
                                               'day', v_pick.day, 'starts_at', v_pick.starts_at, 'ends_at', v_pick.ends_at);
    if p_apply then
      insert into public.role_requests (slot_id, member_id, role, status, status_by, status_at)
      values (v_pick.id, st.member_id, 'meet_team', 'assigned', auth.uid(), now())
      on conflict (slot_id, member_id, role) do update set status = 'assigned', status_by = excluded.status_by, status_at = excluded.status_at;
      perform public._role_board_sync(p_event, st.member_id, 'meet_team', v_pick.label);
    end if;
  end loop;
  return jsonb_build_object('event', jsonb_build_object('id', ev.id, 'title', ev.title), 'applied', coalesce(p_apply, false),
    'slots', v_slots, 'boxes', v_boxes, 'already', v_already, 'placed', v_placed, 'unplaced', v_unplaced);
end
$fn$;

-- Does: Competitions running today where you still owe a Meet a team note, with your Meet a team time slot.
create or replace function public.meet_team_todo()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public._role_board_member_ok() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'title', e.title,
             'slot', (select jsonb_build_object('label', s.label, 'day', s.day, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', r.status)
                        from public.role_requests r join public.role_slots s on s.id = r.slot_id
                       where s.event_id = e.id and r.member_id = auth.uid() and r.role = 'meet_team' and r.status in ('assigned', 'backup')
                       order by r.status = 'assigned' desc, coalesce(s.ends_at, s.starts_at + interval '1 hour') < now(), s.starts_at limit 1))
             order by e.starts_at)
    from public.events e
   where now() >= ((e.starts_at at time zone 'America/Los_Angeles')::date::timestamp at time zone 'America/Los_Angeles')
     and now() <= coalesce(e.ends_at, e.starts_at + interval '1 day')
     and exists (select 1 from public.role_slots s where s.event_id = e.id and s.needs ? 'meet_team')
     and not exists (select 1 from public.team_connections c where c.event_id = e.id and c.member_id = auth.uid())), '[]'::jsonb);
end
$fn$;

revoke all on function public.team_connection_save(uuid, uuid, integer, text, jsonb, text, jsonb, text, jsonb, text, text, boolean, text),
  public.team_connection_delete(uuid), public.meet_team_event(uuid), public.meet_team_progress(uuid),
  public.staff_meet_team_fill(uuid, boolean), public.meet_team_todo() from public, anon;
grant execute on function public.team_connection_save(uuid, uuid, integer, text, jsonb, text, jsonb, text, jsonb, text, text, boolean, text),
  public.team_connection_delete(uuid), public.meet_team_event(uuid), public.meet_team_progress(uuid),
  public.staff_meet_team_fill(uuid, boolean), public.meet_team_todo() to authenticated;

-- ── 6. Beach Blitz: Meet a team boxes ───────────────────────────────────
-- 3 boxes in every Saturday qualification slot (day 1) and every Sunday
-- (day 2) qualification or playoff slot that starts before noon. A slot that
-- already names meet_team is left alone, so a staff edit is never undone.
update public.role_slot_templates t
   set slots = (select jsonb_agg(case when not (e.value -> 'needs' ? 'meet_team')
                                       and ((e.value ->> 'day' = '1' and e.value ->> 'label' like 'Qualifications%')
                                         or (e.value ->> 'day' = '2' and e.value ->> 'label' ~ '^(Qualifications|Playoffs)' and e.value ->> 'start' < '12:00'))
                                      then jsonb_set(e.value, '{needs}', (e.value -> 'needs') || '{"meet_team":3}'::jsonb)
                                      else e.value end order by e.pos)
                  from jsonb_array_elements(t.slots) with ordinality as e(value, pos))
 where t.name = 'Beach Blitz (3 days, Friday load-in)';

do $live$
declare ev record; d0 date;
begin
  select id, starts_at into ev from public.events where id = 'f891929e-d8bb-4a3e-9f12-c5c0aca3e886';
  if ev.id is null then return; end if;
  d0 := (ev.starts_at at time zone 'America/Los_Angeles')::date;
  update public.role_slots s set needs = s.needs || '{"meet_team":3}'::jsonb, updated_at = now()
   where s.event_id = ev.id and not (s.needs ? 'meet_team')
     and ((s.day = d0 + 1 and s.label like 'Qualifications%')
       or (s.day = d0 + 2 and s.label ~ '^(Qualifications|Playoffs)' and (s.starts_at at time zone 'America/Los_Angeles')::time < time '12:00'));
end
$live$;

-- ── 7. connector log tables and the merge rules ─────────────────────────
do $connector$
begin
  if to_regclass('public.connector_log_tables') is not null then
    insert into public.connector_log_tables (table_name, note) values
      ('team_connections', 'Meet a team notes (0035)'), ('team_connection_contacts', 'Meet a team contacts (0035)')
    on conflict (table_name) do nothing;
  end if;
end
$connector$;

-- The account merge (0020) must know every column that names a member. 0031
-- last replaced this list; copied here with team_connections.member_id and
-- updated_by added. Paste 0035 again after any re-paste of 0020, 0022, 0024,
-- 0026, 0028, 0029 or 0031.
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
    ('drive_sessions', 'member_id', 'move'),
    ('drive_sessions', 'logged_by', 'move'),
    ('drive_sessions', 'updated_by', 'move'),
    ('drive_sessions', 'voided_by', 'move'),
    ('driver_ratings', 'driver_id', 'move'),
    ('driver_ratings', 'coach_id', 'move'),
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
    ('role_requests', 'status_by', 'move'),
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
    ('team_weeks', 'posted_by', 'move'),
    ('team_connections', 'member_id', 'move'),
    ('team_connections', 'updated_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated;
