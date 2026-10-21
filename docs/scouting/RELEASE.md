# Scouting release and field acceptance

The code is pushed to review branch `codex/scouting-2026-evidence`, with draft PR #4 open. It has not been merged or deployed to production, and no scouting SQL has been applied to the live database. Git pushes may create automatic Vercel review previews. Use `VERIFICATION.md` for actual checks and `RESUME.md` for remaining source-fidelity gaps.

## Review the implementation

1. Restore the Git bundle or use the complete source tree in the checkpoint. Read `CLAUDE.md` and `docs/subsystems/scouting.md`.
2. Run `npm ci`, `npm test`, `npm run build`, `npm run connector:check`, `npm run ds:audit`, `npm run discord:calendar:test`, and `npm run history:verify`.
3. Run `npm run scouting:preview:check`. Open `artifacts/scouting-review/REVIEW.html` for an interactive fictional review using the actual components. Its simulated backend is not live acceptance.
4. In a browser-capable checkout, run `npm run test:checkin` and `npm run test:features`. The scouting spec covers 375px and 1440px. Install a supported Chromium or set `CHROMIUM_PATH` as described in `browser-status.md`.
5. With authorized GitHub write access, push this review branch and open a PR using `PULL_REQUEST.md`. Do not push main or force-push. The restored branch and its Git history are now on GitHub. `SCOUTING_START_HERE.md` and `RESUME.md` are the entry points for another AI; the branch source ZIP is a downloadable source checkpoint.

## Stage the database and services

Use an isolated, authorized staging project before production. This repository does not maintain applied migration history. Confirm prerequisite objects through 0021 in the target database; the existence of SQL files is not proof that they ran.

If an earlier local draft of 0022 was applied in staging, check for short/full match aliases before rerunning: the updated uniqueness indexes refuse duplicate logical observations and assignments. Review those records; do not delete evidence to force the migration through.

Apply in order:

1. `supabase/migrations/0022_scouting.sql`
2. `supabase/migrations/0022_scouting_rls_test.sql` (rollback-only proof; requires the documented test actors)

Keep `scouting_private` out of exposed API schemas. Verify direct writes are refused, parent-only access is denied, parent-plus-staff works, the event lead roster is scoped to its event, and revoked users cannot save. Native PostgreSQL 16.10 and 17.6, real separate-connection races and local PostgREST have passed; reproduce them with the retained harnesses. Hosted Supabase Auth, patched extensions, deployed configuration and provider behavior still require authorized staging/field acceptance.

Deploy both source directories manually to the authorized staging project, with user JWT verification and in-function `auth.getUser` checks:

- `supabase/functions/scouting-import/`
- `supabase/functions/scouting-dispatch/`

Server-only configuration:

| Variable | Purpose |
| --- | --- |
| `TBA_AUTH_KEY` | TBA event roster and match preview |
| `NEXUS_API_KEY` | Nexus pit addresses and geometry maps |
| `DISCORD_BOT_TOKEN` | Existing team's Discord bot |
| `DISCORD_GUILD_ID` | Existing team's Discord server |

Never prefix these with `VITE_`. The existing Supabase project URL and anon/publishable configuration remain part of the existing app setup. Statbotics import uses the public provider endpoint. Source failures must preserve stored data; confirm representative provider responses in staging.

The updated `scouting-import` source includes `pit-map.js`; deploy the whole directory. Its `mode: pit_map` performs a read-only eligibility/event check for ordinary scouts. The default mode still requires a manager. No additional migration is needed for maps. On each scouting device, open Teams → Pit map and directory, confirm the provider event key, then download while connected. A lead downloading on one device does not prepare other devices. Confirm walls/areas and assignments against the actual venue, then test reload offline. A failed refresh must preserve the previous key/time/map. Event backup includes this cache as a draft.

The connected frc-app project currently reports no development branches. Provisioning an isolated hosted staging environment remains an external setup step; this implementation has not created a paid branch or used production as a staging substitute.

No real Discord test sends were authorized for this build. A later explicitly approved integration check must verify the fixed #scouting/#strategy channels and bot permissions. User-controlled mentions stay suppressed; no unverified role ping mapping is shipped. Check uncertain delivery in Discord before any intentional replacement communication.

## Field acceptance before competition

Use a training event and real phones, not a live competition. Record the phone/browser, app version, source recording, task, measured time, errors, and outcome.

- First-time student: find the assigned robot, record a visible failure and an occluded action, save, then explain local/synced/delivered.
- iPhone and Android: preload app/event online; disconnect; save; reload/background/reopen; reconnect; verify one attributed record and retained draft. Do not clear site data while work is pending.
- Two tabs/devices: make corrections from the same base version; require explicit conflict review. Change accounts while a save is queued; only the original actor may synchronize it.
- Lead: preview a shift with fewer available scouts than robots; inspect coverage gaps, breaks, existing work and double-booking. Save, refresh, and confirm assignments. Concurrent leads must coordinate; the planner is not a global reservation system.
- Pit crew: reply to another scout's question without rewriting it; verify the original author, reply author, revisions and location source/time.
- Recovery: export an event containing unsynced work and partial practice; inspect its account/event scope, immutable operation IDs and draft keys. Confirm a failed export shows an error while the original work remains intact.
- Footage: record a different event with its full source key; verify its note remains visible and its results do not enter the current-event percentages. Confirm short/full current-event labels cannot duplicate a logical observation.
- Strategy: compare three teams with missing data and disputed observations; cancel a preview, then apply a reviewed order. Check support counts and DNP votes separately.
- Practice: complete interactive drills, retain a partial session through reload, export the workbook and perform mentor assessment against a fixed pre-annotated footage set. Certification remains in IDEA Classroom.

Do not equate synthetic scenario accuracy with real scouting competence, or a browser test with measured student usability.

## Production decision and recovery

After independent review and staging/field gates, the authorized operator decides whether to apply the database/functions and publish the app. Code detects missing scouting schema and leaves existing team tools usable. Do not publish the new route expecting migration files to apply automatically.

If the app must be rolled back, restore the previous app deployment while preserving scouting records, revisions and pending client data. Do not drop tables to hide a UI problem. Export evidence before any separately authorized destructive recovery. Keep the checkpoint, commit IDs and actual executed verification record with the PR.

## Reviewable release packet

- `SCOUTING_START_HERE.md`: portable source/Git continuation entry.
- `docs/scouting/VERIFICATION.md`: current executed results and explicit limitations.
- `docs/scouting/TRAINING.md`: full practice facilitation plan and proposed mentor rubric.
- `docs/scouting/FIELD_ACCEPTANCE.csv`: unexecuted physical-device, human, source and staging checks. Blank actual-result fields are intentional.
- The read-only production catalog currently has no scouting tables/functions, and neither scouting Edge Function is deployed. Production reports PostgreSQL 17.6. Local success does not install the release.
- Preserve current production and its check-in path until explicit release authorization and the outstanding acceptance gates are complete. No authorization is requested merely because a local build is green.
