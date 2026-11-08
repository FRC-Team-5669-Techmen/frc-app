-- Participation folding and verified summer-account transfer. Needs 0049.
-- Applied only by migrate.yml on push. Ships with automatic folding OFF.
-- Rollback: turn folding off; restore folded members through the roster;
-- restore claim_profile from access_requests.sql and standing_evaluate from
-- _standing_evaluate_guarded. Keep the new tables as historical evidence.
-- No account is deleted, unapproved or stripped of roles by folding.

alter table public.profiles drop constraint if exists profiles_status_chk;
alter table public.profiles add constraint profiles_status_chk check (status in ('active','inactive','alumni','folded'));

create table if not exists public.participation_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false
);
insert into public.participation_settings(id) values(true) on conflict do nothing;
create table if not exists public.member_participation (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  keep_active boolean not null default false,
  override_by uuid references public.profiles(id) on delete set null,
  override_at timestamptz,
  folded_at timestamptz,
  reason text,
  record_id uuid references public.standing_records(id) on delete set null
);
alter table public.participation_settings enable row level security;
alter table public.member_participation enable row level security;
revoke all on public.participation_settings, public.member_participation from public, anon, authenticated, service_role;

-- Internal candidate list uses only the existing participation-failure proposal.
-- Grades and discipline are separate. Breaks and excuses are judged upstream.
create or replace function public._fold_candidates()
returns table(member_id uuid, name text, reason text, record_id uuid)
language sql stable security definer set search_path = public
as $fn$
  select r.member_id, public._member_name(r.member_id), r.reason, r.id
  from public.standing_records r
  where r.kind='removal' and r.status='proposed'
    and public._standing_member(r.member_id)
    and (r.reason like 'Short week on probation, week of %'
      or r.reason like 'Missed a meeting on probation, week of %'
      or r.reason like 'Under 80 percent of meetings again, on probation: %')
    and exists (select 1 from public.standing_records failed where failed.member_id=r.member_id
      and failed.kind in ('hours','meetings') and failed.status='failed' and failed.closed_on=r.opened_on)
    and not exists (select 1 from public.member_participation p where p.member_id=r.member_id and p.keep_active);
$fn$;
revoke all on function public._fold_candidates() from public, anon, authenticated, service_role;

do $rename$
begin
  if to_regprocedure('public._standing_evaluate_guarded()') is null then
    alter function public.standing_evaluate() rename to _standing_evaluate_guarded;
  end if;
end
$rename$;
revoke all on function public._standing_evaluate_guarded() from public, anon, authenticated, service_role;
-- Expose the existing hold outcome only inside this transaction. The flag is
-- reset before every public run; callers cannot bypass the hold through it.
do $hold$
declare definition text;
begin
 definition:=pg_get_functiondef('public._standing_evaluate_guarded()'::regprocedure);
 if position('techmen.standing_held' in definition)=0 then
  if position('    return 0;' in definition)=0 then raise exception 'Standing hold prerequisite missing'; end if;
  execute replace(definition,'    return 0;', '    perform set_config(''techmen.standing_held'',''true'',true); return 0;');
 end if;
end
$hold$;


create or replace function public.standing_evaluate()
returns integer language plpgsql security definer set search_path = public
as $fn$
declare n integer; r record;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  -- Serialize evaluation with setting/override changes, including cron.
  perform pg_advisory_xact_lock(5669,49);
  perform set_config('techmen.standing_held','false',true);
  n := public._standing_evaluate_guarded();
  if current_setting('techmen.standing_held',true)='true' then return n; end if;
  if (select enabled from public.participation_settings where id) then
    for r in select * from public._fold_candidates() loop
      update public.profiles set status='folded' where id=r.member_id;
      insert into public.member_participation(member_id,folded_at,reason,record_id)
        values(r.member_id,now(),r.reason,r.record_id)
        on conflict(member_id) do update set folded_at=excluded.folded_at,reason=excluded.reason,record_id=excluded.record_id;
      insert into public.member_admin_log(member_id,actor_id,action,reason,old_value,new_value)
        values(r.member_id,auth.uid(),'set_status',r.reason,'{"status":"active"}',jsonb_build_object('status','folded','record',r.record_id));
    end loop;
  end if;
  return n;
