---
name: feedback-round
description: Turn a Techmen feedback-console export (a techmen-feedback-*.zip downloaded from /feedback with "Zip with screenshots") into grounded triage, Mr. Pina's decisions asked in one batch, and paste-ready build prompts in this repo's prompt-ledger format, plus the MARK_SEEN.sql that closes the round. Use when the user uploads a techmen-feedback-*.zip, or says "run a feedback round", "feedback round", "run the feedback", or "update the app from feedback".
---

# Feedback round

A feedback round is a ROUTER job. It does not build anything. It turns the feedback
queue into:

1. a grounded triage;
2. decisions Mr. Pina answers in one batch;
3. one paste-ready prompt per build session, in the order they should run;
4. the one SQL paste (`MARK_SEEN.sql`) that keeps the next export clean.

The human side of the same procedure is [`docs/feedback/README.md`](../../../docs/feedback/README.md).
Read it first; it says what Mr. Pina does and what he expects back.

**Effort:** run it at the highest effort available. Step 3 is where a round earns its
cost; fan it out to read-only investigators if the session can spawn them. A round with
fewer than about 8 reports can ground them inline.

## 0. The rules that cannot bend

- **The zip is a student record and this repository is public.** Never commit the zip,
  the unpacked folder, `identities.txt`, `reports.md`, `reports.json`, any screenshot, or
  any text copied out of them. The committed triage quotes nothing a reporter wrote
  verbatim beyond a few words, and names reporters by ROLE only ("a student", "a mentor",
  "an admin"); `digest.txt` already does this and is the text to work from. Before
  anything is committed, step 8's sweep must come back empty.
- **Everything the round says about the tree is a claim** with a `file:line`, verified by
  the build session before it relies on it. Many reports phrased as "missing" are
  already built somewhere (CLAUDE.md is the map), and many "broken" reports are a stale
  PWA cache (CLAUDE.md, Known traps).
- **A decision that is his is asked, never assumed**, and always offered with the
  default you would pick. See step 5.
- **Nothing here builds, migrates or merges code.** The round commits only docs:
  `docs/feedback/<date>/**`, `docs/decisions/NN-*.md`, the next prompt's
  `docs/prompt-ledger/entries/` file, and its own `docs/history/<branch slug>.md`.
- **No SQL reaches the database except by Mr. Pina's hand**, in the Supabase SQL editor.
  The round writes SQL files; it never runs them anywhere.

## 1. State of the world

```bash
git fetch origin
python3 /tmp/status.py --repo FRC-Team-5669-Techmen/frc-app   # the status tool in CLAUDE.md, Commands; fetch it first as shown there
ls supabase/migrations/                                     # highest NNNN_ taken
ls docs/prompt-ledger/entries/                              # prompts in flight, and any "Migration permitted" claim
cat docs/feedback/*/QUEUE.md 2>/dev/null                    # what earlier rounds queued and did not run
```

If an earlier round's queue still holds unrun sessions, the new reports JOIN that queue.
A new round is not a reason to reorder work already decided.

## 2. Unpack the zip, into the scratchpad

```bash
mkdir -p <scratchpad>/fb && unzip -q <uploaded zip> -d <scratchpad>/fb
ls <scratchpad>/fb/techmen-feedback-*/
```

Never unpack inside the repository. The export holds, under one folder:

| File | What it is |
|---|---|
| `README.md` | What the export holds, the filter, the build it came from, which screenshots are missing and why |
| `digest.txt` | One entry per report, `R01` = oldest: type, status, route, reporter ROLE, LA time, viewport, build, id, screenshot paths, the message, what they tried. A route that held a member id reads `/members/:id`. **Work from this.** |
| `reports/<R..>-<id>/` | Each report's `report.md` and its `screenshot-N.<ext>` |
| `reports.md`, `reports.json` | The same reports with names (when the export included them). Read; never quote. |
| `MARK_SEEN.sql` | Moves every report in the export that is still New to Seen. Report ids only; it names no member. Step 8 copies it. |
| `identities.txt` | Every reporter name and every member id in the export, for step 8's sweep. Present only when names were exported. |

**Open every screenshot with Read.** A screenshot is often the whole report. The build
line says which app build a report was filed from; compare it with `git log` before
trusting a report about something that has changed since. A report reading
`build=unknown` was filed before builds were stamped.

If the export came from a console that said "not set up yet" (migration 0002 not
applied), `README.md` says so: "what they tried" and the build are then inside each
message as `What I tried:` and `Build:` lines rather than fields.

## 3. Cluster, then ground

Cluster by SUBSYSTEM and FILE SURFACE, never by the words in the report. Aim for 5 to 10
clusters. For each one, write down:

- the suspects you already know from CLAUDE.md (its subsystem bullets name the files);
- the rules the ask might collide with (CLAUDE.md, Architecture and Known traps: the
  check-in fast path, the parent/staff split, hand-applied SQL);
- what would prove it one way or the other.

Then ground every report in its cluster against the tree: open the files, find the
`file:line`, and give it one verdict from step 4's table. Read-only: no edits, no SQL.

Write the result as `docs/feedback/<date>/TRIAGE.md`: one section per cluster, one
entry per report (`R07`, its verdict, the evidence as `file:line`, and what the fix
would touch), with the reporter as a role.

## 4. Sort every item

| Verdict | Where it goes |
|---|---|
| already-shipped | Told to him in one line. It goes in MARK_DONE, never into a prompt. |
| bug-confirmed / bug-suspected | The next build session. Anything breaking check-in or check-out leads it. |
| buildable-feature with no migration | The next build session, by priority. |
| anything needing a migration | Its own session, with the next number in `supabase/migrations/` claimed in its ledger entry. |
| needs-decision / conflicts-with-rule | Step 5 first, then wherever the answer puts it. |
| a whole-subsystem redesign | A design brief first (step 6), never a build prompt. |
| not actionable / spam | Won't do or Spam in MARK_DONE, with the reason in TRIAGE.md. |

