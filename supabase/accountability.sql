-- Accountability / eligibility tooling: per-season hour goals (team default +
-- per-member override) and a geofence-result column on attendance_events for the
-- anomaly review list. Builds on the category + integrity work.
--
-- Run once in the Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) geo_ok on attendance_events — was the geofence satisfied at this check-in?
--    Set by the check-in routes: true = verified in range; false = the member is
--    geofence-exempt and skipped the fence (location NOT verified). null = legacy
--    / not applicable (staff override, manual entry, auto-close, check-outs).
--    The anomaly list flags an IN with geo_ok = false whose member is NOT
--    currently exempt (checked in without location proof and no exemption).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.attendance_events
  add column if not exists geo_ok boolean;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) hour_goals — per-season minimum hours.
--    member_id null  → team default for that season.
--    member_id set   → that member's override for that season (wins over default).
--    categories null → all six categories count toward the goal; otherwise only
--    the listed subset counts. Folds attendance-derived + verified logged hours
--    (the client computes progress from buildBreakdown, which already merges both).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.hour_goals (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid references public.profiles(id) on delete cascade,   -- null = team default
  season_id    uuid not null references public.seasons(id) on delete cascade,
  target_hours numeric(6,2) not null check (target_hours >= 0),
  categories   text[],                                                   -- null/empty = all categories
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now()
);

-- One team default per season; one override per (member, season).
create unique index if not exists hour_goals_team_season_uidx
  on public.hour_goals (season_id) where member_id is null;
create unique index if not exists hour_goals_member_season_uidx
  on public.hour_goals (member_id, season_id) where member_id is not null;

alter table public.hour_goals enable row level security;
-- Members read the team default + their own override; staff read all. Writes go
-- through the SECURITY DEFINER RPCs only (no insert/update/delete policies).
drop policy if exists "hg read team" on public.hour_goals;
drop policy if exists "hg read own"  on public.hour_goals;
drop policy if exists "hg staff read" on public.hour_goals;
create policy "hg read team"  on public.hour_goals for select using (member_id is null);
create policy "hg read own"   on public.hour_goals for select using (member_id = auth.uid());
create policy "hg staff read" on public.hour_goals for select using (public.is_staff());
grant select on public.hour_goals to authenticated;

-- 2a) Upsert a goal (team default when p_member is null, else a member override).
create or replace function public.set_hour_goal(
  p_member uuid, p_season uuid, p_target numeric, p_categories text[]
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare v_cats text[];
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  if p_season is null then raise exception 'A season is required'; end if;
  if p_target is null or p_target < 0 then raise exception 'Target hours must be 0 or more'; end if;

  v_cats := nullif(p_categories, '{}');   -- empty array → null (all categories)
  if v_cats is not null and not (v_cats <@ array['build','outreach','volunteer','competition','fundraising','mentoring']) then
    raise exception 'Invalid category in goal';
  end if;

  update public.hour_goals
     set target_hours = p_target, categories = v_cats, updated_by = auth.uid(), updated_at = now()
   where season_id = p_season and member_id is not distinct from p_member;
  if not found then
    insert into public.hour_goals (member_id, season_id, target_hours, categories, updated_by)
    values (p_member, p_season, p_target, v_cats, auth.uid());
  end if;
end;
$fn$;
grant execute on function public.set_hour_goal(uuid, uuid, numeric, text[]) to authenticated;

-- 2b) Clear a member override (reverts them to the team default). Team default
--     (p_member null) is cleared the same way if ever needed.
create or replace function public.clear_hour_goal(p_member uuid, p_season uuid)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.is_staff() then raise exception 'Permission denied: staff role required'; end if;
  delete from public.hour_goals where season_id = p_season and member_id is not distinct from p_member;
end;
$fn$;
grant execute on function public.clear_hour_goal(uuid, uuid) to authenticated;
