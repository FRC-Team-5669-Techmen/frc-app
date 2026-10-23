# 48 Where the handbook leaves the absence rules open, what does the app do?
- Raised: 2026-10-22 by the feedback inbox session (ledger 0016), from feedback d56ab62c (Ezio Veneziano: "Adjust the absence function to adhere to the handbook perfectly")
- Status: open
- Default if nobody decides: the five readings below, as built in `0025_absence_handbook.sql` and `src/standing.js`.
- Decided: --

## What is actually true right now

0025 brought four rules in line with handbook Sections 4, 6 and 11 (version 2026-10-20): a medical visit is not an emergency, the emergency deadline skips posted break weeks, a request still unanswered at the meeting can no longer be denied afterwards, and a mentor check-in during a meeting counts as attending. Each is pinned both ways in `0025_absence_handbook_rls_test.sql` (13 checks, 5 mutants). These five points the text does not settle:

1. **"The next school day."** The app knows weekends and posted break weeks, not single-day holidays. Default: a holiday that is not posted as a break week counts as a school day, so the deadline can fall on it. A mentor can approve a late emergency by hand (it stays pending until decided).
2. **"A mentor approves or denies it."** The app lets any staff role decide, which includes `lead`. Whether a lead is a student is decision 09, still open. Default: unchanged, a lead may decide (but never their own request).
3. **An emergency filed after the meeting.** "A request still unanswered at the meeting is approved" is read as a request filed BEFORE the meeting. An emergency filed afterwards (allowed until the next school day) waits for a mentor. Default: it waits; it is not approved by the rule.
4. **Signed in before the meeting, no scan in the first 15 minutes.** "No scan is an absence." A member already checked in who does not scan during the meeting is absent unless a mentor checks them in. Default: unchanged.
5. **An injury.** The emergency reasons are "Illness or injury" and "Family emergency (a death, hospital stay or serious illness)". Default: an injury is filed as Illness or injury.

## The options

For each point: keep the default, or say the other reading and a session changes the one function that holds it (`_next_school_day`, `decide_absence`, `_absence_excused`, `_member_meetings`, or the reason list in `src/standing.js`).
