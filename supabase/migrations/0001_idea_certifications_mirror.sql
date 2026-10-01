-- ============================================================
-- 0001_idea_certifications_mirror.sql
--
-- The RECEIVING END of the IDEA Classroom certifications sync.
--
-- Decided 2026-09-30: certifications are the official IDEA certifications,
-- awarded in IDEA Classroom (ideabosco.com) and ONLY there. This app keeps a
-- READ-ONLY, ONE-WAY copy so every member can see who holds what. Nothing in
-- this file awards, edits or revokes a certification, and no client of this
-- app can write a single row of the mirror. The contract the IDEA side is
-- built against is docs/IDEA_CERTIFICATIONS_SYNC.md; every field name there is
-- authoritative and matches this file.
--
-- It changes nothing the app does today. The old skills / member_skills /
-- cert_requests system is untouched and keeps working beside it.
--
-- ── WHAT IT CREATES ─────────────────────────────────────────────────────────
--   public.idea_cert_catalog      the certification definitions (code PK)
--   public.idea_cert_holders      one row per awarded serial, keyed by the
--                                 holder's lowercased email. A holder need
--                                 not have an account in this app.
--   public.idea_cert_sync_log     one row per accepted OR refused snapshot
--   public.idea_cert_sync_key     one row: the bcrypt hash of the shared secret
--   public.idea_cert_sync(text, jsonb)       the ONLY writer (SECURITY DEFINER)
--   public.idea_cert_reads_all()             RLS helper: full read
--   public.idea_cert_reads_catalog()         RLS helper: catalog read
--   public.idea_cert_guardian_emails()       RLS helper: a parent's linked
--                                            students' sign-in emails
--   the pgcrypto extension in schema extensions, only if it is missing
--
-- ── WHAT IT ASSUMES IS ALREADY THERE ────────────────────────────────────────
--   public.is_staff()            supabase/skills_catalog.sql
--   public.member_roles          platform_migration.sql
--   public.profiles.approved     supabase/domain_roster_gate.sql
--   public.guardian_links        supabase/guardian_links.sql
--   auth.users                   Supabase itself
--   pgcrypto, if present, lives in schema "extensions" (the Supabase default).
--     If it were installed in some other schema, "create extension if not
--     exists" below is a no-op and extensions.crypt() would fail at the first
--     sync; check with: select extnamespace::regnamespace from pg_extension
--     where extname = 'pgcrypto';
--
-- ── HOW TO APPLY ────────────────────────────────────────────────────────────
-- By hand, in the Supabase SQL editor: paste this whole file and run it. It is
-- re-runnable; a second paste changes nothing. Then run the sibling test,
-- supabase/migrations/0001_idea_certifications_mirror_rls_test.sql, which
-- rolls itself back and returns one PASS/FAIL row per check.
--
-- ── AFTERWARDS: SET THE SHARED SECRET (one statement, by hand) ──────────────
-- The secret is never in this file, this repository, or any log. Generate a
-- fresh one on your own machine (64 hex characters is right: bcrypt reads only
-- the first 72 bytes), for example with:  openssl rand -hex 32
-- Paste it in place of <PASTE SECRET> and run this ONE statement:
--
--   insert into public.idea_cert_sync_key (id, secret_hash)
--   values (true, extensions.crypt('<PASTE SECRET>', extensions.gen_salt('bf')))
--   on conflict (id) do update
--     set secret_hash = excluded.secret_hash, set_at = now();
--
-- Then give the SAME value to the IDEA side as its server-only environment
-- variable (see the contract doc). Do not save the statement as a snippet in
-- the SQL editor: the editor keeps the text you ran. Running it again with a
-- new value is how the secret is rotated; the old one stops working at once.
-- Until a key row exists, every sync call is refused.
--
-- ── WHAT UNDOES IT ──────────────────────────────────────────────────────────
-- Nothing deployed before this file reads these objects, so dropping them
-- returns production to its prior state. The mirror's rows are a copy of IDEA
-- Classroom's record and the next sync rebuilds them, so no data is lost.
--
--   drop function if exists public.idea_cert_sync(text, jsonb);
--   drop table if exists public.idea_cert_holders;
--   drop table if exists public.idea_cert_catalog;
--   drop table if exists public.idea_cert_sync_log;
--   drop table if exists public.idea_cert_sync_key;
--   drop function if exists public.idea_cert_reads_all();
--   drop function if exists public.idea_cert_reads_catalog();
--   drop function if exists public.idea_cert_guardian_emails();
--
-- pgcrypto is deliberately NOT dropped: Supabase ships it and other things may
-- use it.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1. idea_cert_catalog ────────────────────────────────────────────────────
-- Replaced wholesale by every sync. synced_at is stamped by this database, not
-- taken from the snapshot, so it always means "when this app last heard".
create table if not exists public.idea_cert_catalog (
  code            text        primary key,
  name            text        not null,
  level           int         not null,
  category        text        not null,
  definition      text,
  allows          text,
  does_not_allow  text,
  prerequisites   text[]      not null default '{}',
  renewal         text,
  active          boolean     not null default true,
  sort_order      int         not null default 0,
  synced_at       timestamptz not null
);

