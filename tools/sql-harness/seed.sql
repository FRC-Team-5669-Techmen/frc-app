-- Fictional members for the SQL harness (tools/sql-harness/). Never pasted
-- anywhere real. The ids are the fixture personas' (src/dev/fixture/personas.js)
-- so a row a fixture seeds and a row an SQL test picks name the same person:
--   a1 admin (Ada), b1 mentor (Max), c1/c2/c3 students (Sam, Riley, Casey),
--   c4 a fourth student, d1 a parent (Pat, linked to Sam), e1 unapproved (Una).
-- Students c2, c3 and c4 have an application for a season spanning today, so
-- the current-season roster resolves exactly as src/seasons.js would; c1 has
-- none (see the note at the end).

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin.test@boscotech.edu'),
  ('00000000-0000-0000-0000-0000000000b1', 'mentor.test@boscotech.edu'),
  ('00000000-0000-0000-0000-0000000000c1', 'student.one@boscotech.edu'),
  ('00000000-0000-0000-0000-0000000000c2', 'student.two@boscotech.edu'),
  ('00000000-0000-0000-0000-0000000000c3', 'student.exempt@boscotech.edu'),
  ('00000000-0000-0000-0000-0000000000c4', 'student.four@boscotech.edu'),
  ('00000000-0000-0000-0000-0000000000d1', 'parent.test@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'pending.test@example.com')
on conflict (id) do nothing;

-- handle_new_user() made the profile rows; fill them in.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
update public.profiles p set full_name = v.name, approved = v.approved
  from (values
    ('00000000-0000-0000-0000-0000000000a1'::uuid, 'Ada Admin', true),
    ('00000000-0000-0000-0000-0000000000b1'::uuid, 'Max Mentor', true),
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 'Sam Student', true),
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 'Riley Student', true),
    ('00000000-0000-0000-0000-0000000000c3'::uuid, 'Casey Exempt', true),
    ('00000000-0000-0000-0000-0000000000c4'::uuid, 'Jordan Fourth', true),
    ('00000000-0000-0000-0000-0000000000d1'::uuid, 'Pat Parent', true),
    ('00000000-0000-0000-0000-0000000000e1'::uuid, 'Una Unapproved', false)
  ) as v(id, name, approved)
 where p.id = v.id;

delete from public.member_roles where member_id in (select id from auth.users);
insert into public.member_roles (member_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'mentor'),
  ('00000000-0000-0000-0000-0000000000c1', 'student'),
  ('00000000-0000-0000-0000-0000000000c2', 'student'),
  ('00000000-0000-0000-0000-0000000000c3', 'student'),
  ('00000000-0000-0000-0000-0000000000c4', 'student'),
  ('00000000-0000-0000-0000-0000000000d1', 'parent')
on conflict do nothing;

insert into public.guardian_links (parent_id, student_id)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1')
on conflict do nothing;

insert into public.seasons (id, name, start_date, end_date)
values ('00000000-0000-4000-8000-00000000a001', 'Harness season',
        current_date - 60, current_date + 120)
on conflict (id) do nothing;
-- A later season too. member_applications_rls_test.sql inserts its own two
-- applications into the season with the LATEST start date, which would
-- collide with the rows below if the current season were also the latest.
insert into public.seasons (id, name, start_date, end_date)
values ('00000000-0000-4000-8000-00000000a002', 'Harness next season',
        current_date + 121, current_date + 300)
on conflict (id) do nothing;

insert into public.member_applications (
  member_id, season_id, legal_first_name, legal_last_name, student_phone, pathway,
  returning_member, subteam_first, subteam_second, subteam_rationale,
  monday_lunch, tuesday_after_school, friday_after_school, transport_after_5pm,
  build_season_acknowledged, parent_name, parent_email, parent_phone,
  parent_two_name, parent_two_contact,
  emergency_contact_name, emergency_contact_phone, discord_username, conduct_acknowledged)
select v.member_id, '00000000-0000-4000-8000-00000000a001', v.first, v.last, '5555550100', 'MSET',
       true, 'Mechanical', 'Programming', 'Harness fixture.',
       'Yes', 'Yes', 'Sometimes', 'Parent pickup',
       true, v.pname, v.pemail, '5555550199',
       v.p2name, v.p2contact,
       'Harness Guardian', '5555550188', v.discord, true
  from (values
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 'Riley', 'Student', 'Robin Student', 'robin.family@example.com', null, null, 'riley_5669'),
    ('00000000-0000-0000-0000-0000000000c3'::uuid, 'Casey', 'Exempt', 'Morgan Exempt', 'morgan.family@example.com', null, '5555550123', 'casey_5669'),
    ('00000000-0000-0000-0000-0000000000c4'::uuid, 'Jordan', 'Fourth', 'Pat Parent', 'parent.test@example.com', 'Lee Fourth', 'Lee.Fourth@Example.com', 'jordan_5669')
  ) as v(member_id, first, last, pname, pemail, p2name, p2contact, discord)
on conflict (member_id, season_id) do nothing;
-- c1 (Sam) deliberately has NO application this season, for two reasons:
--   * the roster then has a student with no parent email on file, which the
--     event hub's mentor page must list by name;
--   * member_applications_rls_test.sql picks the lowest-id non-staff member as
--     its "member A" and requires A to see exactly ONE application, so it
--     fails against any database where that member has already applied. That
--     is a fragility in that frozen test (recorded in
--     docs/history/brave-noether-tyn6cb.md), not something the harness fixes.
