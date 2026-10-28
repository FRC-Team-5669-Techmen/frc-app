-- ============================================================
-- 0037_scouting_observation_options test. Run AFTER 0037. SAFE ON LIVE DATA:
-- one transaction ending in ROLLBACK. ONE ROW PER CHECK plus a "summary" row.
-- Actors: a mentor (M, manages options), two approved students (S asks, T
-- another scout) and a parent-only account (P). Every refusal is paired with
-- an accepted call on the same fixture.
-- ============================================================
begin;

do $applied$
begin
  if to_regprocedure('public.scouting_option_save(uuid,text,text,jsonb,text,text,text,integer,text)') is null then
    raise exception 'Cannot test: 0037_scouting_observation_options.sql has not been applied';
  end if;
end
$applied$;

create temp table t37_results(n int primary key, check_name text, result text, detail text) on commit drop;
create function pg_temp.rec(n int, label text, ok boolean, detail text default '') returns void language sql as $fn$
 insert into t37_results values(n, label, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail);
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
declare m uuid; s uuid; t uuid; p uuid; e uuid := gen_random_uuid(); v text; v2 text; opt uuid; req uuid; ch uuid; k text; kc text;
begin
 select member_id into m from public.member_roles where role='mentor' order by member_id limit 1;
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select p0.id into t from public.profiles p0 where p0.approved and p0.id<>s and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead','student')) order by member_id limit 1;
 if m is null or s is null or t is null or p is null then raise exception '0037 test needs a mentor, two approved students and a parent-only account'; end if;
 update public.profiles set status='active', approved=true where id in (s,t,m);
 insert into public.events(id,title,kind,starts_at,ends_at) values (e,'0037 test','competition',now(),now()+interval '1 day');

 -- A student asks; a manager sees it; another scout does not.
 v := pg_temp.val_as(s, $q$select public.scouting_option_request('Passes from the neutral zone', 'yesno', null, 'teleop', 'Saw 4414 lob FUEL over the bump', null, 4414)::text$q$);
 req := (pg_temp.jp(v, '{id}'))::uuid;
 perform pg_temp.rec(1, 'a student asks for an option (positive control)', v like '{%' and pg_temp.jp(v, '{status}') = 'requested' and pg_temp.jp(v, '{key}') = 'passes_from_the_neutral_zone', left(v, 120));
 v := pg_temp.val_as(p, $q$select public.scouting_option_request('Parent idea', 'yesno')::text$q$);
 perform pg_temp.rec(2, 'a parent-only account cannot ask', v like 'err:42501:%', left(v, 80));
 v := pg_temp.val_as(t, $q$select public.scouting_options_list()::text$q$);
 v2 := pg_temp.val_as(m, $q$select public.scouting_options_list()::text$q$);
 perform pg_temp.rec(3, 'another scout does not see the request; a manager does',
   v like '{%' and position('passes_from_the_neutral_zone' in v) = 0 and pg_temp.jp(v, '{can_manage}') = 'false'
   and v2 like '{%' and position('passes_from_the_neutral_zone' in v2) > 0 and pg_temp.jp(v2, '{can_manage}') = 'true', left(v, 60) || ' | ' || left(v2, 60));
 v := pg_temp.val_as(s, $q$select public.scouting_options_list()::text$q$);
 perform pg_temp.rec(4, 'the asker sees their own request', position('passes_from_the_neutral_zone' in v) > 0, left(v, 80));

 -- Only a manager decides.
 v := pg_temp.val_as(s, format($q$select public.scouting_option_save(%L, 'Passes from the neutral zone', 'yesno', null, 'teleop', null, 'active')::text$q$, req));
 perform pg_temp.rec(5, 'a student cannot approve', v like 'err:42501:%', left(v, 80));
 -- An answer before approval is refused, after approval accepted.
 v := pg_temp.save(t, e, '{"answers":{},"source":"live","custom":{"passes_from_the_neutral_zone":"yes"}}', 'qm1');
 perform pg_temp.rec(6, 'an answer to an option not turned on is refused', v like 'err:22023:%', left(v, 80));
 v := pg_temp.val_as(m, format($q$select public.scouting_option_save(%L, 'Passes from the neutral zone', 'yesno', null, 'teleop', 'Over the bump or through the trench', 'active')::text$q$, req));
 perform pg_temp.rec(7, 'a manager approves (positive control)', v like '{%' and pg_temp.jp(v, '{status}') = 'active' and pg_temp.jp(v, '{was_active}') = 'true', left(v, 80));
 v := pg_temp.save(t, e, '{"answers":{},"source":"live","custom":{"passes_from_the_neutral_zone":"yes"}}', 'qm1');
 perform pg_temp.rec(8, 'after approval the same answer saves', v like '{%', left(v, 80));
 v := pg_temp.val_as(t, $q$select public.scouting_options_list()::text$q$);
 perform pg_temp.rec(9, 'every scout now sees the active option', position('passes_from_the_neutral_zone' in v) > 0, left(v, 80));

 -- Values by type; null and unknown keys refused.
 v := pg_temp.save(t, e, '{"answers":{},"source":"live","custom":{"passes_from_the_neutral_zone":null}}', 'qm2');
 v2 := pg_temp.save(t, e, '{"answers":{},"source":"live","custom":{"passes_from_the_neutral_zone":"sometimes"}}', 'qm2');
 perform pg_temp.rec(10, 'null and an off-list yes/no answer are refused', v like 'err:22023:%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save(t, e, '{"answers":{},"source":"live","custom":{"no_such_option":"yes"}}', 'qm2');
 perform pg_temp.rec(11, 'an unknown option key is refused', v like 'err:22023:%', left(v, 80));
 v := pg_temp.val_as(m, $q$select public.scouting_option_save(null, 'Passing zone', 'choice', '[["alliance","Alliance zone"],["neutral","Neutral zone"],["both","Both"]]', 'teleop', null, 'active')::text$q$);
 ch := (pg_temp.jp(v, '{id}'))::uuid; kc := pg_temp.jp(v, '{key}');
 perform pg_temp.rec(12, 'a manager adds a choice option directly as active', v like '{%' and pg_temp.jp(v, '{status}') = 'active', left(v, 80));
 v := pg_temp.save(t, e, format('{"answers":{},"source":"live","custom":{"%s":"neutral"}}', kc)::jsonb, 'qm3');
 v2 := pg_temp.save(t, e, format('{"answers":{},"source":"live","custom":{"%s":"upper"}}', kc)::jsonb, 'qm4');
 perform pg_temp.rec(13, 'a listed choice saves; an unlisted one is refused', v like '{%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(m, $q$select public.scouting_option_save(null, 'Passes made', 'count', null, 'teleop', null, 'active')::text$q$);
 k := pg_temp.jp(v, '{key}');
 v := pg_temp.save(t, e, format('{"answers":{},"source":"live","custom":{"%s":0}}', k)::jsonb, 'qm5');
 v2 := pg_temp.save(t, e, format('{"answers":{},"source":"live","custom":{"%s":501}}', k)::jsonb, 'qm6');
 perform pg_temp.rec(14, 'a count of 0 saves (an observed zero); 501 is refused', v like '{%' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.save(t, e, '{"answers":{},"source":"live","role":"super","super":{"driver_skill":4},"custom":{"passes_from_the_neutral_zone":"yes"}}', 'qm7');
 perform pg_temp.rec(15, 'a super-scout note may not carry option answers', v like 'err:22023:%', left(v, 80));

 -- Types and used choices are locked once active; retire keeps old answers valid.
 v := pg_temp.val_as(m, format($q$select public.scouting_option_save(%L, 'Passes from the neutral zone', 'rating', null, 'teleop', null, 'active')::text$q$, req));
 perform pg_temp.rec(16, 'the type of a used option cannot change', v like 'err:22023:%', left(v, 80));
 v := pg_temp.val_as(m, format($q$select public.scouting_option_save(%L, 'Passing zone', 'choice', '[["alliance","Alliance zone"],["both","Both"]]', 'teleop', null, 'active')::text$q$, ch));
 v2 := pg_temp.val_as(m, format($q$select public.scouting_option_save(%L, 'Passing zone', 'choice', '[["alliance","Our side"],["neutral","Neutral zone"],["both","Both"],["far","Far side"]]', 'teleop', null, 'active')::text$q$, ch));
 perform pg_temp.rec(17, 'removing a used choice is refused; renaming and adding one is accepted', v like 'err:22023:%' and v2 like '{%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(m, format($q$select public.scouting_option_save(%L, 'Passes from the neutral zone', 'yesno', null, 'teleop', null, 'retired')::text$q$, req));
 v2 := pg_temp.save(t, e, '{"answers":{},"source":"live","custom":{"passes_from_the_neutral_zone":"no"}}', 'qm8');
 perform pg_temp.rec(18, 'a retired option still validates (old records stay correctable)', v like '{%' and v2 like '{%', left(v, 40) || ' | ' || left(v2, 40));
 v := pg_temp.val_as(s, $q$select public.scouting_option_request('Declined idea', 'note')::text$q$);
 v := pg_temp.val_as(m, format($q$select public.scouting_option_save(%L, 'Declined idea', 'note', null, 'teleop', null, 'declined', null, 'Covered by notes')::text$q$, (pg_temp.jp(v, '{id}'))::uuid));
 v2 := pg_temp.save(t, e, '{"answers":{},"source":"live","custom":{"declined_idea":"x"}}', 'qm9');
 perform pg_temp.rec(19, 'a declined option is never accepted as an answer', v like '{%' and pg_temp.jp(v, '{decline_reason}') = 'Covered by notes' and v2 like 'err:22023:%', left(v, 40) || ' | ' || left(v2, 40));

 -- The table is closed; helpers are not callable; anon has nothing.
 v := pg_temp.val_as(s, $q$select count(*)::text from public.scouting_options$q$);
 v2 := pg_temp.val_as(m, $q$update public.scouting_options set status='active' returning 1$q$);
 perform pg_temp.rec(20, 'no direct read or write of the table, even for a manager', v like 'err:42501:%' and v2 like 'err:42501:%', left(v, 40) || ' | ' || left(v2, 40));
 perform pg_temp.rec(21, 'helpers are private; anon cannot call the public functions; authenticated can',
   not has_function_privilege('authenticated', 'scouting_private.validate_custom(jsonb)', 'execute')
   and not has_function_privilege('authenticated', 'scouting_private.option_key(text)', 'execute')
   and not has_function_privilege('anon', 'public.scouting_options_list()', 'execute')
   and not has_function_privilege('anon', 'public.scouting_option_request(text,text,jsonb,text,text,uuid,integer)', 'execute')
   and has_function_privilege('authenticated', 'public.scouting_option_save(uuid,text,text,jsonb,text,text,text,integer,text)', 'execute'), '');
 v := pg_temp.val_as(s, $q$select public.scouting_option_request('Passes from the neutral zone', 'yesno')::text$q$);
 perform pg_temp.rec(22, 'a key is never reused: a second request with the same name gets _2', pg_temp.jp(v, '{key}') = 'passes_from_the_neutral_zone_2', left(v, 80));
end
$checks$;

select n, check_name as check, result, detail from t37_results
union all
select 999, 'summary', case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       format('%s PASS, %s FAIL, %s SKIP', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t37_results
order by 1;
rollback;
