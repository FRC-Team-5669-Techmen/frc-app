---
title: "Reviewed backup recovery and interruption-safe draft editing"
date: 2026-10-21
branches: [codex/scouting-2026-evidence]
commits: []
migrations: []
subsystems: ["Scouting", "Fixture mode"]
---

Continued after the explicit request for at least another hour of implementation and testing. Added a reviewed same-member/event pending-save recovery flow from existing event exports. Original operation IDs and request bodies remain immutable; a single IndexedDB transaction rechecks collisions and inserts held proposals. No cache, permission hint, draft or alleged receipt is trusted from an archive. Recovered proposals stay out of evidence views until SQL confirms them. Release is a separate per-save action; rejected requests remain reviewable/exportable and can be explicitly removed.

Fixed stale draft-success messages in match entry and assignment planning, froze match fields during durable submission and blocked duplicate submission handlers. Form, pick-list and planner draft-read errors now pause editing until retry succeeds, preserving unread local work. Queue refreshes do not replace newly enqueued work with an older synchronization snapshot.

`docs/scouting/RECOVERY.md` records acceptance expectations written before implementation. The retained suites cover scope mutations, atomic rollback, cross-tab collisions, lost-response receipts, held work, explicit release and invalid domain requests through actual local PostgreSQL. The PWA harness also accepts an optional measured-duration offline/reload/reconnect soak; synthetic Auth and emulated phone dimensions remain explicit. Final executed results and external acceptance blockers belong in VERIFICATION.md/RESUME.md. No migration, production action or real notification was authorized or performed.
