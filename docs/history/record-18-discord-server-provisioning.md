---
title: "Discord server provisioning: spec-driven, idempotent, dry-run by default"
date: 2026-08-18
branches: []
commits: ["2066524"]
migrations: []
subsystems: ["Discord"]
record_order: 33
---

 Earlier — Discord server provisioning — NEW scripts/discord/provision.js + scripts/discord/README.md alongside the existing SERVER_SPEC.md; @discordjs/rest + discord-api-types added as devDependencies with npm scripts discord:plan/apply/offline. Ops tooling only — no src/ imports, nothing bundled. The spec markdown is parsed at runtime rather than transcribed, so spec edits drive the plan; unknown colour/permission words throw instead of being dropped. Dry run default + read-only, --apply to write, --offline to plan with no credentials, never deletes (reports UNMANAGED), 429s honoured off retry_after. .gitignore widened to .env.local.* / .env.*.local — the repo root already held an untracked .env.local.txt carrying a live DISCORD_BOT_TOKEN that was NOT ignored; .env.example added. Live dry run against the guild found it is NOT empty (named 'Bosco Tech Robotics', Community already on, #welcome/#mod-log/#general already exist) and surfaced a blocking collision: an existing AutoMod rule 'Block Mention Spam' occupies the only MentionSpam slot Discord allows, so creating the spec's 'Block mention spam' would 400 — the script now pre-warns on singleton-trigger collisions. Spec ambiguities were listed in the README, not decided.