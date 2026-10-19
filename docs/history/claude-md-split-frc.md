---
title: "CLAUDE.md cut from 25,626 to 3,907 words (wc -w); every moved paragraph lives verbatim in docs/subsystems/"
date: 2026-10-19
branches: [main]
commits: []
migrations: []
subsystems: ["Documentation"]
---

One solo session, ledger entry 0008, pushed to `main`. Mr. Pina asked for this repo's
`CLAUDE.md` to come in under 4,000 words, with every paragraph moved verbatim into linked
`docs/subsystems/` files and the migration rule and standing rules kept in place.

## What moved

- **Every bullet under "The subsystems"** (20,851 words, one bullet per line, the design
  system alone 4,966) went into 28 files under `docs/subsystems/`. Related bullets were
  grouped where they describe one area (check-in, hours, Discord, roster and access),
  keeping their original order. `CLAUDE.md` keeps one line per subsystem with a link.
- **The theme-token paragraph** under Branding went to `branding-and-theme.md`; the
  first Branding paragraph stayed.
- **Tooling notes**: what `test:checkin`/`test:features` print, why `ds:capture` fails
  here, the fetched status tool, the instruments table, the fixture-mode paragraph and the
  three browser-check traps went to `tooling.md`.
- **The SQL file inventory** (the "59 unnumbered SQL files" and "Thirteen have a
  `_rls_test.sql` sibling" bullets) went to `database.md`.
- **The Discord renderers trap** went to `discord.md`; `CLAUDE.md` keeps its rule ("do
  not try to make the two lists match") as a one-line trap with a link.

## What stayed in CLAUDE.md, deliberately

The whole "Database, and how SQL actually reaches it" section except the inventory: the
by-hand fact, the numbered-migration rule, taking the next number and recording it in
the ledger, Edge Functions by hand, and every trap that makes a wrong migration silent.
Also kept whole: Architecture, the "Always" verification rules, the `ds:audit` numbering
rule, mutation proof, Working conventions, Branches, How tasks come in, the remaining
Known traps, and Self-Maintenance.

## The two paragraphs rewritten, with their original text

The Self-Maintenance bullet now says where a shipped module goes and caps the file at
4,000 words. Its original text:

- A module shipped (move it from Roadmap to The subsystems) or a new milestone landed.

The "Last reviewed" line was bumped. Its original text:

Last reviewed: 2026-10-19. The member handbook (ledger 0007, migration 0013): `/handbook`, its lessons, glossary and signing, the dashboard tile; see `docs/history/member-handbook-0013.md`.

## How the move was proved

`tools/claude-md-coverage.mjs` (new, kept) splits the old `CLAUDE.md` into units (each
bullet, numbered item, table row, heading, code line, or run of prose lines) and requires
each one as an exact substring of the new `CLAUDE.md`, `docs/subsystems/`, or a file
named with `--also`. Its positive controls run every time: every unit must be found in
its own source, and a unit with a sentinel appended must not be found. Run against the
pre-split commit with this file as `--also`, it reported every unit found; the exact
count is in the commit message. Re-run with:

    node tools/claude-md-coverage.mjs --old d58c97e:CLAUDE.md --also docs/history/claude-md-split-frc.md

Code comments elsewhere that cite "CLAUDE.md" for a rule now point at text that lives in
a linked `docs/subsystems/` file. They were left as they are; the rule text is unchanged.

Not touched: any code, any SQL, any workflow. Nothing here reaches the live project.