-- ── 2. idea_cert_holders ────────────────────────────────────────────────────
-- Keyed by the serial IDEA Classroom assigns. Matched to a member of this app
-- by lowercased email and by nothing else: there is deliberately no member_id
-- column, because a holder need not have an account here (the certifications
-- are open to any Bosco Tech student) and because an id link would be a second
-- copy of identity that could disagree with the first.
create table if not exists public.idea_cert_holders (
  serial           text        primary key,
  email            text        not null check (email = lower(email)),
  holder_name      text        not null,
  code             text        not null references public.idea_cert_catalog(code),
  status           text        not null check (status in ('active', 'suspended', 'revoked', 'expired')),
  awarded_at       timestamptz not null,
  awarded_by_name  text        not null,
  expires_at       timestamptz,
  synced_at        timestamptz not null
);

create index if not exists idea_cert_holders_email_idx on public.idea_cert_holders (email);
create index if not exists idea_cert_holders_code_idx  on public.idea_cert_holders (code);

-- ── 3. idea_cert_sync_log ───────────────────────────────────────────────────
-- One row per call that got PAST the secret check, accepted (ok = true) or
-- refused for a bad snapshot (ok = false, error says why). A call with a wrong
-- secret leaves NO row, on purpose: the endpoint is reachable by anyone who
-- holds this app's public anon key, so logging those would hand anyone a way to
-- fill this table. On a refusal the two counts are the lengths of the arrays as
-- RECEIVED (null when the key was not an array), not what was stored.
create table if not exists public.idea_cert_sync_log (
  id               bigserial   primary key,
  received_at      timestamptz not null default now(),
  source_revision  text,
  catalog_count    int,
  holder_count     int,
  ok               boolean,
  error            text
);

create index if not exists idea_cert_sync_log_received_idx
  on public.idea_cert_sync_log (received_at desc);

-- ── 4. idea_cert_sync_key ───────────────────────────────────────────────────
-- At most one row (the boolean primary key can only be true). Holds a bcrypt
-- hash, never the secret. RLS on with NO policy, and every privilege revoked
-- below, so no client role can read even the hash.
create table if not exists public.idea_cert_sync_key (
  id           boolean     primary key default true check (id),
  secret_hash  text        not null,
  set_at       timestamptz not null default now()
);

-- ── 5. RLS helpers ──────────────────────────────────────────────────────────
-- "Approved member" is profiles.approved = true, the flag claim_profile() sets
-- (supabase/access_requests.sql). A PARENT is resolved exactly the way the app
-- resolves one -- holds the parent role and is NOT staff -- because the
-- architecture rule is that parent UI gates on (hasRole('parent') && !isStaff).
-- A parent who also holds a staff role is staff here too.

