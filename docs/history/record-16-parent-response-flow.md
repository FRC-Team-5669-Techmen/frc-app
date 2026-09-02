---
title: "Parent response flow: capability-token questionnaire that gates nothing"
date: 2026-08-17
branches: []
commits: ["5c2c3a2", "a2310a9"]
migrations: ["parent_responses.sql", "parent_responses_rls_test.sql"]
subsystems: ["Member application"]
record_order: 35
---

 Earlier — Parent response flow — NEW supabase/parent_responses.sql + supabase/parent_responses_rls_test.sql + supabase/functions/send-parent-request/index.ts + supabase/functions/parent-response/index.ts + src/ParentResponse.jsx/.css + src/applicationFields.js. Supplementary parent support info that gates nothing. member_applications.parent_token is a capability key hidden from every client — and hiding it required DROPPING the table-level SELECT/INSERT grant and re-granting the other columns individually, because a bare `revoke select (col)` is a no-op while a table-level grant exists (effective column privileges are the UNION of both ACLs). That is why `select('*')` on member_applications is now an error and both call sites moved to APPLICATION_SELECT; it is also why calendar_token.sql's identical naive revoke is FLAGGED as probably not actually blocking anything (not fixed here — its own migration). parent_responses is staff-select-only with no write policy at all; the parent-response Edge Function (--no-verify-jwt) is its only writer and validates every enumerated field server-side. send-parent-request is JWT-verified, re-checks ownership against the JWT rather than the body, and accepts a staff resend for any application. Public /parent/:token route sits above the auth guard and is excluded from both gate early-returns. MemberApplication invokes the send after insert — failure is a note, never a rollback. ApplicationsPage detail modal gained a read-only response block + resend button. RUN supabase/parent_responses.sql AND deploy parent-response with --no-verify-jwt before testing. NOT DONE: parent responses are not in the applications CSV export.