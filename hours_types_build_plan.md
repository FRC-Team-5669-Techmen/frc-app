# Hour Types & Seasons - Build Plan

## What this is
Splits hours along two independent dimensions:
- By season (time period): offseason vs on-season. Date-driven, automatic.
- By type: regular shop time (tap-based) vs volunteering / outreach / competition
  (manually logged and mentor-verified).

## Decisions baked in
- Offseason runs through 2027-01-06. Biocore on-season starts 2027-01-07.
- Types: regular, volunteering, outreach, competition.
- Regular hours stay exactly as they are: tap in/out at the shop. No change to check-in.
- Volunteering, outreach, and competition are logged manually by the member and must be
  verified by a mentor before they count. Only verified hours appear in official totals.
- Depends on the is_staff() function from the skills migration (already run).

---

## Step 1 - Database migration (run in Supabase SQL editor)

```sql
-- 1. Seasons. An hour buckets into the season whose date range contains its date.
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date,            -- null means ongoing
  created_at timestamptz not null default now()
);

insert into public.seasons (name, start_date, end_date) values
  ('Offseason 2026', '2026-05-01', '2027-01-06'),
  ('Biocore 2027',   '2027-01-07', null)
on conflict (name) do nothing;
-- Adjust the offseason start date if you have earlier hours to capture.

-- 2. Activity type on tap-based attendance (defaults to regular shop time).
alter table public.attendance_events
  add column if not exists type text not null default 'regular';

-- 3. Manually logged, mentor-verified hours (volunteering / outreach / competition).
create table if not exists public.logged_hours (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  hours numeric(5,2) not null check (hours > 0),
  type text not null check (type in ('volunteering','outreach','competition')),
  description text,
  status text not null default 'pending'
    check (status in ('pending','verified','rejected')),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.seasons enable row level security;
alter table public.logged_hours enable row level security;

drop policy if exists "seasons readable by authenticated" on public.seasons;
create policy "seasons readable by authenticated"
  on public.seasons for select to authenticated using (true);

drop policy if exists "seasons managed by staff" on public.seasons;
create policy "seasons managed by staff"
  on public.seasons for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "logged_hours readable by authenticated" on public.logged_hours;
create policy "logged_hours readable by authenticated"
  on public.logged_hours for select to authenticated using (true);

-- A member can submit their own entries as pending; staff can log on anyone's behalf.
drop policy if exists "logged_hours insert own pending or staff" on public.logged_hours;
create policy "logged_hours insert own pending or staff"
  on public.logged_hours for insert to authenticated
  with check ((member_id = auth.uid() and status = 'pending') or public.is_staff());

-- Only staff can verify or reject (update).
drop policy if exists "logged_hours update by staff" on public.logged_hours;
create policy "logged_hours update by staff"
  on public.logged_hours for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- A member can delete their own still-pending entry to fix a mistake; staff can delete any.
drop policy if exists "logged_hours delete own pending or staff" on public.logged_hours;
create policy "logged_hours delete own pending or staff"
  on public.logged_hours for delete to authenticated
  using ((member_id = auth.uid() and status = 'pending') or public.is_staff());
```

---

## Step 2 - UI build (Claude Code, one milestone at a time)

### Milestone A - Log hours (member)
> Build a "Log Hours" feature where a member submits volunteering, outreach, or
> competition hours: a form with date, hours, type (volunteering / outreach /
> competition), and a description. It creates a logged_hours row with status pending.
> Show the member their own logged entries with their status (pending, verified,
> rejected), and let them delete their own pending entries. Commit and push.

### Milestone B - Verify (staff only)
> Build a staff-only verification screen, gated by is_staff(), listing pending
> logged_hours from all members. Staff can approve (set status verified, verified_by
> to the current user, verified_at to now) or reject (status rejected). Commit and push.

### Milestone C - Reporting breakdown
> Update My Hours and the Team Hours board to break hours down by season and by type.
> Use the seasons table to bucket every hour by its date. Regular hours come from
> attendance_events (paired in/out). Volunteering, outreach, and competition hours come
> from logged_hours, counting only verified entries and excluding pending and rejected.
> Show per-season totals and a by-type breakdown, combining both sources. Leave the
> check-in route untouched. Commit and push.

---

## Deferred (not in v1)
- Tappable non-regular types, once you have NFC tags placed at events / competition.
- Auto-rolling seasons or per-season hour requirements.