-- Full read of the holder list: staff, or an approved account that is not a
-- parent. A parent-only account deliberately does NOT get this.
create or replace function public.idea_cert_reads_all()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_staff()
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.approved
           and not exists (
             select 1 from public.member_roles r
              where r.member_id = p.id and r.role = 'parent'));
$fn$;

-- Catalog read: any approved account, parents included. The catalog is the
-- definition of each certification and carries no personal data; a parent
-- needs it to put a name to their own student's certifications.
create or replace function public.idea_cert_reads_catalog()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_staff()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved);
$fn$;

-- The sign-in emails of the students linked to the calling parent, lowercased.
-- SECURITY DEFINER because email lives on auth.users, which no client role can
-- read; profiles has no email column. guardian_links rows are written only by
-- staff (link_guardian / approve_parent_link, both is_staff()-gated), so a
-- parent cannot widen this set. The match is only as good as the student's
-- sign-in email agreeing with the email IDEA Classroom records -- see the
-- contract doc.
create or replace function public.idea_cert_guardian_emails()
returns setof text
language sql
stable
security definer
set search_path = public
as $fn$
  select lower(u.email)
    from public.guardian_links g
    join public.profiles p on p.id = g.parent_id and p.approved
    join auth.users u      on u.id = g.student_id
   where g.parent_id = auth.uid()
     and u.email is not null;
$fn$;

