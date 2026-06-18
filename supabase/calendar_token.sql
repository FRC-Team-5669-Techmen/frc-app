-- ============================================================
-- Calendar subscription token  (Phase 2 of the calendar upgrade)
-- Run once in the Supabase SQL editor.
--
-- Additive + idempotent: gives every existing and new profile a stable,
-- unguessable token used as a capability key for the calendar-feed Edge
-- Function (an .ics subscription URL with no JWT). The token IS the only
-- secret in that URL, so it must never leak to other members.
--
-- profiles is broadly readable by authenticated members (roster, coverage
-- matrix, RSVP attendee embeds). Postgres RLS is row-scoped, not column-scoped,
-- so any selectable row would otherwise hand back calendar_token to anyone who
-- asked for the column. We therefore REVOKE client column access to the token
-- and expose a member's OWN token only through SECURITY DEFINER RPCs scoped to
-- auth.uid(). The Edge Function reads it with the service role, which bypasses
-- both RLS and the column revoke.
--
-- Nothing else on profiles changes.
-- ============================================================

-- ── 1. The token column (default fills every existing row automatically) ─────
alter table public.profiles
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_calendar_token_key
  on public.profiles (calendar_token);

-- ── 2. Keep the token out of every client read/write ────────────────────────
-- Column-level revoke: no client (authenticated or anon) can SELECT or UPDATE
-- this column directly, so no `profiles(calendar_token)` embed can ever return
-- another member's token. service_role is unaffected (it keeps full table grants).
revoke select (calendar_token), update (calendar_token) on public.profiles from authenticated;
revoke select (calendar_token), update (calendar_token) on public.profiles from anon;

-- ── 3. Own-token read + rotate, via SECURITY DEFINER (scoped to auth.uid()) ──
create or replace function public.get_calendar_token()
  returns uuid
  language sql
  security definer
  set search_path = public
as $fn$
  select calendar_token from public.profiles where id = auth.uid();
$fn$;

create or replace function public.rotate_calendar_token()
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_token uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles set calendar_token = v_token where id = auth.uid();
  return v_token;
end;
$fn$;

revoke all on function public.get_calendar_token()    from public, anon;
revoke all on function public.rotate_calendar_token() from public, anon;
grant execute on function public.get_calendar_token()    to authenticated;
grant execute on function public.rotate_calendar_token() to authenticated;
