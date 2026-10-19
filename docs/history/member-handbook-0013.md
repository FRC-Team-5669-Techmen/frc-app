---
title: "The member handbook in the app: quick reference, 18 lessons with checks, glossary, and signing (0013)"
date: 2026-10-19
branches: [main]
commits: []
migrations: ["0013_handbook_acknowledgments.sql", "0013_handbook_acknowledgments_rls_test.sql"]
subsystems: ["Handbook", "Dashboard", "Testing", "Documentation"]
---

One solo session, ledger entry 0007, pushed to `main`. Mr. Pina wrote the team
member handbook with Claude over several sessions (sources: the published
handbooks of 254, 1678, 971, 4201, 3128 and 5199 and world-elite teams; every
decision his) and asked for it in the FRC app so every student reads it,
understands it and respects it. **0013 has not been applied to the live
project.** Nothing in this container can reach it.

## What shipped

- **`/handbook`**, every role, in the avatar menu. Four tabs: Quick reference
  (the three standards, mandatory events, one session, safety, absences, who to
  tell, each linking to its lesson), Lessons (sections 1 to 22 as 18 lessons,
  each opening on "the rule" and ending in two real-life questions), Glossary
  (38 terms, searchable) and Sign.
- **The text is data.** `src/handbook/handbook.md` is the release tab of the
  Claude Doc, version October 20, 2026, with each diagram embed written as a
  `{{diagram:key}}` line. `content.js` parses it (headings, paragraphs, lists,
  tables, bold, links); `diagrams.js` holds the seven diagrams as static SVG,
  rendered from the doc widgets' JSX with React and recolored to `--hb-*`
  tokens that `HandbookPage.css` maps onto `theme.css`.
- **Tap to define.** The first use of a glossary term in a lesson is
  underlined; tapping it shows the definition (a bottom sheet on a phone, a
  popover from 720px). The marking runs in one render of the lesson on purpose:
  done in child components, StrictMode's second render saw every term already
  used and marked nothing (found by the e2e spec reading 0 terms).
- **Progress is per device.** localStorage, keyed by version and member,
  cleaned on read so a renamed lesson or an old version cannot count. A lesson
  passes only when both its stored answers are right.
- **Signing (0013).** `handbook_acknowledgments(member_id, version,
  signer_role, lessons_passed, signed_at)`, one row per member, version and
  role. Insert own, as a role held (student, parent, or staff as mentor);
  select own, staff, or a parent linked in `guardian_links`; no update or
  delete for anyone; a trigger stamps `signed_at` with the server clock.
  Students sign after passing all 18; parents and mentors may sign once they
  have read it. Staff see who has signed this version. Before 0013 the Sign tab
  says signing is not set up (`isMissingTable`).
- **Dashboard tile** for students: lessons passed on this device, linking to
  `/handbook`. It also fills the empty fourth slot of the desktop student row.

## Proof

- `tests/handbook.test.js` (11): 24 numbered sections plus at a glance, the
  version, no dash or review tag, all seven diagrams placed once and recolored,
  18 lessons covering sections 1 to 22 once, every question's quote found in
  its own lesson's text (with a control that the check catches a quote that is
  not there), every underlined term in the glossary and in the text.
- `0013_handbook_acknowledgments_rls_test.sql`: 16 PASS on
  `tools/sql-harness/`, the parent checks included. `mutants-0013.mjs`: 9/9
  caught (read to everyone, guardian clause dropped, insert check to true, role
  clause dropped, update and delete handed back, the stamp removed, the
  one-signature key dropped, anon read, the read policy broken shut).
- `tools/e2e/features/handbook.mjs` in `npm run test:features`, at 375 and
  1440: answers found by trying options, never from the answer key.

## For Mr. Pina

Paste `supabase/migrations/0013_handbook_acknowledgments.sql` in the Supabase
SQL editor, then run `0013_handbook_acknowledgments_rls_test.sql`; the last
row should read `summary PASS`. Until then everything but signing works.

## Not built

Mentor reminders to students who have not signed, re-signing on a major
change (Section 22 says the app does this; for now a new version means a new
`HANDBOOK_VERSION`, which starts everyone over), a public copy for the team
website, and every app feature the handbook describes that does not exist yet
(check-in windows, sign-out approval, probation automation, the safety log and
the rest listed in the doc's draft tab).
