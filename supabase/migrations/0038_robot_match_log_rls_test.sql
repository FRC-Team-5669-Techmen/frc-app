-- ============================================================
-- 0038_robot_match_log test. Run AFTER 0038. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: a mentor (M, staff), two approved students (S plain, L holding
-- robot.matches) and a parent-only account (P). The fixture file is the
-- robot repo's match-data/sample/sim-example_practice.json with one unknown
-- field added and one brownout. Every refusal is paired with an accepted call.
-- ============================================================
begin;

do $applied$
begin
  if to_regprocedure('public.robot_match_import(text,jsonb,jsonb)') is null then
    raise exception 'Cannot test: 0038_robot_match_log.sql has not been applied';
  end if;
end
$applied$;

create temp table t38_results(n int primary key, check_name text, result text, detail text) on commit drop;
create function pg_temp.rec(n int, label text, ok boolean, detail text default '') returns void language sql as $fn$
 insert into t38_results values(n, label, case when coalesce(ok, false) then 'PASS' else 'FAIL' end, detail); -- null is a FAIL here, never a skip
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
create temp table t38_file(raw jsonb) on commit drop;
insert into t38_file values ($json${"schema": 1, "kind": "practice", "robotMatch": 1, "startedAt": "2026-10-28T10:36:05.893596804", "fms": false, "event": "", "fmsMatchType": "None", "fmsMatchNumber": 0, "fmsReplay": 0, "alliance": "red", "station": 1, "autoName": "Shoot Preload (stay put)", "driver": "", "operator": "", "coach": "", "batteryLabel": "", "durationSeconds": 17.1, "scoring": {"autoBalls": 0, "ballsHubOpen": 0, "ballsHubClosed": 0, "passes": 0, "ballsTotal": 0, "rtHeldSeconds": 4.0, "readyWhileRtHeldPct": 0.0, "firingSeconds": 0.0, "ballsPerFiringSecond": 0.0, "launchRpmErrorMean": null, "notReadySecondsByReason": {"tag-only: turret not on hub tag": 4.0, "-": 0.0}}, "battery": {"start": 13.5, "end": 13.5, "min": 13.5, "minWhere": "AUTO 0:20", "avg": 13.5, "secondsBelow10V": 0.0, "secondsBelow8V": 0.0, "brownouts": 1, "powerSagSeconds": 0.0}, "drive": {"distanceMeters": 0.0, "topSpeedMps": 0.0, "driveSupplyAmpsAvg": 0.0, "driveSupplyAmpsPeak": 0.0, "defenseSeconds": 0.0, "vacuumSeconds": 5.0, "dumpSeconds": 0.0}, "aim": {"aimOnPct": 96.6, "positionKnownPct": 0.0, "longestSecondsWithoutVisionFix": 124.4}, "climb": {"liftAtSeconds": null, "hangAtSeconds": null, "hangingAtEnd": false}, "can": {"busOffEvents": 0, "utilizationMaxPct": 0.0}, "phases": [{"phase": "AUTO", "seconds": 4.0, "shots": 0, "batteryMin": 13.5, "batteryAvg": 13.5}, {"phase": "TRANSITION", "seconds": 10.1, "shots": 0, "batteryMin": 13.5, "batteryAvg": 13.5}, {"phase": "SHIFT 1", "seconds": 3.0, "shots": 0, "batteryMin": 13.5, "batteryAvg": 13.5}], "events": [{"t": 0.02, "clock": "0:20", "phase": "AUTO", "text": "aim ON"}, {"t": 3.52, "clock": "0:17", "phase": "AUTO", "text": "aim OFF"}, {"t": 3.52, "clock": "0:17", "phase": "AUTO", "text": "AUTO finished after 3.5 s (auto is 20 s)"}, {"t": 4.02, "clock": "-", "phase": "DISABLED", "text": "RunCommand interrupted by RunCommand"}, {"t": 4.02, "clock": "-", "phase": "DISABLED", "text": "RunCommand interrupted by disable / mode change / cancel"}, {"t": 4.02, "clock": "-", "phase": "DISABLED", "text": "Turret: watch hub in auto interrupted by disable / mode change / cancel"}, {"t": 7.0, "clock": "2:20", "phase": "TRANSITION", "text": "phase TRANSITION"}, {"t": 7.02, "clock": "2:20", "phase": "TRANSITION", "text": "aim ON"}, {"t": 7.02, "clock": "2:20", "phase": "TRANSITION", "text": "RunCommand interrupted by disable / mode change / cancel"}, {"t": 14.02, "clock": "2:13", "phase": "TRANSITION", "text": "ShootCommand interrupted by disable / mode change / cancel"}, {"t": 15.03, "clock": "2:12", "phase": "TRANSITION", "text": "vacuum ON"}, {"t": 15.03, "clock": "2:12", "phase": "TRANSITION", "text": "RunCommand interrupted by Vacuum: shoot"}, {"t": 17.0, "clock": "2:10", "phase": "SHIFT 1", "text": "phase SHIFT 1"}], "autoWinner": "blue", "autoWinnerRandom": true, "batteryEndAtRest": 13.5, "logDir": "/home/lvuser/logs", "futureField": {"kept": true}}$json$::jsonb);
create function pg_temp.f(started text) returns jsonb language sql as $fn$
 select jsonb_set(raw, '{startedAt}', to_jsonb(started)) from t38_file
