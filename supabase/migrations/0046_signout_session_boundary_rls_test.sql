-- Disposable fixtures, one transaction, no changes persist.
-- Run after 0046. Read every PASS/FAIL row and the summary.
begin;
create temp table t46_results(n int primary key, check_name text, result text, detail text) on commit drop;
create temp table t46_fx(s uuid default gen_random_uuid(), f uuid default gen_random_uuid(), m uuid default gen_random_uuid(), a uuid default gen_random_uuid()) on commit drop;
insert into t46_fx default values;
grant all on t46_results, t46_fx to authenticated, anon;
insert into auth.users(id,email) select s, s || '@example.invalid' from t46_fx union all select f,f || '@example.invalid' from t46_fx union all select m,m || '@example.invalid' from t46_fx union all select a,a || '@example.invalid' from t46_fx;
insert into public.profiles(id) select s from t46_fx union all select f from t46_fx union all select m from t46_fx union all select a from t46_fx on conflict do nothing;
update public.profiles set approved=true where id in (select s from t46_fx union all select f from t46_fx union all select m from t46_fx union all select a from t46_fx);
delete from public.member_roles where member_id in (select s from t46_fx union all select f from t46_fx union all select m from t46_fx union all select a from t46_fx);
insert into public.member_roles(member_id,role) select s,'student' from t46_fx union all select f,'student' from t46_fx union all select m,'mentor' from t46_fx union all select a,'student' from t46_fx;
insert into public.member_permissions(member_id,capability) select a,'signout.approve' from t46_fx;
create function pg_temp.call_as(who uuid, sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',who,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',coalesce(who::text,''),true);
  perform set_config('role',case when who is null then 'anon' else 'authenticated' end,true);
  begin execute sql into v; exception when others then v := 'err:' || sqlstate; end;
  reset role;
  perform set_config('request.jwt.claims','',true);
  perform set_config('request.jwt.claim.sub','',true);
  return coalesce(v,'null');
end $fn$;
create function pg_temp.rec(n int,label text,ok boolean,detail text default '') returns void language sql as $fn$
 insert into t46_results values(n,label,case when coalesce(ok,false) then 'PASS' else 'FAIL' end,detail)
