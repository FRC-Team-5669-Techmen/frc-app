-- ============================================================
-- 0006_beach_blitz_seed -- Beach Blitz 2026 (Oct 30 to Nov 1) as DATA in the
-- event family hub (0005). Nothing in src/ names this event; the next
-- offsite event is entered the same way, or from the mentor page.
--
-- APPLY: by hand, once, in the Supabase SQL editor, AFTER 0005. Idempotent:
-- every row has a fixed id and is inserted "on conflict do nothing", so a
-- second paste changes nothing -- and, deliberately, it never overwrites a
-- field a mentor has since edited on the mentor page. It creates NO invites
-- and sends NOTHING: invites go out when a mentor presses "Send invites".
-- It posts nothing to the team calendar or Discord either (the hub does not
-- hang off public.events; see 0005's header).
--
-- REVIEW BEFORE SENDING (the mentor page flags these):
--   * the food needs are STARTER values (starter = true), guesses to adjust;
--   * the meet captains are blank: mentors fill them;
--   * the team list, school permission form, medication form and the parent
--     GroupMe links are blank until they exist;
--   * "Driver paperwork required" is OFF while Mr. Pina confirms school policy
--     (handbook 12.3.2 says the location keeps a copy of each driver's license
--     and insurance on file); the one-minor rule is ON;
--   * the What to bring list is a starter list.
--
-- SOURCES: beachblitz.org (the site, the preliminary agenda PDF, the
-- Halloween PDF, the rules and awards pages, the store, the volunteer page)
-- and Google Maps typical traffic, measured 2026-10-03 from Bosco Tech.
-- All times are America/Los_Angeles. Clocks fall back at 2:00 AM on Sunday,
-- Nov 1, so Sunday's times below are Pacific STANDARD time -- the literals
-- carry the zone name, and Postgres applies the change.
--
-- WHAT UNDOES IT:
--   delete from public.hub_events where id = 'b1b12026-0000-4000-8000-000000000001';
-- (every day, meal, need, invite and answer of this event cascades with it).
-- ============================================================

do $needs0005$
begin
  if to_regclass('public.hub_events') is null then
    raise exception 'Cannot apply 0006: apply 0005_event_family_hub.sql first';
  end if;
end
$needs0005$;

insert into public.hub_events (
  id, title, venue_name, venue_address, map_url, timezone,
  phase1_due_at, lockin_opens_at, lockin_due_at,
  one_minor_rule, driver_paperwork_required, links, info)
values (
  'b1b12026-0000-4000-8000-000000000001',
  'Beach Blitz 2026',
  'Capistrano Valley High School',
  '26301 Via Escolar, Mission Viejo, CA 92692',
  'https://www.google.com/maps/search/?api=1&query=26301+Via+Escolar%2C+Mission+Viejo%2C+CA+92692',
  'America/Los_Angeles',
  '2026-10-23 23:59 America/Los_Angeles',
  '2026-10-24 00:00 America/Los_Angeles',
  '2026-10-28 23:59 America/Los_Angeles',
  true,
  false,
  jsonb_build_object(
    'site',               'https://beachblitz.org/',
    'agenda',             'https://beachblitz.org/event/2026/Preliminary%20Agenda.pdf',
    'halloween',          'https://beachblitz.org/event/2026/Halloween.pdf',
    'rules',              'https://beachblitz.org/rules2026.html',
    'awards',             'https://beachblitz.org/awards2026.html',
    'shirt',              'https://square.link/u/7wU2YWTo?cs=true&cst=custom',
    'store',              'https://beachblitz.square.site/',
    'volunteer',          'https://beachblitz.org/volunteer/index.html',
    'stream',             'https://twitch.tv/ocfirst',
    'hotel',              'https://group.hamptoninn.com/lj95ci',
    'first_registration', 'https://www.firstinspires.org/programs/youth-registration',
    'team_list',          '',
    'school_form',        '',
    'medication_form',    '',
    'parent_channel',     ''),
  jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('key', 'where', 'title', 'Where', 'lines', jsonb_build_array(
      'Capistrano Valley High School',
      '26301 Via Escolar, Mission Viejo, CA 92692',
      'Map | https://www.google.com/maps/search/?api=1&query=26301+Via+Escolar%2C+Mission+Viejo%2C+CA+92692')),
    jsonb_build_object('key', 'drive', 'title', 'Drive from Bosco Tech', 'lines', jsonb_build_array(
      'To the venue | I-5 S, 48.1 mi',
      'Fri, arrive 5:00 PM | 1 hr to 1 hr 50 min',
      'Sat, arrive 7:00 AM | 45 min to 1 hr',
      'Sun, arrive 7:00 AM | 45 to 55 min',
      'Home | I-5 N, 50.8 mi',
      'Fri, leave 9:00 PM | 50 min to 1 hr 5 min',
      'Fri, leave 10:30 PM | 50 min to 1 hr 5 min',
      'Sat, leave 6:15 PM | 50 min to 1 hr 10 min',
      'Sun, leave 5:30 PM | 50 min to 1 hr 5 min',
      'Google Maps typical traffic, measured Oct 3.')),
    jsonb_build_object('key', 'agenda_fri', 'title', 'Friday, Oct 30', 'lines', jsonb_build_array(
      '5:00 to 9:00 PM | Food trucks',
      '5:00 to 7:45 PM | Load in and set up pits',
      '6:00 to 6:30 PM | Calibration and measurement',
      '6:30 to 8:30 PM | Practice matches',
      '9:00 PM | Pits close',
      '9:00 to 10:30 PM | Halloween movie',
      '10:30 PM | Venue closes',
      'The Halloween sheet lists the movie at 8:45 to 10:00 PM; the agenda says 9:00 to 10:30 PM.')),
    jsonb_build_object('key', 'agenda_sat', 'title', 'Saturday, Oct 31', 'lines', jsonb_build_array(
      '7:00 AM to 3:00 PM | Food trucks',
      '7:45 to 8:00 AM | Load in (prior permission only)',
      '8:00 AM | Venue opens',
      '8:00 to 9:00 AM | Calibration and measurement',
      '9:00 to 9:20 AM | Drivers'' meeting',
      '9:20 to 9:35 AM | Opening ceremonies',
      '9:35 AM to 12:00 PM | Qualification matches',
      '12:00 to 1:00 PM | Lunch',
      '1:00 to 6:00 PM | Qualification matches',
      '6:15 PM | Venue closes')),
    jsonb_build_object('key', 'agenda_sun', 'title', 'Sunday, Nov 1', 'lines', jsonb_build_array(
      '8:00 AM | Venue opens',
      '8:20 to 8:30 AM | Opening ceremonies',
      '8:30 to 11:15 AM | Qualification matches',
      'About 11:25 AM to 12:00 PM | Alliance selection',
      '12:00 to 1:00 PM | Lunch',
      '1:00 to 5:15 PM | Playoffs and closing ceremonies',
      '5:30 PM | Venue closes',
      'Official agenda | link:agenda')),
    jsonb_build_object('key', 'clocks', 'title', 'Clocks fall back', 'lines', jsonb_build_array(
      'Clocks fall back at 2:00 AM on Sunday, Nov 1.',
      'Sunday''s 5:45 AM meet is on the new time.')),
    jsonb_build_object('key', 'halloween', 'title', 'Halloween movie and costumes', 'lines', jsonb_build_array(
      'Safety glasses in the pits and field areas.',
      'Closed-toe, closed-heel shoes.',
      'Nothing loose or dangling.',
      'No full-face masks or heavy face paint.',
      'No prop weapons.',
      'Adults stay for the movie, and students are picked up when it ends.',
      'Official sheet | link:halloween')),
    jsonb_build_object('key', 'trucks', 'title', 'Food trucks', 'lines', jsonb_build_array(
      'Friday | 5:00 to 9:00 PM',
      'Saturday | 7:00 AM to 3:00 PM',
      'Sunday | Hours not posted yet',
      'Kabobaholic | https://thekabobaholic.com/',
      'Messi Burger | https://www.messiburgers.org/food-truck-menu',
      'The Empanada Maker | https://www.theempanadamaker.com/',
      'Dezzertaholic | https://dezzertaholic.com/menu/')),
    jsonb_build_object('key', 'teams', 'title', 'Teams', 'lines', jsonb_build_array(
      'Team list | link:team_list')),
    jsonb_build_object('key', 'watch', 'title', 'Watch from home', 'lines', jsonb_build_array(
      'Live stream on Twitch | link:stream')),
    jsonb_build_object('key', 'volunteer', 'title', 'Volunteer', 'lines', jsonb_build_array(
      'Volunteer registration | link:volunteer')),
    jsonb_build_object('key', 'store', 'title', 'Shirts and merch', 'lines', jsonb_build_array(
      'Event shirt, $25 | link:shirt',
      'Event store | link:store')),
    jsonb_build_object('key', 'rules', 'title', 'Rules and awards', 'lines', jsonb_build_array(
      'Rule changes | link:rules',
      'Judged awards | link:awards')),
    jsonb_build_object('key', 'hotel', 'title', 'Hotel', 'lines', jsonb_build_array(
      'Hampton Inn & Suites Mission Viejo',
      '$162 a night, two queens, breakfast and parking included',
      '0.6 mi from the venue',
      'Group rate | link:hotel',
      'Families book and share lodging on their own. Students stay with their own family.')),
    jsonb_build_object('key', 'bring', 'title', 'What to bring', 'lines', jsonb_build_array(
      'Safety glasses',
      'Closed-toe, closed-heel shoes',
      'Team shirt',
      'A refillable water bottle',
      'A jacket for the early mornings',
      'Money for the food trucks',
      'Any medication your student needs')),
    jsonb_build_object('key', 'parent_channel', 'title', 'Parent chat', 'if_link', 'parent_channel', 'lines', jsonb_build_array(
      'GroupMe | link:parent_channel')),
    jsonb_build_object('key', 'links', 'title', 'Beach Blitz links', 'lines', jsonb_build_array(
      'Beach Blitz site | link:site',
      'Preliminary agenda | link:agenda',
      'Halloween sheet | link:halloween',
      'FIRST registration | link:first_registration'))
  ))
)
on conflict do nothing;

