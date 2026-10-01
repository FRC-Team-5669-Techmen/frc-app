# 38 Should My Hours show a "Service" subtotal (Volunteer plus Outreach), since students call them service hours?
- Raised: 2026-10-01 by the overnight session (the My Hours fix, workstream B)
- Status: open
- Default if nobody decides: **no.** My Hours keeps its four category rows
  (Build, Outreach, Volunteer, Competition), and `src/categories.js` and its
  labels stay as they are.
- Decided: --

## What is actually true right now

- The 2026-09-23 report said "service hours" and meant the Volunteer row; no
  label on My Hours says "service".
- The service-hour letter on `/reports` defaults to Volunteer plus Outreach
  (`SERVICE_CATEGORIES` in `src/reporting.js`), and staff can change which
  categories a letter counts.
- `tests/vocabulary-drift.test.js` pins the category vocabulary between
  `src/categories.js` and the SQL.

## The options

**A. No subtotal (the default).** Nothing new to keep in step with the letter.

**B. A Service row on My Hours (S).** Volunteer plus Outreach from the same
model, so it matches the letter's default; it would not follow a letter where
staff picked other categories.

**C. Rename a category.** Touches the SQL check and every surface; not
recommended.
