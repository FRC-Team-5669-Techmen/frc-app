---
title: "Event family hub (Beach Blitz 2026): family form, carpool board, food board, event info, mentor page"
date: 2026-10-04
branches: [claude/brave-noether-tyn6cb]
commits: []
migrations: ["0005_event_family_hub.sql", "0005_event_family_hub_rls_test.sql", "0006_beach_blitz_seed.sql"]
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
