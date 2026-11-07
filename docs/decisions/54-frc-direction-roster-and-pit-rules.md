# 54 Which participation and pit-strength rules should the active roster and event planner use?
- Raised: 2026-11-06 by job codex-frc-direction, auditing the requests from 2026-09-30 through 2026-10-28.
- Status: open
- Default if nobody decides: Keep the existing handbook standing evaluation and admin-confirmed removal. Event assignments remain staff decisions with the existing rotation warnings. No new automatic removal, eligibility block, strength label or hour-based assignment is introduced by this bundle. These are the next unfinished items, after completing approved sign-out.
- Decided: --

## What is actually true right now

`0015_member_standing.sql` evaluates completed work weeks and months, proposes removal after probation, and changes status only through `admin_confirm_standing`. `0044` adds a mass-change hold. This is not automatic folding out of the active team with a mentor override. Decision 07 separately covers what removal means for access; automatic list membership should not silently become account deletion or access revocation.

The role board already permits any number of requests and assignments, backups and overfilling without eligibility blocking. `src/roleRules.js` warns about role runs longer than two slots and assigned non-drive members with no scouting slot. Neither the board data nor its member picker defines a newer student, a strong pit member, or a shop-hour weight for high-responsibility roles. The picker sorts names alphabetically. The lunch template provides two pit-watch shifts, not an automatic staffing guarantee.

## The decisions

1. Should automatic folding use the existing probation-failure rule, or a separate number of completed work weeks without participation? Should a mentor override expire at the next review, or remain until withdrawn? Keep work-break weeks and excused absences out of the count under either rule.
2. Who counts as a strong pit member: a mentor-maintained designation, specific current certifications, or shop hours? What defines newer, and which two strong members must be physically present in each newer member's pit slot?
3. Which roles are high responsibility, and should verified current-season build hours order recommendations, break ties, or contribute a specified weight? Keep all assignments possible and show the reason for every recommendation.

A separate established question remains decision 52: whether match performance changes Driver Score. It currently appears in match trends without changing the score.
