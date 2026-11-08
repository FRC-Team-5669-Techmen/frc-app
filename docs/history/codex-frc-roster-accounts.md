---
title: "Participation folding, personal-email classification and verified summer-account transfer"
date: 2026-11-07
branches: [main]
commits: [3b5c6acf511ab85c7170e6fd663de664b38b18f0]
migrations: [0050_roster_accounts.sql, 0050_roster_accounts_rls_test.sql]
subsystems: ["Roster, access and capabilities", "Member standing", "Fixture mode", "Account transfer"]
---

Job codex-frc-roster-accounts starts from fetched/rebased origin/main 6876af1. The required CLAUDE.md, entire OVERHAUL_AUDIT, direction item 2 history, decisions 54/07/05 and roster/access/standing subsystem files were read before implementation. No AGENTS.md was found under /workspace. Additional subsystem guidance was read before changing shared access predicates. The work is solo. The user explicitly authorized implementation, migration delivery through migrate.yml and a fast-forward main push after the full local gate. Migration 0049 was initially reserved; the final fetch found the separate security recheck had landed as 0049 at 2d87b63. This job was renumbered to 0050 and rebased onto that commit. The new calendar SQL and Edge status checks are included in folded-access preservation. The complete gate was repeated on the rebased tree. A later landing fetch found 16bfdae, a three-file security audit/history/ledger record only; the executable tree was retained byte-for-byte and history verification repeated after that rebase. No separate live member or setting write is authorized or performed. Commits use the requested pina-hash author identity.

## Before and after

These are tree findings, not claims that a historical file was installed in production.

| Item | Already built at the fetched base | This job adds |
| --- | --- | --- |
| Participation folding | 0015 weekly/monthly hours and meeting rules, probation failure and proposed removal; admin confirmation/withdrawal; 0044 mass-change hold; 0048 corrected attendance, evidence and verified weekly logs; roster status controls and connector bulk status. | One off-by-default admin switch, a dry-run preview, `folded` status, persistent mentor overrides, and a separate folded roster section with reason/date/one-tap restore. Uses the installed evaluator, without new attendance arithmetic. Break and excused weeks retain their exclusions. Grades, discipline and onboarding-deadline proposals do not become automatic participation folds. |
| Parent classification | Parent role, explicit invited/approved roles, domain auto-approval and access request form; claimApproval keeps state on failed rereads. The frozen already-approved claim path defaulted to student. | First-claim classification for new roleless personal-email accounts is parent, with a reason on the request gate and staff request review. A migration snapshot preserves existing roles; the admin account-review page lists legacy personal-email students. Explicit reclassification replaces student/parent only and preserves staff roles and approval. Roster approval respects the claimed role. |
| Summer transfer | 0020 admin_merge_member and merge_accounts already move history, check catalog coverage, handle duplicate keys and preserve member_admin_log snapshots. | Personal-session code generation, school-session redemption, pending requests and admin review. Codes are random 128-bit values stored only as SHA256 hashes, expire in 24 hours, and are single use. Replacement invalidates prior codes. Approval calls the existing merge inside the request transaction. Denial and redemption move no history. Names never select accounts in this workflow. |

Decision 54 remains open. The requested probation-failure rule and until-withdrawn override are the built option, not approval to enable it. Mr. Pina must choose ON or OFF after reviewing the preview on Team standing Settings. The default is OFF. Turning it off does not restore members already folded. Decision 07 remains separate and its offboarding options are not implemented by this job.

## Database behavior and evidence

All five new tables have RLS enabled and no public, anon, authenticated or service_role privileges. Every exposed managed RPC has exactly the authenticated execute grant, with named PUBLIC/anon/authenticated/service_role revokes first. Internal helpers are closed to all client/server roles. The changed existing feature access predicates also have their exact ACLs pinned. Their role, approval and ownership rules remain; folded accounts pass the same access checks as active accounts. Active standing/team list filters remain separate. Folded driver documents are not flagged for deletion. The family-signup rule includes folded students, retaining its application and role checks.

The existing mass-change hold reports its result only inside the transaction. A held run folds nobody, including an earlier candidate. Preview runs the guarded evaluator in a subtransaction and then deliberately rolls it back, preserving only its returned candidate/reason/hold values. Standing rows, notices, outbox mail, FLL changes and roster changes are not saved by preview. Folding never changes approval, roles, credentials or auth users. Restore accepts only a folded member, dismisses only the proposal recorded with that fold, and retains the failed probation history. Candidate selection requires the installed evaluator's known hours/meetings failure reason and its matching failed probation; tests exercise the actual evaluator and exclude unrelated removal causes.

Transfer proof and claim classification remain attached to their original account IDs in the merge catalog. Participation state, including a mentor keep-active override, moves to the kept account; the existing kept-row-wins collision rule still applies. Source/target reads are scoped in the RPC; mentors cannot see other transfer identities. Redemption takes profile locks before the code-row lock and rechecks expiry/use after waiting, matching generation lock order. Approval locks the pending request and uses the existing sorted-profile merge locks. No direct client table write or new service credential is introduced. The existing admin_approve_member stays SECURITY INVOKER, preserving 0019's structural guarantee while retaining classified roles.

The rollback suite uses random fictional identities and example.invalid addresses. Native PostgreSQL 16 was compiled under ignored work/ because this environment did not include PostgreSQL or a scoped system installer. The suite verifies switch-off behavior, new and existing accounts, positive and negative role boundaries, exact ACLs, actual break/absence/hold evaluation, preview rollback, folded access versus inactive denial, code expiry/replacement/replay, pending-only behavior, denial, catalog refusal and a real audited merge. The mutation instrument requires the named failing row, never a SQL crash or empty output. Wrapper gate mutations neutralize an independently admin-gated inner call only for that outer probe, so redundant guards cannot hide it. Original SQL and installed helper definitions are saved in memory and restored between mutations and at completion. The restoration baseline must be green.

