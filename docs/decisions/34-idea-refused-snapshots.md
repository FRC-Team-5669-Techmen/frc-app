# 34 When IDEA sends a snapshot the mirror refuses, should the refusal be logged, and should a wrong secret be?
- Raised: 2026-10-01 by the overnight session (the IDEA certifications mirror, workstream A)
- Status: open
- Default if nobody decides: **as migration 0001 builds it: a call with the
  right secret but a bad snapshot changes nothing in the mirror, writes one
  `idea_cert_sync_log` row with `ok = false` and the reason, and answers with
  HTTP 422. A call with a wrong or missing secret is refused with one generic
  error (SQLSTATE 28000) and writes nothing at all.**
- Decided: --

## What is actually true right now

- The sync function is callable without signing in on purpose, behind the
  secret. Validation is strict: every documented key must be present, a
  prerequisite must be a code in the same catalog, and a timestamp must carry
  an offset, so a misspelled key refuses the snapshot rather than silently
  dropping data.
- Staff read the sync log; members and parents do not.
- Logging a wrong-secret call would let any caller fill the log table, which is
  why it writes nothing.
- On the throwaway harness (2026-10-01): a wrong secret wrote 0 log rows and a
  missing or empty secret was refused with the mirror unchanged; each of eight
  bad snapshots wrote 1 log row and left the mirror unchanged.
- Not verified on the real gateway: that PostgREST answers SQLSTATE 28000 as
  HTTP 403, and that it commits the refusal's log row while answering 422.

## The options

**A. Log refusals of signed calls only (the default).** Staff can see in this
app why the mirror stopped updating.

**B. Raise on every refusal and log only successes.** Simpler; the `ok` and
`error` columns would always read true and null, and a stalled mirror would
say nothing.

**C. Also log wrong-secret calls.** Shows probing, and lets any caller fill
the table.
