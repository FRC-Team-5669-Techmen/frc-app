-- ============================================================================
-- 0002_feedback_console.sql
-- The feedback console: an optional report type, a "what did you try" field,
-- a build stamp, a six-status triage vocabulary with spam, and two admin RPCs
-- for bulk status changes with an exact undo.
--
-- APPLY BY HAND, ONCE, IN THE SUPABASE SQL EDITOR. Paste the whole file and
-- run it. It is one transaction (begin ... commit) and ends in a self-check
-- that raises -- rolling the whole file back -- if any claim below is false.
-- Re-pasting is safe and lands the same end state.
--
-- Then run supabase/migrations/0002_feedback_console_rls_test.sql in the same
-- editor. It rolls itself back and returns one PASS/FAIL row per check.
--
-- PASTE IT AFTER THE NEW CONSOLE IS LIVE, not before. The console and widget
-- shipped with this file work with or without it (they detect it by error
-- code), but the console deployed BEFORE it reads only 'open' / 'reviewed' /
-- 'dismissed'. The in-place mapping in section 3 turns every 'open' into
-- 'new', so pasted while that older console is still deployed, its default
-- Open view and the avatar-menu badge (which counts status = 'open') read 0
-- until the new client ships. Nothing is lost either way -- every report is
-- still there under "All statuses" -- but an inbox that looks empty is the
-- one failure this console exists to prevent.
--
-- ----------------------------------------------------------------------------
-- WHAT IT ASSUMES IS ALREADY THERE
--   supabase/feedback.sql, applied: the table public.feedback with the CHECK
--   constraints feedback_category_chk and feedback_status_chk under those
--   names, the function public.is_admin(), and the private 'feedback' bucket.
--   The self-check at the top refuses to run if feedback_status_chk is missing
--   rather than adding a second, differently named status check beside whatever
--   is really there.
--
-- WHAT IT CREATES OR CHANGES (all on the EXISTING table -- no parallel table;
-- every report keeps its row, its screenshots and its meaning)
--   1. feedback.category drops NOT NULL. The type is optional. The existing
--      CHECK (bug / idea / feedback) is untouched: a NULL passes a CHECK, and
--      the deployed widget still sends 'feedback' until the new client ships.
--   2. feedback.tried  text  -- what the reporter tried first. Optional prose.
--      feedback.build  text  -- the client build the report was filed from.
--      Both nullable, both capped by a CHECK, both added only if missing.
--   3. The status vocabulary becomes new / seen / in_progress / done /
--      wont_do / spam. The CHECK admits BOTH vocabularies, because the console
--      deployed before this file still writes open / reviewed / dismissed.
--      EVERY EXISTING ROW IS MAPPED IN PLACE, one to one:
--          open -> new,  reviewed -> seen,  dismissed -> wont_do
--      and the column default becomes 'new'. Nothing else on a row changes:
--      reviewed_by and reviewed_at are left exactly as they were. The new
--      client reads either spelling (src/feedbackModel.js normStatus), so a
--      legacy value written after this runs still lands in the right tab.
--   4. public.feedback_set_status(p_ids uuid[], p_status text)
--      Admin only, checked INSIDE the body (is_admin()), so a hand-rolled
--      request from a non-admin is refused by the database. Moves every listed
--      report not already in p_status (under either spelling: a legacy
--      'reviewed' row is already Seen), and RETURNS each changed report's
--      previous status and triage stamp -- the undo's input.
--   5. public.feedback_restore_status(p_items jsonb, p_from text)
--      Admin only, checked inside the body. Puts back exactly what
--      feedback_set_status returned, but ONLY on rows still in p_from (the
--      status the move set), so an undo never overwrites a later change.
--   Both functions: SECURITY DEFINER, search_path pinned, execute revoked from
--   public, anon and authenticated BY NAME and granted back to authenticated.
--   6. A BEFORE INSERT trigger on public.feedback,
--      feedback_member_insert_defaults (function of the same name). A report
--      filed by a client that is NOT an admin is filed New, untriaged and
--      stamped now, whatever the request said:
--          status := 'new', reviewed_by := null, reviewed_at := null,
--          created_at := now()
--      Why: supabase/feedback.sql's "feedback insert own" policy checks only
--      member_id, so before this a student could POST a report that arrived
--      already Done / Spam / In progress, "triaged" by any admin's id, and
--      backdated -- landing outside the New tab and outside every export a
--      round starts from. The policy is left exactly as it is; the trigger
--      rewrites the row before the policy's WITH CHECK sees it.
--      WHO IS CLAMPED: a statement running as the API roles anon or
--      authenticated whose auth.uid() is not an admin. Not clamped: an admin
--      (the "feedback update admin" policy already lets an admin set every one
--      of these columns, so clamping their insert would protect nothing), the
--      service role, and the SQL editor / table owner / any SECURITY DEFINER
--      body -- current_user is none of the API roles there. Plain INVOKER
--      function (is_admin() is already executable by authenticated), search_path
--      pinned, execute revoked from public, anon and authenticated BY NAME
--      (a trigger function is never called directly; firing it checks no
--      EXECUTE privilege).
--      The widget's insert sends none of these four columns, so it lands
--      exactly as it did: the default status, no stamp, created now.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It does not revoke the direct UPDATE policy "feedback update admin". The
--     console deployed today triages with a plain client update, and removing
--     that path before the new client is everywhere would break it. A later
--     migration can narrow it once nothing calls it.
--   * It adds no delete path for anyone. Spam is a status, not a delete.
--   * It does not touch the bucket or its policies.
--
-- ----------------------------------------------------------------------------
-- TO UNDO (in this order; the update must come first, because the old CHECK
-- cannot be put back while a row holds a value it does not admit):
--
--   begin;
--   drop trigger if exists feedback_member_insert_defaults on public.feedback;
--   drop function if exists public.feedback_member_insert_defaults();
--   drop function if exists public.feedback_restore_status(jsonb, text);
--   drop function if exists public.feedback_set_status(uuid[], text);
--   update public.feedback set status = case status
--       when 'new' then 'open' when 'seen' then 'reviewed'
--       when 'wont_do' then 'dismissed' when 'in_progress' then 'reviewed'
--       when 'done' then 'reviewed' when 'spam' then 'dismissed' else status end;
--   alter table public.feedback alter column status set default 'open';
--   alter table public.feedback drop constraint if exists feedback_status_chk;
--   alter table public.feedback add constraint feedback_status_chk
--     check (status in ('open', 'reviewed', 'dismissed'));
--   update public.feedback set category = 'feedback' where category is null;
--   alter table public.feedback alter column category set not null;
--   alter table public.feedback drop constraint if exists feedback_tried_chk,
--     drop constraint if exists feedback_build_chk;
--   alter table public.feedback drop column if exists tried, drop column if exists build;
--   commit;
--
-- Dropping the trigger first puts back the frozen behaviour exactly: a member's
-- insert is again checked on member_id alone.
--
-- The undo is lossy in three places and says so: in_progress / done collapse
-- to 'reviewed' and spam to 'dismissed' (the old vocabulary has nothing finer),
-- an untyped report becomes 'feedback', and dropping the two columns discards
-- what reporters typed into "what did you try". Fold `tried` into `message`
-- first if that text must survive the undo.
-- ============================================================================

