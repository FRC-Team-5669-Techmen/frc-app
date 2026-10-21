# Retained execution evidence

`2026-10-21/` contains actual command output and machine-readable assertions from the resumed review run. These are local software checks, never a certification or production acceptance record. Scope and limitations are in `../VERIFICATION.md`.

- `features.json` preserves all 1,749 assertions from the 15-feature Chromium run; phone means 375px Chromium touch emulation, not a real phone.
- `unit.log` is the 940-test combined suite after a clean repaired install. The initial checkpoint had 934 historical tests.
- `postgres16.log` and `postgres17.log` run real local PostgreSQL, repository auth/storage/cron/network stand-ins and fictional members. Each has 573 SQL checks and 17 permissive mutants. PostgreSQL 17 also runs seven separate-connection race assertions. The earlier PostgreSQL 17 log includes the then-current 17-check PWA run; use `pwa.log` for the final 19-check result.
- `pwa.log` and `pwa.json` run an actual production build, Chromium, service worker, IndexedDB, Supabase JS, local PostgREST and PostgreSQL. Only Auth issuance is synthetic; functions have a local not-configured stub. No provider or Discord request is made.
- `ci.json` records the GitHub Actions run independently executed on Node 22/npm 10. The missing nested esbuild lock entries were repaired; no existing pinned package version changed.

The browser/SQL harnesses are retained in `tools/` so these checks can be rerun. Screenshots are fictional fixture views, not production data or physical-device evidence. No private original handoff, credentials or real member records are included.
