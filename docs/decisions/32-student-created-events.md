# 32 Should calendar events a student adds with the "add calendar events" permission reach Discord, push and the week-ahead post like any other event, and may they ever be mandatory?
- Raised: 2026-10-01 by the overnight session (member permissions, workstream F)
- Status: open
- Default if nobody decides: **they are treated like any other event, and
  mandatory stays staff-only.** This is what migration
  `supabase/migrations/0004_member_permissions.sql` enforces in RLS: a holder
  may add an event with `mandatory = false` only, and may edit or delete only
  events they added that are not mandatory and not in a staff series. An event
  staff later mark mandatory becomes staff territory.
- Decided: --

## What is actually true right now

- The permission is per member, granted and revoked by an admin on `/roster`
  ("Can add calendar events"). It counts only while the holder's profile is
  approved (`has_capability()`), and a member whose status is inactive or
  alumni keeps a grant until it is revoked.
- 0004 is on `main` and not applied anywhere real. Until it is pasted, the
  roster's grant control reads "not set up yet" and nobody but staff can add
  an event.
- Once a holder adds an event, every consumer of `public.events` sees it as it
  sees a staff event: the Discord calendar poster's #calendar post and its 2h
  reminder, which pings any subteam role named in the title or notes; the
  `schedule_change` push once push is live (decision 03); the week-ahead post;
  the calendar feed; and the per-event hours attribution on `/reports`. A
  `build` event opens the shop on the dashboard card for its window.
- `mandatory` reminds every active member regardless of RSVP, the widest
  broadcast the app has, which is why it stays staff-only.

## The options

**A. Like any other event (the default).** The admin granted the permission
deliberately; splitting the poster by author would need `render.js` to know
who created each event.

**B. Suppress role pings and push for events not created by staff (M).**
Quieter, and a student-run session then reaches nobody by ping.

**C. Restrict the kinds a holder may add (for example, not `build`).** One
term in the holder policies.

**D. Let holders set mandatory.** Drop `mandatory = false` from the three
holder policies in a later migration and show the checkbox.
