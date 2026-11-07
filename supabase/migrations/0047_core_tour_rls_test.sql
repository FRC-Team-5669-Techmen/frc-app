-- 0047 boundary proof. One transaction, rollback; fictional harness actors.
begin;
create temp table tour46_results(n integer,check_name text,result text,detail text);
create function pg_temp.rec(n integer,label text,ok boolean,detail text default '') returns void language sql as $fn$
 insert into tour46_results values(n,label,case when coalesce(ok,false) then 'PASS' else 'FAIL' end,detail);
$fn$;
create function pg_temp.as_actor(who uuid,q text) returns text language plpgsql as $fn$
declare v text;
begin
 perform set_config('request.jwt.claim.sub',coalesce(who::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 begin execute q into v; exception when others then v:='err:'||sqlstate; end;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 return coalesce(v,'null');
end
$fn$;
do $checks$
declare s uuid; t uuid; p uuid; m uuid; u uuid; v text; again text; total integer;
begin
 select member_id into s from public.member_roles where role='student' order by member_id limit 1;
 select member_id into t from public.member_roles where role='student' and member_id<>s order by member_id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('mentor','lead','admin')) limit 1;
 select member_id into m from public.member_roles where role='mentor' limit 1;
 select id into u from public.profiles where not approved limit 1;
 if s is null or t is null or p is null or m is null or u is null then raise exception 'Needs two students, parent, mentor and unapproved actor';end if;
 update public.profiles set approved=true,status='active' where id in(s,t,p,m);
 delete from public.tour_completions where member_id in(s,t,p,m,u);
 v:=pg_temp.as_actor(s,$q$select public.tour_complete_core('member',1)::text$q$);
 perform pg_temp.rec(1,'own completion succeeds',v not like 'err:%' and v::jsonb->>'member_id'=s::text,v);
 again:=pg_temp.as_actor(s,$q$select public.tour_complete_core('scout',1)::text$q$);
 perform pg_temp.rec(2,'retry keeps original track and server timestamp',v=again,again);
 v:=pg_temp.as_actor(s,'select count(*)::text from public.tour_completions');
 perform pg_temp.rec(3,'own record readable',v='1',v);
 v:=pg_temp.as_actor(t,'select count(*)::text from public.tour_completions');
 perform pg_temp.rec(4,'another student cannot read it',v='0',v);
 v:=pg_temp.as_actor(p,'select count(*)::text from public.tour_completions');
 perform pg_temp.rec(5,'parent cannot read another account completion',v='0',v);
 v:=pg_temp.as_actor(p,$q$select public.tour_complete_core('parent',1)::text$q$);
 perform pg_temp.rec(6,'parent can finish own track',v not like 'err:%' and v::jsonb->>'member_id'=p::text,v);
 v:=pg_temp.as_actor(s,$q$select public.tour_complete_core('mentor',1)::text$q$);
 perform pg_temp.rec(7,'student cannot claim mentor track',v='err:42501',v);
 v:=pg_temp.as_actor(p,$q$select public.tour_complete_core('driver',1)::text$q$);
 perform pg_temp.rec(8,'parent cannot claim driver track',v='err:42501',v);
 v:=pg_temp.as_actor(u,$q$select public.tour_complete_core('member',1)::text$q$);
 perform pg_temp.rec(9,'unapproved cannot write',v='err:42501',v);
 update public.profiles set status='inactive' where id=s;
 v:=pg_temp.as_actor(s,$q$select public.tour_complete_core('member',1)::text$q$);
 perform pg_temp.rec(10,'inactive cannot write',v='err:42501',v);
 v:=pg_temp.as_actor(s,'select count(*)::text from public.tour_completions');
 perform pg_temp.rec(11,'inactive cannot read old completion',v='0',v);
 update public.profiles set status='active' where id=s;
 v:=pg_temp.as_actor(m,$q$select count(*)::text from public.tour_completion_overview(1)$q$);
 select count(*) into total from public.profiles p0 where p0.approved and p0.status='active' and exists(select 1 from public.member_roles mr where mr.member_id=p0.id and mr.role in ('student','parent','mentor','lead','admin'));
 perform pg_temp.rec(12,'mentor sees full active roster including unfinished',v=total::text and total>=4,v);
 v:=pg_temp.as_actor(m,format('select count(*)::text from public.tour_completion_overview(1) where member_id=%L and completed_at is null',t));
 perform pg_temp.rec(13,'unfinished member is present with no completion',v='1',v);
 v:=pg_temp.as_actor(m,format('select count(*)::text from public.tour_completion_overview(1) where member_id=%L and completed_at is not null',s));
 perform pg_temp.rec(14,'completed member is present with a completion',v='1',v);
 v:=pg_temp.as_actor(s,'select count(*)::text from public.tour_completion_overview(1)');
 perform pg_temp.rec(15,'student cannot read mentor roster',v='err:42501',v);
 v:=pg_temp.as_actor(p,'select count(*)::text from public.tour_completion_overview(1)');
 perform pg_temp.rec(16,'parent cannot read mentor roster',v='err:42501',v);
 update public.profiles set approved=false where id=m;
 v:=pg_temp.as_actor(m,'select count(*)::text from public.tour_completion_overview(1)');
 perform pg_temp.rec(17,'unapproved staff cannot read mentor roster',v='err:42501',v);
 update public.profiles set approved=true where id=m;
 v:=pg_temp.as_actor(null,$q$select public.tour_complete_core('member',1)::text$q$);
 perform pg_temp.rec(18,'no actor cannot write',v='err:42501',v);
 v:=pg_temp.as_actor(s,$q$select public.tour_complete_core('member',2)::text$q$);
 perform pg_temp.rec(19,'unknown version rejected',v='err:22023',v);
 v:=pg_temp.as_actor(s,$q$select public.tour_complete_core('invented',1)::text$q$);
 perform pg_temp.rec(20,'unknown track rejected',v='err:22023',v);
 v:=pg_temp.as_actor(s,'update public.tour_completions set completed_at=now() returning member_id::text');
 perform pg_temp.rec(21,'direct update refused with own row readable',v='err:42501',v);
 perform pg_temp.rec(22,'only select granted, never direct mutations',
  has_table_privilege('authenticated','public.tour_completions','select') and not has_table_privilege('authenticated','public.tour_completions','insert,update,delete,truncate'), '');
 perform pg_temp.rec(23,'anon has no table privileges',not has_table_privilege('anon','public.tour_completions','select,insert,update,delete,truncate'),'');
 perform pg_temp.rec(24,'completion execute only authenticated',has_function_privilege('authenticated','public.tour_complete_core(text,integer)','execute') and not has_function_privilege('anon','public.tour_complete_core(text,integer)','execute'),'');
 perform pg_temp.rec(25,'overview execute only authenticated',has_function_privilege('authenticated','public.tour_completion_overview(integer)','execute') and not has_function_privilege('anon','public.tour_completion_overview(integer)','execute'),'');
 v:=pg_temp.as_actor(m,$q$select public.tour_complete_core('mentor',1)::text$q$);
 perform pg_temp.rec(26,'mentor can finish own track',v not like 'err:%' and v::jsonb->>'track'='mentor',v);
 perform pg_temp.rec(27,'new member column is covered by merge',exists(select 1 from public._merge_member_rules() where tbl='tour_completions' and col='member_id'),'');

 perform pg_temp.rec(28,'service role has no new client grant',
 not has_table_privilege('service_role','public.tour_completions','select,insert,update,delete,truncate')
 and not has_function_privilege('service_role','public.tour_complete_core(text,integer)','execute')
 and not has_function_privilege('service_role','public.tour_completion_overview(integer)','execute'),'');
 v:=pg_temp.as_actor(m,format('select count(*)::text from public.tour_completions where member_id in (%L,%L,%L)',s,p,m));
 perform pg_temp.rec(29,'staff read includes other members as well as own row',v='3',v);
 update public.profiles set approved=false where id=s;
 v:=pg_temp.as_actor(s,'select count(*)::text from public.tour_completions');
 perform pg_temp.rec(30,'unapproved cannot read old completion',v='0',v);
 update public.profiles set approved=true where id=s;
 delete from public.member_roles where member_id=u;
 update public.profiles set approved=true,status='active' where id=u;
 v:=pg_temp.as_actor(u,$q$select public.tour_complete_core('member',1)::text$q$);
 perform pg_temp.rec(31,'approved account with no team role cannot complete',v='err:42501',v);
 update public.profiles set status='inactive' where id=m;
 v:=pg_temp.as_actor(m,'select count(*)::text from public.tour_completion_overview(1)');
 perform pg_temp.rec(32,'inactive staff cannot read mentor roster',v='err:42501',v);
 update public.profiles set status='active' where id=m;
 v:=pg_temp.as_actor(s,$q$select public.tour_complete_core('parent',1)::text$q$);
 perform pg_temp.rec(33,'student cannot claim parent track',v='err:42501',v);
end
$checks$;
select n,check_name as check,result,detail from tour46_results order by n;
rollback;
