---
title: "Event family hub (Beach Blitz 2026): family form, carpool board, food board, event info, mentor page"
date: 2026-10-04
branches: [claude/brave-noether-tyn6cb]
commits: []
migrations: ["0005_event_family_hub.sql", "0005_event_family_hub_rls_test.sql", "0006_beach_blitz_seed.sql", "0007_event_hub_open_link.sql", "0007_event_hub_open_link_rls_test.sql", "0008_event_hub_families.sql", "0008_event_hub_families_rls_test.sql"]
subsystems: ["Schedule", "Testing", "Documentation"]
---

One solo session, ledger entry 0003, built a per-event FAMILY HUB for offsite
competitions and pushed it to `main` in one push (the harness minted
`claude/brave-noether-tyn6cb`; solo mode pushes `main` directly, so that branch
carries nothing). Its first use is Beach Blitz 2026, Capistrano Valley High
School, Friday Oct 30 to Sunday Nov 1. **Neither migration has been applied to
the live project and the Edge Function is not deployed.** Nothing in this
container can reach either. Until a person does the steps at the end of this
entry, `/trips` says the hub is not set up yet and a family link cannot open.

The hub is data, not code: nothing under `src/` names Beach Blitz. The next
offsite event is a new row on `/trips` and a mentor filling in its Setup tab.

## The audit (A1 to A6)

**A1, the parent capability-link pattern.** `/parent/:token` is the model and
it checks out: the route is a sibling of `/` above the auth guard and is let
through both gates in `App.jsx`; `ParentResponse.jsx` never touches a table;
the `parent-response` Edge Function is `verify_jwt = false`, runs as the
service role, and answers an unknown token with a generic 404. Two things the
hub does differently, on purpose. `member_applications.parent_token` is a
`gen_random_uuid()` (122 random bits) stored in plaintext and hidden by the
grant surgery in `parent_responses.sql`; a hub token is 128 random bits and
ONLY its SHA-256 is stored, so no read of any table, by anyone, yields a
working link. And a hub invite can hold several live tokens, because a hash
cannot be turned back into a link: each email that carries one mints a fresh
token at send time, so the second parent's copy keeps working after a resend.

