---
title: "Admin hours management: per-member edit, add, delete and hour adjustments"
date: 2026-06-25
branches: []
commits: ["69a8d61", "0723025"]
migrations: ["admin_hours_management.sql"]
subsystems: ["Hours and attendance"]
record_order: 39
---

 Earlier — Admin hours management — NEW supabase/admin_hours_management.sql + src/MemberHoursAdmin.jsx/.css. Per-member staff panel at the top of /verify-hours (same view as the correction queues): edit/delete logged_hours (staff_edit_logged_hours/staff_delete_logged_hours), add/edit/delete attendance_events (staff_add_event/staff_set_event[flips in↔out]/reuse staff_void_event, audited), and a NEW hour_adjustments table (member/category/SIGNED hours/reason/created_by/created_at; RLS member-own + staff-all) written via staff_add_hour_adjustment. All SECURITY DEFINER. buildBreakdown gained a 5th `adjustments` param (signed, season-by-created_at) folded per-member in HoursBoard + MyHoursPage; My Hours shows an Hour adjustments card. Run admin_hours_management.sql before testing (depends on session_integrity.sql's attendance_audit + is_staff). NOTE: non-staff Team-board viewers don't see others' adjustments folded (RLS by design).