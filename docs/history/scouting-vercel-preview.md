---
title: "Authorize Vercel CLI and deploy an isolated scouting preview"
date: 2026-10-21
branches: [codex/scouting-2026-evidence]
commits: [951fe6cb01cef170e5b39afe824348ef4fbe3b45]
subsystems: ["Scouting", "Deployment"]
---

The owner completed official Vercel device authorization after the ChatGPT connector repeatedly denied team-scoped access. Globally installed CLI 65.0.0 and verified mrpina-dev access to the existing frc-app project/team. Fetched and followed vercel.com/get-started.md; existing plugin guidance remains enabled. Registered the shared official MCP endpoint in Codex's user-wide configuration, but cancelled its pending OAuth because its localhost callback is inaccessible from the user's remote browser. CLI access works independently.

Created a data-free Supabase development branch, applied existing reviewed 0022 twice, passed 72 rollback SQL checks and 49 hosted Auth/API checks, and deployed both scouting Edge Functions with JWT verification. Added only two Vercel Preview overrides scoped to the scouting review branch. Uploaded a clean Git source archive as a preview, with explicit isolated build values. Inspected the real hosted compiled entry bundle, confirming the test project URL and no production database URL. Real Chromium loaded the hosted fictional event and observation using an existing fictional session and Vercel access cookie with no page errors.

PREVIEW.md records exact deployment/backend IDs, source boundaries, advisor warnings, CLI argument workaround and cleanup. Normal email OTP, school Google OAuth and physical-phone acceptance remain open. The test backend is intentionally retained; ongoing usage charges are possible. No main push, production deployment/database mutation or real Discord notification occurred. Final delivery, job and HTTP queue counts are zero. Added /.vercel/ to ignored local configuration; no credentials are committed.