-- position is the order of the sign-up form's Days step: Saturday, Sunday,
-- then Friday, whose short card comes before its question. The boards always
-- run in date order (Fri / Sat / Sun).
insert into public.hub_days (
  id, event_id, day_date, position, title, intro, meet_at, meet_place, last_car_out_at,
  target_arrival_at, doors_at, venue_opens_at, venue_closes_at, pits_close_at,
  drive_to_range, drive_home_range, miles_to, miles_home,
  ask_pit_setup, ask_school_ride, home_options, notes)
values
  ('b1b12026-0000-4000-8000-000000000011', 'b1b12026-0000-4000-8000-000000000001', '2026-10-30', 3,
   'Load-in and practice',
   E'Evening session after school: load-in, pit setup and practice matches, 5:00 to 9:00 PM.\nOpen to everyone.\nCars leave Bosco Tech right after school, because the Friday drive takes up to 1 hr 50 min.',
   '2026-10-30 15:15 America/Los_Angeles', 'Bosco Tech front parking lot', null,
   '2026-10-30 17:00 America/Los_Angeles', null,
   '2026-10-30 17:00 America/Los_Angeles', '2026-10-30 22:30 America/Los_Angeles',
   '2026-10-30 21:00 America/Los_Angeles',
   '1 hr to 1 hr 50 min', '50 min to 1 hr 5 min', 48.1, 50.8,
   true, false,
   '[{"key": "pits", "label": "Leave at 9:00 PM when pits close", "default": true},
     {"key": "movie", "label": "Stay for the Halloween movie, home about 11:35 PM"}]'::jsonb,
   'Default ride home leaves at 9:00 PM.'),
  ('b1b12026-0000-4000-8000-000000000012', 'b1b12026-0000-4000-8000-000000000001', '2026-10-31', 1,
   'Qualifications', null,
   '2026-10-31 05:45 America/Los_Angeles', 'Bosco Tech front parking lot', '2026-10-31 06:00 America/Los_Angeles',
   '2026-10-31 07:00 America/Los_Angeles', '2026-10-31 08:00 America/Los_Angeles',
   '2026-10-31 08:00 America/Los_Angeles', '2026-10-31 18:15 America/Los_Angeles', null,
   '45 min to 1 hr', '50 min to 1 hr 10 min', 48.1, 50.8,
   false, true, '[]'::jsonb, null),
  ('b1b12026-0000-4000-8000-000000000013', 'b1b12026-0000-4000-8000-000000000001', '2026-11-01', 2,
   'Alliance selection and playoffs', null,
   '2026-11-01 05:45 America/Los_Angeles', 'Bosco Tech front parking lot', '2026-11-01 06:00 America/Los_Angeles',
   '2026-11-01 07:00 America/Los_Angeles', '2026-11-01 08:00 America/Los_Angeles',
   '2026-11-01 08:00 America/Los_Angeles', '2026-11-01 17:30 America/Los_Angeles', null,
   '45 to 55 min', '50 min to 1 hr 5 min', 48.1, 50.8,
   false, true, '[]'::jsonb,
   'Clocks fall back at 2:00 AM. The 5:45 AM meet is on the new time.')