end
$fn$;
revoke all on function public.standing_evaluate() from public, anon, authenticated, service_role;
grant execute on function public.standing_evaluate() to authenticated;

-- Does: Preview who would fold today without saving standing, notices or roster changes.
create or replace function public.admin_preview_folding()
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare candidates jsonb; held boolean;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(5669,49);
  begin
    perform set_config('techmen.standing_held','false',true);
    perform public._standing_evaluate_guarded();
    held:=current_setting('techmen.standing_held',true)='true';
    select coalesce(jsonb_agg(to_jsonb(c) order by name),'[]'::jsonb) into candidates from public._fold_candidates() c;
    if held then candidates:='[]'::jsonb; end if;
    raise exception 'preview rollback' using errcode='P5649';
  exception when sqlstate 'P5649' then null;
  end;
  return jsonb_build_object('enabled',(select enabled from public.participation_settings where id),'candidates',candidates,'held',held,'as_of',now());
end
$fn$;
revoke all on function public.admin_preview_folding() from public, anon, authenticated, service_role;
grant execute on function public.admin_preview_folding() to authenticated;

-- Does: Turn automatic participation folding on or off. Starts off; access is separate.
create or replace function public.admin_set_folding(p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'Choose on or off' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(5669,49);
  update public.participation_settings set enabled=p_enabled where id;
end
$fn$;
revoke all on function public.admin_set_folding(boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_folding(boolean) to authenticated;

-- Does: Read the roster folding reasons, dates and mentor overrides.
create or replace function public.staff_participation()
returns setof public.member_participation language plpgsql stable security definer set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode='42501'; end if;
  return query select * from public.member_participation;
end
$fn$;
revoke all on function public.staff_participation() from public, anon, authenticated, service_role;
grant execute on function public.staff_participation() to authenticated;

-- Does: Keep a member active until the mentor override is withdrawn, or restore a folded member.
create or replace function public.mentor_set_participation(p_member uuid,p_keep_active boolean,p_restore boolean default false)
returns void language plpgsql security definer set search_path = public
as $fn$
declare v_status text;
begin
  if auth.uid() is null or not (public.has_role('mentor') or public.is_admin()) then raise exception 'Mentor or admin only' using errcode='42501'; end if;
  if p_keep_active is null or p_restore is null then raise exception 'Choose the action' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(5669,49);
  select status into v_status from public.profiles where id=p_member for update;
  if not found then raise exception 'Member not found' using errcode='P0002'; end if;
  if p_restore and v_status<>'folded' then raise exception 'Only a folded member can be restored' using errcode='22023'; end if;
  insert into public.member_participation(member_id,keep_active,override_by,override_at)
    values(p_member,p_keep_active,auth.uid(),now()) on conflict(member_id) do update
    set keep_active=excluded.keep_active,override_by=excluded.override_by,override_at=excluded.override_at;
  if p_restore then
    update public.profiles set status='active' where id=p_member and status='folded';
    update public.standing_records set status='dismissed',closed_on=public._la_today(),confirmed_by=auth.uid(),confirmed_at=now()
      where id=(select record_id from public.member_participation where member_id=p_member) and member_id=p_member and kind='removal' and status='proposed';
    insert into public.member_admin_log(member_id,actor_id,action,reason,old_value,new_value)
      values(p_member,auth.uid(),'set_status','Restored from folded roster','{"status":"folded"}','{"status":"active"}');
  end if;
end
$fn$;
revoke all on function public.mentor_set_participation(uuid,boolean,boolean) from public, anon, authenticated, service_role;
grant execute on function public.mentor_set_participation(uuid,boolean,boolean) to authenticated;

-- Snapshot all existing accounts before replacing claim behavior. No role backfill.
create table if not exists public.account_classifications (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  classification text check(classification in ('student','parent')),
  reason text not null,
  legacy boolean not null default false,
  classified_at timestamptz not null default now()
);
alter table public.account_classifications enable row level security;
revoke all on public.account_classifications from public, anon, authenticated, service_role;
insert into public.account_classifications(member_id,reason,legacy)
  select id,'Existing account: roles retained for admin review.',true from public.profiles
  on conflict do nothing;

create or replace function public.claim_profile()
returns boolean language plpgsql security definer set search_path = public
as $fn$
declare em text; granted text; matched boolean; approved_before boolean; chosen text;
begin
  if auth.uid() is null then return false; end if;
  -- Read the authenticated identity from Auth, never editable metadata.
  select lower(email) into em from auth.users where id=auth.uid();
  if em is null then return false; end if;
  insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
  perform 1 from public.profiles where id=auth.uid() for update;
  select granted_role into granted from public.approved_emails where email=em;
  select exists(select 1 from public.allowed_domains where domain=split_part(em,'@',2)) into matched;
  select approved into approved_before from public.profiles where id=auth.uid();
  if not exists(select 1 from public.account_classifications where member_id=auth.uid()) then
    if not exists(select 1 from public.member_roles where member_id=auth.uid()) then
      chosen := coalesce(granted,case when split_part(em,'@',2)='boscotech.edu' then 'student' else 'parent' end);
      insert into public.account_classifications(member_id,classification,reason)
        values(auth.uid(),case when chosen in ('student','parent') then chosen end,case when granted is not null then 'Role explicitly assigned on the roster.'
          when chosen='parent' then 'Personal email with no roster role at first claim.' else 'School email at first claim.' end);
      insert into public.member_roles(member_id,role) values(auth.uid(),chosen) on conflict do nothing;
    else
      insert into public.account_classifications(member_id,reason) values(auth.uid(),'Existing roster roles retained.');
    end if;
  end if;
  -- An explicit later invitation/approval supersedes only the automatic
  -- personal-email default, never a legacy or admin-reviewed classification.
  if granted is not null and exists(select 1 from public.account_classifications
    where member_id=auth.uid() and reason='Personal email with no roster role at first claim.') then
    if granted<>'parent' then delete from public.member_roles where member_id=auth.uid() and role='parent'; end if;
    update public.account_classifications set classification=case when granted in ('student','parent') then granted end,
      reason='Role explicitly assigned on the roster.',classified_at=now() where member_id=auth.uid();
  end if;
  if matched or granted is not null or coalesce(approved_before,false) then
    update public.profiles set approved=true where id=auth.uid();
    -- Existing accounts retain roles. An explicit invitation remains authoritative.
    if granted is not null then
      insert into public.member_roles(member_id,role) values(auth.uid(),granted) on conflict do nothing;
    elsif not exists(select 1 from public.member_roles where member_id=auth.uid()) then
      insert into public.member_roles(member_id,role) values(auth.uid(),'student') on conflict do nothing;
    end if;
    return true;
  end if;
  return false;
end
$fn$;
revoke all on function public.claim_profile() from public, anon, authenticated, service_role;
grant execute on function public.claim_profile() to authenticated;

-- Does: Show your account classification and why it was assigned.
create or replace function public.my_account_classification()
returns jsonb language sql stable security definer set search_path = public
as $fn$
  select to_jsonb(c) from public.account_classifications c where c.member_id=auth.uid();
$fn$;
revoke all on function public.my_account_classification() from public, anon, authenticated, service_role;
grant execute on function public.my_account_classification() to authenticated;

-- Does: Review personal-email student accounts and classified accounts without changing existing roles.
create or replace function public.admin_account_review()
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('member_id',p.id,'name',public._member_name(p.id),'email',u.email,
    'classification',c.classification,'reason',c.reason,'legacy',c.legacy,
    'roles',(select coalesce(jsonb_agg(role),'[]') from public.member_roles where member_id=p.id),
    'needs_review',c.legacy and exists(select 1 from public.member_roles where member_id=p.id and role='student')) order by p.full_name),'[]')
    from public.profiles p join auth.users u on u.id=p.id join public.account_classifications c on c.member_id=p.id
    where split_part(lower(u.email),'@',2)<>'boscotech.edu');
