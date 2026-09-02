# `docs/decisions/`

Open questions that need Mr. Pina, and the decisions that closed them.

**One file per decision, `NN-slug.md`.** A decision is not a task: it is a
question where the technically correct answer depends on something only he
knows -- what the team is doing, what he is willing to run, what a thing is
worth. A session that hits one of these writes the entry and proceeds under the
stated default rather than blocking, then says in its history entry which
default it used.

## Why this exists rather than a line in a prompt

Three of these were sitting inside the 110,000-character `CLAUDE.md` "Last
reviewed" paragraph on 2026-09-02, phrased as findings -- "recorded and
deliberately not fixed", "still on hold", "it is Mr. Pina's step". A finding
buried in a paragraph nobody re-reads is not a question anybody was asked. Each
one had been carried forward, unchanged, across several bundles.

## The format

```markdown
# NN <the question, as a question>
- Raised: <date> by <who>
- Status: open | decided | superseded
- Default if nobody decides: <what happens meanwhile, and who is doing it>
- Decided: <date> -- <the answer, in his words where possible>

## What is actually true right now
The measured state, with the evidence.

## The options
What each one costs, honestly, including the do-nothing one.
```

**A default is mandatory and it must be the honest one.** "Blocked pending a
decision" is not a default; "the seal slot stays empty and every footer rail
uses the logotype instead, which is what ships today" is. The default is what a
session does on Tuesday when nobody has answered, and writing it down is what
stops the same question being re-derived from scratch every time somebody
touches that file.

**Status changes to `decided` only when he has actually said so**, quoted, with
a date. Not when a session concludes the answer is obvious.
