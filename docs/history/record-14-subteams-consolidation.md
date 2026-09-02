---
title: "Subteam vocabulary consolidated into src/subteams.js"
date: 2026-08-17
branches: []
commits: ["ee0c822"]
migrations: ["subteams_vocabulary.sql"]
subsystems: ["Subteams"]
record_order: 37
---

 Earlier — Subteam vocabulary consolidation — NEW src/subteams.js + supabase/subteams_vocabulary.sql. The list was duplicated in three divergent copies (ProfilePage 8 values, JobsPage mirroring them, MemberApplication a DIFFERENT 8-value taxonomy also pinned by member_applications_subteam_values_chk); all three now import the shared module. Canonical = the ProfilePage 8 unchanged + 'Robot Construction' + 'Field & Pit' = 10; existing strings preserved byte-for-byte because profiles.subteams keys off them with no DB constraint. subteams_vocabulary.sql drops/recreates the member_applications CHECK to the 10 values, NOT VALID when pre-existing rows carry the old taxonomy (no lossless remap — 'Mechanical Design (CAD)' straddles Mechanical and CAD — so historical answers are left alone; validate by hand later). member_applications.sql's inline constraint block was re-pinned to match so a fresh install and the migration agree, and the RLS test fixtures were moved to canonical values (run subteams_vocabulary.sql BEFORE the test). All grouping/sort consumers verified data-driven (presence.js/PresenceBoard, RosterPage, JobsPage, HomePage, ParentHomePage, MemberPage, readiness_summary) — no hard-coded ordering/color/icon/switch keyed to the old 8, so nothing needed extending. FLAG: tasks.subteam is free text with no constraint, so job subteams remain an untraceable value source.