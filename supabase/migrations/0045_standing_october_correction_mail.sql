-- ============================================================
-- 0045 The October correction mail. Data only, no grant or policy, so no
-- _rls_test.sql.
--
-- Queues one correction to every address that got the 2026-11-01
-- "Meetings probation started" mail (each student and every parent address,
-- 54 on the day), in the same notice_outbox the original went through, so
-- notice-mail sends it from the same address within 10 minutes. Text approved
-- by Mr. Pina on 2026-11-01. Re-running queues nothing twice.
--
-- NEEDS 0015 and 0044.
-- ============================================================

insert into public.notice_outbox (to_email, subject, body, member_id, kind)
select o.to_email,
       case when o.subject = 'Techmen 5669: Meetings probation started'
            then 'Techmen 5669: Correction - no probation'
            else 'Techmen 5669: Correction - no probation (' || public._member_name(o.member_id) || ')' end,
       case when o.subject = 'Techmen 5669: Meetings probation started'
            then 'Please disregard this morning''s probation email. A setup error in the team app counted every member as missing October''s meeting, so the whole team got the same email. It was not a real result.'
                 || chr(10) || chr(10) || 'You are not on probation. Nothing changes.'
                 || chr(10) || chr(10) || 'Mr. Pina'
            else 'This is about ' || public._member_name(o.member_id) || '.'
                 || chr(10) || chr(10) || 'Please disregard this morning''s probation email. A setup error in the team app counted every member as missing October''s meeting, so every family got the same email. It was not a real result.'
                 || chr(10) || chr(10) || public._member_name(o.member_id) || ' is not on probation. Nothing changes.'
                 || chr(10) || chr(10) || 'Mr. Pina' end,
       o.member_id, 'correction'
  from (select distinct on (lower(to_email), member_id) to_email, subject, member_id
          from public.notice_outbox
         where subject like 'Techmen 5669: Meetings probation started%'
           and created_at >= timestamptz '2026-11-01 00:00:00-08' and created_at < timestamptz '2026-11-02 00:00:00-08'
           and sent_at is not null
         order by lower(to_email), member_id, created_at) o
 where not exists (select 1 from public.notice_outbox c
                    where c.kind = 'correction' and lower(c.to_email) = lower(o.to_email)
                      and c.member_id is not distinct from o.member_id
                      and c.subject like 'Techmen 5669: Correction - no probation%');
