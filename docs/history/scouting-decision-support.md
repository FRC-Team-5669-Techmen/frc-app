---
title: "Confirmed scouting evidence and reviewed drive-team briefs"
date: 2026-10-21
branches: [codex/scouting-2026-evidence]
commits: []
migrations: []
subsystems: ["Scouting", "Fixture mode"]
---

A pending correction previously replaced its confirmed record before strategy views filtered out local proposals, temporarily removing the existing master vote or coverage evidence. Separate confirmed and optimistic projections preserve the previous evidence until receipt confirmation, including a newer receipt when a subsequent refresh fails. Scope/receipt/recovery exclusions have executable permissive mutation controls and a rendered page regression.

Replaced the newest-30-only observation list with searchable, paged access to every downloaded observation and current/prior/disputed source filters. The same correction and normalized-match selection feeds reliability and dispute triage. Existing author-only correction and revision history remain in a shared evidence component.

Added a local drive-team brief: explicitly entered six-team lineup, opening/roles/endgame/fallback plan, confirmed evidence with unknown/disputed/age indicators, serialized durable drafts, review invalidation and frozen JSON/escaped printable HTML. These are proposed Techmen decisions, not verified TideScout features or win predictions. Acceptance expectations were written before code in DECISION_SUPPORT.md. Browser checks use fictional data and phone viewport emulation; physical devices and drive-team effectiveness remain external gates.

CLAUDE.md and the subsystem/resume documents now describe these surfaces. No schema, production, main, notifications or dependency changes. Exact final verification scopes and initial harness failures are retained in the decision-support evidence folder and VERIFICATION.md.

Further permission review found retained queue receipts could remain visible after a definitive server refusal despite cache reads correctly refusing fallback. The event now shows an explicit access-denied/retry surface while keeping local work intact. Tests cover permission/token/account-change refusal, absence of editing surfaces, restoration and a deliberately permissive denial guard.
