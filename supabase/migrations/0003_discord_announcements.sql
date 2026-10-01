-- ============================================================
-- 0003_discord_announcements -- the Discord role list and the announcement log
--
-- APPLY: by hand, in the Supabase SQL editor, the whole file at once, BEFORE
-- deploying the discord-announce Edge Function. Then run the sibling test,
-- 0003_discord_announcements_rls_test.sql, and read its result grid.
-- Re-runnable: every create is if-not-exists or or-replace, every constraint
-- add is guarded on pg_constraint, and every policy dropped is one this file
-- creates.
--
-- WHAT IT CREATES
--   public.discord_announce_roles    the Discord roles an admin may ping from
--                                    /announce. A person fills in each name and
--                                    role id by hand from Discord; nothing in
--                                    the app ever guesses an id.
--   public.discord_announcements     one row per send from /announce: who, when,
--                                    which channel, the text, the role ids, the
--                                    poll, and what Discord answered.
--   public.discord_announce_roles_touch()   keeps updated_at honest.
--
-- WHAT IT ASSUMES IS ALREADY THERE (all applied long ago, all frozen):
--   public.profiles, public.member_roles
--   public.is_staff()   supabase/skills_catalog.sql
--   public.is_admin()   supabase/feedback.sql
-- The precondition block below raises by name if either function is missing,
-- rather than letting a policy fail later with a less useful error.
--
-- WHO MAY DO WHAT, and why it is this way round:
--   role table   staff READ, admin WRITE. A role id is not a secret -- anyone
--                in the server with Developer Mode can copy one -- and the log
--                below, which staff can read, carries the same ids anyway.
--                Editing the list decides who gets pinged, so that is admin.
--   log          staff READ, NOBODY writes from a client. The Edge Function
--                writes it with the service role after checking is_admin()
--                itself. There is no insert/update/delete policy, AND the
--                privileges are revoked by name, because the project bootstrap
--                ALTER DEFAULT PRIVILEGES grants authenticated ALL on a new
--                table and a missing policy alone fails SILENTLY at 0 rows.
--   anon         nothing on either table.
--
-- TO REVERSE (loses every logged send and the role list; nothing else reads
-- these tables):
--   drop table if exists public.discord_announcements;
--   drop table if exists public.discord_announce_roles;
--   drop function if exists public.discord_announce_roles_touch();
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception '0003_discord_announcements: public.is_admin() does not exist. Apply supabase/feedback.sql first.';
  end if;
  if to_regprocedure('public.is_staff()') is null then
    raise exception '0003_discord_announcements: public.is_staff() does not exist. Apply supabase/skills_catalog.sql first.';
  end if;
end
$pre$;

-- ── 1. discord_announce_roles ────────────────────────────────────────────────
create table if not exists public.discord_announce_roles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,          -- as it reads in Discord, e.g. Programming
  role_id     text        not null,          -- the snowflake, as TEXT: a JS number cannot hold one
  active      boolean     not null default true,
  sort_order  int         not null default 0,
  notes       text,
  created_by  uuid        default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A Discord id is 17 to 20 decimal digits. Same pattern as SNOWFLAKE_RE in
