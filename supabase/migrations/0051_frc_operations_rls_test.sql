-- Fictional identities and service records; every change rolls back.
begin;
create temp table ops_results(n int primary key,check_name text,result text,detail text);
create function pg_temp.rec(n int,label text,ok boolean,detail text default '') returns void language sql as $fn$
 insert into ops_results values(n,label,case when coalesce(ok,false) then 'PASS' else 'FAIL' end,detail);
$fn$;
create function pg_temp.call_as(who uuid,q text,probe boolean default false) returns text language plpgsql as $fn$
declare v text;
begin
 perform set_config('request.jwt.claims',json_build_object('sub',who,'role',case when who is null then 'anon' else 'authenticated' end)::text,true);
 perform set_config('request.jwt.claim.sub',coalesce(who::text,''),true);
 perform set_config('role',case when who is null then 'anon' else 'authenticated' end,true);
 begin
   execute q into v;
   if probe then raise exception 'rollback probe' using errcode='P0501'; end if;
 exception when others then if sqlstate<>'P0501' then v:='err:'||sqlstate; end if;
 end;
 reset role; perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true);
 return coalesce(v,'null');
end $fn$;
do $test$
declare s uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
 ev uuid:=gen_random_uuid(); ev2 uuid:=gen_random_uuid(); hub uuid:=gen_random_uuid(); hub2 uuid:=gen_random_uuid(); par uuid; par2 uuid; sid uuid; v text; q text; j jsonb; r record; i int:=200; sig text; t text; api text; flag boolean;
