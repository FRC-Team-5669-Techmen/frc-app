# `docs/history/` -- the engineering record, one file per bundle

**A new entry is a new file here. Nothing is ever appended to a shared one.**

## Why this exists

Until 2026-09-02 the whole engineering history of this repo lived on **one line
of `CLAUDE.md`**: line 128, the "Last reviewed:" paragraph, 109,839 bytes
carrying about fifty bundles back to 2026-06-18, newest first, chained with
"Earlier the same day". Every session rewrote the front of that line, so two
sessions working in parallel always wrote to the same line and their branches
could never merge cleanly. It was also unreadable: finding what a bundle did
meant scrolling one paragraph with no headings in it.

The fix is that **a new entry is a new file**, and a new file conflicts with
nothing. `idea-app` split its own `docs/HISTORY.md` for the same reason and
stopped conflicting; this is that split, applied to this repo's own shape.

The fifty bundles that were on that line are now fifty files here, **byte for
byte**. Nothing was summarised, shortened or dropped, and
`npm run history:verify` proves it on every CI run by reassembling them and
comparing against the frozen copy at
`_source/claude-md-log-2026-09-02.txt`.

`CLAUDE.md`'s "Last reviewed" line is now a date and one sentence.

## Where an entry goes

**Create `docs/history/<your branch slug>.md`** -- your session's git branch
with the `claude/` prefix removed. On
`claude/repo-standards-conformance-uk5er7` that is
`docs/history/repo-standards-conformance-uk5er7.md`.

The name is your branch and nothing else, because the harness mints one branch
per session and a branch name cannot be taken twice while it exists. Two
sessions running at the same time therefore write two different filenames and
touch no line in common. Nobody consolidates these back into one file later,
and nobody should: merging them back would restore the exact write point this
split removed.

The fifty pre-split entries are named `record-NN-<slug>.md`. **`record-` is a
reserved prefix**: it names a closed set, written once by the split, and
nothing is ever added to it. `npm run history:verify` refuses a `record-` file
that is not one of the originals, and refuses a branch-slug file that pretends
to be one.

The `NN` in a `record-` name is **chronological** (`record-01` is the oldest
bundle), so the directory listing reads oldest to newest. The `record_order` in
its front matter is the opposite: it is that entry's position in the original
paragraph, which was newest-first, and it is what the verifier reassembles on.
Both are needed and they are not the same number.

## The shape of an entry file

YAML front matter, **one blank line**, then the entry body. The body starts
directly at its first real sentence -- there is no `## <title>` heading in it,
because the title lives in front matter and a second hand-typed copy is a copy
that drifts.

```markdown
---
title: "What this bundle did, in one line"
date: 2026-09-02
branches: [claude/your-branch-slug]
commits: []
migrations: []
subsystems: ["Hours and attendance"]
---

What changed, and why. Prose, not a changelog. State what was measured and
what it measured, name what was deliberately not done, and record any claim in
the prompt that the tree contradicted.
```

- **`title`** -- the one copy of the entry's name. `history:index` links on it.
- **`date`** -- `YYYY-MM-DD`. For a `record-` entry this is the date of the
  **commit the bundle describes**, read from `git log`, not the "same day"
  chain in the original paragraph, which was written relative to a header date
  and disagreed with the commits in three places.
- **`branches`** -- where known. Most `record-` entries have none: the branch
  was deleted by the old integrate workflow, or the work predates branching, so
  those entries carry `commits` instead.
- **`commits`** -- short shas, for a `record-` entry whose branch is gone. This
  field is this repo's addition to `idea-app`'s format, because this repo's
  record was written after the fact and a commit is the only durable handle
  some of it has.
- **`migrations`** -- the SQL **filenames** the entry touches. Not numbers:
  everything under `supabase/*.sql` and `sql/` predates numbering and is frozen
  where it is. From this bundle forward a new SQL file is a numbered migration
  under `supabase/migrations/` -- see that directory's README -- and its
  filename goes here the same way.
- **`subsystems`** -- free text, but reuse an existing value where one fits;
  `_tools/index.mjs` groups on it and prints an unknown one at the end rather
  than dropping it.

## The tools

```bash
npm run history:verify      # the control: is the split still lossless
npm run history:index       # print the indexes (never committed)
```

`_tools/verify-split.mjs` runs in CI. It fails on a dropped byte, a
non-contiguous `record_order`, a `record-` file that appeared or vanished, a
post-split entry that imitates the "Earlier ..." chaining, an entry with no
title or a malformed date, and on any edit to the frozen source itself. All of
those were exercised against a broken tree before this was committed, and the
tree restored byte-identically afterwards.

`_tools/split-source.mjs` is the one-shot that produced the fifty entries. It
refuses to run if any `record-` file exists. It is kept, not deleted, because
it is the only readable statement of where each cut was made and why each date
was chosen.

`_source/claude-md-log-2026-09-02.txt` is `CLAUDE.md` line 128 verbatim at
`abf7182`, the commit this split was cut from. **It is a record of what the
file said, not a document. Never edit it** -- the verifier hashes it and says
so.