end
$fn$;
revoke all on function public.admin_account_review() from public, anon, authenticated, service_role;
grant execute on function public.admin_account_review() to authenticated;

-- Does: Reclassify an account as student or parent, preserving staff roles and approval.
create or replace function public.admin_reclassify_account(p_member uuid,p_classification text)
returns void language plpgsql security definer set search_path = public
as $fn$
declare old_roles jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  if p_classification is null or p_classification not in ('student','parent') then raise exception 'Choose student or parent' using errcode='22023'; end if;
  perform 1 from public.profiles where id=p_member for update;
  if not found then raise exception 'Member not found' using errcode='P0002'; end if;
  select jsonb_agg(role) into old_roles from public.member_roles where member_id=p_member;
  delete from public.member_roles where member_id=p_member and role in ('student','parent');
  insert into public.member_roles(member_id,role) values(p_member,p_classification);
  insert into public.account_classifications(member_id,classification,reason) values(p_member,p_classification,'Admin reclassification.')
    on conflict(member_id) do update set classification=excluded.classification,reason=excluded.reason,classified_at=now(),legacy=false;
  update public.approved_emails set granted_role=p_classification where email=(select lower(email) from auth.users where id=p_member);
  insert into public.member_admin_log(member_id,actor_id,action,reason,old_value,new_value)
    values(p_member,auth.uid(),'set_status','Account reclassification',jsonb_build_object('roles',old_roles),jsonb_build_object('classification',p_classification));