$fn$;
do $checks$
declare x t46_fx; v text; req uuid; old_in uuid; next_in uuid; n int;
begin
 select * into x from t46_fx;
 insert into public.attendance_events(user_id,type,method,category,event_time) values(x.s,'in','nfc','build',now()-interval '3 hours') returning id into old_in;
 insert into public.attendance_events(user_id,type,method,category,event_time) values(x.f,'in','nfc','volunteer',now()-interval '2 hours'),(x.m,'in','nfc','build',now()-interval '1 hour');
 v := pg_temp.call_as(x.s,$q$select (public.request_signout('Assembled a gearbox',true,'shop','nfc')).id::text$q$); req := v::uuid;
 perform pg_temp.rec(1,'a note requests approval and leaves the original extended session open',exists(select 1 from public.signout_requests where id=req and in_event_id=old_in and status='pending') and (select count(*) from public.attendance_events where user_id=x.s)=1,v);
 v := pg_temp.call_as(x.s,format($q$insert into public.attendance_events(user_id,type,method,note) values(%L,'out','nfc','Finished wiring') returning id::text$q$,x.s));
 perform pg_temp.rec(2,'a student cannot directly close build hours',v='err:42501',v);
 v := pg_temp.call_as(x.s,format($q$insert into public.attendance_events(user_id,type,method,category) values(%L,'in','nfc','volunteer') returning id::text$q$,x.s));
 perform pg_temp.rec(3,'a second IN cannot replace an open build session',v='err:22023',v);
 -- Remove a permissive mutant write so every later check has its own fixture.
 delete from public.attendance_events where user_id=x.s and id<>old_in;
 v := pg_temp.call_as(x.s,$q$select public.switch_to_fll('fll-room',true,'Helped with FLL')::text$q$);
 perform pg_temp.rec(4,'the FLL transition cannot close unapproved build hours',v='err:42501' and exists(select 1 from public.signout_requests where id=req and status='pending') and (select count(*) from public.attendance_events where user_id=x.s)=1,v);
 delete from public.attendance_events where user_id=x.s and id<>old_in;
 update public.signout_requests set status='pending' where id=req;
 v := pg_temp.call_as(x.f,format($q$insert into public.attendance_events(user_id,type,method,note) values(%L,'out','nfc','  ') returning id::text$q$,x.f));
 perform pg_temp.rec(5,'FLL needs a meaningful note even through a direct write',v='err:22023',v);
 delete from public.attendance_events where user_id=x.f and type='out';
 v := pg_temp.call_as(x.f,format($q$insert into public.attendance_events(user_id,type,method,note) values(%L,'out','nfc','Coached attachment tests') returning id::text$q$,x.f));
 perform pg_temp.rec(6,'FLL with a note closes freely without a request',v not like 'err:%' and not exists(select 1 from public.signout_requests where member_id=x.f),v);
 v := pg_temp.call_as(x.m,format($q$insert into public.attendance_events(user_id,type,method) values(%L,'out','nfc') returning id::text$q$,x.m));
 perform pg_temp.rec(7,'staff also leave a note for their own sign-out',v='err:22023',v);
 delete from public.attendance_events where user_id=x.m and type='out';
 v := pg_temp.call_as(x.m,$q$select public.switch_to_fll('fll-room',true,'  ')::text$q$);
 perform pg_temp.rec(8,'a staff FLL transition also needs a note',v='err:22023',v);
 delete from public.attendance_events where user_id=x.m and event_time>=now();
 v := pg_temp.call_as(x.m,$q$select public.switch_to_fll('fll-room',true,'Coached the build team')::text$q$);
 perform pg_temp.rec(9,'staff may switch with a note, preserving OUT then volunteer IN',v not like 'err:%' and (select count(*) from public.attendance_events where user_id=x.m)=3 and exists(select 1 from public.attendance_events where id::text=v and type='in' and category='volunteer'),v);
 v := pg_temp.call_as(x.f,format('select (public.approve_signout(%L)).status',req));
 perform pg_temp.rec(10,'ordinary students cannot approve',v='err:42501',v);
 v := pg_temp.call_as(x.a,format('select (public.approve_signout(%L)).status',req));
 perform pg_temp.rec(11,'a named approver closes exactly the requested session with its note',v='approved' and (select count(*) from public.attendance_events where user_id=x.s and type='out' and note='Assembled a gearbox')=1,v);
 n := (select count(*) from public.attendance_events where user_id=x.s);
 v := pg_temp.call_as(x.a,format('select (public.approve_signout(%L)).status',req));
 perform pg_temp.rec(12,'repeated approval writes no second OUT',v='approved' and (select count(*) from public.attendance_events where user_id=x.s)=n,v);
 -- Old request plus a later session, created by a staff/manual correction.
 insert into public.attendance_events(user_id,type,method,category,event_time) values(x.s,'in','manual','build',now()+interval '1 second') returning id into next_in;
 update public.signout_requests set status='pending',out_event_id=null where id=req;
 v := pg_temp.call_as(x.m,format('select (public.approve_signout(%L)).status',req));
 perform pg_temp.rec(13,'a stale request is withdrawn and cannot close a later session',v='withdrawn' and (select count(*) from public.attendance_events where user_id=x.s)=n+1 and exists(select 1 from public.attendance_events where id=next_in),v);
 insert into public.attendance_events(user_id,type,method,category,event_time) values(x.a,'in','nfc','volunteer',now()-interval '1 hour');
 v := pg_temp.call_as(x.a,$q$select (public.request_signout('Tested the intake',true,'shop','button')).id::text$q$); req := v::uuid;
 v := pg_temp.call_as(x.a,format('select (public.approve_signout(%L)).status',req));
 perform pg_temp.rec(14,'approvers cannot approve themselves',v='err:42501',v);
 v := pg_temp.call_as(null,$q$select public.switch_to_fll('fll-room',true,'FLL note')::text$q$);
 perform pg_temp.rec(15,'anon cannot call the FLL transition',v='err:42501' and not has_function_privilege('anon','public.switch_to_fll(text,boolean,text)','execute') and has_function_privilege('authenticated','public.switch_to_fll(text,boolean,text)','execute'),v);
 v := pg_temp.call_as(x.s,$q$select public.switch_to_fll('fll-room',true,'')::text$q$);
 perform pg_temp.rec(17,'the switch checks staff authority independently of attendance triggers',v='err:42501',v);
 update public.signout_requests set status='withdrawn' where member_id=x.a;
 v := pg_temp.call_as(x.s,'select public.approve_all_signouts()::text');
 perform pg_temp.rec(18,'ordinary students cannot bulk approve',v='err:42501',v);
 update public.signout_requests set status='pending' where member_id in(x.s,x.a);
 v := pg_temp.call_as(x.m,'select public.approve_all_signouts()::text');
 perform pg_temp.rec(19,'bulk approval counts the valid request and excludes the stale request',v='1' and (select status from public.signout_requests where member_id=x.s)='withdrawn' and (select status from public.signout_requests where member_id=x.a)='approved',v);
 v := pg_temp.call_as(x.m,format($q$select public.staff_add_event(%L,'out',now()-interval '1 day','build','Corrected a historical session')::text$q$,x.m));
 perform pg_temp.rec(21,'staff historical corrections retain their audited reason',v not like 'err:%%' and exists(select 1 from public.attendance_audit where event_id::text=v and reason='Corrected a historical session'),v);
 -- Isolate this inner guard from the later independent client-integrity guard.
 -- The surrounding rollback restores trigger state even if a check fails.
 if exists(select 1 from pg_trigger where tgrelid='public.attendance_events'::regclass and tgname='attendance_00_client_integrity') then
   alter table public.attendance_events disable trigger attendance_00_client_integrity;
 end if;
 v := pg_temp.call_as(x.f,format($q$insert into public.attendance_events(user_id,type,method,note,manual_entry) values(%L,'out','nfc',null,true) returning id::text$q$,x.f));
 perform pg_temp.rec(22,'a student cannot claim the staff manual-correction exemption',v='err:22023',v);
 if exists(select 1 from pg_trigger where tgrelid='public.attendance_events'::regclass and tgname='attendance_00_client_integrity') then
   alter table public.attendance_events enable trigger attendance_00_client_integrity;
 end if;
 v := pg_temp.call_as(null,format($q$select public._apply_event_edit(%L,null,'volunteer',%L,'Boundary probe')::text$q$,next_in,x.s));
 perform pg_temp.rec(23,'the internal attendance editor is closed to anon and authenticated',v='err:42501' and not has_function_privilege('anon','public._apply_event_edit(uuid,timestamptz,text,uuid,text)','execute') and not has_function_privilege('authenticated','public._apply_event_edit(uuid,timestamptz,text,uuid,text)','execute'),v);
 v := pg_temp.call_as(x.m,format($q$select public.staff_edit_event(%L,null,'outreach','Reviewed work note')::text$q$,next_in));
 perform pg_temp.rec(24,'staff correction still calls the internal editor and leaves an audit',v not like 'err:%%' and exists(select 1 from public.attendance_events where id=next_in and category='outreach') and exists(select 1 from public.attendance_audit where event_id=next_in and reason='Reviewed work note'),v);
 perform pg_temp.rec(20,'bulk approval is unavailable to anon and available to authenticated',not has_function_privilege('anon','public.approve_all_signouts()','execute') and has_function_privilege('authenticated','public.approve_all_signouts()','execute'));
 perform pg_temp.rec(16,'the trigger is not executable by clients; approval has exactly authenticated access',not has_function_privilege('authenticated','public.attendance_events_self_out_guard()','execute') and not has_function_privilege('anon','public.approve_signout(uuid)','execute') and has_function_privilege('authenticated','public.approve_signout(uuid)','execute'));
end $checks$;
select n,check_name as check,result,detail from t46_results union all select 999,'summary',case when count(*) filter(where result='FAIL')=0 then 'PASS' else 'FAIL' end,format('%s PASS, %s FAIL',count(*) filter(where result='PASS'),count(*) filter(where result='FAIL')) from t46_results order by 1;
rollback;
