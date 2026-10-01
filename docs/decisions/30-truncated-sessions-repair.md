# 30 Should past sessions cut short by the check-out bug be repaired automatically?
- Raised: 2026-10-01 by the overnight session (the check-out fix, workstream B)
- Status: open
- Default if nobody decides: **no automated repair.** Staff run the read-only
  candidate query below and fix each confirmed day by hand with the existing
  Verify Hours tools (a manual check-out or a void, both of which require a
  reason and write `attendance_audit`).
- Decided: --

## What is actually true right now

- Until `9543e90` (2026-10-01), a `/checkin` page shown again wrote a silent
  check-out. Its signature in `attendance_events` is an `out` by `nfc` at the
  same location shortly after that day's `in` by `nfc`, while the student was
  still in the shop, often followed the same day by a second `in` by `nfc` (the
  student answering the check-in screen) closed by the 10 PM auto-close.
- A match is a candidate, not proof: a student who really left for dinner and
  came back matches too. That is why an hours ledger should not be rewritten by
  this heuristic.
- The query lists, per member and LA day since 2026-08-15, an `nfc` check-out
  followed the same day by another `nfc` check-in, with both times. It reads
  only. It was checked on the throwaway harness against a fictional replay,
  with a clean day as the control that correctly did not appear. It has not
  been run against live data.

```sql
with ev as (
  select ae.user_id, ae.type, ae.method, ae.event_time,
         (ae.event_time at time zone 'America/Los_Angeles')::date as la_day,
         lead(ae.type)       over w as next_type,
         lead(ae.method)     over w as next_method,
         lead(ae.event_time) over w as next_time
    from public.attendance_events ae
  window w as (partition by ae.user_id order by ae.event_time))
select coalesce(p.nickname, p.full_name) as member, ev.la_day,
       to_char(ev.event_time at time zone 'America/Los_Angeles', 'HH24:MI') as nfc_out_at,
       to_char(ev.next_time  at time zone 'America/Los_Angeles', 'HH24:MI') as next_nfc_in_at
  from ev join public.profiles p on p.id = ev.user_id
 where ev.type = 'out' and ev.method = 'nfc'
   and ev.next_type = 'in' and ev.next_method = 'nfc'
   and (ev.next_time at time zone 'America/Los_Angeles')::date = ev.la_day
   and ev.event_time >= '2026-08-15'
 order by ev.la_day, member;
```

## The options

**A. By hand from the candidate list (the default).** Every change is a staff
judgement with a reason in the audit trail.

**B. An automated repair migration.** Fast, and it would also "repair" every
real leave-and-return, silently, in the ledger behind letters and goals.

**C. Nothing.** The affected sessions stay short; students can still flag a
session from My Hours.
