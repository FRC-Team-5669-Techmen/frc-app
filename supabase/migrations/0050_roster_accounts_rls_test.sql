-- Disposable identities only. Rollback all rows and evaluation notices.
begin;
create temp table t49_results(n int primary key,check_name text,result text,detail text);
create function pg_temp.rec(n int,label text,ok boolean,detail text default '') returns void language sql as $fn$
 insert into t49_results values(n,label,case when coalesce(ok,false) then 'PASS' else 'FAIL' end,detail)
$fn$;
create function pg_temp.call_as(who uuid,q text) returns text language plpgsql as $fn$
declare v text;
begin
 perform set_config('request.jwt.claims',json_build_object('sub',who,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',coalesce(who::text,''),true);
 perform set_config('role',case when who is null then 'anon' else 'authenticated' end,true);
 begin execute q into v; exception when others then v:='err:'||sqlstate; end;
 reset role;
 perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true);
 return coalesce(v,'null');
end
$fn$;
-- Negative operations always roll back even when a permissive mutation allows them.
create function pg_temp.probe_as(who uuid,q text) returns text language plpgsql as $fn$
declare v text;
begin
 begin
  v:=pg_temp.call_as(who,q);
  raise exception 'probe rollback' using errcode='P5648';
 exception when sqlstate 'P5648' then null;
 end;
 return v;
end
$fn$;
do $checks$
<<fixtures>>
declare
 a uuid:='00000000-0000-0000-0000-0000000000a1'; m uuid:='00000000-0000-0000-0000-0000000000b1';
 s uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); fresh uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid();
 invite_id uuid:=gen_random_uuid(); exc uuid:=gen_random_uuid(); br uuid:=gen_random_uuid(); short_id uuid:=gen_random_uuid(); session_id uuid; doc uuid; flag boolean; wk date:=date_trunc('week',public._la_today())::date-14; ev uuid;
 v text; code text; request_id uuid; rec_id uuid; before_state jsonb; after_state jsonb; r record; i int:=100; expected int;
