-- Fictional harness actors only. No change survives this transaction.
begin;
create temp table sr_results(n int primary key, check_name text, result text, detail text);
create temp table sr_fx(a uuid,b uuid,s uuid,p uuid default gen_random_uuid(),i uuid default gen_random_uuid());
grant all on sr_results,sr_fx to authenticated,anon;
insert into sr_fx(a,b,s) select
 (select id from public.profiles where approved and not public.is_staff() order by id limit 1),
 (select member_id from public.member_roles where role='student' order by member_id desc limit 1),
 (select member_id from public.member_roles where role='admin' order by member_id limit 1);
-- Choose a student independently of the session role.
update sr_fx set a=(select member_id from public.member_roles where role='student' and member_id<>(select s from sr_fx) order by member_id limit 1);
insert into auth.users(id,email) select p,'pending-security@example.invalid' from sr_fx union all select i,'inactive-security@example.invalid' from sr_fx;
update public.profiles set approved=false where id=(select p from sr_fx);
update public.profiles set approved=true,status='inactive' where id=(select i from sr_fx);
delete from public.attendance_events where user_id=(select a from sr_fx);
create function pg_temp.sr_rec(n int,name text,ok boolean) returns void language sql as $fn$
 insert into sr_results values(n,name,case when ok then 'PASS' else 'FAIL' end,null);
