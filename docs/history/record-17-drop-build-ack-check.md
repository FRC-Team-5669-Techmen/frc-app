---
title: "Fix member_applications_build_ack_chk breaking every application submission"
date: 2026-08-18
branches: []
commits: ["67ea6ae"]
migrations: ["member_applications_drop_build_ack_chk.sql"]
subsystems: ["Member application"]
record_order: 34
---

 Earlier — Fix member_applications_build_ack_chk breaking every application submission — NEW supabase/member_applications_drop_build_ack_chk.sql, drops the constraint; member_applications.sql's inline constraint block edited to match (no fresh-install drift). Cause: build_season_acknowledged is only rendered/required client-side when BUILD_SEASON_SCHEDULED is true (MEETING_SCHEDULE's build-season line is still the TODO placeholder — that OPEN item is still open), so every submission wrote false and the CHECK (= true unconditionally) rejected all of them. Fix is DB-side on purpose: a CHECK can't see the client's condition, so pinning "must be true" there breaks again the moment that condition changes; enforcement stays in the UI, and a student who applied before the schedule was published honestly gets false, not a coerced true. Audited every other CHECK on member_applications + parent_responses against every client path (initial + returning-member-skip): pathway/subteam-vocab/subteam-distinctness/availability are all select-driven or explicitly validated so they can't fail; conduct_acknowledged is unconditionally rendered+required so its identical "= true" CHECK is safe and was left alone; parent_responses' three enumerated CHECKs are all nullable ("is null or in (...)") with no forced-true case. No other constraint in this class was found. Run supabase/member_applications_drop_build_ack_chk.sql before relying on this.