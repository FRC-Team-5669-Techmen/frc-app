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

## Security recheck, 2026-11-07 (Item 16)

**Exact question for Mr. Pina:** Should staff verify employer-contact consent by a known address or phone before acting on it? Should parent-request email require an approved member and allow one student send per application per 24 hours, with staff resends exempt, or should staff also have a limit?

**Default for this job:** Preserve the existing consent and send policy until answered. Do not add a confirmation workflow or send-limit policy during this re-audit.

The current send-parent-request handler verifies identity and ownership/staff, but has no approved-membership or persistent send-limit check. The local schema has no parent-send ledger; the staff-facing consent badge still treats the recorded answer as consent. 8cedc44 changed mail transport only. The existing protected parent_token and literal-true consent validation remain useful partial controls, not closure of item 16.

No claim about live deployment follows from the local harness. See `docs/history/codex-frc-security-recheck.md`.