end
$fn$;
revoke all on function public.admin_reclassify_account(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_reclassify_account(uuid,text) to authenticated;

-- Does: Approve an account while keeping its roster role; legacy roleless accounts default to student.
create or replace function public.admin_approve_member(p_member uuid)
returns void language plpgsql security invoker set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  update public.profiles set approved=true where id=p_member;
  if not exists(select 1 from public.member_roles where member_id=p_member) then
    insert into public.member_roles(member_id,role) values(p_member,'student');
  end if;
end
$fn$;
revoke all on function public.admin_approve_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_approve_member(uuid) to authenticated;

create table if not exists public.account_transfer_codes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);
create table if not exists public.account_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.profiles(id),
  target_id uuid not null references public.profiles(id),
  code_id uuid not null unique references public.account_transfer_codes(id),
  status text not null default 'pending' check(status in ('pending','approved','denied')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  result jsonb,
  check(source_id<>target_id)
);
create unique index if not exists account_transfer_one_source on public.account_transfer_requests(source_id) where status='pending';
create unique index if not exists account_transfer_one_target on public.account_transfer_requests(target_id) where status='pending';
create index if not exists account_transfer_codes_source on public.account_transfer_codes(source_id);
create index if not exists account_transfer_requests_source on public.account_transfer_requests(source_id);
create index if not exists account_transfer_requests_target on public.account_transfer_requests(target_id);
alter table public.account_transfer_codes enable row level security;
alter table public.account_transfer_requests enable row level security;
revoke all on public.account_transfer_codes,public.account_transfer_requests from public, anon, authenticated, service_role;

-- Does: While signed into your personal account, generate a code valid for 24 hours.
create or replace function public.create_account_transfer_code()
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare code text; expiry timestamptz; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  select lower(email) into em from auth.users where id=auth.uid();
  if em is null or split_part(em,'@',2)='boscotech.edu' then raise exception 'Generate the code from your personal account' using errcode='22023'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Claim your account first' using errcode='42501'; end if;
  if exists(select 1 from public.account_transfer_requests where source_id=auth.uid() and status in ('pending','approved')) then
    raise exception 'A transfer is already pending or complete' using errcode='22023'; end if;
  update public.account_transfer_codes set used_at=now() where source_id=auth.uid() and used_at is null;
  expiry:=clock_timestamp()+interval '24 hours';
  code:=encode(extensions.gen_random_bytes(16),'hex');
  insert into public.account_transfer_codes(source_id,code_hash,expires_at) values(auth.uid(),encode(extensions.digest(code,'sha256'),'hex'),expiry);
  return jsonb_build_object('code',code,'expires_at',expiry);
end
$fn$;
revoke all on function public.create_account_transfer_code() from public, anon, authenticated, service_role;
grant execute on function public.create_account_transfer_code() to authenticated;