$fn$;
create function pg_temp.sr_as(who uuid,sql text) returns text language plpgsql as $fn$
declare v text;
begin
 perform set_config('request.jwt.claim.sub',who::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',who,'role','authenticated')::text,true);
 set local role authenticated;
 begin execute sql into v; v:=coalesce(v,'null'); exception when others then v:='err:'||sqlstate; end;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','',true);
 return v;
end $fn$;

do $tests$
declare f sr_fx; v text; eid uuid; old_token uuid; new_token uuid; sig text;
begin
 select * into f from sr_fx;
 perform pg_temp.sr_rec(1,'item 1 internal editor closed to client roles',not has_function_privilege('anon','public._apply_event_edit(uuid,timestamptz,text,uuid,text)','execute') and not has_function_privilege('authenticated','public._apply_event_edit(uuid,timestamptz,text,uuid,text)','execute') and not has_function_privilege('service_role','public._apply_event_edit(uuid,timestamptz,text,uuid,text)','execute'));
 -- Positive: the supported staff editor still reaches its internal helper.
 insert into public.attendance_events(user_id,type,event_time) values(f.b,'in',now()-interval '1 hour') returning id into eid;
 v:=pg_temp.sr_as(f.s,format('select public.staff_edit_event(%L,now()-interval ''30 minutes'',null,''synthetic correction'')',eid));
 perform pg_temp.sr_rec(2,'supported staff attendance edit works',v in ('','null') and exists(select 1 from public.attendance_audit where event_id=eid));

 v:=pg_temp.sr_as(f.a,format('insert into public.attendance_events(user_id,type,event_time,method) values(%L,''in'',now()-interval ''7 days'',''nfc'') returning (abs(extract(epoch from event_time-now()))<1)::text',f.a));
 perform pg_temp.sr_rec(3,'direct self attendance uses server time',v='true');
 delete from public.attendance_events where user_id=f.a;
 v:=pg_temp.sr_as(f.a,format('insert into public.attendance_events(user_id,type,verified) values(%L,''in'',true)',f.a));
 perform pg_temp.sr_rec(4,'client cannot stamp verification',v='err:42501');
 delete from public.attendance_events where user_id=f.a;
 v:=pg_temp.sr_as(f.a,format('insert into public.attendance_events(user_id,type,overridden_by) values(%L,''in'',%L)',f.a,f.s));
 perform pg_temp.sr_rec(5,'client cannot stamp a staff actor',v='err:42501');
 delete from public.attendance_events where user_id=f.a;
 v:=pg_temp.sr_as(f.a,format('insert into public.attendance_events(user_id,type,manual_entry) values(%L,''in'',true)',f.a));
 perform pg_temp.sr_rec(6,'client cannot stamp manual attendance',v='err:42501');
 delete from public.attendance_events where user_id=f.a;
 v:=pg_temp.sr_as(f.a,format('insert into public.attendance_events(user_id,type,category) values(%L,''in'',''competition'')',f.a));
 perform pg_temp.sr_rec(7,'self attendance uses only supported categories',v='err:42501');
 delete from public.attendance_events where user_id=f.a;
 v:=pg_temp.sr_as(f.a,format('select public.attendance_record(''in'',''shop'',''nfc'',''build'',true,null,null)'));
 perform pg_temp.sr_rec(8,'ordinary attendance RPC still works',v in ('','null') and exists(select 1 from public.attendance_events where user_id=f.a and type='in'));
 delete from public.attendance_events where user_id=f.a;
 v:=pg_temp.sr_as(f.a,'select public.attendance_record(''in'',''fll-room'',''nfc'',''volunteer'',true,null,null)');
 perform pg_temp.sr_rec(9,'FLL attendance RPC still works',v in ('','null'));
 v:=pg_temp.sr_as(f.a,'select public.attendance_record(''out'',''fll-room'',''nfc'',''volunteer'',null,''Synthetic work completed'',null)');
 perform pg_temp.sr_rec(10,'noted FLL sign-out still works',v in ('','null'));
 v:=pg_temp.sr_as(f.s,format('select public.staff_add_manual_session(%L,now()-interval ''3 hours'',now()-interval ''2 hours'',''competition'',''synthetic manual pair'')',f.b));
 perform pg_temp.sr_rec(11,'staff historical manual pair still works',v in ('','null'));

 perform pg_temp.sr_rec(12,'legacy internal function ACLs are closed',not exists(
   select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   cross join (values('anon'),('authenticated'),('service_role')) r(role_name)
   where n.nspname='public' and (p.prorettype='trigger'::regtype or p.proname in('auto_close_open_checkins','invoke_cron_notify','notify_schedule_change','invoke_discord_calendar'))
   and has_function_privilege(r.role_name,p.oid,'execute')));
 perform public.invoke_cron_notify('event_reminder');
 perform public.invoke_discord_calendar();
 perform pg_temp.sr_rec(13,'owner scheduled dispatch remains callable',true);
 perform pg_temp.sr_rec(14,'owner auto-close remains callable',public.auto_close_open_checkins() is not null);

 v:=pg_temp.sr_as(f.a,format('select calendar_token from public.profiles where id=%L',f.b));
 perform pg_temp.sr_rec(15,'calendar token column hidden on another profile',v='err:42501');
 v:=pg_temp.sr_as(f.a,format('select calendar_token from public.profiles where id=%L',f.a));
 perform pg_temp.sr_rec(16,'own token uses only scoped RPC',v='err:42501');
 v:=pg_temp.sr_as(f.a,format('update public.profiles set calendar_token=gen_random_uuid() where id=%L',f.a));
 perform pg_temp.sr_rec(17,'direct token update denied',v='err:42501');
 perform pg_temp.sr_rec(18,'token insert privilege denied',not has_column_privilege('authenticated','public.profiles','calendar_token','insert'));
 select calendar_token into old_token from public.profiles where id=f.a;
 v:=pg_temp.sr_as(f.a,'select public.get_calendar_token()');
 perform pg_temp.sr_rec(19,'member gets own token',v=old_token::text);
 v:=pg_temp.sr_as(f.a,'select public.rotate_calendar_token()');
 select calendar_token into new_token from public.profiles where id=f.a;
 perform pg_temp.sr_rec(20,'member rotates own token',v=new_token::text and old_token<>new_token);
 perform pg_temp.sr_rec(21,'pending account cannot get feed token',pg_temp.sr_as(f.p,'select public.get_calendar_token()')='err:42501');
 perform pg_temp.sr_rec(22,'inactive account cannot rotate feed token',pg_temp.sr_as(f.i,'select public.rotate_calendar_token()')='err:42501');
 perform pg_temp.sr_rec(23,'token RPC role set exactly authenticated',not exists(
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('get_calendar_token','rotate_calendar_token')
 and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute') or not has_function_privilege('authenticated',p.oid,'execute'))));
 v:=pg_temp.sr_as(f.a,format('update public.profiles set nickname=''Synthetic nickname'' where id=%L returning nickname',f.a));
 perform pg_temp.sr_rec(24,'ordinary profile editing preserved',v='Synthetic nickname');
 v:=pg_temp.sr_as(f.a,format('select full_name is not null from public.profiles where id=%L',f.b));
 perform pg_temp.sr_rec(25,'ordinary profile reads preserved',v='true');
 perform pg_temp.sr_rec(26,'anon has no profile column grants',not exists(select 1 from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped and (has_column_privilege('anon',attrelid,attnum,'select') or has_column_privilege('anon',attrelid,attnum,'insert') or has_column_privilege('anon',attrelid,attnum,'update'))));
end $tests$;
select n,check_name as check,result,detail from sr_results order by n;
rollback;
