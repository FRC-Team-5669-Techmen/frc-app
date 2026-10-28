-- ============================================================
-- 0038_robot_match_log: one record per robot match, practice or real
-- (ledger 0028). Needs 0026, 0028, 0029 and 0037.
--
-- WHY. Mr. Pina, 2026-10-28: every match Team 5669's robot plays becomes one
-- record that joins what the robot measured (its per-match JSON file, schema
-- 1, from FRC-Team-5669-Techmen/2026-5669-Official match-data/matches/) with
-- what people saw, so matches, drivers and batteries can be compared.
--
-- WHAT THIS DOES.
--   public.robot_matches   one row per match. A robot file is stored whole
--                 (raw jsonb, unknown fields kept) with its schema version and
--                 file name (unique: re-importing a file changes nothing). The
--                 numbers people compare are copied into columns. Human fields:
--                 scorer balls in, TOWER, fouls, official score and RP, notes
--                 per role, a video link, the .wpilog file. Links to the crew
--                 (profiles), battery, auto routine, event, and the battery run,
--                 drive session and auto run it wrote. A practice match logged
--                 on the Match Sim page is a row too (source sim_page, one per
--                 sim_matches row, kept in step by a trigger and backfilled
--                 once); importing the same match's robot file fills THAT row
--                 (source both), so it is one record, never two.
--                 RLS on: approved members read (the driver leaderboard's
--                 rule); nobody writes directly, every client privilege but
--                 select is revoked.
--   capability robot.matches   "Can log robot matches", for drive-team leads.
--   public.robot_match_import(file_name, raw, links)   staff or robot.matches:
--                 store a file, link the crew/battery/routine/event, write the
--                 battery run and the driver's drive session (each at most once
--                 per file), fill the official score.
--   public.robot_match_update(id, fields)   the human fields and links.
--   public.robot_match_fill_official(id)   score and RP from the event's
--                 imported TBA results (scouting team records), when present.
--
-- Re-runnable. Re-defines _merge_member_rules from 0037: paste 0038 again
-- after any re-paste of 0020, 0022, 0024, 0026, 0028, 0029, 0031, 0033, 0035
-- or 0037. TO UNDO: drop trigger sim_matches_robot_match on public.sim_matches;
-- drop the functions below; drop table public.robot_matches; delete the
-- robot.matches capability row; paste _merge_member_rules from 0037 again.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public.battery_log_run(uuid,text,uuid,text,numeric,numeric,numeric,integer,text,integer,text,timestamptz)') is null
     or to_regclass('public.sim_matches') is null or to_regclass('public.drive_sessions') is null
     or to_regprocedure('scouting_private.validate_custom(jsonb)') is null then
    raise exception '0038 needs 0026, 0028, 0029 and 0037 applied first';
  end if;
end
$prereq$;

