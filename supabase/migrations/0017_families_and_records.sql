-- ============================================================
-- 0017_families_and_records -- medical info, driver documents, the family
-- link, the onboarding checklist, sub-team training, the no-photo list,
-- sub-team status reports, handbook versions, letter progress
--
-- APPLY: by hand, in the Supabase SQL editor, the whole file at once, AFTER
-- 0015 (and 0016 when it is applied). Then run
-- 0017_families_and_records_rls_test.sql and read its grid. Re-runnable.
--
-- WHY: the member handbook, Sections 1, 9, 10, 13, 16, 17, 18, 19 and 22.
--   Section 1: the first-two-weeks checklist, due two weeks after joining
--     (missed, the acceptance is withdrawn: a removal proposal), no shop tools
--     until it is done, and meetings and hours count from the next full week.
--   Section 9: a parent keeps two emergency contacts, conditions, allergies
--     and medicines current; only staff mentors see it.
--   Section 10: sub-team training lists in the app, due before Kickoff;
--     missed, the member is removed (a proposal Mr. Pina confirms).
--   Section 16: a driver uploads a photo of their license and insurance,
--     stored privately, seen only by staff, every view logged, deleted when
--     the driver asks or leaves the team.
--   Section 17: the media sub-team keeps a no-photo list.
--   Section 13: leaders rate each sub-team green, yellow or red weekly.
--   Section 18: the letter standard, and the member page shows progress.
--   Section 19: each parent gets a private link, no account; a shared link
--     is replaced.
--   Section 22: every handbook version numbered, changes announced in the
--     app, effective 7 days later (safety at once), major ones re-signed.
-- ============================================================

do $pre$
begin
  if to_regprocedure('public._notify(uuid, text, text, text, boolean)') is null then
    raise exception '0017_families_and_records: apply 0015_member_standing.sql first.';
  end if;
end
$pre$;

alter table public.standing_settings add column if not exists training_due date not null default date '2027-01-08';
alter table public.standing_settings add column if not exists checklist_days integer not null default 14;

-- Meetings and hours count from the first full week after joining.
create or replace function public._member_since(p_member uuid)
returns date language sql stable security definer set search_path = public
as $fn$
  select greatest((select starts_on from public.standing_settings),
                  (date_trunc('week', coalesce(
                     (select public._la_date(min(submitted_at)) from public.member_applications where member_id = p_member),
                     (select public._la_date(created_at) from auth.users where id = p_member),
                     date '2000-01-01')) + interval '7 days')::date);
$fn$;

-- ── 1. Medical and emergency information ─────────────────────────────────────
create table if not exists public.member_medical (
  member_id          uuid        primary key references public.profiles(id) on delete cascade,
  contact1_name      text        check (contact1_name is null or length(contact1_name) <= 120),
  contact1_phone     text        check (contact1_phone is null or length(contact1_phone) <= 40),
  contact1_relation  text        check (contact1_relation is null or length(contact1_relation) <= 60),
  contact2_name      text        check (contact2_name is null or length(contact2_name) <= 120),
  contact2_phone     text        check (contact2_phone is null or length(contact2_phone) <= 40),
  contact2_relation  text        check (contact2_relation is null or length(contact2_relation) <= 60),
  conditions         text        check (conditions is null or length(conditions) <= 1000),
  allergies          text        check (allergies is null or length(allergies) <= 1000),
  medicines          text        check (medicines is null or length(medicines) <= 1000),
  carried_meds       text        check (carried_meds is null or length(carried_meds) <= 300),
  updated_by_name    text,
  updated_by         uuid        references public.profiles(id) on delete set null,
  updated_at         timestamptz not null default now()
);
alter table public.member_medical enable row level security;
-- Staff, and a parent linked to the student. Not the student, not other members.
drop policy if exists "medical read staff parent" on public.member_medical;
create policy "medical read staff parent" on public.member_medical for select to authenticated
  using (public.is_staff() or exists (select 1 from public.guardian_links g where g.parent_id = auth.uid() and g.student_id = member_id));
grant select on public.member_medical to authenticated;
revoke insert, update, delete, truncate on public.member_medical from authenticated;
revoke all on public.member_medical from anon;