begin;

-- ── 0. Refuse to run on a database this file was not written against ────────
do $pre$
begin
  if to_regclass('public.feedback') is null then
    raise exception '0002: public.feedback does not exist -- apply supabase/feedback.sql first.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '0002: public.is_admin() does not exist -- apply supabase/feedback.sql first.';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.feedback'::regclass and conname = 'feedback_status_chk'
  ) then
    raise exception '0002: feedback_status_chk is not on public.feedback. Refusing rather than adding a second, differently named status check beside whatever is really there.';
  end if;
end
$pre$;

-- ── 1. The type is optional ─────────────────────────────────────────────────
-- Dropping NOT NULL is the whole change. feedback_category_chk stays exactly as
-- supabase/feedback.sql wrote it: `category = any (array['bug','idea','feedback'])`
-- evaluates to NULL for a NULL category, and a CHECK only refuses FALSE.
alter table public.feedback alter column category drop not null;

-- ── 2. What they tried, and the build ───────────────────────────────────────
alter table public.feedback add column if not exists tried text;
alter table public.feedback add column if not exists build text;

comment on column public.feedback.tried is
  'What the reporter tried before writing in. Optional prose, 1..4000 characters or null. Mirrored by TRIED_MAX in src/feedbackModel.js. Added by 0002_feedback_console.sql.';
