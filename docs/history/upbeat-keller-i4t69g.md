---
title: "IDEA certifications cutover: the old skills system retired, job claiming gated on the IDEA mirror (0012), proof links and the sync-log export"
date: 2026-10-16
branches: [claude/upbeat-keller-i4t69g]
commits: []
migrations: ["0012_jobs_idea_cert_gate.sql", "0012_jobs_idea_cert_gate_rls_test.sql"]
subsystems: ["Skills and certifications", "Jobs", "Testing", "Documentation"]
---

One solo session, ledger entry 0006, pushed to `main` in one push (the harness
minted `claude/upbeat-keller-i4t69g`; solo mode pushes `main` directly, so
that branch carries nothing). Mr. Pina answered three decisions on
2026-10-14. Decision 27: retire the old skills certification system and the
old FRC training page, "it teaches nothing", and job claiming must not break.
Decision 33: the lowercased school sign-in email is the one link between a
certificate and a person. Decision 34: log refused syncs, do not log
wrong-secret calls, and add an admin "Export sync log". **0012 has not been
applied to the live project.** Nothing in this container can reach it. Until
it is pasted, the Jobs page runs the old gate exactly as before.

## The audit, before building

- **Where the old system lives.** Tables: `skills` (`skills_catalog.sql`),
  `member_skills` (`member_skills.sql`, `member_skills_certified_at.sql`),
  `cert_requests` (`cert_requests.sql`: `request_cert`,
  `approve_cert_request`, `deny_cert_request`), `task_required_skills`
  (`jobs_board.sql`, the "task_skills" policies), `disciplines`
  (`disciplines.sql`), `study_sessions` (`study_sessions.sql`: `study_summary`,
  `study_strip`, `study_current_streak`). Other readers in SQL:
  `readiness_summary` (`cert_readiness`, `study_pulse`), the
  `trg_skill_signoff` trigger in `notification_triggers.sql`,
  `admin_delete_member` (nulls `member_skills.certified_by`). Pages:
  `/skills` (`SkillsCatalog` with `DisciplinesCatalog` for staff,
  `MemberSkillsHome` otherwise), `/certify` (`CertifyPage`), `/coverage`
  (`CoverageMatrix`), `/study` (`StudyPage`). Other readers in `src/`:
  `MemberSkillsPanel` on Profile and `/members/:id`, the HomePage Skills,
  Coverage and Study tiles, the ParentHomePage cert chips, the
  AccessRequests cert queue, the NavBar and HomePage pending counts,
  Readiness, the Skill sign-offs push toggle, and the tour copy. Fixture: the
  core seed (`seed.js`), `rpcs.js`, `routes.js`, `tools/e2e/plate/states.mjs`.
- **How a claim was gated.** `claim_task` is defined three times; the latest is
  `supabase/jobs_collective_certs.sql`: lock the task, open, not already
  claimed, capacity, then the caller must hold at least one of the job's
  `task_required_skills` as a certified `member_skills` row. A job carries
  only `(task_id, skill_id)` rows. `release_task`, `submit_task` and
  `verify_task` check no certification. `src/JobsPage.jsx` mirrored the rule
  client-side and computed collective coverage across claimants.
- **Account to email.** No helper returned the CALLER's own email. 0001's
  SECURITY DEFINER helper (`idea_cert_guardian_emails`) returns a parent's
  linked students' emails. The app matches its own rows with
  `session.user.email`, and `claim_profile` uses `auth.email()`.

## Claims in the prompt the tree contradicted, or could not confirm

- "the old FRC training page": there is no page by that name. `/study` is
  "Self-Study", a study-minutes log whose header tag read TRAINING. It is
  the only training-shaped page, so it was retired as the one meant.
- "the SECURITY DEFINER helper decision 33 mentions" maps a parent to their
  students' emails, not an account to its own email. 0012 adds that mapping
  (`idea_cert_caller_holds`).
- The prompt named `src/DisciplinesCatalog.jsx` as part of the old system. It
  is the disciplines editor embedded in the staff Skills catalog, and it went
  with it. `ProfilePage`'s disciplines picker still reads `disciplines`, which
  can no longer be edited in the app.
- Not confirmable from here: that 0001 is applied live, that the sync secret
  is set, and that ideabosco.com is live and sending snapshots.
- `CLAUDE.md` said `npm run test:features` ran 1159 checks; the tree measured
  1164 at the start of this session, before any change.
- The decisions README lists `open | decided | superseded`; the prompt asked
  for `answered`, and that is what 27, 33 and 34 now read.
- The prompt's claim rule names `status 'active'`. The gate also refuses a row
  whose `expires_at` has passed, because the contract's rule 6 says only an
  active, unexpired row counts as held, and `/certifications` already shows
  such a row as Expired. A gate laxer than the page would let a member claim
  with a certification the page tells them has lapsed.

