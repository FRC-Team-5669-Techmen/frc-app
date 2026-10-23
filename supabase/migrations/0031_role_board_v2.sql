-- ============================================================
-- 0031_role_board_v2: the role board assigns per time slot, never blocks
-- staff, and carries backups (ledger 0023)
--
-- Applied by migrate.yml in one transaction, AFTER 0028 (role board), 0029
-- and 0030. Re-runnable: every step checks before it changes anything.
--
-- WHY. Beach Blitz 2026 (Oct 30 to Nov 1). Mr. Pina filled the board in
-- front of the team and hit three walls: assigning a scout in Quals 1 made
-- them look assigned in every slot they asked for (event_roles has no slot);
-- clicking Assign on himself as drive coach raised the eligibility popup
-- (staff decisions are final); and there was no way to name backups or to
-- put more people in a box than it needs.
--
-- WHAT THIS CHANGES.
--   role_requests gains status (asked | assigned | backup), status_by and
--     status_at. The status of a request IS the per slot assignment. A cell
--     is unfilled while assigned < needed; asks and backups do not fill it.
--   staff_set_request_status(request, status)   staff: assigned, backup,
--     asked, or removed (deletes the row). No eligibility check, no cap.
--   staff_add_to_slot(slot, member, role, status)   staff: put anyone in a
--     box who did not ask, as assigned or backup.
--   staff_set_role_statuses(event, items)   staff: many changes in one call,
--     all or nothing, members by name, a slot by label or a whole day (the
--     connector tool assign_roles).
--   staff_assign_from_request(request, reason)   kept for the connector; it
--     now sets the request to assigned. It no longer calls staff_assign_role,
--     so event_role_blocker never runs from the board.
--   role_withdraw   takes back only a request still at asked; an assigned or
--     backup row stays until staff change it.
--   role_board(event)   every request carries status; every slot carries
--     counts per role: needed, assigned, backup, asked, requested.
--   _role_slot_cells and role_board_open_events count unfilled as needed
--     minus assigned.
--   event_roles stays in step, without the blocker: assigning a slot inserts
--     the event level row if missing; when the member holds no assigned slot
--     in that role any more, a row the board made (reason names the role
--     board) is removed. Rows staff made on the roster page are never touched.
--   team_captain joins the role vocabulary (event_roles check, _role_valid).
--   Beach Blitz: the template and the live event (f891929e) gain lunch pit
--     watch slots on both competition days, and Alliance selection needs
--     exactly team captain 1, scouting lead 1, drive coach 1. Live slots are
--     updated in place by label; none is deleted or recreated.
--
-- TO UNDO: paste 0028 again (it restores the functions and the 0028
-- vocabulary check only if no event_roles row says team_captain), then
-- alter table public.role_requests drop column status, drop column status_by,
-- drop column status_at; drop function public.staff_set_request_status(uuid, text),
-- public.staff_add_to_slot(uuid, uuid, text, text), public._role_board_sync(uuid, uuid, text, text);
-- paste 0029 again for _merge_member_rules.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public.role_board(uuid)') is null then
    raise exception '0031 needs 0028_role_interest_board.sql applied first';
  end if;
end
$prereq$;

-- ── 1. team captain joins the role list ─────────────────────────────────
do $roles$
declare c text;
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_roles'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%team_captain%') then
    for c in select conname from pg_constraint where conrelid = 'public.event_roles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%driver%operator%' loop
      execute format('alter table public.event_roles drop constraint %I', c);
    end loop;
    alter table public.event_roles add constraint event_roles_role_check check (role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew',
      'impact_presenter', 'pit_speaker', 'scouting_lead', 'scout', 'media', 'safety_captain', 'battery_captain', 'team_captain'));
  end if;
end
$roles$;

create or replace function public._role_valid(p_role text)
returns boolean language sql immutable set search_path = public as $fn$
  select p_role in ('driver', 'operator', 'human_player', 'drive_coach', 'pit_crew', 'impact_presenter', 'pit_speaker',
                    'scouting_lead', 'scout', 'media', 'safety_captain', 'battery_captain', 'team_captain');
$fn$;
revoke all on function public._role_valid(text) from public, anon;

-- ── 2. per slot status on a request ─────────────────────────────────────
alter table public.role_requests add column if not exists status text not null default 'asked';
alter table public.role_requests add column if not exists status_by uuid references public.profiles(id) on delete set null;
alter table public.role_requests add column if not exists status_at timestamptz;
do $chk$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.role_requests'::regclass and conname = 'role_requests_status_check') then
    alter table public.role_requests add constraint role_requests_status_check check (status in ('asked', 'assigned', 'backup'));
  end if;