comment on column public.feedback.build is
  'The client build the report was filed from (a short git sha, or dev / unknown). Client-reported, never authoritative. Added by 0002_feedback_console.sql.';

-- Postgres has no `add constraint if not exists`; guard on the catalog so a
-- re-paste does not raise 42710.
do $chk$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.feedback'::regclass and conname = 'feedback_tried_chk'
  ) then
    alter table public.feedback
      add constraint feedback_tried_chk
      check (tried is null or (length(btrim(tried)) > 0 and length(tried) <= 4000));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.feedback'::regclass and conname = 'feedback_build_chk'
  ) then
    alter table public.feedback
      add constraint feedback_build_chk
      check (build is null or length(btrim(build)) between 1 and 64);
  end if;
end
$chk$;

-- ── 3. The status vocabulary ────────────────────────────────────────────────
-- A REPLACEMENT of a constraint that certainly exists (section 0 checked), so
-- drop-if-exists + add is idempotent on its own. The list is mirrored by
-- STORED_STATUSES in src/feedbackModel.js, and tests/feedback-model.test.js
-- fails if the two stop agreeing.
alter table public.feedback drop constraint if exists feedback_status_chk;
alter table public.feedback
  add constraint feedback_status_chk
  check (status in (
    'new', 'seen', 'in_progress', 'done', 'wont_do', 'spam',
    -- The pre-0002 vocabulary. Still written by the console deployed before
    -- this file until the new client ships; never offered by the new one.
    'open', 'reviewed', 'dismissed'
  ));

-- Map every existing row in place. One to one, and reversible (see TO UNDO).
-- On a re-paste this also maps any legacy value the old console wrote since.
update public.feedback
   set status = case status
                  when 'open'      then 'new'
                  when 'reviewed'  then 'seen'
                  when 'dismissed' then 'wont_do'
                end
 where status in ('open', 'reviewed', 'dismissed');

alter table public.feedback alter column status set default 'new';