on conflict do nothing;

insert into public.hub_meals (id, event_id, day_id, label, starts_at, truck_note, position)
values
  ('b1b12026-0000-4000-8000-000000000021', 'b1b12026-0000-4000-8000-000000000001', 'b1b12026-0000-4000-8000-000000000011',
   'Fri dinner', '2026-10-30 18:30 America/Los_Angeles',
   'Food trucks 5:00 to 9:00 PM: Kabobaholic, Messi Burger, The Empanada Maker, Dezzertaholic.', 1),
  ('b1b12026-0000-4000-8000-000000000022', 'b1b12026-0000-4000-8000-000000000001', 'b1b12026-0000-4000-8000-000000000012',
   'Sat breakfast', '2026-10-31 07:00 America/Los_Angeles',
   'Food trucks 7:00 AM to 3:00 PM.', 2),
  ('b1b12026-0000-4000-8000-000000000023', 'b1b12026-0000-4000-8000-000000000001', 'b1b12026-0000-4000-8000-000000000012',
   'Sat lunch', '2026-10-31 12:00 America/Los_Angeles',
   'Food trucks 7:00 AM to 3:00 PM: Kabobaholic, Messi Burger, The Empanada Maker, Dezzertaholic.', 3),
  ('b1b12026-0000-4000-8000-000000000024', 'b1b12026-0000-4000-8000-000000000001', 'b1b12026-0000-4000-8000-000000000013',
   'Sun breakfast', '2026-11-01 07:00 America/Los_Angeles',
   'Sunday food truck hours are not posted yet.', 4),
  ('b1b12026-0000-4000-8000-000000000025', 'b1b12026-0000-4000-8000-000000000001', 'b1b12026-0000-4000-8000-000000000013',
   'Sun lunch', '2026-11-01 12:00 America/Los_Angeles',
   'Sunday food truck hours are not posted yet.', 5)
