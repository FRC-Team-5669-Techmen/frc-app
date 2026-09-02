---
title: "Jobs creation opened to all members; schedule tabs reordered; Team Hours drill-down"
date: 2026-06-23
branches: []
commits: ["c7ab456"]
migrations: []
subsystems: ["Jobs", "Schedule", "Hours and attendance"]
record_order: 47
---

 Earlier — Jobs creation opened to all members — jobs_open_create.sql `tasks insert own` + `task_skills insert own task` policies, edit/delete still staff-only; SchedulePage view tabs reordered Month/Agenda; Team Hours dropped By-day + Sessions tabs, added per-member/per-day-cell session drill-down modal reading stored attendance_events, and matrix auto-scrolls to today.