-- ── 4. feedback_set_status ──────────────────────────────────────────────────
-- THE ADMIN CHECK IS IN THE BODY. SECURITY DEFINER runs as the owner, which
-- bypasses the table's RLS, so the function itself is the boundary: a
-- non-admin who posts to /rest/v1/rpc/feedback_set_status by hand is refused
-- here, by the database, before any row is read.
--
-- Rows already in p_status are not touched (their triage stamp would otherwise
-- be overwritten by a move that changed nothing) and are not returned, so the
-- undo never "restores" a row the move did not change. "Already in p_status"
-- includes the OLD SPELLING of it: a row the pre-0002 console wrote as
-- 'reviewed' after this file ran already reads as Seen, so a move to 'seen'
-- leaves it and its stamp alone. (Restamping it would lose the original
-- reviewer and time, and the console's undo deliberately skips a row whose
-- previous status already read as the target, so nothing would put it back.)
-- The legacy map is the jsonb literal below, mirrored by STATUS_TO_LEGACY in
-- src/feedbackModel.js and pinned by tests/feedback-model.test.js.
--
-- 'new' clears the triage stamp; every other status records who and when.
create or replace function public.feedback_set_status(p_ids uuid[], p_status text)
returns table (
  id                   uuid,
  previous_status      text,
  previous_reviewed_by uuid,
  previous_reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_legacy text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can triage feedback.' using errcode = '42501';
  end if;
  if v_status not in ('new', 'seen', 'in_progress', 'done', 'wont_do', 'spam') then
    raise exception 'Unknown feedback status "%". Use new, seen, in_progress, done, wont_do or spam.', p_status
      using errcode = '22023';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  if cardinality(p_ids) > 2000 then
    raise exception 'At most 2000 reports per move.' using errcode = '22023';
  end if;
  -- NULL for in_progress / done / spam, which have no old spelling.
  v_legacy := '{"new": "open", "seen": "reviewed", "wont_do": "dismissed"}'::jsonb ->> v_status;

  return query
  with prev as (
    select f.id, f.status, f.reviewed_by, f.reviewed_at
      from public.feedback f
     where f.id = any (p_ids)
       and f.status is distinct from v_status
       and f.status is distinct from v_legacy
       for update
  ), moved as (
    update public.feedback f
       set status      = v_status,
           reviewed_by = case when v_status = 'new' then null else auth.uid() end,
           reviewed_at = case when v_status = 'new' then null else now() end
      from prev
     where f.id = prev.id
    returning f.id
  )
  select prev.id, prev.status, prev.reviewed_by, prev.reviewed_at
    from prev
    join moved on moved.id = prev.id;
end
$fn$;

comment on function public.feedback_set_status(uuid[], text) is
  'Moves the listed feedback reports to one status (new, seen, in_progress, done, wont_do, spam). Admin only, checked in the body. Returns each CHANGED report with the status and triage stamp it had before, which feedback_restore_status takes back. Added by 0002_feedback_console.sql.';

revoke all on function public.feedback_set_status(uuid[], text) from public, anon, authenticated;
grant execute on function public.feedback_set_status(uuid[], text) to authenticated;

-- ── 5. feedback_restore_status (the undo) ───────────────────────────────────
-- p_items is feedback_set_status's own result, re-shaped by the client as
-- [{ "id", "status", "reviewed_by", "reviewed_at" }]. Each row goes back to
-- exactly that, but only while it is still in p_from -- the status the move
-- set. A row someone has moved again since is left alone and not returned, so
-- the client can say which reports did not go back.
--
-- The restored status may be a legacy spelling (a row the old console wrote
-- after this migration ran), so the accepted list is the CHECK's whole list;
-- the CHECK itself is still what finally admits or refuses it.
create or replace function public.feedback_restore_status(p_items jsonb, p_from text)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_from text := lower(btrim(coalesce(p_from, '')));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can triage feedback.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Expected an array of reports to restore.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 2000 then
    raise exception 'At most 2000 reports per undo.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where coalesce(e ->> 'status', '') not in (
       'new', 'seen', 'in_progress', 'done', 'wont_do', 'spam', 'open', 'reviewed', 'dismissed')
  ) then
    raise exception 'An undo can only restore a known feedback status.' using errcode = '22023';
  end if;

  return query
  with wanted as (
    select (e ->> 'id')::uuid                          as id,
           e ->> 'status'                              as status,
           nullif(e ->> 'reviewed_by', '')::uuid       as reviewed_by,
           nullif(e ->> 'reviewed_at', '')::timestamptz as reviewed_at
      from jsonb_array_elements(p_items) e
  ), restored as (
    update public.feedback f
       set status      = w.status,
           reviewed_by = w.reviewed_by,
           reviewed_at = w.reviewed_at
      from wanted w
     where f.id = w.id
       and f.status = v_from
    returning f.id, f.status
  )
  select restored.id, restored.status from restored;
end
$fn$;

