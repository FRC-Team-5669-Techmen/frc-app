-- ============================================================
-- Admin roster & member management
-- Run once in the Supabase SQL editor, BEFORE testing the UI.
--
-- Adds:
--   1. admin_set_member_role()  — reliable role grant/revoke (fixes role edits
--      that didn't persist when done as a direct client write).
--   2. admin_delete_member()    — hard-delete a member: removes the auth user
--      and every owned row, nulling actor references so nothing orphans.
--   3. admin_get_members()      — now also returns nickname for the roster.
-- ============================================================

-- ── 0. Make sure 'parent' is a legal role (idempotent) ──────────────────────
-- The role write path below inserts whatever role the admin picks; the CHECK
-- must allow all five. (Re-asserts what access_requests.sql already set.)
alter table public.member_roles drop constraint if exists member_roles_role_check;
alter table public.member_roles drop constraint if exists member_roles_role_chk;
alter table public.member_roles
  add constraint member_roles_role_chk
  check (role in ('student', 'mentor', 'lead', 'admin', 'parent'));

-- ── 1. admin_set_member_role(): grant or revoke one role ────────────────────
-- Why an RPC: a direct client delete on member_roles silently affects 0 rows
-- when the row-level write policy doesn't match the caller (no error is raised),
-- so a role change appeared to work in the UI but never persisted. Routing the
-- write through a SECURITY DEFINER function that enforces admin itself makes the
-- write deterministic and surfaces a real error when the caller isn't an admin.
create or replace function public.admin_set_member_role(
  p_member uuid,
  p_role   text,
  p_grant  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_role('admin') then
    raise exception 'Permission denied: admin role required';
  end if;
  if p_role not in ('student', 'mentor', 'lead', 'admin', 'parent') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_grant then
    insert into public.member_roles (member_id, role)
    values (p_member, p_role)
    on conflict (member_id, role) do nothing;
  else
    delete from public.member_roles where member_id = p_member and role = p_role;
  end if;
end;
$fn$;

grant execute on function public.admin_set_member_role(uuid, text, boolean) to authenticated;

-- ── 2. admin_delete_member(): hard delete + cascade clean ───────────────────
-- Deletes the profile (every member-owned table references profiles(id) ON
-- DELETE CASCADE, so attendance, hours, skills, task claims, signups, study,
-- push subs, guardian links, position assignments and roles all go with it)
-- and then the auth user (session_reviews + the auth.* tables cascade from
-- there). Columns that merely *reference* the member as an actor (reviewer,
-- creator, certifier, …) are nulled first so their owning rows survive and no
-- FK blocks the delete.
create or replace function public.admin_delete_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  -- (table, column) actor references to null out, only if they exist.
  v_actor_cols constant text[][] := array[
    ['allowed_domains',      'added_by'],
    ['approved_emails',      'added_by'],
    ['access_requests',      'reviewed_by'],
    ['logged_hours',         'reviewed_by'],
    ['logged_hours',         'verified_by'],
    ['task_claims',          'verified_by'],
    ['tasks',                'claimed_by'],
    ['tasks',                'verified_by'],
    ['tasks',                'created_by'],
    ['events',               'created_by'],
    ['position_assignments', 'assigned_by'],
    ['attendance_events',    'overridden_by'],
    ['guardian_links',       'created_by'],
    ['member_skills',        'certified_by'],
    ['session_reviews',      'reviewed_by']
  ];
  i      int;
  v_tbl  text;
  v_col  text;
begin
  if not public.has_role('admin') then
    raise exception 'Permission denied: admin role required';
  end if;
  if p_member = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  -- 1. Null actor references (guarded so a not-yet-migrated table can't break it).
  for i in 1 .. array_length(v_actor_cols, 1) loop
    v_tbl := v_actor_cols[i][1];
    v_col := v_actor_cols[i][2];
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_tbl and column_name = v_col
    ) then
      execute format('update public.%I set %I = null where %I = $1', v_tbl, v_col, v_col)
        using p_member;
    end if;
  end loop;

  -- 2. Owned data: one cascade off the profile row.
  delete from public.profiles where id = p_member;

  -- 3. The auth user (and session_reviews.user_id + auth.* via cascade).
  delete from auth.users where id = p_member;
end;
$fn$;

grant execute on function public.admin_delete_member(uuid) to authenticated;

-- ── 3. admin_get_members(): add nickname ────────────────────────────────────
-- DROP required: the return type changes (nickname column added).
drop function if exists public.admin_get_members();

create function public.admin_get_members()
returns table (
  id        uuid,
  full_name text,
  nickname  text,
  email     text,
  status    text,
  approved  boolean,
  roles     text[],
  subteams  text[]
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.has_role('admin') then
    raise exception 'Permission denied: admin role required';
  end if;
  return query
    select
      p.id,
      p.full_name::text,
      p.nickname::text,
      u.email::text,
      p.status::text,
      p.approved,
      array_remove(array_agg(mr.role order by mr.role), null)::text[] as roles,
      coalesce(p.subteams, '{}')::text[]                               as subteams
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.member_roles mr on mr.member_id = p.id
    group by p.id, p.full_name, p.nickname, u.email, p.status, p.approved, p.subteams
    order by lower(coalesce(nullif(p.nickname, ''), p.full_name));
end;
$fn$;

grant execute on function public.admin_get_members() to authenticated;
