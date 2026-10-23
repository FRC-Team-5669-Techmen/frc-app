-- ============================================================
-- 0030_scouting_shifts_super: super scouts and the shared "now" match number
-- (ledger 0022)
--
-- Run once in the Supabase SQL editor, AFTER 0027. Re-runnable: functions are
-- created or replaced, the one table is created if missing, the grants are
-- re-stated. No existing table, policy or row is changed.
--
-- WHY. Elite FRC teams scout with two layers: data scouts count one robot
-- each (redundant pairs when there are enough people), and one or two SUPER
-- scouts per alliance record no counts at all, only how good the drivers,
-- defense, speed and intake are and what failed. And shifts are written by
-- match number (Q1 to Q12), never clock time, because events run late; a lead
-- moves one shared "now" match number as matches really start.
--
-- WHAT THIS DOES.
--   scouting_private.validate_super  the super-scout object: driver_skill,
--                         defense, speed, intake (whole numbers 1 to 5) and
--                         failures (a note of 1 to 1000 characters). Known keys
--                         only, at least one, JSON null refused.
--   scouting_private.validate   re-defined from 0027 with ONE addition: an
--                         observation or assignment may carry role (scout or
--                         super); a super note carries super and no counts or
--                         capability answers; a super assignment carries its
--                         alliance (red or blue) and one to three different
--                         teams including its own team. Everything else is
--                         0027's text, copied verbatim (nothing loosened).
--   public.scouting_now   one row per event: the current qualification match
--                         number (0 to 999) and the shift block size (1 to
--                         200). RLS on with NO policy and every privilege
--                         revoked from anon and authenticated: it is read and
--                         written only through the two functions below.
--   public.scouting_now_get(p_event)   any member who may scout reads it
--                         (null before a lead first sets it).
--   public.scouting_now_set(p_event, p_match, p_delta, p_block)   scouting
--                         managers only (scouting_private.can_manage): set the
--                         match number, or bump it by p_delta atomically, and
--                         optionally the block size. Competition or training
--                         events only, as scouting_save.
--
-- Redundant pairs need nothing here: 0022's assignment index is already
-- unique per (event, team, match, ASSIGNEE), so two scouts on one robot was
-- always allowed, and each writes their own observation.
--
-- TO UNDO: paste scouting_private.validate from 0027 again (saved super notes
-- and super assignments stay readable but cannot be corrected until this file
-- is pasted again), then drop function public.scouting_now_set(uuid,integer,
-- integer,integer), public.scouting_now_get(uuid),
-- scouting_private.validate_super(jsonb); drop table public.scouting_now.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('scouting_private.validate_match(jsonb)') is null then
    raise exception '0030 needs 0027_scouting_match_fields.sql applied first';
  end if;
end
$prereq$;

create or replace function scouting_private.validate_super(p_super jsonb)
returns void language plpgsql immutable security definer set search_path = pg_catalog as $fn$
declare k text; v jsonb; s text;
begin
 if jsonb_typeof(p_super) is distinct from 'object' or not exists(select 1 from jsonb_object_keys(p_super)) then
  raise exception using errcode='22023',message='A super-scout note needs a rating or a failure note.';
 end if;
 for k,v in select * from jsonb_each(p_super) loop
  if jsonb_typeof(v)='null' then raise exception using errcode='22023',message='Leave a rating out when it was not judged; null is not an answer.'; end if;
  s := v #>> '{}';
  if k in ('driver_skill','defense','speed','intake') then
   if jsonb_typeof(v)<>'number' or s !~ '^[1-5]$' then raise exception using errcode='22023',message='A super-scout rating is a whole number from 1 to 5.'; end if;
  elsif k='failures' then
   if jsonb_typeof(v)<>'string' or length(btrim(s)) not between 1 and 1000 then raise exception using errcode='22023',message='Failure notes are 1 to 1000 characters.'; end if;
  else
   raise exception using errcode='22023',message='Unknown super-scout field.';
  end if;
 end loop;
