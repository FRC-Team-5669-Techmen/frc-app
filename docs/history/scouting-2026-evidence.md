---
title: "Event scouting with durable capture and explicit evidence provenance"
date: 2026-10-20
branches: [codex/scouting-2026-evidence]
commits: []
migrations: [supabase/migrations/0022_scouting.sql, supabase/migrations/0022_scouting_rls_test.sql]
subsystems: ["Scouting", "Connector", "Fixture mode"]
---

Implemented event-linked scouting inside the existing app, preserving its minimal check-in routes and certification authority. Claims, observations, official alliance results, estimates and rankings remain distinct. Immutable operation IDs, actor checks, version checks and stored revisions make retries and corrections auditable. The connector uses the same save functions; external delivery remains separate from data synchronization.

The source reconstruction pins the May 5, 2026 video metadata and official REBUILT TU22 manual, while keeping the unobserved original audio/frames and undisclosed ranking formula explicit. Techmen uses documented substitute formulas with independent hand-calculated fixtures. The training path prepares mentor review without granting official certifications.

Actual verification and limitations are recorded in docs/scouting/VERIFICATION.md, with per-runtime details beside it. The native browser environment refused local sockets, and automatic approval review rejected escalation. GitHub read access worked but branch creation returned HTTP403, while shell push lacked credentials; no PR, live SQL mutation, real Discord notification or production deployment occurred. Portable checkpoints contain the full source and Git history for another coding agent.
