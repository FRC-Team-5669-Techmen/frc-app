-- ============================================================
-- 0042_scouting_pick_board: the shared pick board (ledger 0032). Needs 0030.
--
-- WHY. Mr. Pina, 2026-10-28: choosing alliance partners was manual (every
-- scout tiering every team by hand), and there was no way to follow alliance
-- selection in the app. The board ranks teams automatically (src/scouting/
-- pickRank.js, in the browser) and needs ONE shared place for what people
-- add: the strategy lead's Must pick / Avoid / bump per team, the live
-- selection as it is announced, and the match results the board ranks from.
--
-- WHAT THIS DOES.
--   public.scouting_pick_board   one row per event. state jsonb holds four
--                    sections: overrides { "<team>": { flag, bump, note, by,
--                    at } }, selection { seeds, log, rounds, alliances,
--                    our_team, version }, matches { fetched_at, event_key,
--                    source, matches }, and settings { event_key, our_team,
--                    rounds, alliances, want_defense }. RLS on, NO policy,
--                    every client privilege revoked: read and written only
--                    through the two functions below.
--   public.scouting_pick_board_get(p_event)   anyone who may scout reads it
--                    (null before the first save).
--   public.scouting_pick_board_save(p_event, p_section, p_value, p_team,
--                    p_expected)   scouting managers only (staff, holders of
--                    scouting.manage, the event's scouting lead):
--                      override  one team's flag ('must' | 'avoid' | null),
--                                bump (-30..30 points), note (<= 300 chars);
--                                a null value clears that team. Last write
--                                wins per team: two leads editing two teams
--                                never collide.
--                      selection the whole log, with p_expected = the
--                                selection version the caller last saw. A
--                                stale version is refused (40001) so two
--                                operators cannot silently overwrite each
--                                other's picks.
--                      matches   the latest results snapshot (<= 400 KB).
--                      settings  the board's settings.
--   Every save bumps version and stamps updated_at; who changed what is
--   inside the state (each override's by, the selection's by, the results'
--   saved_by), so the row has no member column for the merge to remap.
-- Nothing here touches scouting_records: a scout's own tiers stay in their
-- pick_list record, read by the board as votes.
-- ============================================================

create table if not exists public.scouting_pick_board (
 event_id uuid primary key references public.events(id) on delete cascade,
 state jsonb not null default '{}'::jsonb,
 version integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.scouting_pick_board enable row level security;
-- No policy, and the bootstrap default privileges revoked: the table is
-- reached only through the two security-definer functions below.
revoke all on table public.scouting_pick_board from public, anon, authenticated;

-- Does: Read an event's shared pick board (Must pick / Avoid marks, the live alliance selection, match results).
create or replace function public.scouting_pick_board_get(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare r public.scouting_pick_board;
begin
 if not scouting_private.caller_access() then raise exception using errcode='42501',message='Scouting is available to approved student and staff accounts.'; end if;
 select * into r from public.scouting_pick_board where event_id = p_event;
 if not found then return null; end if;
 return jsonb_build_object('event_id', r.event_id, 'state', r.state, 'version', r.version, 'updated_at', r.updated_at);
end
$fn$;

-- Does: Change an event's shared pick board: one team's Must pick / Avoid / bump / note, the alliance selection log, the match results snapshot, or the board settings.
create or replace function public.scouting_pick_board_save(p_event uuid, p_section text, p_value jsonb, p_team integer default null, p_expected integer default null)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $fn$
declare r public.scouting_pick_board; st jsonb; cur integer; v jsonb;
begin
 if not scouting_private.can_manage(p_event) then raise exception using errcode='42501',message='Only scouting managers can change the pick board.'; end if;
 if not exists(select 1 from public.events where id=p_event and kind in ('competition','training')) then raise exception using errcode='22023',message='Choose a competition or training event.'; end if;
 if p_section is null or p_section not in ('override','selection','matches','settings') then raise exception using errcode='22023',message='Unknown pick board section.'; end if;
 if p_value is not null and octet_length(p_value::text) > 400000 then raise exception using errcode='22023',message='That is too much data for the pick board.'; end if;
 insert into public.scouting_pick_board(event_id) values (p_event) on conflict (event_id) do nothing;
 select * into r from public.scouting_pick_board where event_id = p_event for update;
 st := coalesce(r.state, '{}'::jsonb);

 if p_section = 'override' then
  if p_team is null or p_team not between 1 and 99999 then raise exception using errcode='22023',message='Name the team.'; end if;
  if p_value is null or jsonb_typeof(p_value) = 'null' then
   st := jsonb_set(st, '{overrides}', coalesce(st->'overrides','{}'::jsonb) - p_team::text);
  else
   if jsonb_typeof(p_value) <> 'object' then raise exception using errcode='22023',message='An override is an object.'; end if;
   if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('flag','bump','note')) then raise exception using errcode='22023',message='An override has flag, bump and note only.'; end if;
   if p_value ? 'flag' and jsonb_typeof(p_value->'flag') <> 'null' and coalesce(p_value->>'flag','') not in ('must','avoid') then raise exception using errcode='22023',message='The flag is must or avoid.'; end if;
   if p_value ? 'bump' and (jsonb_typeof(p_value->'bump') <> 'number' or (p_value->>'bump')::numeric not between -30 and 30) then raise exception using errcode='22023',message='A bump is -30 to 30 points.'; end if;
   if p_value ? 'note' and (jsonb_typeof(p_value->'note') <> 'string' or length(p_value->>'note') > 300) then raise exception using errcode='22023',message='A note is up to 300 characters.'; end if;
   v := jsonb_strip_nulls(p_value) || jsonb_build_object('by', auth.uid(), 'at', now());
   st := jsonb_set(st, '{overrides}', coalesce(st->'overrides','{}'::jsonb) || jsonb_build_object(p_team::text, v));
  end if;
 elsif p_section = 'selection' then
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception using errcode='22023',message='The selection is an object.'; end if;
  if jsonb_typeof(coalesce(p_value->'seeds','null')) <> 'array' or jsonb_typeof(coalesce(p_value->'log','null')) <> 'array' then raise exception using errcode='22023',message='The selection needs seeds and a log.'; end if;
  if jsonb_array_length(p_value->'seeds') > 200 or jsonb_array_length(p_value->'log') > 200 then raise exception using errcode='22023',message='The selection is too long.'; end if;
  if exists(select 1 from jsonb_array_elements(p_value->'log') a where jsonb_typeof(a) <> 'object' or coalesce(a->>'type','') not in ('pick','decline') or coalesce(jsonb_typeof(a->'team'),'missing') not in ('number','string')) then raise exception using errcode='22023',message='Each selection entry is a pick or a decline of one team.'; end if;
  cur := coalesce((st->'selection'->>'version')::integer, 0);
  if p_expected is null or p_expected <> cur then raise exception using errcode='40001',message='Someone else changed the selection. Reload it, then record the pick again.'; end if;
  st := jsonb_set(st, '{selection}', (p_value - 'version') || jsonb_build_object('version', cur + 1, 'by', auth.uid(), 'at', now()));
 elsif p_section = 'matches' then
  if p_value is null or jsonb_typeof(p_value) <> 'object' or jsonb_typeof(coalesce(p_value->'matches','null')) <> 'array' then raise exception using errcode='22023',message='Results are an object with a list of matches.'; end if;
  st := jsonb_set(st, '{matches}', p_value || jsonb_build_object('saved_by', auth.uid(), 'saved_at', now()));
 else
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception using errcode='22023',message='Settings are an object.'; end if;
  if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('event_key','our_team','rounds','alliances','want_defense')) then raise exception using errcode='22023',message='Unknown pick board setting.'; end if;
  if p_value ? 'rounds' and (jsonb_typeof(p_value->'rounds') <> 'number' or (p_value->>'rounds')::numeric not between 1 and 4) then raise exception using errcode='22023',message='Rounds are 1 to 4.'; end if;
  if p_value ? 'alliances' and (jsonb_typeof(p_value->'alliances') <> 'number' or (p_value->>'alliances')::numeric not between 2 and 16) then raise exception using errcode='22023',message='Alliances are 2 to 16.'; end if;
  st := jsonb_set(st, '{settings}', coalesce(st->'settings','{}'::jsonb) || p_value);
 end if;

 update public.scouting_pick_board set state = st, version = r.version + 1, updated_at = now() where event_id = p_event returning * into r;
 return jsonb_build_object('event_id', r.event_id, 'state', r.state, 'version', r.version, 'updated_at', r.updated_at);
end
$fn$;

revoke all on function public.scouting_pick_board_get(uuid), public.scouting_pick_board_save(uuid,text,jsonb,integer,integer) from public, anon;
grant execute on function public.scouting_pick_board_get(uuid), public.scouting_pick_board_save(uuid,text,jsonb,integer,integer) to authenticated, service_role;
