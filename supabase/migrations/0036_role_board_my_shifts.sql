-- ============================================================
-- 0036 Role board: Home keeps showing an event while you hold a shift in it
-- (ledger 0029). Needs 0031.
--
-- 0031's role_board_open_events() listed an upcoming event only while its
-- board still had unfilled boxes, so the moment a board filled, Home lost the
-- link to every student's shifts at the event itself. It now also lists an
-- event where the caller holds an ASSIGNED slot, and says when their next one
-- starts. The shape is unchanged apart from one new key, next_shift_at; every
-- grant is the same as 0031's, so this file has no _rls_test.sql (it changes
-- no grant, policy or revoke). Re-paste after any re-paste of 0031.
--
-- TO UNDO: paste the role_board_open_events() definition from 0031 again.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('public._role_slot_cells(uuid)') is null or to_regprocedure('public._role_board_member_ok()') is null then
    raise exception '0036 needs 0031_role_board_v2.sql applied first';
  end if;
end
$prereq$;

-- Does: Upcoming competitions whose role board still has unfilled slots (fewer assigned than needed), or where you hold an assigned slot, with how many cells are unfilled and when your next shift starts.
create or replace function public.role_board_open_events()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public._role_board_member_ok() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'title', e.title, 'starts_at', e.starts_at,
             'unfilled', (select count(*) from public._role_slot_cells(e.id) c where c.assigned < c.needed),
             'mine', (select count(*) from public.role_requests r join public.role_slots s on s.id = r.slot_id where s.event_id = e.id and r.member_id = auth.uid()),
             'my_assigned', (select count(*) from public.role_requests r join public.role_slots s on s.id = r.slot_id where s.event_id = e.id and r.member_id = auth.uid() and r.status = 'assigned'),
             'next_shift_at', (select min(s.starts_at) from public.role_requests r join public.role_slots s on s.id = r.slot_id
                                where s.event_id = e.id and r.member_id = auth.uid() and r.status = 'assigned'
                                  and coalesce(s.ends_at, s.starts_at + interval '1 hour') > now()))
             order by e.starts_at)
    from public.events e
   where e.ends_at > now() and e.starts_at < now() + interval '21 days'
     and exists (select 1 from public.role_slots s where s.event_id = e.id)
     and (exists (select 1 from public._role_slot_cells(e.id) c where c.assigned < c.needed)
          or exists (select 1 from public.role_requests r join public.role_slots s on s.id = r.slot_id
                      where s.event_id = e.id and r.member_id = auth.uid() and r.status = 'assigned'))), '[]'::jsonb);
end
$fn$;

revoke all on function public.role_board_open_events() from public, anon;
grant execute on function public.role_board_open_events() to authenticated;
