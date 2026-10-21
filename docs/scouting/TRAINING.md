# Scout Lab: beginner practice and mentor assessment

The in-app Practice tab is a three-hour **activity plan**, not a short quiz or a certification exam. Its eight missions combine 27 interactive decisions, six written robot-tracking simulations, partner work, real-footage practice, recovery drills and a strategy scrimmage. The app records practice and review history; a mentor assesses proficiency. Official certification remains in IDEA Classroom.

These are proposed Techmen facilitation guidelines. They are not verified TideScout training practices, measured student completion times, or user-supplied passing thresholds. Adapt pacing to the student; do not reward guessing, rushing or merely leaving a screen open.

## Prepare the session

Use an approved training event. Have each student sign in on the phone they will use, open the event online and verify the local-storage instructions. Prepare pairs, headphones where appropriate, and a way for the mentor to inspect exported practice records. Never request real Discord delivery for these exercises.

Choose the actual recordings before the student begins the assessment. Freeze their URLs, event/match identifiers, assigned robot, observable intervals and independent expected answers. Include a clear success, an observed failed attempt, a blocked view, a non-attempt, a disagreement and a correction. Prefer a second annotator who has not seen the app output. If evidence is ambiguous, the expected answer must preserve that ambiguity. No real corpus has been independently annotated in this implementation run; synthetic examples do not fill that gap.

Uncached external videos need connectivity; the app does not download them. Written exercises and prepared scouting data are available offline. Confirm authorized footage availability before taking the session offline.

| Mission | Planned minutes | Meaningful practice | Evidence to bring to review |
| --- | ---: | --- | --- |
| See it. Record it. | 15 | Sort six evidence types; partner describes visible, blocked and absent actions | Explain why a claim, official alliance total and estimate cannot fill an unseen observation |
| A useful pit conversation | 20 | Four decisions; conduct two respectful interviews, including a team busy with repairs | Current robot claims, change since last event, location/source and a useful neutral note |
| One robot, one match | 25 | Follow all six written simulations; review three mentor-selected recordings with a partner | Time-specific answers and uncertainty; no invented individual FUEL totals |
| Scout This: film room | 25 | Review three matches of one robot; identify the actual source event; compare interpretations | Source links/match identity, supporting timestamps, one unresolved question |
| Beat a bad connection | 20 | In the training event, save offline, reload/reopen, reconnect and check one record; try conflicting edits | Explain local/synchronized/delivered, immutable retry, explicit conflict review and backup |
| Build a defensible pick list | 25 | Independently rank six fictional teams; compare with two partners; preview/cancel/apply three-team order | Defend a choice from evidence, expose thin support and explain a tie/DNP vote |
| Stands to pits | 15 | Three robot-focused requests; another partner restates the intended question and replies | Specific team/match/action, uncertainty, respectful wording and a closed communication loop |
| Your practice scrimmage | 35 | Independently scout six preselected recordings without pausing the first viewing; review, correct and reason about a list | Frozen first passes, separate review history, sources/timestamps and exported practice packet |

Planned total: **180 minutes**. Activities can overlap or take longer. The app deliberately exports `measuredPracticeTime: null`; it cannot claim how long a student practiced or whether a partner/mentor was actually present.

## Protect the first attempt

In the Real footage workbook, identify the source and record the independent first pass before discussing the key. Freeze it. Later discussion records separate reviewed answers and supporting notes; it does not rewrite the frozen attempt. Missing answers remain unrecorded, and Did Not See remains distinct from No. A mistaken source identity requires a new entry plus an explanation.

The workbook is practice only and does not enter competition percentages. Discussion checkboxes are self-reports, not verified mentor signatures. Review history records what the student entered; it is not an automatic accuracy grade. Export waits for durable progress and explicitly states that no certification is awarded. Changing a mission's required answer, reflection or activity acknowledgment withdraws completion until the student records the revised practice.

## Proposed mentor review rubric

For each criterion, record **not yet observed**, **needs coaching**, or **independent**, with a source/timestamp or concrete action. Do not invent a numerical certification cutoff. The mentor decides readiness and records the official outcome in IDEA Classroom.

| Criterion | What the mentor should independently observe |
| --- | --- |
| Identity and provenance | Correct event, robot and actual observed match; older footage is clearly labeled; no upcoming-match identity substituted for source footage |
| Evidence judgment | Claims, observations, official alliance results and estimates stay separate; blocked/non-attempt evidence is never fabricated into a failure or a success |
| Attention and repeatability | The student follows one robot through an uninterrupted viewing and can locate the evidence again; disagreements lead to review rather than invented consensus |
| Correction | A consequential mistake is identified, corrected with supporting evidence and preserved in the original/review history |
| Recovery | The student can explain and demonstrate local save, synchronization, failed/uncertain delivery, reload recovery, one logical record and conflict resolution |
| Communication | Robot-focused, respectful, time-specific request; uncertainty is clear; no other students' personal information or invented cause |
| Strategy reasoning | A pick choice uses evidence, role fit, support and uncertainty; EPA is an estimate; DNP votes and missing ranks are explained honestly |
| Independence | The core task succeeds on the student's real phone with recorded help/errors; the student asks for clarification when the evidence cannot support a claim |

Use `FIELD_ACCEPTANCE.csv` to record actual devices, build, time, errors, assistance, sources and outcomes. A scripted browser run verifies software behavior, never this rubric. If a criterion needs coaching, assign a focused exercise and reassess with different pre-annotated footage. Preserve the original attempt so improvement is visible.