-- ── 6. idea_cert_sync(): the only writer ────────────────────────────────────
-- Called by the IDEA Classroom SERVER with this app's anon key and the shared
-- secret in the body. Order of operations, and why:
--   1. The secret. A wrong, empty or missing secret, or no key row at all, is
--      refused with one generic error (SQLSTATE 28000) that does not say which,
--      and nothing is written anywhere.
--   2. Serialize: a transaction-scoped advisory lock, so two overlapping syncs
--      cannot interleave their delete-and-insert.
--   3. Validate the WHOLE snapshot before touching a row. Any problem refuses
--      the whole call: the mirror is left exactly as it was, a log row records
--      the refusal, and the response is {"ok": false, ...} with HTTP 422.
--   4. Replace catalog and holders with the snapshot, write the log row, and
--      return the counts. Full-snapshot semantics: idempotent (the same
--      snapshot twice gives the same rows) and self-healing (a missed call is
--      corrected by the next one).
-- Every relation is schema-qualified so the search_path is never consulted.
create or replace function public.idea_cert_sync(p_secret text, p_snapshot jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  c_cat_keys  constant text[] := array['code', 'name', 'level', 'category', 'definition',
    'allows', 'does_not_allow', 'prerequisites', 'renewal', 'active', 'sort_order'];
  c_hold_keys constant text[] := array['serial', 'email', 'holder_name', 'code', 'status',
    'awarded_at', 'awarded_by_name', 'expires_at'];
  c_statuses  constant text[] := array['active', 'suspended', 'revoked', 'expired'];
  -- An ISO 8601 instant must carry its offset ("Z" or "+hh:mm"); a bare local
  -- time would be read in this database's zone and silently shift by hours.
  c_ts_re     constant text := '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$';
  v_hash      text;
  v_ok        boolean;
  v_problems  text[] := '{}';
  v_revision  text;
  v_catalog   jsonb;
  v_holders   jsonb;
  v_item      jsonb;
  v_idx       int;
  v_missing   text;
  v_txt       text;
  v_num       numeric;
  v_now       timestamptz := now();
  v_n_cat     int;
  v_n_hold    int;
  v_log_id    bigint;
  v_error     text;
begin
  -- 1. The secret ----------------------------------------------------------
  select k.secret_hash into v_hash from public.idea_cert_sync_key k where k.id;
  if v_hash is null then
    -- Spend the same bcrypt work as a real comparison, so "no key configured"
    -- is not distinguishable from "wrong key" by response time.
    perform extensions.crypt(coalesce(p_secret, ''), extensions.gen_salt('bf'));
    v_ok := false;
  else
    v_ok := coalesce(p_secret, '') <> ''
        and extensions.crypt(coalesce(p_secret, ''), v_hash) = v_hash;
  end if;
  if not v_ok then
    raise exception 'idea_cert_sync: refused' using errcode = '28000';
  end if;

  -- 2. Serialize overlapping syncs -----------------------------------------
  perform pg_advisory_xact_lock(hashtextextended('public.idea_cert_sync', 0));

  -- 3. Validate everything before writing anything --------------------------
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    v_problems := v_problems || 'snapshot must be a JSON object'::text;
  else
    if not (p_snapshot ? 'source_revision') then
      v_problems := v_problems || 'source_revision is required (a string, or null)'::text;
    elsif jsonb_typeof(p_snapshot -> 'source_revision') not in ('string', 'null') then
      v_problems := v_problems || 'source_revision must be a string or null'::text;
    else
      v_revision := p_snapshot ->> 'source_revision';
    end if;

    v_catalog := p_snapshot -> 'catalog';
    v_holders := p_snapshot -> 'holders';
    if jsonb_typeof(v_catalog) is distinct from 'array' then
      v_problems := v_problems || 'catalog must be an array'::text;
    end if;
    if jsonb_typeof(v_holders) is distinct from 'array' then
      v_problems := v_problems || 'holders must be an array'::text;
    end if;
  end if;

  -- Catalog entries, one at a time.
  if jsonb_typeof(v_catalog) = 'array' then
    for v_item, v_idx in
      select t.e, (t.i - 1)::int from jsonb_array_elements(v_catalog) with ordinality as t(e, i)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        v_problems := v_problems || format('catalog[%s] must be an object', v_idx);
        continue;
      end if;
      select string_agg(k, ', ') into v_missing
        from unnest(c_cat_keys) as k where not (v_item ? k);
      if v_missing is not null then
        v_problems := v_problems || format('catalog[%s] is missing key(s): %s', v_idx, v_missing);
        continue;
      end if;

      v_txt := case when jsonb_typeof(v_item -> 'code') = 'string' then v_item ->> 'code' end;
      if v_txt is null or v_txt = '' or v_txt <> btrim(v_txt) or length(v_txt) > 64 then
        v_problems := v_problems || format('catalog[%s]: code must be a non-empty string of at most 64 characters with no surrounding spaces', v_idx);
      end if;
      foreach v_missing in array array['name', 'category'] loop
        if jsonb_typeof(v_item -> v_missing) is distinct from 'string' or btrim(v_item ->> v_missing) = '' then
          v_problems := v_problems || format('catalog[%s] (%s): %s must be a non-empty string', v_idx, coalesce(v_txt, '?'), v_missing);
        end if;
      end loop;
      foreach v_missing in array array['level', 'sort_order'] loop
        if jsonb_typeof(v_item -> v_missing) is distinct from 'number' then
          v_problems := v_problems || format('catalog[%s] (%s): %s must be an integer', v_idx, coalesce(v_txt, '?'), v_missing);
        else
          v_num := (v_item ->> v_missing)::numeric;
          if v_num <> trunc(v_num) or v_num not between -2147483648 and 2147483647 then
            v_problems := v_problems || format('catalog[%s] (%s): %s must be an integer', v_idx, coalesce(v_txt, '?'), v_missing);
          end if;
        end if;
      end loop;
      foreach v_missing in array array['definition', 'allows', 'does_not_allow', 'renewal'] loop
        if jsonb_typeof(v_item -> v_missing) not in ('string', 'null') then
          v_problems := v_problems || format('catalog[%s] (%s): %s must be a string or null', v_idx, coalesce(v_txt, '?'), v_missing);
        end if;
      end loop;
      if jsonb_typeof(v_item -> 'active') is distinct from 'boolean' then
        v_problems := v_problems || format('catalog[%s] (%s): active must be true or false', v_idx, coalesce(v_txt, '?'));
      end if;
      if jsonb_typeof(v_item -> 'prerequisites') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements(v_item -> 'prerequisites') p
                     where jsonb_typeof(p) <> 'string') then
        v_problems := v_problems || format('catalog[%s] (%s): prerequisites must be an array of codes', v_idx, coalesce(v_txt, '?'));
      end if;
    end loop;

    -- Set-based checks across the catalog.
    v_problems := v_problems || coalesce((
      select array_agg(format('catalog: code %s appears %s times', d.code, d.n) order by d.code)
        from (select e ->> 'code' as code, count(*) as n
                from jsonb_array_elements(v_catalog) e
               where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'code') = 'string'
               group by 1 having count(*) > 1) d), '{}');
    v_problems := v_problems || coalesce((
      select array_agg(format('catalog (%s): prerequisite %s is not a code in this catalog', e ->> 'code', p.v) order by e ->> 'code', p.v)
        from jsonb_array_elements(v_catalog) e
        cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(e -> 'prerequisites') = 'array' then e -> 'prerequisites' else '[]'::jsonb end) as p(v)
       where jsonb_typeof(e) = 'object'
         and not exists (select 1 from jsonb_array_elements(v_catalog) c
                          where jsonb_typeof(c) = 'object' and c ->> 'code' = p.v)), '{}');
  end if;

  -- Holders, one at a time. An email is never echoed into a problem message:
  -- the log is readable by staff and the serial is enough to find the row.
  if jsonb_typeof(v_holders) = 'array' then
    for v_item, v_idx in
      select t.e, (t.i - 1)::int from jsonb_array_elements(v_holders) with ordinality as t(e, i)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        v_problems := v_problems || format('holders[%s] must be an object', v_idx);
        continue;
      end if;
      select string_agg(k, ', ') into v_missing
        from unnest(c_hold_keys) as k where not (v_item ? k);
      if v_missing is not null then
        v_problems := v_problems || format('holders[%s] is missing key(s): %s', v_idx, v_missing);
        continue;
      end if;

      v_txt := case when jsonb_typeof(v_item -> 'serial') = 'string' then v_item ->> 'serial' end;
      if v_txt is null or v_txt = '' or v_txt <> btrim(v_txt) or length(v_txt) > 128 then
        v_problems := v_problems || format('holders[%s]: serial must be a non-empty string of at most 128 characters with no surrounding spaces', v_idx);
      end if;
      if jsonb_typeof(v_item -> 'email') is distinct from 'string'
         or (v_item ->> 'email') !~ '^[^@\s]+@[^@\s]+$' then
        v_problems := v_problems || format('holders[%s] (%s): email must be a single address with no spaces', v_idx, coalesce(v_txt, '?'));
      elsif (v_item ->> 'email') <> lower(v_item ->> 'email') then
        v_problems := v_problems || format('holders[%s] (%s): email must be lowercase', v_idx, coalesce(v_txt, '?'));
      end if;
      foreach v_missing in array array['holder_name', 'awarded_by_name'] loop
        if jsonb_typeof(v_item -> v_missing) is distinct from 'string' or btrim(v_item ->> v_missing) = '' then
          v_problems := v_problems || format('holders[%s] (%s): %s must be a non-empty string', v_idx, coalesce(v_txt, '?'), v_missing);
        end if;
      end loop;
      if jsonb_typeof(v_item -> 'code') is distinct from 'string' then
        v_problems := v_problems || format('holders[%s] (%s): code must be a string', v_idx, coalesce(v_txt, '?'));
      elsif jsonb_typeof(v_catalog) is distinct from 'array'
         or not exists (select 1 from jsonb_array_elements(v_catalog) c
                         where jsonb_typeof(c) = 'object' and c ->> 'code' = v_item ->> 'code') then
        v_problems := v_problems || format('holders[%s] (%s): code %s is not in this snapshot''s catalog', v_idx, coalesce(v_txt, '?'), v_item ->> 'code');
      end if;
      if jsonb_typeof(v_item -> 'status') is distinct from 'string'
         or not ((v_item ->> 'status') = any (c_statuses)) then
        v_problems := v_problems || format('holders[%s] (%s): status must be one of %s', v_idx, coalesce(v_txt, '?'), array_to_string(c_statuses, ', '));
      end if;
      foreach v_missing in array array['awarded_at', 'expires_at'] loop
        continue when v_missing = 'expires_at' and jsonb_typeof(v_item -> 'expires_at') = 'null';
        if jsonb_typeof(v_item -> v_missing) is distinct from 'string'
           or (v_item ->> v_missing) !~ c_ts_re then
          v_problems := v_problems || format('holders[%s] (%s): %s must be an ISO 8601 timestamp with an offset%s',
            v_idx, coalesce(v_txt, '?'), v_missing, case when v_missing = 'expires_at' then ', or null' else '' end);
        else
          begin
            perform (v_item ->> v_missing)::timestamptz;
          exception when others then
            v_problems := v_problems || format('holders[%s] (%s): %s is not a real date and time', v_idx, coalesce(v_txt, '?'), v_missing);
          end;
        end if;
      end loop;
    end loop;

    v_problems := v_problems || coalesce((
      select array_agg(format('holders: serial %s appears %s times', d.serial, d.n) order by d.serial)
        from (select e ->> 'serial' as serial, count(*) as n
                from jsonb_array_elements(v_holders) e
               where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'serial') = 'string'
               group by 1 having count(*) > 1) d), '{}');
  end if;

  if jsonb_typeof(v_catalog) = 'array' then v_n_cat  := jsonb_array_length(v_catalog); end if;
  if jsonb_typeof(v_holders) = 'array' then v_n_hold := jsonb_array_length(v_holders); end if;

  if cardinality(v_problems) > 0 then
    -- Refused. The mirror is untouched; the refusal is logged so staff can see
    -- in this app why it stopped updating. Only the first 20 problems are
    -- spelled out, the count is always exact.
    v_error := left(format('%s problem(s): %s%s',
                 cardinality(v_problems),
                 array_to_string(v_problems[1:20], '; '),
                 case when cardinality(v_problems) > 20 then '; ...' else '' end), 4000);
    insert into public.idea_cert_sync_log (source_revision, catalog_count, holder_count, ok, error)
    values (v_revision, v_n_cat, v_n_hold, false, v_error)
    returning id into v_log_id;
    -- PostgREST turns this into the HTTP status of an otherwise successful
    -- call, so the log row above is committed AND the caller sees a non-2xx.
    perform set_config('response.status', '422', true);
    return jsonb_build_object('ok', false, 'error', v_error,
                              'problem_count', cardinality(v_problems), 'log_id', v_log_id);
  end if;

  -- 4. Apply: replace the mirror with the snapshot ---------------------------
  -- "where true" rather than no WHERE at all: Supabase loads pg-safeupdate for
  -- API connections, which refuses an unqualified DELETE.
  delete from public.idea_cert_holders where true;
  delete from public.idea_cert_catalog where true;

  insert into public.idea_cert_catalog
    (code, name, level, category, definition, allows, does_not_allow,
     prerequisites, renewal, active, sort_order, synced_at)
  select e ->> 'code',
         e ->> 'name',
         (e ->> 'level')::numeric::int,
         e ->> 'category',
         e ->> 'definition',
         e ->> 'allows',
         e ->> 'does_not_allow',
         array(select jsonb_array_elements_text(e -> 'prerequisites')),
         e ->> 'renewal',
         (e ->> 'active')::boolean,
         (e ->> 'sort_order')::numeric::int,
         v_now
    from jsonb_array_elements(v_catalog) e;

  insert into public.idea_cert_holders
    (serial, email, holder_name, code, status, awarded_at, awarded_by_name, expires_at, synced_at)
  select e ->> 'serial',
         e ->> 'email',
         e ->> 'holder_name',
         e ->> 'code',
         e ->> 'status',
         (e ->> 'awarded_at')::timestamptz,
         e ->> 'awarded_by_name',
         (e ->> 'expires_at')::timestamptz,
         v_now
    from jsonb_array_elements(v_holders) e;

  insert into public.idea_cert_sync_log (source_revision, catalog_count, holder_count, ok, error)
  values (v_revision, v_n_cat, v_n_hold, true, null)
  returning id into v_log_id;

  return jsonb_build_object('ok', true, 'catalog_count', v_n_cat, 'holder_count', v_n_hold,
                            'synced_at', v_now, 'log_id', v_log_id);
