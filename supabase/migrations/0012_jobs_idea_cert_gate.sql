-- ============================================================
-- 0012_jobs_idea_cert_gate
--
-- Paste the WHOLE file into the Supabase SQL editor and Run. Re-runnable.
-- Then paste and run 0012_jobs_idea_cert_gate_rls_test.sql.
--
-- WHAT THIS DOES (decision 27, answered 2026-10-14: retire the old skills
-- certification system, and job claiming must not break):
--
--   Job claiming stops reading the old member_skills certifications and reads
--   the IDEA certifications mirror instead (migration 0001). A job may name ONE
--   IDEA certification code. A member may claim that job only while the mirror
--   holds a row with their lowercased sign-in email, that code, status active,
--   and no expiry in the past (the contract rule in
--   docs/IDEA_CERTIFICATIONS_SYNC.md: only an active, unexpired row counts as
--   held). The sign-in email is the one link between a certificate and a
--   person (decision 33); it is read from auth.users by auth.uid(), inside a
--   SECURITY DEFINER function, because profiles has no email column.
--
-- OBJECTS
--   public.task_idea_cert_requirements   one row per job that has been DECIDED:
--       code text   the IDEA code the job requires, or null for no requirement
--       source      admin    set by an admin through admin_set_task_cert
--                   mapped   carried over from the old skill requirement here
--                   unmapped the old requirement had no unambiguous IDEA code,
--                            so the job was left with no requirement
--     A job with NO row has no requirement. There is deliberately no foreign
--     key from code to idea_cert_catalog: every sync replaces that catalog
--     wholesale (delete then insert), and a foreign key would make the sync
--     fail the moment a job named a code. A code that leaves the catalog stays
--     on the job, and nobody can claim it until an admin changes it; the jobs
--     page says so.
--   public.admin_set_task_cert(uuid, text)   admin only (42501 otherwise)
--   public.idea_cert_caller_holds(text)      does the caller hold this code
--   public._idea_cert_map_jobs()             the one-time carry-over, below
--   public.claim_task(uuid)                  REPLACED (same signature)
--
-- WHAT IS NOT TOUCHED: every idea_cert_* table and idea_cert_sync(). The old
-- tables skills, member_skills, cert_requests and task_required_skills keep
-- every row; after this file nothing in the claim path reads them.
--
-- THE CARRY-OVER. For every job that has old required skills and no row here
-- yet: each required skill name is compared, trimmed and case-insensitively,
-- with every IDEA catalog code and every IDEA catalog name. The job gets a code
-- only when EVERY one of its required skills matches exactly one catalog code
-- and they all match the SAME code. Anything else (no match, two matches, two
-- skills pointing at two codes) leaves the job with no requirement, recorded
-- as source unmapped. When the catalog is empty (no sync has arrived) nothing
-- is decided at all, so a paste after the first sync still maps. A job an
-- admin has already decided is never touched by a re-paste. The last
-- statement of this file lists every job the carry-over looked at.
--
-- UNDO (returns production to the old gate; loses only the codes set here):
--   paste supabase/jobs_collective_certs.sql again (it restores the old
--   claim_task body), then:
--   drop function if exists public.admin_set_task_cert(uuid, text);
--   drop function if exists public._idea_cert_map_jobs();
--   drop function if exists public.idea_cert_caller_holds(text);
--   drop table if exists public.task_idea_cert_requirements;
--
-- No apostrophes in comments here (supabase/migrations/README.md).
-- ============================================================

-- -- 0. Preconditions ---------------------------------------------------------
do $pre$
begin
  if to_regclass('public.idea_cert_holders') is null or to_regclass('public.idea_cert_catalog') is null then
    raise exception '0012: the IDEA mirror is missing -- apply 0001_idea_certifications_mirror.sql first';
  end if;
  if to_regclass('public.task_claims') is null or to_regclass('public.task_required_skills') is null then
    raise exception '0012: jobs tables missing -- apply supabase/multi_claim_jobs.sql first';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '0012: public.is_admin() missing -- apply supabase/feedback.sql first';
  end if;
end
$pre$;

-- -- 1. The requirement table ---------------------------------------------------
create table if not exists public.task_idea_cert_requirements (
  task_id  uuid        primary key references public.tasks(id) on delete cascade,
  code     text        check (code is null or (code = btrim(code) and length(code) between 1 and 128)),
  source   text        not null check (source in ('admin', 'mapped', 'unmapped')),
  set_by   uuid        references public.profiles(id) on delete set null,
  set_at   timestamptz not null default now()
);

create index if not exists task_idea_cert_requirements_code_idx
  on public.task_idea_cert_requirements (code);

alter table public.task_idea_cert_requirements enable row level security;

-- Every signed-in member reads every requirement, as they read
-- task_required_skills today: a job says what it needs.
drop policy if exists "task_idea_cert_requirements read" on public.task_idea_cert_requirements;
create policy "task_idea_cert_requirements read"
  on public.task_idea_cert_requirements for select to authenticated
  using (true);

-- No write policy for anyone. The bootstrap ALTER DEFAULT PRIVILEGES grants
-- authenticated everything on a new table, so writes are revoked BY NAME and a
-- direct write fails loudly with 42501 instead of silently at 0 rows.
revoke all on table public.task_idea_cert_requirements from public, anon, authenticated;
grant select on table public.task_idea_cert_requirements to authenticated;

