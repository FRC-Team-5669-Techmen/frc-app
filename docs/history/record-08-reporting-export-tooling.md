---
title: "Reporting and export tooling at /reports"
date: 2026-06-24
branches: []
commits: ["2e46968"]
migrations: []
subsystems: ["Hours and attendance"]
record_order: 43
---

 Earlier same day — Reporting/export tooling — /reports ReportsPage + pure src/reporting.js, staff-only. Reads both hour sources (capped attendance sessions + verified logged_hours), flags wasCapped/manual_entry/review as columns. Per-event rollups (hours tied to events by date/time-window match — no schema change/link column), Exports (filter student/date/category/event, per-student & team, CSV + print-to-PDF), Service-hour letters (printable PDF — name/total/category breakdown/range/team id + itemized appendix + signature line; service cats default volunteer/outreach/fundraising). PDF via print window (window.open+print), no PDF dep. Route /reports + NavBar STAFF link + REPORTS context tag.