begin
 insert into auth.users(id,email) values(s,s||'@example.invalid'),(t,t||'@boscotech.edu'),(other_id,other_id||'@boscotech.edu'),(fresh,fresh||'@example.invalid'),(legacy,legacy||'@example.invalid');
 insert into public.profiles(id) values(s),(t),(other_id),(fresh),(legacy) on conflict do nothing;
 delete from public.member_roles where member_id in(s,t,other_id,fresh,legacy);
 insert into public.member_roles(member_id,role) values(s,'student'),(t,'student'),(other_id,'student'),(legacy,'student');
 update public.profiles set approved=true,status='active' where id in(s,t,other_id,legacy);
 insert into public.account_classifications(member_id,reason,legacy) values(legacy,'Existing account: roles retained for admin review.',true);
 perform pg_temp.rec(1,'folding ships off',(select not enabled from public.participation_settings));
 v:=pg_temp.probe_as(s,'select public.admin_set_folding(true)::text'); perform pg_temp.rec(2,'student cannot enable folding',v='err:42501',v);
 v:=pg_temp.probe_as(m,'select public.admin_set_folding(true)::text'); perform pg_temp.rec(3,'mentor cannot enable folding',v='err:42501',v);
 v:=pg_temp.call_as(s,'select public.admin_preview_folding()::text'); perform pg_temp.rec(4,'student cannot preview roster',v='err:42501',v);
 v:=pg_temp.call_as(s,'select count(*)::text from public.staff_participation()'); perform pg_temp.rec(5,'student cannot read participation',v='err:42501',v);
 v:=pg_temp.probe_as(s,format('select public.mentor_set_participation(%L,true,false)::text',s)); perform pg_temp.rec(6,'student cannot override',v='err:42501',v);
 v:=pg_temp.probe_as(m,format('select public.mentor_set_participation(%L,false,true)::text',t)); perform pg_temp.rec(66,'restore cannot withdraw an active member proposal',v='err:22023',v);
 -- Start today so only the explicit existing failure is judged in this fixture.
 update public.standing_settings set starts_on=public._la_today();
 insert into public.standing_records(member_id,kind,reason,opened_on,status,closed_on) values(s,'hours','Fictional failed probation',public._la_today()-7,'failed',public._la_today());
 insert into public.standing_records(member_id,kind,reason,opened_on,status,closed_on) values(other_id,'hours','Unrelated old probation',public._la_today()-7,'failed',public._la_today());
 insert into public.standing_records(member_id,kind,reason,opened_on,status) values(other_id,'removal','Training overdue',public._la_today(),'proposed');
 insert into public.standing_records(member_id,kind,reason,opened_on,status) values(s,'removal','Short week on probation, week of a fictional week',public._la_today(),'proposed') returning id into rec_id;
 select jsonb_build_array((select count(*) from public.standing_records),(select count(*) from public.member_notices),(select count(*) from public.notice_outbox),(select count(*) from public.standing_weeks),(select count(*) from public.standing_months)) into before_state;
 v:=pg_temp.call_as(a,'select public.admin_preview_folding()::text');
 perform pg_temp.rec(7,'admin preview names the candidate and reason',v not like 'err:%' and v::jsonb->'candidates' @> jsonb_build_array(jsonb_build_object('member_id',s,'reason','Short week on probation, week of a fictional week')),v);
 select jsonb_build_array((select count(*) from public.standing_records),(select count(*) from public.member_notices),(select count(*) from public.notice_outbox),(select count(*) from public.standing_weeks),(select count(*) from public.standing_months)) into after_state;
 perform pg_temp.rec(55,'non-participation removal is never folded',not (v::jsonb->'candidates' @> jsonb_build_array(jsonb_build_object('member_id',other_id))),v);
 perform pg_temp.rec(8,'preview rolls back every evaluation side effect',before_state=after_state and (select status='active' from public.profiles where id=s));
 perform pg_temp.call_as(a,'select public.standing_evaluate()::text');
 perform pg_temp.rec(9,'off never folds',(select status='active' from public.profiles where id=s));
 v:=pg_temp.call_as(m,format('select public.mentor_set_participation(%L,true,false)::text',s)); perform pg_temp.rec(10,'mentor override succeeds',v not like 'err:%',v);
 perform pg_temp.call_as(a,'select public.admin_set_folding(true)::text');
 v:=pg_temp.call_as(a,'select public.admin_preview_folding()::text'); perform pg_temp.rec(11,'override excludes candidate',not (v::jsonb->'candidates' @> jsonb_build_array(jsonb_build_object('member_id',s))),v);
 perform pg_temp.call_as(a,'select public.standing_evaluate()::text'); perform pg_temp.rec(12,'override keeps active',(select status='active' from public.profiles where id=s));
 perform pg_temp.call_as(m,format('select public.mentor_set_participation(%L,false,false)::text',s));
 -- pg_cron runs as the owner with no authenticated member.
 perform public.standing_evaluate();
 perform pg_temp.rec(13,'cron folds after override withdrawal with reason and date',(select status='folded' and approved from public.profiles where id=s) and exists(select 1 from public.member_participation where member_id=s and folded_at is not null and reason='Short week on probation, week of a fictional week') and exists(select 1 from public.member_roles where member_id=s and role='student'));
 -- Folded retains feature access. Inactive still fails every caller check.
 for r in select unnest(array['public._battery_member_ok()','public._driver_member_ok()','public._hp_member_ok()','public._role_board_member_ok()','public.scouting_can_access()']) as sig loop
   i:=i+1; v:=pg_temp.call_as(s,'select '||r.sig||'::text');
   perform pg_temp.rec(i,r.sig||' permits folded caller',v='true',v);
   update public.profiles set status='inactive' where id=s;
   i:=i+1; v:=pg_temp.call_as(s,'select '||r.sig||'::text');
   perform pg_temp.rec(i,r.sig||' still refuses inactive caller',v='false',v);
   update public.profiles set status='folded' where id=s;
 end loop;
 v:=pg_temp.call_as(s,$q$select public.tour_complete_core('member',1)::text$q$);
 perform pg_temp.rec(56,'folded member can finish training',v not like 'err:%',v);
 v:=pg_temp.call_as(s,'select count(*)::text from public.tour_completions');
 perform pg_temp.rec(57,'folded member can read own training',v='1',v);
 update public.profiles set status='inactive' where id=s;
 v:=pg_temp.call_as(s,'select count(*)::text from public.tour_completions');
 perform pg_temp.rec(58,'inactive training read remains closed',v='0',v);
 update public.profiles set status='folded' where id=s;
 -- Target predicates and family sign-up retain the same role/application checks.
 insert into public.member_applications select (jsonb_populate_record(null::public.member_applications,
   to_jsonb(ma)||jsonb_build_object('id',gen_random_uuid(),'member_id',s,'parent_token',gen_random_uuid()))).* from public.member_applications ma limit 1;
 for r in select unnest(array['public._driver_target_ok','public._hp_target_ok','public._hub_roster_student']) as sig loop
   i:=i+1; execute format('select %s(%L)',r.sig,s) into flag;
   perform pg_temp.rec(i,r.sig||' permits folded target',flag);
   update public.profiles set status='inactive' where id=s;
   i:=i+1; execute format('select %s(%L)',r.sig,s) into flag;
   perform pg_temp.rec(i,r.sig||' refuses inactive target',not flag);
   update public.profiles set status='folded' where id=s;
 end loop;
 insert into public.attendance_events(user_id,type,method,category,event_time) values(s,'in','nfc','build',now()-interval '1 hour') returning id into session_id;
 v:=pg_temp.call_as(s,format('select public.set_session_paused(%L,true)::text',session_id));
 perform pg_temp.rec(59,'folded member keeps session pause access',v not like 'err:%',v);
 update public.profiles set status='inactive' where id=s;
 v:=pg_temp.call_as(s,format('select public.set_session_paused(%L,false)::text',session_id));
 perform pg_temp.rec(60,'inactive member still cannot pause',v='err:42501',v);
 update public.profiles set status='folded' where id=s;
 insert into public.driver_documents(owner_id,driver_name,kind,path) values(s,'Fictional Driver','license',s||'/fictional-license') returning id into doc;
 perform public.driver_docs_flag_leavers();
 perform pg_temp.rec(61,'folded never flags driver documents for deletion',(select purge_reason is null from public.driver_documents where id=doc));
 update public.profiles set status='inactive' where id=s;
 perform public.driver_docs_flag_leavers();
 perform pg_temp.rec(62,'inactive driver document policy unchanged',(select purge_reason is not null from public.driver_documents where id=doc));
 update public.profiles set status='folded' where id=s;
 update public.driver_documents set purge_reason=null where id=doc;
 -- The newly landed 0049 calendar boundary also preserves folded access.
 v:=pg_temp.call_as(s,'select public.get_calendar_token()::text');
 perform pg_temp.rec(70,'folded member reads only own calendar token',v=(select calendar_token::text from public.profiles where id=s),v);
 code:=v;
 v:=pg_temp.call_as(s,'select public.rotate_calendar_token()::text');
 perform pg_temp.rec(71,'folded member rotates own calendar token',v not like 'err:%' and v<>code and v=(select calendar_token::text from public.profiles where id=s),v);
 update public.profiles set status='inactive' where id=s;
 v:=pg_temp.call_as(s,'select public.get_calendar_token()::text'); perform pg_temp.rec(72,'inactive calendar read stays refused',v='err:42501',v);
 v:=pg_temp.call_as(s,'select public.rotate_calendar_token()::text'); perform pg_temp.rec(73,'inactive calendar rotation stays refused',v='err:42501',v);
 update public.profiles set status='folded' where id=s;
 v:=pg_temp.call_as(m,'select count(*)::text from public.staff_participation()'); perform pg_temp.rec(14,'staff positive read',v::int>0,v);
 v:=pg_temp.call_as(m,format('select public.mentor_set_participation(%L,false,true)::text',s));
 perform pg_temp.rec(15,'mentor restores without changing access or deleting history',v not like 'err:%' and (select status='active' and approved from public.profiles where id=s) and exists(select 1 from public.standing_records where id=rec_id and status='dismissed'),v);
 perform pg_temp.call_as(a,'select public.admin_set_folding(false)::text');
 -- First claim: personal roleless account is parent even while awaiting access.
 v:=pg_temp.call_as(fresh,'select public.claim_profile()::text');
 perform pg_temp.rec(16,'new personal account classified parent without approval',v='false' and exists(select 1 from public.member_roles where member_id=fresh and role='parent') and not exists(select 1 from public.member_roles where member_id=fresh and role='student'),v);
 v:=pg_temp.call_as(fresh,'select public.my_account_classification()::text'); perform pg_temp.rec(17,'own classification explains reason',v::jsonb->>'classification'='parent' and v::jsonb->>'reason'='Personal email with no roster role at first claim.',v);
 v:=pg_temp.call_as(legacy,'select public.claim_profile()::text');
 perform pg_temp.rec(18,'existing personal student is never reclassified',exists(select 1 from public.member_roles where member_id=legacy and role='student') and not exists(select 1 from public.member_roles where member_id=legacy and role='parent'),v);
 v:=pg_temp.call_as(a,'select public.admin_account_review()::text'); perform pg_temp.rec(19,'admin review lists legacy personal students',v::jsonb @> jsonb_build_array(jsonb_build_object('member_id',legacy,'needs_review',true)),v);
 v:=pg_temp.call_as(s,'select public.admin_account_review()::text'); perform pg_temp.rec(20,'student cannot review accounts',v='err:42501',v);
 v:=pg_temp.probe_as(m,format('select public.admin_reclassify_account(%L,%L)::text',legacy,'parent')); perform pg_temp.rec(21,'mentor cannot reclassify',v='err:42501',v);
 v:=pg_temp.call_as(a,format('select public.admin_reclassify_account(%L,%L)::text',legacy,'parent')); perform pg_temp.rec(22,'admin can reclassify without revoking access',v not like 'err:%' and exists(select 1 from public.member_roles where member_id=legacy and role='parent') and not exists(select 1 from public.member_roles where member_id=legacy and role='student') and (select approved from public.profiles where id=legacy),v);
 v:=pg_temp.call_as(a,format('select public.admin_approve_member(%L)::text',fresh)); perform pg_temp.rec(23,'roster approval keeps parent classification',v not like 'err:%' and not exists(select 1 from public.member_roles where member_id=fresh and role='student'),v);
 v:=pg_temp.probe_as(s,format('select public.admin_approve_member(%L)::text',fresh)); perform pg_temp.rec(24,'student cannot approve account',v='err:42501',v);
 -- A school claim stays student and existing parent claim never gains student.
 delete from public.member_roles where member_id=other_id;
 perform pg_temp.call_as(other_id,'select public.claim_profile()::text');
 perform pg_temp.rec(25,'new school claim gets student',exists(select 1 from public.member_roles where member_id=other_id and role='student'));
 perform pg_temp.call_as(fresh,'select public.claim_profile()::text'); perform pg_temp.rec(26,'repeated parent claim never adds student',not exists(select 1 from public.member_roles where member_id=fresh and role='student'));
 -- Explicit approval supersedes the new automatic default; invitations keep staff roles.
 insert into public.approved_emails(email,granted_role) values(fresh||'@example.invalid','student');
 v:=pg_temp.call_as(fresh,'select public.claim_profile()::text');
 perform pg_temp.rec(63,'explicit student approval supersedes only automatic parent default',v='true' and exists(select 1 from public.member_roles where member_id=fresh and role='student') and not exists(select 1 from public.member_roles where member_id=fresh and role='parent'),v);
 insert into auth.users(id,email) values(invite_id,invite_id||'@example.invalid');
 insert into public.profiles(id) values(invite_id) on conflict do nothing;
 delete from public.member_roles where member_id=invite_id;
 insert into public.approved_emails(email,granted_role) values(invite_id||'@example.invalid','mentor');
 v:=pg_temp.call_as(invite_id,'select public.claim_profile()::text');
 perform pg_temp.rec(64,'new invited mentor claim succeeds without student or parent',v='true' and exists(select 1 from public.member_roles where member_id=invite_id and role='mentor') and not exists(select 1 from public.member_roles where member_id=invite_id and role in ('student','parent')),v);
 insert into public.approved_emails(email,granted_role) values(legacy||'@example.invalid','student') on conflict(email) do update set granted_role='student';
 v:=pg_temp.call_as(legacy,'select public.claim_profile()::text');
 perform pg_temp.rec(65,'legacy admin classification is never silently replaced',exists(select 1 from public.account_classifications where member_id=fixtures.legacy and classification='parent' and reason='Admin reclassification.'),v);
 -- Transfer proof: code issuance, expiry, single redemption, approval and catalog refusal.
 v:=pg_temp.probe_as(t,'select public.create_account_transfer_code()::text'); perform pg_temp.rec(27,'school cannot generate source code',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.create_account_transfer_code()::text'); code:=v::jsonb->>'code';
 perform pg_temp.rec(28,'personal code is random length and expires in 24 hours',length(code)=32 and (v::jsonb->>'expires_at')::timestamptz between now()+interval '24 hours' and clock_timestamp()+interval '24 hours' and not exists(select 1 from public.account_transfer_codes where code_hash=code),v);
 v:=pg_temp.probe_as(fresh,format('select public.request_account_transfer(%L)::text',code)); perform pg_temp.rec(29,'personal account cannot redeem',v='err:42501',v);
 update public.account_transfer_codes set expires_at=now()-interval '1 second' where source_id=s;
 v:=pg_temp.probe_as(t,format('select public.request_account_transfer(%L)::text',code)); perform pg_temp.rec(30,'expired code refused',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.create_account_transfer_code()::text'); code:=v::jsonb->>'code';
 v:=pg_temp.call_as(t,format('select public.request_account_transfer(%L)::text',code)); request_id:=v::uuid;
 perform pg_temp.rec(31,'school redemption creates pending request, no merge',exists(select 1 from public.account_transfer_requests where id=request_id and source_id=s and target_id=t and status='pending') and (select approved from public.profiles where id=s),v);
 v:=pg_temp.probe_as(other_id,format('select public.request_account_transfer(%L)::text',code)); perform pg_temp.rec(32,'code single use',v='err:22023',v);
 v:=pg_temp.call_as(s,'select public.account_transfers()::text'); perform pg_temp.rec(33,'source sees own request',v::jsonb @> jsonb_build_array(jsonb_build_object('id',request_id)),v);
 v:=pg_temp.call_as(t,'select public.account_transfers()::text'); perform pg_temp.rec(34,'target sees own request',v::jsonb @> jsonb_build_array(jsonb_build_object('id',request_id)),v);
 v:=pg_temp.call_as(other_id,'select public.account_transfers()::text'); perform pg_temp.rec(35,'other student cannot see request',v='[]',v);
 v:=pg_temp.call_as(m,'select public.account_transfers()::text'); perform pg_temp.rec(36,'mentor cannot see transfer identities',v='[]',v);
 v:=pg_temp.call_as(a,'select public.account_transfers()::text'); perform pg_temp.rec(37,'admin can review request',v::jsonb @> jsonb_build_array(jsonb_build_object('id',request_id)),v);
 v:=pg_temp.probe_as(t,format('select public.admin_decide_account_transfer(%L,false)::text',request_id)); perform pg_temp.rec(38,'school cannot decide its own transfer',v='err:42501',v);
 update auth.users set email=null where id=t;
 v:=pg_temp.probe_as(a,format('select public.admin_decide_account_transfer(%L,true)::text',request_id)); perform pg_temp.rec(68,'approval refuses target with school email removed',v='err:22023',v);
 update auth.users set email=t||'@boscotech.edu' where id=t;
 update auth.users set email=null where id=s;
 v:=pg_temp.probe_as(a,format('select public.admin_decide_account_transfer(%L,true)::text',request_id)); perform pg_temp.rec(69,'approval refuses source with personal email removed',v='err:22023',v);
 update auth.users set email=s||'@example.invalid' where id=s;
 create table public.transfer_test_unknown(id uuid primary key,member_id uuid references public.profiles(id));
 v:=pg_temp.call_as(a,format('select public.admin_decide_account_transfer(%L,true)::text',request_id)); perform pg_temp.rec(39,'catalog gap blocks approval atomically',v='err:P0001' and exists(select 1 from public.account_transfer_requests where id=request_id and status='pending') and (select approved from public.profiles where id=s),v);
 drop table public.transfer_test_unknown;
 perform pg_temp.call_as(m,format('select public.mentor_set_participation(%L,true,false)::text',s));
 insert into public.logged_hours(member_id,type,date,hours,description,status) values(s,'build',public._la_today(),2,'Fictional summer history','verified');
 v:=pg_temp.call_as(a,format('select public.admin_decide_account_transfer(%L,true)::text',request_id));
 perform pg_temp.rec(40,'admin approved merge moves history and retains audit',v not like 'err:%' and exists(select 1 from public.logged_hours where member_id=t and description='Fictional summer history') and not exists(select 1 from public.logged_hours where member_id=s) and exists(select 1 from public.member_admin_log where member_id=s and action='merge_from') and exists(select 1 from public.account_transfer_requests where id=request_id and status='approved'),v);
 perform pg_temp.rec(67,'transfer retains mentor override on kept account',exists(select 1 from public.member_participation where member_id=t and keep_active) and not exists(select 1 from public.member_participation where member_id=s));
 v:=pg_temp.call_as(a,format('select public.admin_decide_account_transfer(%L,true)::text',request_id)); perform pg_temp.rec(41,'approval cannot replay',v='err:22023',v);
 v:=pg_temp.call_as(t,$q$select public.request_account_transfer('unknown')::text$q$); perform pg_temp.rec(42,'unknown code refused',v='err:22023',v);
 -- Pending access classifications: staff only, only requests still pending.
 insert into public.access_requests(email,status,requested_role) values(fresh||'@example.invalid','pending','parent') returning id into request_id;
 v:=pg_temp.call_as(m,'select public.staff_access_classifications()::text'); perform pg_temp.rec(43,'staff sees pending classification reason',v::jsonb @> jsonb_build_array(jsonb_build_object('request_id',request_id,'classification','student')),v);
 v:=pg_temp.call_as(s,'select public.staff_access_classifications()::text'); perform pg_temp.rec(44,'student cannot see others classifications',v='err:42501',v);
 v:=pg_temp.call_as(other_id,'select public.my_account_classification()::text'); perform pg_temp.rec(45,'own classification never returns another account',v::jsonb->>'member_id'=other_id::text,v);
 -- Generation replaces the previous code, and denial never merges history.
 v:=pg_temp.call_as(fresh,'select public.create_account_transfer_code()::text'); code:=v::jsonb->>'code';
 perform pg_temp.call_as(fresh,'select public.create_account_transfer_code()::text');
 v:=pg_temp.probe_as(other_id,format('select public.request_account_transfer(%L)::text',code));
 perform pg_temp.rec(46,'regeneration invalidates earlier code',v='err:22023',v);
 v:=pg_temp.call_as(fresh,'select public.create_account_transfer_code()::text'); code:=v::jsonb->>'code';
 v:=pg_temp.call_as(other_id,format('select public.request_account_transfer(%L)::text',code)); request_id:=v::uuid;
 v:=pg_temp.call_as(a,format('select public.admin_decide_account_transfer(%L,false)::text',request_id));
 perform pg_temp.rec(47,'denial leaves source history and approval intact',v not like 'err:%' and (select approved from public.profiles where id=fresh) and exists(select 1 from public.account_transfer_requests where id=request_id and status='denied'),v);
 -- Real evaluation, rather than planted candidate rows: one work week and a break.
 update public.profiles set status='inactive' where public._standing_member(id);
 insert into auth.users(id,email,created_at) values(exc,exc||'@boscotech.edu',public._la_start(wk-7)),(br,br||'@boscotech.edu',public._la_start(wk-7)),(short_id,short_id||'@boscotech.edu',public._la_start(wk-7));
 insert into public.profiles(id) values(exc),(br),(short_id) on conflict do nothing;
 update public.profiles set approved=true,status='active' where id in(exc,br,short_id);
 delete from public.member_roles where member_id in(exc,br,short_id);
 insert into public.member_roles(member_id,role) values(exc,'student'),(br,'student'),(short_id,'student');
 update public.standing_settings set starts_on=wk,hold_over_pct=null;
 insert into public.team_weeks(week_start,kind) values(wk+7,'break') on conflict(week_start) do update set kind='break';
 insert into public.events(title,kind,starts_at,ends_at) values('Fictional recorded meeting','meeting',public._la_start(wk+2)+interval '16 hours',public._la_start(wk+2)+interval '17 hours') returning id into ev;
 insert into public.meeting_checkins(event_id,member_id,status) values(ev,br,'present');
 insert into public.absence_requests(member_id,event_id,reason,status,requested_at) values(exc,ev,'medical','approved',public._la_start(wk));
 insert into public.logged_hours(member_id,type,date,hours,description,status) values(br,'build',wk+2,20,'Fictional clean work week','verified');
 insert into public.standing_records(member_id,kind,reason,opened_on,status) values(exc,'hours','Fictional existing probation',wk,'open'),(br,'hours','Fictional existing probation',wk,'open'),(short_id,'hours','Fictional existing probation',wk,'open');
 before_state:=(select jsonb_build_array(count(*),(select count(*) from public.notice_outbox)) from public.standing_records);
 v:=pg_temp.call_as(a,'select public.admin_preview_folding()::text');
 perform pg_temp.rec(48,'preview evaluates new failures but excludes excused and break weeks',v::jsonb->'candidates' @> jsonb_build_array(jsonb_build_object('member_id',short_id)) and not (v::jsonb->'candidates' @> jsonb_build_array(jsonb_build_object('member_id',exc))) and not (v::jsonb->'candidates' @> jsonb_build_array(jsonb_build_object('member_id',br))),v);
 after_state:=(select jsonb_build_array(count(*),(select count(*) from public.notice_outbox)) from public.standing_records);
 perform pg_temp.rec(49,'dry run of newly evaluated failure saves no records or mail',before_state=after_state and not exists(select 1 from public.standing_weeks where member_id in(exc,br,short_id)));
 perform pg_temp.call_as(a,'select public.admin_set_folding(true)::text');
 perform pg_temp.call_as(a,'select public.standing_evaluate()::text');
 perform pg_temp.rec(50,'real evaluation folds probation failure only',(select status='folded' from public.profiles where id=short_id) and (select status='active' from public.profiles where id=exc) and (select status='active' from public.profiles where id=br),jsonb_build_object('weeks',(select jsonb_agg(to_jsonb(w)) from public.standing_weeks w where member_id in(exc,br,short_id)),'records',(select jsonb_agg(to_jsonb(w)) from public.standing_records w where member_id in(exc,br,short_id)))::text);
 perform pg_temp.rec(51,'break and fully excused weeks are stored as excused',(select count(*)=4 from public.standing_weeks where (member_id in(exc,br,short_id) and week_start=wk+7 or member_id=exc and week_start=wk) and excused));
 -- Force more than three changed members: the unchanged mass-change hold aborts all.
 delete from public.standing_weeks where member_id in(exc,br,short_id);
 delete from public.standing_records where member_id in(exc,br,short_id);
 update public.profiles set status='active' where id in(exc,br,short_id);
 update public.standing_settings set starts_on=wk-7,hold_over_pct=1;
 update public.profiles set status='active' where id=other_id;
 update auth.users set created_at=public._la_start(wk-14) where id in(exc,br,short_id,other_id);
 update public.standing_records set reason='Short week on probation, week of a fictional week' where member_id=other_id and kind='removal' and status='proposed';
 v:=pg_temp.call_as(a,'select public.standing_evaluate()::text');
 perform pg_temp.rec(52,'mass-change hold prevents folding as well as standing writes',v='0' and not exists(select 1 from public.profiles where id in(exc,br,short_id,other_id) and status='folded') and not exists(select 1 from public.standing_weeks where member_id in(exc,br,short_id)) and exists(select 1 from public.member_notices where kind='standing_hold'),v);
 v:=pg_temp.probe_as(t,'select public.standing_evaluate()::text'); perform pg_temp.rec(53,'student cannot run evaluation',v='err:42501',v);
 v:=pg_temp.probe_as(s,'select public.create_account_transfer_code()::text'); perform pg_temp.rec(54,'completed transfer source cannot issue another code',v='err:22023',v);
 i:=200;
 -- Exact ACL surface. Each object also has a permissive grant mutation.
 for r in select unnest(array['participation_settings','member_participation','account_classifications','account_transfer_codes','account_transfer_requests']) as tbl loop
   i:=i+1;
   perform pg_temp.rec(i,r.tbl||' closed to all client and server roles',not has_table_privilege('authenticated','public.'||r.tbl,'select,insert,update,delete,truncate') and not has_table_privilege('anon','public.'||r.tbl,'select,insert,update,delete,truncate') and not has_table_privilege('service_role','public.'||r.tbl,'select,insert,update,delete,truncate'));
 end loop;
 for r in select unnest(array['standing_evaluate()','admin_preview_folding()','admin_set_folding(boolean)','staff_participation()','mentor_set_participation(uuid,boolean,boolean)','claim_profile()','my_account_classification()','admin_account_review()','admin_reclassify_account(uuid,text)','admin_approve_member(uuid)','create_account_transfer_code()','request_account_transfer(text)','account_transfers()','admin_decide_account_transfer(uuid,boolean)','staff_access_classifications()','_battery_member_ok()','_driver_member_ok()','_hp_member_ok()','_role_board_member_ok()','set_session_paused(uuid,boolean)','tour_complete_core(text,integer)','tour_completion_overview(integer)','get_calendar_token()','rotate_calendar_token()']) as sig loop
   i:=i+1; perform pg_temp.rec(i,r.sig||' granted only to authenticated',has_function_privilege('authenticated','public.'||r.sig,'execute') and not has_function_privilege('anon','public.'||r.sig,'execute') and not has_function_privilege('service_role','public.'||r.sig,'execute'));
 end loop;
 for r in select unnest(array['public._fold_candidates()','public._standing_evaluate_guarded()','public._merge_member_rules()','public._driver_target_ok(uuid)','public._hp_target_ok(uuid)','scouting_private.can_access(uuid)','public._hub_roster_student(uuid)','public.driver_docs_flag_leavers()']) as sig loop
   i:=i+1; perform pg_temp.rec(i,r.sig||' internal only',not has_function_privilege('authenticated',r.sig,'execute') and not has_function_privilege('anon',r.sig,'execute') and not has_function_privilege('service_role',r.sig,'execute'));
 end loop;
end
$checks$;
select n,check_name,result,detail from t49_results order by n;
rollback;
