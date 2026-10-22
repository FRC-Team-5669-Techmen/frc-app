---
title: "Limit the scouting picker to competition events"
date: 2026-10-21
branches: [codex/scouting-2026-evidence]
subsystems: ["Scouting"]
---

After the owner authorized production release, the release workflow merged the scouting branch into main at 20b7e3b. Vercel production deployment dpl_M4Lg2uTDKia3LYZwV2jh4LjvDxRR became Ready. Migration 0022 and both JWT-verified Edge Functions were installed in production. Live compiled files use pbuogcrhdywpzvcxbwsd, not the isolated backend; existing 88 profiles, 160 events and 61 approved memberships were preserved. The owner's existing approved admin account passed scouting access/management checks. Production scouting records and delivery rows were zero after release. CI, 1032 local tests and 51 check-in browser checks passed, and the initial runtime error scan found no errors. Scouting Discord sends require explicit opt-in; existing team notifications were unchanged.

The owner then reported that routine after-school training filled the scouting picker. The picker previously selected both competition and training events. It now queries only competition events and independently filters old cached indexes at render time. The empty state explains that a lead must add an event with type competition. No calendar events are changed or deleted, and direct links to existing training/scouting work remain supported. Live calendar inspection found build, meeting, training and volunteering entries, with no competition entries; the corrected picker should therefore show its honest empty state until a real competition is entered.

DOM regression coverage includes a visible competition among routine calendar entries, preservation of all calendar rows, an older mixed offline index, and an offline index containing training only. The positive competition case guards against accidentally hiding every event.
