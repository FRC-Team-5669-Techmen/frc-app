-- ============================================================
-- 0021_connector_deleted_rows: a change made through Claude that DELETES
-- rows shows them, in the preview he hears first and in the audit row
-- (ledger 0014)
--
-- Run once in the Supabase SQL editor, AFTER 0018_connector.sql (and 0019,
-- 0020, which this covers too). Re-runnable.
--
-- WHY. Found live on 2026-10-20: taking a role away through Claude
-- (set_team_role, admin_set_member_role with p_grant false) answered a
-- preview and then a result whose rows were both empty, so Mr. Pina was
-- asked to confirm a change the preview did not describe. 0018 read the rows
-- a call wrote by their in-progress xmin, which sees inserts and updates but
-- never a deleted row: once deleted it is gone from the view.
--
-- WHAT THIS DOES. Every table in connector_log_tables gets one AFTER DELETE
-- row trigger, connector_capture_delete. It does nothing at all unless the
-- delete happens inside connector_call (the techmen.connector_call marker
-- 0018 sets for its own transaction only); then it keeps a copy of the
-- deleted row in a temporary table that lives only until the transaction
-- ends. _connector_rows_written now answers those rows too, each marked
-- "deleted": true, so a preview names what will go and the audit row records
-- what went. Rows removed by a cascade are captured the same way. At most 200
-- deleted rows per table are listed; past that one entry says how many more.
-- Writes made in the app itself, outside connector_call, are untouched.
--
-- connector_log_tables also gains every other table in public (the
-- connector tables aside): since 0019 every write in the app is a function
-- Claude can call, so any of them can be written through the connector.
-- A table added to connector_log_tables later (the server adds them from
-- api/_lib/connector/log-tables.js) gets its trigger on insert.
--
-- TO UNDO: drop trigger connector_capture_delete on every table that has it
-- (the tables pg_trigger lists under that name), drop trigger connector_log_tables_capture on
-- public.connector_log_tables, drop function public._connector_capture_delete(),
-- public._connector_install_capture(text), public._connector_log_table_added(),
-- and paste the _connector_rows_written body from 0018 again.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public._connector_rows_written(bigint)') is null then
    raise exception '0021 needs 0018_connector.sql applied first';
  end if;
end
$prereq$;

-- The capture. SECURITY DEFINER so the temporary table always belongs to the
-- function owner, whoever the delete runs as (an invoker function runs as
-- the member, a definer one as the owner).
create or replace function public._connector_capture_delete()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_marker text := coalesce(current_setting('techmen.connector_call', true), '');
begin
  if v_marker = '' then return old; end if;
  create temporary table if not exists connector_deleted_rows (marker text, tbl text, row jsonb, at bigint generated always as identity) on commit drop;
  insert into pg_temp.connector_deleted_rows (marker, tbl, row) values (v_marker, tg_table_name, to_jsonb(old));
  return old;
end
$fn$;
revoke all on function public._connector_capture_delete() from public, anon, authenticated, service_role;

create or replace function public._connector_install_capture(p_table text)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare v_oid oid := to_regclass('public.' || quote_ident(p_table));
begin
  if v_oid is null or p_table like 'connector\_%' then return false; end if;
  if (select relkind from pg_class where oid = v_oid) <> 'r' then return false; end if;
  if exists (select 1 from pg_trigger where tgrelid = v_oid and tgname = 'connector_capture_delete') then return true; end if;
  execute format('create trigger connector_capture_delete after delete on public.%I for each row execute function public._connector_capture_delete()', p_table);
  return true;
end
$fn$;
revoke all on function public._connector_install_capture(text) from public, anon, authenticated, service_role;

create or replace function public._connector_log_table_added()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public._connector_install_capture(new.table_name);
  return new;
end
$fn$;
revoke all on function public._connector_log_table_added() from public, anon, authenticated, service_role;

drop trigger if exists connector_log_tables_capture on public.connector_log_tables;
create trigger connector_log_tables_capture after insert on public.connector_log_tables
  for each row execute function public._connector_log_table_added();

-- Every table in public but the connector own is a log table now.
insert into public.connector_log_tables (table_name, note)
select c.relname, 'every table (0021)'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'connector\_%'
   and c.relname ~ '^[a-z_][a-z0-9_]*\Z'
on conflict (table_name) do nothing;