create or replace function public._save_medical(p_member uuid, p jsonb, p_by uuid, p_by_name text)
returns public.member_medical language plpgsql security definer set search_path = public
as $fn$
declare v public.member_medical;
begin
  if nullif(btrim(coalesce(p ->> 'contact1_name', '')), '') is null or nullif(btrim(coalesce(p ->> 'contact1_phone', '')), '') is null
     or nullif(btrim(coalesce(p ->> 'contact2_name', '')), '') is null or nullif(btrim(coalesce(p ->> 'contact2_phone', '')), '') is null then
    raise exception 'Two emergency contacts, each with a name and phone' using errcode = '22023';
  end if;
  insert into public.member_medical (member_id, contact1_name, contact1_phone, contact1_relation, contact2_name, contact2_phone, contact2_relation,
                                     conditions, allergies, medicines, carried_meds, updated_by, updated_by_name, updated_at)
  values (p_member, btrim(p ->> 'contact1_name'), btrim(p ->> 'contact1_phone'), nullif(btrim(coalesce(p ->> 'contact1_relation', '')), ''),
          btrim(p ->> 'contact2_name'), btrim(p ->> 'contact2_phone'), nullif(btrim(coalesce(p ->> 'contact2_relation', '')), ''),
          nullif(btrim(coalesce(p ->> 'conditions', '')), ''), nullif(btrim(coalesce(p ->> 'allergies', '')), ''),
          nullif(btrim(coalesce(p ->> 'medicines', '')), ''), nullif(btrim(coalesce(p ->> 'carried_meds', '')), ''), p_by, p_by_name, now())
  on conflict (member_id) do update set
    contact1_name = excluded.contact1_name, contact1_phone = excluded.contact1_phone, contact1_relation = excluded.contact1_relation,
    contact2_name = excluded.contact2_name, contact2_phone = excluded.contact2_phone, contact2_relation = excluded.contact2_relation,
    conditions = excluded.conditions, allergies = excluded.allergies, medicines = excluded.medicines, carried_meds = excluded.carried_meds,
    updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name, updated_at = now()
  returning * into v;
  return v;
end;
$fn$;
revoke execute on function public._save_medical(uuid, jsonb, uuid, text) from public, anon, authenticated;

-- A signed-in parent linked to the student, or staff.
create or replace function public.save_medical(p_member uuid, p jsonb)
returns public.member_medical language plpgsql security definer set search_path = public
as $fn$
begin
  if not (public.is_staff() or exists (select 1 from public.guardian_links g where g.parent_id = auth.uid() and g.student_id = p_member)) then
    raise exception 'A parent or a staff mentor enters emergency information' using errcode = '42501';
  end if;
  return public._save_medical(p_member, p, auth.uid(), public._member_name(auth.uid()));
end;
$fn$;
revoke execute on function public.save_medical(uuid, jsonb) from public, anon;
grant execute on function public.save_medical(uuid, jsonb) to authenticated;

-- ── 2. Driver documents ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('driver-docs', 'driver-docs', false)
on conflict (id) do update set public = false;

create table if not exists public.driver_documents (
  id           uuid        primary key default gen_random_uuid(),
  owner_id     uuid        not null references public.profiles(id) on delete cascade,
  driver_name  text        not null check (length(btrim(driver_name)) between 2 and 120),
  kind         text        not null check (kind in ('license', 'insurance')),
  path         text        not null unique,
  uploaded_at  timestamptz not null default now(),
  purge_reason text
);
create table if not exists public.driver_document_views (
  id        bigint      generated always as identity primary key,
  doc_id    uuid        not null references public.driver_documents(id) on delete cascade,
  viewer_id uuid        references public.profiles(id) on delete set null,
  viewed_at timestamptz not null default now()
);
alter table public.driver_documents enable row level security;
alter table public.driver_document_views enable row level security;
drop policy if exists "driver docs read owner staff" on public.driver_documents;
create policy "driver docs read owner staff" on public.driver_documents for select to authenticated
  using (owner_id = auth.uid() or public.is_staff());
drop policy if exists "driver doc views read staff" on public.driver_document_views;
create policy "driver doc views read staff" on public.driver_document_views for select to authenticated using (public.is_staff());
grant select on public.driver_documents, public.driver_document_views to authenticated;
revoke insert, update, delete, truncate on public.driver_documents, public.driver_document_views from authenticated;
revoke all on public.driver_documents, public.driver_document_views from anon;

-- The file is under <owner id>/; the row is written after the upload.
create or replace function public.register_driver_document(p_path text, p_kind text, p_driver_name text)
returns public.driver_documents language plpgsql security definer set search_path = public
as $fn$
declare v public.driver_documents;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'Upload under your own folder' using errcode = '42501'; end if;
  insert into public.driver_documents (owner_id, driver_name, kind, path) values (auth.uid(), btrim(p_driver_name), p_kind, p_path)
  returning * into v;
  return v;
end;
$fn$;

-- Staff log a view first; the storage read policy then lets them open the
-- file for two minutes. Every view is a row.
create or replace function public.log_driver_document_view(p_doc uuid)
returns text language plpgsql security definer set search_path = public
as $fn$
declare v_path text;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select path into v_path from public.driver_documents where id = p_doc;
  if v_path is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  insert into public.driver_document_views (doc_id, viewer_id) values (p_doc, auth.uid());
  return v_path;
end;
$fn$;

-- The owner or staff deletes the row; the page deletes the file with it.
create or replace function public.delete_driver_document(p_doc uuid)
returns text language plpgsql security definer set search_path = public
as $fn$
declare v public.driver_documents;
begin
  select * into v from public.driver_documents where id = p_doc;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if v.owner_id <> auth.uid() and not public.is_staff() then raise exception 'Not yours' using errcode = '42501'; end if;
  delete from public.driver_documents where id = p_doc;
  return v.path;
