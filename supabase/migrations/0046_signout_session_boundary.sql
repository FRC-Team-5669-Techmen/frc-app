-- 0046: complete the approved build sign-out boundary.
-- Applied by migrate.yml on main push. Re-runnable; no new tables or columns.
-- Rollback: restore the four functions from 0014. This reopens the old behavior.
-- Existing sessions and requests are preserved. Server/manual attendance remains
-- available to staff; student build breaks stay in the original session.

create or replace function public.attendance_events_self_out_guard()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare v_last record;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then return new; end if;
  -- Serialize self attendance and approval for this member, including two tabs.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 4614));
  select id,type,category into v_last from public.attendance_events
    where user_id=new.user_id order by event_time desc,id desc limit 1;
  if new.type='in' then
    if not public.is_staff() and v_last.type='in' then
      raise exception 'Your session is already open. Keep breaks inside it.' using errcode='22023';
    end if;
    return new;
  end if;
  if new.type <> 'out' then return new; end if;
  -- Historical staff corrections already require an audited reason.
  if public.is_staff() and coalesce(new.manual_entry,false) then return new; end if;
  if new.note is null or length(btrim(new.note)) not between 3 and 1000 then
    raise exception 'Write a short note of what you did' using errcode='22023';
  end if;
  if public.is_staff() then return new; end if;
  if v_last.type='in' and coalesce(v_last.category,'build')='volunteer' then return new; end if;
  raise exception 'Sign-outs need approval: scan out and leave a note' using errcode='42501';
end $fn$;
revoke all on function public.attendance_events_self_out_guard() from public, anon, authenticated;

-- Does: Switch staff from build to FLL with a work note. Students finish build sign-out approval first, then start FLL.
create or replace function public.switch_to_fll(p_location text,p_geo_ok boolean,p_note text default null)
returns uuid language plpgsql security definer set search_path = public
as $fn$
declare v_uid uuid := auth.uid(); v_last record; v_in uuid; v_at timestamptz;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Finish build sign-out approval first, then scan for FLL hours' using errcode='42501';
  end if;
  -- The self-OUT trigger validates the note for this transition too.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,4614));
  select id,type,category,event_time into v_last from public.attendance_events
    where user_id=v_uid order by event_time desc,id desc limit 1;
  if v_last.id is null or v_last.type <> 'in' or coalesce(v_last.category,'build')='volunteer' then
    raise exception 'No build session to switch from' using errcode='P0002';
  end if;
  v_at := greatest(now(),v_last.event_time+interval '1 millisecond');
  insert into public.attendance_events(user_id,type,location,method,event_time,note)
    values(v_uid,'out',coalesce(p_location,'fll-room'),'nfc',v_at,btrim(p_note));
  insert into public.attendance_events(user_id,type,location,method,category,geo_ok,event_time)
    values(v_uid,'in',coalesce(p_location,'fll-room'),'nfc','volunteer',p_geo_ok,v_at+interval '1 millisecond') returning id into v_in;
  update public.signout_requests set status='withdrawn',decided_at=now() where member_id=v_uid and status='pending';
  return v_in;
end $fn$;
revoke all on function public.switch_to_fll(text,boolean,text) from public, anon, authenticated;
grant execute on function public.switch_to_fll(text,boolean,text) to authenticated;

-- Does: Approve the exact build session requested, with its work note, or withdraw an obsolete request without closing a newer session.
create or replace function public.approve_signout(p_request uuid)
returns public.signout_requests language plpgsql security definer set search_path = public
as $fn$
declare v_req public.signout_requests; v_last record; v_out uuid;
begin
  if not public.can_approve_signouts() then
    raise exception 'Only a mentor or a permitted student can approve sign-outs' using errcode='42501';
  end if;
  select * into v_req from public.signout_requests where id=p_request;
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  if v_req.member_id=auth.uid() then
    raise exception 'You cannot approve your own sign-out' using errcode='42501';
  end if;
  -- Match the staff transition: member lock before request-row lock.
  perform pg_advisory_xact_lock(hashtextextended(v_req.member_id::text,4614));
  select * into v_req from public.signout_requests where id=p_request for update;
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  if v_req.status <> 'pending' then return v_req; end if;
  select id,type,event_time into v_last from public.attendance_events
    where user_id=v_req.member_id order by event_time desc,id desc limit 1;
  if v_last.id is distinct from v_req.in_event_id or v_last.type is distinct from 'in' then
    update public.signout_requests set status='withdrawn',decided_by=auth.uid(),decided_at=now(),
      reason='The requested session already ended. Ask again for the current session.'
      where id=p_request returning * into v_req;
    return v_req;
  end if;
  insert into public.attendance_events(user_id,type,location,method,note,cleanup_confirmed,event_time)
    values(v_req.member_id,'out',coalesce(v_req.location,'approved'),'manual',v_req.note,v_req.cleanup_confirmed,
      greatest(now(),v_last.event_time+interval '1 millisecond')) returning id into v_out;
  update public.signout_requests set status='approved',decided_by=auth.uid(),decided_at=now(),out_event_id=v_out
    where id=p_request returning * into v_req;
  return v_req;
end $fn$;
revoke all on function public.approve_signout(uuid) from public, anon, authenticated;
grant execute on function public.approve_signout(uuid) to authenticated;

-- Does: Approve all signouts and count only sessions actually approved, excluding obsolete requests.
create or replace function public.approve_all_signouts()
returns integer language plpgsql security definer set search_path = public
as $fn$
declare r record; v_req public.signout_requests; n integer := 0;
begin
  if not public.can_approve_signouts() then
    raise exception 'Only a mentor or a permitted student can approve sign-outs' using errcode='42501';
  end if;
  for r in select id from public.signout_requests where status='pending' and member_id<>auth.uid() order by requested_at,id loop
    v_req := public.approve_signout(r.id);
    if v_req.status='approved' then n := n+1; end if;
  end loop;
  return n;
end $fn$;
revoke all on function public.approve_all_signouts() from public, anon, authenticated;
grant execute on function public.approve_all_signouts() to authenticated;

-- Internal attendance edits are reached only through checked staff RPCs.
-- Keep this revoke on rollback; restoring client execution reopens the boundary.
revoke all on function public._apply_event_edit(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;
