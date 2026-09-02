---
title: "Calendar Phase 1 views and filters; Phase 2 iCalendar subscription feed"
date: 2026-06-18
branches: []
commits: ["06d3acd", "de7a038"]
migrations: []
subsystems: ["Schedule"]
record_order: 49
---

 Earlier — calendar Phase 1: Agenda/Month/Week views, My-events filter, conflict + FULL capacity signaling on SchedulePage; calendar Phase 2: .ics subscription feed — profiles.calendar_token capability key with client column revoke + get/rotate_calendar_token SECURITY DEFINER RPCs, calendar-feed Edge Function serving RFC 5545 iCalendar (deploy --no-verify-jwt), ProfilePage Calendar subscription section.