end;
$fn$;
revoke execute on function public.register_driver_document(text, text, text) from public, anon;
revoke execute on function public.log_driver_document_view(uuid) from public, anon;
revoke execute on function public.delete_driver_document(uuid) from public, anon;
grant execute on function public.register_driver_document(text, text, text) to authenticated;
grant execute on function public.log_driver_document_view(uuid) to authenticated;
grant execute on function public.delete_driver_document(uuid) to authenticated;

create or replace function public._driver_doc_readable(p_name text)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (select 1 from public.driver_documents d where d.path = p_name and d.owner_id = auth.uid())
      or (public.is_staff() and exists (
            select 1 from public.driver_documents d join public.driver_document_views w on w.doc_id = d.id
             where d.path = p_name and w.viewer_id = auth.uid() and w.viewed_at > now() - interval '2 minutes'));
$fn$;
grant execute on function public._driver_doc_readable(text) to authenticated;

drop policy if exists "driver docs object read" on storage.objects;
create policy "driver docs object read" on storage.objects for select to authenticated
  using (bucket_id = 'driver-docs' and public._driver_doc_readable(name));
drop policy if exists "driver docs object upload" on storage.objects;
create policy "driver docs object upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'driver-docs' and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists "driver docs object delete" on storage.objects;
create policy "driver docs object delete" on storage.objects for delete to authenticated
  using (bucket_id = 'driver-docs' and (split_part(name, '/', 1) = auth.uid()::text or public.is_staff()));

-- When a driver leaves the team (inactive), their documents are flagged for
-- deletion; the staff page deletes the files.
create or replace function public.driver_docs_flag_leavers()
returns integer language plpgsql security definer set search_path = public
as $fn$
declare n integer;
begin
  update public.driver_documents d set purge_reason = 'The driver left the team'
    from public.profiles p where p.id = d.owner_id and coalesce(p.status, 'active') <> 'active' and d.purge_reason is null;
  get diagnostics n = row_count;
  return n;
end;
$fn$;
revoke execute on function public.driver_docs_flag_leavers() from public, anon, authenticated;
select cron.unschedule('driver-docs-leavers') where exists (select 1 from cron.job where jobname = 'driver-docs-leavers');
select cron.schedule('driver-docs-leavers', '30 13 * * *', $cron$ select public.driver_docs_flag_leavers() $cron$);

-- ── 3. The no-photo list ─────────────────────────────────────────────────────
create table if not exists public.media_exceptions (
  member_id uuid        primary key references public.profiles(id) on delete cascade,
  note      text        check (note is null or length(note) <= 300),
  set_by    uuid        references public.profiles(id) on delete set null,
  set_at    timestamptz not null default now()
);
alter table public.media_exceptions enable row level security;
create or replace function public._on_media_subteam()
returns boolean language sql stable security definer set search_path = public
as $fn$ select exists (select 1 from public.profiles where id = auth.uid() and 'Media' = any(coalesce(subteams, '{}'))) $fn$;
grant execute on function public._on_media_subteam() to authenticated;
drop policy if exists "media exceptions read" on public.media_exceptions;
create policy "media exceptions read" on public.media_exceptions for select to authenticated
  using (public.is_staff() or public._on_media_subteam() or member_id = auth.uid());
grant select on public.media_exceptions to authenticated;
revoke insert, update, delete, truncate on public.media_exceptions from authenticated;
revoke all on public.media_exceptions from anon;

