# 47 Is the donations section of the handbook right, and does adding it mean families sign again?
- Raised: 2026-10-22 by the feedback inbox session (ledger 0016), from feedback fa3751a5 ("Add a donations section to the handbook")
- Status: open
- Default if nobody decides: **the draft stays in `src/handbook/handbook.md` between `{{draft:start}}` and `{{draft:end}}`, and no page shows it** (`/handbook`, `/rules`, the family link's handbook text all read through `stripDrafts`). `HANDBOOK_VERSION` stays `2026-10-20`, so nobody is asked to sign again.
- Decided: --

## What is actually true right now

- The draft is a `### Donations` subsection at the end of Section 19 (Parents and families), so no section number moves (the index, `/handbook?section=N` links and the tests keep their 24 sections).
- It says donations go through Bosco Tech and never to a mentor or student, that the school sends a receipt, that gifts of parts, tools or services and employer matching are welcome, and that a donation never helps or hurts a student's selection. Four facts are in brackets because nothing in the repo or project knowledge states them: the payee name and giving page, who sends receipts and how fast, whether in-kind gifts get a receipt, and the sponsor packet contact.
- `handbook.md` is the release tab of the Claude Doc "FRC Team 5669 Member Handbook" and the two change together. The Doc was not edited by this session; approving means the same text goes into the Doc.
- `tests/handbook.test.js` holds both directions: the draft is in the source, and section 19 renders without it (and with it once the markers are removed).

## The options

1. **Approve as written** (after filling the brackets): delete the two marker lines and the DRAFT line, put the text in the Doc. It is family information, not a new rule on members, so the default is **no new version and no re-signing**.
2. **Approve and publish a new version** through Sign, Publish a version (0017): every active member is notified, and families sign again on the family link. Right only if the section should count as something they agreed to.
3. **Leave it out.** Delete the draft block.
