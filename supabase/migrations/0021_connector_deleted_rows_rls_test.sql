-- ============================================================
-- 0021_connector_deleted_rows RLS test
--
-- Run in the Supabase SQL editor AFTER 0021_connector_deleted_rows.sql.
-- SAFE ON LIVE DATA: one transaction ending in ROLLBACK. The allowlist row
-- it sets, the role it gives and takes, the event it makes and deletes and
-- every audit row are undone; no existing row changes.
--
-- HOW TO READ IT: one row per check (PASS / FAIL / SKIP, with detail) and a
-- final summary row.
--
-- WHAT IT PROVES. A role taken away through connector_call names the role
-- row in its preview and in its audit row, marked deleted (the defect found
-- live on 2026-10-20: both were empty); a delete that cascades names the
-- rows the cascade took; an insert is still reported as before; a delete
-- made in the app itself, outside connector_call, is not captured at all.
-- Positive controls: 3, 4, 5, 6. Negative controls: 7, 8.
--
-- Actors, picked from live data: an admin A (allowlisted inside this test)
-- and an approved member S with no staff role.
-- ============================================================

begin;

do $applied$
begin
  if to_regprocedure('public._connector_capture_delete()') is null
     or to_regprocedure('public.schedule_delete_event(uuid)') is null then
    raise exception 'Cannot test: 0019_connector_writes.sql and 0021_connector_deleted_rows.sql must be applied';
  end if;
end
$applied$;

create temp table t0021_results (n int primary key, check_name text not null, result text not null, detail text) on commit drop;
create temp table t0021_fx (a uuid, s uuid, e uuid) on commit drop;