-- src/discordAnnounce.js; tests/discord-announce-drift.test.js compares them.
-- This is the check that turns "paste the role id" into something that cannot
-- hold a role NAME, a mention like <@&...>, or a stray space.
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'discord_announce_roles_role_id_snowflake_chk') then
    alter table public.discord_announce_roles
      add constraint discord_announce_roles_role_id_snowflake_chk check (role_id ~ '^[0-9]{17,20}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'discord_announce_roles_name_chk') then
    alter table public.discord_announce_roles
      add constraint discord_announce_roles_name_chk check (length(btrim(name)) between 1 and 100);
  end if;
  -- One row per Discord role: two rows for one id would put one role on the
  -- page under two names.
  if not exists (select 1 from pg_constraint where conname = 'discord_announce_roles_role_id_key') then
    alter table public.discord_announce_roles
      add constraint discord_announce_roles_role_id_key unique (role_id);
  end if;
end
$c$;

-- And one row per name, case-insensitively, so the picker never shows two
-- "Programming" chips that ping different roles.
create unique index if not exists discord_announce_roles_name_idx
  on public.discord_announce_roles (lower(btrim(name)));

create or replace function public.discord_announce_roles_touch()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

-- A trigger function is never called directly; the default-privilege grant of
-- EXECUTE to anon and authenticated is removed so the catalog says so too.
revoke execute on function public.discord_announce_roles_touch() from public, anon, authenticated;

drop trigger if exists discord_announce_roles_touch on public.discord_announce_roles;
create trigger discord_announce_roles_touch
  before update on public.discord_announce_roles
  for each row execute function public.discord_announce_roles_touch();

alter table public.discord_announce_roles enable row level security;

drop policy if exists "dar select staff" on public.discord_announce_roles;
create policy "dar select staff"
  on public.discord_announce_roles for select to authenticated
  using (public.is_staff());

drop policy if exists "dar insert admin" on public.discord_announce_roles;
create policy "dar insert admin"
  on public.discord_announce_roles for insert to authenticated
  with check (public.is_admin());

drop policy if exists "dar update admin" on public.discord_announce_roles;
create policy "dar update admin"
  on public.discord_announce_roles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Delete is allowed (admin) because a mistyped row has to be removable. The log
-- keeps its own copy of every id and name it used, with no foreign key here, so
-- deleting a role never rewrites the history of what was sent.
drop policy if exists "dar delete admin" on public.discord_announce_roles;
create policy "dar delete admin"
  on public.discord_announce_roles for delete to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.discord_announce_roles to authenticated;
revoke truncate, references, trigger on public.discord_announce_roles from authenticated;
revoke all on public.discord_announce_roles from anon;
grant select on public.discord_announce_roles to service_role;   -- the function reads it

-- ── 2. discord_announcements (the log) ───────────────────────────────────────
create table if not exists public.discord_announcements (
  id                 uuid        primary key default gen_random_uuid(),
  -- Minted by the page when the admin reaches the confirm step and re-sent on
  -- a retry of that same step. UNIQUE, and the row is inserted BEFORE Discord
  -- is called, so a double click or a retried request finds this row and posts
  -- nothing: the no-double-post guarantee is this constraint, not the button.
  request_id         uuid        not null,
  sent_by            uuid        references public.profiles(id) on delete set null,
  sender_name        text,                     -- snapshot, survives a deleted profile
  channel_name       text        not null,
  channel_id         text,                     -- resolved by name at send time
  content            text        not null default '',   -- exactly what Discord received
  role_ids           text[]      not null default '{}',
  role_names         text[]      not null default '{}', -- snapshot of the table's names
  embed              jsonb,
  poll               jsonb,
  payload            jsonb       not null,      -- the whole request body, verbatim
  status             text        not null default 'pending',
  discord_message_id text,
  error              text,                      -- a sentence, never a secret
  created_at         timestamptz not null default now(),
  sent_at            timestamptz
);

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'discord_announcements_request_id_key') then
    alter table public.discord_announcements
      add constraint discord_announcements_request_id_key unique (request_id);
  end if;
  -- Same four values, same order, as ANNOUNCE_STATUSES in src/discordAnnounce.js.
  if not exists (select 1 from pg_constraint where conname = 'discord_announcements_status_chk') then
    alter table public.discord_announcements
      add constraint discord_announcements_status_chk check (status in ('pending', 'sent', 'failed', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'discord_announcements_sent_chk') then
    alter table public.discord_announcements
      add constraint discord_announcements_sent_chk check (status <> 'sent' or discord_message_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'discord_announcements_role_ids_chk') then
    alter table public.discord_announcements
      add constraint discord_announcements_role_ids_chk
      check (array_to_string(role_ids, ',') ~ '^([0-9]{17,20}(,[0-9]{17,20})*)?$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'discord_announcements_json_chk') then
    alter table public.discord_announcements
      add constraint discord_announcements_json_chk check (
        jsonb_typeof(payload) = 'object'
        and (embed is null or jsonb_typeof(embed) = 'object')
        and (poll  is null or jsonb_typeof(poll)  = 'object'));
  end if;
end
$c$;

create index if not exists discord_announcements_created_idx
  on public.discord_announcements (created_at desc);

alter table public.discord_announcements enable row level security;

drop policy if exists "da select staff" on public.discord_announcements;
create policy "da select staff"
  on public.discord_announcements for select to authenticated
  using (public.is_staff());

-- NO insert, update or delete policy for anyone. The service role bypasses RLS
-- and is the only writer; an admin sends THROUGH the function, which checks
-- is_admin() against the caller's own JWT before it writes anything.
grant select on public.discord_announcements to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.discord_announcements from authenticated;
revoke all on public.discord_announcements from anon;
grant select, insert, update on public.discord_announcements to service_role;

-- ── 3. Verify ────────────────────────────────────────────────────────────────
-- select conname from pg_constraint
--  where conrelid in ('public.discord_announce_roles'::regclass, 'public.discord_announcements'::regclass)
--  order by 1;              -- 12 rows: the 8 named above, 2 primary keys, 2 foreign keys
-- select tablename, policyname, cmd from pg_policies
--  where tablename in ('discord_announce_roles', 'discord_announcements') order by 1, 2;   -- 5 rows
-- Then run 0003_discord_announcements_rls_test.sql.
