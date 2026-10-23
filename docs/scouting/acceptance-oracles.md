# Scouting acceptance oracles

Specified October 20, 2026, separately from the implementation. These are acceptance requirements and hand-calculated examples, **not a test-execution report**. The executable test suite and `VERIFICATION.md` must identify which were actually exercised. The retained hand-example check is `node docs/scouting/check-oracles.mjs`; it covers synthetic arithmetic and does not replace workflow or device testing. Labels and sources are in [EVIDENCE.md](EVIDENCE.md).

## Data meaning

Pit claims, match observations, official results, statistical estimates and derived rankings are distinct evidence classes. Every correction retains its original author and prior version. Source event and observed match must remain explicit for footage from another event. Missing answers are absent; `did_not_see` is an explicit observation limitation; `not_applicable` is an explicit non-applicability judgment; `no` is an observed failure to perform the specified capability. None substitutes for another. A future numeric measurement must distinguish observed zero from null/absent. This module does not claim accurate individual FUEL counting by eye.

## A1: capability reliability

**Techmen rule, not a recovered 4414 formula.** For one event/team/capability, retain the newest correction from each author for each match. Collapse observations into a single match outcome:

- Yes and no both present: disputed, not a numeric trial.
- At least one yes and no no: one yes trial.
- At least one no and no yes: one no trial.
- No decisive yes/no: no numeric trial. Preserve counts of unseen, N/A and missing answers.

`trials = yes_matches + no_matches`. `reliability = yes_matches / trials`. If trials is zero, the result is null, not zero. Fewer than three decisive matches is provisional. Three is a Techmen display threshold, not a statistical guarantee. Different scouts watching the same match do not create independent trials. Conflicting evidence stays visible; it is never silently adjudicated by majority vote.

Hand fixture, all rows for synthetic team 101 in synthetic event `fixture-rebuilt`:

| Match | Scout A | Scout B | Decisive match result |
| --- | --- | --- | --- |
| qm1 | yes | yes | yes, one trial |
| qm2 | no | did_not_see | no, one trial |
| qm3 | yes | no | disputed, excluded |
| qm4 | not_applicable | missing | unknown, excluded |
| qm5 | yes | missing | yes, one trial |

Expected: `yes=2`, `no=1`, `trials=3`, `disputed=1`, `reliability=2/3`, display about `66.7%`, sufficient threshold met. A correction from A on qm2 to yes changes the result to `3/3=100%`; it does not add a fourth trial. Ten retries of that correction leave all counts unchanged. Removing qm5 yields `1/2=50%`, provisional. Only qm4 yields null, never 0%. A single no yields exactly 0% with one trial, a useful positive control for the distinction.

Acceptance must check both numeric result and excluded evidence counts. Permission tests must show an author can correct their own observation and cannot alter someone else's.

## A2: assignments and observation persistence

A manager assigns a synthetic member to team 101, match qm1. The assignment appears in that member's queue. An eligible scout captures an attributed live observation; a video observation preserves an HTTPS recording URL and match identity. A non-manager cannot create or reassign work through browser, direct RPC or connector. Parent-only users see no scouting data; parent plus staff receives staff access.

Interruption cases use the same immutable operation ID and body:

1. Queue locally, close/reopen browser, verify the full proposal survives.
2. Server commits but response is lost; retry returns the original record/version, one revision and one logical record.
3. Same operation ID with changed body is rejected, preserving original result.
4. Two edits from version 1: first wins version 2; second receives conflict and retains its local proposal. No last-write-wins data loss.
5. Permission is revoked before synchronization: preserve failed local proposal and do not falsely report synchronized.
6. Sign out and sign in as another member: the second account cannot see or send the first account's queue/cache.
7. Storage failure/quota error must be visible; “saved locally” requires a successful durable write.

Cache an event before a venue visit. Offline capture depends on previously loaded app assets, identity and event data. First-ever offline login, downloading uncached footage and reaching Discord are not offline capabilities. A failed refresh preserves the previous cache with its age instead of replacing it with an empty result.

## A3: pit communication and delivery

A team-specific question is saved before notification is attempted. Test successful delivery against explicit failure controls: not configured, HTTP rejection, timeout after possible acceptance, expired authentication, and competing dispatchers. A successful saved record is never removed because delivery failed.

The interface distinguishes local queue, synchronized question and delivery receipt. On uncertain network delivery, report uncertainty and require an explicit recovery decision, because automatic resend can duplicate a real Discord message. Concurrent dispatch attempts must not both send the same message/version. Suppress user-controlled mentions and validate notes as robot/strategy information. No real Discord test messages are authorized in this task.

A pit location from an API is labeled with its provider and fetch time. A manual entry is labeled manual. An absent or stale location is visible; AI must not invent coordinates. A missing provider response never erases a working manually entered pit location.

## A4: ranking and filters

