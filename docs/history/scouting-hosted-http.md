---
title: "Hosted scouting acceptance reveals and fixes PostgREST conflict retries"
date: 2026-10-21
branches: [codex/scouting-2026-evidence]
commits: []
migrations: [supabase/migrations/0022_scouting.sql]
subsystems: ["Scouting", "Fixture mode"]
---

Resumed the existing review branch at f8d6056 after verifying GitHub/npm and actual Supabase HTTPS. Created a data-free hosted branch, verified copied prerequisites, applied scouting and deployed both source Edge directories. Real GoTrue password/refresh JWTs were issued to six SQL-provisioned fictional accounts without email or production data.

Two hosted runs stalled on stale corrections after 32 passing assertions. A diagnostic serialization-only RPC reproduced the failure. Supabase documents the PostgREST 14 infinite-retry defect for application-raised 40001, and the branch reported PostgREST 14.18. Replaced three domain-conflict error codes with PT409 in the unreleased review migration; retained legacy recognition in the client and added both-code queue/recovery tests. SQL expectations, fixture behavior and native races now require PT409.

The corrected hosted suite passed 49 assertions, with three additional revoked-account and three restored-account checks reusing the same JWT. These establish real hosted Auth/REST/Edge authorization/configuration boundaries, not OTP/Google OAuth, successful source imports or actual notifications. The current migration applied twice and passed the guarded 72-check hosted rollback proof. Native PostgreSQL 17.11 separately passed 72 SQL/RLS checks, 17 permissive mutations and seven separate-connection races.

The built-PWA harness now exercises concurrent HTTP correction, the 409 response, durable conflict review, both proposals and explicit application as version three. All harnesses remain in source. Exact executed outcomes, failures and source/runtime boundaries belong to VERIFICATION.md and verification/2026-10-21-http.

Guarded cleanup removed only identified fictional fixtures; all eight data/job/request counters were zero before deleting the branch. Production remained read-only and still has no scouting tables/functions. The original YouTube URL remains blocked at proxy CONNECT 403; TBA/Nexus credentials are inaccessible and public Statbotics returned HTTP 500. Both connected Vercel accounts return a team-scope 403 for the existing project, so a safely isolated shareable app link remains blocked. The owner checklist now names that issue instead of asking for the already-corrected general network setting. No main push, production release, real Discord notification or dependency change occurred.

The broad feature run passed 1800/1801 and exposed a desktop conflict-review race: durable queue status was published before the latest evidence snapshot. A controlled delayed-read DOM test reproduced it, then passed after removing that premature queue publication. Refresh now publishes queue and evidence together. The final unit suite has 1031 tests; the final affected-route 169/169 and built-PWA 33/33 pass, while all 1632 unaffected feature assertions and the original broad failure remain separately recorded.
