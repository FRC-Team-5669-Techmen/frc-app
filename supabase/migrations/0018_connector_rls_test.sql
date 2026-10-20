-- ============================================================
-- 0018_connector RLS test
--
-- Run in the Supabase SQL editor AFTER 0018_connector.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK. The allowlist row
-- it sets, the hour adjustments, audit rows, feedback reports and registry
-- rows it creates are all undone, and no existing row changes.
--
-- HOW TO READ IT: one row per check (PASS / FAIL / SKIP, with detail) and a
-- final summary row. ok:<rows> is a call that ran; err:<SQLSTATE> is a
-- refusal (42501 for permission).
--
-- WHAT IT PROVES. Only the allowlisted account, while it is an admin, gets a
-- write through connector_call; that write lands exactly the row the direct
-- call lands, plus one audit row; anyone else reads the inner function own
-- refusal text for text, or the connector refusal when the inner call would
-- have worked, and nothing lands. The connector tables are closed to every
-- client role; the private helpers refuse outside connector_call.
--
-- Positive controls: 5, 8, 9, 11, 14, 17, 19, 21, 23. Mutation runs:
-- tools/connector/harness/mutants-0018.mjs.
--
-- Actors, picked from live data: an admin A (allowlisted inside this test),
-- an approved member with no staff role S, and a mentor or lead with no
-- admin role M (the checks that need M SKIP when the team has none).
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public.connector_call(text, text, jsonb, text, text, jsonb)') is null
     or to_regclass('public.connector_audit') is null
     or to_regprocedure('public.staff_add_hour_adjustment(uuid, text, numeric, text)') is null then
    raise exception 'Cannot test: 0018_connector.sql (and supabase/admin_hours_management.sql) must be applied';
  end if;
end
$applied$;

create temp table t0018_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0018_fx (a uuid, s uuid, m uuid, prior_allowed uuid) on commit drop;

