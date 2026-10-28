-- ============================================================
-- 0037_scouting_observation_options: observation options the scouting lead
-- controls (ledger 0029). Needs 0030.
--
-- WHY. Mr. Pina, 2026-10-28: scouting is more than FUEL, the TRENCH and the
-- BUMP. Does the robot pass, from where, does the passing work, does it
-- defend, does it handle phase shifts. Rather than hard-code every question,
-- the scouting lead decides which observation options a scout sees; scouts
-- ask for options; a one-off note about one robot can become an option.
--
-- WHAT THIS DOES.
--   public.scouting_options   one row per option, for every event (a team-wide
--                    list, season to season). key (a slug, never reused),
--                    label, help, type (yesno, choice, count, rating, note),
--                    choices for a choice, phase (auto, teleop, endgame,
--                    reliability, strategy), status (requested, active,
--                    declined, retired), position, who asked and why, the
--                    observation that inspired it, who decided and when. RLS
--                    on, NO policy, every client privilege revoked: read and
--                    written only through the functions below.
--   scouting_private.can_manage_options()  staff, holders of scouting.manage,
--                    or the scouting lead of any event that has not ended.
--   scouting_private.validate_custom(p_custom)  each key an option that is
--                    active or retired (retired keeps old records correctable),
--                    each value its type's: yes/no/did not see, one of the
--                    choices or did not see, a count 0 to 500, a rating 1 to 5,
--                    a note up to 500 characters. JSON null refused: a skipped
--                    option is absent, never zero.
--   scouting_private.validate   re-defined from 0030 with three changes only:
--                    'custom' is an allowed observation key, it is checked by
--                    validate_custom, and a super-scout note may not carry it.
--                    Everything else is 0030's text verbatim.
--   public.scouting_options_list()   any member who may scout: every active
--                    and retired option; requested and declined ones too for a
--                    manager, and a scout's own requests.
--   public.scouting_option_request(...)  any member who may scout asks for an
--                    option (status requested), at most 20 open at once.
--   public.scouting_option_save(...)  managers add (active at once), edit,
--                    approve, decline, retire, restore and reorder. A type
--                    never changes once the option has been active, and a
--                    choice is never removed once active (saved answers would
--                    stop validating); labels, help and phase may change.
--
-- Re-runnable. Paste again after any re-paste of 0030 (it re-defines
-- validate) or of 0035 (it re-defines _merge_member_rules). TO UNDO: paste scouting_private.validate from 0030 again (saved
-- option answers then fail validation on correction), then drop the four
-- functions above and table public.scouting_options.
-- ============================================================

do $prereq$
begin
  if to_regprocedure('scouting_private.validate_super(jsonb)') is null then
    raise exception '0037 needs 0030_scouting_shifts_super.sql applied first';
  end if;
end
$prereq$;