## What was built

**Migration 0012** (`supabase/migrations/0012_jobs_idea_cert_gate.sql`),
additive plus one function replacement. `task_idea_cert_requirements(task_id
pk -> tasks on delete cascade, code, source admin/mapped/unmapped, set_by,
set_at)`: one row per DECIDED job, at most one code each, read by every
signed-in member, written by no client. It deliberately has no foreign key to
`idea_cert_catalog`, because every sync deletes and re-inserts that catalog,
and a foreign key would make the sync fail as soon as any job named a code.
`admin_set_task_cert(p_task, p_code)`: `is_admin()` or 42501, the code must
be in the catalog (22023 otherwise), blank clears it. `idea_cert_caller_holds(code)`:
an active, unexpired mirror row for `lower(btrim(auth.users.email))` of
`auth.uid()`. `claim_task` replaced: the same four checks in the same order,
then the IDEA gate; it reads neither `member_skills` nor
`task_required_skills`. `_idea_cert_map_jobs()` (no client may call it) carries old
requirements over once: a job gets a code only when every required skill
matches exactly one catalog code (by code or by name, trimmed, any case) and
they all match the same one; anything else is recorded `unmapped` (no
requirement). With an empty catalog it decides nothing, so a paste after the
first sync still maps; a decided job is never touched again. The file ends
with a report of every job that had an old requirement. No `idea_cert_*` table
and not `idea_cert_sync()` is touched.

**Jobs page.** `src/jobCerts.js` (pure): `jobCertMode` reads the
requirement table's error code through `src/schemaMissing.js`, `'old'` only
when the table is missing (a permission or network error is NOT a reason to
show the retired gate); `heldCodes` uses `isHeld` from `src/ideaCerts.js`, so
the page and `/certifications` share one rule. On the IDEA path, rows carry
`✓ CODE` or `🔒 CODE`, the detail shows "Required certification", whether you
hold it, and the ideabosco link, Claim becomes `🔒 Needs IDEA CODE`, and an
admin's create/edit form has a "Required IDEA certification" select (None
plus every active catalog code; a retired or vanished current code stays
selectable and says so), saved through `admin_set_task_cert` only when it
changed. Mentors and students see the requirement read-only. On the old path
nothing changed.

**Retirement.** `/skills`, `/certify`, `/coverage`, `/study` are
`<Navigate to="/certifications" replace />` inside the protected layout. The
seven page components and their CSS are deleted. NavBar: Skills (and the staff
Skills dropdown) became one Certs link to `/certifications`, Study left the
avatar menu, the pending badge no longer counts `cert_requests`. HomePage:
the student Skills and Study tiles became one Certifications tile (IDEA codes
held, by sign-in email), the staff Coverage tile a Certifications tile
(catalog size, synced or refused); the pending tile drops cert requests.
Profile and `/members/:id` say certifications are the IDEA ones and link
there; the parent dashboard's chips became a link; the AccessRequests cert
queue, Readiness' Safety cert coverage and Study pulse cards, the Skill
sign-offs push toggle and the tour copy went. `cert_requests`,
`member_skills` and the rest keep every row.

**/certifications.** Every holder row's serial is a link to
`https://ideabosco.com/certifications/verify?serial=<serial>`, and the header
says certifications are earned and awarded only at ideabosco.com/certifications.
An admin gets **Export sync log**: every `idea_cert_sync_log` row, paged, in one
zip (`idea-cert-sync-log-<LA stamp>.zip`) holding `README.txt` (counts, range,
who exported, the columns, and that wrong-secret calls never appear),
`sync-log.json` (as stored, oldest first) and `sync-log.csv` (decision 18's
formula guard). Mentors read the log through RLS but get no button, as the
decision says admin.

## Verified

- `npm run build` passed. `npm test`: 715 of 715 (686 in 40 files before, 43
  files now: `tests/job-certs.test.js`, `tests/idea-sync-log-export.test.js`,
  `tests/retired-skills.test.js`, 29 new tests, each with positive controls).
  `npm run ds:audit` ok, `npm run discord:calendar:test` 19/19,
  `npm run history:verify` lossless.
- `tools/sql-harness`: the 0012 test 27/27 on PostgreSQL 16 against the
  whole chain; `tools/sql-harness/mutants-0012.mjs` 19/19 caught (each widens one
  boundary and requires its named checks red, then restores from the
  definition it read). The full harness run: 289/289 checks across 13 test
  files, every earlier `_rls_test.sql` unchanged with 0012 applied.
