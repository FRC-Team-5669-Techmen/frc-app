# 01 Should new SQL be numbered migrations under `supabase/migrations/`?
- Raised: 2026-09-02 by the closeout chat
- Status: open
- Default if nobody decides: **yes, and it is already in place.** The directory
  exists with its README, the existing SQL is frozen where it is, and the next
  new file is `0001_*.sql`. Nothing has been renumbered or moved, so reversing
  this costs one deleted directory.
- Decided: --

## What is actually true right now

Measured on this branch, 2026-09-02:

- **58 SQL files, none numbered.** 57 under `supabase/`, one under `sql/`. They
  are named by feature (`weekly_surveys.sql`, `member_applications.sql`) with no
  ordering information in the filename at all.
- **The apply order exists only in prose.** It is recoverable from each file's
  header comment (`multi_claim_jobs.sql`: "Refactors jobs_board.sql. Run once in
  the Supabase SQL editor BEFORE testing"), from `CLAUDE.md`, and from
  `docs/history/`. A file's position in that order is not derivable from the
  directory listing.
- **56 of the 58 declare an apply instruction in their own header** -- some form
  of "Run once in the Supabase SQL editor". Two do not
  (`admin_roster.sql`, `member_skills.sql`, `profile_customization.sql`,
  `skills_catalog.sql`, `profiles_onboarded_at.sql` carry no such line).
- **Three have a test sibling** (`feedback`, `member_applications`,
  `parent_responses`), all three written in the last three weeks. The other 55
  have none.
- **Nothing records what has been applied.** No history table, no CLI, no CI
  step with a credential.

## The options

**A. Number new files, freeze the old ones.** (What is in place.) A new file
lands as `supabase/migrations/NNNN_name.sql`; `supabase/*.sql` never moves. The
cost is two directories meaning two different things, which the README has to
explain and does. The benefit is that from here on the apply order is a fact
about the filename rather than a fact about a paragraph, and the prompt ledger
can prevent two sessions taking the same number.

**B. Renumber everything into one sequence.** Tidier listing, and it destroys
the only handle anybody has on what was already run: those filenames are cited
by name across `docs/history/`, `CLAUDE.md`, and the notes of whoever pasted
them. It also invites re-running something that was never meant to run twice --
two files in this repo are one-time data operations. **Not recommended, and the
README says so as a rule rather than a preference.**

**C. Change nothing.** Free, and the next session names its file whatever seems
natural, which is how the current state happened. The specific cost is that the
apply order stays unrecoverable from the tree, and two parallel sessions have no
mechanism at all for not colliding.

## Worth knowing before answering

Numbering does **not** move this repo toward `supabase db push`, and should not
be read as a step in that direction. `db push` applies every local migration the
remote has no history row for; on a project with no history table that means
**all of them**, from the beginning, including any one-time data operation. The
sibling `idea-app` repo established this the hard way and denies the command
outright. Numbering here buys ordering and collision-avoidance, nothing else.
The apply path stays what it is: paste it into the SQL editor.
