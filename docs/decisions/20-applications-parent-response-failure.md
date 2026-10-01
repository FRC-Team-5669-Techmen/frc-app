# 20 When parent responses fail to load on /applications, stay silent or say so and hide Pending and Resend?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 77)
- Status: open
- Default if nobody decides: **unchanged: the failure is silent, as recorded in
  `src/ApplicationsPage.jsx`, so the roster still renders.** A session asked to
  work here shows one line ("Parent responses could not load; Pending below is
  unknown"), hides the Resend buttons and the Pending filter until a retry
  succeeds, and still renders the roster.
- Decided: --

## What is actually true right now

- `src/ApplicationsPage.jsx` reads `parent_responses` after the applications and
  ignores that read's error on purpose, so a partial failure never blanks the
  roster.
- The result of a failed read: every row reads Pending with an inline Resend,
  the "Pending parent response only" filter lists everyone, and the
  employer-consent badges disappear.

## The options

**A. A notice, and suppress Pending and Resend (S).** The roster still
renders.

**B. Stay silent (today).** Staff can re-email parents who already answered,
and consent is invisible at the moment someone exports.

**C. Block the whole page.** Safe, and loses the roster for a partial failure.
