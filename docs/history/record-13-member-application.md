---
title: "Member application: per-season authenticated onboarding form and staff view"
date: 2026-08-17
branches: []
commits: ["ee72469", "daddea7", "c457fe6", "947062a"]
migrations: ["member_applications.sql", "member_applications_rls_test.sql"]
subsystems: ["Member application"]
record_order: 38
---

 Earlier — Member application — NEW supabase/member_applications.sql + supabase/member_applications_rls_test.sql + src/MemberApplication.jsx/.css + src/ApplicationsPage.jsx/.css + src/seasons.js. Per-season authenticated onboarding form replacing the Google Form, rendered in the AccessGate slot in App.jsx (member track only — staff/parent-only skipped; /checkin* let through; fails open if the table query errors). One row per member per season, contact fields deliberately NOT on profiles; RLS insert-own / select own-or-staff / no update-or-delete policy (corrections via SECURITY DEFINER, today just staff_set_discord_confirmed) + explicit anon revoke, with a rollback-safe mutation test. Writes only nickname/grad_year/shirt_size to profiles (never subteams/disciplines); prior experience creates no member_skills. Staff /applications page + client-side CSV, NavBar People group + APPS context tag; ProfilePage SHIRT_SIZES gained 3XL to match the form. Run member_applications.sql before testing. OPEN: MEETING_SCHEDULE's build-season line is a TODO placeholder.