Local database results on the rebased tree: **126/126** new checks; **129/129** permissive mutations caught and restored baseline **126/126**. The retained concurrency instrument passes **12/12** actual multi-session trials: eight contested code redemptions, regeneration against redemption, two simultaneous admin approvals, expiry while waiting on a row lock, and a transaction-start-clock mutation that wrongly accepts the expired code. Exactly one request/merge succeeds and no deadlock occurs. All participants deliberately share a fictional display name, with distinct IDs; names are irrelevant to the workflow. Repeat with:

```
node tools/sql-harness/run.mjs --tests supabase/migrations/0050_roster_accounts_rls_test.sql --node tools/sql-harness/mutants-0050.mjs --node tools/sql-harness/race-0050.mjs
```

## Measured views

Before: none of these three new workflows had a screen to measure; no numeric baseline is claimed. After: the retained real-page fixture spec measures eight populated states at 375, 1152 and 1440 in dark and light: preview, folded roster, legacy account review, generated code, pending school request, admin approval, requester classification and staff classification. Every state must have real content, zero document overflow, no escaping descendants, viewport/frame bounds and the requested theme. Transfer/participation controls meet 44px. Screenshots of phone dark preview and code, and desktop light approval were visually inspected. Existing fonts, theme tokens and shape classes are used.

<!-- measurements:start -->
Each cell is measured content width / document overflow, in pixels. All 48 views had zero escaping descendants and passed the frame/viewport checks.

| View | 375 dark | 375 light | 1152 dark | 1152 light | 1440 dark | 1440 light |
| --- | --- | --- | --- | --- | --- | --- |
| Dry-run preview | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Folded roster | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Existing-account review | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Personal transfer code | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| School pending request | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Admin transfer approval | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
| Requester classification | 311 / 0 | 311 / 0 | 1024 / 0 | 1024 / 0 | 1024 / 0 | 1024 / 0 |
| Staff request classification | 375 / 0 | 375 / 0 | 1152 / 0 | 1152 / 0 | 1280 / 0 | 1280 / 0 |
<!-- measurements:end -->

The fixture token and merge result are rendering stand-ins, not security or merge proof. Native SQL supplies that proof. Browser outcomes, the complete local gate and landing evidence are recorded below after completion.

## Verification and delivery

The final executable implementation passes the complete solo gate on 2d87b63 plus this job: build (204 precache entries, 2626.51 KiB), npm test (121 files, 1654/1654), ds:audit (36 aliases x 3 grounds, 79 components, 315 files), Discord calendar (19/19), lossless history (50 original entries and 51 post-split), check-in (51/51 at 375 and 1440, isolated fixture port 5417), and features (8750/8750 at 375, 1152 and 1440). The feature total includes roster-accounts 229/229, desktop-layout 2792/2792, navigation 882/882, tour 243/243 and frc-feedback 321/321. All 48 SQL suites pass 1197/1197, including the 126-check new suite. Connector regeneration/check and the offline migration plan also pass. An earlier browser run was interrupted with its shared fixture server; that connection-refused result is not counted as a pass. The clean complete run and isolated check-in run above are the delivery evidence.

Migration 0050 was rechecked against origin/main at landing: 0049 remained highest and 0050 was free. Implementation commit `3b5c6acf511ab85c7170e6fd663de664b38b18f0`, authored pina-hash, was pushed fast-forward over 16bfdae, without force. A fresh fetch and git ls-remote agreed on that main ref. The final rebase added only the separate security job's audit/history/ledger records. A git-object comparison confirmed that all 1263 non-documentation tracked objects matched the completed gate byte-for-byte; history verification passed again. This delivery record changes only this job's history and ledger.

Read back on origin/main: `participation_settings.enabled boolean not null default false`, the dry-run preview and Restore to active UI, and `v_result:=public.admin_merge_member(r.source_id,r.target_id,'Verified summer-account transfer '||r.id);` inside the approval RPC. This confirms the implementation artifact on main under the ledger definition, without claiming signed-in production behavior.

[Migrate run 42448574390](https://github.com/FRC-Team-5669-Techmen/frc-app/actions/runs/42448574390) succeeded with the database configured. Its Apply pending migrations log states `applying 1: 0050`, `applied supabase/migrations/0050_roster_accounts.sql and recorded 0050 (529 ms)`, then `done: 1 applied.` The rollback-only RLS test was not applied by Migrate. [CI run 42448574480](https://github.com/FRC-Team-5669-Techmen/frc-app/actions/runs/42448574480) and Connector tools succeeded, and Vercel reported success for the implementation commit. These workflow reports do not replace direct live catalog or signed-in verification.

## Not verified

No real member account, production classification, live folding switch, live transfer or outgoing email/push/Discord message was changed or exercised. No physical phone/NFC, iOS/WebKit, actual OTP/OAuth session-switching or screen-reader hardware was tested. The updated calendar-feed Edge Function requires separate deployment; its folded-access handling is tested in source, not verified as deployed. Deploy it before enabling automatic folding if the active-only security-recheck feed is installed. The Supabase connector project-list call failed because the connection requires a non-empty link_id that was not supplied by the available connection; live catalog/advisor verification is unavailable. Local PostgreSQL and fixture results do not establish production Auth/PostgREST behavior. Migrate/Vercel/CI workflow reports, when available, are recorded separately from direct live catalog or signed-in verification. The migration is delivered only by migrate.yml after push; no separate manual migration is run in this job.