insert into public.capabilities (key, label, description) values
 ('robot.matches', 'Can log robot matches', 'Import robot match files and edit match records: crew, notes, scores. For drive-team leads.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

create table if not exists public.robot_matches (
  id               uuid        primary key default gen_random_uuid(),
  source           text        not null check (source in ('robot_file', 'sim_page', 'both')),
  file_name        text        unique check (file_name is null or file_name ~ '^[A-Za-z0-9._-]{1,120}\.json$'),
  schema_version   integer     check (schema_version is null or schema_version between 1 and 1000),
  raw              jsonb       check (raw is null or jsonb_typeof(raw) = 'object'),
  sim_match_id     uuid        references public.sim_matches(id) on delete set null,
  kind             text        not null check (kind in ('practice', 'qual', 'playoff', 'practice_fms', 'auto_test', 'teleop_session', 'fms')),
  started_at       timestamptz not null,
  robot_match      integer,
  fms              boolean,
  event_code       text        check (event_code is null or length(event_code) <= 40),
  fms_match_type   text        check (fms_match_type is null or length(fms_match_type) <= 40),
  fms_match_number integer,
  match_label      text        check (match_label is null or length(match_label) between 1 and 40),
  event_id         uuid        references public.events(id) on delete set null,
  alliance         text        check (alliance is null or alliance in ('red', 'blue')),
  station          integer,
  auto_name        text        check (auto_name is null or length(auto_name) <= 120),
  routine_id       uuid        references public.auto_routines(id) on delete set null,
  auto_winner      text        check (auto_winner is null or auto_winner in ('red', 'blue')),
  auto_winner_random boolean,
  auto_balls       integer,
  open_balls       integer,
  closed_balls     integer,
  passes           integer,
  balls_total      integer,
  ready_pct        numeric(6,2),
  battery_start    numeric(5,2),
  battery_min      numeric(5,2),
  battery_end      numeric(5,2),
  brownouts        integer,
  hang_at_seconds  numeric(7,2),
  distance_m       numeric(8,2),
  duration_s       numeric(7,2),
  crew_typed       jsonb       not null default '{}'::jsonb,
  driver_id        uuid        references public.profiles(id) on delete set null,
  operator_id      uuid        references public.profiles(id) on delete set null,
  coach_id         uuid        references public.profiles(id) on delete set null,
  human_player_id  uuid        references public.profiles(id) on delete set null,
  battery_id       uuid        references public.batteries(id) on delete set null,
  scorer_balls_in  integer     check (scorer_balls_in is null or scorer_balls_in between 0 and 1000),
  tower            text        check (tower is null or tower in ('none', 'level1', 'level2', 'level3', 'failed')),
  fouls            text        check (fouls is null or length(fouls) <= 500),
  match_score      integer     check (match_score is null or match_score between 0 and 10000),
  ranking_points   numeric(4,1) check (ranking_points is null or ranking_points between 0 and 20),
  official_source  text        check (official_source is null or official_source in ('tba', 'manual')),
  notes_driver     text        check (notes_driver is null or length(notes_driver) <= 2000),
  notes_operator   text        check (notes_operator is null or length(notes_operator) <= 2000),
  notes_coach      text        check (notes_coach is null or length(notes_coach) <= 2000),
  notes_human_player text      check (notes_human_player is null or length(notes_human_player) <= 2000),
  notes_pit        text        check (notes_pit is null or length(notes_pit) <= 2000),
  video_url        text        check (video_url is null or video_url ~ '^https://[^[:space:]]+$'),
  wpilog_file      text        check (wpilog_file is null or wpilog_file ~ '^[A-Za-z0-9._ -]{1,160}$'),
  battery_run_id   uuid        references public.battery_runs(id) on delete set null,
  drive_session_id uuid        references public.drive_sessions(id) on delete set null,
  auto_run_id      uuid        references public.auto_runs(id) on delete set null,
  created_by       uuid        references public.profiles(id) on delete set null,
  updated_by       uuid        references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint robot_matches_file_has_raw check ((file_name is null) = (raw is null))
);
create unique index if not exists robot_matches_sim_key on public.robot_matches (sim_match_id) where sim_match_id is not null;
create index if not exists robot_matches_started_idx on public.robot_matches (started_at desc);
create index if not exists robot_matches_driver_idx on public.robot_matches (driver_id, started_at desc);
create index if not exists robot_matches_battery_idx on public.robot_matches (battery_id, started_at desc);
create index if not exists robot_matches_event_idx on public.robot_matches (event_id);

alter table public.robot_matches enable row level security;
revoke all on public.robot_matches from public, anon, authenticated;
grant select on public.robot_matches to authenticated;
drop policy if exists robot_matches_read on public.robot_matches;
create policy robot_matches_read on public.robot_matches for select to authenticated using ((select public._driver_member_ok()));

-- Who may import and edit: staff, or a member holding robot.matches.
create or replace function public._robot_match_writer()
returns boolean language sql stable security definer set search_path = public as $fn$
  select public._driver_member_ok() and (public.is_staff() or public.has_capability('robot.matches'));
$fn$;
revoke all on function public._robot_match_writer() from public, anon;
grant execute on function public._robot_match_writer() to authenticated;

-- A number from the file, or null when it is absent, null or not a number.
create or replace function public._rm_num(p jsonb)
returns numeric language sql immutable set search_path = public as $fn$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric end;
$fn$;
revoke all on function public._rm_num(jsonb) from public, anon, authenticated;
create or replace function public._rm_int(p jsonb)
returns integer language sql immutable set search_path = public as $fn$
  select case when jsonb_typeof(p) = 'number' and abs((p #>> '{}')::numeric) < 1000000 then round((p #>> '{}')::numeric)::integer end;
$fn$;
revoke all on function public._rm_int(jsonb) from public, anon, authenticated;
create or replace function public._rm_text(p jsonb, n integer)
returns text language sql immutable set search_path = public as $fn$
  select case when jsonb_typeof(p) = 'string' and length(btrim(p #>> '{}')) > 0 then left(btrim(p #>> '{}'), n) end;
$fn$;
revoke all on function public._rm_text(jsonb, integer) from public, anon, authenticated;

-- The robot writes startedAt as its local wall-clock time with no zone (the
-- Driver Station sets the roboRIO clock from the laptop): read as Los Angeles.
create or replace function public._rm_started(p_raw jsonb)
returns timestamptz language plpgsql immutable set search_path = public as $fn$
begin
  return (left(p_raw ->> 'startedAt', 19))::timestamp at time zone 'America/Los_Angeles';
exception when others then return null;
end
$fn$;
revoke all on function public._rm_started(jsonb) from public, anon, authenticated;

-- The match label people use: qm12 for a qualification, pm3 for an FMS
-- practice match, playoff 4 for an elimination, practice 7 otherwise
-- (src/robotMatches.js matchLabel holds the same rule).
create or replace function public._rm_label(p_kind text, p_fms_number integer, p_robot_match integer)
returns text language sql immutable set search_path = public as $fn$
  select case
    when p_kind = 'qual' and coalesce(p_fms_number, 0) > 0 then 'qm' || p_fms_number
    when p_kind = 'practice_fms' and coalesce(p_fms_number, 0) > 0 then 'pm' || p_fms_number
    when p_kind = 'playoff' and coalesce(p_fms_number, 0) > 0 then 'playoff ' || p_fms_number
    when p_robot_match is not null then replace(p_kind, '_', ' ') || ' ' || p_robot_match
    else replace(p_kind, '_', ' ') end;
$fn$;
revoke all on function public._rm_label(text, integer, integer) from public, anon, authenticated;

-- The competition the match belongs to: the one competition event running
-- (a day either side) when it started. None, or more than one: null.
create or replace function public._rm_event(p_started timestamptz)
returns uuid language sql stable security definer set search_path = public as $fn$
  select case when count(*) = 1 then min(id::text)::uuid end from public.events
   where kind = 'competition' and p_started between starts_at - interval '1 day' and ends_at + interval '1 day';
$fn$;
revoke all on function public._rm_event(timestamptz) from public, anon, authenticated;

-- Copy the compared numbers from the stored file into the row's columns.
create or replace function public._rm_extract(r public.robot_matches)
returns public.robot_matches language plpgsql immutable set search_path = public as $fn$
declare j jsonb := r.raw;
begin
  if j is null then return r; end if;
  r.schema_version := public._rm_int(j -> 'schema');
  r.kind := case when j ->> 'kind' in ('practice', 'qual', 'playoff', 'practice_fms', 'auto_test', 'teleop_session', 'fms') then j ->> 'kind' else r.kind end;
  r.started_at := coalesce(public._rm_started(j), r.started_at);
  r.robot_match := public._rm_int(j -> 'robotMatch');
  r.fms := case when jsonb_typeof(j -> 'fms') = 'boolean' then (j ->> 'fms')::boolean end;
  r.event_code := public._rm_text(j -> 'event', 40);
  r.fms_match_type := public._rm_text(j -> 'fmsMatchType', 40);
  r.fms_match_number := public._rm_int(j -> 'fmsMatchNumber');
  r.alliance := case when j ->> 'alliance' in ('red', 'blue') then j ->> 'alliance' else r.alliance end;
  r.station := public._rm_int(j -> 'station');
  r.auto_name := public._rm_text(j -> 'autoName', 120);
  r.auto_winner := case when j ->> 'autoWinner' in ('red', 'blue') then j ->> 'autoWinner' end;
  r.auto_winner_random := case when jsonb_typeof(j -> 'autoWinnerRandom') = 'boolean' then (j ->> 'autoWinnerRandom')::boolean end;
  r.auto_balls := public._rm_int(j #> '{scoring,autoBalls}');
  r.open_balls := public._rm_int(j #> '{scoring,ballsHubOpen}');
  r.closed_balls := public._rm_int(j #> '{scoring,ballsHubClosed}');
  r.passes := public._rm_int(j #> '{scoring,passes}');
  r.balls_total := public._rm_int(j #> '{scoring,ballsTotal}');
  r.ready_pct := least(999, public._rm_num(j #> '{scoring,readyWhileRtHeldPct}'));
  r.battery_start := case when public._rm_num(j #> '{battery,start}') between 0 and 16 then public._rm_num(j #> '{battery,start}') end;
  r.battery_min := case when public._rm_num(j #> '{battery,min}') between 0 and 16 then public._rm_num(j #> '{battery,min}') end;
  r.battery_end := case when public._rm_num(j #> '{battery,end}') between 0 and 16 then public._rm_num(j #> '{battery,end}') end;
  r.brownouts := public._rm_int(j #> '{battery,brownouts}');
  r.hang_at_seconds := least(99999, public._rm_num(j #> '{climb,hangAtSeconds}'));
  r.distance_m := least(999999, public._rm_num(j #> '{drive,distanceMeters}'));
  r.duration_s := least(99999, public._rm_num(j -> 'durationSeconds'));
  r.crew_typed := jsonb_strip_nulls(jsonb_build_object('driver', public._rm_text(j -> 'driver', 80), 'operator', public._rm_text(j -> 'operator', 80),
                    'coach', public._rm_text(j -> 'coach', 80), 'battery', public._rm_text(j -> 'batteryLabel', 40)));
  r.match_label := coalesce(r.match_label, public._rm_label(r.kind, r.fms_match_number, r.robot_match));
  return r;
end
$fn$;
revoke all on function public._rm_extract(public.robot_matches) from public, anon, authenticated;

-- The Match Sim page's matches are rows too, kept in step.
create or replace function public._robot_match_from_sim()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.robot_matches (source, sim_match_id, kind, started_at, duration_s, alliance, driver_id, operator_id, coach_id, human_player_id,
    battery_id, routine_id, scorer_balls_in, tower, battery_start, battery_end, brownouts, notes_human_player, notes_pit, battery_run_id, auto_run_id,
    match_label, created_by, updated_by)
  values ('sim_page', new.id, 'practice', new.started_at, case when new.ended_at is not null then least(99999, extract(epoch from new.ended_at - new.started_at)) end,
    new.alliance, new.driver_id, new.operator_id, new.drive_coach_id, new.human_player_id, new.battery_id, new.routine_id,
    case when new.auto_fuel is not null or new.teleop_fuel is not null then coalesce(new.auto_fuel, 0) + coalesce(new.teleop_fuel, 0) end,
    new.tower, new.voltage_before, new.voltage_after, case new.brownout when 'yes' then 1 when 'no' then 0 end,
    new.human_notes, new.problems, new.battery_run_id, new.auto_run_id, 'sim practice', new.member_id, new.member_id)
  on conflict (sim_match_id) where sim_match_id is not null do update set
    battery_run_id = coalesce(public.robot_matches.battery_run_id, excluded.battery_run_id),
    auto_run_id = coalesce(public.robot_matches.auto_run_id, excluded.auto_run_id),
    updated_at = now();
  return new;
end
$fn$;
revoke all on function public._robot_match_from_sim() from public, anon, authenticated;
drop trigger if exists sim_matches_robot_match on public.sim_matches;
create trigger sim_matches_robot_match after insert or update on public.sim_matches for each row execute function public._robot_match_from_sim();

-- Backfill: every existing simulated match once (the trigger's own upsert).
update public.sim_matches set id = id where not exists (select 1 from public.robot_matches m where m.sim_match_id = sim_matches.id);

-- Does: Fill a robot match's official score and ranking points from the event's imported Blue Alliance results, when they are there.
create or replace function public.robot_match_fill_official(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare m public.robot_matches; res jsonb;
begin
  if not public._robot_match_writer() then raise exception 'Only staff or a drive-team lead can change robot matches.' using errcode = '42501'; end if;
  select * into m from public.robot_matches where id = p_id for update;
  if m.id is null then raise exception 'No such robot match.' using errcode = 'P0002'; end if;
  if m.event_id is null or m.match_label is null or m.alliance is null or to_regclass('public.scouting_records') is null then return to_jsonb(m) || jsonb_build_object('official', 'not_available'); end if;
  select x into res from public.scouting_records t, jsonb_array_elements(coalesce(t.payload -> 'official_results', '[]'::jsonb)) x
   where t.event_id = m.event_id and t.kind = 'team' and t.team_number = 5669
     and regexp_replace(lower(x ->> 'match_key'), '^[0-9]{4}[a-z0-9]+_', '') = lower(m.match_label) and x ->> 'alliance' = m.alliance
   order by x ->> 'fetched_at' desc limit 1;
  if res is null then return to_jsonb(m) || jsonb_build_object('official', 'not_available'); end if;
  update public.robot_matches set
    match_score = coalesce(public._rm_int(res -> 'alliance_score'), match_score),
    ranking_points = coalesce(case when public._rm_num(res #> '{score_breakdown,rp}') between 0 and 20 then public._rm_num(res #> '{score_breakdown,rp}') end, ranking_points),
    official_source = 'tba', updated_by = auth.uid(), updated_at = now()
   where id = p_id returning * into m;
  return to_jsonb(m) || jsonb_build_object('official', 'filled');
end
$fn$;

-- Does: Import one robot match file (the robot's JSON), linking its crew, battery, auto routine and event, and logging the battery run and the driver's drive time once.
create or replace function public.robot_match_import(p_file_name text, p_raw jsonb, p_links jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare m public.robot_matches; old public.robot_matches; l jsonb := coalesce(p_links, '{}'::jsonb); v_sim uuid; v_routine uuid; v_status text := 'imported';
  br jsonb; ds public.drive_sessions; v_minutes integer; v_bkind text; v_notes jsonb := '[]'::jsonb; v_cand integer;
begin
  if not public._robot_match_writer() then raise exception 'Only staff or a drive-team lead can import robot matches.' using errcode = '42501'; end if;
  if p_file_name is null or p_file_name !~ '^[A-Za-z0-9._-]{1,120}\.json$' then raise exception 'A match file name ends in .json and has no spaces or slashes.' using errcode = '22023'; end if;
  if p_raw is null or jsonb_typeof(p_raw) <> 'object' or octet_length(p_raw::text) > 2000000 then raise exception 'The match file must be a JSON object under 2 MB.' using errcode = '22023'; end if;
  if public._rm_int(p_raw -> 'schema') is null or public._rm_int(p_raw -> 'schema') < 1 then raise exception 'This is not a robot match file (no schema version).' using errcode = '22023'; end if;
  if coalesce(p_raw ->> 'kind', '') not in ('practice', 'qual', 'playoff', 'practice_fms', 'auto_test', 'teleop_session', 'fms') then raise exception 'Unknown match kind %.', p_raw ->> 'kind' using errcode = '22023'; end if;
  if public._rm_started(p_raw) is null then raise exception 'The match file has no readable startedAt.' using errcode = '22023'; end if;
  select * into old from public.robot_matches where file_name = p_file_name;
  if old.id is not null then return jsonb_build_object('status', 'already', 'match', to_jsonb(old)); end if;
  -- Merge target: the given Match Sim row, or the one sim-page row with no file
  -- that started within 5 minutes on the same alliance.
  if l ? 'sim_match' then v_sim := nullif(l ->> 'sim_match', '')::uuid;
  else
    select count(*), min(id::text)::uuid into v_cand, v_sim from public.robot_matches
     where source = 'sim_page' and file_name is null and abs(extract(epoch from started_at - public._rm_started(p_raw))) <= 300
       and (alliance is null or alliance = p_raw ->> 'alliance');
    if v_cand <> 1 then v_sim := null; end if;
  end if;
  v_routine := nullif(l ->> 'routine', '')::uuid;
  if v_routine is null and nullif(btrim(l ->> 'new_routine'), '') is not null then
    select id into v_routine from public.auto_routines where lower(btrim(name)) = lower(btrim(l ->> 'new_routine'));
    if v_routine is null then
      if length(btrim(l ->> 'new_routine')) > 60 then raise exception 'A routine name is at most 60 characters.' using errcode = '22023'; end if;
      insert into public.auto_routines (name, description, created_by, updated_by) values (btrim(l ->> 'new_routine'), 'Added from a robot match file', auth.uid(), auth.uid()) returning id into v_routine;
    end if;
  end if;
  if v_sim is not null then
    select * into m from public.robot_matches where id = v_sim and source = 'sim_page' and file_name is null for update;
    if m.id is null then raise exception 'That Match Sim record already has a robot file, or does not exist.' using errcode = '22023'; end if;
    m.source := 'both'; v_status := 'merged';
  else
    m.id := gen_random_uuid(); m.source := 'robot_file'; m.created_by := auth.uid(); m.created_at := now(); m.crew_typed := '{}'::jsonb;
    m.kind := p_raw ->> 'kind'; m.started_at := public._rm_started(p_raw);
  end if;
  m.file_name := p_file_name; m.raw := p_raw; m.match_label := null;
  m := public._rm_extract(m);
  m.driver_id := coalesce(nullif(l ->> 'driver', '')::uuid, m.driver_id);
  m.operator_id := coalesce(nullif(l ->> 'operator', '')::uuid, m.operator_id);
  m.coach_id := coalesce(nullif(l ->> 'coach', '')::uuid, m.coach_id);
  m.human_player_id := coalesce(nullif(l ->> 'human_player', '')::uuid, m.human_player_id);
  m.battery_id := coalesce(nullif(l ->> 'battery', '')::uuid, m.battery_id);
  m.routine_id := coalesce(v_routine, m.routine_id);
  m.event_id := case when l ? 'event' then nullif(l ->> 'event', '')::uuid else coalesce(m.event_id, case when m.kind in ('qual', 'playoff', 'practice_fms', 'fms') or m.fms then public._rm_event(m.started_at) end) end;
  foreach v_bkind in array array[m.driver_id::text, m.operator_id::text, m.coach_id::text, m.human_player_id::text] loop
    if v_bkind is not null and not public._driver_target_ok(v_bkind::uuid) then raise exception 'A crew member is not an approved, active student or staff member.' using errcode = '22023'; end if;
  end loop;
  m.updated_by := auth.uid(); m.updated_at := now();
  -- The merged Match Sim row keeps its id: nothing references robot_matches.
  if v_status = 'merged' then delete from public.robot_matches where id = m.id; end if;
  insert into public.robot_matches values (m.*);
  -- The battery run, once per file, unless the Match Sim page already wrote one.
  v_minutes := greatest(1, least(600, round(coalesce(m.duration_s, 160) / 60.0)::integer));
  if m.battery_id is not null and m.battery_run_id is null and coalesce((l ->> 'battery_run')::boolean, true) then
    if m.started_at < now() - interval '60 days' then v_notes := v_notes || to_jsonb('Battery run not logged: the match is more than 60 days old.'::text);
    else
      br := public.battery_log_run(m.battery_id,
              case when m.kind in ('qual', 'playoff', 'practice_fms', 'fms') then 'match' when m.kind = 'practice' then 'practice_match' else 'drive_practice' end,
              m.event_id, left(m.match_label, 40), m.battery_start, m.battery_end, null, v_minutes,
              case when m.brownouts > 0 then 'yes' when m.brownouts = 0 then 'no' else 'unknown' end, null, 'Robot match file ' || p_file_name, m.started_at);
      update public.robot_matches set battery_run_id = (br ->> 'id')::uuid where id = m.id;
    end if;
  end if;
  -- The driver's drive session, once per file.
  if m.driver_id is not null and m.drive_session_id is null and coalesce((l ->> 'drive_session')::boolean, true) then
    insert into public.drive_sessions (member_id, session_date, minutes, kind, notes, logged_by, updated_by)
    values (m.driver_id, (m.started_at at time zone 'America/Los_Angeles')::date, v_minutes,
            case when m.kind in ('qual', 'playoff', 'practice_fms', 'fms') then 'match' else 'practice_field' end,
            'Robot match file ' || p_file_name, auth.uid(), auth.uid())
    returning * into ds;
    update public.robot_matches set drive_session_id = ds.id where id = m.id;
  end if;
  if m.event_id is not null then perform public.robot_match_fill_official(m.id); end if;
  select * into m from public.robot_matches where id = m.id;
  return jsonb_build_object('status', v_status, 'match', to_jsonb(m), 'notes', v_notes);
end
$fn$;

-- Does: Change a robot match's people-entered fields: crew, battery, routine, event, scorer count, TOWER, fouls, score, RP, notes by role, video and log file.
create or replace function public.robot_match_update(p_id uuid, p_fields jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare m public.robot_matches; k text; f jsonb := coalesce(p_fields, '{}'::jsonb); v uuid;
  allowed text[] := array['driver_id', 'operator_id', 'coach_id', 'human_player_id', 'battery_id', 'routine_id', 'event_id', 'match_label', 'scorer_balls_in', 'tower',
    'fouls', 'match_score', 'ranking_points', 'notes_driver', 'notes_operator', 'notes_coach', 'notes_human_player', 'notes_pit', 'video_url', 'wpilog_file'];
begin
  if not public._robot_match_writer() then raise exception 'Only staff or a drive-team lead can change robot matches.' using errcode = '42501'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'Fields must be an object.' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(f) loop
    if not k = any(allowed) then raise exception 'Unknown robot match field %.', k using errcode = '22023'; end if;
  end loop;
  select * into m from public.robot_matches where id = p_id for update;
  if m.id is null then raise exception 'No such robot match.' using errcode = 'P0002'; end if;
  foreach k in array array['driver_id', 'operator_id', 'coach_id', 'human_player_id'] loop
    if f ? k and nullif(f ->> k, '') is not null and not public._driver_target_ok((f ->> k)::uuid) then raise exception 'A crew member is not an approved, active student or staff member.' using errcode = '22023'; end if;
  end loop;
  update public.robot_matches set
    driver_id = case when f ? 'driver_id' then nullif(f ->> 'driver_id', '')::uuid else driver_id end,
    operator_id = case when f ? 'operator_id' then nullif(f ->> 'operator_id', '')::uuid else operator_id end,
    coach_id = case when f ? 'coach_id' then nullif(f ->> 'coach_id', '')::uuid else coach_id end,
    human_player_id = case when f ? 'human_player_id' then nullif(f ->> 'human_player_id', '')::uuid else human_player_id end,
    battery_id = case when f ? 'battery_id' then nullif(f ->> 'battery_id', '')::uuid else battery_id end,
    routine_id = case when f ? 'routine_id' then nullif(f ->> 'routine_id', '')::uuid else routine_id end,
    event_id = case when f ? 'event_id' then nullif(f ->> 'event_id', '')::uuid else event_id end,
    match_label = case when f ? 'match_label' then nullif(btrim(f ->> 'match_label'), '') else match_label end,
    scorer_balls_in = case when f ? 'scorer_balls_in' then public._rm_int(f -> 'scorer_balls_in') else scorer_balls_in end,
    tower = case when f ? 'tower' then nullif(f ->> 'tower', '') else tower end,
    fouls = case when f ? 'fouls' then nullif(btrim(f ->> 'fouls'), '') else fouls end,
    match_score = case when f ? 'match_score' then public._rm_int(f -> 'match_score') else match_score end,
    ranking_points = case when f ? 'ranking_points' then public._rm_num(f -> 'ranking_points') else ranking_points end,
    official_source = case when f ? 'match_score' or f ? 'ranking_points' then case when public._rm_num(f -> 'match_score') is null and public._rm_num(f -> 'ranking_points') is null then null else 'manual' end else official_source end,
    notes_driver = case when f ? 'notes_driver' then nullif(btrim(f ->> 'notes_driver'), '') else notes_driver end,
    notes_operator = case when f ? 'notes_operator' then nullif(btrim(f ->> 'notes_operator'), '') else notes_operator end,
    notes_coach = case when f ? 'notes_coach' then nullif(btrim(f ->> 'notes_coach'), '') else notes_coach end,
    notes_human_player = case when f ? 'notes_human_player' then nullif(btrim(f ->> 'notes_human_player'), '') else notes_human_player end,
    notes_pit = case when f ? 'notes_pit' then nullif(btrim(f ->> 'notes_pit'), '') else notes_pit end,
    video_url = case when f ? 'video_url' then nullif(btrim(f ->> 'video_url'), '') else video_url end,
    wpilog_file = case when f ? 'wpilog_file' then nullif(btrim(f ->> 'wpilog_file'), '') else wpilog_file end,
    updated_by = auth.uid(), updated_at = now()
   where id = p_id returning * into m;
  return to_jsonb(m);
end
$fn$;

revoke all on function public.robot_match_import(text, jsonb, jsonb), public.robot_match_update(uuid, jsonb), public.robot_match_fill_official(uuid) from public, anon;
grant execute on function public.robot_match_import(text, jsonb, jsonb), public.robot_match_update(uuid, jsonb), public.robot_match_fill_official(uuid) to authenticated;

do $connector$
begin
  if to_regclass('public.connector_log_tables') is not null then
    insert into public.connector_log_tables (table_name, note) values ('robot_matches', 'Robot match log (0038)')
    on conflict (table_name) do nothing;
  end if;
end
$connector$;

-- The account merge (0020) must know every column that names a member. 0037
-- last replaced this list; copied here with robot_matches' six added.
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
    ('hp_attempts', 'member_id', 'move'),
    ('hp_attempts', 'logged_by', 'move'),
    ('hp_attempts', 'updated_by', 'move'),
    ('hp_attempts', 'voided_by', 'move'),
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
    ('team_connections', 'updated_by', 'move'),
    ('scouting_options', 'requested_by', 'move'),
    ('scouting_options', 'decided_by', 'move'),
    ('robot_matches', 'driver_id', 'move'),
    ('robot_matches', 'operator_id', 'move'),
    ('robot_matches', 'coach_id', 'move'),
    ('robot_matches', 'human_player_id', 'move'),
    ('robot_matches', 'created_by', 'move'),
    ('robot_matches', 'updated_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated;
