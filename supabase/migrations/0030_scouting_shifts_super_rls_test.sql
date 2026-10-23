-- ============================================================
-- 0030_scouting_shifts_super test. Run AFTER 0030. SAFE ON LIVE DATA: one
-- transaction ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: a mentor (M, a scouting manager), two approved students (S, T)
-- and a parent-only account (P). Every refusal is paired with an accepted
-- save or read on the same fixture.
-- ============================================================
begin;

do $applied$
begin
  if to_regprocedure('public.scouting_now_set(uuid,integer,integer,integer)') is null then
    raise exception 'Cannot test: 0030_scouting_shifts_super.sql has not been applied';
  end if;
end
$applied$;

create temp table t30_results(n int primary key, check_name text, result text, detail text) on commit drop;
create function pg_temp.rec(n int, label text, ok boolean, detail text default '') returns void language sql as $fn$
 insert into t30_results values(n, label, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail);
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

create function pg_temp.jp(v text, path text[]) returns text language plpgsql as $fn$
begin return v::jsonb #>> path; exception when others then return null; end
$fn$;
create function pg_temp.save_kind(who uuid, event uuid, kind text, team int, match text, payload jsonb) returns text language sql as $fn$
 select pg_temp.val_as(who, format('select public.scouting_save(%L,%L,%L,%L,%L,%L,%L,%L,%L)', gen_random_uuid(), event, kind, team, match, payload, 0, gen_random_uuid(), who));
$fn$;

