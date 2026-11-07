---
title: "One app mail sender with delegated Workspace Gmail delivery"
date: 2026-11-06
branches: [main]
commits: []
migrations: []
subsystems: ["App mail", "Event family hub", "Standing", "Feedback", "Roster and access", "Parent response"]
---

The job starts at fetched/rebased `origin/main` `5aede08`. The four mail
entrypoints had independent SMTP credential and sender reads. Ledger 0027's
Reply-To already existed in all four; school From and domain-wide delegation
did not. `api/` contains no direct mail transport. Announcements are Discord;
sign-out returns are app/push, while voided-session emails go through the common
notice outbox. Invitations and OTP are sent by Supabase Auth's separate SMTP
configuration. The complete audit is in `docs/subsystems/mail.md`. The final pre-push fetch found main advanced to `4379cb7` (approved session completion, 0046). The unpublished mail commit was rebased onto it, retaining its changes and resolving the shared CLAUDE.md review line to name both bundles. The complete gate must run again on that combined tree. A subsequent fetch during that gate found `0fcb1c7`, the direction bundle's documentation-only closing record; the mail commit was rebased again and the gate restarted on that final base.

`_shared/mail.js` now owns one credential reader and both transports. Complete
`EMAIL_FROM`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` and
`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` select Gmail API with a signed RS256
assertion, delegated as the From mailbox and restricted to `gmail.send`.
Reply-To comes from the same mailbox. Callers cannot override sender headers.
The same code serializes Unicode/plain/multipart messages, caches a token for a
batch, bounds request time and sanitizes provider errors. Complete Workspace
configuration never downgrades to the old Gmail account on failure. Incomplete
configuration preserves legacy delivery, explicitly requested by the job; the
old sender remains possible during that transition. No credential still skips
without consuming an outbox. Existing authorization and data boundaries are
unchanged, so no migration or RLS boundary is introduced.

The original sender regression ran red on all four entrypoints (4 failed, 13
passed). The final focused suite is 56/56 in three files, covering both transports
and each real function with fake dependencies. Disposable RSA material proves
the JWT signature, delegated identity, scope and expiry. All eight setup states,
header injection, MIME bodies, token renewal, OAuth/send failures and no SMTP
downgrade are checked beside successful sends. Three permissive in-memory
mutants leak From, leak Reply-To and change the delegated user; the same sending
oracle rejects all three. The source inventory prevents independent mail
credential reads and direct API transports from bypassing the reader. The old
approval email's em dash also reproduced red against its original file; the
current subject, text and HTML pass without it. Source was restored from a byte
copy after the control. Its existing styling was retained.

Landing protocol: freeze this record with the implementation, run the complete
solo gate on that exact tree, and push only after reading every command's
summary. The gate is build, unit suite, design-system audit, calendar suite,
history verifier, check-in E2E and full feature E2E. `desktop-layout` in the
feature suite measures 375, 1152 and 1440 in both themes, including the mail
entry surfaces. A focused `layout-audit.mjs` run captures those surfaces again
with geometry in `artifacts/mail-layout/layout.json`. All instruments are
committed and repeatable. Final gate totals and remote commit confirmation are
reported at delivery, after this frozen record is written.

No live email, Workspace authorization, real credential, Supabase Auth SMTP
configuration or production function deployment was exercised. The functions
now have a shared dependency and require a multi-file deploy separately from
Vercel. The mail subsystem runbook numbers the exact Google Admin, Cloud,
Supabase and Vercel steps and documents authenticated TLS SMTP relay as the
alternative. Vercel needs no mail secret for these Supabase-hosted senders.
Mr. Pina or the school's administrator must authorize delegation and supply
the runtime configuration themselves; if school policy forbids it, they must
choose the relay/approved-provider alternative. No credentials were requested
or retrieved.
