-- Disposable fictional test actors; every change rolls back.
begin;



create temp table t48_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t48_fx (a uuid, b uuid, c uuid, d uuid, s uuid,
  ev_rec uuid default gen_random_uuid(), ev_blank uuid default gen_random_uuid()) on commit drop;
grant all on t48_fx, t48_results to anon, authenticated, service_role;

with ns as (
  select p.id, row_number() over (order by p.id) as rn
    from public.profiles p
   where public._standing_member(p.id)
)
insert into t48_fx (a, b, c, d, s)
select (select id from ns where rn = 1), (select id from ns where rn = 2), (select id from ns where rn = 3), (select id from ns where rn = 4),
       (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1);

do $pre$
declare f t48_fx;
begin
  select * into f from t48_fx;
  if f.d is null or f.s is null then raise exception 'Cannot test: need four judged students and an admin'; end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  perform set_config('role', 'authenticated', true);
end
$fn$;
create function pg_temp.clear() returns void language plpgsql as $fn$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$fn$;
create function pg_temp.rec(n int, name text, ok boolean, detail text) returns void language sql as $fn$
  insert into t48_results values (n, name, case when ok is null then 'SKIP' when ok then 'PASS' else 'FAIL' end, detail)
$fn$;
create function pg_temp.call_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.clear();
  return v;
end
$fn$;


-- Isolate the invented harness actors inside the rollback transaction.
delete from public.attendance_events where user_id in (select a from t48_fx union select b from t48_fx union select c from t48_fx);
delete from public.signout_requests where member_id=(select a from t48_fx);
delete from public.standing_records where member_id in (select a from t48_fx union select b from t48_fx);
update public.standing_settings set starts_on = current_date - 400;
insert into public.events(id,title,kind,starts_at,ends_at)
select ev_rec,'Feedback test meeting','meeting', now()-interval '50 hours',now()-interval '49 hours' from t48_fx;
-- A normal NFC scan within ten minutes, including a location override.
insert into public.attendance_events(user_id,type,event_time,method,category,geo_ok)
select a,'in',now()-interval '49 hours 50 minutes','nfc','build',false from t48_fx;
insert into public.attendance_events(user_id,type,event_time,method,category)
select a,'out',now()-interval '49 hours 10 minutes','manual','build' from t48_fx;

do $checks$
declare f t48_fx; r uuid; st timestamptz; mt record; v text; w text; evidence jsonb; own_in uuid; x jsonb;
begin
  select * into f from t48_fx;
  select starts_at into st from public.events where id=f.ev_rec;
  insert into public.standing_records(member_id,kind,reason,opened_on,status)
  values(f.a,'meetings','Test withdrawn probation',public._school_year_start(public._la_today()),'dismissed') returning id into r;
  select x1 into x from jsonb_array_elements(public._letter_json(f.a)) x1 where x1->>'key'='standing';
  perform pg_temp.rec(1,'withdrawn probation leaves a season clean',(x->>'met')::boolean,x::text);
  update public.standing_records set status='closed' where id=r;
  select x1 into x from jsonb_array_elements(public._letter_json(f.a)) x1 where x1->>'key'='standing';
  perform pg_temp.rec(2,'completed real probation still counts',not (x->>'met')::boolean,x::text);
  select * into mt from public._member_meetings(f.a,public._la_date(st),public._la_date(st));
  perform pg_temp.rec(3,'ordinary NFC check-in within meeting is present, even location override',mt.attended=1 and mt.lates=0 and mt.misses=0,row_to_json(mt)::text);
  select * into mt from public._member_meetings(f.b,public._la_date(st),public._la_date(st));
  perform pg_temp.rec(4,'a member without evidence still misses the recorded meeting',mt.misses=1 and mt.attended=0,row_to_json(mt)::text);
  -- Move time while preserving the explicit meeting scan.
  insert into public.meeting_checkins(event_id,member_id,scanned_at,status) values(f.ev_rec,f.b,st,'present');
  update public.events set starts_at=starts_at+interval '2 hours', ends_at=ends_at+interval '2 hours' where id=f.ev_rec;
  select * into mt from public._member_meetings(f.b,public._la_date(st),public._la_date(st)+1);
  perform pg_temp.rec(5,'an explicit meeting scan survives a moved meeting',mt.attended=1 and mt.misses=0,row_to_json(mt)::text);
  update public.events set starts_at=starts_at-interval '2 hours',ends_at=ends_at-interval '2 hours' where id=f.ev_rec;
  insert into public.attendance_events(user_id,type,event_time,method,category)
  values(f.b,'in',st-interval '1 hour','nfc','build');
  select * into mt from public._member_meetings(f.b,public._la_date(st),public._la_date(st));
  perform pg_temp.rec(6,'forgotten checkout within the cap counts spanning the meeting',mt.attended=1 and mt.lates=0,row_to_json(mt)::text);
  delete from public.meeting_checkins where member_id=f.b and event_id=f.ev_rec;
  update public.attendance_events set event_time=st-interval '13 hours' where user_id=f.b;
  select * into mt from public._member_meetings(f.b,public._la_date(st),public._la_date(st));
  perform pg_temp.rec(7,'stale check-in alone is not attendance',mt.attended=0 and mt.misses=1,row_to_json(mt)::text);
  -- Future records keep original evidence; corrections cannot overwrite it.
  delete from public.standing_records where member_id=f.a;
  insert into public.standing_records(member_id,kind,reason,opened_on) values(f.a,'meetings','Test source records',(date_trunc('month',st)+interval '1 month')::date) returning id into r;

