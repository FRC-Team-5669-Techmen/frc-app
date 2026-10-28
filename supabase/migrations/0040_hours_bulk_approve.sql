-- ============================================================
-- 0040: approve every pending logged-hours entry on /verify-hours at once
-- (feedback c4f9a940, ledger 0028c). Needs the frozen logged_hours.sql,
-- logged_hours_verify_cols.sql and skills_catalog.sql (is_staff) only.
-- Re-runnable (create or replace). Changes no table, policy or grant on a
-- table.
--
-- WHY A FUNCTION AND NOT A LOOP. The single Approve button calls
-- staff_review_logged_hours (0019), an UPDATE that answers success even when
-- it matched no row (an entry already reviewed in another tab, or removed).
-- A loop of it could not tell the page which entries were really approved.
-- This is one UPDATE in one transaction: it approves exactly the listed
-- entries that are still pending, and RETURNS those rows, so the page
-- reports what the database changed and nothing else.
--
-- WHO. Staff only (mentor, lead, admin through is_staff). SECURITY INVOKER,
-- so the logged_hours update policy (lh staff update) still decides too.
-- An entry that is verified or rejected already is left exactly as it is.
--
-- TO UNDO: drop function if exists public.staff_approve_logged_hours(uuid[]);
-- (approvals it made stay approved; reject one by one on /verify-hours, or
-- set status back to pending by hand, if that is ever wanted).
-- ============================================================

-- Does: Approve every listed hours entry that is still waiting, and answer the ones approved.
create or replace function public.staff_approve_logged_hours(p_entries uuid[])
returns table (id uuid, hours numeric)
language plpgsql security invoker set search_path = public
as $fn$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'Only staff can approve hours' using errcode = '42501';
  end if;
  return query
    update public.logged_hours l
       set status = 'verified', verified_by = auth.uid(), verified_at = now()
     where l.id = any(coalesce(p_entries, '{}'::uuid[]))
       and l.status = 'pending'
    returning l.id, l.hours::numeric;
end
$fn$;

revoke all on function public.staff_approve_logged_hours(uuid[]) from public, anon;
grant execute on function public.staff_approve_logged_hours(uuid[]) to authenticated;
