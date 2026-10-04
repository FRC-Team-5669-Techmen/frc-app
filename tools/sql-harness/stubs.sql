-- Supabase stand-ins for the throwaway Postgres harness (tools/sql-harness/).
--
-- NOT a migration and never pasted anywhere real. It recreates, on a bare
-- PostgreSQL 16, just enough of what a Supabase project provides before any
-- file in this repo runs, so the frozen supabase/*.sql files, the numbered
-- migrations and their _rls_test.sql siblings run here unchanged:
--
--   * the three API roles (anon, authenticated, service_role), with
--     service_role bypassing RLS as it does in Supabase;
--   * auth.users and auth.uid() / auth.email() / auth.role() / auth.jwt(),
--     reading the same request.jwt.claim(s) GUCs PostgREST sets, which is
--     what every test's act() helper writes;
--   * the bootstrap ALTER DEFAULT PRIVILEGES that grants anon and
--     authenticated everything on a new public table -- the trap CLAUDE.md
--     names ("a missing policy fails at 0 rows"), reproduced on purpose;
--   * storage.buckets / storage.objects and storage.foldername(), enough for
--     the storage policies jobs_content.sql and feedback.sql create;
--   * pg_net and pg_cron as STUBS: net.http_post records the request in
--     net._requests and sends nothing; cron.schedule records the job in
--     cron.job and runs nothing;
--   * the two tables the Supabase starter created before platform_migration.sql
--     (profiles, attendance_events), with only their starter columns -- every
--     later column is added by the frozen files themselves.
--
-- What it is NOT: PostgREST (no HTTP, no schema cache, no PGRST codes), the
-- real auth service, real pg_net/pg_cron, or Supabase's exact grants on its
-- own schemas. A result here is evidence about the SQL, never about the live
-- project.


do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$roles$;

grant usage on schema public to anon, authenticated, service_role;

-- pgcrypto lives in schema extensions, the Supabase default (0001 relies on it).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ── auth ─────────────────────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$fn$;

create or replace function auth.role() returns text language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$fn$;

create or replace function auth.jwt() returns jsonb language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$fn$;

-- Supabase reads the email claim from the JWT; a test that names only a sub
-- gets the auth.users row's email, which is what the claim would carry.
create or replace function auth.email() returns text language sql stable security definer as $fn$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'),
    (select u.email from auth.users u where u.id = auth.uid())
  )
$fn$;

grant execute on function auth.uid(), auth.role(), auth.jwt(), auth.email()
  to anon, authenticated, service_role;

-- ── storage ──────────────────────────────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  owner      uuid,
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to authenticated, service_role;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $fn$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$fn$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- ── pg_net / pg_cron stubs ───────────────────────────────────────────────────
create schema if not exists net;
create table if not exists net._requests (
  id      bigserial primary key,
  url     text,
  headers jsonb,
  body    jsonb,
  at      timestamptz not null default now()
);
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language plpgsql as $fn$
declare v bigint;
begin
  insert into net._requests (url, headers, body) values (url, headers, body) returning id into v;
  return v;
end
$fn$;
grant usage on schema net to authenticated, service_role;
grant all on net._requests to authenticated, service_role;
grant usage on sequence net._requests_id_seq to authenticated, service_role;

create schema if not exists cron;
create table if not exists cron.job (
  jobid    bigserial primary key,
  jobname  text unique,
  schedule text,
  command  text
);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql as $fn$
declare v bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v;
  return v;
end
$fn$;
create or replace function cron.unschedule(job_name text) returns boolean language plpgsql as $fn$
begin
  delete from cron.job where jobname = job_name;
  return found;
end
$fn$;

-- pg_cron and pg_net count as already installed: a file's
-- `create extension if not exists pg_cron` must be a no-op here, not an
-- error, and a fake extension cannot be registered from SQL alone. So run.mjs
-- rewrites exactly those two create-extension statements to comments before
-- applying a file. It is the only rewrite it makes.

-- ── the Supabase starter's two tables ────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- geofence_exempt: read by the check-in pages, created by NO SQL file in the
-- repo (CLAUDE.md, decision 26). The fixture catalog patches it in by hand for
-- the same reason.
alter table public.profiles add column if not exists geofence_exempt boolean not null default false;

create table if not exists public.attendance_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  type          text not null,
  event_time    timestamptz not null default now(),
  method        text,
  location      text,
  verified      boolean not null default false,
  overridden_by uuid references public.profiles(id),
  constraint attendance_events_user_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);
alter table public.attendance_events enable row level security;

-- Supabase's handle_new_user trigger is created by the frozen files; the
-- starter's version is what platform_migration.sql reconciles with.
