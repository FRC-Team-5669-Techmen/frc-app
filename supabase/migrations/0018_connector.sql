-- ============================================================
-- 0018_connector -- the Techmen connector (ledger 0013): a remote MCP server
-- at https://frc-app-liard.vercel.app/mcp lets ONE allowlisted admin account
-- do from any Claude chat what that account does in the app by hand, acting
-- as itself. This file is the database half: the sign-in tables the app own
-- OAuth server keeps, the one function every connector write goes through,
-- the audit trail, and the reads and switches /connector uses.
--
-- APPLY: by hand, in the Supabase SQL editor, the whole file at once, AFTER
-- supabase/feedback.sql (it needs public.is_admin() and public.feedback).
-- Then run 0018_connector_rls_test.sql and read its grid. Re-runnable.
-- Then paste docs/connector/allowlist.sql, which names the one account that
-- may connect (looked up by email) and switches the connector on. Until that
-- paste nobody can connect: the switch starts OFF and the allowlist empty.
--
-- WHAT IT CREATES, all new (no existing object is redefined):
--   tables    connector_settings      the switch and the one allowlisted account
--             connector_clients       clients registered through RFC 7591
--             connector_codes         authorization codes (sha256 only)
--             connector_tokens        one row per connection (sha256 only)
--             connector_confirmations confirm tokens for the asks-first level
--             connector_registry      the function names the registry knows
--             connector_log_tables    the tables a write rows are read from
--             connector_audit         one row per connector write, via Claude
--   function  connector_may_connect()                 is the caller the allowlisted admin
--             connector_call(text, text, jsonb, text, text, jsonb)
--             connector_audit_failure(text, text, jsonb, text, text, jsonb)
--             connector_external_begin(text, text, jsonb, text, text, jsonb)
--             connector_external_finish(uuid, jsonb, text)
--             connector_report_gap(text, text)        files a gap to the feedback inbox
--             connector_admin_state()
--             connector_admin_audit(text, date, integer)
--             connector_admin_set_enabled(boolean)
--             connector_admin_disconnect(uuid)
--             connector_admin_disconnect_all()
--   helpers   _connector_marker_ok(), _connector_guard(),
--             _connector_registered(text), _connector_rows_written(bigint),
--             _connector_audit_begin(...), _connector_audit_finish(...)
--
-- WHO THE CONNECTOR ACTS AS. The server turns the bearer token into a Supabase
-- session for the user on the token row and calls connector_call through a
-- client carrying THAT session. connector_call is SECURITY INVOKER, so the
-- function it runs is gated exactly as from the browser: auth.uid(),
-- is_admin(), is_staff(), has_role() and every policy see that user and
-- nobody else. Nothing here grants a permission anybody did not already have.
--
-- WHO MAY USE IT: connector_may_connect() is true only for the account named
-- in connector_settings.allowed_member AND only while that account passes
-- is_admin(). Both halves are re-read on every MCP request; the server revokes
-- the connection when either fails. No identity constant is in this file.
--
-- WHY FOUR PRIVATE HELPERS ARE EXECUTABLE BY authenticated. An invoker function
-- cannot write a table no client role may touch, and the audit row must be
-- written in the SAME transaction as the change it records. So the audit
-- writes and the rows-written read are SECURITY DEFINER helpers, and each one
-- refuses unless (a) connector_may_connect() and (b) it runs inside a
-- connector_call of this transaction (connector_call stamps a
-- transaction-local setting; a direct PostgREST call to a helper is its own
-- transaction, where the setting is empty). The connector tables themselves
-- carry no policy and no client grant at all.
--
-- ANYONE ELSE GETS THE INNER FUNCTION OWN REFUSAL, TEXT FOR TEXT. For a caller
-- who may not connect (signed out included) connector_call runs the inner
-- function exactly as a direct call would; if that raises, the caller reads
-- the same refusal; if it returns, the connector refuses with its own
-- sentence and the transaction rolls back. Nothing lands either way.
--
-- PREVIEW IS A ROLLBACK. p_mode = preview runs the function, reads every row
-- it wrote in the tables named by connector_log_tables, then raises
-- CONNECTOR_PREVIEW: followed by that payload as JSON (SQLSTATE CN001). The
-- raise rolls everything back; the server parses the payload.
--
-- ROWS WRITTEN. A row VISIBLE to this transaction whose xmin is still IN
-- PROGRESS can only have been written by this transaction or one of its
-- subtransactions. So the read widens each 32-bit xmin to its 64-bit id
-- around the id this call started with and keeps rows whose pg_xact_status is
-- in progress. Tables this transaction did not touch are skipped through
-- pg_stat_get_xact_tuples_inserted and _updated. Deleted rows are not
-- reported (they are gone from the view); the audit row still records the
-- call and its result. Ported from the IDEA Website connector (idea-app 0270).
--
-- REPEATS. A request key that starts with derived: is the server own hash of
-- user, tool and arguments: a finished write under the same key in the last
-- 120 seconds is the same request, answered with its stored result and
-- repeated true. Any other key (Claude own request id) is unique for good.
--
-- VERIFICATION (paste after applying):
--   select enabled, allowed_member from public.connector_settings;  -- false, null until the allowlist paste
--   select count(*) from public.connector_log_tables;               -- 30 or more
--   select has_function_privilege('anon', 'public.connector_admin_state()', 'execute'); -- false
--
-- REVERSAL (returns production to its prior state; nothing else uses these):
--   drop function if exists public.connector_admin_disconnect_all(), public.connector_admin_disconnect(uuid),
--     public.connector_admin_set_enabled(boolean), public.connector_admin_audit(text, date, integer),
--     public.connector_admin_state(), public.connector_report_gap(text, text),
--     public.connector_external_finish(uuid, jsonb, text),
--     public.connector_external_begin(text, text, jsonb, text, text, jsonb),
--     public.connector_audit_failure(text, text, jsonb, text, text, jsonb),
--     public.connector_call(text, text, jsonb, text, text, jsonb),
--     public._connector_audit_finish(uuid, jsonb, jsonb),
--     public._connector_audit_begin(text, text, jsonb, text, text, jsonb),
--     public._connector_rows_written(bigint), public._connector_registered(text),
--     public._connector_guard(), public._connector_marker_ok(), public.connector_may_connect();
--   drop table if exists public.connector_audit, public.connector_log_tables, public.connector_registry,
--     public.connector_confirmations, public.connector_tokens, public.connector_codes,
--     public.connector_clients, public.connector_settings;
--   Feedback reports the connector filed stay in public.feedback (route = connector).
-- ============================================================