-- Does: While signed into your school account, redeem the code to request admin approval.
create or replace function public.request_account_transfer(p_code text)
returns uuid language plpgsql security definer set search_path = public
as $fn$
declare c public.account_transfer_codes; request_id uuid; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  select lower(email) into em from auth.users where id=auth.uid();
  if em is null or split_part(em,'@',2)<>'boscotech.edu' then raise exception 'Enter the code from your school account' using errcode='42501'; end if;
  select * into c from public.account_transfer_codes where code_hash=encode(extensions.digest(lower(btrim(p_code)),'sha256'),'hex');
  if c.id is null then raise exception 'Code invalid, expired or already used' using errcode='22023'; end if;
  -- Match code generation: profile locks before code locks. Recheck after waiting.
  perform 1 from public.profiles where id in (c.source_id,auth.uid()) order by id for update;
  select * into c from public.account_transfer_codes where id=c.id for update;
  if c.id is null or c.used_at is not null or c.expires_at<=clock_timestamp() then raise exception 'Code invalid, expired or already used' using errcode='22023'; end if;
  if c.source_id=auth.uid() or (select split_part(lower(email),'@',2) from auth.users where id=c.source_id)='boscotech.edu' then
    raise exception 'Use a personal account and a different school account' using errcode='22023'; end if;
  insert into public.account_transfer_requests(source_id,target_id,code_id) values(c.source_id,auth.uid(),c.id) returning id into request_id;
  update public.account_transfer_codes set used_at=now() where id=c.id;
  return request_id;
end
$fn$;
revoke all on function public.request_account_transfer(text) from public, anon, authenticated, service_role;
grant execute on function public.request_account_transfer(text) to authenticated;

-- Does: Read your transfer requests, or every request if you are an admin.
create or replace function public.account_transfers()
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'source_email',s.email,'target_email',t.email,'status',r.status,
    'requested_at',r.requested_at,'reviewed_at',r.reviewed_at,'result',r.result) order by r.requested_at desc),'[]')
    from public.account_transfer_requests r join auth.users s on s.id=r.source_id join auth.users t on t.id=r.target_id
    where r.source_id=auth.uid() or r.target_id=auth.uid() or public.is_admin());
end
$fn$;
revoke all on function public.account_transfers() from public, anon, authenticated, service_role;
grant execute on function public.account_transfers() to authenticated;

