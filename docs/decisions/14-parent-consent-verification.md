# 14 Should a parent's employer-contact consent count only after staff confirm it, given the student types the parent's email?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 16)
- Status: open
- Default if nobody decides: **unchanged: consent counts as the parent form
  recorded it.** A session asked to work here builds option A, together with
  the send limits audit item 16 describes.
- Decided: --

## What is actually true right now

- The parent's email on the member application is typed by the student, and
  the parent-response link is sent to that address. Nothing in the flow checks
  that the address belongs to a parent.
- `employer_contact_consent` is the legal permission to approach a parent's
  employer for sponsorship. `/applications` shows it as a loud badge, and
  staff may act on it.
- Audit item 16 (high, unfixed at `e652b01`) is the security side of this flow;
  the committed audit carries it as a stub and the full text went to Mr. Pina
  privately on 2026-10-01.

## The options

**A. Staff confirm before acting on consent (S of UI).** The badge and the CSV
say "unconfirmed" until a staff member confirms by phone or a known address.
Ship the send limits regardless: an approved member to send, one
student-initiated send per application per 24 hours, staff resend unlimited.

**B. Trust it as now.** Free. The team may approach an employer on a consent
nobody confirmed came from a parent.

**C. Drop the consent field and always ask the parent directly.** Simple, and
loses a useful signal.