create table if not exists public.scouting_options (
 id uuid primary key default gen_random_uuid(),
 key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
 label text not null check (length(btrim(label)) between 2 and 120),
 help text check (help is null or length(help) <= 300),
 type text not null check (type in ('yesno','choice','count','rating','note')),
 choices jsonb check (choices is null or jsonb_typeof(choices) = 'array'),
 phase text not null default 'teleop' check (phase in ('auto','teleop','endgame','reliability','strategy')),
 status text not null default 'requested' check (status in ('requested','active','declined','retired')),
 position integer not null default 100 check (position between 0 and 10000),
 was_active boolean not null default false,
 requested_by uuid references public.profiles(id) on delete set null,
 request_note text check (request_note is null or length(request_note) <= 500),
 example_record uuid references public.scouting_records(id) on delete set null,
 example_team integer check (example_team is null or example_team between 1 and 99999),
 decided_by uuid references public.profiles(id) on delete set null,
 decided_at timestamptz,
 decline_reason text check (decline_reason is null or length(decline_reason) <= 300),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.scouting_options enable row level security;
revoke all on table public.scouting_options from public, anon, authenticated;

create or replace function scouting_private.can_manage_options()
returns boolean language sql stable security definer set search_path = pg_catalog as $fn$
 select scouting_private.can_access(auth.uid()) and (
  public.is_staff() or public.has_capability('scouting.manage') or exists (
   select 1 from public.event_roles er join public.events e on e.id = er.event_id
    where er.member_id = auth.uid() and er.role = 'scouting_lead' and e.ends_at > now()
  )
 );
$fn$;
revoke all on function scouting_private.can_manage_options() from public, anon;
grant execute on function scouting_private.can_manage_options() to authenticated, service_role;

-- The choices of a choice option: 2 to 8 pairs [value, label], value a slug.
create or replace function scouting_private.valid_choices(p_choices jsonb)
returns boolean language sql immutable security definer set search_path = pg_catalog as $fn$
 select jsonb_typeof(p_choices) = 'array' and jsonb_array_length(p_choices) between 2 and 8
  and not exists (select 1 from jsonb_array_elements(p_choices) c
   where jsonb_typeof(c) <> 'array' or jsonb_array_length(c) <> 2
     or jsonb_typeof(c->0) <> 'string' or (c->>0) !~ '^[a-z][a-z0-9_]{0,29}$' or (c->>0) = 'did_not_see'
     or jsonb_typeof(c->1) <> 'string' or length(btrim(c->>1)) not between 1 and 60)
  and (select count(distinct c->>0) from jsonb_array_elements(p_choices) c) = jsonb_array_length(p_choices);
$fn$;
revoke all on function scouting_private.valid_choices(jsonb) from public, anon, authenticated, service_role;

create or replace function scouting_private.validate_custom(p_custom jsonb)
returns void language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare k text; v jsonb; s text; o record;
begin
 if jsonb_typeof(p_custom) is distinct from 'object' then raise exception using errcode='22023',message='Observation option answers must be an object.'; end if;
 for k,v in select * from jsonb_each(p_custom) loop
  if jsonb_typeof(v)='null' then raise exception using errcode='22023',message='Leave an observation option out when it was not recorded; null is not an answer.'; end if;
  select * into o from public.scouting_options x where x.key = k and x.status in ('active','retired');
  if not found then raise exception using errcode='22023',message='That observation option is not turned on.'; end if;
  s := v #>> '{}';
  if o.type='yesno' then
   if jsonb_typeof(v)<>'string' or s not in ('yes','no','did_not_see') then raise exception using errcode='22023',message='Choose yes, no or did not see.'; end if;
  elsif o.type='choice' then
   if jsonb_typeof(v)<>'string' or (s<>'did_not_see' and not exists(select 1 from jsonb_array_elements(o.choices) c where c->>0 = s)) then
    raise exception using errcode='22023',message='Choose one of the listed answers or did not see.';
   end if;
  elsif o.type='count' then
   if jsonb_typeof(v)<>'number' or s !~ '^[0-9]{1,3}$' or s::integer>500 then raise exception using errcode='22023',message='A count is a whole number from 0 to 500.'; end if;
  elsif o.type='rating' then
   if jsonb_typeof(v)<>'number' or s !~ '^[1-5]$' then raise exception using errcode='22023',message='A rating is a whole number from 1 to 5.'; end if;
  elsif o.type='note' then
   if jsonb_typeof(v)<>'string' or length(btrim(s)) not between 1 and 500 then raise exception using errcode='22023',message='A note is 1 to 500 characters.'; end if;
  end if;
 end loop;
end
$fn$;
revoke all on function scouting_private.validate_custom(jsonb) from public, anon, authenticated, service_role;

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
  when 'observation' then array['answers','notes','source','video_url','assignment_id','request_delivery','source_scope','source_event','match','role','super','custom']
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
 -- 0037: observation options the scouting lead turned on (scouting_options).
 if p_kind='observation' and p_payload ? 'custom' then
  perform scouting_private.validate_custom(p_payload->'custom');
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
   if p_payload ? 'custom' then raise exception using errcode='22023',message='A super-scout note carries no observation option answers.'; end if;
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

-- A key from a label: lower-case words joined by _, at most 36 characters,
-- with _2, _3 ... when taken (keys are never reused, even when declined).
create or replace function scouting_private.option_key(p_label text)
returns text language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare base text; k text; n integer := 1;
begin
 base := left(trim(both '_' from regexp_replace(lower(coalesce(p_label,'')), '[^a-z0-9]+', '_', 'g')), 36);
 if base !~ '^[a-z]' then base := 'opt_' || base; end if;
 base := left(trim(both '_' from base), 36);
 if length(base) < 2 then base := 'option'; end if;
 k := base;
 while exists (select 1 from public.scouting_options where key = k) loop n := n + 1; k := base || '_' || n; end loop;
 return k;
end
$fn$;
revoke all on function scouting_private.option_key(text) from public, anon, authenticated, service_role;

create or replace function scouting_private.option_json(o public.scouting_options)
returns jsonb language sql stable security definer set search_path = pg_catalog as $fn$
 select jsonb_build_object('id', o.id, 'key', o.key, 'label', o.label, 'help', o.help, 'type', o.type, 'choices', o.choices,
  'phase', o.phase, 'status', o.status, 'position', o.position, 'was_active', o.was_active, 'request_note', o.request_note,
  'example_record', o.example_record, 'example_team', o.example_team, 'decline_reason', o.decline_reason,
  'requested_by', o.requested_by, 'requested_by_name', (select coalesce(nullif(btrim(p.nickname),''), nullif(btrim(p.full_name),''), 'Member') from public.profiles p where p.id = o.requested_by),
  'decided_at', o.decided_at, 'created_at', o.created_at, 'updated_at', o.updated_at, 'mine', o.requested_by = auth.uid());
$fn$;
revoke all on function scouting_private.option_json(public.scouting_options) from public, anon, authenticated, service_role;

-- Does: List the scouting observation options (the ones the scouting lead turned on, plus requests you can see), with whether you can manage them.
create or replace function public.scouting_options_list()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare mgr boolean;
begin
 if not scouting_private.caller_access() then raise exception using errcode='42501', message='Scouting is for approved active team members.'; end if;
 mgr := scouting_private.can_manage_options();
 return jsonb_build_object('can_manage', mgr, 'options', coalesce((select jsonb_agg(scouting_private.option_json(o) order by o.status = 'active' desc, o.position, o.created_at)
  from public.scouting_options o where o.status in ('active','retired') or mgr or o.requested_by = auth.uid()), '[]'::jsonb));
end
$fn$;

-- Does: Ask the scouting lead to add an observation option (what to watch for, its answer type, and why), optionally from one of your observations.
create or replace function public.scouting_option_request(p_label text, p_type text, p_choices jsonb default null, p_phase text default 'teleop', p_note text default null, p_example_record uuid default null, p_example_team integer default null)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $fn$
declare o public.scouting_options;
begin
 if not scouting_private.caller_access() then raise exception using errcode='42501', message='Scouting is for approved active team members.'; end if;
 if (select count(*) from public.scouting_options where requested_by = auth.uid() and status = 'requested') >= 20 then
  raise exception using errcode='22023', message='You already have 20 open requests. Wait for the scouting lead to answer some.';
 end if;
 if p_label is null or length(btrim(p_label)) not between 2 and 120 then raise exception using errcode='22023', message='Name the option in 2 to 120 characters.'; end if;
 if p_type is null or p_type not in ('yesno','choice','count','rating','note') then raise exception using errcode='22023', message='Choose an answer type.'; end if;
 if p_type = 'choice' and (p_choices is null or not scouting_private.valid_choices(p_choices)) then raise exception using errcode='22023', message='A choice needs 2 to 8 different answers.'; end if;
 if p_example_record is not null and not exists (select 1 from public.scouting_records r where r.id = p_example_record and r.kind = 'observation') then
  raise exception using errcode='22023', message='That observation was not found.';
 end if;
 insert into public.scouting_options (key, label, type, choices, phase, status, requested_by, request_note, example_record, example_team)
 values (scouting_private.option_key(p_label), btrim(p_label), p_type, case when p_type = 'choice' then p_choices end, coalesce(p_phase, 'teleop'), 'requested', auth.uid(), nullif(btrim(coalesce(p_note,'')), ''), p_example_record, p_example_team)
 returning * into o;
 return scouting_private.option_json(o);
end
$fn$;

-- Does: Add, edit, approve, decline, retire, restore or reorder a scouting observation option (scouting lead and staff).
create or replace function public.scouting_option_save(p_id uuid, p_label text, p_type text, p_choices jsonb default null, p_phase text default 'teleop', p_help text default null, p_status text default 'active', p_position integer default null, p_decline_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $fn$
declare o public.scouting_options; old public.scouting_options;
begin
 if not scouting_private.can_manage_options() then raise exception using errcode='42501', message='Only the scouting lead or staff manage observation options.'; end if;
 if p_status is null or p_status not in ('active','declined','retired','requested') then raise exception using errcode='22023', message='Choose active, declined, retired or requested.'; end if;
 if p_label is null or length(btrim(p_label)) not between 2 and 120 then raise exception using errcode='22023', message='Name the option in 2 to 120 characters.'; end if;
 if p_type is null or p_type not in ('yesno','choice','count','rating','note') then raise exception using errcode='22023', message='Choose an answer type.'; end if;
 if p_type = 'choice' and (p_choices is null or not scouting_private.valid_choices(p_choices)) then raise exception using errcode='22023', message='A choice needs 2 to 8 different answers.'; end if;
 if p_id is null then
  insert into public.scouting_options (key, label, help, type, choices, phase, status, position, was_active, requested_by, decided_by, decided_at)
  values (scouting_private.option_key(p_label), btrim(coalesce(p_label,'')), nullif(btrim(coalesce(p_help,'')),''), p_type, case when p_type = 'choice' then p_choices end,
          coalesce(p_phase,'teleop'), p_status, coalesce(p_position, 100), p_status = 'active', null, auth.uid(), now())
  returning * into o;
  return scouting_private.option_json(o);
 end if;
 select * into old from public.scouting_options where id = p_id for update;
 if not found then raise exception using errcode='P0002', message='That observation option was not found.'; end if;
 if old.was_active and p_type <> old.type then raise exception using errcode='22023', message='The answer type cannot change once the option has been used. Retire it and add a new one.'; end if;
 if old.was_active and old.type = 'choice' and exists (select 1 from jsonb_array_elements(old.choices) c where not exists (select 1 from jsonb_array_elements(p_choices) n where n->>0 = c->>0)) then
  raise exception using errcode='22023', message='A choice cannot be removed once the option has been used. Rename it instead.';
 end if;
 update public.scouting_options set label = btrim(coalesce(p_label,'')), help = nullif(btrim(coalesce(p_help,'')),''), type = p_type,
   choices = case when p_type = 'choice' then p_choices end, phase = coalesce(p_phase, phase), status = p_status,
   position = coalesce(p_position, position), was_active = was_active or p_status = 'active',
   decline_reason = case when p_status = 'declined' then nullif(btrim(coalesce(p_decline_reason,'')),'') end,
   decided_by = case when p_status is distinct from old.status then auth.uid() else decided_by end,
   decided_at = case when p_status is distinct from old.status then now() else decided_at end,
   updated_at = now()
  where id = p_id returning * into o;
 return scouting_private.option_json(o);
end
$fn$;

revoke all on function public.scouting_options_list(), public.scouting_option_request(text,text,jsonb,text,text,uuid,integer),
  public.scouting_option_save(uuid,text,text,jsonb,text,text,text,integer,text) from public, anon;
grant execute on function public.scouting_options_list(), public.scouting_option_request(text,text,jsonb,text,text,uuid,integer),
  public.scouting_option_save(uuid,text,text,jsonb,text,text,text,integer,text) to authenticated, service_role;

-- The account merge (0020) must know every column that names a member. 0035
-- last replaced this list; copied here with scouting_options.requested_by and
-- decided_by added. Paste 0037 again after any re-paste of 0020, 0022, 0024,
-- 0026, 0028, 0029, 0031, 0033 or 0035.
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
    ('scouting_options', 'decided_by', 'move')
  ) as x(tbl, col, rule)
$fn$;
revoke all on function public._merge_member_rules() from public, anon, authenticated;