on conflict do nothing;

-- Starter needs: flagged on the mentor page as "starter, review before sending".
insert into public.hub_food_needs (id, meal_id, label, quantity, starter, position)
values
  -- Fri dinner
  ('b1b12026-0000-4000-8000-000000000031', 'b1b12026-0000-4000-8000-000000000021', 'Main dish', 2, true, 1),
  ('b1b12026-0000-4000-8000-000000000032', 'b1b12026-0000-4000-8000-000000000021', 'Water case', 1, true, 2),
  ('b1b12026-0000-4000-8000-000000000033', 'b1b12026-0000-4000-8000-000000000021', 'Plates, napkins, cups and utensils', 1, true, 3),
  -- Sat breakfast
  ('b1b12026-0000-4000-8000-000000000041', 'b1b12026-0000-4000-8000-000000000022', 'Breakfast main', 2, true, 1),
  ('b1b12026-0000-4000-8000-000000000042', 'b1b12026-0000-4000-8000-000000000022', 'Juice or water', 1, true, 2),
  ('b1b12026-0000-4000-8000-000000000043', 'b1b12026-0000-4000-8000-000000000022', 'Plates, napkins and cups', 1, true, 3),
  -- Sat lunch
  ('b1b12026-0000-4000-8000-000000000051', 'b1b12026-0000-4000-8000-000000000023', 'Main dish', 3, true, 1),
  ('b1b12026-0000-4000-8000-000000000052', 'b1b12026-0000-4000-8000-000000000023', 'Water case', 2, true, 2),
  ('b1b12026-0000-4000-8000-000000000053', 'b1b12026-0000-4000-8000-000000000023', 'Snacks', 2, true, 3),
  ('b1b12026-0000-4000-8000-000000000054', 'b1b12026-0000-4000-8000-000000000023', 'Plates, napkins, cups and utensils', 1, true, 4),
  -- Sun breakfast
  ('b1b12026-0000-4000-8000-000000000061', 'b1b12026-0000-4000-8000-000000000024', 'Breakfast main', 2, true, 1),
  ('b1b12026-0000-4000-8000-000000000062', 'b1b12026-0000-4000-8000-000000000024', 'Juice or water', 1, true, 2),
  ('b1b12026-0000-4000-8000-000000000063', 'b1b12026-0000-4000-8000-000000000024', 'Plates, napkins and cups', 1, true, 3),
  -- Sun lunch
  ('b1b12026-0000-4000-8000-000000000071', 'b1b12026-0000-4000-8000-000000000025', 'Main dish', 3, true, 1),
  ('b1b12026-0000-4000-8000-000000000072', 'b1b12026-0000-4000-8000-000000000025', 'Water case', 2, true, 2),
  ('b1b12026-0000-4000-8000-000000000073', 'b1b12026-0000-4000-8000-000000000025', 'Snacks', 2, true, 3),
  ('b1b12026-0000-4000-8000-000000000074', 'b1b12026-0000-4000-8000-000000000025', 'Plates, napkins, cups and utensils', 1, true, 4)
on conflict do nothing;

-- What landed. Read it in the result grid: one row per kind, with counts.
select 'event' as what, count(*) as rows from public.hub_events where id = 'b1b12026-0000-4000-8000-000000000001'
union all select 'days', count(*) from public.hub_days where event_id = 'b1b12026-0000-4000-8000-000000000001'
union all select 'meals', count(*) from public.hub_meals where event_id = 'b1b12026-0000-4000-8000-000000000001'
union all select 'food needs (starter)', count(*) from public.hub_food_needs n
            join public.hub_meals m on m.id = n.meal_id
           where m.event_id = 'b1b12026-0000-4000-8000-000000000001';
