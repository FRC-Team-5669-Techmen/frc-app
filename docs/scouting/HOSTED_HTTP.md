# Reproduce isolated hosted acceptance

This is an engineering workflow. The owner does not need to run commands or paste SQL. Never target production `pbuogcrhdywpzvcxbwsd`, copy student data, enable jobs, or send notifications. A shareable app link additionally requires authorized Vercel team access and a deliberately isolated preview configuration.

## October 21 finding and correction

Actual hosted password sign-in, refresh and JWT-authorized PostgREST worked after workspace networking was corrected. Stale corrections then timed out twice after 30 seconds. PostgreSQL showed the corresponding authenticator backends still executing. An isolated serialization-only probe reproduced the timeout. Supabase documents [the PostgREST 14 infinite-retry defect](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b): application-raised `40001` is treated as retryable serialization failure. The hosted instance reported PostgREST **14.18**.

Migration 0022 now returns `PT409` for stale corrections, missing correction targets and duplicate logical records. It maps to HTTP **409** without transaction retry. The queue retains the proposal as a non-retryable conflict requiring review. It still recognizes older `40001` responses. The SQL/RLS expectations, native races and fixture use `PT409`. This changes the unreleased review migration; repeat the current 0022 in isolated staging. No production migration was run.

The fixed hosted suite passed **49 assertions**, plus **three revoked-account and three restored-account assertions** with the same existing JWT. It includes six fictional accounts, real GoTrue password/refresh grants, access/manager boundaries, idempotency, all three conflict cases, authorship, revision history, direct-write refusal, private-schema exclusion, both public key formats, roster scope and deployed Edge authorization/configuration boundaries. SQL provisioning of the fictional users is explicit: this is real hosted token issuance, but not OTP email delivery or school Google OAuth acceptance.

## Repeat without production access

1. Create an authorized, data-free Supabase development branch. Let the service handle its cost confirmation. Record its own project reference. Wait for schema copy and verify prerequisites through 0021, zero users/profiles and zero cron jobs. Do not bootstrap an apparently empty catalog before copy finishes.
2. Apply the reviewed `supabase/migrations/0022_scouting.sql` twice. Review and execute the query emitted by `node tools/sql-harness/scouting-hosted-proof.mjs --emit`, only in that empty branch. Require **72 PASS** checks and zero fixtures after rollback. Keep `scouting_private` outside the Data API exposed schemas.
3. Deploy the complete `scouting-import` and `scouting-dispatch` directories to that branch, with `verify_jwt=true`. Retrieve its own legacy anon and modern publishable keys. Never obtain or expose a production service-role key for this test.
4. Create the following private configuration in ignored `work/scouting-hosted.local.json`, with mode 0600. Do not commit this file or include it in evidence archives:

   ```json
   {
     "project_ref": "ISOLATED_BRANCH_REF",
     "isolated_without_data": true,
     "anon_key": "ISOLATED_LEGACY_ANON_KEY",
     "publishable_key": "ISOLATED_PUBLISHABLE_KEY"
   }
   ```

5. Run `node tools/e2e/scouting-hosted.mjs --seed > work/hosted-seed.local.json`. Review the private SQL packet and execute its `query` only on the recorded branch. Its empty-data/job guard refuses an occupied target. It provisions six `.invalid` users, profiles/roles and one fictional training event without sending email. Passwords and later sessions remain in the private configuration. `--emit-seed` re-emits the same packet if needed; it does not regenerate identities.
6. Run `node tools/e2e/scouting-hosted.mjs --verify`. Require **49/49**. The script uses the inherited proxy and TLS trust through curl; credential headers and bodies go through stdin, not command-line arguments. Only sanitized labels/results are retained in `artifacts/scouting-hosted/`.
7. In the isolated branch, set `approved=false` for only the fictional `other` actor from the private configuration. Run `SCOUTING_HOSTED_OUT=artifacts/scouting-hosted-revoked node tools/e2e/scouting-hosted.mjs --check-revoked` and require **3/3**. Restore that same profile to `approved=true`, then run `SCOUTING_HOSTED_OUT=artifacts/scouting-hosted-restored node tools/e2e/scouting-hosted.mjs --check-restored` and require **3/3**. These phases reuse the same token and prove current database authorization on read/save without token refresh.
8. Retain sanitized results, exact source hashes, failures and runtime versions. Clean only the identified fictional fixtures with guarded SQL, rerun the rollback proof, verify zero users/profiles/records/revisions/operations/delivery/jobs/queued HTTP requests, and delete the temporary branch. Confirm branch listing and a read-only production catalog postcheck. Never leave paid test compute running merely because app hosting is blocked.

The HTTP harness never requests Discord delivery. Its dispatch body is deliberately missing a record ID, so it cannot claim or send a notification even if secrets exist. Import is read-only. TBA/Nexus keys were inaccessible in this test branch; their actual deployed responses reached `not_configured`. Public Statbotics requests returned HTTP 500 with `[]` for two event keys. Provider success and bot/channel configuration remain unverified.

If troubleshooting recreates a `40001` loop, changing the function alone does not stop an already-running transaction. Identify the exact authenticator PID in the isolated project, terminate only that test backend, and retain the failure. The three diagnostic looping backends from this run were stopped; diagnostic functions and all test fixtures disappeared with the deleted branch. No production backend was terminated.
