# Isolated Vercel preview — October 21, 2026 (Pacific)

Open [the isolated preview](https://frc-mabl9w5sn-mrpina-s-projects.vercel.app) or [its deployment dashboard](https://vercel.com/mrpina-s-projects/frc-app/8kNvU34ShqsT9xHnpyAqB7wKLik5). Vercel Authentication remains enabled. This is not a production release or a claim that school Google/email sign-in has been accepted.

The deployed source is `951fe6cb01cef170e5b39afe824348ef4fbe3b45`, containing application `de19a66a23a892da2bfdeed789969de61116bf55`. The CLI uploaded a clean Git archive, excluding local credentials and test artifacts. Vercel reports target **preview**, status **Ready**. Its actual compiled entry bundle contains `ntpaoznneqptenmgkcej.supabase.co` and does not contain the production database URL. Hashes and sanitized results are in [verification/2026-10-21-preview](verification/2026-10-21-preview).

## Configuration and access

Official Vercel CLI **65.0.0** is globally installed and authenticated as **mrpina-dev**. Explicit project inspection verified `prj_eDfnffVycoAO4YJIfKY9SiBaDMwR` in `mrpina-s-projects` (`team_t21qnb2a8oRqQy7beqKF5LZJ`). Credentials stay under ignored `work/` with restricted file permissions. The existing ChatGPT connector still returns team-scope 403; use the CLI instead of repeating connection-setting instructions.

The user-requested `https://vercel.com/get-started.md` was fetched and followed. Vercel guidance is already supplied by the enabled plugin; no duplicate standalone skill pack was installed. Codex's user-wide MCP configuration now registers `https://mcp.vercel.com`, enabled but **not authenticated**. Its OAuth flow requires a localhost callback unavailable to the user's remote browser; the pending flow was cancelled. CLI authentication and working project access are independently verified.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` now have overrides scoped to **Preview**, Git branch **codex/scouting-2026-evidence**. Existing all-environment/production entries were not replaced. This CLI deployment additionally received explicit isolated build values. Existing older deployments are immutable and remain potentially production-backed: use only the new link above. Future Git branch previews should inherit the branch overrides, but verify each actual bundle before use.

The CLI's `vercel curl` created its standard project automation-bypass credential while checking the protected preview. It was used only locally; protection was not disabled or exposed in the handoff. CLI 65.0.0 forwards `--global-config` incorrectly to native curl. The successful workaround uses `XDG_DATA_HOME` pointing to an ignored copy of the same authorized CLI configuration, with an explicit deployment URL and team scope. This requires no new login or credential printing.

## Backend and verification boundaries

Supabase branch **scouting-2026-app-preview**, ID `0a77cdef-37f5-421a-ae4c-f75b83c25476`, project **ntpaoznneqptenmgkcej**, was created with **with_data=false**. The service accepted creation without a cost-confirmation prompt; no zero-cost claim is made. Copied prerequisites, zero users/profiles and zero jobs were checked before changes. Current migration 0022 applied twice, the rollback SQL proof passed **72/72**, and both source Edge Functions deployed ACTIVE with JWT verification enabled.

Six SQL-provisioned fictional `.invalid` users and a fictional training event support **49/49** real hosted Auth/API assertions. These fictional fixtures remain in this deliberately retained preview backend. No production users or data were copied. The final counters were **zero delivery rows, zero cron jobs, zero queued HTTP requests**. No Discord configuration was added or send requested.

Real Chromium loaded the hosted Vercel app through the inherited proxy, using a Vercel access cookie and a pre-issued fictional admin session. It loaded the fictional event and team 5669 from this backend with no page errors. This proves hosted app/API reads; it does **not** prove school Google OAuth, email OTP delivery, a normal human sign-in, real-phone recovery, or competition acceptance. The app has no password form; the automated password-grant session is not an instruction for the owner to use fictional credentials.

Security advisors retain the intentional service-only no-policy INFO, existing anonymous/authenticated SECURITY DEFINER warning groups and [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The prior RLS/API proof is evidence of scoped behavior, not a general security clearance.

## Next work and cleanup

Verify the isolated branch's school OAuth/email OTP configuration and provision the intended human test access before assigning phone exercises. Provider credentials and actual successful provider results remain separate checks. Never send real Discord messages without explicit authorization. Production deployment, live database mutations and main pushes remain prohibited.

This test branch is retained intentionally to keep the preview usable and may incur ongoing Supabase usage charges. When review ends, delete only the identified development branch and remove only its two branch-specific Vercel overrides. Retire this preview link before doing so. Do not delete the default Supabase branch or alter all-environment/production variables. Earlier deleted verification branches remain historical evidence; this is a new branch.
