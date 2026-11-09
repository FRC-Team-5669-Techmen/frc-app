---
title: "Named parent service reports, Competition check-in, scout tallies and mentor advisory rotations"
date: 2026-11-08
branches: [main]
commits: []
migrations: [0051_frc_operations.sql, 0051_frc_operations_rls_test.sql]
subsystems: ["Event family hub", "Check-in", "Event rosters", "Scouting", "Landing page and nav", "Fixture mode", "Connector"]
---

The user authorized job codex-frc-ops-nov8 in solo mode, direct main push after the complete local gate, the requested author identity, and migration delivery only through migrate.yml. Required CLAUDE.md, the whole OVERHAUL_AUDIT, direction/roster-accounts/security-recheck history, decisions 05/54 and role-board/check-in/event-hub/scouting subsystem rules were read before implementation. No AGENTS.md was found under /workspace. No agents were used. Fetch/rebase established 77cc698 as the base; 0050 was highest, so 0051 was reserved in the ledger and must be checked again at landing. Existing history/status labels were checked against source. All identities and school IDs used for proof are fictional. No real member rows, names, addresses or tokens were retrieved or committed.

| Item | Before, verified in the base tree | After this job |
| --- | --- | --- |
| 1. Parent service export | 0011 and eventHub.js already had the parent service note and per-family/day CSV, including adult count and whether a family listed a car. It explicitly could not name every adult. No actual parent service times, school-ID field, per-parent totals or named printable report existed. | Staff record distinct named parents, one linked student and private school ID, and actual event-timezone intervals. CSV and printable view use one row builder, with dates, start/end times, interval hours and each parent event total. Repeated sessions keep one parent total; a second parent stays separate. The legacy export remains explicitly labeled Family RSVP counts. No RSVP count becomes hours. |
| 2. Venue check-in | CheckinPage always supplied DEFAULT_CATEGORY Build and verified the shop; FLL had its separate Volunteer path. 0019 attendance_record and 0049 direct-insert integrity already supplied server protections. Only a permanent profiles.geofence_exempt flag existed, with no event scope or automatic event expiry. | Staff configure competition venues on event rosters. A generic tag selects the precise active venue before the shop, or the event link targets one venue. The server owns member, time and Competition category and checks membership, enabled venue, event window, accuracy/distance and exemption scope. Event-specific exemptions end at the stored or current event end, whichever is earlier; read and write enforce expiry. Confirmation refreshes context. Existing permanent shop exemptions remain separate. No historical Beach Blitz row is changed. |
| 3. Scout tally | Teams coverage, planner workload, canonical match identities, super-scout records, manager roster and confirmed server records were already built. No named per-scout event tally/gap view existed. | Manage event lists each scout with distinct confirmed current-event matches, robot/super counts and missing robot/alliance assignments. Three super notes count once; every assigned robot must be submitted to close an alliance gap. Eligible zero-count scouts remain. Pending/local, cancelled, other-event, external and unverified-video evidence is excluded. The shared name formatter handles the actual roster profile shape. No new read API is introduced. |
| 4. Advisory role rotation | 0028/0031 assignments, backups, overfilling, free staff assignment and roleRules rotation warnings already existed. The member picker was alphabetical. Strong/newer designations, verified-hour ranking and a generated supported pit rotation were missing. | Mentor/admin-only suggestions behind decision 54, with mentor-maintained newer/strong flags and no real-name seed. A newer pit suggestion names two distinct available strong members. Responsibility roles order available candidates by verified current-season Build hours. Existing assignments and overlaps/two-slot runs are respected; gaps are explicit. Every suggestion has a reason and can be accepted individually through the existing assignment RPC. No new blocker or automatic application is added. |
| 5. What is new | src/updates.js ended on 2026-10-28 although the later code and histories contained the listed releases. | Student-readable dated entries cover desktop layouts, approved sign-out, grouped navigation/search, training, feedback/pause fixes, folding preview, parent classification, summer transfer and database security protections. Intervening scouting tables/pick board, My schedule, standing correction, event linking and shared mail setup are included too. The log does not claim pending security Edge deployments are installed. |

The existing schema has no school-ID column; staff-entered school IDs are kept inside the closed parent service records, never substituted with an auth UUID or added to the broadly readable profile. Each named parent is a stable event-scoped record, linked to one student. Actual service entries can be corrected or removed. Names alone never select or merge records. Parent-account login is not required to record staff-verified service. Existing adult RSVP answers remain intact.

Decision 54 stays open for adoption/refinement. Newer is an explicit mentor planning designation, rather than an account-age guess. Strong is a mentor designation, rather than certification or hours. Both start empty. The responsibility-role list is displayed on screen and documented in rosters.md. Verified hours use approved sign-outs, approved reviews or verified IN/OUT pairs, plus verified Build logs; shared hoursUtils pairing, pauses, caps, LA season attribution and excluded reviews are reused. Open/unverified sessions and non-Build categories do not contribute. The unrelated participation-folding switch stays off unless an administrator explicitly changes it. This job changes no live designation or setting.

## Security and mutation proof

0051 creates five RLS-enabled tables, closed to PUBLIC, named anon, authenticated and service_role. Nine checked app RPCs grant exactly authenticated after explicit named revokes. Internal mentor/merge helpers grant no API role. Every new read/write boundary has positive and permissive controls: staff parent read/write and event/session scope, staff venue read/write/exemption maintenance, member context and attendance write, and mentor-only designation/read. The full replacement merge catalog includes all three new member references and preserves the existing verified account-transfer tests. A legacy member-key heuristic initially misclassified a parent-record key; the final guardian_id references the parent record without being treated as a member key. Both static and native merge coverage pass.