end
$chk$;
-- Writes go through the functions below; no client writes the table.
revoke insert, update, delete, truncate on public.role_requests from public, anon, authenticated;
create index if not exists role_requests_slot_status_idx on public.role_requests (slot_id, role, status);

-- An assignment made through 0028 named its slot in the reason. That slot,
-- and only that slot, becomes assigned; every other ask stays an ask.
update public.role_requests r
   set status = 'assigned', status_by = er.assigned_by, status_at = er.assigned_at
  from public.event_roles er join public.role_slots s on s.event_id = er.event_id
 where r.slot_id = s.id and r.member_id = er.member_id and r.role = er.role and r.status = 'asked'
   and er.reason = 'Asked for it on the role board (' || s.label || ')';

-- ── 3. event_roles in step, without the blocker ─────────────────────────
-- Inserts the event level row when the member holds an assigned slot in the
-- role; removes a row the board made when they hold none. Never raises: a
-- failure here must not undo the staff decision on the board.
create or replace function public._role_board_sync(p_event uuid, p_member uuid, p_role text, p_label text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if exists (select 1 from public.role_requests r join public.role_slots s on s.id = r.slot_id
              where s.event_id = p_event and r.member_id = p_member and r.role = p_role and r.status = 'assigned') then
    insert into public.event_roles (event_id, member_id, role, reason, assigned_by)
    values (p_event, p_member, p_role, 'Assigned on the role board (' || coalesce(p_label, 'slot') || ')', auth.uid())
    on conflict (event_id, member_id, role) do nothing;
  else
    delete from public.event_roles
     where event_id = p_event and member_id = p_member and role = p_role and reason ilike '%role board%';
  end if;
exception when others then
  raise warning 'role board: event_roles not synced: %', sqlerrm;
end
$fn$;
revoke all on function public._role_board_sync(uuid, uuid, text, text) from public, anon, authenticated;

-- ── 4. staff decide ─────────────────────────────────────────────────────
-- Does: Mark one person in a role board box as assigned, backup or asked, or remove them from the box. Staff only; no cap and no eligibility check.
create or replace function public.staff_set_request_status(p_request uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.role_requests; s public.role_slots;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('asked', 'assigned', 'backup', 'removed') then
    raise exception 'Status is assigned, backup, asked or removed.' using errcode = '22023'; end if;
  select * into r from public.role_requests where id = p_request for update;
  if r.id is null then raise exception 'No such request.' using errcode = 'P0002'; end if;
  select * into s from public.role_slots where id = r.slot_id;
  if p_status = 'removed' then
    delete from public.role_requests where id = r.id;
    perform public._role_board_sync(s.event_id, r.member_id, r.role, s.label);
    return to_jsonb(r) || jsonb_build_object('status', 'removed');
  end if;
  update public.role_requests set status = p_status, status_by = auth.uid(), status_at = now() where id = r.id returning * into r;
  perform public._role_board_sync(s.event_id, r.member_id, r.role, s.label);
  return to_jsonb(r);
end
$fn$;

-- Does: Put a member in a role board box who did not ask for it, as assigned or backup. Staff only.
create or replace function public.staff_add_to_slot(p_slot uuid, p_member uuid, p_role text, p_status text default 'assigned')
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.role_requests; s public.role_slots;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if coalesce(p_status, 'assigned') not in ('asked', 'assigned', 'backup') then raise exception 'Status is assigned, backup or asked.' using errcode = '22023'; end if;
  if not public._role_valid(p_role) then raise exception 'Unknown role.' using errcode = '22023'; end if;
  select * into s from public.role_slots where id = p_slot;
  if s.id is null then raise exception 'No such time slot.' using errcode = 'P0002'; end if;
  if not (s.needs ? p_role) then raise exception 'That role is not needed in this slot.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_member and p.approved and coalesce(p.status, 'active') = 'active') then
    raise exception 'No such active member.' using errcode = 'P0002'; end if;
  insert into public.role_requests (slot_id, member_id, role, status, status_by, status_at)
  values (p_slot, p_member, p_role, coalesce(p_status, 'assigned'), auth.uid(), now())
  on conflict (slot_id, member_id, role) do update set status = excluded.status, status_by = excluded.status_by, status_at = excluded.status_at
  returning * into r;
  perform public._role_board_sync(s.event_id, r.member_id, r.role, s.label);
  return to_jsonb(r);
end
$fn$;

-- Does: Assign the person who asked for a role in a time slot, for that slot only. Staff only; no eligibility check.
create or replace function public.staff_assign_from_request(p_request uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r jsonb; v public.event_roles;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  r := public.staff_set_request_status(p_request, 'assigned');
  select er.* into v from public.event_roles er join public.role_slots s on s.event_id = er.event_id
   where s.id = (r ->> 'slot_id')::uuid and er.member_id = (r ->> 'member_id')::uuid and er.role = r ->> 'role';
  return case when v.id is null then r else to_jsonb(v) || jsonb_build_object('request', r) end;
end
$fn$;

-- Many role board changes in one call, all or nothing, for the connector and
-- for staff working fast. Each item is one of:
--   {"request_id": id, "status": s}
--   {"member": name or id, "role": r, "status": s, and one of
--      "slot_id": id | "slot": label (with optional "day") | "day": date or weekday name}
-- A day means every slot that day that needs the role. Status is assigned,
-- backup, asked or removed. A name must match exactly one active member; an
-- unknown or ambiguous name, slot or role writes nothing and says which.
create or replace function public._role_board_member_by_name(p_name text)
returns uuid language plpgsql stable security definer set search_path = public as $fn$
declare ids uuid[]; n text := lower(btrim(p_name));
begin
  if n in ('me', 'myself') then return auth.uid(); end if;
  if n ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return n::uuid; end if;
  select array_agg(p.id) into ids from public.profiles p
   where p.approved and coalesce(p.status, 'active') = 'active' and (lower(btrim(p.full_name)) = n or lower(btrim(p.nickname)) = n);
  if coalesce(array_length(ids, 1), 0) = 0 then
    select array_agg(p.id) into ids from public.profiles p
     where p.approved and coalesce(p.status, 'active') = 'active'
       and (lower(p.full_name) like n || ' %' or lower(p.full_name) like '% ' || n or lower(p.nickname) like n || '%');
  end if;
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'No active member matches "%". Nothing was changed.', p_name using errcode = 'P0002'; end if;
  if array_length(ids, 1) > 1 then
    raise exception 'More than one member matches "%": %. Use the full name. Nothing was changed.', p_name,
      (select string_agg(public._member_name(x), ', ' order by public._member_name(x)) from unnest(ids) x) using errcode = '22023';
  end if;
  return ids[1];
end
$fn$;
revoke all on function public._role_board_member_by_name(text) from public, anon, authenticated;

-- Does: Change many role board boxes at once for an event: assign, back up, set to asked or remove members by name, for one slot, a slot label, or every slot on a day. Staff only; all or nothing.
create or replace function public.staff_set_role_statuses(p_event uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; st text; m uuid; rl text; sl record; nslots integer; out jsonb := '[]'::jsonb; req uuid; r jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event) then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Give at least one change.' using errcode = '22023'; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    st := it ->> 'status';
    if st is null or st not in ('asked', 'assigned', 'backup', 'removed') then raise exception 'Status is assigned, backup, asked or removed (item %).', it using errcode = '22023'; end if;
    if it ? 'request_id' then
      if not exists (select 1 from public.role_requests q join public.role_slots s on s.id = q.slot_id where q.id = (it ->> 'request_id')::uuid and s.event_id = p_event) then
        raise exception 'No such request at this event (item %).', it using errcode = 'P0002'; end if;
      r := public.staff_set_request_status((it ->> 'request_id')::uuid, st);
      out := out || jsonb_build_array(r);
      continue;
    end if;
    rl := it ->> 'role';
    if rl is null or not public._role_valid(rl) then raise exception 'Unknown role % (item %).', coalesce(rl, 'none'), it using errcode = '22023'; end if;
    m := coalesce((it ->> 'member_id')::uuid, public._role_board_member_by_name(it ->> 'member'));
    if m is null then raise exception 'Name the member (item %).', it using errcode = '22023'; end if;
    nslots := 0;
    for sl in
      select s.* from public.role_slots s
       where s.event_id = p_event
         and case
               when it ? 'slot_id' then s.id = (it ->> 'slot_id')::uuid
               when it ? 'slot' then lower(btrim(s.label)) = lower(btrim(it ->> 'slot'))
                 and (not (it ? 'day') or s.day::text = it ->> 'day' or lower(to_char(s.day, 'FMDay')) = lower(it ->> 'day'))
               when it ? 'day' then (s.day::text = it ->> 'day' or lower(to_char(s.day, 'FMDay')) = lower(it ->> 'day')) and s.needs ? rl
               else false end
       order by s.day, s.starts_at, s.position
    loop
      nslots := nslots + 1;
      if st = 'removed' then
        select id into req from public.role_requests where slot_id = sl.id and member_id = m and role = rl;
        if req is not null then out := out || jsonb_build_array(public.staff_set_request_status(req, 'removed')); end if;
      else
        out := out || jsonb_build_array(public.staff_add_to_slot(sl.id, m, rl, st) || jsonb_build_object('slot', sl.label, 'day', sl.day));
      end if;
    end loop;
    if nslots = 0 then raise exception 'No slot at this event matches item %. Nothing was changed.', it using errcode = 'P0002'; end if;
  end loop;
  return jsonb_build_object('changed', jsonb_array_length(out), 'items', out);
end
$fn$;

-- ── 5. members ask and take back ────────────────────────────────────────
-- Does: Take back your own request for a role in a time slot, while it is still only an ask.
create or replace function public.role_withdraw(p_slot uuid, p_role text)
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if not public._role_board_member_ok() then raise exception 'The role board is for approved students and staff.' using errcode = '42501'; end if;
  delete from public.role_requests where slot_id = p_slot and role = p_role and member_id = auth.uid() and status = 'asked';
  get diagnostics n = row_count;
  if n = 0 and exists (select 1 from public.role_requests where slot_id = p_slot and role = p_role and member_id = auth.uid()) then
    raise exception 'A mentor has you down for this one. Ask a mentor to change it.' using errcode = '22023';
  end if;
  return n;
end
$fn$;

-- ── 6. the board reads status ───────────────────────────────────────────
-- Does: Read the role interest board for an event: time slots, how many of each role are needed, who asked, who is assigned or backup, and what is still unfilled.
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
                                 'status', r.status, 'assigned', r.status = 'assigned') order by r.created_at)
                              from public.role_requests r where r.slot_id = s.id), '[]'::jsonb),
        'counts', coalesce((select jsonb_object_agg(n.key, jsonb_build_object(
                     'needed', case when jsonb_typeof(n.value) = 'number' then (n.value #>> '{}')::integer else 0 end,
                     'assigned', (select count(*) from public.role_requests r where r.slot_id = s.id and r.role = n.key and r.status = 'assigned'),
                     'backup', (select count(*) from public.role_requests r where r.slot_id = s.id and r.role = n.key and r.status = 'backup'),
                     'asked', (select count(*) from public.role_requests r where r.slot_id = s.id and r.role = n.key and r.status = 'asked'),
                     'requested', (select count(*) from public.role_requests r where r.slot_id = s.id and r.role = n.key)))
                   from jsonb_each(s.needs) n), '{}'::jsonb))
        order by s.day, s.starts_at, s.position) from public.role_slots s where s.event_id = p_event), '[]'::jsonb),
    'assigned', coalesce((select jsonb_agg(jsonb_build_object('member_id', er.member_id, 'name', public._member_name(er.member_id), 'role', er.role))
                            from public.event_roles er where er.event_id = p_event and (public.is_staff() or exists (select 1 from public.event_rosters x where x.event_id = p_event))), '[]'::jsonb),
    'me', auth.uid());