**A2, roster and parents.** `profiles` has no email and no parent fields. A
parent's contact lives only on `member_applications`: `parent_name`,
`parent_email`, `parent_phone`, and a second parent as `parent_two_name` plus
`parent_two_contact`, which is free text holding an email about as often as a
phone number. So "two parent emails" is true only where `parent_two_contact`
parses as one. An invite's addresses are `parent_email` plus
`parent_two_contact` when it is an email, from the CURRENT season's
application only; a student with neither (including every student who has not
filed this season's application) lands on the mentor page's "No parent email on
file" list, where staff type an address. The roster is approved, active profiles
holding `student` and no staff role.

**A3, why the hub does not hang off `public.events`.** A schedule row is one
time window, written by staff (and `events.create` holders), and fanned out
to Discord, push, the calendar feed and the week-ahead post, none of which
knows a hub field; and staff cancel an event by DELETING its row. A hub spans
several days with their own meet times, two runs a day, meals, and an
access model for people with no account, and it must survive a deleted
calendar row. So it is its own table, `hub_events`, with no foreign key to
`events`, and seeding it posts nothing anywhere. The schedule keeps whatever
calendar rows staff write for the same weekend, independently.

**A4, the pg_cron / pg_net shared-secret pattern.** `discord_calendar.sql` is
the model: a private config row read only by a SECURITY DEFINER invoke
function, an `x-cron-secret` header compared against a function secret, null
`edge_base_url` as the pause switch. The hub copies it with its OWN row,
`private.event_hub_config`, for the reason `discord_calendar.sql` gives about
`push_config`: filling in a shared row would switch on another feature. The
hourly tick (`event-hub-tick`, minute 7) asks `hub_cron_enqueue()` which
reminders and lock-in notices are due, then drains the outbox. Retention
(`event-hub-retention`, daily 11:17 UTC) is pure SQL with no secret and runs
whether or not the function is deployed.

**A5, shape language, the 44px floor and fixture mode.** The plate
(`src/plate.css`) styles EXISTING class names under `:root.tm-plate`, so a new
page gets nothing from it automatically. `src/EventHub.css` uses the theme
tokens and the plate's radius tokens with fallbacks and sets its own 44px
floor on every control a family or student can reach; the e2e spec counts
targets under 44px on every family and student screen at 375. Fixture mode's
catalog is generated from the FROZEN SQL by `gen-fixture-schema.mjs` against a
real database, so a numbered migration's tables are not in it; the plugin
contract's `creates.tables` is the documented way in, and
`src/dev/fixture/features/eventhub.js` declares the 14 tables and carries a
test-only JavaScript port of the rule functions, which says so at its top. It
proves the pages; it never proves the SQL.

**A6, nav placement.** Students reach the hub at `/trips` from the avatar
menu ("Trips", beside Study and Weekly Survey, non-parents only), which lists
current hubs and opens a read-only board. Staff get "Trips" in the staff block
after Surveys, opening the same list with a New trip form and a Manage link to
`/trips/<id>/manage`. Parent-role accounts get no menu entry: per the prompt
they have no special path and use their emailed link like every other family.
The family page itself is `/e/<token>`, outside `ProtectedLayout`.

## Choices made under the prompt

- **The one-minor rule** (Archdiocese of Los Angeles handbook 12.3.2, read
  2026-10-04): "may not be alone in a vehicle with a single minor who is not
  their own child". Read literally: a run whose driver's own student is aboard
  may carry one other student; a run without the driver's own student must
  carry zero, or two or more. In practice a family car always has the driver's
  own student aboard, so the rule mostly bites on mentor cars, and on a family
  driver whose student is staying nearby or riding elsewhere that run. A home
  pickup leg is judged on its own.
- **A day's answers stay editable until that day's venue close**, a seat or a
  car until that car is marked Left for that run, a food claim until its meal
  starts, and nothing after the last day's venue close. The phase deadlines
  lock nothing; they drive reminders and the status line only.
- **Pickup order is not modelled.** A driver who accepts pickups sees the open
  spots and accepts them; the route between them is the driver's.
- **One function sends all hub mail.** The prompt allowed an `event-mail`
  function; it was not created. `event-family` drains the outbox after every
  family action and on the hourly tick, over the Gmail secrets
  `send-parent-request` already uses.
- **The nav word is "Trips"** for members and staff; the family page calls
  itself by the event's title.
- **Driver requirements** follow the prompt (two ticks, paperwork switch off
  for Beach Blitz). The handbook asks one more thing the prompt did not, a
  clean three-year driving record, so the question went to
  `docs/decisions/42-event-hub-driver-requirements.md` with that default.

## Claims in the prompt that the tree contradicted

- "CSV with formula guard (decision 18)": decision 18 is open and its default
  is that every export writes cells verbatim; no guard existed. The hub CSV
  carries the guard through a new `src/csv.js`, which is the shared file
  decision 18's default names, and only the hub uses it. The decision file now
  says so; the five older escapers were not moved.
- "the fixture catalog": it is generated from the frozen SQL only, so the hub
  tables are declared in the feature plugin rather than added to the catalog.
- `tools/sql-harness/` is outside the prompt's "Owns" list. It is here because
  CLAUDE.md requires a harness worth writing to be kept, and the 2026-10-01
  bundle had built one exactly like it and deleted it.

## Verification

Every number below was read from a summary line in this container on
2026-10-04, on the tree that was pushed unless it says otherwise.

- **SQL, on `tools/sql-harness/`** (a throwaway PostgreSQL 16 with Supabase
  stand-ins and every frozen file applied): the 0005 test returns 69 rows, all
  PASS, with 0005 and 0006 each applied twice. `mutants-0005.mjs` widens each
  boundary in turn (12 policies to `using (true)`, 4 grants, 14 rule
  fragments inside the functions) and the test turns red on **30 of 30**,
  then green again after each restore. `race-0005.mjs` puts two real sessions
  on the last seat of a car: the second claim waits on the first's lock
  (about 1.2 s) and is refused, and in 25 pairs started at the same instant
  exactly one claim wins every time, **2/2**; with `FOR UPDATE` removed from the claim
  the same script reads **0/2** (two riders in a one-seat car). The seven
  existing `_rls_test.sql` files pass unchanged on the same harness (111/111),
  and 0006 applied twice leaves 1 event, 3 days, 5 meals and 17 starter needs
  with the Friday and Sunday clock times correct across the Nov 1 DST change.
  The object query in step 1 below was run there in three states: 30 of 30
  rows `present` with both files, only the seed row `MISSING` with 0005
  alone, and all 30 `MISSING` with neither.
- **vitest**: `tests/event-hub.test.js` (pure helpers, the autosave queue,
  the allergen list against the SQL, the CSV guard, the day sheet's escaping)
  and `tests/event-family-function.test.js` (the Edge Function under a fake
  client: token shape, the 404 and 409 mapping, the cron secret, the identical
  resend answer, staff-only drain). Full suite: 39 files, 673 tests, all passing.
- **Fixture E2E**: `tools/e2e/features/event-hub.mjs`, 79/79 at 375 and 1440:
  the family page outside the shell; a family signing up start to finish;
  autosave through two failed saves (the input kept, "Not saved, retrying",
  then "Saved"); consent-gated phones and pickup spots counted for the viewer
  who must see them AND the ones who must not; two pages racing for the last
  seat; the one-minor rule refused and shown; edit windows; the student board
  with no write control against staff seeing phones on the same board; a lost
  link; the mentor page's five lines and its two-step send; and 0005 not
  applied. Six mutants against it, each restored from a copy afterwards: an
  open pickup spot shown to every viewer (75/79), autosave giving up on a
  network failure (73/75; the step throws, so fewer checks run), a food claim offered after the meal starts
  (77/79), the one-minor rule off (77/79), allergy names sent to families
  (77/79, see below), and a car that has left still editable on the page (77/79); a
  seventh, the fixture leaking a driver's phone without consent, read 75/79.
- **The solo gate**, on the exact tree pushed: `npm run build` passed; `npm test` 673/673; `npm run ds:audit` ok (79 components, 315 files); `npm run discord:calendar:test` 19/19; `npm run history:verify` lossless; `npm run test:checkin` 51/51; `npm run test:features` 1036/1036 across eight specs (event-hub 79/79).

## Looked at, and fixed because of it

The family page fresh and mid-form, lock-in, the carpool board as a driver
and as a rider, food, event info, the student board and the mentor page, at
375 and 1440, in screenshots. That found and fixed: fixture days that were not
a Friday, Saturday and Sunday; the second stepper dot ticking before the first
step was done; tabs clipped at 375; an empty staff-tools strip on every car; a
gap line wrapping mid-number; raw phone digits; an unlabelled reminder
toggle. Running the spec found two more: the page jumped to lock-in the moment
the last sign-up answer saved mid-step (a family now stays on the form until
it presses Finish), and under React StrictMode an effect cleanup stopped the
memoised save queue for good, so nothing saved at all in development.

The allergy-names mutant first SURVIVED, 79/79: the food board hid names
unless the viewer was staff, a second copy of a rule the SQL already enforces,
so a leak in the data never reached the screen the spec reads. The board now
renders whatever the server sends for allergy names, a car's override reason
and the starter tag (the SQL strips all three for anyone but staff), and the
same mutant then read 77/79.

## Not verified

- **Anything on the live database**: that 0005 and 0006 apply there, that the
  0005 test passes there, that the cron jobs run. The harness is evidence
  about the SQL, not about the project.
- **Email delivery**: the outbox rows are proved; that Gmail delivers them is
  not.
- **The deployed function**, and the function under Deno at all: the test
  runs it under Node with a fake client and a fake SMTP client.
- **A real phone, WebKit, iOS Safari.** The E2E is Chromium only.

## Not built

- A driving parent whose own student is not coming has no path; a family
  offers a car only through its own student's invite.
- Retention clears pickup spots and phone consents only. Answers, cars,
  seats and food claims stay until a person deletes the event.
- Sunday's food truck hours were not posted when this was written, so the
  Sunday lunch note says exactly that; a mentor edits it on Setup.

## MR. PINA'S STEPS

1. **Paste the SQL, in this order**, each in its own SQL editor tab:
   1. `supabase/migrations/0005_event_family_hub.sql`
   2. `supabase/migrations/0006_beach_blitz_seed.sql` (its result grid should
      read event 1, days 3, meals 5, food needs (starter) 17)
   3. `supabase/migrations/0005_event_family_hub_rls_test.sql` (rollback-safe:
      69 rows plus a summary row, every one PASS)

   Then run this. It returns one row per object the two files create and says
   `present` or `MISSING` for each; every row should say `present`. (It runs
   before either file too, and then says `MISSING` on every row, which is how
   you know it is really looking.)

   ```sql
   select kind, name, case when found then 'present' else 'MISSING' end as status
   from (
     select 'table' as kind, t as name, to_regclass(t) is not null as found
       from unnest(array[
         'public.hub_events', 'public.hub_days', 'public.hub_meals',
         'public.hub_food_needs', 'public.hub_invites', 'public.hub_invite_tokens',
         'public.hub_responses', 'public.hub_day_answers', 'public.hub_cars',
         'public.hub_seats', 'public.hub_pickups', 'public.hub_food_claims',
         'public.hub_outbox', 'public.hub_resend_log',
         'private.event_hub_config']) t
     union all
     select 'function', f, to_regprocedure(f) is not null
       from unnest(array[
         'public.hub_family_call(text,text,jsonb)',
         'public.hub_member_board(uuid)',
         'public.hub_member_events()',
         'public.hub_staff_call(text,jsonb)',
         'public.hub_outbox_take(integer,uuid)',
         'public.hub_outbox_mint_link(uuid)',
         'public.hub_outbox_done(uuid,boolean,text)',
         'public.hub_resend_request(text)',
         'public.hub_cron_enqueue()',
         'public.hub_retention_sweep()',
         'public.invoke_event_hub_tick()']) f
     union all
     select 'internal functions (56 expected)', count(*)::text, count(*) = 56
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like '\_hub\_%'
     union all
     select 'cron job', j, exists (select 1 from cron.job where jobname = j)
       from unnest(array['event-hub-tick', 'event-hub-retention']) j
     union all
     select 'seed', 'Beach Blitz 2026',
       case when to_regclass('public.hub_events') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                   'select count(*) as n from public.hub_events
                     where id = ''b1b12026-0000-4000-8000-000000000001''',
                   false, true, '')))[1]::text = '1' end
   ) x
   order by kind, name;
   ```

2. **Deploy the Edge Function.** The project URL is not in this repository,
   so send me your Supabase project URL and I will turn this into exact links.
   Until then: Supabase Dashboard, your project, Edge Functions, "Deploy a new
   function", via the editor, name it `event-family`, and paste the whole of
   `supabase/functions/event-family/index.ts`. In its settings turn
   **"Enforce JWT verification" OFF** (the link is the credential; families
   have no account). Then Edge Functions, Secrets, add
   `EVENT_HUB_CRON_SECRET` with a long random value. `GMAIL_USER`,
   `GMAIL_APP_PASSWORD`, `EMAIL_FROM` and `APP_URL` are already set for
   `send-parent-request` and are reused; nothing else is needed. (From a
   terminal instead: `npx supabase functions deploy event-family`;
   `supabase/config.toml` already turns JWT verification off for it.)

3. **Switch on the hourly tick** (reminders, the lock-in email, and a retry of
   anything unsent), in the SQL editor, with your project ref and the SAME
   value you gave `EVENT_HUB_CRON_SECRET`:

   ```sql
   update private.event_hub_config
      set edge_base_url = 'https://<project-ref>.functions.supabase.co',
          hook_secret   = '<the EVENT_HUB_CRON_SECRET value>'
    where id = 1;
   ```

   Setting `edge_base_url` back to null pauses it. Mail still goes out after
   each family action without this; only the scheduled mail waits on it.

4. **Review the event before inviting anyone**:
   https://frc-app-liard.vercel.app/trips/b1b12026-0000-4000-8000-000000000001/manage
   - **Food**: read the 17 starter needs, change what you like, then "Mark all
     reviewed".
   - **Setup**: pick a captain for each day and fill the blank links (team
     list, school form, medication form, the GroupMe parent chat; the parent
     chat section stays hidden until its link is set). Decide decision 42
     (driver paperwork) here; it is one switch.
   - **Readiness**, Responses: "Add them" creates one invite per student and
     fills addresses from this season's applications. Type an address for
     anyone on the "No parent email on file" list.
   - Then **"Send invites"**. It shows how many families will get an email and
     asks once more before sending.

## 2026-10-05: the open link (0007, decision 43)

Mr. Pina tried the steps above on the live project and got no link: the
event had no families yet ("Sign-up 0 of 0"), and the "lost your link" form
only emails an address already on a family, while the screen said "a link is
on its way" either way. A probe of the live function with a made-up link
answered `{"error":"not_found"}` from the function itself, so `event-family`
was deployed with JWT verification off and 0005 was applied; the gap was the
flow. He asked for a Google-Form-style open link, families with no email on
file included, and that mentors (who drive) be supported.

Built: `/join` and `/join/<event id>` (option B, decision 43). The first
person for a student goes straight into the family page; once a family has
started, the open link emails that family instead of opening its page, so a
name picked from the list never shows another family's answers. "Add another
parent or guardian" on the family page covers more than one parent. The
mentor page shows the link with Copy, and the open page links a driving
mentor to the Carpool tab, where mentor cars already were. `/e` alone and a
dead link now point at `/join`; the "Send me a link" form is gone. An
unrestricted version (option A) was refused by the session's safety check
before the choice was made.

The two new functions are granted to `anon` and called from the browser
through PostgREST, so this needed no function redeploy. Queued mail is sent by
calling the deployed function's `resend_link` with a blank address, which
sends the queue and nothing else.

Verified: the 0007 test, 16/16 on `tools/sql-harness/`; mutants with the
started-family check removed (3 rows red) and the address mask removed (1
red) were caught, and one with the guardian tick removed turned the test red
by crashing it rather than by a clean FAIL row. `event-hub` E2E 100/100 at 375
and 1440 (the new open-link step: listed and not listed, the tick required,
straight in against already started, a second parent added, the same phone
going back, the dead link, the mentor link). Running it caught one real bug:
the add-parent box showed on an event that had ended. The family page now
hides it. Not verified: anything on the live database (0007 is not applied),
and email delivery.

## MR. PINA'S STEPS for the open link (2026-10-05)

1. SQL editor (https://supabase.com/dashboard/project/pbuogcrhdywpzvcxbwsd/sql/new),
   one tab each, in order:
   1. `supabase/migrations/0007_event_hub_open_link.sql`: "Success. No rows returned".
   2. `supabase/migrations/0007_event_hub_open_link_rls_test.sql`: 16 rows plus
      "summary", all PASS. It needs one approved student with this season's
      application; it rolls itself back.
2. Open https://frc-app-liard.vercel.app/trips/b1b12026-0000-4000-8000-000000000001/manage,
   copy the **Family sign-up link** at the top, open it in a private window,
   and sign up a student yourself with your own email. You land on the family
   page; the welcome email needs `GMAIL_USER` and `GMAIL_APP_PASSWORD` on the
   function's secrets.
3. Send that link to every parent and guardian.


## 2026-10-05: the family page rebuilt for parents, and 0008 (decision 44)

Mr. Pina, after trying the page: families must be able to take themselves or
one parent off; the form's progress was confusing; "adults from your family"
needed any number; a parent may drive students other than their own; every
question needed an info card ("will you take home pickups", for one); the
Salesian one-child rule had to be visible and enforced; carpool was planned in
one place and seats picked in another; Event info was "an annoying scrolling
mess"; the look was one flat theme; and "a boomer parent who minimizes
technology use in their daily lives should find this a breeze to fill out."

**The page** (`src/EventFamilyPage.jsx`, with the parts in
`src/EventFamilyParts.jsx`, the controls in `src/EventHubControls.jsx` and
inline icons in `src/eventIcons.jsx`): four parts, Who is coming, Rides, Food
and health, Contacts and forms, each with its own colour and icon, then a
Finish review. A tracker under the header says "N of 4 parts done" and has a
tile per part naming what is left; a part says "Part 2 of 4" and ends with
"Next: <part>". Every question carries an (i) card that opens on a tap (and on
hover with a mouse). A ride question the page assumed ("We started you on Team
carpool") keeps every card showing until someone taps one; an answered option
question shrinks to the chosen card and "Change this answer". Seats are
claimed right under "How will Sam get to the venue?", for that day and run;
the whole-team board is a fold under Rides, the food board a fold under Food.
The one-child rule is stated at the top of Rides. Finish lists every missing
answer as a line that opens its part, flags a run with no seat, and turns into
lock-in (one tap per day) and then "You are all set". Event info is a list of
closed sections. A save shows "All changes saved" at the foot of the screen
for a moment; "Not saved yet, retrying" stays until it lands. Adults take
0 to 4 as chips and "5 or more" opens a number box. Phones show formatted
and are stored as typed. Contacts lists the people on the page, with Remove,
and "Take our family off this trip" is a fold at the end. The mentor page
gained Removals on a family, "Seat two students together" on an empty car
that needs two, and shows the rule as always on.

**0008** (`supabase/migrations/0008_event_hub_families.sql`, its header has
every why): `drive_to` / `drive_home` on a day, so a parent can drive a car for
the team without their own student in it (whether or not that student is
coming), and that car falls under the one-child rule; adults 0 to 30; each
email gets its own link (one outbox row per recipient, the email recorded on
the token), so `hub_remove_guardian` can cut off one person; a family leaves
with `hub_remove_family`, a mentor removes one with `hub_staff_remove_family`;
`hub_staff_place_pair` seats two students into an empty needs-two car at once;
the rule is always on (`hub_events_one_minor_rule_on`); and
`_hub_invite_status` reads every email that carried a link, which fixes a real
bug: a family that came in through the open link read "none" forever and so
was never reminded. Everything new is called from the browser through
PostgREST, so the deployed function needs no redeploy.

**Found and fixed on the way.** An empty car without its driver's own student
(the mentor van) could not be filled by anyone: a family's first claim is
refused by the rule, and a mentor's one-student move needed an override reason
that then stayed on the car and stopped it ever turning red. Hence
`hub_staff_place_pair`, and the family page no longer offers a Claim it knows
will be refused. 0005's test check 5 had failed since 0007 was applied (its
function list predates 0007's anon grants); it now checks 0005's own
functions, and 0007's test gained check 17 for its own grants. A phone field
that switched from formatted to raw digits on focus made typing append to the
old number; it no longer switches. "Got it" on an info card did not close it
while the mouse was over it.

**Decision 44** records how the rule is read and the one question left: may a
student hold the first seat in a car that needs two (the car then cannot leave
until a second joins)? Default: no, a mentor seats the first two.

Verified: the SQL harness, every migration and every test, 238/238 (0005
69/69, 0007 17/17, 0008 41/41); mutants 0008 37/37 and 0005 30/30 (now with
0007 applied, whose baseline was red before the check 5 fix); `test:features`
1106/1106 (`event-hub` 149/149, in both 0008 states); `test:checkin` 51/51; the
build, `npm test` (675), `ds:audit`, `discord:calendar:test` and
`history:verify`. Not verified: anything on the live database (0008 is not
applied), email delivery, a real phone.

## MR. PINA'S STEPS for 0008 (2026-10-05)

0007 must be in first (the steps above). Then:

1. SQL editor (https://supabase.com/dashboard/project/pbuogcrhdywpzvcxbwsd/sql/new),
   one tab each, in order:
   1. `supabase/migrations/0008_event_hub_families.sql`: "Success. No rows returned".
   2. `supabase/migrations/0008_event_hub_families_rls_test.sql`: 41 rows plus
      "summary", all PASS. It rolls itself back. It needs one staff member, one
      approved student, two students with this season's application and two
      more non-staff accounts.
2. No function redeploy: everything new is called from the browser.
3. In a private window, open your own family page from the earlier step:
   Contacts now lists the people on the page, and Rides asks, per day, whether
   a parent can help drive other students. The mentor page's Setup shows
   "One-child rule: always on".