insert into t0021_fx (a, s)
select (select r.member_id from public.member_roles r where r.role = 'admin' order by r.member_id limit 1),
       (select p.id from public.profiles p where p.approved and not exists (
          select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor', 'lead', 'admin'))
         order by p.id limit 1);

do $pre$
begin
  if (select a from t0021_fx) is null or (select s from t0021_fx) is null then
    raise exception 'Cannot test: needs an admin and an approved member without a staff role';
  end if;
end
$pre$;

create function pg_temp.act(p_who uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_who::text, true);
  perform set_config('role', 'authenticated', true);
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
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end
$fn$;

create function pg_temp.rec(p_n int, p_check text, p_pass boolean, p_detail text) returns void language sql as $fn$
  insert into t0021_results values (p_n, p_check, case when p_pass then 'PASS' else 'FAIL' end, p_detail);
$fn$;

do $checks$
declare
  f t0021_fx;
  v text; d text; n int;
  v_tag text := 't0021 ' || gen_random_uuid()::text;
  v_preview jsonb;
  v_rows jsonb;
begin
  select * into f from t0021_fx;
  update public.connector_settings set allowed_member = f.a where id;
  insert into public.connector_registry (function_name, tool, level) values
    ('admin_set_member_role', 'set_team_role', 'confirm'),
    ('schedule_delete_event', 'call_app', 'confirm')
  on conflict (function_name) do update set tool = excluded.tool, level = excluded.level;
  delete from public.member_roles where member_id = f.s and role = 'lead';
  insert into public.member_roles (member_id, role) values (f.s, 'lead');
  insert into public.events (title, kind, starts_at, ends_at, created_by)
  values (v_tag, 'build', now() + interval '2 days', now() + interval '2 days 1 hour', f.a) returning id into f.e;
  update t0021_fx set e = f.e;
  insert into public.event_signups (event_id, member_id, response) values (f.e, f.s, 'going');

  -- 1 structure
  select count(*) into n from pg_trigger where tgname = 'connector_capture_delete';
  select string_agg(t, ',' order by t) into d from (
    select c.relname::text as t from pg_trigger g join pg_class c on c.oid = g.tgrelid
     where g.tgname = 'connector_capture_delete' and c.relname in ('member_roles', 'events', 'event_signups', 'positions', 'survey_questions')) s;
  perform pg_temp.rec(1, 'structure: the delete capture is on every log table, the roster, the schedule and the pages 0019 writes included',
    n >= 30 and d = 'event_signups,events,member_roles,positions,survey_questions'
      and not exists (select 1 from public.connector_log_tables l where to_regclass('public.' || quote_ident(l.table_name)) is not null and l.table_name not like 'connector\_%'
                        and not exists (select 1 from pg_trigger g where g.tgrelid = to_regclass('public.' || quote_ident(l.table_name)) and g.tgname = 'connector_capture_delete')),
    n || ' triggers; ' || coalesce(d, 'none'));

  -- 2 the connector tables get none
  perform pg_temp.rec(2, 'no connector table carries the capture',
    not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'connector_capture_delete' and c.relname like 'connector\_%'), 'checked');

  -- 3 POSITIVE: the preview of taking a role away names the role row, deleted
  v := pg_temp.val_as(f.a, format($q$select public.connector_call('set_team_role', 'admin_set_member_role', %L::jsonb, %L, 'preview')$q$,
    jsonb_build_object('p_member', f.s, 'p_role', 'lead', 'p_grant', false)::text, 'id:t0021p:' || v_tag));
  begin
    v_preview := (substr(v, strpos(v, 'CONNECTOR_PREVIEW:') + length('CONNECTOR_PREVIEW:')))::jsonb;
  exception when others then v_preview := null; end;
  perform pg_temp.rec(3, 'the preview of taking a role away names the role row it will remove (positive control)',
    v_preview -> 'rows' @> jsonb_build_array(jsonb_build_object('table', 'member_roles', 'deleted', true, 'row', jsonb_build_object('member_id', f.s, 'role', 'lead'))),
    left(coalesce((v_preview -> 'rows')::text, v), 160));

  -- 4 the preview wrote nothing: the role is still held
  select count(*) into n from public.member_roles where member_id = f.s and role = 'lead';
  perform pg_temp.rec(4, 'the preview removed nothing', n = 1, n || ' lead role row');

  -- 5 POSITIVE: the commit removes it and the audit row records the removed row
  v := pg_temp.val_as(f.a, format($q$select public.connector_call('set_team_role', 'admin_set_member_role', %L::jsonb, %L, 'commit')$q$,
    jsonb_build_object('p_member', f.s, 'p_role', 'lead', 'p_grant', false)::text, 'id:t0021c:' || v_tag));
  select rows_written into v_rows from public.connector_audit where request_key = 'id:t0021c:' || v_tag;
  select count(*) into n from public.member_roles where member_id = f.s and role = 'lead';
  perform pg_temp.rec(5, 'the commit removes the role and its audit row records the removed role row (positive control)',
    n = 0 and v_rows @> jsonb_build_array(jsonb_build_object('table', 'member_roles', 'deleted', true, 'row', jsonb_build_object('member_id', f.s, 'role', 'lead'))),
    n || ' left; ' || left(coalesce(v_rows::text, v), 160));

  -- 6 POSITIVE: a delete that cascades names what the cascade took too, and
  -- a grant still reports its inserted row, not marked deleted
  v := pg_temp.val_as(f.a, format($q$select public.connector_call('call_app', 'schedule_delete_event', %L::jsonb, %L, 'commit')$q$,
    jsonb_build_object('p_event', f.e)::text, 'id:t0021e:' || v_tag));
  select rows_written into v_rows from public.connector_audit where request_key = 'id:t0021e:' || v_tag;
  d := pg_temp.val_as(f.a, format($q$select public.connector_call('set_team_role', 'admin_set_member_role', %L::jsonb, %L, 'commit')$q$,
    jsonb_build_object('p_member', f.s, 'p_role', 'lead', 'p_grant', true)::text, 'id:t0021g:' || v_tag));
  perform pg_temp.rec(6, 'deleting an event records the event and the sign-up the cascade removed; a grant records its new row, not deleted',
    v_rows @> jsonb_build_array(jsonb_build_object('table', 'events', 'deleted', true, 'id', f.e::text))
    and v_rows @> jsonb_build_array(jsonb_build_object('table', 'event_signups', 'deleted', true, 'row', jsonb_build_object('member_id', f.s)))
    and (select rows_written from public.connector_audit where request_key = 'id:t0021g:' || v_tag) @> jsonb_build_array(jsonb_build_object('table', 'member_roles', 'row', jsonb_build_object('role', 'lead')))
    and not ((select rows_written from public.connector_audit where request_key = 'id:t0021g:' || v_tag) @> jsonb_build_array(jsonb_build_object('deleted', true))),
    left(coalesce(v_rows::text, v), 160));

  -- 7 NEGATIVE: a delete in the app itself, outside connector_call, is not captured
  perform set_config('techmen.connector_call', '', true);
  delete from public.member_roles where member_id = f.s and role = 'lead';
  select count(*) into n from pg_class where relname = 'connector_deleted_rows' and relpersistence = 't'
     and exists (select 1 from pg_temp.connector_deleted_rows x where x.marker = '' or x.row ->> 'role' = 'lead' and x.row ->> 'member_id' = f.s::text and x.marker = '');
  perform pg_temp.rec(7, 'a delete outside connector_call is not captured', n = 0, n || ' captured');

  -- 8 NEGATIVE: the rows read refuses outside connector_call
  v := pg_temp.val_as(f.a, 'select public._connector_rows_written(0)');
  perform pg_temp.rec(8, 'the rows read is only reachable inside connector_call', v like 'err:%', left(v, 80));
end
$checks$;

select n, check_name, result, detail from t0021_results
union all
select 1000, 'SUMMARY', case when bool_and(result <> 'FAIL') then 'PASS' else 'FAIL' end,
       format('%s pass, %s fail, %s skip', count(*) filter (where result = 'PASS'), count(*) filter (where result = 'FAIL'), count(*) filter (where result = 'SKIP'))
  from t0021_results
order by 1;

rollback;
