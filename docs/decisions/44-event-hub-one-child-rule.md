# 44 What exactly does the one-child rule require of the carpool, and may a student hold one seat in a car that needs two?
- Raised: 2026-10-05 by the event family hub session (ledger 0003), from Mr. Pina's "bring back the one child salesian rule. it is being enforced"
- Status: open
- Default if nobody decides: the rule is ALWAYS ON for every event (migration 0008 makes it a database constraint), it is read as Archdiocese of Los Angeles handbook 12.3.2 was read in 0005, a family cannot take the first seat in an empty car that needs two, and a mentor seats the first two students together from the mentor page.

## What is actually true right now

- **The rule was never off.** 0005 enforced it per event (`hub_events.one_minor_rule`, default true) and the Beach Blitz seed (0006) set it true. What families could not see was the rule itself: the family page never stated it, and the mentor page showed it as a switch.
- **0008 makes it permanent.** Every event is switched on and `hub_events_one_minor_rule_on` refuses switching one off. The mentor page shows "One-child rule: always on" with no switch, and the family page states the rule at the top of Rides, in the (i) cards and on every car it applies to.
- **How it is read** (unchanged from 0005): no adult may be alone in a vehicle with a single minor who is not their own child. A car with the driver's own student aboard may take one more. A car without the driver's own student (a mentor's van, or, since 0008, a parent driving other students without their own) takes zero students or two or more, never one.
- **Where it is enforced:** a claim that would put one student alone in such a car is refused; a rider leaving such a car so that one is left is allowed, but the car turns red, mentors are emailed, and it cannot be marked Left until a second rider joins or a mentor records a reason.
- **What 0008 adds:** an empty car that needs two could not be filled at all before (a family's first claim was refused, and a mentor's one-student move needed an override reason that then stayed on the car). `hub_staff_place_pair` seats two students at once and leaves no override. The family page no longer offers a Claim it knows will be refused; that car says "A mentor seats the first two; then you can pick it."

## The options

1. **Keep the default.** Strict, simple to explain, and nothing ever holds one student alone in a car. Cost: a parent offering to drive other students depends on a mentor to seat the first two, and on a busy week that can wait.
2. **Let a student hold the first seat.** The claim is allowed, the car shows "Waiting for a second student" in red and cannot leave until a second joins (the same state a rider leaving already produces). Families fill such cars themselves. Cost: a car can sit with one student in it for days, and the rule is then enforced at departure rather than at sign-up.
3. **Stricter than the handbook reading**, for example two adults in every car, or no student in a car with a non-parent adult at all. Needs the exact policy text; would change who can drive.

## What Mr. Pina's message said

"bring back the one child salesian rule. it is being enforced." The default reads that as: the school enforces it, so the app must, visibly, for every event, with no switch. If he meant something stricter than 12.3.2 as read above, this is the file to correct.
