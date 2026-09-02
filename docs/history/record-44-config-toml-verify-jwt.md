---
title: "supabase/config.toml pins verify_jwt = false for the cron and capability-URL functions"
date: 2026-08-29
branches: []
commits: ["2d92be5"]
migrations: []
subsystems: ["Supabase functions"]
record_order: 7
---

 Earlier - 2026-08-29 (Added `supabase/config.toml` pinning `verify_jwt = false` for `cron-notify`, `send-push`, `discord-calendar`, `calendar-feed`, and `parent-response` — determined per function by reading how each one actually authenticates, not by name: the first three check a shared secret against a pg_cron-supplied header, the last two are capability URLs keyed by an unguessable token. `invite-member`/`send-approval-email`/`send-parent-request` were left off because they authorize against the caller's own JWT. See the new bullet in Built so far.