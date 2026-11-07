# 53 A pause button for hours?
- Raised: 2026-10-28 from member feedback about pausing for non-FRC work.
- Status: decided
- Default if nobody decides: superseded by the explicit task authorization below.
- Decided: 2026-11-06, Mr. Pina explicitly requested pause/resume in codex-frc-feedback.

Use option 2: a member can pause credited time while keeping the extended session open. Paused minutes are excluded, visible in hours history and on presence/sign-out surfaces. Ordinary FRC breaks may stay inside the session. A pause never grants permission to leave: the existing note, cleanup and mentor-approved build sign-out remain required. The server owns interval times and the member cannot edit history.

Before this authorization the default was no pause, because stopping and restarting a session could bypass sign-out approval. Keeping physical presence and credited time separate resolves that concern. Implemented by migration 0048 and the dashboard control; SQL boundaries, shared accounting and the approval flow have retained regressions.
