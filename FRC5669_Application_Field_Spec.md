# FRC Team 5669 Member Application - Field Spec

**Target:** frc-app, authenticated onboarding gate
**Scope:** roster, placement, and contact instrument. Not a consent or medical document.
**Applies to:** all new and returning members, every season.
**Status:** draft for review. No build prompt issued until confirmed.

---

## Architecture

### The form is authenticated, not public

This reverses the earlier recommendation. The audit is the reason.

Every path to a member record in frc-app goes through `auth.users` first, because
`profiles.id` **is** the auth user id and `handle_new_user()` fires on insert to
`auth.users`. There is no way to create a member record for a person who has not
authenticated. No table in the repo allows an anon insert under any condition; all
policies are scoped `to authenticated`, and the only three `anon` references in the
schema are revocations.

Building a public form means either a staging table plus a review queue, or an Edge
Function that provisions auth users with the service role from an anonymous caller.
Both are real work, both add an abuse surface, and neither is needed here: last year's
form already required a `boscotech.net` address, and `allowed_domains` already seeds
`boscotech.edu` and `boscotech.net` for auto-approval. A student signs in, the domain
gate approves them, and the application renders.

What this removes from the build: anon RLS policy design and its mutation tests, spam
and rate-limit controls, duplicate detection, student email verification, the staging
table, and the staff review queue. Identity is `auth.uid()`.

What it gains: returning members are already in the system, so the short path for them
is a lookup rather than a matching problem.

### Placement in the app

Renders in the same slot as `AccessGate` in `src/App.jsx` - after session and approval,
before the app shell - when the signed-in member has no application row for the current
season. `AccessGate.jsx` and `AccessGate.css` are the structural pattern to copy: full-screen
card outside the layout, no NavBar, multi-state machine, logo-and-card composition.

### Contact information does not go on `profiles`

`profiles` is readable by every authenticated member:

```sql
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
```

Putting parent phone numbers on `profiles` publishes every parent's contact information
to every student on the team. Contact fields live on a new `member_applications` table
with select restricted to the owner and `is_staff()`.

Fields that are already on `profiles` and already team-visible by design keep living
there: `shirt_size`, `grad_year`, `nickname`, `subteams`, `avatar_url`. The application
writes those through the existing profile update path.

### Season scoping

One application row per member per season, unique on `(member_id, season_id)`, so the
form is a yearly instrument rather than a one-time onboarding step. `seasons.sql` exists
in the repo; the season reference should use it.

### Parent confirmation email

On submit, a confirmation goes to the parent address entered. This verifies the address
at submission time instead of in January when a permission slip bounces, and it tells the
parent their student signed up. `send-approval-email` already does Gmail SMTP over
denomailer in an Edge Function, so this follows an established pattern rather than
introducing one.

The parent support questions (section 7) are asked in that email, not on the student's
form. A student answering on a parent's behalf is low-quality data on the most
operationally important question you ask.

### Google Sheet

Recommend dropping the live Sheet and exporting CSV from a staff roster page instead.
The repo has no Google API code of any kind today, and a Sheet mirror means an Apps
Script Web App, a shared secret, a resync path, and a second source of truth to
reconcile. If specific people need standing access to roster data without app accounts,
say who and the mirror goes back on the table.

---

## Field spec

Types are the Postgres column type. `R` marks required.

### 1. Identity

| Field | Type | R | Notes |
|---|---|---|---|
| Email | - | - | From `auth.email()`. Displayed read-only. Not stored on the application row. |
| Legal first name | text | R | |
| Legal last name | text | R | |
| Preferred name | text | | Writes `profiles.nickname`. Blank means use legal first name. |
| Student phone | text | R | Digit-sanitized on change, same as `LoginPage.jsx:63`. |

### 2. School

| Field | Type | R | Notes |
|---|---|---|---|
| Pathway | text | R | CSEE, MSET, MAT, IDEA, ACE, BMET, Freshman (in rotation) |
| Graduation year | integer | R | Writes `profiles.grad_year`. Dropdown labeled with the current-year grade, stored as the year. |
| Returning member | boolean | R | Drives the short path. |
| Seasons on the team | integer | | Returning members only. |

**Grade level is stored as graduation year, never as a label.** Last year's form stored
"Senior (2026)", which is already wrong this fall. A year integer stays correct for four
years and makes alumni queries trivial.

**"Freshmen - No Tech :(" is replaced.** Freshmen are in rotation, not pathway-less.

### 3. Prior experience

New section. Nothing on last year's form captured any of this.

| Field | Type | R | Notes |
|---|---|---|---|
| Prior robotics | text[] | R | FLL, FTC, VEX, FRC on this team, FRC on another team, None |
| Programming languages | text[] | R | Python, Java, C++, JavaScript, Block-based, Other, None |
| CAD tools | text[] | R | SolidWorks, Onshape, Fusion 360, Other, None |
| Hands-on experience | text[] | R | Soldering, hand tools, power tools, mill or lathe, 3D printing, None |
| Certifications already held | text | | Free text. |

This is the section that pays for the rebuild. You have a known coding and electrical
succession gap from the graduating seniors, and last year's form gave you no way to find
the freshman who already writes Python or the sophomore who has soldered.