end;
$fn$;

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
-- Read policies only. There is NO insert, update or delete policy on any of
-- these tables, for anyone: the mirror is written by idea_cert_sync() alone,
-- which runs as the table owner and so is not subject to these policies.
alter table public.idea_cert_catalog   enable row level security;
alter table public.idea_cert_holders   enable row level security;
alter table public.idea_cert_sync_log  enable row level security;
alter table public.idea_cert_sync_key  enable row level security;

drop policy if exists "idea_cert_catalog read" on public.idea_cert_catalog;
create policy "idea_cert_catalog read"
  on public.idea_cert_catalog for select to authenticated
  using (public.idea_cert_reads_catalog());

-- Staff and approved non-parent members read every holder. A parent reads only
-- the rows whose email is one of their linked students' sign-in emails.
drop policy if exists "idea_cert_holders read" on public.idea_cert_holders;
create policy "idea_cert_holders read"
  on public.idea_cert_holders for select to authenticated
  using (public.idea_cert_reads_all()
         or email in (select public.idea_cert_guardian_emails()));

drop policy if exists "idea_cert_sync_log read staff" on public.idea_cert_sync_log;
create policy "idea_cert_sync_log read staff"
  on public.idea_cert_sync_log for select to authenticated
  using (public.is_staff());

-- idea_cert_sync_key: RLS on and NO policy at all. Unreadable by design.