-- Does: Approve a proven two-account transfer through the audited merge, or deny it.
create or replace function public.admin_decide_account_transfer(p_request uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare r public.account_transfer_requests; v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
  select * into r from public.account_transfer_requests where id=p_request for update;
  if r.id is null or r.status<>'pending' then raise exception 'No pending transfer' using errcode='22023'; end if;
  if p_approve is null then raise exception 'Choose approve or deny' using errcode='22023'; end if;
  if p_approve then
    if coalesce((select split_part(lower(email),'@',2) from auth.users where id=r.source_id),'') in ('','boscotech.edu')
      or (select split_part(lower(email),'@',2) from auth.users where id=r.target_id) is distinct from 'boscotech.edu' then
      raise exception 'Account email changed: prove both accounts again' using errcode='22023'; end if;
    v_result:=public.admin_merge_member(r.source_id,r.target_id,'Verified summer-account transfer '||r.id);
  end if;
  update public.account_transfer_requests set status=case when p_approve then 'approved' else 'denied' end,
    reviewed_by=auth.uid(),reviewed_at=now(),result=v_result where id=r.id;
  return v_result;
end
$fn$;
revoke all on function public.admin_decide_account_transfer(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_decide_account_transfer(uuid,boolean) to authenticated;

-- Proof and classification stay attached to the accounts that proved them.
create or replace function public._merge_member_rules()
returns table (tbl text, col text, rule text) language sql immutable set search_path = public as $fn$
  select x.tbl, x.col, x.rule from (values
    ('profiles', 'id', 'profile'),
    ('scouting_records', 'member_id', 'keep'),
    ('scouting_revisions', 'member_id', 'keep'),
    ('scouting_revisions', 'changed_by', 'keep'),
    ('scouting_operations', 'member_id', 'keep'),
    ('member_roles', 'member_id', 'roles'),
    ('member_permissions', 'member_id', 'grants'),
    ('member_permissions', 'granted_by', 'move'),
    ('connector_codes', 'user_id', 'drop'),
    ('connector_tokens', 'user_id', 'drop'),
    ('connector_confirmations', 'user_id', 'drop'),
    ('connector_audit', 'user_id', 'keep'),
    ('connector_audit', 'undone_by', 'keep'),
    ('connector_settings', 'allowed_member', 'refuse'),
    ('connector_settings', 'updated_by', 'move'),
    ('member_admin_log', 'member_id', 'keep'),
    ('member_admin_log', 'actor_id', 'keep'),
    ('absence_requests', 'member_id', 'move'),
    ('absence_requests', 'decided_by', 'move'),
    ('access_requests', 'reviewed_by', 'move'),
    ('allowed_domains', 'added_by', 'move'),
    ('approved_emails', 'added_by', 'move'),
    ('attendance_audit', 'member_id', 'move'),
    ('attendance_audit', 'actor_id', 'move'),
    ('attendance_events', 'user_id', 'move'),
    ('attendance_events', 'overridden_by', 'move'),
    ('auto_routines', 'created_by', 'move'),
    ('auto_routines', 'updated_by', 'move'),
    ('auto_runs', 'member_id', 'move'),
    ('auto_runs', 'updated_by', 'move'),
    ('batteries', 'charge_set_by', 'move'),
    ('batteries', 'created_by', 'move'),
    ('batteries', 'updated_by', 'move'),
    ('battery_runs', 'member_id', 'move'),
    ('battery_runs', 'updated_by', 'move'),
    ('cert_requests', 'member_id', 'move'),
    ('cert_requests', 'reviewed_by', 'move'),
    ('discipline_records', 'member_id', 'move'),
    ('discipline_records', 'created_by', 'move'),
    ('discipline_records', 'appeal_by', 'move'),
    ('discord_announce_roles', 'created_by', 'move'),
    ('discord_announcements', 'sent_by', 'move'),
    ('drive_sessions', 'member_id', 'move'),
    ('drive_sessions', 'logged_by', 'move'),
    ('drive_sessions', 'updated_by', 'move'),
    ('drive_sessions', 'voided_by', 'move'),
    ('driver_ratings', 'driver_id', 'move'),
    ('driver_ratings', 'coach_id', 'move'),
    ('driver_documents', 'owner_id', 'move'),
    ('driver_document_views', 'viewer_id', 'move'),
    ('event_attendance', 'member_id', 'move'),
    ('event_attendance', 'marked_by', 'move'),
    ('event_roles', 'member_id', 'move'),
    ('event_roles', 'assigned_by', 'move'),
    ('event_rosters', 'posted_by', 'move'),
    ('event_signup_reminders', 'student_id', 'move'),
    ('event_signup_reminders', 'reminded_by', 'move'),
    ('event_signups', 'member_id', 'move'),
    ('events', 'created_by', 'move'),
    ('feedback', 'member_id', 'move'),
    ('feedback', 'reviewed_by', 'move'),
    ('feedback_replies', 'author_id', 'move'),
    ('fll_mentors', 'member_id', 'move'),
    ('grade_checks', 'member_id', 'move'),
    ('grade_checks', 'set_by', 'move'),
    ('guardian_links', 'parent_id', 'move'),
    ('guardian_links', 'student_id', 'move'),
    ('guardian_links', 'created_by', 'move'),
    ('handbook_acknowledgments', 'member_id', 'move'),
    ('handbook_versions', 'published_by', 'move'),
    ('hour_adjustments', 'member_id', 'move'),
    ('hour_adjustments', 'created_by', 'move'),
    ('hour_goals', 'member_id', 'move'),
    ('hour_goals', 'updated_by', 'move'),
    ('hp_attempts', 'member_id', 'move'),
    ('hp_attempts', 'logged_by', 'move'),
    ('hp_attempts', 'updated_by', 'move'),
    ('hp_attempts', 'voided_by', 'move'),
    ('hub_cars', 'minor_override_by', 'move'),
    ('hub_days', 'captain_id', 'move'),
    ('hub_events', 'created_by', 'move'),
    ('hub_invites', 'student_id', 'move'),
    ('hub_responses', 'driver_paperwork_by', 'move'),
    ('hub_responses', 'staff_updated_by', 'move'),
    ('hub_seats', 'placed_by', 'move'),
    ('incident_reports', 'member_id', 'move'),
    ('incident_reports', 'reported_by', 'move'),
    ('incident_reports', 'closed_by', 'move'),
    ('letter_contributions', 'member_id', 'move'),
    ('letter_contributions', 'confirmed_by', 'move'),
    ('logged_hours', 'member_id', 'move'),
    ('logged_hours', 'reviewed_by', 'move'),
    ('logged_hours', 'verified_by', 'move'),
    ('logged_hours_corrections', 'member_id', 'move'),
    ('logged_hours_corrections', 'reviewed_by', 'move'),
    ('media_exceptions', 'member_id', 'move'),
    ('media_exceptions', 'set_by', 'move'),
    ('meeting_checkins', 'member_id', 'move'),
    ('member_applications', 'member_id', 'move'),
    ('member_conflicts', 'member_id', 'move'),
    ('member_medical', 'member_id', 'move'),
    ('member_medical', 'updated_by', 'move'),
    ('member_notices', 'member_id', 'move'),
    ('member_notices', 'created_by', 'move'),
    ('member_skills', 'member_id', 'move'),
    ('member_skills', 'certified_by', 'move'),
    ('notice_outbox', 'member_id', 'move'),
    ('notifications_sent', 'member_id', 'move'),
    ('onboarding_items', 'member_id', 'move'),
    ('onboarding_items', 'marked_by', 'move'),
    ('parent_acknowledgments', 'member_id', 'move'),
    ('parent_link_requests', 'parent_id', 'move'),
    ('parent_link_requests', 'student_id', 'move'),
    ('parent_link_requests', 'reviewed_by', 'move'),
    ('position_assignments', 'member_id', 'move'),
    ('position_assignments', 'assigned_by', 'move'),
    ('push_subscriptions', 'member_id', 'move'),
    ('event_match_clock', 'set_by', 'move'),
    ('role_requests', 'member_id', 'move'),
    ('role_requests', 'status_by', 'move'),
    ('role_slot_templates', 'created_by', 'move'),
    ('role_slots', 'created_by', 'move'),
    ('safety_violations', 'member_id', 'move'),
    ('safety_violations', 'logged_by', 'move'),
    ('session_corrections', 'member_id', 'move'),
    ('session_corrections', 'reviewed_by', 'move'),
    ('session_reviews', 'user_id', 'move'),
    ('session_reviews', 'reviewed_by', 'move'),
    ('signout_requests', 'member_id', 'move'),
    ('signout_requests', 'decided_by', 'move'),
    ('sim_matches', 'member_id', 'move'),
    ('sim_matches', 'driver_id', 'move'),
    ('sim_matches', 'operator_id', 'move'),
    ('sim_matches', 'human_player_id', 'move'),
    ('sim_matches', 'drive_coach_id', 'move'),
    ('standing_months', 'member_id', 'move'),
    ('standing_records', 'member_id', 'move'),
    ('standing_records', 'confirmed_by', 'move'),
    ('standing_settings', 'updated_by', 'move'),
    ('standing_weeks', 'member_id', 'move'),
    ('study_sessions', 'member_id', 'move'),
    ('subteam_status_reports', 'reported_by', 'move'),
    ('surveys', 'created_by', 'move'),
    ('survey_responses', 'member_id', 'move'),
    ('task_claims', 'member_id', 'move'),
    ('task_claims', 'verified_by', 'move'),
    ('task_idea_cert_requirements', 'set_by', 'move'),
    ('task_updates', 'member_id', 'move'),
    ('tasks', 'claimed_by', 'move'),
    ('tasks', 'created_by', 'move'),
    ('tasks', 'verified_by', 'move'),
    ('team_weeks', 'posted_by', 'move'),
    ('team_connections', 'member_id', 'move'),
    ('team_connections', 'updated_by', 'move'),
    ('scouting_options', 'requested_by', 'move'),
    ('scouting_options', 'decided_by', 'move'),
    ('robot_matches', 'driver_id', 'move'),
    ('robot_matches', 'operator_id', 'move'),
    ('robot_matches', 'coach_id', 'move'),
    ('robot_matches', 'human_player_id', 'move'),
    ('robot_matches', 'created_by', 'move'),
    ('robot_matches', 'updated_by', 'move'),
    ('tour_completions', 'member_id', 'move'),
    ('member_participation', 'member_id', 'move'),
    ('member_participation', 'override_by', 'keep'),
    ('account_classifications', 'member_id', 'keep'),
    ('account_transfer_codes', 'source_id', 'keep'),
    ('account_transfer_requests', 'source_id', 'keep'),
    ('account_transfer_requests', 'target_id', 'keep'),
    ('account_transfer_requests', 'reviewed_by', 'keep')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated, service_role;

-- Does: Show classification and its reason beside pending access requests.
create or replace function public.staff_access_classifications()
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('request_id',r.id,'classification',c.classification,'reason',c.reason)),'[]')
    from public.access_requests r join auth.users u on lower(u.email)=r.email
    join public.account_classifications c on c.member_id=u.id where r.status='pending');