create or replace function public.staff_set_media_exception(p_member uuid, p_on boolean, p_note text default null)
returns integer language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_on then
    insert into public.media_exceptions (member_id, note, set_by) values (p_member, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    on conflict (member_id) do update set note = excluded.note, set_by = excluded.set_by, set_at = now();
  else
    delete from public.media_exceptions where member_id = p_member;
  end if;
  return 1;
end;
$fn$;
revoke execute on function public.staff_set_media_exception(uuid, boolean, text) from public, anon;
grant execute on function public.staff_set_media_exception(uuid, boolean, text) to authenticated;

-- ── 4. Sub-team status reports ───────────────────────────────────────────────
create table if not exists public.subteam_status_reports (
  id          uuid        primary key default gen_random_uuid(),
  week_start  date        not null check (extract(isodow from week_start) = 1),
  subteam     text        not null,
  status      text        not null check (status in ('green', 'yellow', 'red')),
  note        text        check (note is null or length(note) <= 500),
  reported_by uuid        references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  unique (week_start, subteam)
);
alter table public.subteam_status_reports enable row level security;
drop policy if exists "status reports read" on public.subteam_status_reports;
create policy "status reports read" on public.subteam_status_reports for select to authenticated using (true);
grant select on public.subteam_status_reports to authenticated;
revoke insert, update, delete, truncate on public.subteam_status_reports from authenticated;
revoke all on public.subteam_status_reports from anon;

create or replace function public.set_subteam_status(p_subteam text, p_status text, p_note text default null)
returns public.subteam_status_reports language plpgsql security definer set search_path = public
as $fn$
declare v public.subteam_status_reports; wk date := date_trunc('week', public._la_today())::date;
begin
  if not (public.is_staff() or public.has_role('lead')) then raise exception 'Leaders and mentors only' using errcode = '42501'; end if;
  insert into public.subteam_status_reports (week_start, subteam, status, note, reported_by)
  values (wk, btrim(p_subteam), p_status, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (week_start, subteam) do update set status = excluded.status, note = excluded.note, reported_by = excluded.reported_by, reported_at = now()
  returning * into v;
  return v;
end;
$fn$;
revoke execute on function public.set_subteam_status(text, text, text) from public, anon;
grant execute on function public.set_subteam_status(text, text, text) to authenticated;

-- ── 5. Sub-team training ─────────────────────────────────────────────────────
-- subteam null = every member. Seeded with the two required this season.
create table if not exists public.subteam_training (
  id       uuid    primary key default gen_random_uuid(),
  subteam  text,
  code     text    not null,
  required boolean not null default false,
  unique nulls not distinct (subteam, code)
);
insert into public.subteam_training (subteam, code, required) values (null, 'SAFE-1', true), (null, 'RESP-1', true)
on conflict do nothing;
alter table public.subteam_training enable row level security;
drop policy if exists "training read" on public.subteam_training;
create policy "training read" on public.subteam_training for select to authenticated using (true);
drop policy if exists "training staff write" on public.subteam_training;
create policy "training staff write" on public.subteam_training for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.subteam_training to authenticated;
revoke all on public.subteam_training from anon;

-- Held: an active, unexpired IDEA mirror row for the member sign-in email
-- (decision 33). The mirror is 0001; without it nothing is held.
create or replace function public._holds_cert(p_member uuid, p_code text)
returns boolean language plpgsql stable security definer set search_path = public
as $fn$
declare v boolean;
begin
  if to_regclass('public.idea_cert_holders') is null then return false; end if;
  execute 'select exists (select 1 from public.idea_cert_holders h where h.email = $1 and h.code = $2 and h.status = ''active'' and (h.expires_at is null or h.expires_at > now()))'
    into v using public._member_email(p_member), p_code;
  return coalesce(v, false);
end;
$fn$;

create or replace function public._training_list(p_member uuid)
returns jsonb language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'subteam', t.subteam, 'required', t.required,
                    'held', public._holds_cert(p_member, t.code)) order by t.required desc, t.code), '[]')
    from public.subteam_training t
   where t.subteam is null or t.subteam = any(coalesce((select subteams from public.profiles where id = p_member), '{}'));
$fn$;

-- ── 6. The onboarding checklist ──────────────────────────────────────────────
create table if not exists public.onboarding_items (
  member_id  uuid        not null references public.profiles(id) on delete cascade,
  item       text        not null check (item in ('first_registration', 'discord', 'groupme', 'parent_signed', 'buddy')),
  done_at    timestamptz not null default now(),
  marked_by  uuid        references public.profiles(id) on delete set null,
  note       text        check (note is null or length(note) <= 200),
  primary key (member_id, item)
);
alter table public.onboarding_items enable row level security;
drop policy if exists "onboarding read" on public.onboarding_items;
create policy "onboarding read" on public.onboarding_items for select to authenticated using (public._can_see_member(member_id));
grant select on public.onboarding_items to authenticated;
revoke insert, update, delete, truncate on public.onboarding_items from authenticated;
revoke all on public.onboarding_items from anon;

-- Parent handbook signatures made from the family link (no account).
create table if not exists public.parent_acknowledgments (
  id             uuid        primary key default gen_random_uuid(),
  application_id uuid        not null references public.member_applications(id) on delete cascade,
  member_id      uuid        not null references public.profiles(id) on delete cascade,
  version        text        not null,
  parent_name    text        not null check (length(btrim(parent_name)) between 2 and 120),
  signed_at      timestamptz not null default now(),
  unique (application_id, version)
);
alter table public.parent_acknowledgments enable row level security;
drop policy if exists "parent acks read" on public.parent_acknowledgments;
create policy "parent acks read" on public.parent_acknowledgments for select to authenticated using (public._can_see_member(member_id));
grant select on public.parent_acknowledgments to authenticated;
revoke insert, update, delete, truncate on public.parent_acknowledgments from authenticated;
revoke all on public.parent_acknowledgments from anon;

