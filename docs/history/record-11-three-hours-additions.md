---
title: "Three hours additions: category picker order, 10h session cap, logged-hours corrections"
date: 2026-06-25
branches: []
commits: ["418fe16"]
migrations: ["logged_hours_corrections.sql"]
subsystems: ["Hours and attendance"]
record_order: 40
---

 Earlier same day — Three hours additions. (1) Manual Log Hours category picker order fixed to Build/Volunteer/Outreach/Competition (LogHoursPage TYPES; picker already existed, wired to logged_hours.type). (2) Forgot-to-sign-out cap raised + renamed: hoursUtils now MAX_SESSION_HOURS=10 (the one knob, derives MAX_SESSION_MS) — was a 4h MAX_SESSION_MS. (3) NEW logged-hours correction requests — supabase/logged_hours_corrections.sql (table + RLS member-own/staff-all + request_logged_hours_correction/resolve_logged_hours_correction SECURITY DEFINER RPCs); Request-correction modal per verified entry on LogHoursPage, Logged-Hours Corrections queue on VerifyHoursPage. Run logged_hours_corrections.sql in the SQL editor before testing.