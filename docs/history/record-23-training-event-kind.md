---
title: "Added training as an events.kind"
date: 2026-08-20
branches: []
commits: ["ac2d498"]
migrations: ["events_kind_training.sql"]
subsystems: ["Schedule", "Discord"]
record_order: 28
---

 Earlier (2026-08-20) — Added 'training' as an events.kind. NEW supabase/events_kind_training.sql (drop/re-add events_kind_check with the eighth value + a zero-rows verify query) — additive, no row is re-tagged, NOT APPLIED (run by hand). Four code sites carry the vocabulary and all four were updated: SchedulePage.jsx KINDS, SchedulePage.css .sch-kind-training (--hr-outreach, the blue already used for outreach-flavoured things), and discord-calendar/lib/render.js KIND_COLORS + KIND_LABELS ('Training'). events.sql's inline CHECK was ALSO re-pinned — it was already stale, still listing the pre-volunteering six, so a fresh install would have rejected rows the live DB accepts. calendar-feed and ReportsPage handle kind generically (description text + CATEGORIES line / a rendered label) and needed nothing; SHOP_OPEN_KINDS stays ['build'] so training does not open the shop. Discord subteam pinging was verified independent of kind — namedSubteamRoles reads title+notes only, so 'Programming Training' resolves to ['Programming'] and 'training' introduces no word that collides with an alias; confirmed by executing render.js directly, plus 12/12 on npm run discord:calendar:test and a clean vite build. FLAG: the request asked for a graduation-cap emoji 'matching how the other kinds are rendered' — there is NO emoji convention for event kinds anywhere in the repo (verified by scanning the emoji codepoint ranges across every kind-rendering file), so none was added rather than making training the only kind with one. Emoji is still an open ask if the convention is wanted across all eight.