The rollback-only 0051 suite passes 69/69. All-migrations native PostgreSQL 17.11 proof passes 1266/1266 across 49 SQL suites, with every migration applied twice. The 73 permissive mutations require their named failing assertions, complete output and green restoration after each mutation; an SQL error never counts as detection. Migration source must remain byte-identical. The named-default replay closes 32/32 simulated table/function grants and catches both omitted-anon and omitted-service-role revoke controls. Pure-model checks additionally catch five tally exclusion/completeness mutations and two verification/review-exclusion mutations.

One expiration test originally let an inner GPS refusal mask a removed event-end guard. The final test supplies valid coordinates to isolate the event-window refusal, then separately checks stored expiry and GPS. This is why a green ordinary RLS run alone was insufficient. A source edit during an exploratory mutation run was rejected by its byte-identity guard; that interrupted run is not delivery proof. The final frozen-source run above is the accepted proof.

```sh
PATH="$PWD/work/pg/usr/lib/postgresql/17/bin:$PATH" node tools/sql-harness/run.mjs \
  --node tools/sql-harness/mutants-0051.mjs \
  --node tools/sql-harness/default-acl-0051.mjs
npx vitest run tests/frc-operations.test.js tests/merge-coverage.test.js
node tools/e2e/features.mjs --only frc-operations
```

The runner uses whichever supported native PostgreSQL is installed. This executor lacked one, so official Debian packages were extracted under ignored work/ without changing dependencies or privileged system configuration. Logs, CSVs, scratch clusters and screenshots remain under ignored work/ or artifacts/. These tests do not contact a live project.

## Measured before and after

`tools/e2e/ops-before.mjs --checkout work/ops-before` runs against an archive of base 77cc698, using the real pages and fixture data. It measured five populated surfaces at 375, 1152 and 1440 in dark and light, 30/30 views. Every baseline view had zero document overflow and bounded content. It confirms the legacy adult-count export, no event-venue controls, no per-scout tally, no mentor suggestions and newest update October 28. No numeric baseline is claimed for nonexistent new controls.

The retained frc-operations feature spec drives real parent entry, two-parent/multiple-session totals, downloads and print action/media visibility; staff venue setup, permanent-flag isolation, event-exempt and generic GPS Competition receipts, expired-event refusal; lead tally with visible names/store-derived counts and ordinary-scout exclusion; mentor designations and acceptance of a suggestion; student exclusion; current update copy; and pre-migration role-board fallback. It measures seven populated states in all six theme/width combinations, 42 views, plus six printable states. The print action shows the same report and hides app chrome. Rendered PDF checks caught and then verified the removal of an extra blank page; screen inspection caught and fixed squeezed phone table columns. Parent and mentor controls keep the existing 44px floor. Existing theme tokens, Chakra Petch/Share Tech Mono and plate shapes are retained. Scouting remains full-width on a computer, and deliberate table/list scrolling stays inside the component.

<!-- measurements:start -->
Each cell is content width / document overflow in CSS pixels. All 42 after views have zero escaping descendants and pass the viewport/frame checks. The six print states also pass the rendered single-page landscape PDF check for the three-entry fixture. Phone table columns remain at least 960px inside their own scroll region, rather than squeezing text into the viewport.

| View | 375 dark | 375 light | 1152 dark | 1152 light | 1440 dark | 1440 light |
| --- | --- | --- | --- | --- | --- | --- |
| Named parent report | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Venue setup | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Competition receipt | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Expired-event refusal | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Scout tally | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1440 / 0 | 1440 / 0 |
| Mentor suggestions | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Student updates | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |

Baseline content widths / overflow for the legacy export, shop confirmation, role board and updates were 375 / 0, 1152 / 0 and 1280 / 0 in both themes. Baseline scouting was 375 / 0, 1152 / 0 and 1440 / 0. The baseline harness retains all 30 measurements and screenshots, including real content checks. The new report was visually inspected on a dark phone; the light desktop printable report, mentor suggestions and named scout tally were inspected too.
<!-- measurements:end -->

## Verification and landing

Implementation and documentation are frozen before the seven-command solo gate. Before the complete gate, targeted verification passes 233/233 operations browser checks, 1664/1664 unit tests in 122 files, and the SQL/mutation proof above. Complete-gate results and remote confirmation are recorded after the gate and push. Fetch/rebase and the free migration number are checked again immediately before pushing; a moved main requires the complete gate again. No force push is permitted.

## Limits

The connected Supabase tools returned a missing non-empty connection-ID error, so no live catalog/advisor or signed-in production verification is claimed. Migrate/CI/Vercel workflow reports are separate evidence from installed-object or authenticated behavior. No live member, service-time, venue, exemption, designation or participation setting was written directly. No actual mail/push/Discord send, phone/NFC, physical GPS, iOS/WebKit, real school-ID import, printer or screen-reader hardware was exercised. Browser geolocation/print are controlled Chromium proofs. An event link fails closed if its venue/window is unavailable; an ordinary shop tag retains the existing pre-0051 flow. The two earlier security-recheck Edge deployments remain outside this job.
