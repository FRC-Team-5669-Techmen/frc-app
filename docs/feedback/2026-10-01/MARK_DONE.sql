-- ============================================================================
-- docs/feedback/2026-10-01/MARK_DONE.sql
-- Closes the six reports of the 2026-10-01 round (TRIAGE.md, R1 to R6).
--
-- WHAT IT DOES
--   Five reports move to 'done': R1, R2, R3, R4 and R6. Their fixes are on
--   main and deployed; R3 works before migration 0002 too, and R6 works once
--   0004 is pasted.
--   One report moves to 'in_progress': R5, Discord announcements. Its code is
--   on main, but nothing can be sent until 0003 is pasted, the discord-announce
--   Edge Function is deployed by hand, the bot is given channel permissions and
--   the role list is filled in (TRIAGE.md, R5).
--   It sets status and reviewed_at = now(). It never sets reviewed_by: this
--   file is in a public repository, and a member id is as identifying as a
--   name.
--
-- PASTE IT AFTER supabase/migrations/0002_feedback_console.sql. It writes
--   'done' and 'in_progress', which only 0002's status check admits. Pasted
--   before 0002, the update fails on that check and nothing changes.
--
-- HOW A REPORT IS FOUND: no report id and no name. This round ran without an
--   export, so there are no report ids to quote, and the repository is public,
--   so no reporter is named. Each target is the route, the minute it was filed
--   in America/Los_Angeles (the time the console shows), and the KIND of
--   reporter, read from member_roles:
--     admin      the reporter holds an 'admin' row (Mr. Pina's four reports);
--     non_staff  the reporter holds no 'mentor', 'lead' or 'admin' row (the
--                two student reports). This does not require a 'student' row,
--                because an account can be a member without one.
--
-- IT RAISES AND CHANGES NOTHING unless every target matches exactly one
--   report. A missing report (0 matches) or an ambiguous one (2 or more) stops
--   the whole paste before the update runs, and the error names the target.
--   The check counts matches whatever their status, so a second paste passes
--   it and then changes 0 rows.
--
-- RE-RUNNABLE. Only reports still in an open status move: 'new', 'seen',
--   'open', 'reviewed', plus 'in_progress' for the five going to 'done'. A
--   report already done, won't do or spam is left alone, and a second paste
--   returns 0 rows.
--
-- UNDO: the paste returns each changed report's id. Set each one back to the
--   status the console showed for it before the paste. The console's own Undo
--   does not cover a SQL paste.
--
-- Proved on a throwaway Postgres 16 with 0002 applied, 2026-10-01: first paste
-- 6 rows (5 done, 1 in_progress), second paste 0 rows; a duplicate report at
-- one target's minute raised and moved nothing; a missing target raised and
-- moved nothing. Not run against the live project.
-- ============================================================================

begin;

create temp table mark_done_targets (
  label       text primary key,
  route       text not null,
  filed_la    text not null,  -- 'YYYY-MM-DD HH24:MI', America/Los_Angeles
  reporter    text not null check (reporter in ('admin', 'non_staff')),
  new_status  text not null check (new_status in ('done', 'in_progress'))
) on commit drop;

insert into mark_done_targets (label, route, filed_la, reporter, new_status) values
  ('R1 My Hours category totals (a student)',     '/my-hours',  '2026-09-23 15:53', 'non_staff', 'done'),
  ('R2 check-out sent to check-in (a student)',   '/dashboard', '2026-09-08 15:32', 'non_staff', 'done'),
  ('R3 feedback type optional (Mr. Pina)',        '/schedule',  '2026-09-03 16:19', 'admin',     'done'),
  ('R4 /display attendance history (Mr. Pina)',   '/display',   '2026-09-03 15:32', 'admin',     'done'),
  ('R5 Discord announcements (Mr. Pina)',         '/schedule',  '2026-09-10 16:48', 'admin',     'in_progress'),
  ('R6 students add calendar events (Mr. Pina)',  '/schedule',  '2026-09-03 16:18', 'admin',     'done');

-- The match is written ONCE, here, and both the check and the update read it.
create temp table mark_done_matches on commit drop as
select t.label, f.id
  from mark_done_targets t
  left join public.feedback f
    on f.route = t.route
   and to_char(f.created_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') = t.filed_la
   and case t.reporter
         when 'admin' then exists (
           select 1 from public.member_roles r
            where r.member_id = f.member_id and r.role = 'admin')
         when 'non_staff' then not exists (
           select 1 from public.member_roles r
            where r.member_id = f.member_id and r.role in ('mentor', 'lead', 'admin'))
       end;

do $chk$
declare
  v record;
begin
  for v in
    select t.label, count(m.id) as n
      from mark_done_targets t
      left join mark_done_matches m on m.label = t.label
     group by t.label
     order by t.label
  loop
    if v.n <> 1 then
      raise exception 'MARK_DONE: "%" matches % reports, expected exactly 1. Nothing was changed.', v.label, v.n;
    end if;
  end loop;
end
$chk$;

update public.feedback f
   set status = t.new_status,
       reviewed_at = now()
  from mark_done_matches m
  join mark_done_targets t on t.label = m.label
 where f.id = m.id
   and f.status = any (case t.new_status
                         when 'done'        then array['new', 'seen', 'in_progress', 'open', 'reviewed']
                         when 'in_progress' then array['new', 'seen', 'open', 'reviewed']
                       end)
returning t.label, f.status, f.route,
          to_char(f.created_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as filed_la,
          f.id;

commit;