begin
 insert into auth.users(id,email) select x,x||'@example.invalid' from unnest(array[s,other_id,m,a,l,p,pending,inactive]) x;
 insert into public.profiles(id) select x from unnest(array[s,other_id,m,a,l,p,pending,inactive]) x on conflict do nothing;
 delete from public.member_roles where member_id=any(array[s,other_id,m,a,l,p,pending,inactive]);
 insert into public.member_roles(member_id,role) values(s,'student'),(other_id,'student'),(m,'mentor'),(a,'admin'),(l,'lead'),(p,'parent'),(pending,'student'),(inactive,'student');
 update public.profiles set approved=true,status='active' where id=any(array[s,other_id,m,a,l,p,inactive]);
 update public.profiles set approved=false where id=pending; update public.profiles set status='inactive' where id=inactive;
 insert into public.events(id,title,kind,starts_at,ends_at) values(ev,'Fictional active competition','competition',now()-interval '1 day',now()+interval '1 day'),(ev2,'Fictional second competition','competition',now()-interval '1 day',now()+interval '1 day');
 insert into public.hub_events(id,title) values(hub,'Fictional parent event'),(hub2,'Fictional other parent event');
 insert into public.hub_days(event_id,day_date,venue_closes_at) values(hub,current_date-1,now()+interval '1 day'),(hub2,current_date-1,now()+interval '1 day');
 q:=format('select public.staff_save_parent_service(%L,null,%L,%L,%L,%L,%L)::text',hub,s,'SCH001','Fictional Guardian One',now()-interval '3 hours',now()-interval '1 hour');
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(1,'student cannot write parent service',v='err:42501',v);
 v:=pg_temp.call_as(m,q); perform pg_temp.rec(2,'mentor records named parent actual service',v not like 'err:%',v); sid:=v::uuid;
 select guardian_id into par from public.parent_service_sessions where id=sid;
 v:=pg_temp.call_as(a,format('select public.staff_save_parent_service(%L,null,%L,%L,%L,%L,%L)::text',hub,s,'SCH001','Fictional Guardian Two',now()-interval '3 hours',now()-interval '2 hours'));
 perform pg_temp.rec(3,'second parent has a distinct record and hours',v not like 'err:%' and (select count(*)=2 from public.parent_service_people where event_id=hub),v);
 select guardian_id into par2 from public.parent_service_sessions where id=v::uuid;
 v:=pg_temp.call_as(s,format('select public.staff_parent_service(%L)::text',hub)); perform pg_temp.rec(4,'student cannot read named parents or school IDs',v='err:42501',v);
 v:=pg_temp.call_as(p,format('select public.staff_parent_service(%L)::text',hub)); perform pg_temp.rec(5,'parent cannot read staff report',v='err:42501',v);
 v:=pg_temp.call_as(l,format('select public.staff_parent_service(%L)::text',hub)); j:=v::jsonb;
 perform pg_temp.rec(6,'staff report has two named parents, IDs and intervals',jsonb_array_length(j->'parents')=2 and j->'parents' @> jsonb_build_array(jsonb_build_object('name','Fictional Guardian One','school_id','SCH001','student_id',s)),v);
 v:=pg_temp.call_as(m,format('select public.staff_parent_service(%L)::text',hub2)); perform pg_temp.rec(7,'report is scoped to selected event',v::jsonb->'parents'='[]'::jsonb,v);
 v:=pg_temp.call_as(m,format('select public.staff_save_parent_service(%L,%L,null,null,null,%L,%L)::text',hub,par,now()-interval '2 hours',now())); perform pg_temp.rec(8,'overlapping parent service is refused',v='err:22023',v);
 v:=pg_temp.call_as(m,format('select public.staff_save_parent_service(%L,%L,null,null,null,%L,%L)::text',hub2,par,now()-interval '1 hour',now()),true); perform pg_temp.rec(9,'parent cannot be attached to another event',v='err:22023',v);
 v:=pg_temp.call_as(m,format('select public.staff_save_parent_service(%L,%L,null,null,null,null,null,%L,true)::text',hub,par2,sid),true); perform pg_temp.rec(10,'session cannot be deleted through another parent',v='err:22023',v);
 v:=pg_temp.call_as(m,format('select public.staff_save_parent_service(%L,%L,null,null,null,%L,%L,%L,false)::text',hub,par2,now()-interval '5 hours',now()-interval '4 hours',sid),true); perform pg_temp.rec(13,'session cannot be corrected through another parent',v='err:22023',v);
 v:=pg_temp.call_as(m,format('select public.staff_save_parent_service(%L,%L,null,null,null,%L,%L,%L,false)::text',hub,par,now()-interval '4 hours',now()-interval '1 hour',sid));
 perform pg_temp.rec(11,'staff corrects the same interval',v=sid::text and (select ends_at-starts_at=interval '3 hours' from public.parent_service_sessions where id=sid),v);
 v:=pg_temp.call_as(m,format('select public.staff_save_parent_service(%L,%L,null,null,null,null,null,%L,true)::text',hub,par,sid)); perform pg_temp.rec(12,'staff removes actual interval',v=sid::text and not exists(select 1 from public.parent_service_sessions where id=sid),v);
 q:=format('select public.staff_save_event_venue(%L,33,-117,true)::text',ev);
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(20,'student cannot configure venues',v='err:42501',v);
 v:=pg_temp.call_as(m,q); perform pg_temp.rec(21,'mentor saves venue',v not like 'err:%' and exists(select 1 from public.event_checkin_venues where event_id=ev),v);
 v:=pg_temp.call_as(s,format('select public.staff_event_checkin(%L)::text',ev)); perform pg_temp.rec(22,'student cannot read other exemptions',v='err:42501',v);
 v:=pg_temp.call_as(m,format('select public.staff_event_checkin(%L)::text',ev)); perform pg_temp.rec(23,'staff reads configured venue',v::jsonb->'venue'->>'latitude'='33',v);
 q:=format('select public.staff_set_event_geo_exempt(%L,%L,true)::text',ev,s);
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(24,'student cannot grant event exemption',v='err:42501',v);
 v:=pg_temp.call_as(m,q); perform pg_temp.rec(25,'staff event exemption expires at event end',v not like 'err:%' and exists(select 1 from public.event_geo_exemptions x join public.events e on e.id=x.event_id where x.event_id=ev and x.member_id=s and x.expires_at=e.ends_at),v);
 v:=pg_temp.call_as(other_id,format('select public.event_venue_checkin(%L,null,null,null)::text',ev),true); perform pg_temp.rec(43,'another member exemption cannot bypass GPS',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.my_event_checkin_venues()::text'); perform pg_temp.rec(26,'own active exemption appears',v::jsonb @> jsonb_build_array(jsonb_build_object('id',ev,'exempt',true)),v);
 v:=pg_temp.call_as(other_id,'select public.my_event_checkin_venues()::text'); perform pg_temp.rec(27,'another member never inherits exemption',v::jsonb @> jsonb_build_array(jsonb_build_object('id',ev,'exempt',false)),v);
 q:=format('select public.event_venue_checkin(%L,null,null,null)::text',ev);
 v:=pg_temp.call_as(s,q); perform pg_temp.rec(28,'exempt check-in records Competition at server time',v not like 'err:%',v);
 perform pg_temp.rec(29,'event attendance fields cannot be supplied by client',exists(select 1 from public.attendance_events where id=v::uuid and user_id=s and category='competition' and not geo_ok and event_time=now() and location='event:'||ev and not verified and not manual_entry));
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(30,'event path preserves single open session',v='err:22023',v);
 v:=pg_temp.call_as(s,$q$select to_jsonb(public.request_signout('Fictional competition work',true,'event venue','nfc'))::text$q$);
 perform pg_temp.rec(44,'Competition session uses the existing signout request',v not like 'err:%' and v::jsonb->>'status'='pending' and v::jsonb->>'in_event_id'=(select id::text from public.attendance_events where user_id=s and type='in' order by event_time desc limit 1),v);
 j:=v::jsonb;
 v:=pg_temp.call_as(m,format('select to_jsonb(public.approve_signout(%L))::text',j->>'id'));
 perform pg_temp.rec(45,'mentor approval closes the same Competition session',v not like 'err:%' and v::jsonb->>'status'='approved' and exists(select 1 from public.attendance_events where id=(v::jsonb->>'out_event_id')::uuid and user_id=s and type='out') and exists(select 1 from public.attendance_events where id=(j->>'in_event_id')::uuid and category='competition'),v);
 delete from public.attendance_events where user_id=s;
 update public.event_geo_exemptions set expires_at=now()-interval '1 second' where event_id=ev;
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(31,'stored exemption expiry is enforced on write',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.my_event_checkin_venues()::text'); perform pg_temp.rec(32,'expired exemption is absent on read',v::jsonb @> jsonb_build_array(jsonb_build_object('id',ev,'exempt',false)),v);
 update public.event_geo_exemptions set expires_at=now()+interval '10 days' where event_id=ev;
 update public.events set ends_at=now()-interval '1 second' where id=ev;
 v:=pg_temp.call_as(s,format('select public.event_venue_checkin(%L,33,-117,10)::text',ev),true); perform pg_temp.rec(33,'event ending expires exemption despite later stored expiry',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.my_event_checkin_venues()::text'); perform pg_temp.rec(34,'ended venue absent on read',not(v::jsonb @> jsonb_build_array(jsonb_build_object('id',ev))),v);
 update public.events set starts_at=now()+interval '1 hour',ends_at=now()+interval '1 day' where id=ev;
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(35,'future event cannot check in early',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.my_event_checkin_venues()::text'); perform pg_temp.rec(36,'future venue absent on read',not(v::jsonb @> jsonb_build_array(jsonb_build_object('id',ev))),v);
 update public.events set starts_at=now()-interval '1 hour' where id=ev;
 delete from public.event_geo_exemptions where event_id=ev;
 v:=pg_temp.call_as(s,format('select public.event_venue_checkin(%L,33,-117,10)::text',ev)); perform pg_temp.rec(37,'valid precise venue fix records Competition',v not like 'err:%' and exists(select 1 from public.attendance_events where user_id=s and category='competition' and geo_ok),v);
 delete from public.attendance_events where user_id=s;
 v:=pg_temp.call_as(s,format('select public.event_venue_checkin(%L,34,-118,10)::text',ev),true); perform pg_temp.rec(38,'outside venue refused',v='err:42501',v);
 v:=pg_temp.call_as(s,format('select public.event_venue_checkin(%L,33,-117,101)::text',ev),true); perform pg_temp.rec(39,'coarse fix refused',v='err:22023',v);
 insert into public.event_geo_exemptions values(ev2,s,now()+interval '1 day');
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(40,'another event exemption cannot bypass GPS',v='err:22023',v);
 update public.event_checkin_venues set enabled=false where event_id=ev;
 v:=pg_temp.call_as(s,format('select public.event_venue_checkin(%L,33,-117,10)::text',ev),true); perform pg_temp.rec(41,'disabled venue refuses write',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.my_event_checkin_venues()::text'); perform pg_temp.rec(42,'disabled venue absent on read',v='[]',v);
 update public.event_checkin_venues set enabled=true where event_id=ev;
 for r in select * from (values(p,'parent'),(pending,'pending'),(inactive,'inactive')) x(id,label) loop
   v:=pg_temp.call_as(r.id,'select public.my_event_checkin_venues()::text'); i:=i+1; perform pg_temp.rec(i,r.label||' cannot read venue context',v='err:42501',v);
   v:=pg_temp.call_as(r.id,format('select public.event_venue_checkin(%L,33,-117,10)::text',ev),true); i:=i+1; perform pg_temp.rec(i,r.label||' cannot write event attendance',v='err:42501',v);
 end loop;
 q:=format('select public.mentor_set_rotation_member(%L,true,true)::text',s);
 v:=pg_temp.call_as(s,q,true); perform pg_temp.rec(50,'student cannot maintain strength',v='err:42501',v);
 v:=pg_temp.call_as(l,q,true); perform pg_temp.rec(51,'lead cannot maintain strength',v='err:42501',v);
 v:=pg_temp.call_as(m,q); perform pg_temp.rec(52,'mentor maintains strong and newer designations',v not like 'err:%' and exists(select 1 from public.role_rotation_members where member_id=s and strong and newer),v);
 v:=pg_temp.call_as(a,format('select public.mentor_set_rotation_member(%L,false,false)::text',s)); perform pg_temp.rec(53,'admin can withdraw designations',v not like 'err:%' and exists(select 1 from public.role_rotation_members where member_id=s and not strong and not newer),v);
 v:=pg_temp.call_as(s,'select public.mentor_rotation_data()::text'); perform pg_temp.rec(54,'student cannot read private recommendations',v='err:42501',v);
 v:=pg_temp.call_as(l,'select public.mentor_rotation_data()::text'); perform pg_temp.rec(55,'lead cannot read private recommendations',v='err:42501',v);
 v:=pg_temp.call_as(p,'select public.mentor_rotation_data()::text'); perform pg_temp.rec(56,'parent cannot read private recommendations',v='err:42501',v);
 insert into public.logged_hours(member_id,date,hours,type,status) values(s,public._la_date(now()),1,'build','verified'),(s,public._la_date(now()),2,'build','pending'),(s,public._la_date(now()),3,'build','rejected');
 v:=pg_temp.call_as(m,'select public.mentor_rotation_data()::text'); perform pg_temp.rec(57,'mentor reads eligible students and evidence',v not like 'err:%' and v::jsonb->'members' @> jsonb_build_array(jsonb_build_object('id',s,'strong',false,'newer',false)),v);
 perform pg_temp.rec(58,'inactive and pending students excluded',not(v::jsonb->'members' @> jsonb_build_array(jsonb_build_object('id',inactive))) and not(v::jsonb->'members' @> jsonb_build_array(jsonb_build_object('id',pending))),v);
 perform pg_temp.rec(59,'only verified logs enter mentor hour evidence',exists(select 1 from jsonb_array_elements(v::jsonb->'members') x where x->>'id'=s::text and jsonb_array_length(x->'logs')=1 and x->'logs' @> '[{"hours":1}]'::jsonb),v);
 -- Role and account eligibility are independent mentor boundaries.
 update public.profiles set approved=false where id=m;
 v:=pg_temp.call_as(m,'select public.mentor_rotation_data()::text'); perform pg_temp.rec(61,'pending mentor cannot read recommendations',v='err:42501',v);
 v:=pg_temp.call_as(m,format('select public.mentor_set_rotation_member(%L,true,true)::text',s),true); perform pg_temp.rec(62,'pending mentor cannot maintain designations',v='err:42501',v);
 update public.profiles set approved=true,status='inactive' where id=m;
 v:=pg_temp.call_as(m,'select public.mentor_rotation_data()::text'); perform pg_temp.rec(63,'inactive mentor cannot read recommendations',v='err:42501',v);
 v:=pg_temp.call_as(m,format('select public.mentor_set_rotation_member(%L,true,true)::text',s),true); perform pg_temp.rec(64,'inactive mentor cannot maintain designations',v='err:42501',v);
 update public.profiles set status='active' where id=m;
 -- Exact table ACLs and RLS, including inherited Supabase defaults.
 i:=300;
 foreach t in array array['parent_service_people','parent_service_sessions','event_checkin_venues','event_geo_exemptions','role_rotation_members'] loop
  i:=i+1; perform pg_temp.rec(i,t||' closed table and RLS',(select relrowsecurity from pg_class where oid=('public.'||t)::regclass) and not exists(select 1 from unnest(array['anon','authenticated','service_role']) role_name cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) op where has_table_privilege(role_name,'public.'||t,op)));
 end loop;
 i:=400;
 foreach sig in array array['staff_parent_service(uuid)','staff_save_parent_service(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,boolean)','staff_event_checkin(uuid)','staff_save_event_venue(uuid,double precision,double precision,boolean)','staff_set_event_geo_exempt(uuid,uuid,boolean)','my_event_checkin_venues()','event_venue_checkin(uuid,double precision,double precision,double precision)','mentor_set_rotation_member(uuid,boolean,boolean)','mentor_rotation_data()'] loop
  i:=i+1; perform pg_temp.rec(i,sig||' exact authenticated role set',has_function_privilege('authenticated','public.'||sig,'execute') and not has_function_privilege('anon','public.'||sig,'execute') and not has_function_privilege('service_role','public.'||sig,'execute'));
 end loop;
 i:=500;
 foreach sig in array array['_ops_mentor()','_merge_member_rules()'] loop
  i:=i+1; perform pg_temp.rec(i,sig||' internal closure',not exists(select 1 from unnest(array['anon','authenticated','service_role']) role_name where has_function_privilege(role_name,'public.'||sig,'execute')));
 end loop;
 perform pg_temp.rec(60,'new member keys remain in merge catalog',(select count(*)=3 from public._merge_member_rules() where (tbl,col) in (('parent_service_people','student_id'),('event_geo_exemptions','member_id'),('role_rotation_members','member_id'))));
end $test$;
select n,check_name,result,detail from ops_results order by n;
rollback;