- `npm run test:features`: 1273/1273 at 375 and 1440 across nine specs
  (`job-certs` is new, 109 checks, both migration states, student, student2,
  mentor and admin). `job-certs` mutated (`canClaimIdea` always true) fell to
  99/109, then was restored from a copy. One run of the full suite had one
  `event-hub` FAIL at 375 ("an answered question shrinks...", a timing check in a
  feature this session does not touch); `event-hub` alone then passed 207/207,
  and the final gate run is the number above.
- `npm run test:checkin`: 51/51 (375 and 1440).
- On the harness, as a rolled-back trial: the drop statements below run
  cleanly once 0012 is in, and afterwards `readiness_summary()` fails ("relation
  public.skills does not exist"), which is why it must be re-defined first.
- **The audit's suspected bug, confirmed on the harness:** `admin_delete_member`
  on a staff member who reviewed a cert request fails with `update or delete on
  table "profiles" violates foreign key constraint "cert_requests_reviewed_by_fkey"`.
  `cert_requests.reviewed_by` has no `on delete` rule and the function does not
  null it. Not fixed here (0012 carries only the claim path); dropping
  `cert_requests` removes it, or a later migration can add it to the function.

**Not verified, and why:** anything on the live database (no credential
here): that 0001 is applied, what the live IDEA catalog holds, which live jobs
0012 will map, and that PostgREST answers `claim_task`'s 42501 as the
client expects. The real ideabosco.com verify page was not fetched. No real
phone or WebKit.

## For Mr. Pina

### Applying 0012

1. Open https://supabase.com/dashboard/project/pbuogcrhdywpzvcxbwsd/sql/new
2. Paste the WHOLE of `supabase/migrations/0012_jobs_idea_cert_gate.sql` and
   press Run. It needs 0001 (the IDEA mirror) and is re-runnable.
3. **Success looks like** a result grid listing every job that had an old
   skill requirement, with columns `title`, `job_status`,
   `old_required_skills`, `requires_now` and `how`. `how` reads `mapped` where
   the job now requires the IDEA code in `requires_now`, and `unmapped` where
   it now has no requirement. If every row reads `not decided: no IDEA catalog
   yet`, no sync had arrived: paste the file again after the first sync.
4. Open a new query, paste the WHOLE of
   `supabase/migrations/0012_jobs_idea_cert_gate_rls_test.sql`, and press Run.
   **Success looks like** 28 rows: checks 1 to 27 each `PASS` (6 and 8 may read
   `SKIP` if no mentor or lead without admin exists), and a last `summary` row
   reading `PASS` with `27 PASS, 0 FAIL`. It ends in ROLLBACK and leaves nothing
   behind.
5. Nothing to redeploy. The next time anyone opens Jobs, the page switches to
   the IDEA gate by itself. To set a job's certification: Jobs, open the job,
   Edit, "Required IDEA certification", Save (admins only).

Re-pasting `supabase/jobs_collective_certs.sql`, `multi_claim_jobs.sql` or
`jobs_board.sql` puts the old `claim_task` back. Paste 0012 again after
any of them.

### Jobs left without a requirement

This session cannot see the live jobs, so it cannot name them. Step 3's grid
lists every one: each row whose `requires_now` is empty is a job that used to
need a skill and now needs nothing. The same list at any time:

```sql
select t.title, t.status, string_agg(s.name, ', ' order by s.name) as old_required_skills, r.source
  from public.tasks t
  join public.task_idea_cert_requirements r on r.task_id = t.id and r.code is null
  join public.task_required_skills trs on trs.task_id = t.id
  join public.skills s on s.id = trs.skill_id
 group by t.id, t.title, t.status, r.source
 order by t.title;
```

### Dropping the old tables later (not done, nothing deleted)

Kept in place and unread by the app: `cert_requests`, `member_skills`,
`task_required_skills`, `skills`, `study_sessions` (and `disciplines`, which
the profile still reads). **First** re-define, in a later migration, the
three functions that still name them, or they fail at run time:
`public.readiness_summary()` (its `cert_readiness` and `study_pulse` keys),
`public.admin_delete_member(uuid)` (its `update public.member_skills set
certified_by = null`), and `public._idea_cert_map_jobs()` from 0012. Then,
once 0012 is applied, in this order:

```sql
drop trigger if exists trg_skill_signoff on public.member_skills;
drop function if exists public.notify_skill_signoff();
drop function if exists public.request_cert(uuid, text);
drop function if exists public.approve_cert_request(uuid);
drop function if exists public.deny_cert_request(uuid);
drop table if exists public.cert_requests;
drop table if exists public.task_required_skills;
drop table if exists public.member_skills;
drop table if exists public.skills;
drop function if exists public.study_summary();
drop function if exists public.study_strip(uuid, int);
drop function if exists public.study_current_streak(uuid, int);
drop table if exists public.study_sessions;
```

`task_required_skills` must not be dropped before 0012 is applied: the
deployed `claim_task` reads it until then.