end
$fn$;
revoke all on function public.staff_access_classifications() from public, anon, authenticated, service_role;
grant execute on function public.staff_access_classifications() to authenticated;

-- Folded is a roster label, not an access revocation. Keep the installed
-- role/ownership/approval checks and ACLs. Only widen active to active/folded
-- in access predicates; standings and active-team list filters stay active.
do $access$
declare sig text; definition text; changed text;
begin
  foreach sig in array array['public._battery_member_ok()','public._driver_member_ok()',
    'public._driver_target_ok(uuid)','public._hp_member_ok()','public._hp_target_ok(uuid)',
    'public._role_board_member_ok()','scouting_private.can_access(uuid)',
    'public._hub_roster_student(uuid)','public.set_session_paused(uuid,boolean)',
    'public.get_calendar_token()','public.rotate_calendar_token()',
    'public.tour_complete_core(text,integer)','public.tour_completion_overview(integer)',
    'public.driver_docs_flag_leavers()'] loop
    definition:=pg_get_functiondef(to_regprocedure(sig));
    if definition is null then raise exception 'Access prerequisite missing: %',sig; end if;
    if sig='public.driver_docs_flag_leavers()' then
      changed:=replace(definition, 'coalesce(p.status, ''active'') <> ''active''', 'coalesce(p.status, ''active'') not in (''active'',''folded'')');
    elsif sig in ('public.get_calendar_token()','public.rotate_calendar_token()') then
      changed:=replace(definition, 'status=''active''', 'status in (''active'',''folded'')');
    elsif sig in ('public.tour_complete_core(text,integer)','public.tour_completion_overview(integer)') then
      changed:=replace(definition, 'p.id=auth.uid() and p.approved and p.status=''active''', 'p.id=auth.uid() and p.approved and p.status in (''active'',''folded'')');
    else
      changed:=replace(replace(definition, 'coalesce(p.status, ''active'') = ''active''', 'coalesce(p.status, ''active'') in (''active'',''folded'')'), 'p.status = ''active''', 'p.status in (''active'',''folded'')');
    end if;
    if changed=definition and position('''folded''' in changed)=0 then raise exception 'Access predicate missing: %',sig; end if;
    execute changed;
  end loop;
