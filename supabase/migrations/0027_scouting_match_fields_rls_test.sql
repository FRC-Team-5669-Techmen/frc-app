-- ============================================================
-- 0027_scouting_match_fields test. Run AFTER 0027. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: two approved students (S, T) and a parent-only account (P).
-- Every refusal below is paired with an accepted save on the same fixture.
-- ============================================================
begin;

do $applied$
begin
  if to_regprocedure('scouting_private.validate_match(jsonb)') is null then
    raise exception 'Cannot test: 0027_scouting_match_fields.sql has not been applied';
  end if;
end
$applied$;

create temp table t27_results(n int primary key, check_name text, result text, detail text) on commit drop;
create function pg_temp.rec(n int, label text, ok boolean, detail text default '') returns void language sql as $fn$
 insert into t27_results values(n, label, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail);
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
create function pg_temp.save(who uuid, event uuid, payload jsonb, match text, team int default 5669) returns text language sql as $fn$
 select pg_temp.val_as(who, format('select public.scouting_save(%L,%L,%L,%L,%L,%L,%L,%L,%L)', gen_random_uuid(), event, 'observation', team, match, payload, 0, gen_random_uuid(), who));
$fn$;

do $checks$
#variable_conflict use_variable
declare s uuid; t uuid; p uuid; e uuid := gen_random_uuid(); v text; v2 text; full_match jsonb;
begin
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select p0.id into t from public.profiles p0 where p0.approved and p0.id<>s and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead','student')) order by member_id limit 1;
 if s is null or t is null or p is null then raise exception '0027 test needs two approved students and a parent-only account'; end if;
 update public.profiles set status='active' where id in (s,t);
 insert into public.events(id,title,kind,starts_at,ends_at) values (e,'0027 test','competition',now(),now()+interval '1 day');

 full_match := '{"auto_fuel":4,"auto_climb":"no","teleop_fuel":17,"teleop_missed":6,"shuttled":"yes","defense":"some","defense_rating":3,"driver_skill":4,"tower":"level2","died":"no","tipped":"did_not_see","stuck":"yes","broke":"no","fouls":"G204 pin, no card"}';
 v := pg_temp.save(s, e, jsonb_build_object('answers', jsonb_build_object('trench','yes'), 'source','live', 'match', full_match), 'qm1');
 perform pg_temp.rec(1, 'every REBUILT match field saves, with the three capability answers beside them (positive control)',
   v like '{%' and v::jsonb #> '{payload,match}' = full_match and v::jsonb #>> '{payload,answers,trench}' = 'yes', left(v, 80));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"teleop_fuel":0,"auto_fuel":0}}', 'qm2');
 perform pg_temp.rec(2, 'zero is an observed count and saves as 0',
   v like '{%' and (v::jsonb #> '{payload,match,teleop_fuel}') = '0'::jsonb, left(v, 80));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"tower":"level1"}}', 'qm3');
 perform pg_temp.rec(3, 'a field left out stays out (not recorded), never filled with 0',
   v like '{%' and not (v::jsonb #> '{payload,match}') ? 'teleop_fuel' and not (v::jsonb #> '{payload,match}') ? 'driver_skill', left(v, 80));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"teleop_fuel":null}}', 'qm4');
 perform pg_temp.rec(4, 'JSON null is refused: a missing answer cannot arrive as a value', v like 'err:22023:%', left(v, 80));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"teleop_fuel":"7"}}', 'qm5');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"teleop_fuel":2.5}}', 'qm5');
 perform pg_temp.rec(5, 'a count as text or a fraction is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"teleop_fuel":501}}', 'qm6');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"teleop_fuel":-1}}', 'qm6');
 perform pg_temp.rec(6, 'a count outside 0 to 500 is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"driver_skill":0}}', 'qm7');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"defense_rating":6}}', 'qm7');
 perform pg_temp.rec(7, 'a rating outside 1 to 5 is refused (0 is not a rating)', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"stuck":"maybe"}}', 'qm8');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"tower":"level4"}}', 'qm8');
 perform pg_temp.rec(8, 'a choice outside its words is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{"shooting_out_of_10":7}}', 'qm9');
 perform pg_temp.rec(9, 'an unknown match field is refused', v like 'err:22023:%', left(v, 80));

 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":[1,2]}', 'qm10');
 perform pg_temp.rec(10, 'match must be an object', v like 'err:22023:%', left(v, 80));

 v := pg_temp.save(s, e, jsonb_build_object('answers','{}'::jsonb,'source','live','match',jsonb_build_object('fouls',repeat('x',501))), 'qm11');
 perform pg_temp.rec(11, 'a fouls note over 500 characters is refused', v like 'err:22023:%', left(v, 80));

 -- Nothing else loosened: 0022's own refusals still hold beside the new key.
 v := pg_temp.save(s, e, '{"answers":{"trench":0},"source":"live","match":{"teleop_fuel":3}}', 'qm12');
 perform pg_temp.rec(12, '0022 still refuses a numeric capability answer', v like 'err:22023:%', left(v, 80));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","match":{},"extra":1}', 'qm12');
 perform pg_temp.rec(13, '0022 still refuses an unknown payload key', v like 'err:22023:%', left(v, 80));
 v := pg_temp.val_as(s, format('select public.scouting_save(%L,%L,%L,%L,%L,%L,%L,%L,%L)', gen_random_uuid(), e, 'pit', 5669, null, '{"capabilities":{},"match":{"teleop_fuel":3}}'::jsonb, 0, gen_random_uuid(), s));
 perform pg_temp.rec(14, 'a pit report cannot carry match fields', v like 'err:22023:%', left(v, 80));
 v := pg_temp.save(p, e, '{"answers":{},"source":"live","match":{"teleop_fuel":3}}', 'qm13');
 perform pg_temp.rec(15, 'a parent-only account still cannot save, with match fields or without', v like 'err:42501:%', left(v, 80));

 v := pg_temp.val_as(t, 'select public.scouting_match_fields()::text');
 perform pg_temp.rec(16, 'a student reads the field list', v like '{%' and (v::jsonb -> 'counts') ? 'teleop_fuel', left(v, 60));
 perform pg_temp.rec(17, 'validate_match is not callable by clients',
   not has_function_privilege('authenticated', 'scouting_private.validate_match(jsonb)', 'execute')
   and not has_function_privilege('anon', 'public.scouting_match_fields()', 'execute'), '');
end
$checks$;

select n, check_name as check, result, detail from t27_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t27_results
order by 1;
rollback;
