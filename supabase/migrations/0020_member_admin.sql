-- ============================================================
-- 0020_member_admin: set a member real name, and merge a duplicate account
-- into the member real account (ledger 0014)
--
-- Run once in the Supabase SQL editor, AFTER 0019_connector_writes.sql.
-- Re-runnable: the table is create if not exists, every function is create
-- or replace, every policy is dropped and made again.
--
-- WHY. Two students used personal Gmail accounts over the summer, before
-- they had school email; everything they did then has to move to their
-- school accounts. And a roster name typed wrong at sign-up has had no fix
-- but asking the member. Both are admin only, and both are made through
-- Claude (the connector hand entries set_member_name and merge_accounts).
--
-- THE TRAIL. The roster other admin edits (roles, status, delete) write no
-- record in the database of their own; the only record is connector_audit,
-- when they are made through Claude. These two change who a member is, so
-- they leave their own: one member_admin_log row per change, readable by
-- admins only and written only by these functions, with the values before
-- and after. Made through Claude they also get the connector_audit row.
--
-- THE MERGE MOVES EVERY ROW, AND KNOWS EVERY COLUMN. _merge_member_rules()
-- lists every column in the database that names a member (every foreign key
-- to profiles or auth.users, plus the uuid columns named like a member, such
-- as user_id or allowed_member) with what the merge does with it.
-- _member_ref_columns() reads the same set off the catalog, and the merge
-- refuses, changing nothing, while the two differ; the test does too. So a
-- later migration that adds a member column without teaching the merge
-- stops the merge rather than leaving data behind.
--
-- The rules, per column:
--   move     the rows now name the kept account. Where the kept account
--            already has the same row under a unique key (both answered one
--            survey, both said going to one event, both hold one skill), the
--            kept account row stays and the duplicate account row is
--            deleted; rows that hang off it by cascade go with it (a survey
--            response with its answers). Rows with no unique key, attendance,
--            logged hours, hour adjustments, all move: none is lost.
--   roles    member_roles: student and parent move (the kept account gains
--            what it lacked); a staff role (mentor, lead, admin) does not
--            move, because giving one is a separate decision. Every role of
--            the duplicate account is then removed.
--   grants   member_permissions: none moves, for the same reason; all are
--            removed from the duplicate account.
--   drop     the connector sign-in codes, tokens and confirmations of the
--            duplicate account: a credential is never handed to another
--            account, so they are deleted.
--   keep     connector_audit and member_admin_log: logs of what happened,
--            kept as written.
--   refuse   connector_settings.allowed_member: the account the connector
--            acts as is never merged away (change the allowlist first).
--   profile  profiles.id: the profile row of the duplicate account stays,
--            marked inactive, unapproved, its bio noting the merge, its
--            private calendar link replaced; its other fields are cleared.
--            Where the kept profile has no nickname, bio, shirt size,
--            graduation year, picture, sub-teams or disciplines, it takes
--            the duplicate account value. A snapshot of the whole duplicate
--            profile is kept in member_admin_log, so nothing on it is lost.
-- Also: the approved_emails row for the duplicate account email is removed,
-- so signing in with it again does not approve it again. Its auth user is
-- NOT deleted (that is a separate decision).
-- One transaction: it all lands or none of it does. It answers the counts
-- per table, which is what the confirm preview reads to him first.
--
-- TO UNDO: drop function public.admin_merge_member(uuid, uuid, text),
-- public.admin_set_member_name(uuid, text, text), public._merge_member_rules(),
-- public._member_ref_columns(), public._merge_move(regclass, text, uuid, uuid);
-- drop table public.member_admin_log. A merge that already ran is not undone
-- by this; its member_admin_log rows say what moved.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public.attendance_record(text, text, text, text, boolean, text, boolean)') is null then
    raise exception '0020 needs 0019_connector_writes.sql applied first';
  end if;
end
$prereq$;

-- ── the trail ───────────────────────────────────────────────────────────────
-- No foreign key on purpose: the log must outlive a member hard delete and
-- must never block one.
create table if not exists public.member_admin_log (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid,
  actor_id   uuid,
  action     text not null check (action in ('set_name', 'merge_from', 'merge_into')),
  reason     text,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);
