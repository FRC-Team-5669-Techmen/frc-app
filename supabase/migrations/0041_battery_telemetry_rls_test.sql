-- ============================================================
-- 0041_battery_telemetry test. Run AFTER 0041. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: a mentor (M, staff), two approved students (S plain, L holding
-- robot.matches) and a parent-only account (P). The match file is the shape
-- PowerMonitor.java writes (schema 1 with a "power" object, a brownout
-- snapshot and one field this file does not know). Every refusal is paired
-- with an accepted call, and every "stays blank" with a filled positive.
-- ============================================================
begin;

do $applied$
begin
  if to_regprocedure('public.battery_import_load_tests(jsonb)') is null then
    raise exception 'Cannot test: 0041_battery_telemetry.sql has not been applied';
  end if;
end
$applied$;

create temp table t41_results(n int primary key, check_name text, result text, detail text) on commit drop;
create function pg_temp.rec(n int, label text, ok boolean, detail text default '') returns void language sql as $fn$
 insert into t41_results values(n, label, case when coalesce(ok, false) then 'PASS' else 'FAIL' end, detail); -- null is a FAIL here, never a skip
$fn$;
create function pg_temp.val_as(who uuid, q text) returns text language plpgsql as $fn$
declare v text;
begin
 perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
 perform set_config('request.jwt.claims', jsonb_build_object('sub', who, 'role', 'authenticated')::text, true);
 perform set_config('role', 'authenticated', true);
 begin execute q into v; v := coalesce(v, 'null'); exception when others then v := 'err:' || sqlstate || ':' || sqlerrm; end;
 reset role;
 perform set_config('request.jwt.claim.sub', '', true);
 perform set_config('request.jwt.claims', '', true);
 return v;
end
$fn$;
create function pg_temp.jp(v text, path text[]) returns text language plpgsql as $fn$
begin return v::jsonb #>> path; exception when others then return null; end
$fn$;
create temp table t41_file(raw jsonb) on commit drop;
insert into t41_file values ($json${"schema": 1, "kind": "practice", "robotMatch": 4, "startedAt": "2026-10-28T10:36:05.893", "fms": false, "alliance": "red", "station": 1,
 "autoName": "Shoot Preload (stay put)", "driver": "", "operator": "", "coach": "", "batteryLabel": "", "durationSeconds": 150.0,
 "scoring": {"autoBalls": 1, "ballsHubOpen": 9, "ballsHubClosed": 2, "passes": 0, "ballsTotal": 12},
 "battery": {"start": 13.5, "end": 12.1, "min": 9.7, "brownouts": 1},
 "power": {"restVoltsBefore": 12.81, "resistanceMilliOhm": 17.4, "resistanceFits": 22, "openCircuitVolts": 12.9, "minVolts": 9.62, "pdhMinVolts": 9.62, "rioMinVolts": 9.4,
   "branchDropAtMin": {"drive": 0.3, "shooter": 0.9}, "stickyFaults": [{"device": "shooter 16", "faults": ["undervoltage"]}], "sameBatteryAsLastMatch": false,
   "ampsAtMin": 236, "topDrawAtMin": {"drive": 160, "shooter": 58, "spindexer": 9}, "peakAmps": 312, "ampHours": 1.84, "dipsBelow7V": 0, "brownouts": 1,
   "brownoutSnapshots": [{"t": 88.2, "matchTime": 72.0, "lowestVolts": 6.71, "ampsThen": 251, "topDraw": {"drive": 170, "shooter": 61}, "resistanceMilliOhm": 17.4}],
   "verdict": "ROBOT DRAW: 236 A at the dip with normal resistance: too much current at once (drive pushing, shooter spin-up, a stall)", "futurePowerField": 3}}$json$::jsonb);
create function pg_temp.f(started text) returns jsonb language sql as $fn$
 select jsonb_set(raw, '{startedAt}', to_jsonb(started)) from t41_file
$fn$;
grant select on t41_file to authenticated;

