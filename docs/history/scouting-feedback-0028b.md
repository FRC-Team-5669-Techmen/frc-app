---
title: "Scouting feedback: practice matches, saved confirmation, what tells robots apart"
date: 2026-10-28
branches: [worktree-agent-a7c58300edfa25afb]
commits: []
migrations: []
subsystems: ["Scouting"]
---

Two student feedback reports on `/scouting/:eventId`, two days before Beach Blitz. Client-only: no SQL changed, so no migration.

## 387edf14 (Isaac Lin, relaying Paul): "the tab just disappeared ... practice matches unlimited"

What the code did:

- **The SQL never limited practice matches.** `scouting_private.validate` (0022, re-defined in 0027, 0030, 0037) takes any match key of 1 to 100 characters. The only rule is 0022's unique index: one observation per scout per team per match identity. So `pm1`, `pm2`, ... were already separate records.
- **But the client mangled and collapsed practice keys.** `canonicalMatchKey` turned `12` into `qm12` but left every practice spelling as typed, so `P3`, `pm3` and `Practice 3` were three different matches. A practice label with no number (`practice`, `pm`) put every practice match of one robot under one key, so the second save hit the unique index after the form had closed: a `PT409` conflict in the queue. That is a de facto limit of one practice observation per robot.
- **An observation from an assignment could be refused after the form closed.** `RecordForm` canonicalized the match key even when the observation carried `assignment_id`, and the server requires `r.match_key = p_match` exactly ("This assignment does not match your observation."). A pasted schedule keeps keys as typed (`Q12`, `12`), so those saves failed permanently after sync.
- **The form gave no lasting confirmation.** On save the dialog closed and the only sign was a notice at the top of the page, off screen when the scout had opened the form from a team card on Teams, and its text ("Waiting to sync") never changed. A failed or conflicting sync showed only in the collapsed queue panel. That is the "tab disappeared".

Fixed:

- `src/scouting/provenance.js`: `P3`, `pm 3`, `Practice 3`, `practice match 3`, `practice #3` all become `pm3` (any number to 9999); `isBarePracticeKey`; `matchLabel` ("Practice 3", "Qualification 12").
- `src/scouting/RecordForm.jsx`: a "Saves as Practice 3 (pm3)" line under Match; a practice label with no number is refused in the open form; a second observation of the same robot in the same match is refused in the open form (was a conflict after sync); an observation linked to an assignment keeps the assignment's key and its Match field is read-only.
- `src/scouting/schedule.js`: pasted schedule labels get the same spelling, and `Practice 3, 254` (which read as match "Practice", team 3) is refused with a line number.
- `src/ScoutingPage.jsx`: `SavedBar`, sticky at the bottom of the page above the feedback launcher: what was saved (kind, team, match label), then its real queue state (on this device, synced, or not synced with the server's reason). It never times out; Show it, Record another, Dismiss. Form saves no longer also set the old top notice.

## 449543dd (Azad): "every robot does these areas"

The team card listed the three capability rates (TRENCH, BUMP, floor intake) in full for every robot, whether or not any robot differed, after the 0027 match numbers and the 0037 option summary. New `src/scouting/spread.js` compares each capability and each observation option across observed robots (confirmed, current-event, non-super observations; a robot with no decisive answer is left out, never counted as no; at least two robots before anything is called shared). New `src/scouting/TeamEvidence.jsx` puts the answers that vary first, marked "Varies by robot", then those not yet compared, and folds the shared ones into "Same for every robot observed so far (N)", one line each with the robot count, this robot's own figure ("No evidence yet" when it has none) and the pit claim. One observed failure moves an answer back up for every robot.

## Verification

- `tests/scouting-practice-dom.test.js` (8): twelve practice matches typed twelve ways for one robot are twelve records; bare `practice` refused, then saved with a number; duplicate caught in the form, next match accepted; assignment key `P7` kept and synced, and `pm7` with the same assignment refused by the fixture rule; SavedBar from the Teams tab through synced, Show it, Dismiss; a server-refused save reads "Not synced"; team card ordering and its positive control. Permissive mutants (practice canonicalization removed; assignment-key and duplicate checks removed) fail 4 and 2 of these.
- `tests/scouting-spread.test.js` (11), provenance (+5) and schedule (+3) unit tests, each shared/refused case driven the other way on the same fixture.
- `tests/scouting-dom.test.js`: the pasted-schedule test raced the roster load (failed 4 of 5 runs on a clean HEAD copy); it now waits for the roster as its second half already did.
- `tools/e2e/features/scouting.mjs`: a new step at 375 and 1440 (saved bar inside the viewport after saving from a team card, two practice records, bare label refused, card order checked against an oracle computed from the store).

Not verified: real phones, a native `<dialog>` on iOS, and live Supabase. No SQL changed; the live database was not touched.
