---
title: "Event hub: the parent service hours note in five places, and the service hours CSV"
date: 2026-10-06
branches: [claude/ecstatic-brahmagupta-ojoytu]
commits: []
migrations: ["0011_event_hub_parent_service_hours.sql"]
subsystems: ["Schedule", "Testing", "Documentation"]
---

One solo session, ledger entry 0005, pushed to `main` in one push (the harness
minted `claude/ecstatic-brahmagupta-ojoytu`; solo mode pushes `main` directly,
so that branch carries nothing). Mr. Pina, 2026-10-06: "Driving, attending,
and volunteering for Beach Blitz are eligible for parent service hours."
Parents now see that where it motivates them, and mentors get a list to sign
the hours off from. **0011 has not been applied to the live project.** Nothing
in this container can reach it. Until it is pasted, every page looks exactly
as it did before this push.

The form is live and families are filling it out, so this is copy and
display only. No answer was moved, renamed or re-keyed, no question was
added, and no Edge Function needs redeploying.

## The audit, before building

- **(a) Whether a parent drives / offers a car.** Rides (`PartRides` in
  `src/EventFamilyParts.jsx`), per coming day and per run: the "How will
  <student> get to the venue / get home?" option cards (`RunPlan`,
  `to_mode` / `home_mode`, "We drive <student>, and can take others" is
  `driving`); 0008's optional fold "Driving to the event anyway on <day>?" /
  "Can a parent still drive students on <day>?" (`DriveExtra`, `drive_to` /
  `drive_home`); and, once either says driving, "Your car on <date>"
  (`CarDetails`: `car_seats`, `car_description`, `car_leave_by`,
  `car_takes_pickups`, stored as `hub_day_answers.offer_*`), followed once by
  the For drivers checks. A car becomes a `hub_cars` row (with the family as
  `driver_invite_id`) when its seats and description are filled in (0008
  `_hub_sync_car`).
- **(b) How many adults from the family attend each day.** Who is coming,
  the "Adults from your family" card (`data-testid="eh-adults"`), one
  `CountPicker` per coming day, field `adults` on `hub_day_answers` (0 to 30
  since 0008). It is a COUNT. No adult is ever named.
- **(c) Volunteering.** Only as a link: `hub_events.links.volunteer` (Setup
  lists it as "Volunteer registration"; 0006 sets Beach Blitz's to
  `https://beachblitz.org/volunteer/index.html`), shown in Event info through
  0006's Volunteer section line `Volunteer registration | link:volunteer`.
  Nothing in the form asks about volunteering.
- **/join** (`src/EventJoinPage.jsx`) renders the event's title, venue and
  dates in its header and a fixed intro in the form, all from `hub_join_info`
  (0007), which built its own event object rather than calling
  `_hub_event_json`.
- **The family page header and tracker** (`src/EventFamilyPage.jsx`: `Hero`,
  `Tracker`, `InfoBar`) render from `view.event`, which is
  `_hub_event_json` (0005) delivered through `hub_family_call` and passed on
  untouched by the `event-family` function. The member board and the mentor
  overview read the same `_hub_event_json`.
- **Mentor Setup** (`Setup` in `src/TripsAdmin.jsx`) reads `hub_events` with
  `select('*')`, edits a local copy and saves it with a direct update under
  0005's `hub_events staff all` policy and its table-level grant, so a new
  column on `hub_events` needs no grant or policy change.

## What was built

- **`0011_event_hub_parent_service_hours.sql`.** `hub_events.parent_service_hours_note`
  (nullable text, 1 to 300 characters when set). Beach Blitz 2026 gets
  "Driving, attending, and volunteering at Beach Blitz all count toward
  parent service hours." only while its note is empty, so a second paste
  never overwrites a mentor edit. `_hub_event_json` and `hub_join_info` carry
  the note (blank reads as null). `_hub_export` gains each day's `date` and
  `drove`: true when the family listed a car for that day (a `hub_cars` row
  with this family as driver, either run). The three functions keep their
  signatures and grants. The file restates the grants exactly as 0005 and
  0007 set them. Re-pasting 0005 or 0007 reverts the functions, so paste 0011
  again afterwards.
- **One stored sentence, five places** (`serviceHoursSpots` in
  `src/eventHub.js`, drawn by `ServiceHoursLine` in
  `src/EventHubControls.jsx`). Null shows nothing anywhere.
  - `/join`: the note, one highlighted line under the intro.
  - The family page: the note, under the tracker and above the Event info /
    GroupMe bar (also on Finish and on an ended event; not on the Event info
    page, which has its own card).
  - The driver offer in Rides: "Driving counts toward parent service hours."
    under "Your car on <date>", and appended to the subtitle of 0008's
    optional "drive anyway" fold, which a parent who picked a carpool still
    sees closed.
  - The adults question: "Adults who attend count toward parent service
    hours." under its hint.
  - Event info: a Parent service hours card after the quick links, with the
    note and, when the event has a volunteer web address, a "Volunteer at the
    event: also counts" button to it.
  The note is drawn in the volunteer tone (a 3px border and a 10% tint), not
  gold, because gold is never a surface fill. It is a line, never a modal or
  a card of its own, except the one in Event info.
- **Mentor Setup**: a "Parent service hours note" field, shown only when the
  row carries the column. It is sent on Save only then, so before 0011 an
  event saves exactly as before. Saved blank, it stores null.
