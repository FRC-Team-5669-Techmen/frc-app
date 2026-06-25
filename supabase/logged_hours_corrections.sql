-- Logged-hours correction requests.
--
-- A member can flag one of their OWN logged_hours entries (manual off-site hours)
-- and propose a corrected category / duration / date with a short reason. The
-- change is NOT applied directly: it creates a pending request that staff review
-- and either approve (apply the change to the underlying logged_hours row + mark
-- resolved) or reject (mark resolved, no change). This mirrors session_corrections
-- (attendance sessions, session_integrity.sql) but targets the logged_hours table.
--
-- RLS: a member sees only their own requests; staff (is_staff()) see all. Every
-- write goes through the SECURITY DEFINER RPCs below — client-side cross-user
-- writes are silently blocked by RLS, so the privileged transitions live here.
--
-- Run once in the Supabase SQL editor BEFORE testing.

create table if not exists public.logged_hours_corrections (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.profiles(id)     on delete cascade,
  entry_id        uuid not null references public.logged_hours(id) on delete cascade,
  note            text not null,                  -- member's explanation (required)
  proposed_type   text,                           -- new category, null = leave as-is
  proposed_hours  numeric,                        -- new duration in hours, null = leave as-is
  proposed_date   date,                           -- new date, null = leave as-is
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolution_note text,
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists lhc_pending_idx on public.logged_hours_corrections (status, created_at desc);
create index if not exists lhc_member_idx  on public.logged_hours_corrections (member_id, created_at desc);
-- At most one OPEN (pending) request per entry — keeps the queue clean and makes
-- the member-side "correction pending" state unambiguous.
create unique index if not exists lhc_one_pending_per_entry
  on public.logged_hours_corrections (entry_id) where status = 'pending';

alter table public.logged_hours_corrections enable row level security;
-- Member reads own; staff read all. All writes go through the RPCs below.
drop policy if exists "lhc member select own" on public.logged_hours_corrections;
drop policy if exists "lhc staff select"      on public.logged_hours_corrections;
create policy "lhc member select own" on public.logged_hours_corrections for select using (member_id = auth.uid());
create policy "lhc staff select"      on public.logged_hours_corrections for select using (public.is_staff());
grant select on public.logged_hours_corrections to authenticated;

-- Member submits a correction request against their OWN logged_hours entry.
create or replace function public.request_logged_hours_correction(
  p_entry uuid, p_note text,
  p_proposed_type text, p_proposed_hours numeric, p_proposed_date date
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare v_id uuid; v_owner uuid;
begin
  if p_note is null or btrim(p_note) = '' then raise exception 'A reason is required'; end if;

  select member_id into v_owner from public.logged_hours where id = p_entry;
  if v_owner is null then raise exception 'Entry not found'; end if;
  if v_owner <> auth.uid() then raise exception 'That entry is not yours'; end if;

  if p_proposed_type is not null
     and p_proposed_type not in ('build', 'outreach', 'volunteer', 'competition', 'fundraising', 'mentoring') then
    raise exception 'Invalid category: %', p_proposed_type;
  end if;
  if p_proposed_hours is not null and (p_proposed_hours <= 0 or p_proposed_hours > 24) then
    raise exception 'Hours must be between 0 and 24';
  end if;
  if p_proposed_date is not null and p_proposed_date > current_date then
    raise exception 'Date cannot be in the future';
  end if;
  if exists (select 1 from public.logged_hours_corrections
               where entry_id = p_entry and status = 'pending') then
    raise exception 'A correction request is already pending for this entry';
  end if;

  insert into public.logged_hours_corrections
    (member_id, entry_id, note, proposed_type, proposed_hours, proposed_date)
  values (auth.uid(), p_entry, p_note, p_proposed_type, p_proposed_hours, p_proposed_date)
  returning id into v_id;
  return v_id;
end;
$fn$;
grant execute on function public.request_logged_hours_correction(uuid, text, text, numeric, date) to authenticated;

-- Staff approve (optionally with edited values) or reject. Approval applies the
-- coalesced change (explicit p_apply_* when given, else the member's proposal)
-- to the underlying logged_hours row and marks the request resolved. Idempotent.
create or replace function public.resolve_logged_hours_correction(
  p_id uuid, p_approve boolean, p_resolution text,
  p_apply_type text, p_apply_hours numeric, p_apply_date date
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare r public.logged_hours_corrections; v_type text; v_hours numeric; v_date date;
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;

  select * into r from public.logged_hours_corrections where id = p_id for update;
  if r.id is null then raise exception 'Correction not found'; end if;
  if r.status <> 'pending' then return; end if;   -- idempotent

  if p_approve then
    v_type  := coalesce(p_apply_type,  r.proposed_type);
    v_hours := coalesce(p_apply_hours, r.proposed_hours);
    v_date  := coalesce(p_apply_date,  r.proposed_date);

    if v_type is not null
       and v_type not in ('build', 'outreach', 'volunteer', 'competition', 'fundraising', 'mentoring') then
      raise exception 'Invalid category: %', v_type;
    end if;
    if v_hours is not null and (v_hours <= 0 or v_hours > 24) then
      raise exception 'Hours must be between 0 and 24';
    end if;

    update public.logged_hours
       set type  = coalesce(v_type,  type),
           hours = coalesce(v_hours, hours),
           date  = coalesce(v_date,  date)
     where id = r.entry_id;

    update public.logged_hours_corrections
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = p_resolution
     where id = p_id;
  else
    update public.logged_hours_corrections
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = p_resolution
     where id = p_id;
  end if;
end;
$fn$;
grant execute on function public.resolve_logged_hours_correction(uuid, boolean, text, numeric, date) to authenticated;
