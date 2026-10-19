-- ============================================================
-- 0013_handbook_acknowledgments -- who signed which handbook version, and when
--
-- APPLY: by hand, in the Supabase SQL editor, the whole file at once. Then run
-- the sibling test, 0013_handbook_acknowledgments_rls_test.sql, and read its
-- result grid. Re-runnable: every create is if-not-exists or or-replace, every
-- constraint add is guarded on pg_constraint, and every policy dropped is one
-- this file creates.
--
-- WHY: the member handbook (Section 22) says "Every version is numbered, and
-- the app records who signed which version, and when." /handbook writes one
-- row here when a member signs. Until this file is pasted the page still
-- teaches and checks every lesson, and its Sign tab says signing is not set
-- up yet (src/schemaMissing.js).
--
-- WHAT IT CREATES
--   public.handbook_acknowledgments   one row per member, version and signer
--                                     role. Append only.
--   public.handbook_ack_stamp()       sets signed_at to now() on insert, so a
--                                     client cannot back-date a signature.
--
-- WHAT IT ASSUMES IS ALREADY THERE (all applied long ago, all frozen):
--   public.profiles, public.member_roles
--   public.is_staff()        supabase/skills_catalog.sql
--   public.guardian_links    supabase/guardian_links.sql
--
-- WHO MAY DO WHAT
--   insert   a signed-in member, for THEMSELVES only, as a role they hold:
--            'student' needs the student role, 'parent' the parent role,
--            'mentor' a staff role (is_staff()).
--   select   the member themselves, staff, and a parent linked to that
--            student in guardian_links. Nobody else.
--   update / delete   NOBODY from a client. A signature is a record of what
--            somebody agreed to at the time. The privileges are revoked by
--            name, because the project bootstrap ALTER DEFAULT PRIVILEGES
--            grants authenticated ALL on a new table and a missing policy
--            alone fails SILENTLY at 0 rows.
--   anon     nothing.
--
-- lessons_passed is what the page reports (the lessons are checked in the
-- browser); it is a record of what the member was shown, not proof.
--
-- TO REVERSE (loses every signature; nothing else reads this table):
--   drop table if exists public.handbook_acknowledgments;
--   drop function if exists public.handbook_ack_stamp();
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regprocedure('public.is_staff()') is null then
    raise exception '0013_handbook_acknowledgments: public.is_staff() does not exist. Apply supabase/skills_catalog.sql first.';
  end if;
  if to_regclass('public.guardian_links') is null then
    raise exception '0013_handbook_acknowledgments: public.guardian_links does not exist. Apply supabase/guardian_links.sql first.';
  end if;
end
$pre$;

-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.handbook_acknowledgments (
  id              uuid        primary key default gen_random_uuid(),
  member_id       uuid        not null references public.profiles(id) on delete cascade,
  version         text        not null,      -- ISO date of the version, e.g. 2026-10-20
  signer_role     text        not null,      -- student | parent | mentor
  lessons_passed  int         not null default 0,
  signed_at       timestamptz not null default now()
);

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'handbook_ack_version_chk') then
    alter table public.handbook_acknowledgments
      add constraint handbook_ack_version_chk check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  end if;
  -- Same three values as SIGNER_ROLES in src/handbook/sign.js.
  if not exists (select 1 from pg_constraint where conname = 'handbook_ack_role_chk') then
    alter table public.handbook_acknowledgments
      add constraint handbook_ack_role_chk check (signer_role in ('student', 'parent', 'mentor'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'handbook_ack_lessons_chk') then
    alter table public.handbook_acknowledgments
      add constraint handbook_ack_lessons_chk check (lessons_passed between 0 and 100);
  end if;
  -- One signature per member, version and role: signing twice is a no-op the
  -- page reads as already signed (23505), never a second row.
  if not exists (select 1 from pg_constraint where conname = 'handbook_ack_once_key') then
    alter table public.handbook_acknowledgments
      add constraint handbook_ack_once_key unique (member_id, version, signer_role);
  end if;
end
$c$;

create index if not exists handbook_ack_version_idx
  on public.handbook_acknowledgments (version, signed_at);

-- ── 2. The server sets the time stamp ────────────────────────────────────────
create or replace function public.handbook_ack_stamp()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  new.signed_at := now();
  return new;
end;
$fn$;

revoke execute on function public.handbook_ack_stamp() from public, anon, authenticated;

drop trigger if exists handbook_ack_stamp on public.handbook_acknowledgments;
create trigger handbook_ack_stamp
  before insert on public.handbook_acknowledgments
  for each row execute function public.handbook_ack_stamp();

-- ── 3. Row security ──────────────────────────────────────────────────────────
alter table public.handbook_acknowledgments enable row level security;

drop policy if exists "hba select own staff guardian" on public.handbook_acknowledgments;
create policy "hba select own staff guardian"
  on public.handbook_acknowledgments for select to authenticated
  using (
    member_id = auth.uid()
    or public.is_staff()
    or exists (select 1 from public.guardian_links g
                where g.parent_id = auth.uid() and g.student_id = handbook_acknowledgments.member_id)
  );

drop policy if exists "hba insert own as held role" on public.handbook_acknowledgments;
create policy "hba insert own as held role"
  on public.handbook_acknowledgments for insert to authenticated
  with check (
    member_id = auth.uid()
    and (
      (signer_role = 'student' and exists (select 1 from public.member_roles r
                                            where r.member_id = auth.uid() and r.role = 'student'))
      or (signer_role = 'parent' and exists (select 1 from public.member_roles r
                                              where r.member_id = auth.uid() and r.role = 'parent'))
      or (signer_role = 'mentor' and public.is_staff())
    )
  );

grant select, insert on public.handbook_acknowledgments to authenticated;
revoke update, delete, truncate, references, trigger on public.handbook_acknowledgments from authenticated;
revoke all on public.handbook_acknowledgments from anon;
