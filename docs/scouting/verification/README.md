# Hosted HTTP conflict continuation

`2026-10-21-http/` retains real isolated GoTrue/REST/Edge results (55 assertions), current 72-check hosted rollback proof and cleanup, native PostgreSQL 17.11 (72 checks / 17 mutants / seven races), 1031 unit tests, final scouting 169 and built-PWA 33 checks. The broad 1800/1801 failure, its 1632 unaffected assertions and the subsequent state-ordering fix are explicitly bounded. See its README, hashes, `HOSTED_HTTP.md` and `VERIFICATION.md`. A Vercel team-scope 403 still blocks an isolated app preview; no temporary backend remains.

---

# Extended recovery execution evidence

`2026-10-21-recovery/` contains the additional implementation run. `README.md` in that directory pins the exact source and runtime of each check; `sha256.json` pins retained files. The broad regression/soak at `254d69e` are distinguished from the later keyboard, pagination and current-main merge at `6b7feaa`. Synthetic data, local Auth stand-ins, manual accessibility gaps and field gates remain explicit.

The records below describe earlier checkpoints.

# Retained execution evidence

`2026-10-21-competition/` contains the latest 971-test, 1766-feature, 150-scouting, 51-check-in, 573-SQL/17-mutant/7-race, 22-PWA and 12-Deno logs/assertions, portable-review/oracle/gate output and fictional screenshots. The full feature run is at `7240bcb`; the latest focused checks cover the later filename/provider-key changes at `7a1ddca`. Initial resource/timing/compilation failures are retained separately. `sha256.json` pins these artifacts. Terminal blank lines at the end of two unit logs were normalized; result content is unchanged.

`staging-2026-10-21.json` records actual isolated hosted SQL/RLS (72 assertions), Edge deployment metadata, advisor summary, network blocker and branch cleanup. SQL request claims were injected; hosted Auth/HTTP was blocked. `ci-7a1ddca.json` retains independently executed Node 22/npm 10 CI summaries (971 tests).

Earlier `2026-10-21/` artifacts remain historical evidence. They have older counts and different runtime boundaries; do not relabel them as a fresh verification of later code. No artifact certifies a scout or substitutes for production/phone/human/source acceptance. See `../VERIFICATION.md` and `../STAGING.md`.
`2026-10-21/` contains actual command output and machine-readable assertions from the resumed review run. These are local software checks, never a certification or production acceptance record. Scope and limitations are in `../VERIFICATION.md`.

- `features.json` preserves all 1,749 assertions from the 15-feature Chromium run; phone means 375px Chromium touch emulation, not a real phone.
- `unit.log` is the 940-test combined suite after a clean repaired install. The initial checkpoint had 934 historical tests.
- `postgres16.log` and `postgres17.log` run real local PostgreSQL, repository auth/storage/cron/network stand-ins and fictional members. Each has 573 SQL checks and 17 permissive mutants. PostgreSQL 17 also runs seven separate-connection race assertions. The earlier PostgreSQL 17 log includes the then-current 17-check PWA run; use `pwa.log` for the final 19-check result.
- `pwa.log` and `pwa.json` run an actual production build, Chromium, service worker, IndexedDB, Supabase JS, local PostgREST and PostgreSQL. Only Auth issuance is synthetic; functions have a local not-configured stub. No provider or Discord request is made.
- `ci.json` records the GitHub Actions run independently executed on Node 22/npm 10. The missing nested esbuild lock entries were repaired; no existing pinned package version changed.

The browser/SQL harnesses are retained in `tools/` so these checks can be rerun. Screenshots are fictional fixture views, not production data or physical-device evidence. No private original handoff, credentials or real member records are included.