- **The service hours CSV** (Exports tab, "Download service hours CSV",
  `serviceHoursRecords`): one row per family per day with parent name, parent
  email (the invite emails when the family has not given one), student, day,
  drove (yes/no), adults attending. Adults is the family's count on a day
  their student comes, 0 on a day the student does not come (the question is
  not asked then; a stored count left over from an earlier answer is not
  used), and blank while unanswered. **The form records a COUNT of adults
  attending, not their names, so this export cannot name every adult who
  attended.** The file says so in a note row above the header, and so does
  the card that offers it. No question was added to fix that. Decision 18's
  formula guard applies (`toCsv` in `src/csv.js` gained an optional `note`,
  written as one guarded cell on its own line). The section appears only once
  the export carries `drove`, which means 0011 is applied.
- **Fixture mode**: `features/eventhubservicehours.js` (migration 0011, the
  column) and gated ports in `eventhub.js` (`eventJson`, `exportRows`) and
  `eventhubjoin.js` (`hub_join_info`). Fixture Blitz carries a note and a
  volunteer link. `engine.js` changed in two places. A column one feature
  adds to a table another feature created (0011's note on 0005's
  `hub_events`) no longer makes that table strict: before this, listing it
  would have refused every other hub column. An applied feature column that
  a row never set now reads null under `select('*')`, as a real column does.

## Verified

- `node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/check-0011.mjs`
  on PostgreSQL 16 with every frozen file and 0001 to 0011, each migration
  applied twice: **15/15**. With 0011 left out: 3/15, the three grant checks
  that are about unchanged state. Every check sits beside its opposite on the
  same fixture.
- `tests/event-hub-service-hours.test.js` (8 tests): five of five spots with
  the note, zero of five with null, blank, before-0011 and no event; the
  volunteer link only for a web address; the CSV rows (6 for 2 families x 3
  days, 2 drove and 4 not); the note row above the header; the formula guard.
  It also checks that nothing in `src/` names Beach Blitz.
- `npm run test:features`, event-hub: a new step, "parent service hours
  (0011)", at 375 and 1440. With the seeded note: join 1, banner 1, adults 1,
  drive 2 (Casey's Friday and Saturday cars), info 1, the fold subtitle 1, and
  the volunteer link 1. The CSV: 30 rows for 10 families x 3 days, drove yes
  3 against 3 cars in the store, no 27. After a mentor blanks the note in
  Setup: stored null, 0 of 5 spots. Without 0011: 0 of 5 spots, no Setup
  field, Save still succeeds, no export card. 44px floor and no horizontal
  scroll on Event info with the new card. Screenshots of `/join`, Who is
  coming, Rides and Event info at 375 were looked at.
- The full solo gate's numbers are in the push report.

**Not verified:** anything on the live project (no credential here), in
particular that 0011 applies cleanly over whatever has actually been pasted
there, and the real `event-family` function passing `parent_service_hours_note`
through. It forwards `hub_family_call`'s JSON as it is, which was read, not run.

## Follow-up the same day: a dead "Welcome back" on /join

Reported from the live app: `/join` showed "Welcome back, you already started
for <a test student>", and Continue opened "This link does not work". The card
is browser memory only (`techmen:hub-family:<event id>` in localStorage,
written when `/join` opens a family page); nothing ever forgot a remembered
link once it stopped opening (a family removed, its links reset). Now:

- `/join` checks a remembered link with the event-family function before
  offering Continue, and forgets it only on the function's own
  `{ error: 'not_found' }` 404 (offline or a 5xx keeps it).
- The family page forgets the link it was opened with when the server says it
  is not found (`forgetFamilyToken`), so "Open the sign-up form" lands on the
  form.
- The card has "Not your family? Forget this on this device".
- The helpers moved into `src/eventHub.js` (`readSavedFamily`,
  `writeSavedFamily`, `forgetSavedFamily`, `forgetFamilyToken`).

`npm run test:features` event-hub "remembered link" step, both widths: a live
remembered link keeps the card (1) and the key; a dead one shows the form (card
0, form 1) and the key is gone; the dead-link page clears it; Forget clears a
live one.

The test FAMILY itself, if it still exists, is data in the live database and is
removed on the mentor page (Families, Delete), not by code.

## MR. PINA'S STEPS for 0011 (2026-10-06)

In the Supabase SQL editor
(https://supabase.com/dashboard/project/pbuogcrhdywpzvcxbwsd/sql/new), one
paste:

1. `supabase/migrations/0011_event_hub_parent_service_hours.sql`. It needs
   0005 to 0010. No Edge Function redeploy. Re-runnable.
2. Check it, one row per place the note is read from (the table, the family
   page and member board, and the open link):

```sql
select 'hub_events' as source, parent_service_hours_note as note
  from public.hub_events where id = 'b1b12026-0000-4000-8000-000000000001'
union all
select '_hub_event_json', public._hub_event_json('b1b12026-0000-4000-8000-000000000001') ->> 'parent_service_hours_note'
union all
select 'hub_join_info', public.hub_join_info('b1b12026-0000-4000-8000-000000000001') -> 'event' ->> 'parent_service_hours_note';
```

   Expect three rows, each reading "Driving, attending, and volunteering at
   Beach Blitz all count toward parent service hours." The last row errors
   with "This sign-up is closed" only once Beach Blitz is over.

After that, families see the note the next time they open the page. To
change the wording, use the mentor page's Setup tab ("Parent service hours
note"). Blank turns it off everywhere. The service hours list is on the
Exports tab.
