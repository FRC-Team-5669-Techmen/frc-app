-- FRC operations, after 0050. Additive, re-runnable, delivered by migrate.yml.
-- Named parent service records are staff verified actual intervals, never
-- inferred from adult RSVP counts. School ID is a private staff-entered value.
create table if not exists public.parent_service_people (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.hub_events(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 school_id text not null check(length(trim(school_id)) between 1 and 60),
 name text not null check(length(trim(name)) between 1 and 120)
);
create index if not exists parent_service_people_event on public.parent_service_people(event_id);
create table if not exists public.parent_service_sessions (
 id uuid primary key default gen_random_uuid(),
 guardian_id uuid not null references public.parent_service_people(id) on delete cascade,
 starts_at timestamptz not null, ends_at timestamptz not null,
 check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours')
);
create index if not exists parent_service_sessions_parent on public.parent_service_sessions(guardian_id);
alter table public.parent_service_people enable row level security;
alter table public.parent_service_sessions enable row level security;
revoke all on public.parent_service_people,public.parent_service_sessions from public,anon,authenticated,service_role;

create or replace function public.staff_parent_service(p_event uuid)
returns jsonb language plpgsql security definer set search_path=public
as $fn$
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode='42501'; end if;
 if not exists(select 1 from public.hub_events where id=p_event) then raise exception 'Event not found' using errcode='22023'; end if;
 return jsonb_build_object('students',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',public._hub_student_name(p.id)) order by public._hub_student_name(p.id)),'[]') from public.profiles p where exists(select 1 from public.member_roles mr where mr.member_id=p.id and mr.role='student')),
 'parents',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'student_id',p.student_id,'student',public._hub_student_name(p.student_id),'school_id',p.school_id,
 'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by s.starts_at),'[]') from public.parent_service_sessions s where s.guardian_id=p.id)) order by p.name,p.id),'[]') from public.parent_service_people p where p.event_id=p_event));
end $fn$;

create or replace function public.staff_save_parent_service(p_event uuid,p_parent uuid,p_student uuid,p_school_id text,p_name text,p_start timestamptz,p_end timestamptz,p_session uuid default null,p_delete boolean default false)
returns uuid language plpgsql security definer set search_path=public
as $fn$
declare par uuid; sid uuid; ev public.hub_events; first_at timestamptz; last_at timestamptz;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode='42501'; end if;
 select * into ev from public.hub_events where id=p_event;
 if not found then raise exception 'Event not found' using errcode='22023'; end if;
 if p_parent is null then
   if p_delete then raise exception 'Choose a parent record' using errcode='22023'; end if;
   if not exists(select 1 from public.member_roles mr where mr.member_id=p_student and mr.role='student') then raise exception 'Choose a student' using errcode='22023'; end if;
   insert into public.parent_service_people(event_id,student_id,school_id,name) values(p_event,p_student,trim(p_school_id),trim(p_name)) returning id into par;
 else
   select id into par from public.parent_service_people where id=p_parent and event_id=p_event for update;
   if par is null then raise exception 'Parent is not on this event' using errcode='22023'; end if;
 end if;
 if p_delete then
   delete from public.parent_service_sessions where id=p_session and guardian_id=par returning id into sid;
   if sid is null then raise exception 'Session not found on this parent' using errcode='22023'; end if;
   return sid;
 end if;
 select min(day_date)::timestamp at time zone ev.timezone into first_at from public.hub_days where event_id=p_event;
 last_at:=public._hub_event_end(p_event);
 if first_at is null or last_at is null or p_start is null or p_end is null or p_start<first_at or p_end>last_at or p_end<=p_start or p_end>p_start+interval '24 hours' then
   raise exception 'Use actual service times within this event, up to 24 hours per entry' using errcode='22023'; end if;
 if exists(select 1 from public.parent_service_sessions where guardian_id=par and id is distinct from p_session and starts_at<p_end and ends_at>p_start) then
   raise exception 'This overlaps another entry for this parent' using errcode='22023'; end if;
 if p_session is null then
   insert into public.parent_service_sessions(guardian_id,starts_at,ends_at) values(par,p_start,p_end) returning id into sid;
 else
   update public.parent_service_sessions set starts_at=p_start,ends_at=p_end where id=p_session and guardian_id=par returning id into sid;
   if sid is null then raise exception 'Session not found on this parent' using errcode='22023'; end if;
 end if;
 return sid;
end $fn$;
revoke all on function public.staff_parent_service(uuid) from public,anon,authenticated,service_role;
revoke all on function public.staff_save_parent_service(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.staff_parent_service(uuid) to authenticated;
grant execute on function public.staff_save_parent_service(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid,boolean) to authenticated;

-- Competition venue configuration and event-scoped exemptions. Validity is
-- evaluated at server time against BOTH the stored expiry and current event end.
create table if not exists public.event_checkin_venues (
 event_id uuid primary key references public.events(id) on delete cascade,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 enabled boolean not null default true
);
create table if not exists public.event_geo_exemptions (
 event_id uuid not null references public.events(id) on delete cascade,
 member_id uuid not null references public.profiles(id) on delete cascade,
 expires_at timestamptz not null,
 primary key(event_id,member_id)
);
alter table public.event_checkin_venues enable row level security;
alter table public.event_geo_exemptions enable row level security;
revoke all on public.event_checkin_venues,public.event_geo_exemptions from public,anon,authenticated,service_role;

create or replace function public.staff_event_checkin(p_event uuid)
returns jsonb language plpgsql security definer set search_path=public
as $fn$
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode='42501'; end if;
 return jsonb_build_object('venue',(select to_jsonb(v) from public.event_checkin_venues v where event_id=p_event),
 'exemptions',(select coalesce(jsonb_agg(jsonb_build_object('member_id',x.member_id,'name',public._member_name(x.member_id),'expires_at',least(x.expires_at,e.ends_at),'active',now()>=e.starts_at and now()<least(x.expires_at,e.ends_at))),'[]') from public.event_geo_exemptions x join public.events e on e.id=x.event_id where x.event_id=p_event));
end $fn$;
create or replace function public.staff_save_event_venue(p_event uuid,p_lat double precision,p_lon double precision,p_enabled boolean)
returns void language plpgsql security definer set search_path=public
as $fn$
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode='42501'; end if;
 if not exists(select 1 from public.events where id=p_event and kind='competition') then raise exception 'Choose a competition' using errcode='22023'; end if;
 insert into public.event_checkin_venues values(p_event,p_lat,p_lon,p_enabled) on conflict(event_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,enabled=excluded.enabled;
end $fn$;
create or replace function public.staff_set_event_geo_exempt(p_event uuid,p_member uuid,p_exempt boolean)
returns void language plpgsql security definer set search_path=public
as $fn$
declare ending timestamptz;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff only' using errcode='42501'; end if;
 select ends_at into ending from public.events where id=p_event and kind='competition' and ends_at>now();
 if ending is null then raise exception 'Choose an event that has not ended' using errcode='22023'; end if;
 if p_exempt then
   insert into public.event_geo_exemptions values(p_event,p_member,ending) on conflict(event_id,member_id) do update set expires_at=excluded.expires_at;
 else delete from public.event_geo_exemptions where event_id=p_event and member_id=p_member; end if;
end $fn$;
create or replace function public.my_event_checkin_venues()
returns jsonb language plpgsql security definer set search_path=public
as $fn$
begin
 if not public._role_board_member_ok() then raise exception 'Approved membership required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'ends_at',e.ends_at,'latitude',v.latitude,'longitude',v.longitude,
 'exempt',exists(select 1 from public.event_geo_exemptions x where x.event_id=e.id and x.member_id=auth.uid() and x.expires_at>now())) order by e.starts_at,e.id),'[]')
 from public.events e join public.event_checkin_venues v on v.event_id=e.id where v.enabled and e.kind='competition' and e.starts_at<=now() and e.ends_at>now());
