-- Security recheck of audit items 1, 6, 7 and 52; decisions 06-10/14 stay open.
-- Applied by migrate.yml on push. Re-runnable, no stored attendance is changed.
-- Rollback: drop attendance_00_client_integrity and its function, and restore
-- calendar functions/grants from calendar_token.sql. Keep internal revokes:
-- reopening them is not a safe rollback. Rollback of token grants reopens item 52.

-- SECURITY INVOKER intentionally distinguishes direct clients (including the
-- invoker attendance_record RPC) from checked SECURITY DEFINER staff paths.
create or replace function public._attendance_client_integrity()
returns trigger language plpgsql set search_path = public
as $fn$
begin
  if current_user in ('anon','authenticated') then
    if coalesce(new.verified,false) or coalesce(new.manual_entry,false) or new.overridden_by is not null then
      raise exception 'Staff attendance fields require the staff tools' using errcode='42501';
    end if;
    if coalesce(new.category,'build') not in ('build','volunteer') then
      raise exception 'Use a staff tool for this attendance category' using errcode='42501';
    end if;
    new.event_time := now();
  end if;
  return new;
end $fn$;
revoke all on function public._attendance_client_integrity() from public, anon, authenticated, service_role;
drop trigger if exists attendance_00_client_integrity on public.attendance_events;
create trigger attendance_00_client_integrity before insert on public.attendance_events
for each row execute function public._attendance_client_integrity();

-- Internal trigger and scheduled dispatch functions execute as their owner.
-- Default EXECUTE grants, including named anon grants, must be removed.
do $acl$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.prorettype='trigger'::regtype or p.proname in
      ('auto_close_open_checkins','invoke_cron_notify','notify_schedule_change','invoke_discord_calendar','_apply_event_edit'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
  end loop;
end $acl$;

-- A table grant subsumes a column revoke. Rebuild the authenticated profile
-- SELECT/INSERT/UPDATE list from the catalog, excluding the capability secret.
-- Preserve the frozen own-row policies pending decision 06.
revoke select,insert,update on public.profiles from public,anon,authenticated;
do $columns$
declare c record;
begin
  for c in select attname from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke select(%I),insert(%I),update(%I) on public.profiles from public,anon,authenticated',c.attname,c.attname,c.attname);
    if c.attname <> 'calendar_token' then
      execute format('grant select(%I),insert(%I),update(%I) on public.profiles to authenticated',c.attname,c.attname,c.attname);
    end if;
  end loop;
end $columns$;

create or replace function public.get_calendar_token()
returns uuid language plpgsql security definer set search_path=public
as $fn$
declare v uuid;
begin
  select calendar_token into v from public.profiles where id=auth.uid() and approved and status='active';
  if v is null then raise exception 'Active approved membership required' using errcode='42501'; end if;
  return v;
end $fn$;
create or replace function public.rotate_calendar_token()
returns uuid language plpgsql security definer set search_path=public
as $fn$
declare v uuid;
begin
  update public.profiles set calendar_token=gen_random_uuid() where id=auth.uid() and approved and status='active'
    returning calendar_token into v;
  if v is null then raise exception 'Active approved membership required' using errcode='42501'; end if;
  return v;
end $fn$;
revoke all on function public.get_calendar_token() from public,anon,authenticated,service_role;
revoke all on function public.rotate_calendar_token() from public,anon,authenticated,service_role;
grant execute on function public.get_calendar_token() to authenticated;
grant execute on function public.rotate_calendar_token() to authenticated;
