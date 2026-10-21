---
title: "Event scouting with durable capture and explicit evidence provenance"
date: 2026-10-20
branches: [codex/scouting-2026-evidence]
commits: [d552eaf, 459ac7d]
migrations: [supabase/migrations/0022_scouting.sql, supabase/migrations/0022_scouting_rls_test.sql]
subsystems: ["Scouting", "Connector", "Fixture mode"]
---

Implemented event-linked scouting inside the existing app, preserving its minimal check-in routes and certification authority. Claims, observations, official alliance results, estimates and rankings remain distinct. Immutable operation IDs, actor checks, version checks and stored revisions make retries and corrections auditable. The connector uses the same save functions; external delivery remains separate from data synchronization.

The source reconstruction pins the May 5, 2026 video metadata and official REBUILT TU22 manual, while keeping the unobserved original audio/frames and undisclosed ranking formula explicit. Techmen uses documented substitute formulas with independent hand-calculated fixtures. The training path prepares mentor review without granting official certifications.

Actual verification and limitations are recorded in docs/scouting/VERIFICATION.md, with per-runtime details beside it. The native browser environment refused local sockets, and automatic approval review rejected escalation. GitHub read access worked but branch creation returned HTTP403, while shell push lacked credentials; no PR, live SQL mutation, real Discord notification or production deployment occurred. Portable checkpoints contain the full source and Git history for another coding agent.

Continued October 21: added reviewed shift planning and eligible rosters, separately attributed pit replies, comparison evidence, pit-location freshness, 27 interactive decisions, six written match scenarios and a footage workbook. Drafts persist across interruptions; completed assignments open corrections; account changes cannot cause an automatic sync loop. The portable review embeds the actual route and fictional backend. Final local checks: 918 tests across 58 files, production build, connector/design/calendar/history gates, 13 math oracles, and 62 scouting SQL checks plus 15 permissive mutants (563 SQL checks overall in PostgreSQL WASM). Browser, native database, staging and field acceptance remain open.

Further reliability review: complete JSON recovery exports include pending work, receipts, draft forms and practice, with account/event isolation. Reviewed team imports enqueue atomically. Prior-event footage has explicit provenance and is excluded from current-event percentages. Known TBA full keys and short current-event labels share one logical match across uniqueness, calculations and planning. Coverage finds missing/disputed evidence. Offline opening skips remote data reads. Final resumed verification: 934 unit/DOM tests in 61 files, 72 scouting SQL checks, 17 permissive mutants, 573 total SQL checks in PostgreSQL WASM, build/connector/design/calendar/history/oracle checks and compiled portable review passed. Native browser/phone, staging, original video-source fidelity and remote publication remain explicitly open.
