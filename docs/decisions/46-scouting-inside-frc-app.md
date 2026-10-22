# 46 Scouting belongs in the existing Techmen app

- Status: decided by the implementation handoff, October 20, 2026.
- Decision: lazy-loaded scouting routes use existing members, events, authentication, event roles, per-member capabilities, connector, notices and Techmen plate/theme primitives.
- No replacement application, production deployment or direct live database changes in this delivery. Work is reviewed through a pull request.
- Default where reference details are unknown: use explicitly named Techmen rules, preserve raw evidence and correction history, and report fidelity gaps.
- Offline capture, atomic retries and version conflicts are Techmen reliability requirements, not verified TideScout behaviors.
- The in-app practice path prepares scouts for mentor assessment. Official certifications remain awarded only by IDEA Classroom and mirrored read-only here (decision 27). No new automatic certification threshold is inferred from an incomplete conversation.