do $pre$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.feedback') is null then
    raise exception '0018_connector: apply supabase/feedback.sql first (it creates is_admin() and the feedback inbox).';
  end if;
end
$pre$;

-- ── 1. Tables ────────────────────────────────────────────────────────────────

create table if not exists public.connector_settings (
  id             boolean     primary key default true check (id),
  enabled        boolean     not null default false,
  allowed_member uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

create table if not exists public.connector_clients (
  client_id     text        primary key check (char_length(client_id) between 8 and 200),
  client_name   text        not null default 'Unnamed client' check (char_length(client_name) <= 200),
  redirect_uris text[]      not null check (cardinality(redirect_uris) between 1 and 10),
  created_at    timestamptz not null default now()
);

create table if not exists public.connector_codes (
  code_hash      text        primary key check (char_length(code_hash) = 64 and code_hash !~ '[^0-9a-f]'),
  user_id        uuid        not null,
  email          text        not null,
  client_id      text        not null,
  client_name    text,
  redirect_uri   text        not null,
  code_challenge text        not null,
  scope          text        not null default 'app',
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists public.connector_tokens (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null,
  email              text        not null,
  client_id          text        not null,
  label              text        not null default 'Claude',
  scope              text        not null default 'app',
  access_hash        text        not null unique check (char_length(access_hash) = 64 and access_hash !~ '[^0-9a-f]'),
  refresh_hash       text        not null unique check (char_length(refresh_hash) = 64 and refresh_hash !~ '[^0-9a-f]'),
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  rotations          integer     not null default 0,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz,
  revoked_by         text
);
create index if not exists connector_tokens_user_idx on public.connector_tokens (user_id, created_at desc);

create table if not exists public.connector_confirmations (
  token_hash text        primary key check (char_length(token_hash) = 64 and token_hash !~ '[^0-9a-f]'),
  user_id    uuid        not null,
  tool       text        not null,
  args_hash  text        not null,
  preview    jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create table if not exists public.connector_registry (
  function_name text        primary key check (function_name ~ '^[a-z_]' and function_name !~ '[^a-z0-9_]'),
  tool          text        not null,
  level         text        not null check (level in ('read', 'undo', 'confirm')),
  updated_at    timestamptz not null default now()
);

create table if not exists public.connector_log_tables (
  table_name text primary key check (table_name ~ '^[a-z_]' and table_name !~ '[^a-z0-9_]'),
  note       text
);

create table if not exists public.connector_audit (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  email         text        not null,
  tool          text        not null,
  function_name text        not null,
  args          jsonb       not null default '{}'::jsonb,
  request_key   text        unique,
  repeat_key    text,
  group_key     text,
  level         text        not null check (level in ('read', 'undo', 'confirm')),
  status        text        not null check (status in ('running', 'done', 'failed')),
  result        jsonb,
  rows_written  jsonb       not null default '[]'::jsonb,
  error         text,
  undo          jsonb,
  undo_of       uuid        references public.connector_audit (id),
  undone_by     uuid        references public.connector_audit (id),
  token_id      uuid,
  via           text        not null default 'claude' check (via = 'claude'),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists connector_audit_repeat_idx  on public.connector_audit (repeat_key, started_at desc);
create index if not exists connector_audit_user_idx    on public.connector_audit (user_id, started_at desc);
create index if not exists connector_audit_started_idx on public.connector_audit (started_at desc);

-- No policy on any of them and no client grant. The bootstrap default
-- privileges hand every new table to anon and authenticated, so the revoke
-- names the roles. The server reaches them only with the service role, from
-- one file (api/_lib/connector/backend.js).
do $grants$
declare t text;
begin
  foreach t in array array[
    'connector_settings', 'connector_clients', 'connector_codes', 'connector_tokens',
    'connector_confirmations', 'connector_registry', 'connector_log_tables', 'connector_audit'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end
$grants$;

-- The one settings row (switch OFF, nobody allowlisted) and the log tables.
-- Every table any hand entry or app function writes that a person reads
-- back. The server adds more from api/_lib/connector/log-tables.js, insert only.
do $seed$
begin
  insert into public.connector_settings (id, enabled) values (true, false)
  on conflict (id) do nothing;

  insert into public.connector_log_tables (table_name, note) values
    ('attendance_events', 'hours'),
    ('attendance_audit', 'log'),
    ('logged_hours', 'hours'),
    ('logged_hours_corrections', 'hours'),
    ('hour_adjustments', 'hours'),
    ('hour_goals', 'hours'),
    ('session_corrections', 'hours'),
    ('session_reviews', 'hours'),
    ('signout_requests', 'check-in'),
    ('meeting_checkins', 'check-in'),
    ('events', 'schedule'),
    ('event_signups', 'schedule'),
    ('member_roles', 'roster'),
    ('member_permissions', 'roster'),
    ('profiles', 'roster'),
    ('approved_emails', 'roster'),
    ('access_requests', 'roster'),
    ('guardian_links', 'roster'),
    ('feedback', 'feedback'),
    ('tasks', 'jobs'),
    ('task_claims', 'jobs'),
    ('standing_records', 'standing'),
    ('absence_requests', 'standing'),
    ('member_notices', 'standing'),
    ('event_roster', 'rosters'),
    ('event_day_attendance', 'rosters'),
    ('hub_invites', 'event hub'),
    ('hub_seats', 'event hub'),
    ('hub_cars', 'event hub'),
    ('hub_food_claims', 'event hub'),
    ('member_medical', 'records'),
    ('onboarding_items', 'records'),
    ('subteam_status', 'records')
  on conflict (table_name) do nothing;
end
$seed$;

-- ── 2. Who may connect ───────────────────────────────────────────────────────

-- True only for the allowlisted account, and only while it is an admin. Says
-- nothing about anybody but the caller.
create or replace function public.connector_may_connect()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select auth.uid() is not null
     and exists (select 1 from public.connector_settings s where s.id and s.allowed_member = auth.uid())
     and coalesce(public.is_admin(), false);
$fn$;
revoke all on function public.connector_may_connect() from public, anon, authenticated, service_role;
grant execute on function public.connector_may_connect() to anon, authenticated;

-- ── 3. The private helpers ───────────────────────────────────────────────────

create or replace function public._connector_marker_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(current_setting('techmen.connector_call', true), '') <> '';
$fn$;
revoke all on function public._connector_marker_ok() from public, anon, authenticated, service_role;

create or replace function public._connector_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public._connector_marker_ok() then
    raise exception 'This is only reachable through connector_call.' using errcode = '42501';
  end if;
  if not public.connector_may_connect() then
    raise exception 'The Techmen connector is for its one approved account.' using errcode = '42501';
  end if;
end;
$fn$;
revoke all on function public._connector_guard() from public, anon, authenticated, service_role;

create or replace function public._connector_registered(p_function text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_level text;
begin
  perform public._connector_guard();
  select r.level into v_level from public.connector_registry r where r.function_name = p_function;
  if v_level is null then
    raise exception 'The connector does not know "%".', p_function using errcode = '42501';
  end if;
  return v_level;
end;
$fn$;
revoke all on function public._connector_registered(text) from public, anon, authenticated, service_role;
grant execute on function public._connector_registered(text) to authenticated;

-- Every row this transaction wrote in the log tables, trimmed for the record.
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
        'row', (
          select coalesce(jsonb_object_agg(e.key, case
            when jsonb_typeof(e.value) in ('object', 'array') and octet_length(e.value::text) > 300
              then to_jsonb('[' || jsonb_typeof(e.value) || ', ' || octet_length(e.value::text) || ' bytes]')
            when jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') > 300
              then to_jsonb(left(e.value #>> '{}', 300) || '...')
            else e.value end), '{}'::jsonb)
          from jsonb_each(to_jsonb(t)) e
          where e.key not in ('access_hash', 'refresh_hash', 'parent_token', 'calendar_token', 'token')
        )
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
  return v_out;
end;
$fn$;
revoke all on function public._connector_rows_written(bigint) from public, anon, authenticated, service_role;
grant execute on function public._connector_rows_written(bigint) to authenticated;

-- The audit row, written FIRST. Answers {audit_id} or, for a repeat,
-- {repeated: true, audit_id, result, rows}.
create or replace function public._connector_audit_begin(
  p_tool text, p_function text, p_args jsonb, p_request_key text, p_level text, p_meta jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_email text := coalesce((select u.email from auth.users u where u.id = auth.uid()), '');
  v_key text := btrim(coalesce(p_request_key, ''));
  v_prior public.connector_audit;
  v_id uuid;
  v_undo_of uuid;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  perform public._connector_guard();
  if v_key = '' or char_length(v_key) > 300 then
    raise exception 'A connector write needs a request key.';
  end if;

  if v_key like 'derived:%' then
    perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
    select * into v_prior from public.connector_audit a
     where a.repeat_key = v_key and a.user_id = v_uid and a.status = 'done'
       and a.started_at > now() - interval '120 seconds'
     order by a.started_at desc limit 1;
    if v_prior.id is not null then
      return jsonb_build_object('repeated', true, 'audit_id', v_prior.id, 'result', v_prior.result, 'rows', v_prior.rows_written);
    end if;
  else
    select * into v_prior from public.connector_audit a where a.request_key = v_key;
    if v_prior.id is not null then
      if v_prior.user_id <> v_uid or v_prior.function_name <> p_function
         or v_prior.args is distinct from coalesce(p_args, '{}'::jsonb) then
        raise exception 'That request id was already used for a different request.';
      end if;
      return jsonb_build_object('repeated', true, 'audit_id', v_prior.id, 'result', v_prior.result, 'rows', v_prior.rows_written);
    end if;
  end if;

  if nullif(v_meta ->> 'undo_of', '') is not null then
    v_undo_of := (v_meta ->> 'undo_of')::uuid;
  end if;

  insert into public.connector_audit
    (user_id, email, tool, function_name, args, request_key, repeat_key, group_key, level, status, undo_of, token_id)
  values
    (v_uid, v_email, p_tool, p_function, coalesce(p_args, '{}'::jsonb),
     case when v_key like 'derived:%' then v_key || ':' || gen_random_uuid()::text else v_key end,
     case when v_key like 'derived:%' then v_key else null end,
     nullif(v_meta ->> 'group_key', ''),
     p_level, 'running', v_undo_of,
     case when nullif(v_meta ->> 'token_id', '') is null then null else (v_meta ->> 'token_id')::uuid end)
  on conflict (request_key) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_prior from public.connector_audit a where a.request_key = v_key;
    return jsonb_build_object('repeated', true, 'audit_id', v_prior.id, 'result', v_prior.result, 'rows', v_prior.rows_written);
  end if;

  if v_undo_of is not null then
    update public.connector_audit a set undone_by = v_id
     where a.id = v_undo_of and a.user_id = v_uid and a.undone_by is null and a.status = 'done';
    if not found then
      raise exception 'That change was already undone, or it is not one of yours.';
    end if;
  end if;

  return jsonb_build_object('audit_id', v_id);
end;
$fn$;

-- The connector_call path additionally requires the transaction marker.
create or replace function public._connector_audit_finish(p_id uuid, p_result jsonb, p_rows jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  perform public._connector_guard();
  update public.connector_audit a
     set status = 'done', result = p_result, rows_written = coalesce(p_rows, '[]'::jsonb), finished_at = now()
   where a.id = p_id and a.user_id = auth.uid() and a.status = 'running';
  if not found then
    raise exception 'That connector audit row is not open.';
  end if;
end;
$fn$;
revoke all on function public._connector_audit_finish(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public._connector_audit_finish(uuid, jsonb, jsonb) to authenticated;

-- _connector_audit_begin is reached two ways: inside connector_call and
-- inside connector_external_begin, each of which sets the marker first. A
-- direct PostgREST call to it is refused by _connector_guard.
revoke all on function public._connector_audit_begin(text, text, jsonb, text, text, jsonb) from public, anon, authenticated, service_role;

-- ── 4. connector_call: the one function every connector write goes through ──

create or replace function public.connector_call(
  p_tool text,
  p_function text,
  p_args jsonb,
  p_request_key text,
  p_mode text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $fn$
declare
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_proc record;
  v_chosen oid;
  v_count integer := 0;
  v_names text[];
  v_types oid[];
  v_required integer;
  v_key text;
  v_parts text[] := array[]::text[];
  v_i integer;
  v_type text;
  v_expr text;
  v_call text;
  v_sql text;
  v_retset boolean;
  v_void boolean;
  v_result jsonb;
  v_level text;
  v_begin jsonb;
  v_audit uuid;
  v_low bigint;
  v_rows jsonb;
begin
  if p_mode is null or p_mode not in ('preview', 'commit') then
    raise exception 'p_mode must be preview or commit.';
  end if;
  if p_function is null or p_function !~ '^[a-z_]' or p_function ~ '[^a-z0-9_]' then
    raise exception 'That is not a function name.';
  end if;
  if jsonb_typeof(v_args) is distinct from 'object' then
    raise exception 'p_args must be a JSON object.';
  end if;

  -- THE CALL, BUILT FROM pg_proc. The overload is the one whose input
  -- arguments cover every key passed and whose required arguments are all
  -- passed; exactly one must qualify. Names go through %I and values never
  -- touch the SQL text: each is read from the parameter and cast to the
  -- declared type.
  for v_proc in
    select p.oid, p.pronargs, p.pronargdefaults, p.proargnames, p.proargmodes
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = p_function and p.prokind = 'f'
  loop
    v_names := array[]::text[];
    if v_proc.proargmodes is null then
      v_names := coalesce(v_proc.proargnames[1:v_proc.pronargs], array[]::text[]);
    else
      select coalesce(array_agg(nm order by ord), array[]::text[]) into v_names
        from unnest(v_proc.proargnames, v_proc.proargmodes) with ordinality as u(nm, md, ord)
       where md in ('i', 'b', 'v');
    end if;
    continue when cardinality(v_names) <> v_proc.pronargs;
    v_required := v_proc.pronargs - v_proc.pronargdefaults;
    continue when exists (select 1 from jsonb_object_keys(v_args) k where not (k = any (v_names)));
    continue when exists (
      select 1 from generate_subscripts(v_names, 1) i
       where i <= v_required and not (v_args ? v_names[i])
    );
    v_count := v_count + 1;
    v_chosen := v_proc.oid;
  end loop;
  if v_count = 0 then
    raise exception 'No form of "%" takes exactly those arguments.', p_function;
  elsif v_count > 1 then
    raise exception 'More than one form of "%" takes those arguments.', p_function;
  end if;

  select p.proretset, p.prorettype = 'pg_catalog.void'::regtype into v_retset, v_void
    from pg_catalog.pg_proc p where p.oid = v_chosen;
  -- proargtypes is an oidvector, which is ZERO-based; rebase it.
  select array(select unnest(p.proargtypes::oid[])) into v_types from pg_catalog.pg_proc p where p.oid = v_chosen;
  select case when p.proargmodes is null then p.proargnames[1:p.pronargs]
              else (select array_agg(nm order by ord)
                      from unnest(p.proargnames, p.proargmodes) with ordinality as u(nm, md, ord)
                     where md in ('i', 'b', 'v')) end
    into v_names
    from pg_catalog.pg_proc p where p.oid = v_chosen;

  for v_i in 1 .. coalesce(cardinality(v_names), 0) loop
    v_key := v_names[v_i];
    continue when not (v_args ? v_key);
    v_type := pg_catalog.format_type(v_types[v_i], null);
    if v_type in ('jsonb', 'json') then
      v_expr := format('nullif($1 -> %L, ''null''::jsonb)::%s', v_key, v_type);
    elsif v_type like '%[]' then
      v_expr := format(
        '(case when jsonb_typeof($1 -> %L) = ''array'' then array(select jsonb_array_elements_text($1 -> %L)) end)::%s',
        v_key, v_key, v_type);
    else
      v_expr := format('($1 ->> %L)::%s', v_key, v_type);
    end if;
    v_parts := v_parts || format('%I => %s', v_key, v_expr);
  end loop;
  v_call := format('public.%I(%s)', p_function, array_to_string(v_parts, ', '));
  if v_retset then
    v_sql := format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from %s r', v_call);
  elsif v_void then
    v_sql := format('select null::jsonb from (select %s) v', v_call);
  else
    v_sql := format('select to_jsonb(%s)', v_call);
  end if;

  -- A CALLER WHO MAY NOT CONNECT reads the inner function own answer: its
  -- refusal if it refuses, and the connector refusal if it would have worked.
  if not coalesce(public.connector_may_connect(), false) then
    execute v_sql into v_result using v_args;
    raise exception 'The Techmen connector is for its one approved account.' using errcode = '42501';
  end if;

  perform set_config('techmen.connector_call', gen_random_uuid()::text, true);
  v_level := public._connector_registered(p_function);
  v_low := pg_current_xact_id()::text::bigint;

  if p_mode = 'preview' then
    execute v_sql into v_result using v_args;
    v_rows := public._connector_rows_written(v_low);
    raise exception using
      errcode = 'CN001',
      message = 'CONNECTOR_PREVIEW:' || jsonb_build_object('result', v_result, 'rows', v_rows, 'level', v_level)::text;
  end if;

  v_begin := public._connector_audit_begin(p_tool, p_function, v_args, p_request_key, v_level, p_meta);
  v_audit := (v_begin ->> 'audit_id')::uuid;
  if coalesce((v_begin ->> 'repeated')::boolean, false) then
    perform set_config('techmen.connector_call', '', true);
    return jsonb_build_object('repeated', true, 'audit_id', v_audit,
      'result', v_begin -> 'result', 'rows', coalesce(v_begin -> 'rows', '[]'::jsonb), 'level', v_level);
  end if;

  execute v_sql into v_result using v_args;
  v_rows := public._connector_rows_written(v_low);
  perform public._connector_audit_finish(v_audit, v_result, v_rows);
  perform set_config('techmen.connector_call', '', true);
  return jsonb_build_object('repeated', false, 'audit_id', v_audit, 'result', v_result, 'rows', v_rows, 'level', v_level);
end;
$fn$;
revoke all on function public.connector_call(text, text, jsonb, text, text, jsonb) from public, anon, authenticated, service_role;
-- anon as well as authenticated, deliberately: a signed-out call then reads
-- the inner function own refusal, text for text (see the header).
grant execute on function public.connector_call(text, text, jsonb, text, text, jsonb) to anon, authenticated;

-- connector_call is invoker, so it reaches _connector_audit_begin only with
-- an execute grant on it. The grant is safe because begin runs
-- _connector_guard(): the account check and the transaction marker.
grant execute on function public._connector_audit_begin(text, text, jsonb, text, text, jsonb) to authenticated;

-- A failed write, recorded on its own statement after the failure rolled the
-- write and its audit row back.
create or replace function public.connector_audit_failure(
  p_tool text, p_function text, p_args jsonb, p_request_key text, p_error text, p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_id uuid; v_level text;
begin
  if not public.connector_may_connect() then
    raise exception 'The Techmen connector is for its one approved account.' using errcode = '42501';
  end if;
  select r.level into v_level from public.connector_registry r where r.function_name = p_function;
  insert into public.connector_audit
    (user_id, email, tool, function_name, args, request_key, repeat_key, group_key, level, status, error, token_id, finished_at)
  values
    (auth.uid(), coalesce((select u.email from auth.users u where u.id = auth.uid()), ''),
     coalesce(p_tool, 'unknown'), coalesce(p_function, 'unknown'), coalesce(p_args, '{}'::jsonb), null,
     nullif(btrim(coalesce(p_request_key, '')), ''),
     nullif(coalesce(p_meta, '{}'::jsonb) ->> 'group_key', ''),
     coalesce(v_level, 'confirm'), 'failed', left(coalesce(p_error, 'Unknown error.'), 2000),
     case when nullif(coalesce(p_meta, '{}'::jsonb) ->> 'token_id', '') is null then null else (p_meta ->> 'token_id')::uuid end,
     now())
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.connector_audit_failure(text, text, jsonb, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.connector_audit_failure(text, text, jsonb, text, text, jsonb) to authenticated;

-- ── 5. Calls the database cannot hold in one transaction (an Edge Function) ──
-- The server writes the audit row before it calls and finishes it after. The
-- same repeat protection applies (the request key).
create or replace function public.connector_external_begin(
  p_tool text, p_target text, p_args jsonb, p_request_key text, p_level text, p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v jsonb;
begin
  if not public.connector_may_connect() then
    raise exception 'The Techmen connector is for its one approved account.' using errcode = '42501';
  end if;
  if p_target is null or p_target !~ '^edge:[a-z0-9-]+\Z' then
    raise exception 'That is not an app service name.';
  end if;
  if p_level not in ('read', 'undo', 'confirm') then
    raise exception 'Unknown level.';
  end if;
  -- The marker is what lets _connector_audit_begin run; it is set for this
  -- one call and cleared again, in this request own transaction.
  perform set_config('techmen.connector_call', gen_random_uuid()::text, true);
  v := public._connector_audit_begin(p_tool, p_target, p_args, p_request_key, p_level, p_meta);
  perform set_config('techmen.connector_call', '', true);
  return v;
end;
$fn$;
revoke all on function public.connector_external_begin(text, text, jsonb, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.connector_external_begin(text, text, jsonb, text, text, jsonb) to authenticated;

create or replace function public.connector_external_finish(p_id uuid, p_result jsonb, p_error text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not public.connector_may_connect() then
    raise exception 'The Techmen connector is for its one approved account.' using errcode = '42501';
  end if;
  update public.connector_audit a
     set status = case when p_error is null then 'done' else 'failed' end,
         result = p_result, error = left(p_error, 2000), finished_at = now()
   where a.id = p_id and a.user_id = auth.uid() and a.status = 'running' and a.function_name like 'edge:%';
  if not found then
    raise exception 'That connector audit row is not open.';
  end if;
end;
$fn$;
revoke all on function public.connector_external_finish(uuid, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.connector_external_finish(uuid, jsonb, text) to authenticated;

-- ── 6. Gaps go to the feedback inbox ─────────────────────────────────────────
-- SECURITY INVOKER: the report lands through the inbox own insert policy
-- (member_id = auth.uid()), exactly as the in-app widget files one. route is
-- connector, which is how the inbox tells these apart.
create or replace function public.connector_report_gap(p_said text, p_missing text)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $fn$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_missing, '')), '') is null then
    raise exception 'Say what the app could not do.' using errcode = '22023';
  end if;
  insert into public.feedback (member_id, category, message, image_paths, route, viewport, user_agent)
  values (auth.uid(), 'idea',
          left('Connector gap: ' || btrim(p_missing)
               || case when nullif(btrim(coalesce(p_said, '')), '') is null then ''
                       else E'\n\nHe asked: ' || btrim(p_said) end, 4000),
          '[]'::jsonb, 'connector', null, 'Techmen connector (via Claude)')
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.connector_report_gap(text, text) from public, anon, authenticated, service_role;
grant execute on function public.connector_report_gap(text, text) to authenticated;

-- ── 7. The admin page: reads and switches, each refusing a non-admin ─────────

create or replace function public.connector_admin_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare s public.connector_settings;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  select * into s from public.connector_settings where id;
  return jsonb_build_object(
    'enabled', coalesce(s.enabled, false),
    'updated_at', s.updated_at,
    'allowed', s.allowed_member is not null,
    'allowed_is_me', s.allowed_member is not null and s.allowed_member = auth.uid(),
    'allowed_name', (select coalesce(nullif(p.nickname, ''), p.full_name) from public.profiles p where p.id = s.allowed_member),
    'may_connect', public.connector_may_connect(),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'email', t.email, 'label', t.label, 'client_id', t.client_id,
        'created_at', t.created_at, 'last_used_at', t.last_used_at,
        'refresh_expires_at', t.refresh_expires_at, 'rotations', t.rotations,
        'revoked_at', t.revoked_at, 'revoked_by', t.revoked_by
      ) order by t.revoked_at is not null, coalesce(t.last_used_at, t.created_at) desc)
      from (select * from public.connector_tokens order by created_at desc limit 100) t
    ), '[]'::jsonb)
  );
end;
$fn$;
revoke all on function public.connector_admin_state() from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_state() to authenticated;

create or replace function public.connector_admin_audit(p_tool text default null, p_day date default null, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(a) - 'request_key' - 'repeat_key' order by a.started_at desc)
      from (
        select x.* from public.connector_audit x
         where (p_tool is null or x.tool = p_tool)
           and (p_day is null or (x.started_at at time zone 'America/Los_Angeles')::date = p_day)
         order by x.started_at desc
         limit greatest(1, least(coalesce(p_limit, 200), 200))
      ) a
  ), '[]'::jsonb);
end;
$fn$;
revoke all on function public.connector_admin_audit(text, date, integer) from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_audit(text, date, integer) to authenticated;

create or replace function public.connector_admin_set_enabled(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Say on or off.';
  end if;
  insert into public.connector_settings (id, enabled, updated_at, updated_by)
  values (true, p_enabled, now(), auth.uid())
  on conflict (id) do update set enabled = excluded.enabled, updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('ok', true, 'enabled', p_enabled);
end;
$fn$;
revoke all on function public.connector_admin_set_enabled(boolean) from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_set_enabled(boolean) to authenticated;

create or replace function public.connector_admin_disconnect(p_token_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  update public.connector_tokens t
     set revoked_at = now(), revoked_by = coalesce((select u.email from auth.users u where u.id = auth.uid()), 'admin')
   where t.id = p_token_id and t.revoked_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'token_id', p_token_id);
end;
$fn$;
revoke all on function public.connector_admin_disconnect(uuid) from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_disconnect(uuid) to authenticated;

create or replace function public.connector_admin_disconnect_all()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  update public.connector_tokens t
     set revoked_at = now(), revoked_by = coalesce((select u.email from auth.users u where u.id = auth.uid()), 'admin')
   where t.revoked_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'disconnected', v_count);
end;
$fn$;
revoke all on function public.connector_admin_disconnect_all() from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_disconnect_all() to authenticated;

-- ── 8. Self-check: the grants are what the header says ───────────────────────
do $check$
declare
  v_bad text[] := array[]::text[];
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'connector\_%' or p.proname like '\_connector\_%')
  loop
    if has_function_privilege('anon', r.sig, 'execute') and r.proname not in ('connector_call', 'connector_may_connect') then
      v_bad := array_append(v_bad, r.sig || ' is executable by anon');
    end if;
    if r.proname in ('_connector_marker_ok', '_connector_guard')
       and has_function_privilege('authenticated', r.sig, 'execute') then
      v_bad := array_append(v_bad, r.sig || ' is executable by authenticated');
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'connector_call') <> 1 then
    v_bad := array_append(v_bad, 'connector_call has more than one form');
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('connector_call', 'connector_report_gap') and p.prosecdef) then
    v_bad := array_append(v_bad, 'connector_call and connector_report_gap must be SECURITY INVOKER');
  end if;
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'connector\_%'
  loop
    if has_table_privilege('anon', 'public.' || r.relname, 'select,insert,update,delete,truncate,references,trigger')
       or has_table_privilege('authenticated', 'public.' || r.relname, 'select,insert,update,delete,truncate,references,trigger') then
      v_bad := array_append(v_bad, r.relname || ' carries a client grant');
    end if;
    if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.relname) then
      v_bad := array_append(v_bad, r.relname || ' carries a policy');
    end if;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception '0018 refused: %', array_to_string(v_bad, '; ');
  end if;
  raise notice '0018: connector tables and functions created; % log tables listed; allowlisted: %.',
    (select count(*) from public.connector_log_tables),
    (select allowed_member is not null from public.connector_settings where id);
end
$check$;