-- ── 8. Grants ───────────────────────────────────────────────────────────────
-- The project's bootstrap ALTER DEFAULT PRIVILEGES grants anon AND
-- authenticated ALL on every new public table, sequence and function, and on
-- Supabase a bare "revoke ... from public" does not remove those direct
-- grants. So every privilege is revoked from each role BY NAME, then only
-- SELECT is granted back, and only where a policy exists to scope it. A
-- direct write therefore fails LOUDLY with 42501 at the grant layer rather
-- than silently at 0 rows.
revoke all on table public.idea_cert_catalog, public.idea_cert_holders,
                    public.idea_cert_sync_log, public.idea_cert_sync_key
  from public, anon, authenticated;
revoke all on sequence public.idea_cert_sync_log_id_seq from public, anon, authenticated;

grant select on table public.idea_cert_catalog, public.idea_cert_holders,
                      public.idea_cert_sync_log
  to authenticated;

revoke all on function public.idea_cert_reads_all()        from public, anon, authenticated;
revoke all on function public.idea_cert_reads_catalog()    from public, anon, authenticated;
revoke all on function public.idea_cert_guardian_emails()  from public, anon, authenticated;
-- The policies run as the caller, so the caller needs EXECUTE on the helpers.
grant execute on function public.idea_cert_reads_all()       to authenticated;
grant execute on function public.idea_cert_reads_catalog()   to authenticated;
grant execute on function public.idea_cert_guardian_emails() to authenticated;

-- The caller of the sync is the IDEA Classroom server, which holds this app's
-- anon key and the secret and nothing else. The secret is the credential.
revoke all on function public.idea_cert_sync(text, jsonb) from public, anon, authenticated;
grant execute on function public.idea_cert_sync(text, jsonb) to anon, authenticated;