**Self-reported experience does not create certified skills.** `member_skills` carries
`certified_by`, so certification is granted, not claimed. These answers surface to staff
as claimed prior experience during certification, and nothing more.

### 4. Subteam interest

Replaces both Q13 and Q15 from last year's form, which asked the same question twice in
two incompatible vocabularies - activities in one, job titles in the other - so the two
could not be cross-referenced. A student who checked eight boxes told you nothing.

| Field | Type | R | Notes |
|---|---|---|---|
| First choice | text | R | Single select from the taxonomy below. |
| Second choice | text | R | Must differ from first. |
| Third choice | text | | Must differ from first and second. |
| Why | text | R | Minimum one sentence. |

Taxonomy:

- Mechanical Design (CAD)
- Fabrication and Machining
- Assembly and Robot Construction
- Electrical and Wiring
- Programming and Controls
- Drive Team (selection by tryout)
- Field and Pit Crew
- Media, Outreach, and Business

Ranking forces a real answer and gives you something to place people with. Top-choice
counts per subteam also tell you where recruiting is short before the season starts, not
after.

### 5. Commitment and conflicts

Rewritten around the actual schedule rather than a flat Mon-Sun grid.

The form states the schedule, then asks about it:

> **Offseason and preseason:** Monday lunch meeting. Tuesday and Friday after school
> until 5:00pm.
> **Build season:** [TO CONFIRM]

| Field | Type | R | Notes |
|---|---|---|---|
| Monday lunch | text | R | Yes / No / Sometimes |
| Tuesday after school | text | R | Yes / No / Sometimes |
| Friday after school | text | R | Yes / No / Sometimes |
| Ride home after 5:00pm | text | R | Parent pickup, own transport, public transit, needs help arranging |
| Seasonal conflicts | text[] | | Fall sport, winter sport, spring sport, job, family obligation, other activity, none |
| Conflict detail | text | | Free text. |
| Build season acknowledgment | boolean | R | Cannot submit unchecked. |

The old form treated a Saturday in January the same as a Saturday in October and never
asked about the conflicts that actually cause attrition. Transportation is on here
because students stranded at 5:00pm is an operational problem you would rather find in
August.

### 6. Parent or guardian contact

| Field | Type | R | Notes |
|---|---|---|---|
| Parent name | text | R | |
| Parent email | text | R | `type="email"`. Confirmation sends here. |
| Parent phone | text | R | Digit-sanitized. |
| Second parent name | text | | |
| Second parent contact | text | | |

### 7. Parent support - asked in the confirmation email, not on this form

| Field | Notes |
|---|---|
| Weekend supervision availability | Saturdays, Sundays, either, neither |
| Meal or snack support | |
| Travel driving | |
| Employer name | Optional |
| **Employer contact consent** | Explicit opt-in. Required before any outreach. |
| Tool, material, or skill donation | Free text |

**The consent checkbox is not optional to include.** Last year's form collected the
employer name and never asked whether you could contact them. Approaching a parent's
employer about sponsorship without permission is the kind of thing that goes wrong once
and gets remembered.

### 8. Logistics

| Field | Type | R | Notes |
|---|---|---|---|
| Shirt size | text | R | Unisex XS through 3XL. Writes `profiles.shirt_size`. |
| Dietary restrictions | text | | You feed people at competitions and offseason events. |
| Emergency contact name | text | R | Someone other than the primary parent. |
| Emergency contact phone | text | R | |

Emergency contact is here even though school activity paperwork covers it, because that
paperwork is in the front office and not reachable from Da Vinci Schools on a Saturday
in October.

### 9. Discord and acknowledgments

| Field | Type | R | Notes |
|---|---|---|---|
| Discord username | text | R | Replaces four honor-system checkboxes. |
| Server join confirmed | boolean | | Staff-set, not student-set. |
| Attendance and conduct acknowledgment | boolean | R | |

Last year's Discord section was four checkboxes a student could tick without opening
Discord. Capturing the username makes server membership reconcilable against the roster
instead of assumed.

---

## Returning member short path

Returning members skip sections 3 and 8 and confirm-or-edit sections 1, 2, 6, and 9
prefilled from last season's row. Sections 4 and 5 are always asked fresh, since subteam
interest and conflicts are exactly what change year over year.

---

## Open items

1. **Build season schedule.** Section 5 has a placeholder. The commitment acknowledgment
   is not honest without it.
2. **`subteams` vs `disciplines`.** `profiles` carries both as `text[]` and the audit did
   not establish what distinguishes them. Which one the ranked subteam choice writes to
   is unresolved, and I am not going to guess at it in a build prompt.
3. **Dues or fundraising expectation.** Nothing on last year's form. If one exists it
   belongs in section 5 as an acknowledgment.
4. **Standing roster access for non-app users.** Determines CSV export versus Sheet mirror.
5. **Pathway storage.** No column exists for it today. New column on the application row,
   or onto `profiles.disciplines`, pending item 2.

---

## Changelog

- **2026-08-17** - Initial draft. Authenticated placement replaces the public-route
  recommendation after the frc-app audit. Field set rebuilt from the 2026 Google Form.
