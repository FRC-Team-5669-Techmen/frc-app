-- ============================================================
-- 0026_battery_log: the battery record for the pits (ledger 0017)
--
-- Run once in the Supabase SQL editor, AFTER 0001 to 0025. Re-runnable:
-- tables and indexes are "if not exists", functions are create or replace,
-- every policy is dropped (by the name this file gives it) and created again.
--
-- WHY. Before Beach Blitz 2026 half the team's batteries were bad and two
-- matches were lost to brownouts. Nobody could say which battery was in the
-- robot, how it measured before the match, or which ones had browned out
-- before. This is that record, reachable from a phone in the pits.
--
-- WHAT THIS ADDS.
--   batteries      one row per battery: label (B01), brand and model, year
--                  acquired, status (competition, practice, retired), charge
--                  state (charged, charging, needs_charge, in_robot), notes.
--   battery_runs   one row per use: battery, member, when, kind (match,
--                  practice_match, drive_practice, bench_test), an optional
--                  calendar event and match label, resting voltage before,
--                  voltage after, internal resistance in milliohms (Battery
--                  Beak), minutes, brownout (yes, no, unknown), a 1-5
--                  performance score, notes. A measurement not taken is NULL,
--                  never 0.
--
-- WHO.
--   read           approved, active students and staff. Parent-only
--                  accounts read nothing (a parent who is also staff is
--                  staff). Signed out reads nothing.
--   log a run      the same people, through battery_log_run.
--   charge state   the same people, through battery_set_charge.
--   edit a run     its author for 24 hours after logging it; staff any time
--                  (battery_edit_run).
--   batteries      staff add, edit and retire (battery_save), and add a
--                  numbered set in one action (battery_add_set: B01 to B12).
-- No client may insert, update or delete either table directly: every write
-- is one of the functions below (decision 0019's rule, src/writeVia.js).
-- Nothing is ever deleted; a dead battery is retired.
--
-- A run of a match, practice match or drive practice marks a battery that
-- was charged or in the robot as needs_charge (a bench test does not). That
-- saves a tap in the pits and is a proposed default.
--
-- TO UNDO (before any real data is in it): drop function
-- public.battery_add_set(text, integer, integer, text, integer, text),
-- public.battery_save(uuid, text, text, integer, text, text),
-- public.battery_set_charge(uuid, text),
-- public.battery_log_run(uuid, text, uuid, text, numeric, numeric, numeric, integer, text, integer, text, timestamptz),
-- public.battery_edit_run(uuid, text, uuid, text, numeric, numeric, numeric, integer, text, integer, text),
-- public._battery_member_ok(); drop table public.battery_runs, public.batteries;
-- then paste _merge_member_rules from 0024 again. After real use, export the
-- CSV from /batteries first.
-- ============================================================

do $prereq$
begin
  if to_regclass('public.member_roles') is null or to_regclass('public.events') is null then
    raise exception '0026 needs the frozen foundation (member_roles, events) applied first';
  end if;
end
$prereq$;

create table if not exists public.batteries (
  id                uuid primary key default gen_random_uuid(),
  label             text not null,
  brand_model       text,
  year_acquired     integer check (year_acquired between 2000 and 2100),
  status            text not null default 'practice' check (status in ('competition', 'practice', 'retired')),
  charge_state      text not null default 'needs_charge' check (charge_state in ('charged', 'charging', 'needs_charge', 'in_robot')),
  notes             text check (notes is null or length(notes) <= 2000),
  charge_set_at     timestamptz,
  charge_set_by     uuid references public.profiles(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint batteries_label_shape check (label ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$')
);
create unique index if not exists batteries_label_key on public.batteries (upper(label));

create table if not exists public.battery_runs (
  id                uuid primary key default gen_random_uuid(),
  battery_id        uuid not null references public.batteries(id) on delete restrict,
  member_id         uuid not null references public.profiles(id) on delete restrict,
  ran_at            timestamptz not null default now(),
  kind              text not null check (kind in ('match', 'practice_match', 'drive_practice', 'bench_test')),
  event_id          uuid references public.events(id) on delete set null,
  match_label       text check (match_label is null or length(match_label) between 1 and 40),
  voltage_before    numeric(5,2) check (voltage_before is null or voltage_before between 0 and 16),
  voltage_after     numeric(5,2) check (voltage_after is null or voltage_after between 0 and 16),
  resistance_mohm   numeric(6,2) check (resistance_mohm is null or resistance_mohm between 0 and 500),
  minutes           integer check (minutes is null or minutes between 0 and 600),
  brownout          text not null default 'unknown' check (brownout in ('yes', 'no', 'unknown')),
  performance       smallint check (performance is null or performance between 1 and 5),
  notes             text check (notes is null or length(notes) <= 2000),
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists battery_runs_battery_idx on public.battery_runs (battery_id, ran_at desc);
create index if not exists battery_runs_member_idx on public.battery_runs (member_id);

-- Who may use the battery log: approved, active, a student or staff, and not
-- a parent-only account. Same shape as scouting's eligibility (0022), written
-- here so this file does not depend on 0022.
create or replace function public._battery_member_ok()
returns boolean language sql stable security definer set search_path = public as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.approved and coalesce(p.status, 'active') = 'active'
       and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student', 'mentor', 'lead', 'admin'))
       and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')
            or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))));
