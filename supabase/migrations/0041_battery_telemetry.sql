-- ============================================================
-- 0041_battery_telemetry: what the robot measures about power, every match,
-- on the match log and the battery board (ledger 0031). Needs 0026 and 0038.
--
-- WHY. Mr. Pina, 2026-10-28: the robot (FRC-Team-5669-Techmen/2026-5669-Official,
-- subsystems/PowerMonitor.java, power/BatteryEstimator.java) now measures, every
-- match, whether a brownout was the battery or the robot, and keeps a history
-- per battery in match-data/battery-history.csv. Worn batteries and robot wiring
-- problems must be obvious at a glance on the battery board.
--
-- ROBOT RESISTANCE IS NOT BATTERY BEAK RESISTANCE. The robot fits R from its own
-- load, so it INCLUDES the main wiring (Anderson SB50, 120 A breaker, PDH lugs,
-- leads) and reads 5 to 10 mOhm above a Battery Beak on the battery alone. It
-- has its own column, robot_resistance_mohm, and never goes in resistance_mohm.
--
-- WHAT THIS DOES.
--   robot_matches  + power (the "power" object of the file, whole, every field
--                  optional: the robot code is still growing) and typed copies:
--                  rest_volts_before, robot_resistance_mohm, min_volts,
--                  amps_at_min, peak_amps, dips_below_7v, verdict. Older files
--                  have no "power": every new column stays null.
--   battery_runs   + robot_resistance_mohm, min_volts, verdict (nullable).
--   _rm_extract_power(row)   fills the power columns from raw; _rm_extract
--                  (re-defined from 0038) calls it, and existing rows are
--                  backfilled once from their stored files.
--   robot_match_import (re-defined from 0038, same signature and rules): the
--                  battery run it logs takes volts before = power.restVoltsBefore
--                  when present (the battery rested, before the match), else the
--                  start voltage as before, and carries robot R, min V and the
--                  verdict. When the Match Sim page already wrote the run, the
--                  three are filled into that run where blank.
--   battery_import_load_tests(rows)   staff or robot.matches: the pit load
--                  tests from battery-history.csv (kind load_test, a 2 s shooter
--                  spin-up that measures R cleanly) as bench_test runs, matched
--                  to the battery by label (B7 = B07), deduped on battery + time.
--                  Other kinds are skipped: matches arrive with their files.
--
-- Grants and RLS are unchanged: both tables keep select-only for authenticated
-- under their read policies, so the new columns are readable by the same people
-- and writable by nobody directly. No column names a member, so the account
-- merge list (_merge_member_rules) is not touched.
--
-- Re-runnable. Re-defines _rm_extract and robot_match_import from 0038: paste
-- 0041 again after any re-paste of 0038. TO UNDO: paste _rm_extract and
-- robot_match_import from 0038 again; drop function
-- public.battery_import_load_tests(jsonb), public._rm_power_backfill(),
-- public._rm_extract_power(public.robot_matches), public._rm_battery_key(text);
-- then alter table public.robot_matches drop column power, drop
-- column rest_volts_before, drop column robot_resistance_mohm, drop column
-- min_volts, drop column amps_at_min, drop column peak_amps, drop column
-- dips_below_7v, drop column verdict; alter table public.battery_runs drop
-- column robot_resistance_mohm, drop column min_volts, drop column verdict.
-- After real use, export the battery CSV from /batteries first.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public.robot_match_import(text,jsonb,jsonb)') is null
     or to_regprocedure('public.battery_log_run(uuid,text,uuid,text,numeric,numeric,numeric,integer,text,integer,text,timestamptz)') is null then
    raise exception '0041 needs 0026 and 0038 applied first';
  end if;
end
$prereq$;