-- The checklist: steps the member ticks, steps that are read from the
-- record (certifications, emergency information, the signatures), and steps
-- staff tick (a paper parent signature, the buddy).
create or replace function public._onboarding_json(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_join  date := coalesce((select public._la_date(min(submitted_at)) from public.member_applications where member_id = p_member),
                           (select public._la_date(created_at) from auth.users where id = p_member));
  v_items jsonb;
  v_ver   text := (select version from public.handbook_versions order by published_at desc limit 1);
  v_student_signed boolean;
  v_parent_signed boolean;
begin
  v_student_signed := to_regclass('public.handbook_acknowledgments') is not null and exists (
    select 1 from public.handbook_acknowledgments a where a.member_id = p_member and a.signer_role = 'student');
  v_parent_signed := exists (select 1 from public.parent_acknowledgments where member_id = p_member)
    or exists (select 1 from public.onboarding_items where member_id = p_member and item = 'parent_signed')
    or (to_regclass('public.handbook_acknowledgments') is not null and exists (
         select 1 from public.handbook_acknowledgments a join public.guardian_links g on g.parent_id = a.member_id
          where g.student_id = p_member and a.signer_role = 'parent'));
  v_items := jsonb_build_array(
    jsonb_build_object('key', 'first_registration', 'label', 'Registered with FIRST; a parent accepted the Consent and Release', 'by', 'member',
                       'done', exists (select 1 from public.onboarding_items where member_id = p_member and item = 'first_registration')),
    jsonb_build_object('key', 'discord', 'label', 'Joined the team Discord', 'by', 'member',
                       'done', exists (select 1 from public.onboarding_items where member_id = p_member and item = 'discord')),
    jsonb_build_object('key', 'groupme', 'label', 'A parent joined the GroupMe', 'by', 'member',
                       'done', exists (select 1 from public.onboarding_items where member_id = p_member and item = 'groupme')),
    jsonb_build_object('key', 'safe1', 'label', 'Passed SAFE-1', 'by', 'record', 'done', public._holds_cert(p_member, 'SAFE-1')),
    jsonb_build_object('key', 'resp1', 'label', 'Passed RESP-1', 'by', 'record', 'done', public._holds_cert(p_member, 'RESP-1')),
    jsonb_build_object('key', 'medical', 'label', 'A parent entered emergency information', 'by', 'record',
                       'done', exists (select 1 from public.member_medical where member_id = p_member)),
    jsonb_build_object('key', 'student_signed', 'label', 'You signed the handbook', 'by', 'record', 'done', v_student_signed),
    jsonb_build_object('key', 'parent_signed', 'label', 'A parent signed the handbook', 'by', 'record', 'done', v_parent_signed),
    jsonb_build_object('key', 'buddy', 'label', 'Met your sub-team and your veteran buddy', 'by', 'staff',
                       'done', exists (select 1 from public.onboarding_items where member_id = p_member and item = 'buddy'))
  );
  return jsonb_build_object(
    'items', v_items,
    'done', not exists (select 1 from jsonb_array_elements(v_items) x where not (x ->> 'done')::boolean),
    'joined', v_join,
    'due', v_join + (select checklist_days from public.standing_settings),
    'version', v_ver);
end;
$fn$;

-- No shop tools until the checklist is done (staff and parents are not on it).
create or replace function public.shop_tools_allowed(p_member uuid default null)
returns boolean language plpgsql stable security definer set search_path = public
as $fn$
declare m uuid := coalesce(p_member, auth.uid());
begin
  if m <> auth.uid() and not public.is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not public._standing_member(m) then return true; end if;
  return (public._onboarding_json(m) ->> 'done')::boolean;
end;
$fn$;
revoke execute on function public.shop_tools_allowed(uuid) from public, anon;
grant execute on function public.shop_tools_allowed(uuid) to authenticated;

create or replace function public.mark_onboarding(p_member uuid, p_item text, p_done boolean, p_note text default null)
returns integer language plpgsql security definer set search_path = public
as $fn$
begin
  if p_item in ('parent_signed', 'buddy') then
    if not public.is_staff() then raise exception 'A mentor ticks this one' using errcode = '42501'; end if;
  elsif not (p_member = auth.uid() or public.is_staff()) then
    raise exception 'Only for yourself' using errcode = '42501';
  end if;
  if p_done then
    insert into public.onboarding_items (member_id, item, marked_by, note) values (p_member, p_item, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
    on conflict (member_id, item) do update set marked_by = excluded.marked_by, note = excluded.note, done_at = now();
  else
    delete from public.onboarding_items where member_id = p_member and item = p_item;
  end if;
  return 1;
end;
$fn$;
revoke execute on function public.mark_onboarding(uuid, text, boolean, text) from public, anon;
grant execute on function public.mark_onboarding(uuid, text, boolean, text) to authenticated;

-- ── 7. Handbook versions and the change feed ─────────────────────────────────
create table if not exists public.handbook_versions (
  version      text        primary key,
  summary      text        not null check (length(btrim(summary)) between 3 and 4000),
  major        boolean     not null default false,
  safety       boolean     not null default false,
  effective_at timestamptz not null,
  published_by uuid        references public.profiles(id) on delete set null,
  published_at timestamptz not null default now()
);
insert into public.handbook_versions (version, summary, major, safety, effective_at)
values ('2026-10-20', 'First version of the member handbook.', true, false, timestamptz '2026-10-20 00:00-07')
on conflict (version) do nothing;
alter table public.handbook_versions enable row level security;
drop policy if exists "handbook versions read" on public.handbook_versions;
create policy "handbook versions read" on public.handbook_versions for select to authenticated using (true);
grant select on public.handbook_versions to authenticated;
revoke insert, update, delete, truncate on public.handbook_versions from authenticated;
revoke all on public.handbook_versions from anon;

-- A change takes effect 7 days later; a safety change at once. Every member
-- gets the announcement in the app.
create or replace function public.publish_handbook_version(p_version text, p_summary text, p_major boolean, p_safety boolean)
returns public.handbook_versions language plpgsql security definer set search_path = public
as $fn$
declare v public.handbook_versions; r record;
begin
  if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  insert into public.handbook_versions (version, summary, major, safety, effective_at, published_by)
  values (btrim(p_version), btrim(p_summary), p_major, p_safety, case when p_safety then now() else now() + interval '7 days' end, auth.uid())
  returning * into v;
  for r in select p.id from public.profiles p where p.approved and coalesce(p.status, 'active') = 'active' loop
    insert into public.member_notices (member_id, kind, title, body, created_by)
    values (r.id, 'handbook', 'Handbook updated: version ' || v.version,
            v.summary || chr(10) || chr(10) || case when v.safety then 'A safety change: in effect now.' else 'In effect ' || to_char(v.effective_at at time zone 'America/Los_Angeles', 'Mon DD') || '.' end
            || case when v.major then ' Major change: sign it again in the app.' else '' end, auth.uid());
  end loop;
  return v;
end;
$fn$;
revoke execute on function public.publish_handbook_version(text, text, boolean, boolean) from public, anon;
grant execute on function public.publish_handbook_version(text, text, boolean, boolean) to authenticated;

-- ── 8. Letter progress ───────────────────────────────────────────────────────
create table if not exists public.letter_contributions (
  member_id     uuid        not null references public.profiles(id) on delete cascade,
  season_start  date        not null,
  confirmed_by  uuid        references public.profiles(id) on delete set null,
  note          text        check (note is null or length(note) <= 500),
  confirmed_at  timestamptz not null default now(),
  primary key (member_id, season_start)
);
alter table public.letter_contributions enable row level security;
drop policy if exists "letter contributions read" on public.letter_contributions;
create policy "letter contributions read" on public.letter_contributions for select to authenticated using (public._can_see_member(member_id));
grant select on public.letter_contributions to authenticated;
revoke insert, update, delete, truncate on public.letter_contributions from authenticated;
revoke all on public.letter_contributions from anon;

create or replace function public.staff_confirm_contribution(p_member uuid, p_on boolean, p_note text default null)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare sy date := public._school_year_start(public._la_today());
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_on then
    insert into public.letter_contributions (member_id, season_start, confirmed_by, note) values (p_member, sy, auth.uid(), p_note)
    on conflict (member_id, season_start) do update set confirmed_by = excluded.confirmed_by, note = excluded.note, confirmed_at = now();
  else
    delete from public.letter_contributions where member_id = p_member and season_start = sy;
  end if;
  return 1;
end;
$fn$;
revoke execute on function public.staff_confirm_contribution(uuid, boolean, text) from public, anon;
grant execute on function public.staff_confirm_contribution(uuid, boolean, text) to authenticated;

-- Volunteer hours this school year: FLL sessions plus verified logged hours.
create or replace function public._volunteer_hours(p_member uuid, p_from date)
returns numeric language sql stable security definer set search_path = public
as $fn$
  with ev as (
    select type, event_time, category, lead(type) over w ntype, lead(event_time) over w ntime
      from public.attendance_events where user_id = p_member and event_time >= public._la_start(p_from) - interval '1 day'
    window w as (order by event_time, id))
  select coalesce(sum(extract(epoch from least(ntime, event_time + interval '12 hours') - event_time)) / 3600.0, 0)
       + coalesce((select sum(hours) from public.logged_hours l where l.member_id = p_member and l.status = 'verified'
                     and l.type in ('volunteer', 'volunteering', 'outreach') and l.date >= p_from), 0)
    from ev where type = 'in' and ntype = 'out' and category = 'volunteer' and event_time >= public._la_start(p_from);
$fn$;

-- The letter standard, Section 18. Each line is met, not met, or open (the
-- season is not over). The member page shows it; nothing awards a letter.
create or replace function public._letter_json(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare
  sy date := public._school_year_start(public._la_today());
  s public.standing_settings;
  v_vol numeric;
  v_comp_miss integer := 0;
  v_role boolean := false;
  v_build_short integer;
  v_safety integer;
  v_written integer;
  v_train jsonb := public._training_list(p_member);
begin
  select * into s from public.standing_settings;
  v_vol := round(public._volunteer_hours(p_member, sy), 1);
  if to_regclass('public.event_attendance') is not null then
    execute 'select count(*) from public.event_attendance a join public.events e on e.id = a.event_id
              where a.member_id = $1 and a.status = ''absent'' and e.kind = ''competition'' and a.day >= $2'
      into v_comp_miss using p_member, sy;
    execute 'select exists (select 1 from public.event_roles r join public.events e on e.id = r.event_id
              where r.member_id = $1 and e.starts_at >= $2::timestamptz)'
      into v_role using p_member, public._la_start(sy);
  end if;
  select count(*) into v_build_short from public.standing_weeks w
   where w.member_id = p_member and w.week_start between s.build_season_start and s.build_season_end and not w.excused and not w.suspended and w.hours < s.build_weekly_hours;
  select count(*) into v_safety from public.safety_violations where member_id = p_member and public._la_date(logged_at) >= sy;
  select count(*) into v_written from public.discipline_records where member_id = p_member and level in ('written', 'suspension', 'removal') and public._la_date(created_at) >= sy;
  return jsonb_build_array(
    jsonb_build_object('key', 'standing', 'label', 'A full season with no meetings or hours probation',
      'met', not exists (select 1 from public.standing_records where member_id = p_member and kind in ('meetings', 'hours', 'removal') and opened_on >= sy)),
    jsonb_build_object('key', 'build_hours', 'label', '10 signed-in hours every build-season week',
      'met', v_build_short = 0, 'detail', v_build_short || ' short weeks'),
    jsonb_build_object('key', 'competitions', 'label', 'Every competition, every day', 'met', v_comp_miss = 0, 'detail', v_comp_miss || ' days missed'),
    jsonb_build_object('key', 'role', 'label', 'An assigned role at a competition or hosted event', 'met', v_role),
    jsonb_build_object('key', 'conduct', 'label', 'At most one safety violation and no written warning',
      'met', v_safety <= 1 and v_written = 0, 'detail', v_safety || ' safety, ' || v_written || ' written'),
    jsonb_build_object('key', 'grades', 'label', 'A 2.0 GPA or higher at every grade check',
      'met', not exists (select 1 from public.grade_checks where member_id = p_member and below and check_date >= sy)),
    jsonb_build_object('key', 'training', 'label', 'SAFE-1, RESP-1 and sub-team training complete',
      'met', not exists (select 1 from jsonb_array_elements(v_train) x where (x ->> 'required')::boolean and not (x ->> 'held')::boolean)),
    jsonb_build_object('key', 'volunteer', 'label', '10 volunteer hours, FLL included', 'met', v_vol >= 10, 'detail', v_vol || ' hours'),
    jsonb_build_object('key', 'contribution', 'label', 'A clear contribution to your sub-team, confirmed by its lead and a mentor',
      'met', exists (select 1 from public.letter_contributions where member_id = p_member and season_start = sy)));
end;
$fn$;

-- The member page extras, read alongside member_standing.
create or replace function public.member_extras(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
begin
  if not public._can_see_member(p_member) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'onboarding', public._onboarding_json(p_member),
    'training', public._training_list(p_member),
    'letter', public._letter_json(p_member),
    'shop_tools', case when public._standing_member(p_member) then (public._onboarding_json(p_member) ->> 'done')::boolean else true end,
    'medical_on_file', exists (select 1 from public.member_medical where member_id = p_member),
    'photo_exception', exists (select 1 from public.media_exceptions where member_id = p_member));
end;
$fn$;
revoke execute on function public.member_extras(uuid) from public, anon;
grant execute on function public.member_extras(uuid) to authenticated;

-- ── 9. Deadlines: the checklist and training ─────────────────────────────────
create or replace function public.onboarding_deadline_check()
returns integer language plpgsql security definer set search_path = public
as $fn$
declare r record; o jsonb; n integer := 0; s public.standing_settings;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  select * into s from public.standing_settings;
  for r in select p.id from public.profiles p where public._standing_member(p.id) loop
    o := public._onboarding_json(r.id);
    if not (o ->> 'done')::boolean and (o ->> 'due')::date < public._la_today() and (o ->> 'due')::date >= s.starts_on then
      perform public._propose_removal(r.id, 'The first-two-weeks checklist was due ' || (o ->> 'due') || ' and is not done: the acceptance is withdrawn.', public._la_today());
      n := n + 1;
    end if;
  end loop;
  if public._la_today() > s.training_due then
    for r in select p.id from public.profiles p where public._standing_member(p.id) loop
      if exists (select 1 from jsonb_array_elements(public._training_list(r.id)) x where (x ->> 'required')::boolean and not (x ->> 'held')::boolean)
         and public._member_since(r.id) <= s.training_due then
        perform public._propose_removal(r.id, 'Sub-team training was due ' || s.training_due || ' and is not complete.', public._la_today());
        n := n + 1;
      end if;
    end loop;
  end if;
  return n;
end;
$fn$;
revoke execute on function public.onboarding_deadline_check() from public, anon;
grant execute on function public.onboarding_deadline_check() to authenticated;
select cron.unschedule('onboarding-deadline-daily') where exists (select 1 from cron.job where jobname = 'onboarding-deadline-daily');
select cron.schedule('onboarding-deadline-daily', '40 13 * * *', $cron$ select public.onboarding_deadline_check() $cron$);

-- ── 10. The family link ──────────────────────────────────────────────────────
-- Each application carries parent_token (supabase/parent_responses.sql), a
-- random uuid hidden from every client. The family page /family/<token> calls
-- this one function with the anon key; it never touches a table. Staff
-- replace a shared link with staff_rotate_parent_token.
create or replace function public.family_call(p_token uuid, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare
  a record;
  v_ver text;
begin
  select id, member_id, parent_name into a from public.member_applications where parent_token = p_token
   order by submitted_at desc limit 1;
  if a.id is null then raise exception 'This link is not valid' using errcode = 'P0002'; end if;
  v_ver := (select version from public.handbook_versions order by published_at desc limit 1);
  if p_action = 'summary' then
    return jsonb_build_object(
      'student', public._member_name(a.member_id),
      'parent_name', a.parent_name,
      'onboarding', public._onboarding_json(a.member_id),
      'medical', (select to_jsonb(m) - 'updated_by' from public.member_medical m where m.member_id = a.member_id),
      'version', v_ver,
      'signed', exists (select 1 from public.parent_acknowledgments where application_id = a.id and version = v_ver),
      'standing', jsonb_build_object(
        'label', case when exists (select 1 from public.standing_records where member_id = a.member_id and status in ('open', 'proposed')) then 'probation' else 'good' end,
        'records', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'reason', reason, 'status', status, 'opened_on', opened_on) order by opened_on desc), '[]')
                      from public.standing_records where member_id = a.member_id and status in ('open', 'proposed')),
        'weeks', (select coalesce(jsonb_agg(jsonb_build_object('week_start', week_start, 'hours', hours, 'required', required, 'ok', ok) order by week_start desc), '[]')
                    from (select * from public.standing_weeks where member_id = a.member_id order by week_start desc limit 6) w)));
  elsif p_action = 'medical_save' then
    perform public._save_medical(a.member_id, p_args, null, coalesce(nullif(btrim(p_args ->> 'by_name'), ''), a.parent_name, 'Parent'));
    return jsonb_build_object('ok', true);
  elsif p_action = 'groupme' then
    insert into public.onboarding_items (member_id, item, note) values (a.member_id, 'groupme', 'From the family link')
    on conflict (member_id, item) do nothing;
    return jsonb_build_object('ok', true);
  elsif p_action = 'sign' then
    if coalesce(p_args ->> 'version', '') <> v_ver then raise exception 'Sign the current version' using errcode = '22023'; end if;
    insert into public.parent_acknowledgments (application_id, member_id, version, parent_name)
    values (a.id, a.member_id, v_ver, btrim(coalesce(p_args ->> 'name', '')))
    on conflict (application_id, version) do nothing;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Unknown action' using errcode = '22023';
