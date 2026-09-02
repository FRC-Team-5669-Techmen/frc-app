---
title: "Accountability and eligibility tooling: goals, anomalies, days present"
date: 2026-06-24
branches: []
commits: ["cf36990"]
migrations: ["accountability.sql"]
subsystems: ["Hours and attendance"]
record_order: 44
---

 Earlier same day — Accountability/eligibility tooling — supabase/accountability.sql + src/accountability.js. hour_goals (team default + per-member override, per season, optional category subset) with set_hour_goal/clear_hour_goal RPCs; My Hours goal progress bar + Days-present; HoursBoard Goals/who's-behind view (sorted by gap, staff GoalEditor) + Days column. Anomaly detection detectAnomalies (double_in/overlap/capped/geofence) surfaced as an advisory Attendance Anomalies list on VerifyHoursPage; attendance_events.geo_ok col set at check-in. daysPresent = distinct days with an IN, shown separately from hours.