---
title: "Hour category system across check-in and the hours boards"
date: 2026-06-24
branches: []
commits: ["24e0eb7", "0fab62a"]
migrations: ["hour_categories.sql"]
subsystems: ["Hours and attendance"]
record_order: 46
---

 Earlier same day — Hour category system — supersedes the standalone volunteer-hours fix. attendance_events.category widened to 6 categories build(default)/outreach/volunteer/competition/fundraising/mentoring via supabase/hour_categories.sql (migrates legacy 'normal'→'build', backfills location='fll-room'→'volunteer', new 6-value check constraint; old attendance_category.sql + volunteer_hours_backfill.sql removed/superseded). New src/categories.js source-of-truth (kept light so /checkin imports it without hoursUtils). /checkin confirm screen has a category picker (default build); /checkin-volunteer hardcodes volunteer. buildBreakdown/sumBreakdown are category-driven (logged_hours folded via loggedTypeToCategory); Team Hours shows a category totals strip + grand total, per-category by-member columns, drill-down category breakdown + per-session category tags, CSV by category; Matrix now = total attendance (all categories). My Hours by-category breakdown + tagged recent sessions.