-- And every log table that exists gets its capture (the insert trigger above
-- covers only rows inserted from now on).
do $install$
declare t text;
begin
  for t in select table_name from public.connector_log_tables loop
    perform public._connector_install_capture(t);
  end loop;
end
$install$;

-- Every row this transaction wrote in the log tables, trimmed for the
-- record, and now every row it DELETED there too ("deleted": true).
create or replace function public._connector_rows_written(p_low bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_out jsonb := '[]'::jsonb;
  v_part jsonb;
  v_table text;
  v_oid oid;
  v_marker text := coalesce(current_setting('techmen.connector_call', true), '');
  v_more integer;
begin
  perform public._connector_guard();
  for v_table in select table_name from public.connector_log_tables order by table_name loop
    v_oid := to_regclass('public.' || quote_ident(v_table));
    continue when v_oid is null;
    continue when coalesce(pg_stat_get_xact_tuples_inserted(v_oid), 0)
      + coalesce(pg_stat_get_xact_tuples_updated(v_oid), 0) = 0;
    execute format(
      $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', %L,
        'id', to_jsonb(t) ->> 'id',
        'row', public._connector_trim(to_jsonb(t))
      )), '[]'::jsonb)
      from public.%I t
      cross join lateral (
        select $1 + (
          case when ((t.xmin::text::bigint - ($1 %% 4294967296)) %% 4294967296 + 4294967296) %% 4294967296 >= 2147483648
            then ((t.xmin::text::bigint - ($1 %% 4294967296)) %% 4294967296 + 4294967296) %% 4294967296 - 4294967296
            else ((t.xmin::text::bigint - ($1 %% 4294967296)) %% 4294967296 + 4294967296) %% 4294967296
          end) as full_xid
      ) w
      where case when w.full_xid >= $1
        then pg_xact_status(w.full_xid::text::xid8) = 'in progress'
        else false end
      $q$, v_table, v_table)
    into v_part
    using p_low;
    v_out := v_out || coalesce(v_part, '[]'::jsonb);
  end loop;

  if v_marker <> '' and to_regclass('pg_temp.connector_deleted_rows') is not null then
    for v_table in select distinct tbl from pg_temp.connector_deleted_rows where marker = v_marker order by tbl loop
      select coalesce(jsonb_agg(jsonb_build_object('table', d.tbl, 'id', d.row ->> 'id', 'deleted', true, 'row', public._connector_trim(d.row)) order by d.at), '[]'::jsonb)
        into v_part
        from (select * from pg_temp.connector_deleted_rows where marker = v_marker and tbl = v_table order by at limit 200) d;
      v_out := v_out || v_part;
      select count(*) - 200 into v_more from pg_temp.connector_deleted_rows where marker = v_marker and tbl = v_table;
      if v_more > 0 then
        v_out := v_out || jsonb_build_array(jsonb_build_object('table', v_table, 'deleted', true, 'more', v_more));
      end if;
    end loop;
  end if;
  return v_out;
end;
$fn$;
revoke all on function public._connector_rows_written(bigint) from public, anon, authenticated, service_role;
grant execute on function public._connector_rows_written(bigint) to authenticated;

-- The trimming 0018 did inline, shared by written and deleted rows: long
-- text and large objects shortened, secrets left out.
create or replace function public._connector_trim(p_row jsonb)
returns jsonb language sql immutable set search_path = public as $fn$
  select coalesce(jsonb_object_agg(e.key, case
    when jsonb_typeof(e.value) in ('object', 'array') and octet_length(e.value::text) > 300
      then to_jsonb('[' || jsonb_typeof(e.value) || ', ' || octet_length(e.value::text) || ' bytes]')
    when jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') > 300
      then to_jsonb(left(e.value #>> '{}', 300) || '...')
    else e.value end), '{}'::jsonb)
  from jsonb_each(p_row) e
  where e.key not in ('access_hash', 'refresh_hash', 'parent_token', 'calendar_token', 'token')
$fn$;
revoke all on function public._connector_trim(jsonb) from public, anon, service_role;
grant execute on function public._connector_trim(jsonb) to authenticated;

do $done$
begin
  raise notice '0021: % log tables, % with the delete capture',
    (select count(*) from public.connector_log_tables),
    (select count(*) from pg_trigger where tgname = 'connector_capture_delete');
end
$done$;
