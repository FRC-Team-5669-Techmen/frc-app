# Updating the app from feedback

One folder per feedback round, named for the day it ran: `docs/feedback/<YYYY-MM-DD>/`.
Each holds the triage, the queue of build sessions, the prompts, and the SQL that
closes the round. The procedure a Claude Code session follows is
[`.claude/skills/feedback-round/SKILL.md`](../../.claude/skills/feedback-round/SKILL.md).
This page is the human side of it.

## What Mr. Pina does

1. **Export.** Open **Feedback** in the avatar menu (`/feedback`, admins only). It opens
   on the **New** tab. The bar at the top says exactly what it will export, for
   example `Export 23 shown`, and the filter that produced it. Press **Zip with
   screenshots**. Leave **Names in export** on: the round removes names itself before
   anything is committed.
2. **Start a round.** Open a Claude Code session on this repository, upload the zip,
   and type: `run a feedback round`.
3. **Answer the decisions.** The session asks at most a few questions at once, each
   with a recommended answer. Click, or correct it in a line.
4. **Paste the prompt it hands you** into a NEW session. That session builds the fixes.
5. **Paste `MARK_SEEN.sql` once** in the Supabase SQL editor. It is inside the zip and
   the round copies it to `docs/feedback/<date>/MARK_SEEN.sql`. It moves the reports in
   that export from New to Seen, so the next export of New holds only new reports.
6. When a build session finishes, it hands back a `MARK_DONE.sql` for the reports it
   fixed. Paste it once, the same way, and paste the next prompt in the queue.

**For a handful of reports**, skip the round: filter to them and press **Markdown for
chat**. It copies them ready to paste into a conversation. Past 50,000 characters it
splits into numbered parts, each with its own header, and nothing is ever cut; paste
every part.

## Writing a report that gets built right

- One topic per report.
- The type is optional. Pick **Bug** when something is broken and **Idea** when you
  want something new or different, if it helps; a report with no type is fine.
- Attach a screenshot whenever something looks wrong. Paste works anywhere in the box.
- Fill in **What did you try?** when you tried something first: reloading, another
  page, another phone. It tells a session what is already ruled out.
- Say WHY in one sentence ("students never collapse the list, so the page is
  cramped"). The why is what lets a session choose the right design, not just a fix.

The page, screen size, browser and app build are captured automatically and shown in
the box before it is sent.

## The statuses

| Status | Means |
|---|---|
| New | Nobody has looked at it yet. The console and every round start here. |
| Seen | Read, and in a round or a queue. `MARK_SEEN.sql` puts reports here. |
| In progress | A build session is working on it. |
| Done | Fixed or built. `MARK_DONE.sql` puts reports here. |
| Won't do | Read and decided against. |
| Spam | Not a real report. It is a status, not a delete, and can be moved back. |

Nothing is ever deleted: the table has no delete path for anyone. A move in the console,
single or bulk, can be undone right after with **Undo**, which puts back exactly the
status each report had.

Reports filed before 2026-10-01 used `open`, `reviewed` and `dismissed`. Migration
`supabase/migrations/0002_feedback_console.sql` renames them in place to New, Seen and
Won't do, one to one, and the console reads either spelling.

## Before migration 0002 is applied

Every SQL file in this repository is pasted into the Supabase SQL editor by hand, so the
app can be ahead of the database. Until `0002_feedback_console.sql` is pasted:

- reports still send, with or without a type, and "what did you try" and the build are
  kept inside the message text rather than lost;
- the console lists, filters and exports everything, and moves a report one at a time
  between New, Seen and Won't do;
- In progress, Done, Spam, bulk moves and Undo show a plain "not set up yet" line.

Paste it once this console is live, not before: the console from before it reads only
`open` / `reviewed` / `dismissed`, so pasted under that older console its Open view and
the avatar-menu badge read 0 until the new one ships (nothing is lost; the reports are
all under "All statuses").

After pasting it, run `supabase/migrations/0002_feedback_console_rls_test.sql` in the
same editor. It changes nothing (it rolls itself back) and returns one row per check;
every row should read PASS.

## Where your control lives

| You decide | Where it is recorded |
|---|---|
| A question only you can answer, and its default meanwhile | `docs/decisions/NN-slug.md` |
| Which build session runs next | You paste its prompt; `docs/feedback/<date>/QUEUE.md` lists them |
| What reaches the database | You paste every SQL file by hand; nothing applies SQL automatically |
| What reaches students | `main` moves only when a person moves it |

Everything else, including code, tests and the round's own documents, runs without you.

## Privacy

The export carries reporters' names and their messages, and a screenshot often shows
other members' names and hours. This repository is public. So the zip, the unpacked
folder, `identities.txt` and any text copied out of `reports.md` are never committed. A
round's committed files describe reporters by role only (a student, a mentor, an admin),
and the round checks every committed file against `identities.txt` before it pushes.

## Rounds

- [2026-10-01](2026-10-01/): the first round, run over the reports that were open before
  this console existed. Closed with `MARK_DONE.sql` rather than an export.
