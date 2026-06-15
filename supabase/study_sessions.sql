-- Self-study tracking: members log daily study minutes; a streak with a single
-- grace day, a 14-day strip, and a staff roster summary are derived in SQL.
-- The daily goal is one global, staff/admin-configurable app_settings row.
-- Run once in the Supabase SQL editor.

-- 1. study_sessions (RLS mirrors logged_hours: own select/insert/delete, staff
-- select all). Multiple rows per day are allowed and summed per day.
create table if not exists public.study_sessions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  minutes    int  not null check (minutes > 0 and minutes <= 1440),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists study_sessions_member_date_idx
  on public.study_sessions (member_id, date);

alter table public.study_sessions enable row level security;

drop policy if exists "study select own" on public.study_sessions;
create policy "study select own" on public.study_sessions
  for select using (member_id = auth.uid());

drop policy if exists "study insert own" on public.study_sessions;
create policy "study insert own" on public.study_sessions
  for insert with check (member_id = auth.uid());

drop policy if exists "study delete own" on public.study_sessions;
create policy "study delete own" on public.study_sessions
  for delete using (member_id = auth.uid());

drop policy if exists "study staff select" on public.study_sessions;
create policy "study staff select" on public.study_sessions
  for select using (public.is_staff());

grant all on public.study_sessions to authenticated;

-- 2. app_settings: the single global daily goal.
-- NOTE: this table already exists (sql/forgotten_checkout.sql) and carries a
-- pre-existing "staff can update settings" UPDATE policy used by the
-- VerifyHoursPage cutoff editor. We add admin write policies below WITHOUT
-- dropping that policy, so UPDATE remains available to staff at the DB layer;
-- the study-goal edit control is gated to admins in the UI.
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

insert into public.app_settings (key, value)
values ('study_daily_goal_minutes', '60')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings read all" on public.app_settings;
create policy "app_settings read all" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "app_settings admin insert" on public.app_settings;
create policy "app_settings admin insert" on public.app_settings
  for insert to authenticated with check (public.has_role('admin'));

drop policy if exists "app_settings admin update" on public.app_settings;
create policy "app_settings admin update" on public.app_settings
  for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "app_settings admin delete" on public.app_settings;
create policy "app_settings admin delete" on public.app_settings
  for delete to authenticated using (public.has_role('admin'));

-- 3. study_current_streak(): walk back from today over goal-met days, allowing a
-- single isolated missed day to bridge the run; two consecutive misses end it.
-- A goal-met day = summed minutes for that date >= the goal.
create or replace function public.study_current_streak(p_member uuid, p_goal int)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today  date := (now() at time zone 'America/Los_Angeles')::date;
  v_streak int  := 0;
  v_cons   int  := 0;   -- consecutive missed days
  v_met    boolean;
  i        int;
begin
  for i in 0..400 loop
    select coalesce(sum(minutes), 0) >= p_goal into v_met
    from public.study_sessions
    where member_id = p_member and date = v_today - i;

    if v_met then
      v_streak := v_streak + 1;
      v_cons   := 0;
    else
      v_cons := v_cons + 1;
      exit when v_cons >= 2;   -- the single grace day bridges; two in a row ends it
    end if;
  end loop;

  return v_streak;
end;
$fn$;

-- 4. study_strip(): last 14 calendar dates classified met / partial / none.
create or replace function public.study_strip(p_member uuid, p_goal int)
returns json
language sql
security definer
set search_path = public
as $fn$
  select coalesce(json_agg(json_build_object(
           'date',    d.day::date,
           'minutes', coalesce(m.mins, 0),
           'status',  case when coalesce(m.mins, 0) >= p_goal then 'met'
                           when coalesce(m.mins, 0) > 0       then 'partial'
                           else 'none' end
         ) order by d.day), '[]'::json)
  from generate_series(
         (now() at time zone 'America/Los_Angeles')::date - 13,
         (now() at time zone 'America/Los_Angeles')::date,
         interval '1 day') as d(day)
  left join (
    select date, sum(minutes) as mins
    from public.study_sessions
    where member_id = p_member
      and date >= (now() at time zone 'America/Los_Angeles')::date - 13
    group by date
  ) m on m.date = d.day::date;
$fn$;

-- 5. study_summary(): the caller's own stats always; the active-member roster
-- summary too when the caller is staff.
create or replace function public.study_summary()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_goal       int;
  v_today      date := (now() at time zone 'America/Los_Angeles')::date;
  v_today_min  int;
  v_result     jsonb;
  v_roster     json;
begin
  select coalesce((select value::int from public.app_settings where key = 'study_daily_goal_minutes'), 60)
    into v_goal;

  select coalesce(sum(minutes), 0) into v_today_min
  from public.study_sessions
  where member_id = auth.uid() and date = v_today;

  v_result := jsonb_build_object(
    'goal_minutes',  v_goal,
    'today_minutes', v_today_min,
    'streak',        public.study_current_streak(auth.uid(), v_goal),
    'strip',         public.study_strip(auth.uid(), v_goal)
  );

  if public.is_staff() then
    select coalesce(json_agg(json_build_object(
             'member_id',     p.id,
             'name',          p.full_name,
             'streak',        public.study_current_streak(p.id, v_goal),
             'days_missed_14', (
               select count(*)
               from generate_series(v_today - 13, v_today, interval '1 day') g(day)
               where coalesce((
                 select sum(s.minutes) from public.study_sessions s
                 where s.member_id = p.id and s.date = g.day::date
               ), 0) < v_goal
             ),
             'strip',         public.study_strip(p.id, v_goal)
           ) order by p.full_name), '[]'::json)
      into v_roster
    from public.profiles p
    where p.status = 'active' and p.approved = true;

    v_result := jsonb_set(v_result, '{roster}', v_roster::jsonb);
  end if;

  return v_result::json;
end;
$fn$;

grant execute on function public.study_summary() to authenticated;
