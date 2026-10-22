---
title: "Reviewed backup recovery and interruption-safe draft editing"
date: 2026-10-21
branches: [codex/scouting-2026-evidence]
commits: [254d69e, 3828e86, f3518cf, 6b7feaa]
migrations: []
subsystems: ["Scouting", "Fixture mode"]
---

Continued after the explicit request for at least another hour of implementation and testing. Added a reviewed same-member/event pending-save recovery flow from existing event exports. Original operation IDs and request bodies remain immutable; a single IndexedDB transaction rechecks collisions and inserts held proposals. No cache, permission hint, draft or alleged receipt is trusted from an archive. Recovered proposals stay out of evidence views until SQL confirms them. Release is a separate per-save action; rejected requests remain reviewable/exportable and can be explicitly removed.

Fixed stale draft-success messages in match entry and assignment planning, froze match fields during durable submission and blocked duplicate submission handlers. Form, pick-list and planner draft-read errors now pause editing until retry succeeds, preserving unread local work. Queue refreshes do not replace newly enqueued work with an older synchronization snapshot.

`docs/scouting/RECOVERY.md` records acceptance expectations written before implementation. The retained suites cover scope mutations, atomic rollback, cross-tab collisions, lost-response receipts, held work, explicit release and invalid domain requests through actual local PostgreSQL. The PWA harness also accepts an optional measured-duration offline/reload/reconnect soak; synthetic Auth and emulated phone dimensions remain explicit. Final executed results and external acceptance blockers belong in VERIFICATION.md/RESUME.md. No migration, production action or real notification was authorized or performed.

Independent keyboard review found Escape left focus on the document body; native dialog cleanup now restores the opener. A synthetic 120-team case verified complete 1,682-row caches/exports and exposed expensive initial card rendering. Cards now page 30 at a time, retaining full-roster search and complete mathematical inputs. The external axe audit and synthetic-volume harness remain reproducible, with manual/real-device limitations explicit.

Fetched newer remote main `0a11c52` during the run and merged its public-handbook/family-link changes into the review branch (`f3518cf`), preserving both histories. The merge passed connector generation checks; final affected browser and application gates are recorded in VERIFICATION.md. No main push or unrelated feature rewrite occurred.
