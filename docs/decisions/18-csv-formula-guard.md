# 18 Should staff CSV exports neutralize cells that start with = + - @, given the survey export deliberately keeps text verbatim?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 75)
- Status: open
- Default if nobody decides: **unchanged: every export writes cells verbatim.**
  A session asked to work here guards the Applications, Reports and Team Hours
  exports through one shared `src/csv.js` (escaper, BOM and download), and
  leaves surveys on their recorded verbatim rule.
- Decided: --

## What is actually true right now

- The CSV escaper exists five times: `ApplicationsPage.jsx`, `reporting.js`,
  `ReportsPage.jsx`, `HoursBoard.jsx` and `surveys.js`.
- Fixed on 2026-10-01 (`921bbbd`, `3df69eb`): the Reports and Team Hours
  exports now start with a UTF-8 BOM, so Excel on Windows reads accented names.
  The Applications and survey exports do not yet.
- The survey export's verbatim rule is a recorded choice (`CLAUDE.md`, weekly
  survey: "a leading `=` in a student's free text is emitted verbatim").
- The Applications CSV holds parent phones, parent emails and emergency
  contacts, beside free text typed by students and by parents.

## The options

**A. Guard those three exports (S, the recommendation).** A cell starting with
`=`, `+`, `-` or `@` is written with a leading quote.

**B. Guard everything, surveys included.** Overturns the recorded survey rule.

**C. None.** A spreadsheet formula typed into a free-text field is opened as a
formula in a mentor's spreadsheet, beside the most sensitive contact data the
app holds.