do $checks$
#variable_conflict use_variable
declare m uuid; s uuid; t uuid; p uuid; e uuid := gen_random_uuid(); v text; v2 text;
begin
 select member_id into m from public.member_roles where role='mentor' order by member_id limit 1;
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select p0.id into t from public.profiles p0 where p0.approved and p0.id<>s and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead','student')) order by member_id limit 1;
 if m is null or s is null or t is null or p is null then raise exception '0030 test needs a mentor, two approved students and a parent-only account'; end if;
 update public.profiles set status='active', approved=true where id in (s,t,m);
 insert into public.events(id,title,kind,starts_at,ends_at) values (e,'0030 test','competition',now(),now()+interval '1 day');

 -- Super-scout notes.
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{"driver_skill":4,"defense":2,"speed":5,"intake":3,"failures":"Lost a chain in teleop"},"notes":"Red alliance"}', 'qm1');
 perform pg_temp.rec(1, 'a super-scout note with every rating and a failure note saves (positive control)',
   v like '{%' and pg_temp.jp(v, '{payload,super,speed}') = '5' and pg_temp.jp(v, '{payload,role}') = 'super', left(v, 80));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{"driver_skill":3},"match":{"teleop_fuel":5}}', 'qm2');
 v2 := pg_temp.save(s, e, '{"answers":{"trench":"yes"},"source":"live","role":"super","super":{"driver_skill":3}}', 'qm2');
 perform pg_temp.rec(2, 'a super-scout note cannot carry counts or capability answers', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{"driver_skill":6}}', 'qm3');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{"speed":0}}', 'qm3');
 perform pg_temp.rec(3, 'a super rating outside 1 to 5 is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{"intake":null}}', 'qm4');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{"intake":2.5}}', 'qm4');
 perform pg_temp.rec(4, 'null or a fractional rating is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{"vibes":5}}', 'qm5');
 perform pg_temp.rec(5, 'an unknown super field is refused', v like 'err:22023:%', left(v, 80));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","super":{"driver_skill":3}}', 'qm6');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"scout","super":{"driver_skill":3}}', 'qm6');
 perform pg_temp.rec(6, 'only a super-scout note carries super ratings', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super","super":{}}', 'qm7');
 v2 := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"super"}', 'qm7');
 perform pg_temp.rec(7, 'an empty or missing super object is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save(s, e, '{"answers":{},"source":"live","role":"captain"}', 'qm8');
 perform pg_temp.rec(8, 'a role other than scout or super is refused', v like 'err:22023:%', left(v, 80));
 v := pg_temp.save(s, e, jsonb_build_object('answers','{}'::jsonb,'source','live','role','super','super',jsonb_build_object('failures',repeat('x',1001))), 'qm9');
 perform pg_temp.rec(9, 'a failure note over 1000 characters is refused', v like 'err:22023:%', left(v, 80));
 v := pg_temp.save(s, e, '{"answers":{"trench":"no"},"source":"live","role":"scout","match":{"teleop_fuel":10}}', 'qm9');
 perform pg_temp.rec(10, 'a data scout''s observation with role scout and match fields still saves (positive control)', v like '{%', left(v, 80));

 -- Super-scout assignments (managers only, as every assignment).
 v := pg_temp.save_kind(m, e, 'assignment', 5669, 'qm10', jsonb_build_object('assignee', s, 'status','assigned', 'role','super', 'alliance','red', 'teams','[5669,254,1678]'::jsonb));
 perform pg_temp.rec(11, 'a manager saves a super-scout assignment for the red alliance (positive control)', v like '{%' and pg_temp.jp(v, '{payload,alliance}') = 'red', left(v, 80));
 v := pg_temp.save_kind(m, e, 'assignment', 5669, 'qm11', jsonb_build_object('assignee', s, 'status','assigned', 'role','super', 'alliance','green', 'teams','[5669]'::jsonb));
 v2 := pg_temp.save_kind(m, e, 'assignment', 5669, 'qm11', jsonb_build_object('assignee', s, 'status','assigned', 'role','super', 'alliance','blue', 'teams','[254,1678]'::jsonb));
 perform pg_temp.rec(12, 'a super assignment needs red or blue, and its own team in its teams', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save_kind(m, e, 'assignment', 5669, 'qm12', jsonb_build_object('assignee', s, 'status','assigned', 'role','super', 'alliance','blue', 'teams','[5669,5669]'::jsonb));
 v2 := pg_temp.save_kind(m, e, 'assignment', 5669, 'qm12', jsonb_build_object('assignee', s, 'status','assigned', 'role','super', 'alliance','blue', 'teams','[5669,1,2,3]'::jsonb));
 perform pg_temp.rec(13, 'super teams cannot repeat or exceed three', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save_kind(m, e, 'assignment', 5669, 'qm13', jsonb_build_object('assignee', s, 'status','assigned', 'alliance','red'));
 perform pg_temp.rec(14, 'only a super assignment names an alliance', v like 'err:22023:%', left(v, 80));
 v := pg_temp.save_kind(s, e, 'assignment', 5669, 'qm14', jsonb_build_object('assignee', s, 'status','assigned', 'role','super', 'alliance','red', 'teams','[5669]'::jsonb));
 perform pg_temp.rec(15, 'a student still cannot create assignments, super or not', v like 'err:42501:%', left(v, 80));

 -- Redundant pairs: two scouts on one robot in one match.
 v := pg_temp.save_kind(m, e, 'assignment', 971, 'qm20', jsonb_build_object('assignee', s, 'status','assigned'));
 v2 := pg_temp.save_kind(m, e, 'assignment', 971, 'qm20', jsonb_build_object('assignee', t, 'status','assigned'));
 perform pg_temp.rec(16, 'two scouts can be assigned the same robot in the same match (pair)', v like '{%' and v2 like '{%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save_kind(m, e, 'assignment', 971, 'qm20', jsonb_build_object('assignee', s, 'status','assigned'));
 perform pg_temp.rec(17, 'but the same scout twice on one robot and match is still a conflict', v like 'err:PT409:%', left(v, 80));

 -- The shared "now" match number.
 v := pg_temp.val_as(s, format('select public.scouting_now_get(%L)::text', e));
 perform pg_temp.rec(18, 'before a lead sets it, a student reads null', v = 'null', v);
 v := pg_temp.val_as(s, format('select public.scouting_now_set(%L, 5, null, null)::text', e));
 perform pg_temp.rec(19, 'a student cannot move the current match', v like 'err:42501:%', left(v, 80));
 v := pg_temp.val_as(m, format('select public.scouting_now_set(%L, 5, null, 12)::text', e));
 v2 := pg_temp.val_as(m, format('select public.scouting_now_set(%L, null, 1, null)::text', e));
 perform pg_temp.rec(20, 'a manager sets Q5, then bumps +1 to Q6 (positive control)', v like '{%' and pg_temp.jp(v, '{match_number}') = '5' and v2 like '{%' and pg_temp.jp(v2, '{match_number}') = '6', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(t, format('select public.scouting_now_get(%L)::text', e));
 perform pg_temp.rec(21, 'every scout reads the bumped match number', v like '{%' and pg_temp.jp(v, '{match_number}') = '6' and pg_temp.jp(v, '{block_size}') = '12', left(v, 80));
 v := pg_temp.val_as(p, format('select public.scouting_now_get(%L)::text', e));
 perform pg_temp.rec(22, 'a parent-only account cannot read it', v like 'err:42501:%', left(v, 80));
 v := pg_temp.val_as(s, format('select count(*)::text from public.scouting_now where event_id=%L', e));
 v2 := pg_temp.val_as(s, format('update public.scouting_now set match_number=99 where event_id=%L returning 1', e));
 perform pg_temp.rec(23, 'the table itself is closed to clients: no direct read, no direct update', v like 'err:42501:%' and v2 like 'err:42501:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(m, format('select public.scouting_now_set(%L, 0, null, null)::text', e));
 v2 := pg_temp.val_as(m, format('select public.scouting_now_set(%L, null, -3, null)::text', e));
 perform pg_temp.rec(24, 'a bump below zero stops at 0', v2 like '{%' and coalesce(pg_temp.jp(v2, '{match_number}') = '0', false), left(v2, 80));
 v := pg_temp.val_as(m, format('select public.scouting_now_set(%L, 1000, null, null)::text', e));
 v2 := pg_temp.val_as(m, format('select public.scouting_now_set(%L, 3, 1, null)::text', e));
 perform pg_temp.rec(25, 'a match number over 999, or set and bump together, is refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(m, format('select public.scouting_now_set(%L, null, null, 8)::text', e));
 perform pg_temp.rec(26, 'a manager changes only the block size; the match number stays', v like '{%' and pg_temp.jp(v, '{block_size}') = '8' and pg_temp.jp(v, '{match_number}') = '0', left(v, 80));
 perform pg_temp.rec(27, 'validate_super is not callable by clients, and anon cannot call the now functions',
   not has_function_privilege('authenticated', 'scouting_private.validate_super(jsonb)', 'execute')
   and not has_function_privilege('anon', 'public.scouting_now_get(uuid)', 'execute')
   and not has_function_privilege('anon', 'public.scouting_now_set(uuid,integer,integer,integer)', 'execute')
   and has_function_privilege('authenticated', 'public.scouting_now_get(uuid)', 'execute'), '');
end
$checks$;

select n, check_name as check, result, detail from t30_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t30_results
order by 1;
rollback;