do $checks$
#variable_conflict use_variable
declare m uuid; s uuid; l uuid; p uuid; b uuid; b7 uuid; b8 uuid; bx uuid; v text; v2 text; rid uuid; n int; t0 text; t1 text; t2 text; t3 text; v_rows jsonb; sim uuid;
begin
 select member_id into m from public.member_roles where role='mentor' order by member_id limit 1;
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select p0.id into l from public.profiles p0 where p0.approved and p0.id<>s and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead','student')) order by member_id limit 1;
 if m is null or s is null or l is null or p is null then raise exception '0041 test needs a mentor, two approved students and a parent-only account'; end if;
 update public.profiles set status='active', approved=true where id in (s,l,m);
 insert into public.member_permissions (member_id, capability, granted_by) values (l, 'robot.matches', m) on conflict do nothing;
 insert into public.batteries (label, status, charge_state) values ('T41', 'competition', 'charged') returning id into b;
 insert into public.batteries (label, status, charge_state) values ('Q07', 'competition', 'charged') returning id into b7;
 insert into public.batteries (label, status, charge_state) values ('Q8', 'practice', 'charged') returning id into b8;
 insert into public.batteries (label, status, charge_state) values ('Q09', 'retired', 'needs_charge') returning id into bx;
 t0 := to_char((now() - interval '1 hour') at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS');

 -- A file with power: the columns, the stored object, the battery run.
 v := pg_temp.val_as(m, format($q$select public.robot_match_import('t41_power_practice_4.json', %L, %L)::text$q$, pg_temp.f(t0), jsonb_build_object('battery', b, 'sim_match', null)));
 rid := (pg_temp.jp(v, '{match,id}'))::uuid;
 perform pg_temp.rec(1, 'staff imports a file with power: the typed power columns are filled (positive control)', pg_temp.jp(v, '{status}') = 'imported'
   and exists(select 1 from public.robot_matches where id = rid and rest_volts_before = 12.81 and robot_resistance_mohm = 17.4 and min_volts = 9.62
     and amps_at_min = 236 and peak_amps = 312 and dips_below_7v = 0 and verdict like 'ROBOT DRAW:%'), left(v, 100));
 perform pg_temp.rec(2, 'the power object is kept whole, snapshots and unknown fields included', exists(select 1 from public.robot_matches where id = rid
   and power #>> '{futurePowerField}' = '3' and jsonb_array_length(power -> 'brownoutSnapshots') = 1 and power #>> '{stickyFaults,0,device}' = 'shooter 16'), '');
 perform pg_temp.rec(3, 'its battery run: volts before is the rested 12.81 (not the 13.5 start), robot R, min V and verdict carried; the Beak column stays blank',
   exists(select 1 from public.battery_runs where notes = 'Robot match file t41_power_practice_4.json' and battery_id = b and voltage_before = 12.81 and voltage_after = 12.1
     and robot_resistance_mohm = 17.4 and min_volts = 9.62 and verdict like 'ROBOT DRAW:%' and resistance_mohm is null and brownout = 'yes'), '');

 -- An older file with no power: imports as before, power blank.
 v := pg_temp.val_as(m, format($q$select public.robot_match_import('t41_old_practice_5.json', %L, %L)::text$q$, pg_temp.f(t0) - 'power', jsonb_build_object('battery', b, 'sim_match', null)));
 perform pg_temp.rec(4, 'a file with no power still imports; every power column is null and the run takes the start voltage, as 0038 did',
   pg_temp.jp(v, '{status}') = 'imported'
   and exists(select 1 from public.robot_matches where file_name = 't41_old_practice_5.json' and power is null and rest_volts_before is null and robot_resistance_mohm is null and verdict is null and battery_start = 13.5)
   and exists(select 1 from public.battery_runs where notes = 'Robot match file t41_old_practice_5.json' and voltage_before = 13.5 and robot_resistance_mohm is null and min_volts = 9.7), left(v, 80));

 -- A number out of range is not a reading.
 v := pg_temp.val_as(m, format($q$select public.robot_match_import('t41_bad_practice_6.json', %L, '{"sim_match": null}')::text$q$,
        jsonb_set(jsonb_set(pg_temp.f(t0), '{power,resistanceMilliOhm}', '900'), '{power,restVoltsBefore}', '"12.8"')));
 perform pg_temp.rec(5, 'a resistance of 900 mOhm or a voltage sent as text is not a reading (null); the min V beside them is kept',
   exists(select 1 from public.robot_matches where file_name = 't41_bad_practice_6.json' and robot_resistance_mohm is null and rest_volts_before is null and min_volts = 9.62), left(v, 60));

 -- The Match Sim page wrote the run first: the merge fills it, writes no second.
 v := pg_temp.val_as(m, format($q$select public.sim_save_match(%L, %L, 'red', 'blue', null, null, null, null, %L, null, null, 3, 9, 'level1', 12.9, 12.1, 'no', null, null)::text$q$,
        now() - interval '2 hours', now() - interval '2 hours' + interval '160 seconds', b));
 sim := (pg_temp.jp(v, '{id}'))::uuid;
 v2 := pg_temp.val_as(m, format($q$select public.robot_match_import('t41_sim_practice_7.json', %L, '{}')::text$q$,
        pg_temp.f(to_char((now() - interval '2 hours' + interval '40 seconds') at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS'))));
 select count(*) into n from public.battery_runs r join public.robot_matches x on x.battery_run_id = r.id where x.file_name = 't41_sim_practice_7.json' and r.robot_resistance_mohm = 17.4 and r.voltage_before = 12.9;
 perform pg_temp.rec(6, 'merged into a Match Sim row: its own run gains robot R 17.4 and keeps its typed 12.9 V; no second run',
   pg_temp.jp(v2, '{status}') = 'merged' and n = 1 and not exists(select 1 from public.battery_runs where notes = 'Robot match file t41_sim_practice_7.json'), pg_temp.jp(v2, '{status}') || ' ' || n);

 -- The backfill: a row imported before 0041 (power columns blank) is filled from its stored file.
 update public.robot_matches set power = null, rest_volts_before = null, robot_resistance_mohm = null, min_volts = null, verdict = null where id = rid;
 update public.battery_runs set robot_resistance_mohm = null, min_volts = null, verdict = null, voltage_before = 13.5 where notes = 'Robot match file t41_power_practice_4.json';
 perform public._rm_power_backfill();
 perform pg_temp.rec(7, 'the backfill fills an older import and its run (13.5 start becomes the rested 12.81) from the stored file',
   exists(select 1 from public.robot_matches where id = rid and robot_resistance_mohm = 17.4 and power ? 'brownoutSnapshots')
   and exists(select 1 from public.battery_runs where notes = 'Robot match file t41_power_practice_4.json' and robot_resistance_mohm = 17.4 and voltage_before = 12.81), '');
 update public.battery_runs set voltage_before = 12.6, robot_resistance_mohm = null where notes = 'Robot match file t41_power_practice_4.json';
 perform public._rm_power_backfill();
 perform pg_temp.rec(8, 'a run someone corrected keeps its voltage (12.6), while its blank robot R is still filled',
   exists(select 1 from public.battery_runs where notes = 'Robot match file t41_power_practice_4.json' and voltage_before = 12.6 and robot_resistance_mohm = 17.4), '');

 -- Pit load tests from battery-history.csv.
 t1 := to_char((now() - interval '3 hours') at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS') || '.123456';
 t2 := to_char((now() - interval '4 hours') at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS');
 t3 := to_char((now() - interval '90 days') at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS');
 v_rows := jsonb_build_array(
   jsonb_build_object('time', t1, 'kind', 'load_test', 'battery', 'q 7', 'rest_v', '12.95', 'resistance_mohm', '31.5', 'min_v', '11.2', 'amps_at_min', '120', 'brownouts', '0', 'verdict', 'Q07 R = 31.5 mOhm (battery + wiring) | HIGH: compare with another battery'),
   jsonb_build_object('time', t2, 'kind', 'load_test', 'battery', 'Q08', 'rest_v', '13.02', 'resistance_mohm', '18.0', 'min_v', '11.9', 'amps_at_min', '118', 'brownouts', '0', 'verdict', 'normal'),
   jsonb_build_object('time', t2, 'kind', 'practice', 'battery', 'Q07', 'rest_v', '12.9', 'resistance_mohm', '20', 'min_v', '9', 'amps_at_min', '200', 'brownouts', '0', 'verdict', 'OK'),
   jsonb_build_object('time', t2, 'kind', 'load_test', 'battery', 'Z99', 'rest_v', '12.9', 'resistance_mohm', '20', 'min_v', '11', 'amps_at_min', '100', 'brownouts', '0', 'verdict', 'normal'),
   jsonb_build_object('time', t2, 'kind', 'load_test', 'battery', 'Q09', 'rest_v', '12.9', 'resistance_mohm', '40', 'min_v', '11', 'amps_at_min', '100', 'brownouts', '0', 'verdict', 'x'),
   jsonb_build_object('time', t2, 'kind', 'load_test', 'battery', 'Q07', 'rest_v', '12.9', 'resistance_mohm', '', 'min_v', '', 'amps_at_min', '', 'brownouts', '0', 'verdict', 'no reading'),
   jsonb_build_object('time', t3, 'kind', 'load_test', 'battery', 'Q07', 'rest_v', '12.9', 'resistance_mohm', '22', 'min_v', '11', 'amps_at_min', '100', 'brownouts', '0', 'verdict', 'normal'));
 v := pg_temp.val_as(s, format($q$select public.battery_import_load_tests(%L)::text$q$, v_rows));
 v2 := pg_temp.val_as(m, format($q$select public.battery_import_load_tests(%L)::text$q$, v_rows));
 perform pg_temp.rec(9, 'a plain student cannot import load tests; staff imports exactly the two good ones (q 7 = Q07, Q08 = Q8)',
   v like 'err:42501:%' and jsonb_array_length((v2::jsonb) -> 'imported') = 2 and pg_temp.jp(v2, '{not_load_tests}') = '1' and jsonb_array_length((v2::jsonb) -> 'skipped') = 4, left(v, 40) || ' | ' || left(v2, 160));
 perform pg_temp.rec(10, 'each is a bench test with robot R, min V, idle volts before and the verdict; Beak R blank; charge state untouched',
   exists(select 1 from public.battery_runs where battery_id = b7 and kind = 'bench_test' and robot_resistance_mohm = 31.5 and min_volts = 11.2 and voltage_before = 12.95
     and resistance_mohm is null and verdict like 'Q07 R = 31.5%' and member_id = m and ran_at = (left(t1, 19))::timestamp at time zone 'America/Los_Angeles')
   and exists(select 1 from public.battery_runs where battery_id = b8 and kind = 'bench_test' and robot_resistance_mohm = 18.0)
   and (select charge_state from public.batteries where id = b7) = 'charged', '');
 perform pg_temp.rec(11, 'skipped with reasons: unknown battery, retired, no reading, more than 60 days old; nothing written for them',
   (v2::jsonb -> 'skipped') @> '[{"reason": "not one battery in the log"}, {"reason": "retired"}, {"reason": "no resistance reading"}, {"reason": "more than 60 days old"}]'::jsonb
   and not exists(select 1 from public.battery_runs where battery_id = bx), left((v2::jsonb -> 'skipped')::text, 120));
 v := pg_temp.val_as(m, format($q$select public.battery_import_load_tests(%L)::text$q$, v_rows));
 select count(*) into n from public.battery_runs where battery_id in (b7, b8);
 perform pg_temp.rec(12, 'importing the same rows again writes nothing (deduped on battery + time)', jsonb_array_length((v::jsonb) -> 'imported') = 0 and pg_temp.jp(v, '{already}') = '2' and n = 2, left(v, 80) || ' ' || n);
 v := pg_temp.val_as(l, format($q$select public.battery_import_load_tests(%L)::text$q$,
        jsonb_build_array(jsonb_build_object('time', t2, 'kind', 'load_test', 'battery', 'Q07', 'rest_v', '12.9', 'resistance_mohm', '30.1', 'min_v', '11.1', 'verdict', 'HIGH'))));
 v2 := pg_temp.val_as(p, format($q$select public.battery_import_load_tests(%L)::text$q$, v_rows));
 perform pg_temp.rec(13, 'a drive-team lead with robot.matches can import; a parent-only account cannot',
   jsonb_array_length((v::jsonb) -> 'imported') = 1 and v2 like 'err:42501:%', left(v, 60) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(m, $q$select public.battery_import_load_tests('{"kind":"load_test"}')::text$q$);
 perform pg_temp.rec(14, 'rows that are not a list are refused', v like 'err:22023:%', left(v, 60));

 -- Who reads; nobody writes the new columns directly.
 v := pg_temp.val_as(s, format($q$select count(*)::text from public.battery_runs where battery_id = %L and robot_resistance_mohm is not null$q$, b7));
 v2 := pg_temp.val_as(p, format($q$select count(*)::text from public.battery_runs where battery_id = %L and robot_resistance_mohm is not null$q$, b7));
 perform pg_temp.rec(15, 'a student reads the robot readings (2 runs); a parent-only account reads none', v = '2' and v2 = '0', v || ' | ' || v2);
 v := pg_temp.val_as(s, format($q$select robot_resistance_mohm::text || ' ' || verdict from public.robot_matches where id = %L$q$, rid));
 v2 := pg_temp.val_as(p, format($q$select count(*)::text from public.robot_matches where id = %L$q$, rid));
 perform pg_temp.rec(16, 'a student reads robot R and the verdict on the match; a parent-only account reads no match', v like '17.40 ROBOT DRAW:%' and v2 = '0', left(v, 40) || ' | ' || v2);
 v := pg_temp.val_as(m, format($q$update public.battery_runs set robot_resistance_mohm = 1 where battery_id = %L returning 1$q$, b7));
 v2 := pg_temp.val_as(m, format($q$update public.robot_matches set verdict = 'OK', robot_resistance_mohm = 1 where id = %L returning 1$q$, rid));
 perform pg_temp.rec(17, 'no direct update of the new columns, even for staff', v like 'err:42501:%' and v2 like 'err:42501:%', left(v, 40) || ' | ' || left(v2, 40));
 perform pg_temp.rec(18, 'anon cannot run the load-test import; authenticated can; the helpers are private',
   not has_function_privilege('anon', 'public.battery_import_load_tests(jsonb)', 'execute')
   and has_function_privilege('authenticated', 'public.battery_import_load_tests(jsonb)', 'execute')
   and not has_function_privilege('anon', 'public.robot_match_import(text,jsonb,jsonb)', 'execute')
   and has_function_privilege('authenticated', 'public.robot_match_import(text,jsonb,jsonb)', 'execute')
   and not has_function_privilege('authenticated', 'public._rm_extract_power(public.robot_matches)', 'execute')
   and not has_function_privilege('authenticated', 'public._rm_power_backfill()', 'execute')
   and not has_function_privilege('authenticated', 'public._rm_battery_key(text)', 'execute'), '');
 perform pg_temp.rec(19, 'battery labels as the robot types them: B7, b07, "B 07" and a bare 7 are B7; B17 is not',
   public._rm_battery_key('B7') = 'B7' and public._rm_battery_key('b07') = 'B7' and public._rm_battery_key('B 07') = 'B7' and public._rm_battery_key('7') = 'B7'
   and public._rm_battery_key('B17') <> 'B7' and public._rm_battery_key('B0') = 'B0', public._rm_battery_key('b07'));
end
$checks$;

select n, check_name as check, result, detail from t41_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t41_results
order by 1;
rollback;
