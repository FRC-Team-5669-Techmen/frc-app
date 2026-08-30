-- ============================================================
-- In-app feedback inbox
--
-- RUN THIS IN THE SUPABASE SQL EDITOR BEFORE TESTING. The widget and the
-- /feedback admin page both read/write the objects created here; without it
-- every submit fails with "relation public.feedback does not exist".
--
-- Re-runnable: every create is if-not-exists / or-replace and every policy is
-- dropped before it is created.
--
-- What this is: any signed-in member can file a report (bug / idea / feedback)
-- from any page, optionally with screenshots. Admins read the inbox. It is a
-- PULL inbox -- nothing here notifies anyone.
--
-- WHY THE BUCKET IS PRIVATE, unlike 'jobs': a feedback screenshot is almost
-- always a picture of the app mid-use, which means other members' names, hours,
-- and contact rows are in the frame. The 'jobs' bucket is public because it
-- holds reference photos of parts and fixtures; this one holds incidental
-- personal data, so it is admin-read only and the admin page has to mint signed
-- URLs (createSignedUrl) to display anything.
-- ============================================================

-- ── 1. is_admin() ────────────────────────────────────────────────────────────
-- Mirrors public.is_staff() from supabase/skills_catalog.sql exactly, narrowed
-- to the admin role. SECURITY DEFINER so a policy can consult member_roles
-- without the caller needing to read it, and search_path pinned for the same
-- reason every other definer function here pins it.
--
-- It is created here because feedback is the first table whose read policy is
-- admin-only rather than staff-wide. Nothing else is repointed at it -- the
-- existing is_staff() policies keep their own meaning.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.member_roles
    where member_id = auth.uid()
      and role = 'admin'
  );
$fn$;

grant execute on function public.is_admin() to authenticated;

-- ── 2. feedback table ────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references public.profiles(id) on delete cascade,
  category     text        not null,
  message      text        not null,
  -- Array of storage paths in the 'feedback' bucket. Plural because one report
  -- often carries a before/after pair or a screenshot plus the console.
  image_paths  jsonb       not null default '[]'::jsonb,
  -- Telemetry gathered automatically at submit time. Nothing here is typed by
  -- the member, and nothing beyond these three fields is inferred.
  route        text,
  viewport     text,
  user_agent   text,
  status       text        not null default 'open',
  reviewed_by  uuid        references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),

  constraint feedback_category_chk check (category in ('bug', 'idea', 'feedback')),
  constraint feedback_status_chk   check (status in ('open', 'reviewed', 'dismissed')),
  -- A blank report is noise in an inbox nobody can prune (there is no delete
  -- policy), so the emptiness check is on the trimmed value, not just NOT NULL.
  constraint feedback_message_chk  check (length(btrim(message)) > 0),
  constraint feedback_images_chk   check (jsonb_typeof(image_paths) = 'array')
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx  on public.feedback (status);
create index if not exists feedback_member_idx  on public.feedback (member_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
alter table public.feedback enable row level security;

-- Anyone signed in may file a report, but only as themselves. member_id comes
-- from auth.uid() in the check, so a forged member_id in the request body is
-- rejected by the policy rather than trusted.
drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own"
  on public.feedback for insert to authenticated
  with check (member_id = auth.uid());

-- Read and triage are admin-only. Deliberately NOT is_staff(): the ask was
-- "as an admin", and a report can quote anything the member had on screen.
-- NOTE the member who filed a report cannot read it back either. That is the
-- cost of one narrow policy instead of two overlapping ones, and it is
-- acceptable because the widget has no history view and no edit-after-submit.
drop policy if exists "feedback select admin" on public.feedback;
create policy "feedback select admin"
  on public.feedback for select to authenticated
  using (public.is_admin());

drop policy if exists "feedback update admin" on public.feedback;
create policy "feedback update admin"
  on public.feedback for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- NO DELETE POLICY FOR ANYONE, on purpose. This is an inbox: a report is
-- marked reviewed or dismissed, never removed, so the record of what was
-- reported and when survives triage.

grant select, insert, update on public.feedback to authenticated;

-- The bootstrap ALTER DEFAULT PRIVILEGES grants authenticated everything on a
-- new public table, so the grant above does not TAKE ANYTHING AWAY. Without
-- this revoke a delete is blocked only by the absence of a policy, which fails
-- SILENTLY at 0 rows -- the same silent-write class of bug the roster role
-- edits hit. Revoking makes a stray delete raise 42501 instead.
revoke delete, truncate on public.feedback from authenticated;

-- Policy scoping is likewise not the anon barrier, for the same reason.
revoke all on public.feedback from anon;

-- ── 4. Storage bucket 'feedback' (PRIVATE) ───────────────────────────────────
-- public = false. See the header: screenshots carry other members' data.
insert into storage.buckets (id, name, public)
values ('feedback', 'feedback', false)
on conflict (id) do update set public = false;

-- Read is admin-only. Because the bucket is private there is no public URL at
-- all, so the admin page displays images through createSignedUrl, which is
-- itself gated by this policy.
drop policy if exists "feedback images read" on storage.objects;
create policy "feedback images read"
  on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and public.is_admin());

-- Any signed-in member may upload -- same shape as the jobs bucket: the check
-- is on bucket_id only, because the row that references the path is what
-- carries the member identity, and that insert is policy-checked above.
drop policy if exists "feedback images upload" on storage.objects;
create policy "feedback images upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback');

-- Uploader or admin may delete.
--
-- MEASURED CAVEAT, so nobody relies on the uploader half: a DELETE has to find
-- its row first, and row lookup goes through the SELECT policy above, which is
-- admin-only. So `owner = auth.uid()` is effectively DEAD for a non-admin --
-- their own delete matches 0 rows. It is kept because it costs nothing and is
-- correct the moment a member-read path is ever added, but in practice this is
-- the ADMIN cleanup path and nothing else.
--
-- The consequence to know about: if a member's images upload and the feedback
-- insert then fails, those objects are orphaned in the bucket and only an admin
-- can remove them. That is the deliberate trade for a private bucket -- a
-- member who cannot list the bucket cannot tidy it either.
drop policy if exists "feedback images delete" on storage.objects;
create policy "feedback images delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and (owner = auth.uid() or public.is_admin()));

-- ── 5. Verify (should return zero rows / expected shapes) ────────────────────
-- select id, member_id, category, status, created_at from public.feedback order by created_at desc limit 5;
-- select id, public from storage.buckets where id = 'feedback';   -- public must be false