alter table public.robot_matches add column if not exists power jsonb;
alter table public.robot_matches add column if not exists rest_volts_before numeric(5,2);
alter table public.robot_matches add column if not exists robot_resistance_mohm numeric(6,2);
alter table public.robot_matches add column if not exists min_volts numeric(5,2);
alter table public.robot_matches add column if not exists amps_at_min integer;
alter table public.robot_matches add column if not exists peak_amps integer;
alter table public.robot_matches add column if not exists dips_below_7v integer;
alter table public.robot_matches add column if not exists verdict text;
alter table public.battery_runs add column if not exists robot_resistance_mohm numeric(6,2);
alter table public.battery_runs add column if not exists min_volts numeric(5,2);
alter table public.battery_runs add column if not exists verdict text;

do $checks$
begin
  if not exists (select 1 from pg_constraint where conname = 'robot_matches_power_shape') then
    alter table public.robot_matches add constraint robot_matches_power_shape check (power is null or jsonb_typeof(power) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'robot_matches_power_ranges') then
    alter table public.robot_matches add constraint robot_matches_power_ranges check (
      (rest_volts_before is null or rest_volts_before between 0 and 16) and (min_volts is null or min_volts between 0 and 16)
      and (robot_resistance_mohm is null or robot_resistance_mohm between 0 and 500)
      and (verdict is null or length(verdict) <= 2000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'battery_runs_robot_ranges') then
    alter table public.battery_runs add constraint battery_runs_robot_ranges check (
      (robot_resistance_mohm is null or robot_resistance_mohm between 0 and 500) and (min_volts is null or min_volts between 0 and 16)
      and (verdict is null or length(verdict) <= 2000));
  end if;
end
$checks$;

-- Copy the power numbers from the stored file into the columns of the row. Every
-- field is optional; a number out of range is not a reading (null).
-- src/robotMatches.js POWER_COLUMN_PATHS holds the same paths.
create or replace function public._rm_extract_power(r public.robot_matches)
returns public.robot_matches language plpgsql immutable set search_path = public as $fn$
declare p jsonb := case when jsonb_typeof(r.raw -> 'power') = 'object' then r.raw -> 'power' end;
begin
  r.power := p;
  r.rest_volts_before := case when public._rm_num(p -> 'restVoltsBefore') between 0 and 16 then public._rm_num(p -> 'restVoltsBefore') end;
  r.robot_resistance_mohm := case when public._rm_num(p -> 'resistanceMilliOhm') between 0 and 500 then public._rm_num(p -> 'resistanceMilliOhm') end;
  r.min_volts := case when public._rm_num(p -> 'minVolts') between 0 and 16 then public._rm_num(p -> 'minVolts')
                      when public._rm_num(p -> 'pdhMinVolts') between 0 and 16 then public._rm_num(p -> 'pdhMinVolts') end;
  r.amps_at_min := public._rm_int(p -> 'ampsAtMin');
  r.peak_amps := public._rm_int(p -> 'peakAmps');
  r.dips_below_7v := public._rm_int(p -> 'dipsBelow7V');
  r.verdict := public._rm_text(p -> 'verdict', 2000);
  return r;
end
$fn$;
revoke all on function public._rm_extract_power(public.robot_matches) from public, anon, authenticated;

-- 0038 _rm_extract, unchanged, with the power columns added at the end.
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
  return public._rm_extract_power(r);
end
$fn$;
revoke all on function public._rm_extract(public.robot_matches) from public, anon, authenticated;

-- Backfill, as a function so the test can run it again: rows already imported
-- keep their files whole, so the power columns come from the stored file (a
-- row with no "power" in its file is untouched). Then the battery runs those
-- rows link to: robot R, min V and the verdict where blank; volts before
-- becomes the rested voltage only on a run the import wrote that still holds
-- the start voltage it put there (a corrected run is kept). Answers the number
-- of match rows filled.
create or replace function public._rm_power_backfill()
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  update public.robot_matches t set power = x.power, rest_volts_before = x.rest_volts_before, robot_resistance_mohm = x.robot_resistance_mohm,
         min_volts = x.min_volts, amps_at_min = x.amps_at_min, peak_amps = x.peak_amps, dips_below_7v = x.dips_below_7v, verdict = x.verdict
    from (select (public._rm_extract_power(m)).* from public.robot_matches m where jsonb_typeof(m.raw -> 'power') = 'object' and m.power is null) x
   where x.id = t.id;
  get diagnostics n = row_count;
  update public.battery_runs b set
         robot_resistance_mohm = coalesce(b.robot_resistance_mohm, m.robot_resistance_mohm),
         min_volts = coalesce(b.min_volts, m.min_volts, m.battery_min),
         verdict = coalesce(b.verdict, m.verdict),
         voltage_before = case when m.rest_volts_before is not null and b.voltage_before is not distinct from m.battery_start
                                    and b.notes = 'Robot match file ' || m.file_name then m.rest_volts_before else b.voltage_before end
    from public.robot_matches m
   where m.battery_run_id = b.id and m.power is not null
     and (b.robot_resistance_mohm is null or b.min_volts is null or b.verdict is null
          or (m.rest_volts_before is not null and b.voltage_before is not distinct from m.battery_start and b.notes = 'Robot match file ' || m.file_name));
  return n;
end
$fn$;
revoke all on function public._rm_power_backfill() from public, anon, authenticated;
select public._rm_power_backfill();

-- Does: Import one robot match file (the robot JSON), linking its crew, battery, auto routine and event, and logging the battery run (with the power readings of the robot) and the drive time of the driver once.
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
  if v_status = 'merged' then delete from public.robot_matches where id = m.id; end if;
  insert into public.robot_matches values (m.*);
  -- The battery run, once per file, unless the Match Sim page already wrote
  -- one. Volts before is the rested voltage the robot measured, when it did.
  v_minutes := greatest(1, least(600, round(coalesce(m.duration_s, 160) / 60.0)::integer));
  if m.battery_id is not null and m.battery_run_id is null and coalesce((l ->> 'battery_run')::boolean, true) then
    if m.started_at < now() - interval '60 days' then v_notes := v_notes || to_jsonb('Battery run not logged: the match is more than 60 days old.'::text);
    else
      br := public.battery_log_run(m.battery_id,
              case when m.kind in ('qual', 'playoff', 'practice_fms', 'fms') then 'match' when m.kind = 'practice' then 'practice_match' else 'drive_practice' end,
              m.event_id, left(m.match_label, 40), coalesce(m.rest_volts_before, m.battery_start), m.battery_end, null, v_minutes,
              case when m.brownouts > 0 then 'yes' when m.brownouts = 0 then 'no' else 'unknown' end, null, 'Robot match file ' || p_file_name, m.started_at);
      update public.battery_runs set robot_resistance_mohm = m.robot_resistance_mohm, min_volts = coalesce(m.min_volts, m.battery_min), verdict = m.verdict
       where id = (br ->> 'id')::uuid;
      update public.robot_matches set battery_run_id = (br ->> 'id')::uuid where id = m.id;
    end if;
  elsif m.battery_run_id is not null then
    update public.battery_runs set robot_resistance_mohm = coalesce(robot_resistance_mohm, m.robot_resistance_mohm),
           min_volts = coalesce(min_volts, m.min_volts, m.battery_min), verdict = coalesce(verdict, m.verdict)
     where id = m.battery_run_id;
  end if;
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
revoke all on function public.robot_match_import(text, jsonb, jsonb) from public, anon;
grant execute on function public.robot_match_import(text, jsonb, jsonb) to authenticated;

-- A battery label as the robot types it: B7, b07 and "B 07" are B07; a bare 7
-- is B7 (src/robotMatches.js batteryKey holds the same rule).
create or replace function public._rm_battery_key(p text)
returns text language sql immutable set search_path = public as $fn$
  select case when k ~ '^[A-Z]*0*[0-9]+\Z' then coalesce(nullif(substring(k from '^[A-Z]*'), ''), 'B') || coalesce(nullif(ltrim(substring(k from '[0-9]+\Z'), '0'), ''), '0')
              else k end
    from (select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g') as k) x;
$fn$;
revoke all on function public._rm_battery_key(text) from public, anon, authenticated;

-- Does: Import the pit battery load tests of the robot (battery-history.csv rows of kind load_test) as bench test runs with the robot-measured resistance, once per battery and time.
create or replace function public.battery_import_load_tests(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare x jsonb; b public.batteries; v_t timestamptz; v_key text; br jsonb; v_r numeric; v_rest numeric; v_min numeric; v_n integer;
  v_done jsonb := '[]'::jsonb; v_skip jsonb := '[]'::jsonb; v_already integer := 0; v_other integer := 0;
begin
  if not public._robot_match_writer() then raise exception 'Only staff or a drive-team lead can import load tests.' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be a list.' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'At most 500 rows at a time.' using errcode = '22023'; end if;
  for x in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(x) <> 'object' or coalesce(x ->> 'kind', '') <> 'load_test' then v_other := v_other + 1; continue; end if;
    v_t := public._rm_started(jsonb_build_object('startedAt', x ->> 'time'));
    v_key := public._rm_battery_key(x ->> 'battery');
    v_r := case when (x ->> 'resistance_mohm') ~ '^[0-9]+(\.[0-9]+)?\Z' and (x ->> 'resistance_mohm')::numeric between 0 and 500 then round((x ->> 'resistance_mohm')::numeric, 2) end;
    v_rest := case when (x ->> 'rest_v') ~ '^[0-9]+(\.[0-9]+)?\Z' and (x ->> 'rest_v')::numeric between 0 and 16 then round((x ->> 'rest_v')::numeric, 2) end;
    v_min := case when (x ->> 'min_v') ~ '^[0-9]+(\.[0-9]+)?\Z' and (x ->> 'min_v')::numeric between 0 and 16 then round((x ->> 'min_v')::numeric, 2) end;
    if v_t is null then v_skip := v_skip || jsonb_build_object('time', x ->> 'time', 'battery', x ->> 'battery', 'reason', 'no readable time'); continue; end if;
    if v_key = '' then v_skip := v_skip || jsonb_build_object('time', x ->> 'time', 'battery', null, 'reason', 'no battery typed on the robot'); continue; end if;
    if v_r is null then v_skip := v_skip || jsonb_build_object('time', x ->> 'time', 'battery', x ->> 'battery', 'reason', 'no resistance reading'); continue; end if;
    select count(*) into v_n from public.batteries where public._rm_battery_key(label) = v_key;
    if v_n <> 1 then v_skip := v_skip || jsonb_build_object('time', x ->> 'time', 'battery', x ->> 'battery', 'reason', 'not one battery in the log'); continue; end if;
    select * into b from public.batteries where public._rm_battery_key(label) = v_key for update;
    if exists (select 1 from public.battery_runs where battery_id = b.id and kind = 'bench_test' and ran_at = v_t) then v_already := v_already + 1; continue; end if;
    if b.status = 'retired' then v_skip := v_skip || jsonb_build_object('time', x ->> 'time', 'battery', b.label, 'reason', 'retired'); continue; end if;
    if v_t < now() - interval '60 days' or v_t > now() + interval '10 minutes' then
      v_skip := v_skip || jsonb_build_object('time', x ->> 'time', 'battery', b.label, 'reason', 'more than 60 days old'); continue;
    end if;
    br := public.battery_log_run(b.id, 'bench_test', null, null, v_rest, null, null, null, 'no', null,
            left('Pit load test (robot, 2 s shooter spin-up): idle V before, R includes the robot wiring.' || coalesce(' ' || nullif(btrim(x ->> 'verdict'), ''), ''), 2000), v_t);
    update public.battery_runs set robot_resistance_mohm = v_r, min_volts = v_min, verdict = left(nullif(btrim(x ->> 'verdict'), ''), 2000)
     where id = (br ->> 'id')::uuid;
    v_done := v_done || jsonb_build_object('id', br ->> 'id', 'battery', b.label, 'time', x ->> 'time', 'robot_resistance_mohm', v_r);
  end loop;
  return jsonb_build_object('imported', v_done, 'already', v_already, 'skipped', v_skip, 'not_load_tests', v_other);
end
$fn$;
revoke all on function public.battery_import_load_tests(jsonb) from public, anon;
grant execute on function public.battery_import_load_tests(jsonb) to authenticated;