insert into t0018_fx (a, s, m, prior_allowed)
select (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
       (select p.id from public.profiles p where p.approved and not exists (
          select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
         order by p.id limit 1),
       (select r.member_id from public.member_roles r where r.role in ('mentor', 'lead') and not exists (
          select 1 from public.member_roles x where x.member_id = r.member_id and x.role = 'admin')
         order by r.member_id limit 1),
       (select allowed_member from public.connector_settings where id);

do $pre$
declare f t0018_fx;
begin
  select * into f from t0018_fx;
  if f.a is null then raise exception 'Cannot test: no admin member'; end if;
  if f.s is null then raise exception 'Cannot test: no approved member without a staff role'; end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  if p_who is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_who::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end
$fn$;

-- ok:<rows> or err:<SQLSTATE>
create function pg_temp.run_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare n int; outcome text;
begin
  perform pg_temp.act(p_who);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    outcome := 'ok:' || n;
  exception when others then
    outcome := 'err:' || sqlstate;
  end;
  reset role;
  return outcome;
end
$fn$;

-- the value, or err:<SQLSTATE>:<message>
create function pg_temp.val_as(p_who uuid, p_sql text) returns text language plpgsql as $fn$
declare v text;
begin
  perform pg_temp.act(p_who);
  begin
    execute p_sql into v;
    v := coalesce(v, 'null');
  exception when others then
    v := 'err:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return v;
end
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text) returns void language sql as $fn$
  insert into t0018_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;
create function pg_temp.skip(p_n int, p_check text, p_detail text) returns void language sql as $fn$
  insert into t0018_results values (p_n, p_check, 'SKIP', p_detail);
$fn$;

do $checks$
declare
  f t0018_fx;
  r text; v text; d text; c text;
  n_adj int; n_audit int; n_fb int;
  call_sql text;
  v_tag text := 't0018 ' || gen_random_uuid()::text;
begin
  select * into f from t0018_fx;

  -- The registry knows the one function this test writes through.
  insert into public.connector_registry (function_name, tool, level)
  values ('staff_add_hour_adjustment', 'correct_hours', 'confirm')
  on conflict (function_name) do update set tool = excluded.tool, level = excluded.level;
  update public.connector_settings set allowed_member = null where id;

  -- 1 structure
  select string_agg(x, ',' order by x) into v from (
    select 'invoker_call' as x from pg_proc where oid = 'public.connector_call(text, text, jsonb, text, text, jsonb)'::regprocedure and not prosecdef
    union all select 'invoker_gap' from pg_proc where oid = 'public.connector_report_gap(text, text)'::regprocedure and not prosecdef
    union all select 'rls_all' where (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                       where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'connector\_%' and c.relrowsecurity) = 8
    union all select 'no_policy' where not exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'connector\_%')
    union all select 'switch_off' where (select not enabled from public.connector_settings where id) or f.prior_allowed is not null
  ) s;
  perform pg_temp.rec(1, 'structure: invoker call and gap, RLS on all eight tables, no policy, switch starts off',
    v = 'invoker_call,invoker_gap,no_policy,rls_all,switch_off', coalesce(v, 'none'));

  -- 2 anon cannot read a connector table
  r := pg_temp.run_as(null, 'select * from public.connector_tokens');
  perform pg_temp.rec(2, 'anon cannot read connector_tokens, loud', r = 'err:42501', r);

  -- 3 an admin cannot read the audit table directly either
  r := pg_temp.run_as(f.a, 'select * from public.connector_audit');
  c := pg_temp.run_as(f.a, 'update public.connector_settings set allowed_member = auth.uid()');
  perform pg_temp.rec(3, 'an admin cannot read connector_audit or allowlist itself directly, loud', r = 'err:42501' and c = 'err:42501', r || ' / ' || c);

  -- 4 nobody may connect while the allowlist is empty, an admin included
  v := pg_temp.val_as(f.a, 'select public.connector_may_connect()');
  perform pg_temp.rec(4, 'with the allowlist empty an admin may not connect', v = 'false', v);

  -- 5 POSITIVE: the allowlisted admin may connect
  update public.connector_settings set allowed_member = f.a where id;
  v := pg_temp.val_as(f.a, 'select public.connector_may_connect()');
  perform pg_temp.rec(5, 'the allowlisted admin may connect (positive control)', v = 'true', v);

  -- 6 a member who is not allowlisted may not
  v := pg_temp.val_as(f.s, 'select public.connector_may_connect()');
  perform pg_temp.rec(6, 'a member who is not allowlisted may not connect', v = 'false', v);

  -- 7 an allowlisted account that is not an admin may not
  update public.connector_settings set allowed_member = f.s where id;
  v := pg_temp.val_as(f.s, 'select public.connector_may_connect()');
  d := pg_temp.val_as(f.a, 'select public.connector_may_connect()');
  update public.connector_settings set allowed_member = f.a where id;
  perform pg_temp.rec(7, 'an allowlisted account without the admin role may not connect, and the admin then may not either',
    v = 'false' and d = 'false', v || ' / ' || d);

  -- 8 POSITIVE: the direct call as the admin lands one adjustment
  r := pg_temp.run_as(f.a, format('select public.staff_add_hour_adjustment(%L, %L, %s, %L)', f.s, 'build', 1.5, v_tag || ' direct'));
  select count(*) into n_adj from public.hour_adjustments where reason = v_tag || ' direct';
  perform pg_temp.rec(8, 'the direct call as the admin writes one adjustment (positive control)', r = 'ok:1' and n_adj = 1, r || ' / ' || n_adj);

  -- 9 POSITIVE: the same call through connector_call lands the same row and one audit row
  call_sql := format($q$select public.connector_call('correct_hours', 'staff_add_hour_adjustment', %L::jsonb, %L, 'commit')$q$,
    jsonb_build_object('p_member', f.s, 'p_category', 'build', 'p_hours', 1.5, 'p_reason', v_tag || ' via')::text, 'id:t0018:' || v_tag);
  v := pg_temp.val_as(f.a, call_sql);
  select count(*) into n_adj from public.hour_adjustments where reason = v_tag || ' via';
  select count(*) into n_audit from public.connector_audit where request_key = 'id:t0018:' || v_tag and status = 'done'
     and rows_written @> jsonb_build_array(jsonb_build_object('table', 'hour_adjustments'));
  select string_agg(x, '|') into d from (
    select format('%s,%s,%s,%s', member_id, category, hours, created_by) as x from public.hour_adjustments where reason = v_tag || ' direct'
    union all
    select format('%s,%s,%s,%s', member_id, category, hours, created_by) from public.hour_adjustments where reason = v_tag || ' via'
  ) s;
  perform pg_temp.rec(9, 'through connector_call the admin writes the same row as directly, plus one audit row (positive control)',
    v like '{%' and n_adj = 1 and n_audit = 1 and split_part(d, '|', 1) = split_part(d, '|', 2), left(v, 60) || ' / ' || n_adj || ' / ' || n_audit);

  -- 10 a member reads the inner refusal, text for text, and nothing lands
  d := pg_temp.val_as(f.s, format('select public.staff_add_hour_adjustment(%L, %L, %s, %L)', f.s, 'build', 2, v_tag || ' student'));
  v := pg_temp.val_as(f.s, replace(replace(call_sql, ' via', ' student'), 'id:t0018:', 'id:t0018s:'));
  select count(*) into n_adj from public.hour_adjustments where reason like v_tag || ' student%';
  select count(*) into n_audit from public.connector_audit where request_key like 'id:t0018s:%';
  perform pg_temp.rec(10, 'a member gets the inner function own refusal text for text through the connector, nothing lands',
    d like 'err:%' and v = d and n_adj = 0 and n_audit = 0, left(d, 70) || ' / ' || left(v, 70));

  -- 11 a mentor, whose direct call would work, gets the connector refusal and nothing lands
  if f.m is null then
    perform pg_temp.skip(11, 'a mentor whose call would work gets the connector refusal', 'no mentor or lead without admin on this team');
  else
    v := pg_temp.val_as(f.m, replace(replace(call_sql, ' via', ' mentor'), 'id:t0018:', 'id:t0018m:'));
    select count(*) into n_adj from public.hour_adjustments where reason like v_tag || ' mentor%';
    select count(*) into n_audit from public.connector_audit where request_key like 'id:t0018m:%';
    d := pg_temp.run_as(f.m, format('select public.staff_add_hour_adjustment(%L, %L, %s, %L)', f.s, 'build', 1, v_tag || ' mentor direct'));
    perform pg_temp.rec(11, 'a mentor whose direct call works (positive control) gets the connector refusal through it, nothing lands',
      d = 'ok:1' and v like 'err:42501:The Techmen connector%' and n_adj = 0 and n_audit = 0, d || ' / ' || left(v, 70));
  end if;

  -- 12 signed out: the inner refusal, nothing lands
  v := pg_temp.val_as(null, replace(replace(call_sql, ' via', ' anon'), 'id:t0018:', 'id:t0018a:'));
  select count(*) into n_adj from public.hour_adjustments where reason like v_tag || ' anon%';
  perform pg_temp.rec(12, 'signed out, the connector refuses and nothing lands', v like 'err:%' and n_adj = 0, left(v, 70));

  -- 13 a preview writes nothing and says what it would write
  v := pg_temp.val_as(f.a, replace(replace(call_sql, ' via', ' preview'), '''commit''', '''preview'''));
  select count(*) into n_adj from public.hour_adjustments where reason like v_tag || ' preview%';
  select count(*) into n_audit from public.connector_audit where request_key like 'id:t0018:%' and args ->> 'p_reason' like '% preview';
  perform pg_temp.rec(13, 'a preview raises CN001 naming the rows it would write, and writes nothing',
    v like 'err:CN001:CONNECTOR_PREVIEW:%hour_adjustments%' and n_adj = 0 and n_audit = 0, left(v, 80));

  -- 14 POSITIVE then repeat: the same request id twice writes once
  v := pg_temp.val_as(f.a, call_sql);
  select count(*) into n_adj from public.hour_adjustments where reason = v_tag || ' via';
  perform pg_temp.rec(14, 'the same request id a second time answers repeated and writes nothing more', v like '%"repeated": true%' and n_adj = 1, left(v, 60) || ' / ' || n_adj);

  -- 15 a derived key inside 120 seconds is the same request
  c := format($q$select public.connector_call('correct_hours', 'staff_add_hour_adjustment', %L::jsonb, %L, 'commit')$q$,
    jsonb_build_object('p_member', f.s, 'p_category', 'build', 'p_hours', 0.5, 'p_reason', v_tag || ' derived')::text, 'derived:t0018' || v_tag);
  r := pg_temp.val_as(f.a, c);
  v := pg_temp.val_as(f.a, c);
  select count(*) into n_adj from public.hour_adjustments where reason = v_tag || ' derived';
  perform pg_temp.rec(15, 'a derived key repeated inside 120 seconds writes once', n_adj = 1 and v like '%"repeated": true%', n_adj || ' / ' || left(v, 40));

  -- 16 the private helpers refuse outside connector_call, even for the allowlisted admin
  r := pg_temp.run_as(f.a, $q$select public._connector_audit_begin('x', 'staff_add_hour_adjustment', '{}', 'id:t0018h', 'undo', '{}')$q$);
  c := pg_temp.run_as(f.a, 'select public._connector_rows_written(0)');
  d := pg_temp.run_as(f.a, 'select public._connector_guard()');
  perform pg_temp.rec(16, 'the private helpers refuse a direct call (the marker is missing), and the guard is not executable',
    r = 'err:42501' and c = 'err:42501' and d = 'err:42501', r || ' / ' || c || ' / ' || d);

  -- 17 a name the registry does not know is refused, and nothing lands
  v := pg_temp.val_as(f.a, format($q$select public.connector_call('x', 'staff_delete_logged_hours', %L::jsonb, 'id:t0018u', 'commit')$q$,
    jsonb_build_object('p_entry', gen_random_uuid())::text));
  r := pg_temp.val_as(f.a, $q$select public.connector_call('x', 'connector_may_connect', '{}'::jsonb, 'id:t0018k', 'preview')$q$);
  perform pg_temp.rec(17, 'an unregistered function is refused by name, a read helper included',
    v like 'err:42501:The connector does not know%' and r like 'err:42501:The connector does not know%', left(v, 60));

  -- 18 a gap lands in the feedback inbox as the caller, marked connector
  v := pg_temp.val_as(f.a, $q$select public.connector_report_gap('make a seating chart for the bus', 'There is no seating chart')$q$);
  select count(*) into n_fb from public.feedback where route = 'connector' and member_id = f.a and message like 'Connector gap: There is no seating chart%';
  r := pg_temp.run_as(null, $q$select public.connector_report_gap('x', 'y')$q$);
  perform pg_temp.rec(18, 'report_gap files one inbox report as the admin, marked connector; signed out it is refused',
    n_fb = 1 and r = 'err:42501', n_fb || ' / ' || r);

  -- 19 the admin page reads: the admin yes (positive control), a member no
  v := pg_temp.val_as(f.a, $q$select (public.connector_admin_state() ->> 'allowed_is_me')$q$);
  r := pg_temp.run_as(f.s, 'select public.connector_admin_state()');
  c := pg_temp.run_as(f.s, 'select public.connector_admin_audit()');
  perform pg_temp.rec(19, 'the admin reads the connector state (positive control); a member cannot read the state or the audit log',
    v = 'true' and r = 'err:42501' and c = 'err:42501', v || ' / ' || r || ' / ' || c);

  -- 20 a member cannot switch it on or disconnect anyone
  r := pg_temp.run_as(f.s, 'select public.connector_admin_set_enabled(true)');
  c := pg_temp.run_as(f.s, 'select public.connector_admin_disconnect_all()');
  select coalesce(enabled::text, 'null') into v from public.connector_settings where id;
  perform pg_temp.rec(20, 'a member cannot flip the switch or disconnect', r = 'err:42501' and c = 'err:42501', r || ' / ' || c || ' / ' || v);

  -- 21 POSITIVE: the admin can
  r := pg_temp.run_as(f.a, 'select public.connector_admin_set_enabled(true)');
  select coalesce(enabled::text, 'null') into v from public.connector_settings where id;
  perform pg_temp.rec(21, 'the admin flips the switch (positive control)', r = 'ok:1' and v = 'true', r || ' / ' || v);

  -- 22 an app service call: the member is refused, the admin gets an audit row
  r := pg_temp.run_as(f.s, $q$select public.connector_external_begin('announce', 'edge:discord-announce', '{}', 'id:t0018e', 'confirm')$q$);
  v := pg_temp.val_as(f.a, $q$select public.connector_external_begin('announce', 'edge:discord-announce', '{}', 'id:t0018e', 'confirm') ->> 'audit_id'$q$);
  c := pg_temp.run_as(f.a, format($q$select public.connector_external_finish(%L, '{"ok": true}', null)$q$, v));
  select count(*) into n_audit from public.connector_audit where request_key = 'id:t0018e' and status = 'done';
  perform pg_temp.rec(22, 'an app service call is audited for the admin and refused to a member',
    r = 'err:42501' and c = 'ok:1' and n_audit = 1, r || ' / ' || c || ' / ' || n_audit);

  -- 23 anon cannot run the admin functions at all (no grant)
  -- (the body refuses anon too, so the grant itself is what is read here)
  select string_agg(p.proname, ',' order by p.proname) into r
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'connector\_%' or p.proname like '\_connector\_%')
     and has_function_privilege('anon', p.oid, 'execute');
  c := pg_temp.val_as(null, 'select public.connector_may_connect()');
  perform pg_temp.rec(23, 'anon may execute only connector_call and connector_may_connect, which answers false (positive control: it runs)',
    r = 'connector_call,connector_may_connect' and c = 'false', coalesce(r, 'none') || ' / ' || c);
end
$checks$;

select n, check_name, result, detail from (
  select n, check_name, result, detail from t0018_results
  union all
  select 999, 'summary',
         case when count(*) filter (where result = 'FAIL') = 0 and count(*) >= 23 then 'PASS' else 'FAIL' end,
         format('%s pass, %s fail, %s skip', count(*) filter (where result = 'PASS'),
                count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
    from t0018_results
) all_rows order by n;

rollback;