$fn$;
revoke all on function public._battery_member_ok() from public, anon;
grant execute on function public._battery_member_ok() to authenticated;

alter table public.batteries enable row level security;
alter table public.battery_runs enable row level security;
-- The bootstrap default privileges hand authenticated everything on a new
-- table, and a missing policy fails at 0 rows rather than raising: revoke the
-- writes outright so a direct write is refused, not silently empty.
revoke all on public.batteries, public.battery_runs from public, anon, authenticated;
grant select on public.batteries, public.battery_runs to authenticated;
drop policy if exists batteries_read on public.batteries;
create policy batteries_read on public.batteries for select to authenticated using ((select public._battery_member_ok()));
drop policy if exists battery_runs_read on public.battery_runs;
create policy battery_runs_read on public.battery_runs for select to authenticated using ((select public._battery_member_ok()));

-- Does: Add a numbered set of batteries in one step, such as B01 through B12; labels that already exist are skipped.
create or replace function public.battery_add_set(p_prefix text, p_from integer, p_to integer,
  p_brand_model text default null, p_year integer default null, p_status text default 'practice')
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare n integer; v_label text; v_made text[] := '{}'; v_skipped text[] := '{}'; v_prefix text := upper(btrim(coalesce(p_prefix, 'B')));
begin
  if not public.is_staff() or not public._battery_member_ok() then raise exception 'Only staff can add batteries.' using errcode = '42501'; end if;
  if v_prefix !~ '^[A-Z]{1,6}$' then raise exception 'Use one to six letters before the number, such as B.' using errcode = '22023'; end if;
  if p_from is null or p_to is null or p_from < 0 or p_to < p_from or p_to > 999 or p_to - p_from >= 60 then
    raise exception 'Choose a range of at most 60 numbers, such as 1 to 12.' using errcode = '22023';
  end if;
  if coalesce(p_status, 'practice') not in ('competition', 'practice') then raise exception 'A new battery is competition or practice.' using errcode = '22023'; end if;
  for n in p_from .. p_to loop
    v_label := v_prefix || lpad(n::text, 2, '0');
    if exists (select 1 from public.batteries where upper(label) = v_label) then
      v_skipped := v_skipped || v_label;
    else
      insert into public.batteries (label, brand_model, year_acquired, status, created_by, updated_by)
      values (v_label, nullif(btrim(p_brand_model), ''), p_year, coalesce(p_status, 'practice'), auth.uid(), auth.uid());
      v_made := v_made || v_label;
    end if;
  end loop;
  return jsonb_build_object('created', to_jsonb(v_made), 'skipped', to_jsonb(v_skipped));
end
$fn$;