end
$access$;
-- Preserve the original own-or-staff read policy, including for folded callers.
alter policy "tour completion read" on public.tour_completions using (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.approved and p.status in ('active','folded'))
 and (member_id=(select auth.uid()) or public.is_staff())
);

-- Pin the ACLs of the existing access predicates changed above as well.
-- Exactly authenticated for caller predicates; no client/server roles for
-- internal target predicates and cron helpers. Do not inherit default grants.
do $access_acl$
declare sig text;
begin
 foreach sig in array array['public._battery_member_ok()','public._driver_member_ok()',
   'public._hp_member_ok()','public._role_board_member_ok()',
   'public.set_session_paused(uuid,boolean)','public.tour_complete_core(text,integer)',
   'public.tour_completion_overview(integer)','public.get_calendar_token()',
   'public.rotate_calendar_token()'] loop
   execute format('revoke all on function %s from public, anon, authenticated, service_role',sig);
   execute format('grant execute on function %s to authenticated',sig);
 end loop;
 foreach sig in array array['public._driver_target_ok(uuid)','public._hp_target_ok(uuid)',
   'scouting_private.can_access(uuid)','public._hub_roster_student(uuid)',
   'public.driver_docs_flag_leavers()'] loop
   execute format('revoke all on function %s from public, anon, authenticated, service_role',sig);
 end loop;
end
$access_acl$;