$fn$;
grant select on t38_file to authenticated;

do $checks$
#variable_conflict use_variable
declare m uuid; s uuid; l uuid; p uuid; b uuid; v text; v2 text; rid uuid; e uuid := gen_random_uuid(); n int; t0 text;
begin
 select member_id into m from public.member_roles where role='mentor' order by member_id limit 1;
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select p0.id into l from public.profiles p0 where p0.approved and p0.id<>s and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead','student')) order by member_id limit 1;
 if m is null or s is null or l is null or p is null then raise exception '0038 test needs a mentor, two approved students and a parent-only account'; end if;
 update public.profiles set status='active', approved=true where id in (s,l,m);
 insert into public.member_permissions (member_id, capability, granted_by) values (l, 'robot.matches', m) on conflict do nothing;
 insert into public.batteries (label, status, charge_state) values ('T38', 'competition', 'charged') returning id into b;
 t0 := to_char((now() - interval '1 hour') at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS');

 -- Import, idempotence, unknown fields.
 v := pg_temp.val_as(m, format($q$select public.robot_match_import('t38_a_practice_1.json', %L, %L)::text$q$, pg_temp.f(t0), jsonb_build_object('battery', b, 'driver', s, 'sim_match', null)));
 rid := (pg_temp.jp(v, '{match,id}'))::uuid;
 perform pg_temp.rec(1, 'staff imports a robot file (positive control)', v like '{%' and pg_temp.jp(v, '{status}') = 'imported', left(v, 100));
 perform pg_temp.rec(2, 'the compared numbers are copied into columns',
   exists(select 1 from public.robot_matches where id = rid and kind = 'practice' and battery_start = 13.5 and battery_end = 13.5 and brownouts = 1 and auto_name = 'Shoot Preload (stay put)'
     and alliance = 'red' and duration_s = 17.1 and ready_pct = 0 and schema_version = 1 and match_label = 'practice 1'), '');
 perform pg_temp.rec(3, 'the whole file is kept, unknown fields included', exists(select 1 from public.robot_matches where id = rid and raw #>> '{futureField,kept}' = 'true' and raw ? 'events'), '');
 v := pg_temp.val_as(m, format($q$select public.robot_match_import('t38_a_practice_1.json', %L, '{}')::text$q$, pg_temp.f(t0)));
 select count(*) into n from public.robot_matches where file_name = 't38_a_practice_1.json';
 perform pg_temp.rec(4, 're-importing the same file changes nothing', pg_temp.jp(v, '{status}') = 'already' and n = 1, left(v, 60));
 select count(*) into n from public.battery_runs where notes = 'Robot match file t38_a_practice_1.json';
 perform pg_temp.rec(5, 'one battery run, from the file: start, end, brownout yes, practice_match',
   n = 1 and exists(select 1 from public.battery_runs where notes = 'Robot match file t38_a_practice_1.json' and voltage_before = 13.5 and voltage_after = 13.5 and brownout = 'yes' and kind = 'practice_match' and battery_id = b), n::text);
 select count(*) into n from public.drive_sessions where notes = 'Robot match file t38_a_practice_1.json';
 perform pg_temp.rec(6, 'one drive session for the driver, practice_field, at least 1 minute',
   n = 1 and exists(select 1 from public.drive_sessions where notes = 'Robot match file t38_a_practice_1.json' and member_id = s and kind = 'practice_field' and minutes >= 1), n::text);

 -- Who may write.
 v := pg_temp.val_as(s, format($q$select public.robot_match_import('t38_b.json', %L, '{"sim_match": null}')::text$q$, pg_temp.f(t0)));
 v2 := pg_temp.val_as(l, format($q$select public.robot_match_import('t38_b.json', %L, '{"sim_match": null}')::text$q$, pg_temp.f(t0)));
 perform pg_temp.rec(7, 'a plain student cannot import; a drive-team lead with robot.matches can', v like 'err:42501:%' and v2 like '{%' and pg_temp.jp(v2, '{status}') = 'imported', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(p, format($q$select public.robot_match_import('t38_c.json', %L, '{}')::text$q$, pg_temp.f(t0)));
 perform pg_temp.rec(8, 'a parent-only account cannot import', v like 'err:42501:%', left(v, 60));
 v := pg_temp.val_as(s, format($q$select public.robot_match_update(%L, '{"notes_driver":"late"}')::text$q$, rid));
 v2 := pg_temp.val_as(l, format($q$select public.robot_match_update(%L, '{"notes_driver":"Stayed in the trench too long","scorer_balls_in":14,"tower":"level2"}')::text$q$, rid));
 perform pg_temp.rec(9, 'a plain student cannot edit; the lead can (notes, scorer count, TOWER)', v like 'err:42501:%' and v2 like '{%' and pg_temp.jp(v2, '{scorer_balls_in}') = '14' and pg_temp.jp(v2, '{tower}') = 'level2', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(m, format($q$select public.robot_match_update(%L, '{"raw":{}}')::text$q$, rid));
 v2 := pg_temp.val_as(m, format($q$select public.robot_match_update(%L, '{"video_url":"http://x"}')::text$q$, rid));
 perform pg_temp.rec(10, 'the stored file and unknown fields cannot be edited; a non-HTTPS video is refused', v like 'err:22023:%' and v2 like 'err:%', left(v, 40) || ' | ' || left(v2, 40));

 -- Who may read; nobody writes directly.
 v := pg_temp.val_as(s, $q$select count(*)::text from public.robot_matches where file_name like 't38_%'$q$);
 v2 := pg_temp.val_as(p, $q$select count(*)::text from public.robot_matches where file_name like 't38_%'$q$);
 perform pg_temp.rec(11, 'members read the log (2 rows); a parent-only account reads none', v = '2' and v2 = '0', v || ' | ' || v2);
 v := pg_temp.val_as(m, format($q$update public.robot_matches set notes_pit = 'x' where id = %L returning 1$q$, rid));
 v2 := pg_temp.val_as(m, $q$insert into public.robot_matches (source, kind, started_at) values ('robot_file', 'practice', now()) returning 1$q$);
 perform pg_temp.rec(12, 'no direct update or insert, even for staff', v like 'err:42501:%' and v2 like 'err:42501:%', left(v, 40) || ' | ' || left(v2, 40));

 -- One record when the Match Sim page logged the same practice match.
 v := pg_temp.val_as(m, format($q$select public.sim_save_match(%L, %L, 'red', 'blue', null, null, null, null, %L, null, null, 3, 9, 'level1', 12.9, 12.1, 'no', 'HP fed well', null)::text$q$,
        now() - interval '2 hours', now() - interval '2 hours' + interval '160 seconds', b));
 select count(*) into n from public.robot_matches where sim_match_id = (pg_temp.jp(v, '{id}'))::uuid;
 perform pg_temp.rec(13, 'a Match Sim save makes exactly one log row, with its battery run linked', n = 1
   and exists(select 1 from public.robot_matches where sim_match_id = (pg_temp.jp(v, '{id}'))::uuid and source = 'sim_page' and battery_run_id is not null and scorer_balls_in = 12), n::text);
 v2 := pg_temp.val_as(m, format($q$select public.robot_match_import('t38_sim_practice_2.json', %L, '{}')::text$q$,
        pg_temp.f(to_char((now() - interval '2 hours' + interval '40 seconds') at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS'))));
 select count(*) into n from public.robot_matches where sim_match_id = (pg_temp.jp(v, '{id}'))::uuid or file_name = 't38_sim_practice_2.json';
 perform pg_temp.rec(14, 'its robot file then fills that same row: one record, source both, sim notes kept', pg_temp.jp(v2, '{status}') = 'merged' and n = 1
   and exists(select 1 from public.robot_matches where file_name = 't38_sim_practice_2.json' and source = 'both' and notes_human_player = 'HP fed well' and battery_start = 13.5), pg_temp.jp(v2, '{status}') || ' ' || n);
 select count(*) into n from public.battery_runs r join public.robot_matches x on x.battery_run_id = r.id where x.file_name = 't38_sim_practice_2.json';
 perform pg_temp.rec(15, 'the merge writes no second battery run', n = 1 and not exists(select 1 from public.battery_runs where notes = 'Robot match file t38_sim_practice_2.json'), n::text);

 -- Official score from imported TBA results.
 insert into public.events (id, title, kind, starts_at, ends_at) values (e, '0038 test comp', 'competition', now() - interval '3 hours', now() + interval '1 day');
 v := pg_temp.val_as(m, format($q$select public.robot_match_import('t38_qual_12.json', %L, %L)::text$q$,
        jsonb_set(jsonb_set(jsonb_set(pg_temp.f(t0), '{kind}', '"qual"'), '{fmsMatchNumber}', '12'), '{fms}', 'true'), '{"sim_match": null}'));
 perform pg_temp.rec(16, 'a qual file links to the running competition and is labeled qm12', pg_temp.jp(v, '{match,event_id}') = e::text and pg_temp.jp(v, '{match,match_label}') = 'qm12', left(v, 80));
 rid := (pg_temp.jp(v, '{match,id}'))::uuid;
 v := pg_temp.val_as(m, format($q$select public.robot_match_fill_official(%L)::text$q$, rid));
 perform pg_temp.rec(17, 'no TBA result yet: nothing is filled (negative control)', pg_temp.jp(v, '{official}') = 'not_available' and pg_temp.jp(v, '{match_score}') is null, left(v, 80));
 insert into public.scouting_records (id, event_id, member_id, kind, team_number, payload, version)
 values (gen_random_uuid(), e, m, 'team', 5669, jsonb_build_object('name', 'Techmen', 'source', 'tba', 'source_url', 'https://www.thebluealliance.com/event/2026test', 'fetched_at', now(),
   'official_results', jsonb_build_array(jsonb_build_object('source', 'tba', 'alliance', 'red', 'match_key', '2026test_qm12', 'alliance_score', 187, 'score_breakdown', jsonb_build_object('rp', 3), 'fetched_at', now()),
                                         jsonb_build_object('source', 'tba', 'alliance', 'blue', 'match_key', '2026test_qm12', 'alliance_score', 140, 'fetched_at', now() + interval '1 minute'))), 1);
 v := pg_temp.val_as(m, format($q$select public.robot_match_fill_official(%L)::text$q$, rid));
 perform pg_temp.rec(18, 'with the TBA result: our alliance score 187 and 3 RP, never the other alliance', pg_temp.jp(v, '{official}') = 'filled' and pg_temp.jp(v, '{match_score}') = '187' and pg_temp.jp(v, '{ranking_points}') = '3.0', left(v, 100));
 v := pg_temp.val_as(s, format($q$select public.robot_match_fill_official(%L)::text$q$, rid));
 perform pg_temp.rec(19, 'a plain student cannot fill official results', v like 'err:42501:%', left(v, 60));

 -- Bad files.
 v := pg_temp.val_as(m, format($q$select public.robot_match_import('bad name.json', %L, '{}')::text$q$, pg_temp.f(t0)));
 v2 := pg_temp.val_as(m, $q$select public.robot_match_import('t38_noschema.json', '{"kind":"practice","startedAt":"2026-10-28T10:00:00"}', '{}')::text$q$);
 perform pg_temp.rec(20, 'a file name with a space, or a file with no schema, is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 perform pg_temp.rec(21, 'anon cannot call the functions; authenticated can; helpers are private',
   not has_function_privilege('anon', 'public.robot_match_import(text,jsonb,jsonb)', 'execute')
   and not has_function_privilege('anon', 'public.robot_match_update(uuid,jsonb)', 'execute')
   and has_function_privilege('authenticated', 'public.robot_match_import(text,jsonb,jsonb)', 'execute')
   and not has_function_privilege('authenticated', 'public._rm_extract(public.robot_matches)', 'execute'), '');
end
$checks$;

select n, check_name as check, result, detail from t38_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t38_results
order by 1;
rollback;
