---
title: "Family link recovery (0023) plus the open feedback inbox, ledger 0016"
date: 2026-10-22
branches: [main]
commits: []
migrations: ["0023_family_link_recovery.sql", "0023_family_link_recovery_rls_test.sql"]
subsystems: ["Event family hub", "Families and records", "Connector"]
---

One solo session (ledger 0016, Opus 5.5, high), run unattended from a
scheduled prompt. Part A landed first on its own because it is live and
urgent; Part B (the feedback inbox) follows in the same entry.

## Part A: family link recovery

**What happened.** Beach Blitz 2026, 2026-10-22: a parent started Joseph
Tran's sign-up with a mistyped email (one character missing), so every page
link went to the wrong inbox. Back on `/join`, the family-already-started
screen showed only a masked address and told her to ask whoever holds it, and
the mentor page had no way to send a family the right link. Mr. Pina fixed it
by hand through the connector (`hub_staff_call` `set_emails`, then
`reset_links`).

**Audit, against the tree.**

- No staff path sent ONE family its `/e/<token>` link. `hub_staff_call` had
  `send_invites` (every family whose invite never went, so never a family
  already invited) and `remind` (every family not done), both event-wide.
  `TripsAdmin.jsx` had no per-family send. The connector reached
  `hub_staff_call` only as a generated `call_app` entry, with no voice.
- A mentor COULD already edit a family's emails and turn its links off from
  the family detail on `/trips/<id>/manage` ("Invite emails", Save emails,
  "Turn off old links"). What was missing was the send.
- `FamilyPage.jsx` (`/family/<token>`) knew nothing about the event hub.
  `family_call` (0017) carries no hub data.

**Built.** `0023_family_link_recovery.sql` adds `staff_send_trip_link`,
`trip_join_contact`, `family_hub_trips` and `family_hub_send_link` (and two
private helpers). The prompt asked for a `hub_staff_call` action; it is a
standalone function instead, because adding an action means redefining
0005's 150-line `hub_staff_call`, a second copy of it that any re-paste of
0005 would silently revert. The two public functions are named outside the
`hub_` prefix (`staff_send_trip_link`, `trip_join_contact`) because 0005's
test pins the exact grants of every `hub_*` function; a first build named them
`hub_*`, and the full harness run caught it at 0005 check 5. Links are still minted per email at send time
(`hub_outbox_mint_link`, 0008), so each send carries a fresh token; mail kind
`resend`, so the invite status counts it. The mentor page's family detail now
opens on Emails and links (Save emails, Send link, Reset links with a confirm
step, each answering on its own line) and has Send link beside each address.
The connector gets the hand tool `send_family_link` (confirm). `/join` keeps
decision 43's masking and adds the typo line with a mailto to the event's
first alert email. The family link shows Trip sign-ups with Send me the
sign-up link.

**Measured.** 0023 test 22/22 on `tools/sql-harness/`; 6/6 mutants caught
(`mutants-0023.mjs`, restoring from its in-memory copy and re-checking green
after each); connector proof 1189/1189 with the new hand sample; `family-link`
feature spec 44/44 at 375 and 1440, both migration states.

**Not verified.** Nothing touched the live project: 0023 is not applied there
until pasted, no email was sent, and the Gmail drain was never exercised
(fixture mode answers it as not configured).
