-- ============================================================
-- 0027_scouting_match_fields: REBUILT match fields on a scouting observation
-- (ledger 0017)
--
-- Run once in the Supabase SQL editor, AFTER 0022. Re-runnable: two functions
-- are created or replaced, nothing else. No table, policy or grant changes.
--
-- WHY. The observation asked only three yes/no capability questions (TRENCH,
-- BUMP, floor intake), and a student tester wrote: "This evidence/scouting
-- material does not seem good, as I believe every robot does these areas."
-- His own notes were FUEL counts, shooting and defense out of 10, where a
-- robot collects and shoots, and "got stuck". This adds those as match fields.
--
-- WHAT THIS DOES.
--   scouting_private.validate     re-defined from 0022 with ONE change: an
--                                 observation may carry "match", checked by
--                                 validate_match. Every other rule is 0022's,
--                                 copied verbatim (nothing is loosened).
--   scouting_private.validate_match   the match object: known keys only, each
--                                 its own type. Counts are whole numbers 0 to
--                                 500; choices are their listed words; ratings
--                                 1 to 5; fouls a note of at most 500
--                                 characters. A key that is absent is not
--                                 recorded; JSON null is refused.
--   public.scouting_match_fields() the field list, read by the app to know
--                                 these fields are accepted (before this file
--                                 is pasted the function is missing and the
--                                 form keeps the three capability questions).
--
-- THE FIELDS (payload.match):
--   auto_fuel, teleop_fuel, teleop_missed       counts
--   auto_climb, shuttled, died, tipped, stuck, broke   yes | no | did_not_see
--   defense            none | some | most
--   defense_rating, driver_skill                 1 to 5
--   tower              none | level1 | level2 | level3 | failed | did_not_see
--   fouls              text
--
-- TO UNDO: paste scouting_private.validate from 0022 again (it refuses the
-- "match" key, so saved observations that carry it stay readable but cannot
-- be corrected until this file is pasted again), then drop function
-- scouting_private.validate_match(jsonb), public.scouting_match_fields().
-- ============================================================

do $prereq$
begin
  if to_regprocedure('scouting_private.validate(text,integer,text,jsonb,uuid)') is null then
    raise exception '0027 needs 0022_scouting.sql applied first';
  end if;
end
$prereq$;

create or replace function scouting_private.validate_match(p_match jsonb)
returns void language plpgsql immutable security definer set search_path = pg_catalog as $fn$
declare k text; v jsonb; s text;
begin
 if jsonb_typeof(p_match) is distinct from 'object' then raise exception using errcode='22023',message='Match fields must be an object.'; end if;
 for k,v in select * from jsonb_each(p_match) loop
  if jsonb_typeof(v)='null' then raise exception using errcode='22023',message='Leave a match field out when it was not recorded; null is not an answer.'; end if;
  s := v #>> '{}';
  if k in ('auto_fuel','teleop_fuel','teleop_missed') then
   if jsonb_typeof(v)<>'number' or s !~ '^[0-9]{1,3}$' or s::integer>500 then raise exception using errcode='22023',message='A FUEL count is a whole number from 0 to 500.'; end if;
  elsif k in ('auto_climb','shuttled','died','tipped','stuck','broke') then
   if jsonb_typeof(v)<>'string' or s not in ('yes','no','did_not_see') then raise exception using errcode='22023',message='Choose yes, no or did not see.'; end if;
  elsif k='defense' then
   if jsonb_typeof(v)<>'string' or s not in ('none','some','most') then raise exception using errcode='22023',message='Defense is none, some or most of the match.'; end if;
  elsif k in ('defense_rating','driver_skill') then
   if jsonb_typeof(v)<>'number' or s !~ '^[1-5]$' then raise exception using errcode='22023',message='A rating is a whole number from 1 to 5.'; end if;
  elsif k='tower' then
   if jsonb_typeof(v)<>'string' or s not in ('none','level1','level2','level3','failed','did_not_see') then raise exception using errcode='22023',message='Choose the TOWER level reached.'; end if;
  elsif k='fouls' then
   if jsonb_typeof(v)<>'string' or length(s)>500 then raise exception using errcode='22023',message='Fouls and cards are a note of at most 500 characters.'; end if;
  else
   raise exception using errcode='22023',message='Unknown match field.';
  end if;
 end loop;
end
$fn$;
revoke all on function scouting_private.validate_match(jsonb) from public,anon,authenticated,service_role;

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
  when 'observation' then array['answers','notes','source','video_url','assignment_id','request_delivery','source_scope','source_event','match']
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
 -- 0027: REBUILT match fields. Absent means not recorded; null is refused
 -- so a missing answer can never arrive as a value, and a count is a whole
 -- number, so 0 is an observed zero.
 if p_kind='observation' and p_payload ? 'match' then
  perform scouting_private.validate_match(p_payload->'match');
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

-- Does: List the REBUILT match fields a scouting observation can carry.
create or replace function public.scouting_match_fields()
returns jsonb language sql immutable security invoker set search_path = pg_catalog as $fn$
 select '{"version":1,"counts":["auto_fuel","teleop_fuel","teleop_missed"],"yes_no":["auto_climb","shuttled","died","tipped","stuck","broke"],"defense":["none","some","most"],"ratings":["defense_rating","driver_skill"],"tower":["none","level1","level2","level3","failed","did_not_see"],"notes":["fouls"]}'::jsonb;
$fn$;
revoke all on function public.scouting_match_fields() from public,anon;
grant execute on function public.scouting_match_fields() to authenticated,service_role;
