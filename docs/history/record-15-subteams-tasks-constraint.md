---
title: "Subteam vocabulary: remaining non-canonical paths closed, tasks.subteam constrained"
date: 2026-08-17
branches: []
commits: ["bf2deff", "39ffc1e"]
migrations: ["subteams_tasks_constraint.sql"]
subsystems: ["Subteams", "Jobs"]
record_order: 36
---

 Earlier — Subteam vocabulary — closed remaining non-canonical paths. NEW supabase/subteams_tasks_constraint.sql: audits distinct tasks.subteam + profiles.subteams values as result grids (no writes to profiles — report only, staff decide), then adds tasks_subteam_values_chk to the canonical 10 (nullable-aware, same NOT-VALID-if-non-canonical-rows pattern as subteams_vocabulary.sql). JobsPage's job-creation subteam field is now a real `<select>` over src/subteams.js instead of a free-text input + datalist; editing a job already holding a non-canonical value keeps that value selectable+selected (no silent retag on unrelated edits), new jobs get canonical values only. profiles.subteams intentionally still has no DB constraint. Confirmed no other writer to tasks.subteam or profiles.subteams exists outside JobsPage.jsx / ProfilePage.jsx, both already importing SUBTEAMS from src/subteams.js. Run subteams_tasks_constraint.sql in the SQL editor before relying on the new constraint.