end;
$fn$;
revoke execute on function public.family_call(uuid, text, jsonb) from public;
grant execute on function public.family_call(uuid, text, jsonb) to anon, authenticated;

-- A shared link is replaced: a new token, and the parents emailed the new one.
create or replace function public.staff_send_family_link(p_member uuid, p_rotate boolean)
returns integer language plpgsql security definer set search_path = public
as $fn$
declare a record; n integer := 0; e text;
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select id, parent_token, parent_email into a from public.member_applications where member_id = p_member order by submitted_at desc limit 1;
  if a.id is null then raise exception 'No application on file' using errcode = 'P0002'; end if;
  if p_rotate then
    update public.member_applications set parent_token = gen_random_uuid() where id = a.id returning parent_token into a.parent_token;
  end if;
  foreach e in array public._parent_emails(p_member) loop
    insert into public.notice_outbox (to_email, subject, body, member_id, kind)
    values (e, 'Techmen 5669: your family link for ' || public._member_name(p_member),
            'This private link opens ' || public._member_name(p_member) || '''s page in the team app, with no account: attendance, hours and standing, the checklist, emergency information and the handbook signature.'
            || chr(10) || chr(10) || 'https://frc-app-liard.vercel.app/family/' || a.parent_token
            || chr(10) || chr(10) || 'Anyone with it sees the page, so never share it. A shared link is replaced.', p_member, 'family_link');
    n := n + 1;
  end loop;
  return n;
end;
$fn$;
revoke execute on function public.staff_send_family_link(uuid, boolean) from public, anon;
grant execute on function public.staff_send_family_link(uuid, boolean) to authenticated;

-- ── 11. Emergency sheet for staff ────────────────────────────────────────────
create or replace function public.staff_emergency_sheet()
returns table (member_id uuid, name text, contact1 text, contact2 text, conditions text, allergies text, medicines text, carried_meds text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $fn$
begin
  if not public.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  return query
  select p.id, public._member_name(p.id),
         m.contact1_name || ' ' || m.contact1_phone || coalesce(' (' || m.contact1_relation || ')', ''),
         m.contact2_name || ' ' || m.contact2_phone || coalesce(' (' || m.contact2_relation || ')', ''),
         m.conditions, m.allergies, m.medicines, m.carried_meds, m.updated_at
    from public.profiles p left join public.member_medical m on m.member_id = p.id
   where public._standing_member(p.id)
   order by 2;
end;
$fn$;
revoke execute on function public.staff_emergency_sheet() from public, anon;
grant execute on function public.staff_emergency_sheet() to authenticated;
