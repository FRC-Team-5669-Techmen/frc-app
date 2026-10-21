-- 0022: Event scouting, durable operations, revisions, and notification delivery.
-- Apply after 0021. Re-runnable; no live integrations are invoked here.
-- Undo before use: drop public.scouting_* tables/functions and scouting_private
-- schema, remove scouting.manage, then restore _merge_member_rules from 0020.
-- After use, export records/revisions before any removal; never discard observations.
-- Public RPCs are SECURITY INVOKER. Privileged atomic writes live in a non-exposed
-- schema, validate the real auth.uid and roles, and expose no direct table writes.
-- In Supabase API settings, do not expose scouting_private.
-- Domain conflicts use PT409, not serialization_failure: PostgREST 14 retries
-- 40001 indefinitely. PT409 returns HTTP 409 for explicit client review.

create schema if not exists scouting_private;
revoke all on schema scouting_private from public, anon;
grant usage on schema scouting_private to authenticated, service_role;

insert into public.capabilities (key, label, description) values
 ('scouting.manage', 'Can manage scouting', 'Assign scouting and maintain event team data. Parent-only accounts remain excluded.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

create table if not exists public.scouting_records (
 id uuid primary key,
 event_id uuid not null references public.events(id) on delete restrict,
 member_id uuid not null references public.profiles(id) on delete restrict,
 kind text not null check (kind in ('pit','observation','assignment','message','pick_list','team')),
 team_number integer check (team_number between 1 and 99999),
 match_key text,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 version integer not null check (version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists scouting_records_event_idx on public.scouting_records(event_id,kind,team_number);
create index if not exists scouting_records_member_idx on public.scouting_records(member_id);
create unique index if not exists scouting_one_list on public.scouting_records(event_id,member_id) where kind = 'pick_list';
create unique index if not exists scouting_one_team on public.scouting_records(event_id,kind,team_number) where kind in ('team','pit');
-- Rebuild these local-review indexes so repeated application retains canonical match identity.
-- Existing aliases must be reviewed if an earlier draft migration was applied; no rows are deleted.
drop index if exists public.scouting_one_observation;
drop index if exists public.scouting_one_assignment;
create unique index if not exists scouting_one_observation on public.scouting_records(event_id,member_id,team_number,(case when payload->>'source_scope'='external' then lower(btrim(match_key)) else regexp_replace(lower(btrim(match_key)), '^[0-9]{4}[a-z0-9]+_(qm[0-9]+|sf[0-9]+m[0-9]+|f[0-9]+m[0-9]+)$', '\1') end)) where kind = 'observation';
create unique index if not exists scouting_one_assignment on public.scouting_records(event_id,team_number,(case when payload->>'source_scope'='external' then lower(btrim(match_key)) else regexp_replace(lower(btrim(match_key)), '^[0-9]{4}[a-z0-9]+_(qm[0-9]+|sf[0-9]+m[0-9]+|f[0-9]+m[0-9]+)$', '\1') end),(payload->>'assignee')) where kind = 'assignment' and payload->>'status' <> 'cancelled';

create table if not exists public.scouting_revisions (
 record_id uuid not null references public.scouting_records(id) on delete restrict,
 version integer not null,
 event_id uuid not null references public.events(id) on delete restrict,
 member_id uuid not null references public.profiles(id) on delete restrict,
 changed_by uuid not null references public.profiles(id) on delete restrict,
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 primary key(record_id,version)
);
create index if not exists scouting_revisions_event_idx on public.scouting_revisions(event_id);
create table if not exists public.scouting_operations (
 member_id uuid not null references public.profiles(id) on delete restrict,
 operation_id uuid not null,
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(member_id,operation_id)
);
create table if not exists public.scouting_delivery (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.scouting_records(id) on delete restrict,
 record_version integer not null,
 event_id uuid not null references public.events(id) on delete restrict,
 status text not null default 'queued' check(status in ('queued','sending','delivered','failed','uncertain','not_configured')),
 message_id text,
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(record_id,record_version),
 foreign key(record_id,record_version) references public.scouting_revisions(record_id,version) on delete restrict
);

create or replace function scouting_private.can_access(p_member uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $fn$
 select p_member is not null and exists (
  select 1 from public.profiles p where p.id = p_member and p.approved and p.status = 'active'
   and exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('student','mentor','lead','admin'))
   and (not exists (select 1 from public.member_roles r where r.member_id = p.id and r.role = 'parent')
        or exists (select 1 from public.member_roles r where r.member_id = p.id and r.role in ('mentor','lead','admin')))
 );
$fn$;
revoke all on function scouting_private.can_access(uuid) from public, anon, authenticated, service_role;

-- The caller-only helper cannot be used to inspect arbitrary member access.
create or replace function scouting_private.caller_access()
returns boolean language sql stable security definer set search_path = pg_catalog as $fn$
 select scouting_private.can_access(auth.uid());
$fn$;
revoke all on function scouting_private.caller_access() from public, anon;
grant execute on function scouting_private.caller_access() to authenticated, service_role;

-- Does: Check whether your current membership can use scouting.
create or replace function public.scouting_can_access()
returns boolean language sql stable security invoker set search_path = pg_catalog as $fn$
 select scouting_private.caller_access();
$fn$;
create or replace function scouting_private.can_manage(p_event uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $fn$
 select scouting_private.can_access(auth.uid()) and (
  public.is_staff() or public.has_capability('scouting.manage') or exists (
   select 1 from public.event_roles er where er.event_id = p_event and er.member_id = auth.uid() and er.role = 'scouting_lead'
  )
 );
$fn$;
revoke all on function scouting_private.can_manage(uuid) from public, anon;
grant execute on function scouting_private.can_manage(uuid) to authenticated, service_role;

-- Does: Check whether you can assign scouts and manage this event.
create or replace function public.scouting_can_manage(p_event uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog as $fn$
 select scouting_private.can_manage(p_event);
$fn$;
revoke all on function public.scouting_can_access(), public.scouting_can_manage(uuid) from public, anon;
grant execute on function public.scouting_can_access(), public.scouting_can_manage(uuid) to authenticated, service_role;

-- Minimal eligible roster for assignment controls; no emails or private profile fields.
create or replace function scouting_private.roster(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin
 if not scouting_private.can_manage(p_event) then raise exception using errcode='42501',message='Only a scouting manager can load the assignment roster.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'nickname',p.nickname) order by p.full_name,p.id)
   from public.profiles p where scouting_private.can_access(p.id)), '[]'::jsonb);
end
$fn$;
revoke all on function scouting_private.roster(uuid) from public,anon;
grant execute on function scouting_private.roster(uuid) to authenticated,service_role;
-- Does: Read eligible scout names for this event's assignment controls.
create or replace function public.scouting_roster(p_event uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $fn$
 select scouting_private.roster(p_event);
$fn$;
revoke all on function public.scouting_roster(uuid) from public,anon;
grant execute on function public.scouting_roster(uuid) to authenticated,service_role;

alter table public.scouting_records enable row level security;
alter table public.scouting_revisions enable row level security;
alter table public.scouting_operations enable row level security;
alter table public.scouting_delivery enable row level security;
revoke all on public.scouting_records, public.scouting_revisions, public.scouting_operations, public.scouting_delivery from public, anon, authenticated;
grant select on public.scouting_records, public.scouting_revisions, public.scouting_delivery to authenticated;
grant select on public.scouting_records, public.scouting_revisions, public.scouting_delivery to service_role;
drop policy if exists scouting_records_read on public.scouting_records;
create policy scouting_records_read on public.scouting_records for select to authenticated using ((select public.scouting_can_access()));
drop policy if exists scouting_revisions_read on public.scouting_revisions;
create policy scouting_revisions_read on public.scouting_revisions for select to authenticated using ((select public.scouting_can_access()));
drop policy if exists scouting_delivery_read on public.scouting_delivery;
create policy scouting_delivery_read on public.scouting_delivery for select to authenticated using ((select public.scouting_can_access()));

create or replace function scouting_private.validate(p_kind text,p_team integer,p_match text,p_payload jsonb,p_event uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $fn$
declare v jsonb; k text; val text; allowed text[]; who uuid;
begin
 if p_kind is null or p_kind not in ('pit','observation','assignment','message','pick_list','team')
   or p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 100000 then
  raise exception using errcode='22023', message='Invalid scouting record.';
 end if;
 if p_kind = 'pick_list' then
  if p_team is not null or p_match is not null then raise exception using errcode='22023',message='Pick lists have no team or match key.'; end if;
 elsif p_team is null or p_team not between 1 and 99999 then
  raise exception using errcode='22023',message='Choose a valid team number.';
 end if;
 if p_kind in ('observation','assignment') and (p_match is null or length(btrim(p_match)) not between 1 and 100) then
  raise exception using errcode='22023',message='A match key is required.';
 end if;
 if p_match is not null and length(p_match)>100 then raise exception using errcode='22023',message='Match key is too long.'; end if;
 allowed := case p_kind
  when 'pit' then array['capabilities','notes','pit_location']
  when 'observation' then array['answers','notes','source','video_url','assignment_id','request_delivery','source_scope','source_event']
  when 'assignment' then array['assignee','status','instructions','video_url','source_scope','source_event']
  when 'message' then array['text','status','request_delivery','reply_to']
  when 'pick_list' then array['entries','reason']
  when 'team' then array['name','pit_location','source','source_url','fetched_at','epa','epa_source','epa_fetched_at','official_results','pit_source','pit_fetched_at'] end;
 if exists(select 1 from jsonb_object_keys(p_payload) x where not x=any(allowed)) then raise exception using errcode='22023',message='Unknown scouting field.'; end if;
 foreach k in array array['notes','pit_location','instructions','text','reason','name','video_url','source_url','fetched_at','epa_fetched_at'] loop
  if p_payload ? k and not (k in ('fetched_at','epa_fetched_at') and p_payload->k='null'::jsonb) and (jsonb_typeof(p_payload->k) <> 'string' or length(p_payload->>k)>4000) then raise exception using errcode='22023',message='Text fields must be text with at most 4000 characters.'; end if;
 end loop;
 foreach k in array array['video_url','source_url'] loop
  if coalesce(p_payload->>k,'')<>'' and p_payload->>k !~ '^https://[^[:space:]]+' then raise exception using errcode='22023',message='Source links must use HTTPS.'; end if;
 end loop;
 if p_payload ? 'request_delivery' and jsonb_typeof(p_payload->'request_delivery')<>'boolean' then raise exception using errcode='22023',message='Delivery request must be true or false.'; end if;
 if p_kind in ('pit','observation') then
  k := case when p_kind='pit' then 'capabilities' else 'answers' end;
  if jsonb_typeof(p_payload->k) is distinct from 'object' then raise exception using errcode='22023',message='Capability answers are required.'; end if;
  for val,v in select * from jsonb_each(p_payload->k) loop
   if val not in ('trench','bump','ground_intake') or jsonb_typeof(v)<>'string'
    or (p_kind='pit' and (v #>> '{}') not in ('yes','no','unknown'))
    or (p_kind='observation' and (v #>> '{}') not in ('yes','no','did_not_see','not_applicable')) then
    raise exception using errcode='22023',message='Choose an explicit capability answer; missing is not zero.';
   end if;
  end loop;
 end if;
 if p_kind in ('observation','assignment') then
  if p_payload ? 'source_scope' and coalesce(p_payload->>'source_scope','') not in ('current','external') then
   raise exception using errcode='22023',message='Choose current or external footage scope.';
  end if;
  if p_payload ? 'source_event' and coalesce(p_payload->>'source_scope','')<>'external' then
   raise exception using errcode='22023',message='A source event requires external footage scope.';
  end if;
  if p_payload->>'source_scope'='external' then
   if coalesce(p_payload->>'source_event','') !~ '^[0-9]{4}[a-z0-9]{2,40}$'
      or left(p_match,length(p_payload->>'source_event')+1) is distinct from (p_payload->>'source_event')||'_'
      or coalesce(p_payload->>'video_url','')=''
      or (p_kind='observation' and p_payload->>'source' is distinct from 'video') then
    raise exception using errcode='22023',message='Prior-event footage needs its source event, full match key and video URL.';
   end if;
  end if;
 end if;
 if p_kind='observation' then
  if coalesce(p_payload->>'source','') not in ('live','video') then raise exception using errcode='22023',message='Choose live or video observation.'; end if;
  if p_payload ? 'assignment_id' then
   begin who := (p_payload->>'assignment_id')::uuid; exception when others then raise exception using errcode='22023',message='Invalid assignment.'; end;
   if not exists(select 1 from public.scouting_records r where r.id=who and r.kind='assignment' and r.event_id=p_event and r.team_number=p_team and r.match_key=p_match and r.payload->>'assignee'=auth.uid()::text and r.payload->>'status'<>'cancelled'
    and coalesce(r.payload->>'source_scope','current')=coalesce(p_payload->>'source_scope','current')
    and (r.payload->>'source_event') is not distinct from (p_payload->>'source_event')) then
    raise exception using errcode='22023',message='This assignment does not match your observation.';
   end if;
  end if;
 elsif p_kind='assignment' then
  if coalesce(p_payload->>'status','') not in ('assigned','complete','cancelled') then raise exception using errcode='22023',message='Invalid assignment status.'; end if;
  begin who := (p_payload->>'assignee')::uuid; exception when others then raise exception using errcode='22023',message='Choose an eligible scout.'; end;
  if not scouting_private.can_access(who) then raise exception using errcode='22023',message='Choose an eligible scout.'; end if;
 elsif p_kind='message' then
  if length(btrim(coalesce(p_payload->>'text',''))) not between 1 and 2000 or coalesce(p_payload->>'status','') not in ('open','resolved') then raise exception using errcode='22023',message='A pit message needs text and open or resolved status.'; end if;
  if p_payload ? 'reply_to' then
   begin who := (p_payload->>'reply_to')::uuid; exception when others then raise exception using errcode='22023',message='Choose a saved pit conversation to reply to.'; end;
   if not exists(select 1 from public.scouting_records r where r.id=who and r.kind='message' and r.event_id=p_event and r.team_number=p_team and not (r.payload ? 'reply_to')) then
    raise exception using errcode='22023',message='A reply must reference an original pit message for the same team and event.';
   end if;
  end if;
 elsif p_kind='pick_list' then
  if jsonb_typeof(p_payload->'entries') is distinct from 'array' or jsonb_array_length(p_payload->'entries')>200 then raise exception using errcode='22023',message='A pick list contains at most 200 teams.'; end if;
  for v in select * from jsonb_array_elements(p_payload->'entries') loop
   if jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v) x where x not in ('team','tier','rank'))
    or jsonb_typeof(v->'team') is distinct from 'number' or (v->>'team') !~ '^[0-9]+\Z' or (v->>'team')::numeric not between 1 and 99999
    or coalesce(v->>'tier','') not in ('1','2','3','dnp')
    or jsonb_typeof(v->'rank') is distinct from 'number' or (v->>'rank') !~ '^[0-9]+\Z' or (v->>'rank')::numeric not between 1 and 200 then
    raise exception using errcode='22023',message='Invalid pick list entry.';
   end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'entries') x group by x->>'team' having count(*)>1)
   or exists(select 1 from jsonb_array_elements(p_payload->'entries') x group by x->>'tier',x->>'rank' having count(*)>1) then raise exception using errcode='22023',message='Teams and tier positions cannot repeat.'; end if;
 elsif p_kind='team' then
  if coalesce(p_payload->>'source','') not in ('manual','tba','nexus') or length(btrim(coalesce(p_payload->>'name',''))) not between 1 and 200 then raise exception using errcode='22023',message='A team needs a name and source.'; end if;
  if p_payload ? 'epa' and p_payload->'epa'<>'null'::jsonb and (jsonb_typeof(p_payload->'epa')<>'number' or coalesce(p_payload->>'epa_source','')<>'statbotics' or coalesce(p_payload->>'epa_fetched_at','')='') then raise exception using errcode='22023',message='EPA must retain its Statbotics source and retrieval time.'; end if;
  if p_payload ? 'pit_source' and coalesce(p_payload->>'pit_source','') not in ('manual','nexus') then raise exception using errcode='22023',message='Invalid pit location source.'; end if;
  if p_payload ? 'official_results' then
   if jsonb_typeof(p_payload->'official_results')<>'array' or jsonb_array_length(p_payload->'official_results')>100 then raise exception using errcode='22023',message='Official results must be an array of at most 100 matches.'; end if;
   for v in select * from jsonb_array_elements(p_payload->'official_results') loop
    if jsonb_typeof(v)<>'object' or coalesce(v->>'source','')<>'tba' or coalesce(v->>'alliance','') not in ('red','blue')
      or length(btrim(coalesce(v->>'match_key',''))) not between 1 and 100 or coalesce(v->>'fetched_at','')=''
      or (v ? 'alliance_score' and jsonb_typeof(v->'alliance_score') not in ('number','null'))
      or (v ? 'score_breakdown' and jsonb_typeof(v->'score_breakdown') not in ('object','null')) then
     raise exception using errcode='22023',message='Official results require alliance-level TBA provenance.';
    end if;
    begin perform (v->>'fetched_at')::timestamptz; exception when others then raise exception using errcode='22023',message='Invalid official result timestamp.'; end;
   end loop;
  end if;
  if p_payload->>'source' in ('tba','nexus') and (coalesce(p_payload->>'source_url','')='' or coalesce(p_payload->>'fetched_at','')='') then raise exception using errcode='22023',message='Imported team data requires a source link and retrieval time.'; end if;
  if p_payload->>'pit_source'='nexus' and coalesce(p_payload->>'pit_fetched_at','')='' then raise exception using errcode='22023',message='Nexus pit location requires a retrieval time.'; end if;
  foreach k in array array['fetched_at','epa_fetched_at','pit_fetched_at'] loop
   if coalesce(p_payload->>k,'')<>'' then begin perform (p_payload->>k)::timestamptz; exception when others then raise exception using errcode='22023',message='Invalid retrieval timestamp.'; end; end if;
  end loop;
 end if;
end
$fn$;
revoke all on function scouting_private.validate(text,integer,text,jsonb,uuid) from public,anon,authenticated,service_role;

create or replace function scouting_private.save(p_id uuid,p_event uuid,p_kind text,p_team integer,p_match text,p_payload jsonb,p_expected_version integer,p_operation uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
declare uid uuid := auth.uid(); oldrow public.scouting_records; saved public.scouting_records; op public.scouting_operations; req jsonb; result jsonb; manager boolean;
begin
 if p_actor is distinct from uid or not scouting_private.can_access(uid) then raise exception using errcode='42501',message='Scouting requires an active approved student or staff account.'; end if;
 if p_id is null or p_event is null or p_operation is null or p_expected_version is null or p_expected_version<0 then raise exception using errcode='22023',message='Record, event, operation and version are required.'; end if;
 if not exists(select 1 from public.events where id=p_event and kind in ('competition','training')) then raise exception using errcode='22023',message='Choose a competition or training event.'; end if;
 req := jsonb_build_object('id',p_id,'event',p_event,'kind',p_kind,'team',p_team,'match',p_match,'payload',p_payload,'version',p_expected_version);
 perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_operation::text,0));
 select * into op from public.scouting_operations where member_id=uid and operation_id=p_operation;
 if found then
  if op.request<>req then raise exception using errcode='22023',message='An operation ID cannot be reused for different data.'; end if;
  return op.result;
 end if;
 manager := scouting_private.can_manage(p_event);
 if p_kind in ('assignment','team') and not manager then raise exception using errcode='42501',message='Only scouting managers can change assignments or team data.'; end if;
 perform scouting_private.validate(p_kind,p_team,p_match,p_payload,p_event);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into oldrow from public.scouting_records where id=p_id for update;
 if found then
  if oldrow.event_id<>p_event or oldrow.kind<>p_kind or oldrow.team_number is distinct from p_team or oldrow.match_key is distinct from p_match then raise exception using errcode='22023',message='Record identity cannot change; create a new record.'; end if;
  if oldrow.member_id<>uid and (not manager or p_kind in ('observation','pick_list')) then raise exception using errcode='42501',message='You can only correct your own observation or pick list.'; end if;
  if p_kind='message' and oldrow.payload->>'reply_to' is distinct from p_payload->>'reply_to' then raise exception using errcode='22023',message='A reply cannot move to another conversation.'; end if;
  if oldrow.version<>p_expected_version then raise exception using errcode='PT409',message='This record changed. Refresh and review both versions before saving.'; end if;
  update public.scouting_records set payload=p_payload,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into saved;
 else
  if p_expected_version<>0 then raise exception using errcode='PT409',message='The record no longer matches this edit. Refresh before saving.'; end if;
  begin
   insert into public.scouting_records(id,event_id,member_id,kind,team_number,match_key,payload,version) values(p_id,p_event,uid,p_kind,p_team,p_match,p_payload,1) returning * into saved;
  exception when unique_violation then raise exception using errcode='PT409',message='A record already exists for this team, match or list. Refresh and edit it.'; end;
 end if;
 result := to_jsonb(saved);
 insert into public.scouting_revisions(record_id,version,event_id,member_id,changed_by,snapshot) values(saved.id,saved.version,saved.event_id,saved.member_id,uid,result);
 if p_kind in ('message','observation') and p_payload->>'request_delivery'='true' then
  insert into public.scouting_delivery(record_id,record_version,event_id) values(saved.id,saved.version,saved.event_id);
 end if;
 if p_kind='assignment' and p_payload->>'status'='assigned' and (oldrow.id is null or oldrow.payload->>'assignee' is distinct from p_payload->>'assignee' or oldrow.payload->>'status'<>'assigned') then
  insert into public.member_notices(member_id,kind,title,body,created_by)
   values((p_payload->>'assignee')::uuid,'scouting_assignment','Scouting assignment','Team ' || p_team::text || ', match ' || p_match || '. Open Scouting to prepare.',uid);
 end if;
 insert into public.scouting_operations(member_id,operation_id,request,result) values(uid,p_operation,req,result);
 return result;
end
$fn$;
revoke all on function scouting_private.save(uuid,uuid,text,integer,text,jsonb,integer,uuid,uuid) from public,anon;
grant execute on function scouting_private.save(uuid,uuid,text,integer,text,jsonb,integer,uuid,uuid) to authenticated;

-- Does: Save or correct scouting with attribution, retry protection, and a version check.
create or replace function public.scouting_save(p_id uuid,p_event uuid,p_kind text,p_team integer,p_match text,p_payload jsonb,p_expected_version integer,p_operation uuid,p_actor uuid)
returns jsonb language sql security invoker set search_path = pg_catalog as $fn$
 select scouting_private.save(p_id,p_event,p_kind,p_team,p_match,p_payload,p_expected_version,p_operation,p_actor);
$fn$;
revoke all on function public.scouting_save(uuid,uuid,text,integer,text,jsonb,integer,uuid,uuid) from public,anon;
grant execute on function public.scouting_save(uuid,uuid,text,integer,text,jsonb,integer,uuid,uuid) to authenticated;

create or replace function scouting_private.claim_delivery(p_record uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
declare d public.scouting_delivery; snapshot jsonb; claimed boolean := false;
begin
 select * into d from public.scouting_delivery where record_id=p_record and record_version=p_version for update;
 if not found then raise exception using errcode='22023',message='No delivery requested for this record version.'; end if;
 select r.snapshot into snapshot from public.scouting_revisions r where r.record_id=p_record and r.version=p_version;
 if d.status in ('queued','failed','not_configured') then
  update public.scouting_delivery set status='sending',error=null,updated_at=clock_timestamp() where id=d.id returning * into d;
  claimed := true;
 end if;
 return jsonb_build_object('record',snapshot,'delivery',to_jsonb(d),'claimed',claimed);
end
$fn$;
revoke all on function scouting_private.claim_delivery(uuid,integer) from public,anon,authenticated;
grant execute on function scouting_private.claim_delivery(uuid,integer) to service_role;
-- Does: Reserve one requested scouting notification for a server dispatcher.
create or replace function public.scouting_claim_delivery(p_record uuid,p_version integer)
returns jsonb language sql security invoker set search_path = pg_catalog as $fn$
 select scouting_private.claim_delivery(p_record,p_version);
$fn$;
revoke all on function public.scouting_claim_delivery(uuid,integer) from public,anon,authenticated;
grant execute on function public.scouting_claim_delivery(uuid,integer) to service_role;

create or replace function scouting_private.finish_delivery(p_delivery uuid,p_status text,p_message_id text,p_error text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
declare d public.scouting_delivery;
begin
 if p_status is null or p_status not in ('delivered','failed','uncertain','not_configured') or (p_status='delivered' and coalesce(p_message_id,'')='') then raise exception using errcode='22023',message='Invalid delivery result.'; end if;
 select * into d from public.scouting_delivery where id=p_delivery for update;
 if not found then raise exception using errcode='22023',message='Unknown delivery.'; end if;
 if d.status<> 'sending' then return to_jsonb(d); end if;
 update public.scouting_delivery set status=p_status,message_id=left(p_message_id,100),error=left(p_error,500),updated_at=clock_timestamp() where id=p_delivery returning * into d;
 return to_jsonb(d);
end
$fn$;
revoke all on function scouting_private.finish_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function scouting_private.finish_delivery(uuid,text,text,text) to service_role;
-- Does: Record the server notification outcome without changing scouting data.
create or replace function public.scouting_finish_delivery(p_delivery uuid,p_status text,p_message_id text,p_error text)
returns jsonb language sql security invoker set search_path = pg_catalog as $fn$
 select scouting_private.finish_delivery(p_delivery,p_status,p_message_id,p_error);
$fn$;
revoke all on function public.scouting_finish_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.scouting_finish_delivery(uuid,text,text,text) to service_role;

insert into public.connector_registry(function_name,tool,level) values ('scouting_save','call_app','confirm') on conflict(function_name) do update set level='confirm';
insert into public.connector_log_tables(table_name,note) values
 ('scouting_records','Scouting current records'),('scouting_revisions','Scouting correction trail'),('scouting_operations','Scouting retry receipts'),('scouting_delivery','Scouting notification status')
on conflict(table_name) do nothing;

-- Authorship and audit receipts stay with the original identity when accounts merge.
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
    ('cert_requests', 'member_id', 'move'),
    ('cert_requests', 'reviewed_by', 'move'),
    ('discipline_records', 'member_id', 'move'),
    ('discipline_records', 'created_by', 'move'),
    ('discipline_records', 'appeal_by', 'move'),
    ('discord_announce_roles', 'created_by', 'move'),
    ('discord_announcements', 'sent_by', 'move'),
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
    ('safety_violations', 'member_id', 'move'),
    ('safety_violations', 'logged_by', 'move'),
    ('session_corrections', 'member_id', 'move'),
    ('session_corrections', 'reviewed_by', 'move'),
    ('session_reviews', 'user_id', 'move'),
    ('session_reviews', 'reviewed_by', 'move'),
    ('signout_requests', 'member_id', 'move'),
    ('signout_requests', 'decided_by', 'move'),
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
    ('team_weeks', 'posted_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public,anon,authenticated;