end
$fn$;

-- Cells for one event with needed, requested and assigned. Unfilled means
-- assigned below needed.
drop function if exists public._role_slot_cells(uuid);
create function public._role_slot_cells(p_event uuid)
returns table (slot_id uuid, day date, label text, role text, needed integer, requested integer, assigned integer)
language sql stable security definer set search_path = public as $fn$
  select s.id, s.day, s.label, n.key, (n.value #>> '{}')::integer,
         (select count(*)::integer from public.role_requests r where r.slot_id = s.id and r.role = n.key),
         (select count(*)::integer from public.role_requests r where r.slot_id = s.id and r.role = n.key and r.status = 'assigned')
    from public.role_slots s cross join lateral jsonb_each(s.needs) n
   where s.event_id = p_event and jsonb_typeof(n.value) = 'number' and (n.value #>> '{}')::integer > 0;
$fn$;
revoke all on function public._role_slot_cells(uuid) from public, anon, authenticated;

-- Does: Upcoming competitions whose role board still has unfilled slots (fewer assigned than needed), with how many cells are unfilled.
create or replace function public.role_board_open_events()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public._role_board_member_ok() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'title', e.title, 'starts_at', e.starts_at,
             'unfilled', (select count(*) from public._role_slot_cells(e.id) c where c.assigned < c.needed),
             'mine', (select count(*) from public.role_requests r join public.role_slots s on s.id = r.slot_id where s.event_id = e.id and r.member_id = auth.uid()),
             'my_assigned', (select count(*) from public.role_requests r join public.role_slots s on s.id = r.slot_id where s.event_id = e.id and r.member_id = auth.uid() and r.status = 'assigned'))
             order by e.starts_at)
    from public.events e
   where e.ends_at > now() and e.starts_at < now() + interval '21 days'
     and exists (select 1 from public.role_slots s where s.event_id = e.id)
     and exists (select 1 from public._role_slot_cells(e.id) c where c.assigned < c.needed)), '[]'::jsonb);
