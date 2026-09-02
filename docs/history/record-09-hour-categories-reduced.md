---
title: "Hour categories reduced from six to four; volunteering event kind added"
date: 2026-06-24
branches: []
commits: ["699288d"]
migrations: ["categories_reduce_event_kind.sql"]
subsystems: ["Hours and attendance", "Schedule"]
record_order: 42
---

 Earlier same day — Reduced hour categories six→four — dropped fundraising + mentoring from categories.js (+ --hr-* tokens), every picker (checkin chips / LogHoursPage / manual-entry / corrections all iterate CATEGORIES), reporting SERVICE_CATEGORIES, and the attendance_events.category + logged_hours.type check constraints; migration supabase/categories_reduce_event_kind.sql re-tags existing fundraising/mentoring → outreach (flagged: mentoring could fit build better — staff reclassify per-row if needed). Added 'volunteering' as an event kind (SchedulePage KINDS + events_kind_check + .sch-kind-volunteering style; flows through per-event rollups as a text label). Both DB changes are in categories_reduce_event_kind.sql — apply before testing.