**Techmen rule, deliberate deviation:** preserve all votes; do not remove outliers. For each team, use one latest list per event/author. Unranked means no vote. For numeric tiers, compute the median tier and the median supplied within-tier rank. With an even count the median averages the two middle values. DNP votes are reported separately as `dnpVotes / support`; they do not receive a fabricated numeric strength. If only DNP votes exist, the team is in the DNP group. Sort numeric medians ascending, then median rank ascending, then team number as a deterministic display tie-break. Numeric halves such as tier 1.5 are valid aggregate summaries, not silently rounded user choices.

| Synthetic team | Latest votes | Median tier | Median rank | Support | DNP fraction |
| --- | --- | --- | --- | --- | --- |
| 101 | (1,1), (2,2), (3,4) | 2 | 2 | 3 | 0/3 |
| 202 | (1,2), (1,4), DNP | 1 | 3 | 3 | 1/3 |
| 303 | (1,1), (2,5) | 1.5 | 3 | 2 | 0/2 |
| 404 | DNP, DNP | DNP | null | 2 | 2/2 |
| 505 | (2,2), (2,2) | 2 | 2 | 2 | 0/2 |
| 606 | no entries | absent | absent | 0 | absent |

Expected order: **202, 303, 101, 505, 404**. Team 606 is not fabricated into the list. The tie between 101 and 505 uses team number, not invented evidence of strength. The extreme numeric tier 3 for team 101 remains included; no record is deleted as an outlier. A DNP majority with one numeric-tier vote remains numerically ranked with its DNP fraction prominently visible; this is a consequence of having no arbitrary veto threshold and should be reviewed by strategy leadership.

Filters must separate claimed capability from observed reliability. Unknown EPA does not become zero and cannot satisfy a numerical minimum. Known EPA exactly at a minimum passes; lower EPA fails. Unknown pit claim does not satisfy a required yes capability. Empty filter results provide a reset path. Stale API estimates retain their timestamps.

## A5: comparison preview/apply

Take the user's ordered list `[101, 202, 303, 404, 505]`. Select 202, 404, 505. Ask the three unordered pairs once each. Wins: 404 over 202, 505 over 202, 404 over 505. Totals are 404=2, 505=1, 202=0. Proposed list is `[101, 404, 303, 505, 202]`; only the selected original positions change. Slot tier/rank values remain attached to positions. Cancel produces zero writes; apply produces one version-checked list revision.

For a cycle, 202 beats 404, 404 beats 505, 505 beats 202: all have one win and the original order stays unchanged. Duplicate teams, unknown teams, contradictory duplicate votes and self-pairs must not produce an accepted ranking. A stale list version refuses apply and retains a reviewable proposal. Preview itself never saves. The process is not labeled Elo.

## A6: REBUILT match fields (added 2026-10-23, ledger 0017)

**Techmen rule.** One value per match, then a median over matches. Synthetic team 101:

| Match | Scout A | Scout B | Match value |
| --- | --- | --- | --- |
| qm1 | auto 2, teleop 10, TOWER level 2, stuck no | auto 4, teleop 20, TOWER level 2, stuck yes | teleop 15; total median(12, 24) = 18; stuck disputed |
| qm2 | teleop 0, TOWER level 3, stuck no | (none) | teleop 0 (observed); total 0 |
| qm3 | TOWER did not see, stuck did not see | (none) | no TOWER level; stuck not decisive |

Expected: median teleop FUEL `median(15, 0) = 7.5` over 2 matches; median auto FUEL `3` over 1 match (qm2 has no auto recorded, which is not 0); median total FUEL `median(18, 0) = 9`; best TOWER level 3, median TOWER `2.5` over 2 matches (did not see is not level 0); stuck `0/1` with 1 disputed and 1 unseen. A correction from scout A on qm1 to teleop 30 makes qm1 `25` and the median `12.5`. A team with only an empty match object has `matches = 0` and every median null. A filter "median FUEL at least 15" never passes a team with no FUEL recorded.

## Independent recording corpus and human validation gate

**Not completed.** No original match recordings were successfully accessed and independently annotated in this run. Synthetic fixtures above were specified independently of implementation but cannot prove that scouts accurately judge real matches. Do not relabel them as annotated recordings or real-device results.

Before claiming field readiness, select and freeze three real 2026 recordings with stable URLs and match IDs: one clear capability demonstration, one visibly unsuccessful attempt and one obscured/ambiguous view. Record team, capability, exact time interval, independent annotator and expected answer before testing the app against them. Have a second observer resolve disagreements without inspecting app output. Preserve “did not see” whenever footage cannot support a conclusion. The fixed corpus must include a correction and a multi-scout disagreement.

For real iPhone and Android testing, record device/OS/browser, app build, network conditions, task completion time, taps, errors and recovery. Use first-time student scouts for usability claims. Test background/lock/reopen, offline capture, reconnect, duplicate taps and account switching. Browser tests at 375 and 1440 pixels establish layout and emulated interactions only. A goal for speed is not a measured result; no time target or certification cutoff is claimed to have been supplied by the user.