end $fn$;
create or replace function public.event_venue_checkin(p_event uuid,p_lat double precision,p_lon double precision,p_accuracy double precision)
returns uuid language plpgsql security definer set search_path=public
as $fn$
declare v public.event_checkin_venues; ending timestamptz; exempt boolean; distance_m double precision; result uuid;
begin
 if not public._role_board_member_ok() then raise exception 'Approved membership required' using errcode='42501'; end if;
 select e.ends_at into ending from public.events e where e.id=p_event and e.kind='competition' and e.starts_at<=now() and e.ends_at>now();
 select * into v from public.event_checkin_venues where event_id=p_event and enabled;
 if ending is null or v.event_id is null then raise exception 'Event check-in is not active' using errcode='22023'; end if;
 exempt:=exists(select 1 from public.event_geo_exemptions x where x.event_id=p_event and x.member_id=auth.uid() and now()<least(x.expires_at,ending));
 if not exempt then
   if p_lat is null or p_lon is null or p_accuracy is null or not (p_lat between -90 and 90) or not (p_lon between -180 and 180) or not (p_accuracy between 0 and 100) then raise exception 'Precise location required' using errcode='22023'; end if;
   distance_m:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(p_lat-v.latitude)/2),2)+cos(radians(p_lat))*cos(radians(v.latitude))*power(sin(radians(p_lon-v.longitude)/2),2))));
   if distance_m>150 then raise exception 'You are outside the event venue' using errcode='42501'; end if;
 end if;
 -- The existing self-attendance trigger still serializes and refuses open sessions.
 insert into public.attendance_events(user_id,type,location,method,category,geo_ok,event_time)
 values(auth.uid(),'in','event:'||p_event,'nfc','competition',not exempt,now()) returning id into result;
 return result;
