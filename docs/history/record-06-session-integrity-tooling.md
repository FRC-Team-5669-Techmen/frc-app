---
title: "Session-integrity tooling: cap, audit trail, manual entry, corrections"
date: 2026-06-24
branches: []
commits: ["3c30eca", "8af9f45"]
migrations: ["session_integrity.sql"]
subsystems: ["Hours and attendance"]
record_order: 45
---

 Earlier same day — Session-integrity tooling — supabase/session_integrity.sql. Forgot-to-sign-out cap at derivation time in hoursUtils (MAX_SESSION_MS 4h + cappedSession, wasCapped flag, no synthetic events; open-under-cap stays live); attendance_audit trail; admin manual entry/edit/void of attendance_events via staff_add_manual_session/staff_edit_event/staff_void_event RPCs + manual_entry col, UI in HoursBoard drill-down AdjustPanel; student session_corrections (request_session_correction/resolve_session_correction) with Flag UI on My Hours + Correction Requests queue on VerifyHoursPage; logged_hours.type aligned to the 6 categories (LogHoursPage).