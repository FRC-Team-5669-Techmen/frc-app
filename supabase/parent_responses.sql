-- ============================================================
-- Parent response (supplementary support info from a parent or guardian)
-- Run once in the Supabase SQL editor, BEFORE deploying the UI.
--
-- WHAT THIS IS: a per-application, one-page form a parent fills in from an
-- emailed capability link. It GATES NOTHING. An application is complete without
-- it, no student is blocked by a parent who never answers, and nothing in the
-- app reads it except staff.
--
-- THE THREAT THIS DESIGN EXISTS TO STOP: the student writes their own
-- application row and member_applications has a select-own policy, so if the
-- capability token were readable by the row's owner the student could simply
-- read it and answer the form AS their parent. The token must therefore be
-- invisible to every client -- including the member who owns the row -- and
-- readable only by the service role inside an Edge Function.
--
-- HOW THE COLUMN IS HIDDEN, AND WHY IT IS NOT WHAT calendar_token.sql DOES:
-- effective column privileges in PostgreSQL are the UNION of the column-level
-- ACL and the table-level ACL, so `revoke select (col)` against a role that
-- holds table-level SELECT is a NO-OP. Supabase's bootstrap ALTER DEFAULT
-- PRIVILEGES hands authenticated exactly that table-level grant, and
-- member_applications.sql re-grants it explicitly. Hiding one column therefore
-- requires dropping the table-level SELECT/INSERT and re-granting every OTHER
-- column individually, which is what section 2 does.
--   FLAG: supabase/calendar_token.sql hides profiles.calendar_token with the
--   naive column revoke and is subject to the same no-op. Left alone here --
--   it is a different table with different consumers, and rewriting its grants
--   is its own migration.
--
-- CONSEQUENCE FOR FUTURE COLUMNS: member_applications no longer has a
-- table-level SELECT/INSERT grant for authenticated. A column added later gets
-- NO grant and will be invisible to clients until this file is re-run (it is
-- idempotent and regenerates the list from the live catalog). Re-run it after
-- any ALTER TABLE ... ADD COLUMN on member_applications.
--   `select *` is likewise no longer usable by a client: Postgres expands the
--   star and checks every column, so it errors on parent_token. The two client
--   call sites were changed to the explicit APPLICATION_SELECT list in
--   src/applicationFields.js.
--
-- Depends on: public.member_applications (supabase/member_applications.sql),
--             public.is_staff() (supabase/session_integrity.sql).
-- Mutation test: supabase/parent_responses_rls_test.sql
-- Readers/writers: supabase/functions/send-parent-request (reads the token with
--             the service role and emails the link),
--             supabase/functions/parent-response (the only writer to
--             parent_responses, service role, --no-verify-jwt).
-- ============================================================

-- -- 1. The capability token ---------------------------------------------------
-- The default fills every existing application row, so parents of members who
-- already applied can be emailed without a backfill.
alter table public.member_applications
  add column if not exists parent_token uuid not null default gen_random_uuid();

create unique index if not exists member_applications_parent_token_key
  on public.member_applications (parent_token);

-- -- 2. Keep the token out of every client read AND write ----------------------
-- Read: covered below by dropping the table grant and re-granting every other
--       column. Without this a student reads their own token and answers as
--       their parent -- the whole point of the design.
-- Write: equally load-bearing. The member inserts their own application row, so
--       a client that can INSERT parent_token can CHOOSE it and then know it.
do $lock$
declare
  cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'member_applications'
     and column_name <> 'parent_token';

  if cols is null then
    raise exception 'member_applications not found -- run supabase/member_applications.sql first';
  end if;

  -- Drop the table-level grants. A column-level revoke cannot override these.
  execute 'revoke select, insert on public.member_applications from authenticated';
  execute 'revoke select, insert on public.member_applications from anon';

  -- Re-grant everything EXCEPT parent_token, column by column.
  execute format('grant select (%s) on public.member_applications to authenticated', cols);
  execute format('grant insert (%s) on public.member_applications to authenticated', cols);
end
$lock$;

-- Unchanged from member_applications.sql, re-asserted so this file is a
-- complete statement of the table's grant surface. No update/delete policy
-- exists; corrections route through SECURITY DEFINER functions.
revoke update, delete, truncate on public.member_applications from authenticated;
revoke all on public.member_applications from anon;

-- service_role is untouched by all of the above: it keeps full table grants and
-- bypasses RLS, which is how the two Edge Functions read the token.

-- -- 3. The response table -----------------------------------------------------
-- One row per application. ON DELETE CASCADE: a deleted application takes its
-- parent's answers with it -- there is nothing left to attach them to.
-- The three enumerated answers are NULLABLE by design. Nothing here is
-- required, so "did not answer" has to be storable and must stay distinct from
-- the negative answers ('neither' / 'no'), which mean something different.
create table if not exists public.parent_responses (
  id             uuid        primary key default gen_random_uuid(),
  application_id uuid        not null references public.member_applications(id) on delete cascade,

  weekend_supervision text,          -- saturdays | sundays | either | neither
  meal_support        text,          -- yes | no | maybe
  travel_driving      text,          -- yes | no | maybe

  -- Two SEPARATE facts. Consent is never inferred from a named employer: a
  -- parent may tell us where they work without authorizing a sponsorship ask.
  employer_name            text,
  employer_contact_consent boolean not null default false,

  donation_offer text,

  submitted_at timestamptz not null default now(),
  updated_at   timestamptz,          -- null until the parent overwrites

  constraint parent_responses_application_uniq unique (application_id)
);

do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'parent_responses_weekend_chk' and conrelid = 'public.parent_responses'::regclass) then
    alter table public.parent_responses add constraint parent_responses_weekend_chk
      check (weekend_supervision is null
             or weekend_supervision in ('saturdays', 'sundays', 'either', 'neither'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'parent_responses_meal_chk' and conrelid = 'public.parent_responses'::regclass) then
    alter table public.parent_responses add constraint parent_responses_meal_chk
      check (meal_support is null or meal_support in ('yes', 'no', 'maybe'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'parent_responses_travel_chk' and conrelid = 'public.parent_responses'::regclass) then
    alter table public.parent_responses add constraint parent_responses_travel_chk
      check (travel_driving is null or travel_driving in ('yes', 'no', 'maybe'));
  end if;
end
$ck$;

-- -- 4. RLS ---------------------------------------------------------------------
alter table public.parent_responses enable row level security;

-- Staff read. That is the ENTIRE client surface of this table.
-- A student must not read their own parent's answers: "can your family feed the
-- team / drive to competition / where do you work" is a conversation between
-- the parent and the mentors, and a student reading it would change what the
-- parent is willing to say.
drop policy if exists "parent_responses select staff" on public.parent_responses;
create policy "parent_responses select staff"
  on public.parent_responses for select to authenticated
  using (public.is_staff());

-- NO insert, update, or delete policy for authenticated or anon, deliberately.
-- The parent-response Edge Function holds the service role and is the only
-- writer. It authenticates the parent by capability token, which is not
-- something a row-level policy can express.

-- -- 5. Grants -------------------------------------------------------------------
grant select on public.parent_responses to authenticated;

-- Explicit, for the reason documented in member_applications.sql: Supabase's
-- ALTER DEFAULT PRIVILEGES grants authenticated ALL on new public tables, and a
-- write with no matching policy silently affects 0 rows instead of raising.
revoke insert, update, delete, truncate on public.parent_responses from authenticated;
revoke all on public.parent_responses from anon;
