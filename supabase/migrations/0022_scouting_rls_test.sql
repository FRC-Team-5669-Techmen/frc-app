-- 0022 rollback-only proof. Requires existing admin, mentor, two students,
-- and parent test actors. All rows and temporary role changes roll back.
-- No dispatcher or network call is made. Run after 0022.
begin;
create temp table t0022_results(n int primary key,check_name text,result text,detail text) on commit drop;
create function pg_temp.rec(n int,label text,ok boolean,detail text default '') returns void language sql as $fn$
 insert into t0022_results values(n,label,case when coalesce(ok,false) then 'PASS' else 'FAIL' end,detail);
$fn$;
create function pg_temp.val_as(who uuid,q text,as_role text default 'authenticated') returns text language plpgsql as $fn$
declare v text;
begin
 perform set_config('request.jwt.claim.sub',coalesce(who::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',who,'role',as_role)::text,true);
 perform set_config('role',as_role,true);
 begin execute q into v; v:=coalesce(v,'null'); exception when others then v:='err:'||sqlstate||':'||sqlerrm; end;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','',true);
 return v;
end
$fn$;
create function pg_temp.save_as(who uuid,id uuid,event uuid,kind text,payload jsonb,version int default 0,operation uuid default gen_random_uuid(),team int default 5669,match text default null)
returns text language sql as $fn$
 select pg_temp.val_as(who,format('select public.scouting_save(%L,%L,%L,%L,%L,%L,%L,%L,%L)',id,event,kind,team,match,payload,version,operation,who));
$fn$;
do $checks$
#variable_conflict use_variable
declare a uuid; m uuid; s uuid; t uuid; p uuid; e uuid:=gen_random_uuid(); other_e uuid:=gen_random_uuid(); id uuid:=gen_random_uuid(); oid uuid:=gen_random_uuid(); mid uuid:=gen_random_uuid(); aid uuid:=gen_random_uuid(); lid uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); v text; first_result text; d uuid; cnt int; args jsonb; preview text;
begin
 select member_id into a from public.member_roles where role='admin' order by member_id limit 1;
 select member_id into m from public.member_roles where role='mentor' order by member_id limit 1;
 select p0.id into s from public.profiles p0 where p0.approved and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select p0.id into t from public.profiles p0 where p0.approved and p0.id<>s and exists(select 1 from public.member_roles r where r.member_id=p0.id and role='student') and not exists(select 1 from public.member_roles r where r.member_id=p0.id and role in ('parent','admin','mentor','lead')) order by p0.id limit 1;
 select member_id into p from public.member_roles where role='parent' and not exists(select 1 from public.member_roles r where r.member_id=member_roles.member_id and r.role in ('admin','mentor','lead')) order by member_id limit 1;
 if a is null or m is null or s is null or t is null or p is null then raise exception '0022 tests require admin, mentor, two approved students, and parent actors'; end if;
 update public.profiles set approved=true,status='active' where profiles.id in (a,m,s,t,p);
 insert into public.events(id,title,kind,starts_at,ends_at,created_by) values(e,'Scouting SQL test','competition',now(),now()+interval '1 day',a),(other_e,'Other scouting SQL test','competition',now(),now()+interval '1 day',a);
 first_result:=pg_temp.save_as(s,id,e,'pit','{"capabilities":{"trench":"yes","bump":"unknown"},"notes":"Claim only"}',0,op);
 perform pg_temp.rec(1,'student creates attributed pit record',first_result not like 'err:%' and (first_result::jsonb->>'member_id')=s::text and (first_result::jsonb->>'version')='1',first_result);
 v:=pg_temp.val_as(t,format('select count(*) from public.scouting_records where id=%L',id));
 perform pg_temp.rec(2,'another student reads one shared record',v='1',v);
 v:=pg_temp.val_as(p,format('select count(*) from public.scouting_records where id=%L',id));
 perform pg_temp.rec(3,'parent reads zero shared records',v='0',v);
 v:=pg_temp.save_as(p,gen_random_uuid(),e,'pit','{"capabilities":{}}');
 perform pg_temp.rec(4,'parent save refused',v like 'err:42501:%',v);
 v:=pg_temp.val_as(null,format('select count(*) from public.scouting_records where id=%L',id),'anon');
 perform pg_temp.rec(5,'anon reads refused',v like 'err:42501:%',v);
 v:=pg_temp.val_as(s,format('update public.scouting_records set version=99 where id=%L returning version',id));
 perform pg_temp.rec(6,'direct record update refused',v like 'err:42501:%',v);
 v:=pg_temp.val_as(s,format('delete from public.scouting_records where id=%L returning id',id));
 perform pg_temp.rec(7,'direct record deletion refused',v like 'err:42501:%',v);
 v:=pg_temp.val_as(s,format('insert into public.scouting_records(id,event_id,member_id,kind,team_number,payload,version) values(%L,%L,%L,''pit'',123,''{}'',1) returning id',gen_random_uuid(),e,t));
 perform pg_temp.rec(8,'direct impersonated insert refused',v like 'err:42501:%',v);
 v:=pg_temp.save_as(s,id,e,'pit','{"capabilities":{"trench":"yes","bump":"unknown"},"notes":"Claim only"}',0,op);
 perform pg_temp.rec(9,'identical retry returns first receipt once',v=first_result and (select count(*) from public.scouting_revisions where record_id=id)=1,v);
 v:=pg_temp.save_as(s,id,e,'pit','{"capabilities":{"trench":"no"}}',0,op);
 perform pg_temp.rec(10,'operation ID cannot change body',v like 'err:22023:%',v);
 v:=pg_temp.save_as(s,id,e,'pit','{"capabilities":{"trench":"no"}}',1);
 perform pg_temp.rec(11,'correction preserves first revision and increments',v not like 'err:%' and (v::jsonb->>'version')='2' and (select count(*) from public.scouting_revisions where record_id=id)=2,v);
 v:=pg_temp.save_as(s,id,e,'pit','{"capabilities":{"trench":"yes"}}',1);
 perform pg_temp.rec(12,'stale edit conflicts and does not overwrite',v like 'err:40001:%' and (select payload->'capabilities'->>'trench' from public.scouting_records where scouting_records.id=id)='no',v);
 v:=pg_temp.save_as(t,id,e,'pit','{"capabilities":{}}',2);
 perform pg_temp.rec(13,'unprivileged cross-author correction refused',v like 'err:42501:%',v);
 v:=pg_temp.save_as(m,id,e,'pit','{"capabilities":{"trench":"unknown"}}',2);
 perform pg_temp.rec(14,'manager can correct shared pit but keeps author',v not like 'err:%' and v::jsonb->>'member_id'=s::text and (select changed_by=m from public.scouting_revisions where record_id=id and version=3),v);
 v:=pg_temp.save_as(s,oid,e,'observation','{"answers":{"trench":"did_not_see","bump":"not_applicable"},"source":"live"}',0,gen_random_uuid(),5669,'qm1');
 perform pg_temp.rec(15,'unknown and NA remain distinct and absent stays absent',v not like 'err:%' and v::jsonb->'payload'->'answers'='{"trench":"did_not_see","bump":"not_applicable"}'::jsonb,v);
 v:=pg_temp.save_as(m,oid,e,'observation','{"answers":{"trench":"yes"},"source":"live"}',1,gen_random_uuid(),5669,'qm1');
 perform pg_temp.rec(16,'manager cannot replace personal observation',v like 'err:42501:%',v);
 v:=pg_temp.save_as(s,oid,e,'observation','{"answers":{"trench":"yes"},"source":"live"}',1,gen_random_uuid(),5669,'qm1');
 perform pg_temp.rec(17,'author can correct own observation',v not like 'err:%' and v::jsonb->>'version'='2',v);
 v:=pg_temp.save_as(s,gen_random_uuid(),e,'observation','{"answers":{},"source":"live"}',0,gen_random_uuid(),5669,'qm1');
 perform pg_temp.rec(18,'new ID cannot duplicate logical observation',v like 'err:40001:%',v);
 v:=pg_temp.save_as(s,gen_random_uuid(),e,'observation','{"answers":{"trench":0},"source":"live"}',0,gen_random_uuid(),5669,'qm2');
 perform pg_temp.rec(19,'numeric zero cannot masquerade as unknown',v like 'err:22023:%',v);
 v:=pg_temp.save_as(s,aid,e,'assignment',jsonb_build_object('assignee',t,'status','assigned'),0,gen_random_uuid(),5669,'qm2');
 perform pg_temp.rec(20,'student cannot assign peers',v like 'err:42501:%',v);
 v:=pg_temp.save_as(a,aid,e,'assignment',jsonb_build_object('assignee',t,'status','assigned'),0,gen_random_uuid(),5669,'qm2');
 perform pg_temp.rec(21,'staff assigns and creates one in-app notice',v not like 'err:%' and (select count(*) from public.member_notices where member_id=t and kind='scouting_assignment' and created_at>=now())=1,v);
 insert into public.event_roles(event_id,member_id,role,reason,assigned_by) values(e,s,'scouting_lead','SQL test',a);
 v:=pg_temp.val_as(s,format('select public.scouting_can_manage(%L)',e));
 perform pg_temp.rec(22,'event scouting lead manages that event',v='true',v);
 v:=pg_temp.val_as(s,format('select public.scouting_can_manage(%L)',other_e));
 perform pg_temp.rec(23,'event lead cannot manage unrelated event',v='false',v);
 insert into public.member_permissions(member_id,capability,granted_by) values(t,'scouting.manage',a) on conflict do nothing;
 v:=pg_temp.val_as(t,format('select public.scouting_can_manage(%L)',other_e));
 perform pg_temp.rec(24,'explicit capability authorizes manager',v='true',v);
 insert into public.member_permissions(member_id,capability,granted_by) values(p,'scouting.manage',a) on conflict do nothing;
 v:=pg_temp.val_as(p,format('select public.scouting_can_manage(%L)',e));
 perform pg_temp.rec(25,'parent capability alone cannot authorize scouting',v='false',v);
 insert into public.member_roles(member_id,role) values(p,'mentor');
 v:=pg_temp.val_as(p,format('select count(*) from public.scouting_records where id=%L',id));
 perform pg_temp.rec(26,'parent plus mentor sees record',v='1',v);
 delete from public.member_roles where member_id=p and role='mentor';
 update public.profiles set approved=false where profiles.id=t;
 v:=pg_temp.val_as(t,'select public.scouting_can_access()');
 perform pg_temp.rec(27,'revoked approval blocks access immediately',v='false',v);
 update public.profiles set approved=true where profiles.id=t;
 v:=pg_temp.save_as(s,lid,e,'pick_list','{"entries":[{"team":5669,"tier":1,"rank":1},{"team":4414,"tier":2,"rank":1}]}',0,gen_random_uuid(),null,null);
 perform pg_temp.rec(28,'personal pick list accepts separate tiers',v not like 'err:%',v);
 v:=pg_temp.save_as(a,lid,e,'pick_list','{"entries":[]}',1,gen_random_uuid(),null,null);
 perform pg_temp.rec(29,'admin cannot overwrite personal pick list',v like 'err:42501:%',v);
 v:=pg_temp.save_as(s,lid,e,'pick_list','{"entries":[{"team":5669,"tier":1,"rank":1},{"team":5669,"tier":2,"rank":1}]}',1,gen_random_uuid(),null,null);
 perform pg_temp.rec(30,'duplicate team in list rejected',v like 'err:22023:%',v);
 v:=pg_temp.save_as(s,mid,e,'message','{"text":"Inspect intake","status":"open","request_delivery":true}');
 select delivery.id into d from public.scouting_delivery delivery where record_id=mid;
 perform pg_temp.rec(31,'saved message separately queues delivery',v not like 'err:%' and d is not null and (select status='queued' from public.scouting_delivery where scouting_delivery.id=d),v);
 v:=pg_temp.val_as(s,format('select public.scouting_claim_delivery(%L,1)',mid));
 perform pg_temp.rec(32,'student cannot claim notification delivery',v like 'err:42501:%',v);
 v:=pg_temp.val_as(null,format('select public.scouting_claim_delivery(%L,1)',mid),'service_role');
 perform pg_temp.rec(33,'server claims delivery once',v not like 'err:%' and v::jsonb->>'claimed'='true',v);
 v:=pg_temp.val_as(null,format('select public.scouting_claim_delivery(%L,1)',mid),'service_role');
 perform pg_temp.rec(34,'concurrent or interrupted dispatcher cannot resend',v not like 'err:%' and v::jsonb->>'claimed'='false',v);
 v:=pg_temp.val_as(null,format('select public.scouting_finish_delivery(%L,''uncertain'',null,''Connection lost'')',d),'service_role');
 perform pg_temp.rec(35,'ambiguous delivery preserves data',v not like 'err:%' and v::jsonb->>'status'='uncertain' and (select count(*) from public.scouting_records where scouting_records.id=mid)=1,v);
 v:=pg_temp.val_as(null,format('select public.scouting_claim_delivery(%L,1)',mid),'service_role');
 perform pg_temp.rec(36,'uncertain delivery is not automatically retried',v not like 'err:%' and v::jsonb->>'claimed'='false',v);
 v:=pg_temp.save_as(s,mid,e,'message','{"text":"Updated intake note","status":"open","request_delivery":true}',1);
 v:=pg_temp.val_as(null,format('select public.scouting_claim_delivery(%L,2)',mid),'service_role');
 perform pg_temp.rec(37,'new version has its own immutable delivery snapshot',v not like 'err:%' and v::jsonb->'record'->'payload'->>'text'='Updated intake note' and v::jsonb->>'claimed'='true',v);
 v:=pg_temp.val_as(s,format('select count(*) from public.scouting_operations where member_id=%L',s));
 perform pg_temp.rec(38,'operation receipts not readable by client',v like 'err:42501:%',v);
 v:=pg_temp.val_as(s,format('update public.scouting_revisions set snapshot=''{}'' where record_id=%L returning version',id));
 perform pg_temp.rec(39,'correction history cannot be rewritten',v like 'err:42501:%',v);
 update public.connector_settings set allowed_member=a where connector_settings.id;
 args:=jsonb_build_object('p_id',gen_random_uuid(),'p_event',e,'p_kind','message','p_team',4414,'p_match',null,'p_payload',jsonb_build_object('text','Connector scouting proof','status','open'),'p_expected_version',0,'p_operation',gen_random_uuid(),'p_actor',a);
 v:=pg_temp.val_as(a,format('select public.connector_call(''call_app'',''scouting_save'',%L,%L,''preview'',''{}'')',args,'scouting-preview-'||gen_random_uuid()));
 perform pg_temp.rec(40,'connector preview rolls back scouting write',v like '%CONNECTOR_PREVIEW:%' and not exists(select 1 from public.scouting_records where scouting_records.id=(args->>'p_id')::uuid),left(v,250));
 v:=pg_temp.val_as(a,format('select public.connector_call(''call_app'',''scouting_save'',%L,%L,''commit'',''{}'')',args,'scouting-apply-'||gen_random_uuid()));
 perform pg_temp.rec(41,'connector apply writes attributed record and audit',v not like 'err:%' and exists(select 1 from public.scouting_records where scouting_records.id=(args->>'p_id')::uuid and member_id=a) and exists(select 1 from public.connector_audit where function_name='scouting_save' and user_id=a),left(v,250));
 args:=jsonb_set(jsonb_set(args,'{p_id}',to_jsonb(gen_random_uuid())),'{p_operation}',to_jsonb(gen_random_uuid()));
 v:=pg_temp.val_as(p,format('select public.connector_call(''call_app'',''scouting_save'',%L,%L,''commit'',''{}'')',args,'scouting-refuse-'||gen_random_uuid()));
 perform pg_temp.rec(42,'connector unauthorized caller writes nothing',v like 'err:%' and not exists(select 1 from public.scouting_records where scouting_records.id=(args->>'p_id')::uuid),left(v,250));
 perform pg_temp.rec(43,'merge catalog knows every new member reference',not exists(select * from public._member_ref_columns() except select tbl,col from public._merge_member_rules()));
 v:=pg_temp.val_as(s,format('select public.scouting_save(%L,%L,''message'',5669,null,%L,0,%L,%L)',gen_random_uuid(),e,'{"text":"Actor mismatch","status":"open"}',gen_random_uuid(),t));
 perform pg_temp.rec(44,'session swap cannot replay another member queue',v like 'err:42501:%',v);
 insert into public.member_roles(member_id,role) values(p,'student') on conflict do nothing;
 v:=pg_temp.val_as(p,'select public.scouting_can_access()');
 perform pg_temp.rec(45,'parent plus student remains denied without staff',v='false',v);
 update public.profiles set status='inactive' where profiles.id=m;
 v:=pg_temp.val_as(m,'select public.scouting_can_access()');
 perform pg_temp.rec(46,'inactive mentor cannot read scouting',v='false',v);

 v:=pg_temp.val_as(p,format('select count(*) from public.scouting_revisions where record_id=%L',id));
 perform pg_temp.rec(47,'parent reads zero revisions',v='0',v);
 v:=pg_temp.val_as(a,format('select count(*) from public.scouting_revisions where record_id=%L',id));
 perform pg_temp.rec(48,'staff reads all three pit revisions',v='3',v);
 v:=pg_temp.val_as(p,format('select count(*) from public.scouting_delivery where record_id=%L',mid));
 perform pg_temp.rec(49,'parent reads zero deliveries',v='0',v);
 v:=pg_temp.val_as(a,format('select count(*) from public.scouting_delivery where record_id=%L',mid));
 perform pg_temp.rec(50,'staff reads both delivery versions',v='2',v);
 v:=pg_temp.save_as(a,gen_random_uuid(),e,'team','{"name":"Invalid result","source":"manual","official_results":[{"individual_score":42}]}');
 perform pg_temp.rec(51,'malformed official provenance rejected',v like 'err:22023:%',v);

 v:=pg_temp.save_as(a,gen_random_uuid(),e,'team','{"name":"Techmen","source":"tba","source_url":"https://www.thebluealliance.com/team/5669/2026","fetched_at":"2026-10-20T18:00:00Z","pit_location":"A12","pit_source":"nexus","pit_fetched_at":"2026-10-20T18:01:00Z","epa":52.3,"epa_source":"statbotics","epa_fetched_at":"2026-10-20T18:02:00Z","official_results":[{"match_key":"2026test_qm1","alliance":"red","alliance_score":102,"score_breakdown":{"totalPoints":102},"source":"tba","fetched_at":"2026-10-20T18:00:00Z"}]}');
 perform pg_temp.rec(52,'normalized TBA Statbotics Nexus import retains each provenance',v not like 'err:%' and v::jsonb->'payload'->>'pit_source'='nexus' and v::jsonb->'payload'->>'epa'='52.3' and v::jsonb->'payload'->'official_results'->0->>'alliance_score'='102',v);

end
$checks$;
select n,check_name as "check",result,detail from t0022_results order by n;
rollback;