end
$fn$;

revoke all on function public.staff_set_request_status(uuid, text), public.staff_add_to_slot(uuid, uuid, text, text), public.staff_set_role_statuses(uuid, jsonb),
  public.staff_assign_from_request(uuid, text), public.role_withdraw(uuid, text), public.role_board(uuid), public.role_board_open_events() from public, anon;
grant execute on function public.staff_set_request_status(uuid, text), public.staff_add_to_slot(uuid, uuid, text, text), public.staff_set_role_statuses(uuid, jsonb),
  public.staff_assign_from_request(uuid, text), public.role_withdraw(uuid, text), public.role_board(uuid), public.role_board_open_events() to authenticated;

-- ── 7. Beach Blitz: lunch pit watch and alliance selection ──────────────
-- Matches pause for lunch 12:00 to 13:00 on both competition days; the pit
-- stays staffed in two half hour watches.
update public.role_slot_templates t
   set slots = (select jsonb_agg(case when e.value ->> 'label' = 'Alliance selection'
                                      then jsonb_set(e.value, '{needs}', '{"team_captain":1,"scouting_lead":1,"drive_coach":1}'::jsonb)
                                      else e.value end order by e.pos)
                  from jsonb_array_elements(t.slots) with ordinality as e(value, pos))
            || coalesce((select jsonb_agg(x.v order by x.o)
                           from (values
                             (1, '{"day":1,"label":"Lunch: pit watch A","start":"12:00","end":"12:30","needs":{"pit_crew":1,"battery_captain":1}}'::jsonb),
                             (2, '{"day":1,"label":"Lunch: pit watch B","start":"12:30","end":"13:00","needs":{"pit_crew":1,"battery_captain":1}}'::jsonb),
                             (3, '{"day":2,"label":"Lunch: pit watch A","start":"12:00","end":"12:30","needs":{"pit_crew":1,"battery_captain":1}}'::jsonb),
                             (4, '{"day":2,"label":"Lunch: pit watch B","start":"12:30","end":"13:00","needs":{"pit_crew":1,"battery_captain":1}}'::jsonb)) as x(o, v)
                          where not exists (select 1 from jsonb_array_elements(t.slots) y
                                             where y.value ->> 'label' = x.v ->> 'label' and (y.value ->> 'day') = (x.v ->> 'day'))), '[]'::jsonb)
 where t.name = 'Beach Blitz (3 days, Friday load-in)';