end
$fn$;
revoke all on function scouting_private.validate_super(jsonb) from public,anon,authenticated,service_role;

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
  when 'observation' then array['answers','notes','source','video_url','assignment_id','request_delivery','source_scope','source_event','match','role','super']
  when 'assignment' then array['assignee','status','instructions','video_url','source_scope','source_event','role','alliance','teams']
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
 -- 0027: REBUILT match fields. Absent means not recorded; null is refused
 -- so a missing answer can never arrive as a value, and a count is a whole
 -- number, so 0 is an observed zero.
 if p_kind='observation' and p_payload ? 'match' then
  perform scouting_private.validate_match(p_payload->'match');
 end if;
 -- 0030: super scouts. A super-scout note is qualitative only: it carries
 -- payload.super and no counts or capability answers. A super-scout
 -- assignment names its alliance and that alliance's teams.
 if p_kind in ('observation','assignment') and p_payload ? 'role'
    and (jsonb_typeof(p_payload->'role')<>'string' or p_payload->>'role' not in ('scout','super')) then
  raise exception using errcode='22023',message='Choose scout or super scout.';
 end if;
 if p_kind='observation' then
  if p_payload->>'role'='super' then
   if not (p_payload ? 'super') then raise exception using errcode='22023',message='A super-scout note needs a rating or a failure note.'; end if;
   if p_payload ? 'match' or exists(select 1 from jsonb_object_keys(p_payload->'answers')) then
    raise exception using errcode='22023',message='A super-scout note carries no counts or capability answers.';
   end if;
   perform scouting_private.validate_super(p_payload->'super');
  elsif p_payload ? 'super' then
   raise exception using errcode='22023',message='Only a super-scout note carries super-scout ratings.';
  end if;
 elsif p_kind='assignment' then
  if p_payload->>'role'='super' then
   if coalesce(p_payload->>'alliance','') not in ('red','blue') then raise exception using errcode='22023',message='A super-scout assignment names the red or blue alliance.'; end if;
   if jsonb_typeof(p_payload->'teams') is distinct from 'array' or jsonb_array_length(p_payload->'teams') not between 1 and 3
      or exists(select 1 from jsonb_array_elements(p_payload->'teams') x where jsonb_typeof(x)<>'number' or (x #>> '{}') !~ '^[0-9]{1,5}$' or (x #>> '{}')::integer not between 1 and 99999)
      or (select count(distinct x #>> '{}') from jsonb_array_elements(p_payload->'teams') x) <> jsonb_array_length(p_payload->'teams')
      or not exists(select 1 from jsonb_array_elements(p_payload->'teams') x where (x #>> '{}') = p_team::text) then
    raise exception using errcode='22023',message='A super-scout assignment lists one to three different teams, including its own team.';
   end if;
  elsif p_payload ? 'alliance' or p_payload ? 'teams' then
   raise exception using errcode='22023',message='Only a super-scout assignment names an alliance.';
  end if;
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


create table if not exists public.scouting_now (
 event_id uuid primary key references public.events(id) on delete cascade,
 match_number integer not null default 0 check (match_number between 0 and 999),
 block_size integer not null default 12 check (block_size between 1 and 200),
 updated_at timestamptz not null default now()
);
alter table public.scouting_now enable row level security;
-- No policy, and the bootstrap default privileges revoked: the table is
-- reached only through the two security-definer functions below.
revoke all on table public.scouting_now from public, anon, authenticated;

-- Does: Read the current match number and shift block size for an event.
create or replace function public.scouting_now_get(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare r public.scouting_now;
begin
 if not scouting_private.caller_access() then raise exception using errcode='42501',message='Scouting is available to approved student and staff accounts.'; end if;
 select * into r from public.scouting_now where event_id = p_event;
 if not found then return null; end if;
 return jsonb_build_object('event_id', r.event_id, 'match_number', r.match_number, 'block_size', r.block_size, 'updated_at', r.updated_at);
end
$fn$;

-- Does: Set or bump the current match number (and optionally the shift block size) for an event.
create or replace function public.scouting_now_set(p_event uuid, p_match integer default null, p_delta integer default null, p_block integer default null)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $fn$
declare r public.scouting_now;
begin
 if not scouting_private.can_manage(p_event) then raise exception using errcode='42501',message='Only scouting managers can move the current match.'; end if;
 if not exists(select 1 from public.events where id=p_event and kind in ('competition','training')) then raise exception using errcode='22023',message='Choose a competition or training event.'; end if;
 if (p_match is null) = (p_delta is null) and p_block is null then raise exception using errcode='22023',message='Set a match number, or bump it by a step.'; end if;
 if p_match is not null and p_delta is not null then raise exception using errcode='22023',message='Set a match number or bump it, not both.'; end if;
 if p_match is not null and p_match not between 0 and 999 then raise exception using errcode='22023',message='A match number is 0 to 999.'; end if;
 if p_delta is not null and p_delta not between -50 and 50 then raise exception using errcode='22023',message='Bump by at most 50 matches.'; end if;
 if p_block is not null and p_block not between 1 and 200 then raise exception using errcode='22023',message='A shift block is 1 to 200 matches.'; end if;
 insert into public.scouting_now(event_id, match_number, block_size)
  values (p_event, greatest(0, least(999, coalesce(p_match, coalesce(p_delta, 0)))), coalesce(p_block, 12))
 on conflict (event_id) do update set
  match_number = case when p_match is not null then p_match when p_delta is not null then greatest(0, least(999, scouting_now.match_number + p_delta)) else scouting_now.match_number end,
  block_size = coalesce(p_block, scouting_now.block_size),
  updated_at = now()
 returning * into r;
 return jsonb_build_object('event_id', r.event_id, 'match_number', r.match_number, 'block_size', r.block_size, 'updated_at', r.updated_at);
end
$fn$;
revoke all on function public.scouting_now_get(uuid), public.scouting_now_set(uuid,integer,integer,integer) from public, anon;
grant execute on function public.scouting_now_get(uuid), public.scouting_now_set(uuid,integer,integer,integer) to authenticated, service_role;