comment on function public.feedback_restore_status(jsonb, text) is
  'Undo for feedback_set_status: puts each listed report back to the exact status and triage stamp given, but only while it is still in p_from. Admin only, checked in the body. Added by 0002_feedback_console.sql.';

revoke all on function public.feedback_restore_status(jsonb, text) from public, anon, authenticated;
grant execute on function public.feedback_restore_status(jsonb, text) to authenticated;

-- ── 6. A member files New; only an admin triages ────────────────────────────
-- The frozen "feedback insert own" policy checks member_id and nothing else,
-- and since section 3 the status CHECK admits in_progress / done / spam. So a
-- hand-rolled POST from a student could file a report that is already Done,
-- stamped by any admin's id at any time, with a backdated created_at -- and it
-- would never show up under New, which is where the console opens and every
-- feedback round starts. The widget sends none of those columns; this makes
-- the database say the same thing for everyone who is not an admin.
--
-- WHO: current_user is the role the statement runs as. Through the API that is
-- anon or authenticated (PostgREST switches to the JWT's role), so those two
-- are the only roles clamped, and only when auth.uid() is not an admin. The
-- SQL editor (postgres), the service role, a superuser and any SECURITY
-- DEFINER body run as some other role and keep what they set -- which is what
-- lets this file's RLS test seed a triaged row, and a service job import one.
-- (MARK_SEEN.sql and MARK_DONE.sql are UPDATEs; an insert trigger never sees
-- them.) An admin keeps what they set too: "feedback update admin"
-- already lets them write every one of these columns, so a clamp there would
-- only make the insert and the update disagree.
--
-- NOT SECURITY DEFINER, on purpose: it needs no privilege the caller lacks
-- (is_admin() is executable by authenticated and is itself a definer
-- function), and as an invoker current_user still names the caller. A definer
-- trigger would see its owner there and clamp nobody.
--
-- The status is the literal 'new' rather than "the column default": section 3
-- sets the default to 'new' and the self-check below fails the file if the two
-- ever disagree.
create or replace function public.feedback_member_insert_defaults()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    new.status      := 'new';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at  := now();
  end if;
  return new;
end
$fn$;

comment on function public.feedback_member_insert_defaults() is
  'BEFORE INSERT on public.feedback: a report filed through the API by anyone but an admin is filed New, untriaged, created now. Added by 0002_feedback_console.sql.';

-- A trigger function cannot be called directly, and firing one checks no
-- EXECUTE privilege, so nobody needs it. Revoked by name for the same reason
-- every other function here is: the bootstrap default privileges granted it.
revoke all on function public.feedback_member_insert_defaults() from public, anon, authenticated;

-- Replacing a trigger this file itself creates, so drop-if-exists + create is
-- idempotent and names nothing a later migration owns.
drop trigger if exists feedback_member_insert_defaults on public.feedback;
create trigger feedback_member_insert_defaults
  before insert on public.feedback
  for each row execute function public.feedback_member_insert_defaults();

-- ── 7. Self-check: every claim above, read back out of the catalog ──────────
-- Raises, and so rolls the whole file back, if any of them is false.
do $self$
declare
  v_def text;
  v_legacy int;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'feedback'
       and column_name = 'category' and is_nullable = 'NO'
  ) then
    raise exception '0002: feedback.category is still NOT NULL.';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'feedback'
         and column_name in ('tried', 'build')) <> 2 then
    raise exception '0002: feedback.tried / feedback.build are missing.';
  end if;
  if (select count(*) from pg_constraint
       where conrelid = 'public.feedback'::regclass
         and conname in ('feedback_tried_chk', 'feedback_build_chk', 'feedback_status_chk', 'feedback_category_chk')) <> 4 then
    raise exception '0002: expected feedback_tried_chk, feedback_build_chk, feedback_status_chk and feedback_category_chk.';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.feedback'::regclass and conname = 'feedback_status_chk';
  if v_def not like '%in_progress%' or v_def not like '%wont_do%' or v_def not like '%spam%'
     or v_def not like '%reviewed%' or v_def not like '%dismissed%' then
    raise exception '0002: feedback_status_chk does not admit both vocabularies: %', v_def;
  end if;

  select count(*) into v_legacy from public.feedback where status in ('open', 'reviewed', 'dismissed');
  if v_legacy <> 0 then
    raise exception '0002: % report(s) still carry a legacy status after the mapping.', v_legacy;
  end if;

  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'feedback' and column_name = 'status')
     not like '''new''%' then
    raise exception '0002: the status default is not ''new''.';
  end if;

  if not (select prosecdef from pg_proc where oid = 'public.feedback_set_status(uuid[], text)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.feedback_restore_status(jsonb, text)'::regprocedure) then
    raise exception '0002: both feedback RPCs must be SECURITY DEFINER.';
  end if;
  if exists (
    select 1 from pg_proc
     where oid in ('public.feedback_set_status(uuid[], text)'::regprocedure,
                   'public.feedback_restore_status(jsonb, text)'::regprocedure)
       and not coalesce(proconfig, '{}') @> array['search_path=public']
  ) then
    raise exception '0002: both feedback RPCs must pin search_path.';
  end if;

  if has_function_privilege('anon', 'public.feedback_set_status(uuid[], text)', 'execute')
     or has_function_privilege('anon', 'public.feedback_restore_status(jsonb, text)', 'execute') then
    raise exception '0002: anon can execute a feedback RPC.';
  end if;
  if not has_function_privilege('authenticated', 'public.feedback_set_status(uuid[], text)', 'execute')
     or not has_function_privilege('authenticated', 'public.feedback_restore_status(jsonb, text)', 'execute') then
    raise exception '0002: authenticated cannot execute the feedback RPCs; the admin console would be locked out.';
  end if;
  if exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid in ('public.feedback_set_status(uuid[], text)'::regprocedure,
                     'public.feedback_restore_status(jsonb, text)'::regprocedure)
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception '0002: PUBLIC still holds EXECUTE on a feedback RPC.';
  end if;

  if has_table_privilege('authenticated', 'public.feedback', 'DELETE')
     or has_table_privilege('anon', 'public.feedback', 'SELECT') then
    raise exception '0002: feedback.sql''s revokes are not in force (authenticated DELETE or anon SELECT).';
  end if;

  -- Section 6. tgtype bits: 1 ROW, 2 BEFORE, 4 INSERT, 8 DELETE, 16 UPDATE,
  -- 32 TRUNCATE -- so exactly "before insert for each row" is 7 with none of
  -- 8 / 16 / 32. tgenabled 'D' is a disabled trigger, which clamps nothing.
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.feedback'::regclass
       and t.tgname = 'feedback_member_insert_defaults'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
       and t.tgfoid = 'public.feedback_member_insert_defaults()'::regprocedure
       and (t.tgtype & 7) = 7 and (t.tgtype & 56) = 0
  ) then
    raise exception '0002: the BEFORE INSERT trigger feedback_member_insert_defaults is missing, disabled, or not row-level insert-only.';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.feedback_member_insert_defaults()'::regprocedure) then
    raise exception '0002: feedback_member_insert_defaults must NOT be SECURITY DEFINER: as a definer, current_user is its owner and it clamps nobody.';
  end if;
  if not coalesce((select proconfig from pg_proc
                    where oid = 'public.feedback_member_insert_defaults()'::regprocedure), '{}')
         @> array['search_path=public'] then
    raise exception '0002: feedback_member_insert_defaults must pin search_path.';
  end if;
  -- (The trigger's literal 'new' agreeing with the column default is the
  -- status-default check above.)
end
$self$;

commit;

-- After applying, these should read:
--   select status, count(*) from public.feedback group by 1 order by 1;
--     -- only new / seen / wont_do on a first apply; no open / reviewed / dismissed
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'feedback' and column_name in ('category', 'tried', 'build');
--     -- all three YES