-- The live Beach Blitz event, when it exists and already has slots. Its
-- slots are kept (students may have asked on them); needs change in place.
do $live$
declare ev record; d0 date; d date; k integer; w record;
begin
  select id, starts_at into ev from public.events where id = 'f891929e-d8bb-4a3e-9f12-c5c0aca3e886';
  if ev.id is null or not exists (select 1 from public.role_slots where event_id = ev.id) then return; end if;
  update public.role_slots set needs = '{"team_captain":1,"scouting_lead":1,"drive_coach":1}'::jsonb, updated_at = now()
   where event_id = ev.id and label = 'Alliance selection' and needs <> '{"team_captain":1,"scouting_lead":1,"drive_coach":1}'::jsonb;
  d0 := (ev.starts_at at time zone 'America/Los_Angeles')::date;
  for k in 1..2 loop
    d := d0 + k;
    continue when not exists (select 1 from public.role_slots where event_id = ev.id and day = d);
    for w in select * from (values ('Lunch: pit watch A', '12:00', '12:30', 900), ('Lunch: pit watch B', '12:30', '13:00', 901)) as x(label, st, en, pos) loop
      if not exists (select 1 from public.role_slots where event_id = ev.id and day = d and label = w.label) then
        insert into public.role_slots (event_id, day, label, starts_at, ends_at, needs, position)
        values (ev.id, d, w.label, (d::text || ' ' || w.st)::timestamp at time zone 'America/Los_Angeles',
                (d::text || ' ' || w.en)::timestamp at time zone 'America/Los_Angeles', '{"pit_crew":1,"battery_captain":1}'::jsonb, w.pos);
      end if;
    end loop;
  end loop;
end
$live$;

-- ── 8. the account merge knows status_by ────────────────────────────────
-- 0029 last replaced this list; copied here with role_requests.status_by
-- added. Paste 0031 again after any re-paste of 0020, 0022, 0024, 0026,
-- 0028 or 0029.
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
    ('team_weeks', 'posted_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated;
