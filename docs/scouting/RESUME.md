# Resume Team 5669 scouting

**Review branch:** `codex/scouting-2026-evidence` · [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). Start with `SCOUTING_START_HERE.md`, `CLAUDE.md`, `docs/subsystems/scouting.md` and `docs/scouting/VERIFICATION.md`. The original uploaded source matched bundled commit `b7c27bb`; all checkpoint history was restored and pushed. Do not rebuild from main. Main was last confirmed at `9bb3a07321f6fc8a298835e0ec31fc193e106111`.

## Current implementation and proof

| Requirement | State |
| --- | --- |
| Pit claims, observations, assignments, planning, replies, individual/master lists and comparison preview/apply | Implemented; unit/DOM, real Chromium and native SQL checks pass. Formulas are proposed Techmen rules, not claimed 4414 algorithms |
| Durable offline capture and account-bound recovery | Implemented; built-PWA checks cover cold start, expired local session, lost committed response, page closure/lease retry and one logical record. Online authorization remains server-enforced |
| Extensive beginner practice | Eight missions; 180-minute activity plan; 27 decisions; six written simulations; partner/real-footage tasks; frozen first-pass workbook and appended reviews; portable export. All eight software flows pass in Chromium; humans/real footage remain external gates |
| Integrations and connector | Import/dispatch/connector code implemented; local API/SQL and mocked failures checked. No live scouting services installed or real Discord send authorized |
| Source reconstruction | Evidence matrix, rule/API pins, hand-calculated expectations and deliberate deviations preserved. Original audiovisual/current-app fidelity and real match annotations remain unresolved |
| Portability | Full source/history pushed; root start file, retained verification logs, training guide and field worksheet included. GitHub source ZIP is downloadable; clone the review branch for Git history |

Executed results: **940/940 unit/DOM tests (63 files), 1749/1749 Chromium feature assertions (15 suites, including 129 scouting), 51/51 check-in, 573/573 SQL checks on native PostgreSQL 16.10 and 17.6, 17/17 mutants, 7/7 separate-connection races, and 19/19 built-PWA/PostgREST checks**. Build/connector/design/calendar/history/oracle/portable-review gates pass. GitHub CI passed on Node 22/npm 10 at code commit `32b6b98`. Final verification documentation names runtime limits and retained evidence.

The checkpoint lockfile was repaired for npm 10: 27 missing nested esbuild/platform entries were added; no existing pinned version changed. Both npm 10 and 11 install 538 packages. Another AI should not discard this repair or assume the original npm 11 install proved CI portability.

## What still prevents competition acceptance

- Production catalog has no scouting tables/functions, and neither `scouting-import` nor `scouting-dispatch` is deployed. Setup/release needs explicit authorization. Read-only catalog access works; it does not prove live behavior.
- Real iPhone/Android, first-time student measurements, a mentor review and the independent real-recording corpus are unavailable in this cloud run. Use `TRAINING.md` and `FIELD_ACCEPTANCE.csv`; never mark those NOT_RUN gates passed from browser emulation.
- Original TideScout video audio/frames and authorized current app/schema/export access remain missing. Source timestamps are secondary leads. Nexus map geometry and reviewed Discord role pings remain fidelity gaps; sourced addresses and pit conversation workflows work.
- Live TBA/Statbotics/Nexus responses, hosted Auth/API configuration and authorized real delivery still need representative staging/field checks. Local transport uses synthetic Auth and stand-ins; no live integration success was claimed.

## Continue safely

```sh
git fetch origin
git switch codex/scouting-2026-evidence
# Preserve newer remote changes; do not force-push or replace this branch with main.
npm ci
npm test
npm run build
npm run connector:check
npm run ds:audit
npm run discord:calendar:test
npm run history:verify
node docs/scouting/check-oracles.mjs
npm run scouting:preview:check
npm run test:checkin
npm run test:features
```

With native PostgreSQL binaries on PATH (and an unprivileged server user if running as root):

```sh
node tools/sql-harness/run.mjs --node tools/sql-harness/scouting-mutants.mjs,tools/sql-harness/scouting-race.mjs
POSTGREST_BIN=/path/to/postgrest node tools/sql-harness/run.mjs --tests none --node tools/e2e/scouting-pwa.mjs
```

Read `database-status.md` and `browser-status.md` for tool versions and exact boundaries. The retained SQL harness refuses a non-disposable target for its race/API scripts. No ChatGPT runtime is required.

Do not push main, merge/deploy production, modify the live database or send real Discord notifications without explicit release authorization. Keep the private original handoff outside public commits. Official certification remains in IDEA Classroom. `RELEASE.md` specifies migration 0022 after verified prerequisites through 0021 and preserves scouting history during rollback. This is a concrete reviewable implementation with external acceptance still blocked, not a declaration of field readiness.
