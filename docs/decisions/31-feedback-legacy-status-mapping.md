# 31 Should a feedback report the old console marked "reviewed" become Seen or Done?
- Raised: 2026-10-01 by the overnight session (the feedback console, workstream C)
- Status: open
- Default if nobody decides: **Seen.** Migration
  `supabase/migrations/0002_feedback_console.sql` maps every existing row in
  place, one to one: `open` to `new`, `reviewed` to `seen`, `dismissed` to
  `wont_do`, leaving `reviewed_by` and `reviewed_at` untouched. The status check
  admits both vocabularies and the console reads both spellings.
- Decided: --

## What is actually true right now

- The old console's "Mark reviewed" meant acknowledged, not fixed, which is why
  the default is Seen rather than Done.
- 0002 is on `main` and not applied anywhere real. Until it is pasted, nothing
  has been mapped.
- How many live reports are `reviewed` is unknown. Read-only check:
  `select status, count(*) from public.feedback group by 1;`
- A later migration could drop the legacy values from the check and make the
  two admin RPCs the only write path. Default: not written, and the legacy
  values stay legal, until the old console can no longer be open in anyone's
  tab.

## The options

**A. Seen (the default).** The report sits in Seen until someone confirms it
was dealt with.

**B. Done.** Change one line of 0002's mapping before pasting it. Everything
marked reviewed reads as fixed.

**C. Keep the old spellings as aliases with no mapping.** Every query and
every round's SQL would carry both spellings forever.
