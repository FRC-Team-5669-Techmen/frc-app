# Scouting release and field acceptance

**October 21 Pacific release authorization:** the owner explicitly requested production release and pushing this update to main. The operator is completing live schema/function checks and the exact-source CI gate before the release workflow. The historical prohibitions below describe the earlier review-only period. Production data must be preserved. Scouting Discord delivery defaults off unless `SCOUTING_DISCORD_ENABLED=true`; existing team notification services are unchanged. Physical-phone, mentor, provider-success and competition acceptance remain incomplete and are not implied by this release.

The code is pushed to review branch `codex/scouting-2026-evidence`, with draft PR #4 open. It has not been merged or deployed to production, and no scouting SQL has been applied to the live database. Git pushes may create automatic Vercel review previews. Use `VERIFICATION.md` for actual checks and `RESUME.md` for remaining source-fidelity gaps.

Nontechnical owner: use **[YOUR_CHECKLIST.md](YOUR_CHECKLIST.md)**. The engineering commands below belong to the implementing AI/operator, not homework for the owner.

## Review the implementation

1. Restore the Git bundle or use the complete source tree in the checkpoint. Read `CLAUDE.md` and `docs/subsystems/scouting.md`.
2. Run `npm ci`, `npm test`, `npm run build`, `npm run connector:check`, `npm run ds:audit`, `npm run discord:calendar:test`, and `npm run history:verify`.
3. Run `npm run scouting:preview:check`. Open `artifacts/scouting-review/REVIEW.html` for an interactive fictional review using the actual components. Its simulated backend is not live acceptance.
4. In a browser-capable checkout, run `npm run test:checkin` and `npm run test:features`. The scouting spec covers 375px and 1440px. Install a supported Chromium or set `CHROMIUM_PATH` as described in `browser-status.md`.
5. With authorized GitHub write access, push this review branch and open a PR using `PULL_REQUEST.md`. Do not push main or force-push. The restored branch and its Git history are now on GitHub. `SCOUTING_START_HERE.md` and `RESUME.md` are the entry points for another AI; the branch source ZIP is a downloadable source checkpoint.

For local Edge entrypoint checks, install Deno outside app dependencies (this run used 2.9.6), then run:

```sh
deno check --no-config --no-lock --node-modules-dir=none supabase/functions/scouting-import/index.ts supabase/functions/scouting-dispatch/index.ts
DENO_BIN=/path/to/deno node tools/e2e/scouting-edge.mjs
```

Use the same `DENO_DIR` for both commands if overriding its cache directory. The retained HTTP harness uses cached imports, blank provider credentials, explicit local-only Deno network permissions and a rejecting Auth stand-in. It verifies executable entrypoint boundaries, not hosted Supabase authentication or real delivery.

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
| `SCOUTING_DISCORD_ENABLED` | Explicit opt-in; leave unset/false for this release |
| `DISCORD_BOT_TOKEN` | Existing team's Discord bot |
| `DISCORD_GUILD_ID` | Existing team's Discord server |

Never prefix these with `VITE_`. The existing Supabase project URL and anon/publishable configuration remain part of the existing app setup. Statbotics import uses the public provider endpoint. Source failures must preserve stored data; confirm representative provider responses in staging.

The updated `scouting-import` source includes `pit-map.js`; deploy the whole directory. Its `mode: pit_map` performs a read-only eligibility/event check for ordinary scouts. The default mode still requires a manager. No additional migration is needed for maps. On each scouting device, open Teams → Pit map and directory, confirm the provider event key, then download while connected. A lead downloading on one device does not prepare other devices. Confirm walls/areas and assignments against the actual venue, then test reload offline. A failed refresh must preserve the previous key/time/map. Event backup includes this cache as a draft.

Two isolated data-free branches were verified on October 21 and deleted after evidence capture. The later run reached real hosted GoTrue/REST/Edge, exposed the PostgREST 14 retry loop for application-raised `40001`, and verified the `PT409` correction in current migration 0022. The fixed migration applied twice; 72 hosted SQL/RLS checks and 55 hosted HTTP assertions passed. Follow `HOSTED_HTTP.md` to repeat. OTP/Google OAuth, successful providers, bot/channel configuration and an actual isolated app preview remain open; Vercel team-scope authorization currently blocks preview setup. `STAGING.md` records cleanup. No temporary compute remains, and production was never used as a staging substitute.

No real Discord test sends were authorized for this build. A later explicitly approved integration check must verify the fixed #scouting/#strategy channels and bot permissions. User-controlled mentions stay suppressed; no unverified role ping mapping is shipped. Check uncertain delivery in Discord before any intentional replacement communication.

## Field acceptance before competition

Use a training event and real phones, not a live competition. Record the phone/browser, app version, source recording, task, measured time, errors, and outcome.

- First-time student: find the assigned robot, record a visible failure and an occluded action, save, then explain local/synced/delivered.
- iPhone and Android: preload app/event online; disconnect; save; reload/background/reopen; reconnect; verify one attributed record and retained draft. Do not clear site data while work is pending.
- Two tabs/devices: make corrections from the same base version; require explicit conflict review. Change accounts while a save is queued; only the original actor may synchronize it.
- Lead: preview a shift with fewer available scouts than robots; inspect coverage gaps, breaks, existing work and double-booking. Save, refresh, and confirm assignments. Concurrent leads must coordinate; the planner is not a global reservation system.
- Pit crew: reply to another scout's question without rewriting it; verify the original author, reply author, revisions and location source/time.
- Recovery: export unsynced work and partial practice. On a second prepared device under the same account/event, preview and restore selected pending saves; confirm they remain held after reload/reconnect. Review and retry one original request, then confirm one server record/revision. Conflicts require review. Practice/drafts/maps stay in the archive for manual review. A failed export or restore must leave original work intact. See `RECOVERY.md` and `FIELD_GUIDE.md`.
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

## Additional reproducible browser checks

```sh
# Synthetic 120-team / 1,682-record fixture; native Chromium, no live services
node tools/e2e/scouting-volume.mjs
# Independent pinned audit engine outside app dependencies
npm install --prefix /tmp/scouting-a11y --no-package-lock --no-save axe-core@4.11.1
AXE_CORE_PATH=/tmp/scouting-a11y/node_modules/axe-core/axe.min.js node tools/e2e/scouting-accessibility.mjs
# Optional measured-duration recovery run (0–60 minutes); requires the native
# PostgreSQL and PostgREST executables documented in tools/sql-harness/README.md
SCOUTING_SOAK_MINUTES=39 POSTGREST_BIN=/absolute/path/to/postgrest node tools/sql-harness/run.mjs --tests none --node tools/e2e/scouting-pwa.mjs
```

Choose distinct fixture/PWA ports when running separate checkouts concurrently. The fixture harness refuses another checkout's server. `FOOTAGE_CORPUS.csv` and `FIELD_ACCEPTANCE.csv` require actual annotations/device/human results; blank fields intentionally prevent synthetic checks from becoming acceptance claims.


Decision-support acceptance: run `node tools/e2e/scouting-decision-controls.mjs` (ten permissive mutations must be detected) and `node tools/e2e/scouting-decisions.mjs` (23 assertions at each of two Chromium viewport widths, fictional backend). Brief drafts use existing scoped IndexedDB storage and need no migration. Check a real coach's six-team lineup/plan/print workflow and actual-device recovery during field acceptance; automated browser checks do not establish match strategy effectiveness.
