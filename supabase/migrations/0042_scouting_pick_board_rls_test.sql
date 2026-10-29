-- ============================================================
-- 0042_scouting_pick_board test. Run AFTER 0042. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: a mentor (M, a scouting manager), an approved student (S) and a
-- parent-only account (P). Every refusal is paired with an accepted save or
-- read on the same fixture.
-- ============================================================
begin;

do $applied$
begin
  if to_regprocedure('public.scouting_pick_board_save(uuid,text,jsonb,integer,integer)') is null then
    raise exception 'Cannot test: 0042_scouting_pick_board.sql has not been applied';
  end if;
end
$applied$;

create temp table t42_results(n int primary key, check_name text, result text, detail text) on commit drop;
create function pg_temp.rec(n int, label text, ok boolean, detail text default '') returns void language sql as $fn$
 insert into t42_results values(n, label, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail);
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
create function pg_temp.board(who uuid, e uuid, section text, val text, team int default null, expected int default null) returns text language sql as $fn$
 select pg_temp.val_as(who, format('select public.scouting_pick_board_save(%L,%L,%L::jsonb,%L,%L)::text', e, section, val, team, expected));
$fn$;

do $checks$
#variable_conflict use_variable
declare m uuid; s uuid; p uuid; e uuid := gen_random_uuid(); e2 uuid := gen_random_uuid(); v text; v2 text;
begin
 select member_id into m from public.member_roles where role='mentor' order by member_id limit 1;
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead','student')) order by member_id limit 1;
 if m is null or s is null or p is null then raise exception '0042 test needs a mentor, an approved student and a parent-only account'; end if;
 update public.profiles set status='active', approved=true where id in (s,m);
 insert into public.events(id,title,kind,starts_at,ends_at) values (e,'0042 test','competition',now(),now()+interval '1 day');
 insert into public.events(id,title,kind,starts_at,ends_at) values (e2,'0042 meeting','meeting',now(),now()+interval '1 day');

 v := pg_temp.val_as(s, format('select public.scouting_pick_board_get(%L)::text', e));
 perform pg_temp.rec(1, 'before anything is saved, a student reads null', v = 'null', v);

 -- Overrides.
 v := pg_temp.board(s, e, 'override', '{"flag":"must"}', 254);
 perform pg_temp.rec(2, 'a student cannot mark a team', v like 'err:42501:%', left(v, 80));
 v := pg_temp.board(m, e, 'override', '{"flag":"must","bump":6,"note":"fast cycles"}', 254);
 perform pg_temp.rec(3, 'a manager marks 254 Must pick with a bump and a note (positive control)', v like '{%' and pg_temp.jp(v, '{state,overrides,254,flag}') = 'must' and pg_temp.jp(v, '{state,overrides,254,bump}') = '6' and pg_temp.jp(v, '{state,overrides,254,by}') = m::text, left(v, 120));
 v := pg_temp.board(m, e, 'override', '{"flag":"avoid"}', 1678);
 perform pg_temp.rec(4, 'marking a second team keeps the first', pg_temp.jp(v, '{state,overrides,254,flag}') = 'must' and pg_temp.jp(v, '{state,overrides,1678,flag}') = 'avoid', left(v, 120));
 v := pg_temp.val_as(s, format('select public.scouting_pick_board_get(%L)::text', e));
 perform pg_temp.rec(5, 'every scout reads the marks', v like '{%' and pg_temp.jp(v, '{state,overrides,1678,flag}') = 'avoid', left(v, 80));
 v := pg_temp.val_as(p, format('select public.scouting_pick_board_get(%L)::text', e));
 perform pg_temp.rec(6, 'a parent-only account cannot read the board', v like 'err:42501:%', left(v, 80));
 v := pg_temp.board(m, e, 'override', '{"flag":"maybe"}', 254);
 v2 := pg_temp.board(m, e, 'override', '{"bump":31}', 254);
 perform pg_temp.rec(7, 'an unknown flag, or a bump over 30, is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.board(m, e, 'override', '{"flag":"must","score":99}', 254);
 perform pg_temp.rec(8, 'an override cannot carry other keys', v like 'err:22023:%', left(v, 80));
 v := pg_temp.board(m, e, 'override', 'null', 1678);
 perform pg_temp.rec(9, 'a null value clears one team and keeps the other', v like '{%' and pg_temp.jp(v, '{state,overrides,1678}') is null and pg_temp.jp(v, '{state,overrides,254,flag}') = 'must', left(v, 120));

 -- The selection log and its version guard.
 v := pg_temp.board(m, e, 'selection', '{"seeds":[1,2,3],"log":[{"type":"pick","team":4}],"rounds":3,"alliances":8}', null, 0);
 perform pg_temp.rec(10, 'a manager saves the first selection at version 0 (positive control)', v like '{%' and pg_temp.jp(v, '{state,selection,version}') = '1' and pg_temp.jp(v, '{state,selection,log,0,team}') = '4', left(v, 120));
 v := pg_temp.board(m, e, 'selection', '{"seeds":[1,2,3],"log":[]}', null, 0);
 perform pg_temp.rec(11, 'a save from a stale version is refused (40001), so two operators cannot overwrite each other', v like 'err:40001:%', left(v, 80));
 v := pg_temp.board(m, e, 'selection', '{"seeds":[1,2,3],"log":[{"type":"pick","team":4},{"type":"decline","team":5}]}', null, 1);
 perform pg_temp.rec(12, 'the current version saves and moves to 2', v like '{%' and pg_temp.jp(v, '{state,selection,version}') = '2' and pg_temp.jp(v, '{state,selection,log,1,type}') = 'decline', left(v, 120));
 v := pg_temp.board(s, e, 'selection', '{"seeds":[],"log":[]}', null, 2);
 perform pg_temp.rec(13, 'a student cannot record picks', v like 'err:42501:%', left(v, 80));
 v := pg_temp.board(m, e, 'selection', '{"seeds":[1],"log":[{"type":"trade","team":4}]}', null, 2);
 v2 := pg_temp.board(m, e, 'selection', '{"seeds":[1],"log":[{"type":"pick"}]}', null, 2);
 perform pg_temp.rec(14, 'a log entry must be a pick or decline of one team', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.board(m, e, 'selection', '{"seeds":[1],"log":[]}', null, null);
 perform pg_temp.rec(15, 'a selection save without the version it read is refused', v like 'err:40001:%', left(v, 80));

 -- Results snapshot and settings.
 v := pg_temp.board(m, e, 'matches', '{"event_key":"2026cabl","matches":[{"key":"2026cabl_qm1"}]}');
 perform pg_temp.rec(16, 'a manager saves a results snapshot, stamped with who saved it', v like '{%' and pg_temp.jp(v, '{state,matches,matches,0,key}') = '2026cabl_qm1' and pg_temp.jp(v, '{state,matches,saved_by}') = m::text, left(v, 120));
 v := pg_temp.board(m, e, 'matches', '{"matches":"all"}');
 perform pg_temp.rec(17, 'results must be a list', v like 'err:22023:%', left(v, 80));
 v := pg_temp.board(m, e, 'settings', '{"event_key":"2026cabl","our_team":5669,"rounds":3}');
 v2 := pg_temp.board(m, e, 'settings', '{"rounds":9}');
 perform pg_temp.rec(18, 'settings save; 9 rounds is refused', v like '{%' and pg_temp.jp(v, '{state,settings,rounds}') = '3' and v2 like 'err:22023:%', left(v, 60) || ' | ' || left(v2, 40));
 v := pg_temp.board(m, e, 'settings', '{"password":"x"}');
 perform pg_temp.rec(19, 'an unknown setting is refused', v like 'err:22023:%', left(v, 80));
 v := pg_temp.board(m, e, 'secrets', '{}');
 perform pg_temp.rec(20, 'an unknown section is refused', v like 'err:22023:%', left(v, 80));
 v := pg_temp.board(m, e2, 'settings', '{"rounds":3}');
 perform pg_temp.rec(21, 'a board belongs to a competition or training event only', v like 'err:22023:%', left(v, 80));
 v := pg_temp.board(m, e, 'matches', format('{"matches":[%s]}', repeat('{"key":"x"},', 40000) || '{"key":"y"}'));
 perform pg_temp.rec(22, 'a snapshot over 400 KB is refused', v like 'err:22023:%', left(v, 80));

 -- The table itself.
 v := pg_temp.val_as(s, format('select count(*)::text from public.scouting_pick_board where event_id=%L', e));
 v2 := pg_temp.val_as(m, format('update public.scouting_pick_board set state=%L where event_id=%L returning 1', '{}', e));
 perform pg_temp.rec(23, 'the table is closed to clients, even to a manager: no direct read, no direct update', v like 'err:42501:%' and v2 like 'err:42501:%', left(v, 40) || ' | ' || left(v2, 40));
 perform pg_temp.rec(24, 'and the version counted the 7 accepted saves, none of the refused ones', (select version from public.scouting_pick_board where event_id=e) = 7, (select version::text from public.scouting_pick_board where event_id=e));
 perform pg_temp.rec(25, 'anon cannot call either function; members can',
   not has_function_privilege('anon', 'public.scouting_pick_board_get(uuid)', 'execute')
   and not has_function_privilege('anon', 'public.scouting_pick_board_save(uuid,text,jsonb,integer,integer)', 'execute')
   and has_function_privilege('authenticated', 'public.scouting_pick_board_get(uuid)', 'execute'), '');
end
$checks$;

select n, check_name as check, result, detail from t42_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t42_results
order by 1;
rollback;
