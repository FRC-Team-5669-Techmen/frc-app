---
title: "Navigation restructure: hours and skills tools co-located, staff menu regrouped, kiosk removed"
date: 2026-06-24
branches: []
commits: ["c5ce606"]
migrations: []
subsystems: ["Navigation"]
record_order: 41
---

 Earlier — Navigation restructure — co-located the hours/skills admin tools into their top-row dropdowns and regrouped the avatar staff menu; no page internals or gates changed except three allowed fixes. Hours ▾ = My Hours / Log Hours / (staff divider) Team Hours / Verify Hours / Reports (Verify+Reports staff-only); Skills became a staff dropdown (Catalog/Certify/Coverage), plain link for non-staff. Avatar staff menu: Readiness on top, then People (Roster [isAdmin-only] / Access Requests [badge] / Squad) and Live (Activity / Display); removed Verify Hours/Reports/Certify/Coverage from there. Fixes: ReadinessPage roster-approvals link gated to isAdmin; CoverageMatrix member names link to /members/:id (de-orphaned); Kiosk fully deleted (route/import/page/css/nav/context-tag).