# docs/prompt-ledger/

One prompt goes to one session. This directory records every Claude Code prompt at the
moment it is **issued**, not when it lands, so a chat can tell whether the work is already
in flight before writing a rival prompt for it.

Parallel chats and parallel sessions cannot see each other. That is the entire problem
this directory exists for.

**One file per entry, under `entries/`, named `<id>-<slug>.md`.** Never one shared file.
A shared append-only file is a fork waiting to happen: `idea-app`'s `docs/HISTORY.md` was
split for this reason and stopped conflicting, and this repo's own `CLAUDE.md` carried a
single 110,000-character "Last reviewed" paragraph that every session rewrote until it was
split into `docs/history/` on 2026-09-02.

## Why this is fetched, never read from a mount

The project-knowledge copy of this ledger is a snapshot taken when a chat opened. An entry
written at 2pm is invisible to a chat that opened at 1pm. So the check fetches this
directory live:

    curl -sfL https://raw.githubusercontent.com/FRC-Team-5669-Techmen/frc-app/main/docs/prompt-ledger/entries/<file>

A fetch that shows an entry proves the work is in flight. A fetch that shows nothing proves
only that nothing has been recorded yet, which is weaker, because an entry lands here only
when the issuing chat remembers to write one.

## What this catches, and what it does not

**Catches:** a later chat re-issuing work already issued, and two prompts in flight whose
owned file surfaces overlap.

**Does not catch:** two chats that both write a prompt in the same minute, before either
records an entry. Nothing short of a lock catches that, and a lock is not worth building
for a two-person workflow.

**Does not dedup on prompt text, deliberately.** The key is the owned file surface. Two
textually different prompts for overlapping work would get two different content hashes
and both be admitted. Text identity is the easy case and not the dangerous one.

## The check, before issuing any prompt

1. Fetch `entries/` live. Do not read a mounted copy.
2. List every entry whose Status is not `deployed`.
3. Flag any whose **Owns** paths intersect the new prompt's Owns paths. Intersection is by
   path prefix and glob, not by topic. Two prompts for unrelated features that both touch
   `src/` intersect.
4. Flag any entry with **Migration permitted: yes** if the new prompt also permits one,
   regardless of file surface. There is one migration number sequence
   (`supabase/migrations/`, see its README) and two sessions cannot both take the next
   number.
5. If anything is flagged, do not issue. Name the collision and stop.

An entry is written **before** the prompt is handed over. An entry written afterwards
records history; an entry written first prevents a collision.

## Entry format

    # <id> <short title>
    - Issued: <UTC timestamp>
    - By: <which chat or session wrote the prompt>
    - Owns: <paths and globs, copied verbatim from the prompt's canned opening block>
    - Migration permitted: <yes | no>. Highest in supabase/migrations/ at issue: <NNNN or none>
    - Status: <issued | pushed | in-integration | deployed>
    - Branch: <from the session's FINAL REPORT, never from the prompt>
    - Notes: <including anything deliberately excluded>

**Owns is copied verbatim, never summarised.** A boundary stated as a topic is not
checkable; a boundary stated as paths is. A prompt whose opening block names no paths is
not finished and does not get an entry yet.

**Branch is the one in the session's final report.** A session's branch is assigned by the
harness, not chosen by the prompt, and a resume never returns to the branch it resumes
from. Reading the prompt to decide what to merge is reading the request rather than the
result.

## Status transitions, and how each is confirmed

    issued          -> pushed          the final report names a branch, confirmed by git ls-remote
    pushed          -> in-integration  the branch is gone and integration contains its sha
    in-integration  -> deployed        confirmed by reading the artifact on main and quoting it

Never advance a status on the strength of a report, a branch page, or a green check. Each
transition is confirmed by reading the thing itself.

An entry reaching `deployed` stays here. It is not deleted and not archived, because the
question a later chat asks is "has this been done", and a removed entry answers it wrongly.
