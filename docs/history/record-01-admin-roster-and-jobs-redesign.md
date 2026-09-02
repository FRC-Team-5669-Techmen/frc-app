---
title: "Admin roster reliability, parent link requests, Jobs page redesign and content"
date: 2026-06-18
branches: []
commits: ["53239a3", "64509f9", "792ddfb", "5847824"]
migrations: []
subsystems: ["Roster and access", "Jobs"]
record_order: 50
---

 Earlier — admin roster: reliable role edits via admin_set_member_role RPC, member delete via admin_delete_member, search/sort, nickname display; fixed coverage matrix emptied by selecting non-existent profiles.email; self-service parent link requests + staff approval queue with idempotent approve; Jobs page browse redesign — compact rows + detail modal, search/sort, status color scale, tasks.due_date; jobs content — links/images via first Storage bucket, progress updates, per-job time tracking via attendance_events.job_id, admin undo-completion)