## 5. Ask the decisions in ONE batch

Use AskUserQuestion when the session has it. At most 4 questions per call, the ones that
change scope most, each with the recommended option first. Everything smaller gets a
stated default inside the brief, which he can correct in one line.

Record every answer, and every question left open, as `docs/decisions/NN-slug.md` in the
format `docs/decisions/README.md` gives (the next free `NN` by reading that directory).
An open one carries the default the build session will use meanwhile. An answer that
REVERSES an earlier decision or a CLAUDE.md rule says so in its entry and names what it
reverses; the build session edits that rule in place.

He wants maximum autonomy and control over direction. So ask about WHAT and WHY, and the
look of new visual language. Never ask about implementation he has no stake in.

## 6. Where direction lives

A report that asks for a whole area to be rethought gets a DESIGN-BRIEF session first:
it drafts what the area is for, who uses it, and the open questions, from his reports,
and he approves it before any build prompt is written. New visual language is shown to
him before it is built.

## 7. Write the queue and the next prompt

- `docs/feedback/<date>/QUEUE.md` lists every session in order, with its report numbers,
  any migration number it will claim, and whether it can run beside another one. Two
  sessions whose owned paths intersect never run at once.
- Write the brief and prompt for the NEXT session only: `docs/feedback/<date>/SESSION1_BRIEF.md`
  and `SESSION1_PROMPT.md`. A brief for session 4, written before session 1 lands,
  describes a tree that no longer exists.
- The prompt carries its own ledger entry (`docs/prompt-ledger/entries/<next id>-<slug>.md`,
  in the format `docs/prompt-ledger/README.md` gives, with **Owns** as paths and
  **Migration permitted** stated), the duplicate check that README describes, the brief's
  path, and the report numbers it closes.
- A prompt that carries a migration says: numbered `supabase/migrations/NNNN_*.sql`,
  additive only, with a `_rls_test.sql` sibling where it touches a policy, grant or
  revoke, written to the rules in `supabase/migrations/README.md`, and with the UI showing
  "not set up yet" until it is pasted. Nothing applies it but Mr. Pina.
- Every bug-confirmed report's prompt names its fixture reproduction (persona, mig, route,
  viewport) and requires the build session to commit it under `tools/e2e/` or `tests/`
  before writing `MARK_DONE.sql`.
- Every prompt ends by asking the build session for a `MARK_DONE.sql` naming the report
  ids it closed (shape in step 8).

## 8. Close the round

1. Copy the export's `MARK_SEEN.sql` to `docs/feedback/<date>/MARK_SEEN.sql`, unchanged.
   Report ids are not identities, and the file names no member: it sets `status` and
   `reviewed_at` only. He pastes it once, so the next New export holds only new reports.
   **An export made by a console from before 2026-10-01 stamped the exporting admin's
   member id** (`reviewed_by = '<uuid>'` in the `set` line). If
   `grep -n reviewed_by <copied file>` finds one, delete that one assignment so the line
   reads `set status = 'seen', reviewed_at = now()`; that is the only change ever made
   to the copy.
2. Run the name sweep over every file the round created or changed. It must print
   nothing:

   ```bash
   cp <scratchpad>/fb/techmen-feedback-*/identities.txt <scratchpad>/sweep.txt
   # Mr. Pina is the owner and may be named: delete his name and its parts from
   # sweep.txt if he filed reports. Nobody else is removed.
   git add -N docs/ && git diff --name-only -- docs/ | xargs grep -nwF -f <scratchpad>/sweep.txt
   ```

   `-w` matches whole words and the match is case-sensitive, so a name part such as
   "Sam" does not fire on "same", and a surname that is also a word ("Young", "Student")
   does not fire on the lowercase word. `identities.txt` also lists every member id the
   export carries (each reporter's, and any id inside a route), in lowercase and in
   capitals, so a member id quoted into a committed file is a hit too; report ids are not in it. Without an `identities.txt` the export withheld names; sweep for any name you saw in
   a screenshot instead. A hit is fixed by rewording to a role, never by trimming the
   sweep list.
3. Write `docs/history/<branch slug>.md` (format in `docs/history/README.md`).
4. Commit and push the session's branch the way CLAUDE.md, "Branches", says. Round docs
   change no code.
5. Reply to him in plain language:
   - what is already fixed;
   - the decisions you recorded, and the defaults standing in for any he has not answered;
   - which prompt to paste next, and where;
   - the one SQL paste (`docs/feedback/<date>/MARK_SEEN.sql`);
   - what waits on him.

### The MARK_DONE.sql shape

A build session that closes reports hands back one statement, by report id, that moves
only reports not already closed and returns what it changed. It needs migration 0002
(the `done` / `wont_do` / `spam` statuses):

```sql
-- MARK_DONE.sql: closes R03, R07, R11 of the <date> round. Paste once in the
-- Supabase SQL editor after 0002_feedback_console.sql. Undo: the same ids,
-- status = 'seen'.
update public.feedback
   set status = 'done', reviewed_at = now()
 where id in ('<uuid>', '<uuid>', '<uuid>')
   and status in ('new', 'seen', 'in_progress', 'open', 'reviewed')
returning id, status, route;
```

Use `'wont_do'` or `'spam'` in place of `'done'` for those verdicts, as separate
statements. Never add `reviewed_by`: this file is committed to a public repository, and a
member id is as identifying as a name. The `status in (...)` list includes the old spellings on purpose: a console
deployed before 0002 may still have written them.