end
$checks$;

do $checks$
declare f t48_fx; r uuid; own_in uuid; v text; w text; x jsonb; n int; pulse_before numeric; wk date; evidence_original jsonb;
begin
  select * into f from t48_fx;
  select id into r from public.standing_records where member_id=f.a order by created_at desc limit 1;
  v := pg_temp.call_as(f.s,format('select public.staff_standing_evidence(%L)',r));
  perform pg_temp.rec(8,'staff can inspect the source record and snapshot',v not like 'err:%' and (v::jsonb->>'origin')='evaluation' and jsonb_array_length(v::jsonb->'meetings')=1,v);
  w := pg_temp.call_as(f.a,format('select public.staff_standing_evidence(%L)',r));
  perform pg_temp.rec(9,'member cannot invoke the staff evidence read',w like 'err:42501:%',w);
  v := pg_temp.call_as(f.s,'select count(*) from public.standing_record_evidence');
  perform pg_temp.rec(10,'evidence table is closed even to staff clients',v like 'err:42501:%',v);
  -- Pause an active original IN; no new attendance event is written.
  insert into public.attendance_events(user_id,type,event_time,method,category) values(f.a,'in',now()-interval '2 hours','nfc','build') returning id into own_in;
  select count(*) into n from public.attendance_events where user_id=f.a;
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  perform pg_temp.rec(11,'own pause uses server time on the existing IN',v not like 'err:%' and jsonb_array_length(v::jsonb->'pauses')=1 and n=(select count(*) from public.attendance_events where user_id=f.a),v);
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  perform pg_temp.rec(12,'repeated pause is idempotent',v not like 'err:%' and jsonb_array_length(v::jsonb->'pauses')=1,v);
  v:=pg_temp.call_as(f.b,format('select row_to_json(public.set_session_paused(%L,false))',own_in));
  perform pg_temp.rec(13,'another member cannot resume that session',v like 'err:42501:%',v);
  v:=pg_temp.call_as(f.s,format('select row_to_json(public.set_session_paused(%L,false))',own_in));
  perform pg_temp.rec(14,'staff cannot silently resume another member',v like 'err:42501:%',v);
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,false))',own_in));
  perform pg_temp.rec(15,'own resume closes the existing interval',v not like 'err:%' and v::jsonb->'pauses'->0->>'end' is not null,v);
  -- Give staff a direct UPDATE path in this transaction to isolate the column guard.
  execute 'create policy "t48 update control" on public.attendance_events for update to authenticated using (public.is_staff()) with check (public.is_staff())';
  v:=pg_temp.call_as(f.s,format('update public.attendance_events set pauses=''[]''::jsonb where id=%L returning id',own_in));
  perform pg_temp.rec(16,'direct UPDATE cannot forge pause history even through an allowed row',v like 'err:42501:%',v);
  v:=pg_temp.call_as(f.c,format('insert into public.attendance_events(user_id,type,event_time,method,pauses) values(%L,''in'',now(),''nfc'',''[{"start":"2026-01-01T00:00:00Z"}]''::jsonb) returning id',f.c));
  perform pg_temp.rec(17,'direct INSERT cannot forge paused time',v like 'err:42501:%',v);
  -- No self-OUT bypass while paused, and an approved OUT ends the pause.
  perform pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  v:=pg_temp.call_as(f.a,format('insert into public.attendance_events(user_id,type,event_time,method,note) values(%L,''out'',now(),''button'',''Completed invented wiring work'') returning id',f.a));
  perform pg_temp.rec(18,'pause preserves the mentor sign-out boundary',v like 'err:42501:%',v);
  v:=pg_temp.call_as(f.a,'select row_to_json(public.request_signout(''Completed invented wiring work'',true,''shop'',''button''))');
  v:=pg_temp.call_as(f.s,format('select row_to_json(public.approve_signout(%L))',v::jsonb->>'id'));
  select pauses into x from public.attendance_events where id=own_in;
  perform pg_temp.rec(19,'approval closes the open pause at OUT time',v::jsonb->>'status'='approved' and x->(jsonb_array_length(x)-1)->>'end' is not null,x::text);
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  perform pg_temp.rec(20,'a stale tab cannot pause a closed session',v like 'err:P0002:%',v);
  -- SQL accounting matches JS: two hours elapsed, thirty minutes paused.
  update public.attendance_events set pauses=jsonb_build_array(jsonb_build_object('start',now()-interval '90 minutes','end',now()-interval '60 minutes')) where id=own_in;
  perform pg_temp.rec(21,'standing hours deduct pauses inside the existing cap',public._member_hours(f.a,now()-interval '3 hours',now()+interval '2 seconds') between 1.49 and 1.51,public._member_hours(f.a,now()-interval '3 hours',now()+interval '2 seconds')::text);
  v:=pg_temp.call_as(f.s,'select public._pause_seconds(''[]''::jsonb,now(),now())');
  perform pg_temp.rec(22,'internal helpers are closed to clients',v like 'err:42501:%',v);
  perform pg_temp.rec(23,'anon has no read or execute grant',
    not has_function_privilege('anon','public.set_session_paused(uuid,boolean)','execute')
    and not has_function_privilege('anon','public.staff_standing_evidence(uuid)','execute')
    and not has_table_privilege('anon','public.standing_record_evidence','select'),'explicit named anon revokes');
  -- Snapshot keeps its original source after the ledger changes.
  delete from public.attendance_events where user_id=f.a;
  v:=pg_temp.call_as(f.s,format('select public.staff_standing_evidence(%L)',r));
  perform pg_temp.rec(24,'later corrections do not overwrite saved evidence',jsonb_array_length(v::jsonb->'attendance')>0,v);

  insert into public.attendance_events(user_id,type,event_time,method,category) values(f.a,'in',now()-interval '1 hour','nfc','build') returning id into own_in;
  update public.profiles set approved=false where id=f.a;
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  perform pg_temp.rec(25,'unapproved account cannot pause',v like 'err:42501:%',v);
  update public.profiles set approved=true,status='inactive' where id=f.a;
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  perform pg_temp.rec(26,'inactive account cannot pause',v like 'err:42501:%',v);
  update public.profiles set status='active' where id=f.a;
  delete from public.member_roles where member_id=f.a;
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  perform pg_temp.rec(27,'account without a student or staff role cannot pause',v like 'err:42501:%',v);
  insert into public.member_roles(member_id,role) values(f.a,'student');
  update public.attendance_events set event_time=now()-interval '26 hours' where id=own_in;
  v:=pg_temp.call_as(f.a,format('select row_to_json(public.set_session_paused(%L,true))',own_in));
  perform pg_temp.rec(28,'forgotten session beyond presence window cannot pause',v like 'err:P0002:%',v);
  perform pg_temp.rec(29,'overlapping pauses are clipped and unioned',public._pause_seconds('[{"start":"2026-11-01T08:00:00Z","end":"2026-11-01T10:00:00Z"},{"start":"2026-11-01T09:00:00Z","end":null}]'::jsonb,'2026-11-01T07:00:00Z','2026-11-01T11:00:00Z')=10800,'three hours, never four');

  insert into public.attendance_events(user_id,type,event_time,method,category) values(f.c,'in',now()-interval '2 hours','nfc','volunteer') returning id into own_in;
  pulse_before := pg_temp.call_as(f.s,'select public.readiness_summary()->''pulse_7d''->>''total_hours''')::numeric;
  update public.attendance_events set pauses=jsonb_build_array(jsonb_build_object('start',now()-interval '90 minutes','end',now()-interval '60 minutes')) where id=own_in;
  v:=pg_temp.call_as(f.s,'select public.readiness_summary()->''pulse_7d''->>''total_hours''');
  perform pg_temp.rec(31,'readiness excludes paused time in an open session',pulse_before-v::numeric=0.5,v);
  insert into public.attendance_events(user_id,type,event_time,method,category) values(f.c,'out',now(),'manual','volunteer');
  perform pg_temp.rec(30,'volunteer letter hours exclude paused time',public._volunteer_hours(f.c,public._la_date(now()-interval '3 hours')) between 1.49 and 1.51,public._volunteer_hours(f.c,public._la_date(now()-interval '3 hours'))::text);

  insert into public.events(id,title,kind,starts_at,ends_at) values(f.ev_blank,'Fictional midnight meeting','meeting','2025-11-03T07:45:00Z','2025-11-03T08:15:00Z');
  insert into public.attendance_events(user_id,type,event_time,method,category) values(f.d,'in','2025-11-03T07:50:00Z','nfc','build');
  v := (select attended::text from public._member_meetings(f.d,'2025-11-02','2025-11-02'));
  perform pg_temp.rec(32,'meeting belongs to LA Sunday after DST even when UTC is Monday',v='1',v);
  v := (select total::text from public._member_meetings(f.d,'2025-11-03','2025-11-03'));
  perform pg_temp.rec(33,'the same meeting is not counted on UTC Monday',v='0',v);
  insert into public.attendance_events(user_id,type,event_time,method,category) values(f.b,'in','2025-11-03T08:05:00Z','nfc','build');
  v := (select lates::text from public._member_meetings(f.b,'2025-11-02','2025-11-02'));
  perform pg_temp.rec(34,'ordinary check-in after fifteen minutes is late',v='1',v);

  insert into public.event_attendance(event_id,member_id,day,status)
    values(f.ev_blank,f.b,'2025-11-09','present'),(f.ev_blank,f.b,'2025-11-10','present');
  insert into public.standing_records(member_id,kind,reason,opened_on,status) values(f.b,'removal','Short week on probation, week of 2025-11-03','2025-11-09','proposed') returning id into r;
  v:=pg_temp.call_as(f.s,format('select public.staff_standing_evidence(%L)',r));
  perform pg_temp.rec(35,'weekly removal evidence includes the final Sunday',v::jsonb->>'from'='2025-11-03' and v::jsonb->>'to'='2025-11-09',v);
  perform pg_temp.rec(48,'event attendance evidence includes Sunday and excludes the following Monday',
    jsonb_array_length(v::jsonb->'event_attendance')=1 and v::jsonb->'event_attendance'->0->>'day'='2025-11-09',(v::jsonb->'event_attendance')::text);
  insert into public.standing_records(member_id,kind,reason,opened_on) values(f.a,'hours','Short week test','2025-11-10') returning id into r;
  v:=pg_temp.call_as(f.s,format('select public.staff_standing_evidence(%L)',r));
  perform pg_temp.rec(36,'hours probation opened Monday explains the previous complete week',v::jsonb->>'from'='2025-11-03' and v::jsonb->>'to'='2025-11-09',v);

  delete from public.logged_hours where member_id=f.c;
  wk:=date_trunc('week',public._la_today())::date;
  insert into public.logged_hours(member_id,date,hours,type,status,description)
  values(f.c,public._la_today(),0.5,'build','verified','Invented verified work'),
    (f.c,public._la_today(),1,'build','pending','Invented pending work'),
    (f.c,public._la_today(),9,'volunteer','verified','Invented FLL work'),
    (f.c,wk-1,10,'build','verified','Invented prior week'),
    (f.c,wk+7,10,'build','verified','Invented next week');
  v:=pg_temp.call_as(f.c,format('select public.member_standing(%L)->''week''->>''hours''',f.c));
  perform pg_temp.rec(37,'verified FRC log counts in standing weekly total, with LA date and state filters',v::numeric=0.5,v);
  perform pg_temp.rec(38,'attendance-only helper does not double-count logged work',public._member_hours(f.c,public._la_start(wk),public._la_start(wk+7))=0,'attendance-only stays zero');
  update public.logged_hours set status='verified' where member_id=f.c and description='Invented pending work';
  perform pg_temp.rec(39,'approval changes weekly standing hours',public._standing_week_hours(f.c,public._la_start(wk),public._la_start(wk+7))=1.5,'1.5 verified');
  update public.logged_hours set status='rejected' where member_id=f.c and description='Invented pending work';
  perform pg_temp.rec(40,'rejected work stops counting',public._standing_week_hours(f.c,public._la_start(wk),public._la_start(wk+7))=0.5,'0.5 verified');
  v:=pg_temp.call_as(f.b,format('select public._standing_week_hours(%L,public._la_start(%L),public._la_start(%L))',f.c,wk,wk+7));
  perform pg_temp.rec(41,'private weekly helper cannot expose another member',v like 'err:42501:%',v);
  v:=pg_temp.call_as(f.b,format('select public.member_standing(%L)',f.c));
  perform pg_temp.rec(42,'new weekly source retains standing member visibility boundary',v like 'err:42501:%',v);
  perform pg_temp.rec(43,'evaluation and both standing reads use the new weekly source',
    position('_standing_week_hours(' in pg_get_functiondef('public._standing_evaluate_run()'::regprocedure))>0
    and position('_standing_week_hours(' in pg_get_functiondef('public.staff_standing_overview()'::regprocedure))>0
    and not has_function_privilege('anon','public._standing_week_hours(uuid,timestamptz,timestamptz)','execute'),'three callers and anon revoke');

  -- Every new private helper has an independent execute-boundary proof.
  -- Owner reads and the earlier working triggers are the positive controls.
  wk:=public._la_date((select starts_at from public.events where id=f.ev_rec));
  v:=pg_temp.call_as(f.b,format('select count(*) from public._standing_meeting_details(%L,%L::date,%L::date)',f.a,wk,wk));
  perform pg_temp.rec(49,'private meeting details cannot expose source records to clients',
    v like 'err:42501:%' and not has_function_privilege('anon','public._standing_meeting_details(uuid,date,date)','execute')
    and (select count(*) from public._standing_meeting_details(f.a,wk,wk))=1,v);
  v:=pg_temp.call_as(f.b,format('select public._standing_evidence(%L,''test'')',r));
  perform pg_temp.rec(50,'private evidence constructor cannot bypass the staff RPC',
    v like 'err:42501:%' and not has_function_privilege('anon','public._standing_evidence(uuid,text)','execute')
    and public._standing_evidence(r,'test')->>'record_id'=r::text,v);
  perform pg_temp.rec(51,'pause arithmetic is closed to anon with a working owner control',
    not has_function_privilege('anon','public._pause_seconds(jsonb,timestamptz,timestamptz)','execute')
    and public._pause_seconds('[{"start":"2025-11-09T08:00:00Z","end":"2025-11-09T09:00:00Z"}]'::jsonb,'2025-11-09T08:00:00Z','2025-11-09T09:00:00Z')=3600,'one hour for owner; no anon execute');
  perform pg_temp.rec(52,'new trigger helpers have no client execute grant',
    (select bool_and(not has_function_privilege('anon',sig,'execute') and not has_function_privilege('authenticated',sig,'execute'))
      from unnest(array['public._protect_attendance_pauses()','public._end_attendance_pause()','public._capture_standing_evidence()']) sig)
    and (select count(*) from pg_trigger where not tgisinternal and tgenabled='O' and tgname in('protect_attendance_pauses','end_attendance_pause','capture_standing_evidence'))=3,'three installed working triggers; no client execute');
  perform pg_temp.rec(53,'anonymous clients have no snapshot-table privilege',
    not has_table_privilege('anon','public.standing_record_evidence','select,insert,update,delete,truncate,references,trigger'),'all seven table privileges explicitly absent');

  perform pg_temp.rec(54,'service_role has no implicit access to the managed functions or snapshots',
    (select bool_and(not has_function_privilege('service_role',sig,'execute')) from unnest(array[
      'public._letter_json(uuid)','public._standing_meeting_details(uuid,date,date)','public._member_meetings(uuid,date,date)',
      'public._protect_attendance_pauses()','public.set_session_paused(uuid,boolean)','public._end_attendance_pause()',
      'public._pause_seconds(jsonb,timestamptz,timestamptz)','public._member_hours(uuid,timestamptz,timestamptz)',
      'public._standing_evidence(uuid,text)','public._capture_standing_evidence()','public.staff_standing_evidence(uuid)',
      'public._volunteer_hours(uuid,date)','public.readiness_summary()','public._standing_week_hours(uuid,timestamptz,timestamptz)'
    ]) sig) and not exists(select 1 from pg_class c, lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where c.oid='public.standing_record_evidence'::regclass and a.grantee=(select oid from pg_roles where rolname='service_role')),
    '14 function signatures and every table privilege; live-default replay is a separate retained proof');

  -- Open row lookup ONLY in this rollback test, to isolate each write grant
  -- from the closed SELECT boundary already tested at check 10.
  grant select on public.standing_record_evidence to authenticated;
  execute 'create policy "t48 evidence lookup control" on public.standing_record_evidence for select to authenticated using (true)';
  select evidence into evidence_original from public.standing_record_evidence where record_id=r;
  delete from public.standing_record_evidence where record_id=r;
  v:=pg_temp.call_as(f.s,format('insert into public.standing_record_evidence(record_id,evidence) values(%L,''{"forged":true}''::jsonb) returning record_id',r));
  perform pg_temp.rec(44,'staff client cannot insert a source snapshot',v like 'err:42501:%',v);
  delete from public.standing_record_evidence where record_id=r;
  insert into public.standing_record_evidence(record_id,evidence) values(r,evidence_original);
  v:=pg_temp.call_as(f.s,format('update public.standing_record_evidence set evidence=''{}''::jsonb where record_id=%L returning record_id',r));
  perform pg_temp.rec(45,'staff client cannot rewrite a snapshot even with row lookup open',v like 'err:42501:%',v);
  v:=pg_temp.call_as(f.s,format('delete from public.standing_record_evidence where record_id=%L returning record_id',r));
  perform pg_temp.rec(46,'staff client cannot delete a snapshot even with row lookup open',v like 'err:42501:%',v);
  perform pg_temp.rec(47,'snapshot table truncate privilege is explicitly absent',not has_table_privilege('authenticated','public.standing_record_evidence','truncate'),'truncate is not row filtered');
end
$checks$;
select n,check_name as check,result,detail from t48_results order by n;
rollback;