end $fn$;
revoke all on function public.staff_event_checkin(uuid),public.staff_save_event_venue(uuid,double precision,double precision,boolean),public.staff_set_event_geo_exempt(uuid,uuid,boolean),public.my_event_checkin_venues(),public.event_venue_checkin(uuid,double precision,double precision,double precision) from public,anon,authenticated,service_role;
grant execute on function public.staff_event_checkin(uuid),public.staff_save_event_venue(uuid,double precision,double precision,boolean),public.staff_set_event_geo_exempt(uuid,uuid,boolean),public.my_event_checkin_venues(),public.event_venue_checkin(uuid,double precision,double precision,double precision) to authenticated;

-- Decision 54 built advisory option. No designation is inferred or seeded.
create table if not exists public.role_rotation_members (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 strong boolean not null default false,
 newer boolean not null default false
);
alter table public.role_rotation_members enable row level security;
revoke all on public.role_rotation_members from public,anon,authenticated,service_role;
create or replace function public._ops_mentor()
returns boolean language sql stable security definer set search_path=public
as $fn$
 select auth.uid() is not null and (public.has_role('mentor') or public.is_admin())
 and exists(select 1 from public.profiles where id=auth.uid() and approved and status in ('active','folded'));
$fn$;
revoke all on function public._ops_mentor() from public,anon,authenticated,service_role;
create or replace function public.mentor_set_rotation_member(p_member uuid,p_strong boolean,p_newer boolean)
returns void language plpgsql security definer set search_path=public
as $fn$
begin
 if not public._ops_mentor() then raise exception 'Mentors only' using errcode='42501'; end if;
 if not exists(select 1 from public.member_roles where member_id=p_member and role='student') then raise exception 'Choose a student' using errcode='22023'; end if;
 insert into public.role_rotation_members values(p_member,p_strong,p_newer) on conflict(member_id) do update set strong=excluded.strong,newer=excluded.newer;
end $fn$;
create or replace function public.mentor_rotation_data()
returns jsonb language plpgsql security definer set search_path=public
as $fn$
declare season public.seasons;
begin
 if not public._ops_mentor() then raise exception 'Mentors only' using errcode='42501'; end if;
 select * into season from public.seasons where start_date<=public._la_date(now()) and end_date>=public._la_date(now()) order by start_date desc limit 1;
 return jsonb_build_object('season',to_jsonb(season),'members',(
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',public._member_name(p.id),'strong',coalesce(d.strong,false),'newer',coalesce(d.newer,false),
 'attendance',(select coalesce(jsonb_agg(to_jsonb(a) order by a.event_time,a.id),'[]') from public.attendance_events a where a.user_id=p.id and a.event_time>=((season.start_date-1)::timestamp at time zone 'America/Los_Angeles') and a.event_time<now()),
 'verified_outs',(select coalesce(jsonb_agg(s.out_event_id),'[]') from public.signout_requests s where s.member_id=p.id and s.status='approved' and s.out_event_id is not null),
 'reviews',(select coalesce(jsonb_agg(jsonb_build_object('checkout_id',r.checkout_id,'status',r.status)),'[]') from public.session_reviews r where r.user_id=p.id),
 'logs',(select coalesce(jsonb_agg(jsonb_build_object('type',l.type,'hours',l.hours,'date',l.date)),'[]') from public.logged_hours l where l.member_id=p.id and l.status='verified' and l.date between season.start_date and season.end_date)) order by p.id),'[]')
 from public.profiles p left join public.role_rotation_members d on d.member_id=p.id where p.approved and p.status='active'
 and exists(select 1 from public.member_roles r where r.member_id=p.id and r.role='student')
 and not exists(select 1 from public.member_roles r where r.member_id=p.id and r.role in ('mentor','admin'))));
end $fn$;
revoke all on function public.mentor_set_rotation_member(uuid,boolean,boolean),public.mentor_rotation_data() from public,anon,authenticated,service_role;
grant execute on function public.mentor_set_rotation_member(uuid,boolean,boolean),public.mentor_rotation_data() to authenticated;

-- Replace the complete 0050 merge catalog with these three member references.
-- Full declaration is required by the static and SQL catalog-coverage gates.
create or replace function public._merge_member_rules()
returns table (tbl text, col text, rule text) language sql immutable set search_path = public as $fn$
  select x.tbl, x.col, x.rule from (values
    ('profiles', 'id', 'profile'),
    ('parent_service_people', 'student_id', 'move'),
    ('event_geo_exemptions', 'member_id', 'move'),
    ('role_rotation_members', 'member_id', 'move'),
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
revoke all on function public._merge_member_rules() from public,anon,authenticated,service_role;
