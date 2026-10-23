---
title: "Family link recovery (0023) plus the open feedback inbox, ledger 0016"
date: 2026-10-22
branches: [main]
commits: ["53bf889", "bda0cc2"]
migrations: ["0023_family_link_recovery.sql", "0023_family_link_recovery_rls_test.sql", "0024_feedback_inbox.sql", "0024_feedback_inbox_rls_test.sql", "0025_absence_handbook.sql", "0025_absence_handbook_rls_test.sql"]
subsystems: ["Event family hub", "Families and records", "Connector", "Check-in", "Roster and access", "Feedback", "Push notifications", "Member standing", "Member handbook", "Branding and theme", "Landing and nav", "Discord"]
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

## Part B: the open feedback inbox (2026-10-22)

Every open item, audited against the tree first. Statuses are what each
report should now carry; nothing was written to the live inbox.

1. **2b674b0c, sent back gives no sign.** Partly true: `/checkin` already
   showed the reason on its form, but only if the student was still on that
   page, and the dashboard showed nothing at all. Built: the dashboard's
   sent-back state with the note and the next step, Ask again carrying the
   note, a 20-second look again while a request waits, and (0024 part A) an
   app notice and a push, category `signout_returned`. Status: done once
   0024 is pasted; the page half works now.
2. **2db35100, email on an access request.** Nothing existed. Built (0024
   part B): an AFTER INSERT trigger emails every admin through
   `notice_outbox`, deduped per address per day, never blocking the request.
   Status: done once 0024 is pasted and notice-mail is deployed.
3. **3c11c621, voice input does nothing or repeats.** The only voice input
   is the sign-out note's mic (`SignoutForm.jsx`). Cause, from the code: the
   handler joined EVERY result in each event and appended it, so a phone
   sending growing or doubled finals wrote the sentence two or three times;
   and every refusal ended silently. Fixed with `src/dictation.js`
   (FinalResults ported in design from idea-app); `tests/dictation.test.js`
   replays the event shapes and runs the old handler as the negative
   control (15 tests); the `inbox` spec drives a stand-in recognizer. The
   Android event shape is a model, not a phone measurement. Status: done.
4. **d56ab62c, absences per the handbook.** Compared rule by rule with
   Sections 4, 6 and 11 of the handbook in the tree. Four mismatches fixed
   in 0025 (medical visit as an emergency, next weekday instead of next
   school day, a request unanswered at the meeting could still be denied
   afterwards, a mentor check-in during a meeting counted as absent); five
   readings the text leaves open are decision 48. 0025 test 13/13, 5
   mutants. Status: in progress until 0025 is pasted and decision 48 is read.
5. **fa3751a5, a donations section.** Added to Section 19 as a draft between
   `{{draft:start}}` and `{{draft:end}}`, shown on no page until approved;
   four facts are in brackets. `HANDBOOK_VERSION` not bumped. Decision 47.
   Status: in progress (waiting on Mr. Pina).
6. **c6771432, proper site icons.** Read idea-app's set (ico, svg, 180
   apple-touch, 192 and 512 any, 512 maskable). Built the full Techmen set
   from the canonical mark in the Tactical HUD theme with
   `tools/icons/build-icons.mjs`; `npm run gen-icons` now delegates to it so
   there is one generator. Status: done.
7. **9b01037c, the app is busy.** Measured (`tools/e2e/nav-audit.mjs`): a
   mentor's account menu is 23 flat items and taller than a phone screen,
   with Sign-outs ninth. NOT built: `src/NavBar.jsx` is in ledger 0015's
   Owns and this prompt said not to touch scouting-owned files. Decision 49
   carries the measured BEFORE (screenshots in `docs/decisions/49-nav-before/`)
   and the exact proposal. Status: in progress (blocked on file ownership).
8. **aa4e3c4d, the tour.** It covered 9 steps written by hand. Now
   `src/featureGuide.js` lists every page and `src/tourSteps.js` builds the
   tour from it; `tests/feature-guide.test.js` fails on a route with no guide
   line (proved with a planted route) and holds each role's tour to its
   guide pages. Status: done.
9. **bd3a4af7, feedback parity with idea-app.** Screenshots, page context,
   statuses, exports and undo already matched (0002). Ported: answers to the
   sender (0024 part C, with notice, email and push), Your reports in the
   widget, a Speak button; the connector's `feedback_reply` is real. Left,
   in `docs/subsystems/feedback.md`: horizon, admin edit with revisions,
   anonymous reports, per-report archive folders, build age. Status: done
   once 0024 is pasted.
10. **1e00dfc5, Discord role pings and polls.** Already built in
    `/announce` (0003): role pings, polls, embeds, channels, dry run, log.
    Built what was missing for the schedule: Announce on each event for an
    admin, filling the composer from the event. Not built: scheduled sends.
    No real Discord send. Status: done.

**Part C, scouting (recorded, not built):** 449543dd and df99a056 (Azad,
`/scouting/f3df7044-e110-4ad4-9ad1-8ceea4b8fe79`). `docs/scouting/RESUME.md`
names no review queue on main, and `docs/scouting/**` is scouting-owned, so
both are listed in the session report word for word, not written anywhere.

**Claims in the prompt the tree contradicted.** The scouting review branch is
not separate from main any more: `codex/scouting-2026-evidence` sits at
`591940a`, an ancestor of main (`9aa3935` merged it), with no commits beyond
main; its ledger still lists `src/App.jsx`, `src/NavBar.jsx` and `CLAUDE.md`
in Owns, which is what kept item 7 out. Decision 16 says new feedback
reaches Mr. Pina only by a badge; still true for reports, not for answers.

**A pre-existing red, fixed.** `tools/sql-harness/merge-0020.mjs` restored
its mutants by pasting 0020 alone, which dropped the merge-rule rows 0022
added, so its restore check had been red since 0022 (466/468 on main). It
now restores with the latest rule list: 919/919.

**Measured (Part B tree).** SQL harness 623/623 across 26 files; mutants
0024 6/6, 0025 5/5; connector proof 1205/1205; `npm test` 1077/1077;
`inbox` spec 36/36. The full gate numbers are in the session report.

**Not verified.** Nothing touched the live project. 0023, 0024 and 0025 are
not applied there until pasted; no push or email was sent; speech input was
not tried on a real phone; the icons were not installed on a real home
screen.

## Landing

This session could not push. Its two commits were carried as a format-patch and landed on main on 2026-10-23 by ledger 0017's session (`docs/history/beach-blitz-readiness-0017.md`), applied with `git am` onto 9aa3935 unchanged: 53bf889 and bda0cc2. The gate on that exact tree: build passed; `npm test` 1077/1077; `ds:audit` ok; `discord:calendar:test` 19/19; `history:verify` OK; `test:checkin` 51/51; `test:features` 1881/1881.