-- Does: Add one battery, or change a battery's label, brand and model, year, status (retire it) or notes.
create or replace function public.battery_save(p_id uuid, p_label text, p_brand_model text default null,
  p_year integer default null, p_status text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare b public.batteries; v_label text := btrim(coalesce(p_label, ''));
begin
  if not public.is_staff() or not public._battery_member_ok() then raise exception 'Only staff can add or change batteries.' using errcode = '42501'; end if;
  if v_label !~ '^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$' then raise exception 'A label is 1 to 20 letters or numbers, such as B07.' using errcode = '22023'; end if;
  if p_status is not null and p_status not in ('competition', 'practice', 'retired') then raise exception 'Status is competition, practice or retired.' using errcode = '22023'; end if;
  if exists (select 1 from public.batteries where upper(label) = upper(v_label) and id is distinct from p_id) then
    raise exception 'Another battery is already labeled %.', v_label using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.batteries (label, brand_model, year_acquired, status, notes, created_by, updated_by)
    values (v_label, nullif(btrim(p_brand_model), ''), p_year, coalesce(p_status, 'practice'), nullif(btrim(p_notes), ''), auth.uid(), auth.uid())
    returning * into b;
  else
    update public.batteries set label = v_label, brand_model = nullif(btrim(p_brand_model), ''), year_acquired = p_year,
           status = coalesce(p_status, status), notes = nullif(btrim(p_notes), ''), updated_by = auth.uid(), updated_at = now()
     where id = p_id returning * into b;
    if b.id is null then raise exception 'No such battery.' using errcode = 'P0002'; end if;
  end if;
  return to_jsonb(b);
end
$fn$;

-- Does: Set a battery's charge state: charged, charging, needs charge or in the robot.
create or replace function public.battery_set_charge(p_battery uuid, p_state text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare b public.batteries; v_prev text;
begin
  if not public._battery_member_ok() then raise exception 'The battery log is for approved students and staff.' using errcode = '42501'; end if;
  if p_state is null or p_state not in ('charged', 'charging', 'needs_charge', 'in_robot') then
    raise exception 'Charge state is charged, charging, needs_charge or in_robot.' using errcode = '22023';
  end if;
  select charge_state into v_prev from public.batteries where id = p_battery for update;
  if not found then raise exception 'No such battery.' using errcode = 'P0002'; end if;
  update public.batteries set charge_state = p_state, charge_set_at = now(), charge_set_by = auth.uid(), updated_at = now()
   where id = p_battery returning * into b;
  return jsonb_build_object('id', b.id, 'label', b.label, 'charge_state', b.charge_state, 'previous', v_prev, 'charge_set_at', b.charge_set_at);
end
$fn$;

create or replace function public._battery_check_run(p_kind text, p_match text, p_vb numeric, p_va numeric, p_res numeric,
  p_minutes integer, p_brownout text, p_perf integer, p_notes text)
returns void language plpgsql immutable set search_path = public as $fn$
begin
  if p_kind is null or p_kind not in ('match', 'practice_match', 'drive_practice', 'bench_test') then
    raise exception 'Kind is match, practice_match, drive_practice or bench_test.' using errcode = '22023'; end if;
  if p_brownout is null or p_brownout not in ('yes', 'no', 'unknown') then
    raise exception 'Brownout is yes, no or unknown.' using errcode = '22023'; end if;
  if p_vb is not null and (p_vb < 0 or p_vb > 16) or p_va is not null and (p_va < 0 or p_va > 16) then
    raise exception 'Voltages are between 0 and 16 volts.' using errcode = '22023'; end if;
  if p_res is not null and (p_res < 0 or p_res > 500) then raise exception 'Resistance is between 0 and 500 milliohms.' using errcode = '22023'; end if;
  if p_minutes is not null and (p_minutes < 0 or p_minutes > 600) then raise exception 'Minutes are between 0 and 600.' using errcode = '22023'; end if;
  if p_perf is not null and (p_perf < 1 or p_perf > 5) then raise exception 'Performance is 1 to 5.' using errcode = '22023'; end if;
  if p_match is not null and length(btrim(p_match)) > 40 then raise exception 'A match label is at most 40 characters.' using errcode = '22023'; end if;
  if p_notes is not null and length(p_notes) > 2000 then raise exception 'Notes are at most 2000 characters.' using errcode = '22023'; end if;
end
$fn$;
revoke all on function public._battery_check_run(text, text, numeric, numeric, numeric, integer, text, integer, text) from public, anon, authenticated;

-- Does: Log one use of a battery: the kind, the match, voltage before and after, resistance, minutes and whether it browned out.
create or replace function public.battery_log_run(p_battery uuid, p_kind text, p_event uuid default null, p_match text default null,
  p_voltage_before numeric default null, p_voltage_after numeric default null, p_resistance numeric default null,
  p_minutes integer default null, p_brownout text default 'unknown', p_performance integer default null,
  p_notes text default null, p_ran_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.battery_runs; b public.batteries; v_charge text;
begin
  if not public._battery_member_ok() then raise exception 'The battery log is for approved students and staff.' using errcode = '42501'; end if;
  select * into b from public.batteries where id = p_battery for update;
  if b.id is null then raise exception 'No such battery.' using errcode = 'P0002'; end if;
  if b.status = 'retired' then raise exception 'Battery % is retired. A staff member can bring it back first.', b.label using errcode = '22023'; end if;
  perform public._battery_check_run(p_kind, p_match, p_voltage_before, p_voltage_after, p_resistance, p_minutes, coalesce(p_brownout, 'unknown'), p_performance, p_notes);
  if p_event is not null and not exists (select 1 from public.events where id = p_event) then raise exception 'No such event.' using errcode = '22023'; end if;
  if p_ran_at is not null and (p_ran_at > now() + interval '10 minutes' or p_ran_at < now() - interval '60 days') then
    raise exception 'A run is logged within 60 days of when it happened.' using errcode = '22023'; end if;
  insert into public.battery_runs (battery_id, member_id, ran_at, kind, event_id, match_label, voltage_before, voltage_after,
                                   resistance_mohm, minutes, brownout, performance, notes, updated_by)
  values (p_battery, auth.uid(), coalesce(p_ran_at, now()), p_kind, p_event, nullif(btrim(p_match), ''), p_voltage_before, p_voltage_after,
          p_resistance, p_minutes, coalesce(p_brownout, 'unknown'), p_performance, nullif(btrim(p_notes), ''), auth.uid())
  returning * into r;
  v_charge := b.charge_state;
  if p_kind <> 'bench_test' and b.charge_state in ('charged', 'in_robot') then
    update public.batteries set charge_state = 'needs_charge', charge_set_at = now(), charge_set_by = auth.uid(), updated_at = now() where id = b.id;
    v_charge := 'needs_charge';
  end if;
  return to_jsonb(r) || jsonb_build_object('battery_label', b.label, 'charge_state', v_charge, 'previous_charge_state', b.charge_state);
end
$fn$;

-- Does: Correct a battery run: its author within 24 hours of logging it, staff any time.
create or replace function public.battery_edit_run(p_run uuid, p_kind text, p_event uuid default null, p_match text default null,
  p_voltage_before numeric default null, p_voltage_after numeric default null, p_resistance numeric default null,
  p_minutes integer default null, p_brownout text default 'unknown', p_performance integer default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare r public.battery_runs;
begin
  if not public._battery_member_ok() then raise exception 'The battery log is for approved students and staff.' using errcode = '42501'; end if;
  select * into r from public.battery_runs where id = p_run for update;
  if r.id is null then raise exception 'No such run.' using errcode = 'P0002'; end if;
  if not public.is_staff() and (r.member_id <> auth.uid() or r.created_at < now() - interval '24 hours') then
    raise exception 'You can correct your own run for 24 hours after logging it. Ask a mentor after that.' using errcode = '42501';
  end if;
  perform public._battery_check_run(p_kind, p_match, p_voltage_before, p_voltage_after, p_resistance, p_minutes, coalesce(p_brownout, 'unknown'), p_performance, p_notes);
  if p_event is not null and not exists (select 1 from public.events where id = p_event) then raise exception 'No such event.' using errcode = '22023'; end if;
  update public.battery_runs set kind = p_kind, event_id = p_event, match_label = nullif(btrim(p_match), ''),
         voltage_before = p_voltage_before, voltage_after = p_voltage_after, resistance_mohm = p_resistance, minutes = p_minutes,
         brownout = coalesce(p_brownout, 'unknown'), performance = p_performance, notes = nullif(btrim(p_notes), ''),
         updated_by = auth.uid(), updated_at = now()
   where id = p_run returning * into r;
  return to_jsonb(r);
end
$fn$;

revoke all on function public.battery_add_set(text, integer, integer, text, integer, text) from public, anon;
revoke all on function public.battery_save(uuid, text, text, integer, text, text) from public, anon;
revoke all on function public.battery_set_charge(uuid, text) from public, anon;
revoke all on function public.battery_log_run(uuid, text, uuid, text, numeric, numeric, numeric, integer, text, integer, text, timestamptz) from public, anon;
revoke all on function public.battery_edit_run(uuid, text, uuid, text, numeric, numeric, numeric, integer, text, integer, text) from public, anon;
grant execute on function public.battery_add_set(text, integer, integer, text, integer, text) to authenticated;
grant execute on function public.battery_save(uuid, text, text, integer, text, text) to authenticated;
grant execute on function public.battery_set_charge(uuid, text) to authenticated;
grant execute on function public.battery_log_run(uuid, text, uuid, text, numeric, numeric, numeric, integer, text, integer, text, timestamptz) to authenticated;
grant execute on function public.battery_edit_run(uuid, text, uuid, text, numeric, numeric, numeric, integer, text, integer, text) to authenticated;

-- The connector (0018, 0021) records the rows a call wrote from the tables it
-- lists. Skipped when the connector is not applied.
do $connector$
begin
  if to_regclass('public.connector_log_tables') is not null then
    insert into public.connector_log_tables (table_name, note) values
      ('batteries', 'Battery log (0026)'), ('battery_runs', 'Battery runs (0026)')
    on conflict (table_name) do nothing;
  end if;
end
$connector$;

-- The account merge (0020) must know every column that names a member. 0024
-- last replaced this list; it is copied here with the four battery columns
-- added. Re-pasting 0020, 0022 or 0024 after this file drops them; paste
-- 0026 again after any of those.
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
    ('safety_violations', 'member_id', 'move'),
    ('safety_violations', 'logged_by', 'move'),
    ('session_corrections', 'member_id', 'move'),
    ('session_corrections', 'reviewed_by', 'move'),
    ('session_reviews', 'user_id', 'move'),
    ('session_reviews', 'reviewed_by', 'move'),
    ('signout_requests', 'member_id', 'move'),
    ('signout_requests', 'decided_by', 'move'),
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
