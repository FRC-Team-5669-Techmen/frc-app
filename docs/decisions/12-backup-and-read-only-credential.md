# 12 Is the Supabase project on a plan with point-in-time recovery, and may CI hold a read-only database credential for a nightly backup and a deploy probe?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 60)
- Status: open
- Default if nobody decides: **no backup and no probe exist; nothing changes.**
  Before pasting any migration, take a manual backup (the Dashboard's backup,
  or `pg_dump`). A session asked to work here writes a paste-ready read-only
  probe query first (one row per numbered migration, naming its objects and
  whether each exists), and adds a credential only after the plan is confirmed.
- Decided: --

## What is actually true right now

- `.github/workflows` holds `ci.yml`, `deploy.yml` and `integrate.yml`. None
  takes a backup, and none reads a credential.
- Admin removals are hard deletes, and SQL is pasted by hand.
- Nothing records which migrations are live. Four numbered migrations (0001 to
  0004) were added on 2026-10-01 and none is applied anywhere real; the app's
  code for them is on `main` and degrades until they are pasted.
- The Supabase plan and point-in-time recovery are unverified.
- idea-app has a nightly logical dump stored off Supabase (`backup.yml`,
  written for a free plan with no PITR), a deploy probe that reads production's
  catalog per migration, and a record of applied migrations.

## The options

**A. A read-only secret in GitHub (M).** Enables both the nightly backup and
the probe. The cost is a production credential in CI, limited by a read-only
role.

**B. Rely on paid point-in-time recovery.** Costs money. Covers restore, not
knowing what is applied.

**C. Manual only (the default until A).** Depends on someone remembering,
before every paste.