create index if not exists member_admin_log_member_idx on public.member_admin_log (member_id, created_at desc);
alter table public.member_admin_log enable row level security;
drop policy if exists "member_admin_log admin read" on public.member_admin_log;
create policy "member_admin_log admin read" on public.member_admin_log for select to authenticated using (public.is_admin());
-- Written only inside the two functions below (SECURITY DEFINER). The project
-- bootstrap grants every new table to anon and authenticated, so take it back.
revoke all on public.member_admin_log from anon;
revoke insert, update, delete, truncate on public.member_admin_log from authenticated;
grant select on public.member_admin_log to authenticated;

-- ── set a member real name ──────────────────────────────────────────────────

-- Does: Set a member real name on the roster, and their nickname if given.
-- Admin only. p_nickname null leaves the nickname alone (it is otherwise the
-- member own); an empty one clears it. Answers the new and the previous
-- values; the previous ones are what undo puts back.
create or replace function public.admin_set_member_name(p_member uuid, p_full_name text, p_nickname text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_old public.profiles;
  v_full text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_nick text;
begin
  if not public.is_admin() then
    raise exception 'Permission denied: admin role required' using errcode = '42501';
  end if;
  if v_full is null then
    raise exception 'Say the full name to set' using errcode = '22023';
  end if;
  select * into v_old from public.profiles where id = p_member for update;
  if not found then
    raise exception 'No member with that id' using errcode = 'P0002';
  end if;
  v_nick := case when p_nickname is null then v_old.nickname else nullif(btrim(p_nickname), '') end;
  update public.profiles set full_name = v_full, nickname = v_nick where id = p_member;
  insert into public.member_admin_log (member_id, actor_id, action, old_value, new_value)
  values (p_member, auth.uid(), 'set_name',
          jsonb_build_object('full_name', v_old.full_name, 'nickname', v_old.nickname),
          jsonb_build_object('full_name', v_full, 'nickname', v_nick));
  return jsonb_strip_nulls(jsonb_build_object(
    'member', p_member,
    'full_name', v_full,
    'nickname', v_nick,
    'nickname_given', p_nickname is not null,
    'previous_full_name', v_old.full_name,
    'previous_nickname', case when p_nickname is null then null else coalesce(v_old.nickname, '') end));
end
$fn$;

-- ── which columns name a member ─────────────────────────────────────────────

-- Every column outside the auth schema that names a member, read off the
-- catalog: a foreign key to profiles or auth.users, or a uuid column in public
-- named like one. Used by admin_merge_member and its test.
create or replace function public._member_ref_columns()
returns table (tbl text, col text) language sql stable security definer set search_path = public as $fn$
  select distinct t.tbl, t.col from (
    select case when n.nspname = 'public' then c.relname::text else n.nspname || '.' || c.relname end as tbl, a.attname::text as col
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
     where k.contype = 'f'
       and k.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
       and n.nspname <> 'auth'
    union
    select c.table_name::text, c.column_name::text
      from information_schema.columns c
      join information_schema.tables t2 on t2.table_schema = c.table_schema and t2.table_name = c.table_name and t2.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.data_type = 'uuid'
       and c.column_name ~ '((^|_)(member|user|student|parent|owner|viewer|captain|driver|rider|actor|mentor|person|account|claimant|signer|recipient)(_id)?|_by|^allowed_member)\Z'
  ) t
$fn$;

-- What the merge does with each of them (see the header). Kept in one place
-- so the merge, its refusal and its test read the same list.
create or replace function public._merge_member_rules()
returns table (tbl text, col text, rule text) language sql immutable set search_path = public as $fn$
  select x.tbl, x.col, x.rule from (values
    ('profiles', 'id', 'profile'),
    ('member_roles', 'member_id', 'roles'),
    ('member_permissions', 'member_id', 'grants'),
    ('member_permissions', 'granted_by', 'move'),
    ('connector_codes', 'user_id', 'drop'),
    ('connector_tokens', 'user_id', 'drop'),
    ('connector_confirmations', 'user_id', 'drop'),
    ('connector_audit', 'user_id', 'keep'),
    ('connector_audit', 'undone_by', 'keep'),
    ('connector_settings', 'allowed_member', 'refuse'),
    ('connector_settings', 'updated_by', 'move'),
    ('member_admin_log', 'member_id', 'keep'),
    ('member_admin_log', 'actor_id', 'keep'),
    ('absence_requests', 'member_id', 'move'),
    ('absence_requests', 'decided_by', 'move'),
    ('access_requests', 'reviewed_by', 'move'),
    ('allowed_domains', 'added_by', 'move'),
    ('approved_emails', 'added_by', 'move'),
    ('attendance_audit', 'member_id', 'move'),
    ('attendance_audit', 'actor_id', 'move'),
    ('attendance_events', 'user_id', 'move'),
    ('attendance_events', 'overridden_by', 'move'),
    ('cert_requests', 'member_id', 'move'),
    ('cert_requests', 'reviewed_by', 'move'),
    ('discipline_records', 'member_id', 'move'),
    ('discipline_records', 'created_by', 'move'),
    ('discipline_records', 'appeal_by', 'move'),
    ('discord_announce_roles', 'created_by', 'move'),
    ('discord_announcements', 'sent_by', 'move'),
    ('driver_documents', 'owner_id', 'move'),
    ('driver_document_views', 'viewer_id', 'move'),
    ('event_attendance', 'member_id', 'move'),
    ('event_attendance', 'marked_by', 'move'),
    ('event_roles', 'member_id', 'move'),
    ('event_roles', 'assigned_by', 'move'),
    ('event_rosters', 'posted_by', 'move'),
    ('event_signup_reminders', 'student_id', 'move'),
    ('event_signup_reminders', 'reminded_by', 'move'),
    ('event_signups', 'member_id', 'move'),
    ('events', 'created_by', 'move'),
    ('feedback', 'member_id', 'move'),
    ('feedback', 'reviewed_by', 'move'),
    ('fll_mentors', 'member_id', 'move'),
    ('grade_checks', 'member_id', 'move'),
    ('grade_checks', 'set_by', 'move'),
    ('guardian_links', 'parent_id', 'move'),
    ('guardian_links', 'student_id', 'move'),
    ('guardian_links', 'created_by', 'move'),
    ('handbook_acknowledgments', 'member_id', 'move'),
    ('handbook_versions', 'published_by', 'move'),
    ('hour_adjustments', 'member_id', 'move'),
    ('hour_adjustments', 'created_by', 'move'),
    ('hour_goals', 'member_id', 'move'),
    ('hour_goals', 'updated_by', 'move'),
    ('hub_cars', 'minor_override_by', 'move'),
    ('hub_days', 'captain_id', 'move'),
    ('hub_events', 'created_by', 'move'),
    ('hub_invites', 'student_id', 'move'),
    ('hub_responses', 'driver_paperwork_by', 'move'),
    ('hub_responses', 'staff_updated_by', 'move'),
    ('hub_seats', 'placed_by', 'move'),
    ('incident_reports', 'member_id', 'move'),
    ('incident_reports', 'reported_by', 'move'),
    ('incident_reports', 'closed_by', 'move'),
    ('letter_contributions', 'member_id', 'move'),
    ('letter_contributions', 'confirmed_by', 'move'),
    ('logged_hours', 'member_id', 'move'),
    ('logged_hours', 'reviewed_by', 'move'),
    ('logged_hours', 'verified_by', 'move'),
    ('logged_hours_corrections', 'member_id', 'move'),
    ('logged_hours_corrections', 'reviewed_by', 'move'),
    ('media_exceptions', 'member_id', 'move'),
    ('media_exceptions', 'set_by', 'move'),
    ('meeting_checkins', 'member_id', 'move'),
    ('member_applications', 'member_id', 'move'),
    ('member_conflicts', 'member_id', 'move'),
    ('member_medical', 'member_id', 'move'),
    ('member_medical', 'updated_by', 'move'),
    ('member_notices', 'member_id', 'move'),
    ('member_notices', 'created_by', 'move'),
    ('member_skills', 'member_id', 'move'),
    ('member_skills', 'certified_by', 'move'),
    ('notice_outbox', 'member_id', 'move'),
    ('notifications_sent', 'member_id', 'move'),
    ('onboarding_items', 'member_id', 'move'),
    ('onboarding_items', 'marked_by', 'move'),
    ('parent_acknowledgments', 'member_id', 'move'),
    ('parent_link_requests', 'parent_id', 'move'),
    ('parent_link_requests', 'student_id', 'move'),
    ('parent_link_requests', 'reviewed_by', 'move'),
    ('position_assignments', 'member_id', 'move'),
    ('position_assignments', 'assigned_by', 'move'),
    ('push_subscriptions', 'member_id', 'move'),
    ('safety_violations', 'member_id', 'move'),
    ('safety_violations', 'logged_by', 'move'),
    ('session_corrections', 'member_id', 'move'),
    ('session_corrections', 'reviewed_by', 'move'),
    ('session_reviews', 'user_id', 'move'),
    ('session_reviews', 'reviewed_by', 'move'),
    ('signout_requests', 'member_id', 'move'),
    ('signout_requests', 'decided_by', 'move'),
    ('standing_months', 'member_id', 'move'),
    ('standing_records', 'member_id', 'move'),
    ('standing_records', 'confirmed_by', 'move'),
    ('standing_settings', 'updated_by', 'move'),
    ('standing_weeks', 'member_id', 'move'),
    ('study_sessions', 'member_id', 'move'),
    ('subteam_status_reports', 'reported_by', 'move'),
    ('surveys', 'created_by', 'move'),
    ('survey_responses', 'member_id', 'move'),
    ('task_claims', 'member_id', 'move'),
    ('task_claims', 'verified_by', 'move'),
    ('task_idea_cert_requirements', 'set_by', 'move'),
    ('task_updates', 'member_id', 'move'),
    ('tasks', 'claimed_by', 'move'),
    ('tasks', 'created_by', 'move'),
    ('tasks', 'verified_by', 'move'),
    ('team_weeks', 'posted_by', 'move')
  ) as x(tbl, col, rule)
$fn$;

-- Move one column from one account to the other. Where the move would
-- duplicate a row the kept account already has under a unique key, the kept
-- row stays and the duplicate account row is deleted. -> moved, kept_into
create or replace function public._merge_move(p_tbl regclass, p_col text, p_from uuid, p_into uuid, out moved integer, out kept_into integer)
language plpgsql set search_path = public as $fn$
declare r record; n integer;
begin
  moved := 0; kept_into := 0;
  execute format('select count(*) from %s where %I = $1', p_tbl, p_col) into n using p_from;
  if n = 0 then return; end if;
  begin
    execute format('update %s set %I = $2 where %I = $1', p_tbl, p_col, p_col) using p_from, p_into;
    get diagnostics moved = row_count;
    return;
  exception when unique_violation then
    moved := 0;
  end;
  for r in execute format('select ctid as t from %s where %I = $1 order by ctid', p_tbl, p_col) using p_from loop
    begin
      execute format('update %s set %I = $2 where ctid = $1', p_tbl, p_col) using r.t, p_into;
      moved := moved + 1;
    exception when unique_violation then
      execute format('delete from %s where ctid = $1', p_tbl) using r.t;
      kept_into := kept_into + 1;
    end;
  end loop;
end
$fn$;

-- ── merge a duplicate account ───────────────────────────────────────────────

-- Does: Merge a duplicate account into the member real account, moving everything it has, with a reason.
-- Admin only. p_from is the duplicate (it keeps no data, is marked inactive
-- and loses its roles; its sign-in is not deleted), p_into the account to
-- keep. Answers the counts per table.
create or replace function public.admin_merge_member(p_from uuid, p_into uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_from public.profiles;
  v_into public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_unknown text;
  r record;
  m record;
  v_tables jsonb := '{}'::jsonb;
  v_moved_roles text[] := '{}';
  v_held_roles text[] := '{}';
  v_staff_roles text[] := '{}';
  v_grants text[] := '{}';
  v_filled text[] := '{}';
  v_creds integer := 0;
  v_self_links integer := 0;
  v_email text;
  v_emails integer := 0;
  v_into_name text;
  v_n integer;
  v_events_trigger boolean;
  v_count_tbl text;
begin
  if not public.is_admin() then
    raise exception 'Permission denied: admin role required' using errcode = '42501';
  end if;
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'Name two different accounts: the duplicate to merge away and the account to keep' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Say why the accounts are being merged' using errcode = '22023';
  end if;
  if p_from = auth.uid() then
    raise exception 'You cannot merge away your own account' using errcode = '42501';
  end if;
  -- Both rows locked, in id order, so two merges cannot cross.
  perform 1 from public.profiles where id in (p_from, p_into) order by id for update;
  select * into v_from from public.profiles where id = p_from;
  if not found then raise exception 'No member with that id to merge away' using errcode = 'P0002'; end if;
  select * into v_into from public.profiles where id = p_into;
  if not found then raise exception 'No member with that id to keep' using errcode = 'P0002'; end if;
  if to_regclass('public.connector_settings') is not null
     and exists (select 1 from public.connector_settings where allowed_member = p_from) then
    raise exception 'That account is the one the connector acts as. Change the connector allowlist first.' using errcode = '42501';
  end if;

  -- Every member column the database has must be one this merge knows.
  select string_agg(d.tbl || '.' || d.col, ', ' order by d.tbl, d.col) into v_unknown
    from public._member_ref_columns() d
   where not exists (select 1 from public._merge_member_rules() x where x.tbl = d.tbl and x.col = d.col);
  if v_unknown is not null then
    raise exception 'The merge does not know what to do with %; nothing was changed. Teach admin_merge_member first.', v_unknown using errcode = 'P0001';
  end if;

  -- Roles: student and parent move, staff roles do not; then the duplicate has none.
  select coalesce(array_agg(role order by role) filter (where role in ('student', 'parent') and not exists (select 1 from public.member_roles i where i.member_id = p_into and i.role = f.role)), '{}'),
         coalesce(array_agg(role order by role) filter (where role in ('student', 'parent') and exists (select 1 from public.member_roles i where i.member_id = p_into and i.role = f.role)), '{}'),
         coalesce(array_agg(role order by role) filter (where role not in ('student', 'parent')), '{}')
    into v_moved_roles, v_held_roles, v_staff_roles
    from public.member_roles f where f.member_id = p_from;
  insert into public.member_roles (member_id, role) select p_into, x from unnest(v_moved_roles) x on conflict do nothing;
  delete from public.member_roles where member_id = p_from;

  -- Capabilities do not move; the duplicate keeps none.
  if to_regclass('public.member_permissions') is not null then
    select coalesce(array_agg(capability order by capability), '{}') into v_grants from public.member_permissions where member_id = p_from;
    delete from public.member_permissions where member_id = p_from;
  end if;

  -- Credentials are deleted, never handed over.
  for r in select x.tbl, x.col from public._merge_member_rules() x where x.rule = 'drop' loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('delete from public.%I where %I = $1', r.tbl, r.col) using p_from;
      get diagnostics v_n = row_count;
      v_creds := v_creds + v_n;
    end if;
  end loop;

  -- Everything else that names a member moves.
  for r in select x.tbl, x.col from public._merge_member_rules() x where x.rule = 'move' order by x.tbl, x.col loop
    if to_regclass('public.' || r.tbl) is null
       or not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col) then
      continue;
    end if;
    -- A change of who added an event is not a schedule change: the
    -- statement trigger that tells every phone the schedule changed is held
    -- off for this one update.
    v_events_trigger := r.tbl = 'events' and exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'trg_events_update' and tgenabled <> 'D');
    if v_events_trigger then
      execute format('select count(*) from public.events where %I = $1', r.col) into v_n using p_from;
      if v_n = 0 then continue; end if;
      execute 'alter table public.events disable trigger trg_events_update';
    end if;
    select * into m from public._merge_move(('public.' || quote_ident(r.tbl))::regclass, r.col, p_from, p_into);
    if v_events_trigger then
      execute 'alter table public.events enable trigger trg_events_update';
    end if;
    if m.moved + m.kept_into > 0 then
      v_tables := jsonb_set(v_tables, array[r.tbl], jsonb_build_object(
        'moved', coalesce((v_tables -> r.tbl ->> 'moved')::integer, 0) + m.moved,
        'kept_into', coalesce((v_tables -> r.tbl ->> 'kept_into')::integer, 0) + m.kept_into));
    end if;
  end loop;

  -- A guardian link of the kept account to itself (one account was the
  -- parent of the other) means nothing.
  if to_regclass('public.guardian_links') is not null then
    delete from public.guardian_links where parent_id = p_into and student_id = p_into;
    get diagnostics v_self_links = row_count;
  end if;

  -- The kept profile takes what it lacked.
  if v_into.nickname is null and v_from.nickname is not null then v_filled := v_filled || 'nickname'::text; end if;
  if v_into.bio is null and v_from.bio is not null then v_filled := v_filled || 'bio'::text; end if;
  if v_into.shirt_size is null and v_from.shirt_size is not null then v_filled := v_filled || 'shirt_size'::text; end if;
  if v_into.grad_year is null and v_from.grad_year is not null then v_filled := v_filled || 'grad_year'::text; end if;
  if v_into.avatar_url is null and v_from.avatar_url is not null then v_filled := v_filled || 'avatar_url'::text; end if;
  if cardinality(v_into.subteams) = 0 and cardinality(v_from.subteams) > 0 then v_filled := v_filled || 'subteams'::text; end if;
  if cardinality(v_into.disciplines) = 0 and cardinality(v_from.disciplines) > 0 then v_filled := v_filled || 'disciplines'::text; end if;
  if v_into.onboarded_at is null and v_from.onboarded_at is not null then v_filled := v_filled || 'onboarded_at'::text; end if;
  update public.profiles p set
    nickname     = coalesce(p.nickname, v_from.nickname),
    bio          = coalesce(p.bio, v_from.bio),
    shirt_size   = coalesce(p.shirt_size, v_from.shirt_size),
    grad_year    = coalesce(p.grad_year, v_from.grad_year),
    avatar_url   = coalesce(p.avatar_url, v_from.avatar_url),
    subteams     = case when cardinality(p.subteams) = 0 then v_from.subteams else p.subteams end,
    disciplines  = case when cardinality(p.disciplines) = 0 then v_from.disciplines else p.disciplines end,
    onboarded_at = coalesce(p.onboarded_at, v_from.onboarded_at)
   where p.id = p_into;

  -- The duplicate keeps its name (so the roster can show who it was) and a
  -- note; nothing else.
  v_into_name := coalesce(nullif(btrim(v_into.full_name), ''), v_into.nickname, p_into::text);
  update public.profiles set
    status = 'inactive',
    approved = false,
    nickname = null,
    bio = left(format('Merged into %s on %s: %s', v_into_name, to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM-DD'), v_reason), 1000),
    shirt_size = null,
    grad_year = null,
    avatar_url = null,
    subteams = '{}',
    disciplines = '{}',
    calendar_token = gen_random_uuid()
   where id = p_from;

  -- Signing in with the duplicate email again must not approve it again.
  select lower(email) into v_email from auth.users where id = p_from;
  if v_email is not null and to_regclass('public.approved_emails') is not null then
    delete from public.approved_emails where lower(email) = v_email;
    get diagnostics v_emails = row_count;
  end if;

  insert into public.member_admin_log (member_id, actor_id, action, reason, old_value, new_value) values
    (p_from, auth.uid(), 'merge_from', v_reason, to_jsonb(v_from), jsonb_build_object('merged_into', p_into, 'tables', v_tables)),
    (p_into, auth.uid(), 'merge_into', v_reason, to_jsonb(v_into), jsonb_build_object('merged_from', p_from, 'tables', v_tables, 'filled', to_jsonb(v_filled)));

  return jsonb_build_object(
    'from', p_from,
    'into', p_into,
    'tables', v_tables,
    'moved_total', (select coalesce(sum((value ->> 'moved')::integer), 0) from jsonb_each(v_tables)),
    'duplicates_removed', (select coalesce(sum((value ->> 'kept_into')::integer), 0) from jsonb_each(v_tables)),
    'roles_moved', to_jsonb(v_moved_roles),
    'roles_already_held', to_jsonb(v_held_roles),
    'staff_roles_not_moved', to_jsonb(v_staff_roles),
    'capabilities_not_moved', to_jsonb(v_grants),
    'profile_filled', to_jsonb(v_filled),
    'credentials_removed', v_creds,
    'self_links_removed', v_self_links,
    'approved_email_removed', v_emails > 0);
end
$fn$;

-- The helpers run only inside the merge and its test.
revoke all on function public._merge_move(regclass, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public._member_ref_columns() from public, anon, authenticated;
revoke all on function public._merge_member_rules() from public, anon, authenticated;
grant execute on function public.admin_set_member_name(uuid, text, text) to authenticated;
grant execute on function public.admin_merge_member(uuid, uuid, text) to authenticated;

do $done$
declare v_unknown text;
begin
  select string_agg(d.tbl || '.' || d.col, ', ') into v_unknown
    from public._member_ref_columns() d
   where not exists (select 1 from public._merge_member_rules() x where x.tbl = d.tbl and x.col = d.col);
  raise notice '0020: set name and merge created; member columns the merge does not know: %', coalesce(v_unknown, 'none');
end
$done$;