-- -- 2. Does the caller hold a code -------------------------------------------
-- SECURITY DEFINER: auth.users is unreadable to clients. Callable by any
-- signed-in member about themselves only; it takes no member argument.
create or replace function public.idea_cert_caller_holds(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.idea_cert_holders h
      join auth.users u on h.email = lower(btrim(u.email))
     where u.id = auth.uid()
       and h.code = p_code
       and h.status = 'active'
       and (h.expires_at is null or h.expires_at > now()));
$fn$;

revoke all on function public.idea_cert_caller_holds(text) from public, anon, authenticated;
grant execute on function public.idea_cert_caller_holds(text) to authenticated;

-- -- 3. Admin sets or clears a job requirement --------------------------------
-- p_code null or blank clears it (the job then has no requirement). Any other
-- value must be a code in the IDEA catalog right now.
create or replace function public.admin_set_task_cert(p_task uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only an admin can set a job certification requirement' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tasks where id = p_task) then
    raise exception 'Task not found';
  end if;
  if v_code is not null and not exists (select 1 from public.idea_cert_catalog c where c.code = v_code) then
    raise exception 'Not an IDEA certification code: %', v_code using errcode = '22023';
  end if;

  insert into public.task_idea_cert_requirements (task_id, code, source, set_by, set_at)
  values (p_task, v_code, 'admin', auth.uid(), now())
  on conflict (task_id) do update
     set code = excluded.code, source = 'admin', set_by = excluded.set_by, set_at = excluded.set_at;

  return v_code;
end;
$fn$;

revoke all on function public.admin_set_task_cert(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_task_cert(uuid, text) to authenticated;

-- -- 4. The carry-over -----------------------------------------------------------
-- Not callable by any client; the migration and the test call it as owner.
-- Returns how many jobs it decided.
create or replace function public._idea_cert_map_jobs()
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n int;
begin
  if not exists (select 1 from public.idea_cert_catalog) then
    return 0;
  end if;

  with req as (
    select trs.task_id, trs.skill_id, lower(btrim(s.name)) as skill_name
      from public.task_required_skills trs
      join public.skills s on s.id = trs.skill_id
     where not exists (select 1 from public.task_idea_cert_requirements r where r.task_id = trs.task_id)
  ),
  per_skill as (
    select req.task_id, req.skill_id,
           count(distinct c.code) as n_codes,
           min(c.code)            as one_code
      from req
      left join public.idea_cert_catalog c
        on lower(btrim(c.code)) = req.skill_name or lower(btrim(c.name)) = req.skill_name
     group by req.task_id, req.skill_id
  ),
  per_task as (
    select task_id,
           bool_and(n_codes = 1)      as all_single,
           count(distinct one_code)   as n_distinct,
           min(one_code)              as the_code
      from per_skill
     group by task_id
  )
  insert into public.task_idea_cert_requirements (task_id, code, source, set_by, set_at)
  select task_id,
         case when all_single and n_distinct = 1 then the_code end,
         case when all_single and n_distinct = 1 then 'mapped' else 'unmapped' end,
         null, now()
    from per_task
  on conflict (task_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function public._idea_cert_map_jobs() from public, anon, authenticated;

-- -- 5. claim_task, replaced -------------------------------------------------------
-- Same signature, same checks in the same order as
-- supabase/jobs_collective_certs.sql (lock the task, open, not already
-- claimed, capacity), with the certification check moved to the IDEA mirror.
-- task_required_skills and member_skills are no longer read.
create or replace function public.claim_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status   text;
  v_max      int;
  v_count    int;
  v_code     text;
begin
  -- Lock the task row first so concurrent claimers serialize on it.
  select status, max_claimants into v_status, v_max
  from public.tasks where id = p_task for update;
  if v_status is null then
    raise exception 'Task not found';
  end if;
  if v_status <> 'open' then
    raise exception 'Task is not open for claiming';
  end if;

  if exists (select 1 from public.task_claims where task_id = p_task and member_id = auth.uid()) then
    raise exception 'You have already claimed this task';
  end if;

  if v_max is not null then
    select count(*) into v_count from public.task_claims where task_id = p_task;
    if v_count >= v_max then
      raise exception 'This job is full';
    end if;
  end if;

  -- IDEA certification gate.
  select r.code into v_code
    from public.task_idea_cert_requirements r where r.task_id = p_task;
  if v_code is not null and not public.idea_cert_caller_holds(v_code) then
    raise exception 'This job needs the IDEA certification %. Certifications are earned at ideabosco.com/certifications', v_code
      using errcode = '42501';
  end if;

  insert into public.task_claims (task_id, member_id, status, claimed_at)
  values (p_task, auth.uid(), 'claimed', now());
end;
$fn$;

grant execute on function public.claim_task(uuid) to authenticated;

-- -- 6. Run the carry-over, then report what it decided ----------------------------
select public._idea_cert_map_jobs();

-- The result grid of this paste: every job that had an old skill requirement,
-- what it now requires, and why. Jobs listed with requires_now empty have no
-- requirement; an admin sets one on the Jobs page.
select t.title,
       t.status                                       as job_status,
       string_agg(s.name, ', ' order by s.name)       as old_required_skills,
       r.code                                         as requires_now,
       coalesce(r.source, 'not decided: no IDEA catalog yet') as how
  from public.tasks t
  join public.task_required_skills trs on trs.task_id = t.id
  join public.skills s on s.id = trs.skill_id
  left join public.task_idea_cert_requirements r on r.task_id = t.id
 group by t.id, t.title, t.status, r.code, r.source
 order by (r.code is null) desc, t.title;
