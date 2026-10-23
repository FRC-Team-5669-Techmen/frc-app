# Tooling and verification instruments

Moved verbatim from `CLAUDE.md` (Commands and Verification standard) on 2026-10-19, so `CLAUDE.md` stays short. `CLAUDE.md` links here; keep this file current in the same commit as any change to what it describes.

`test:checkin` and `test:features` each start their own fixture server (`--port` to move it) and print one summary line, `checkin e2e: N/N passed (375 and 1440)` and `features e2e: N/N passed (375 and 1440)`; read that line, not the exit code alone. `tools/e2e/README.md` documents every step and every tool.

**`ds:capture` does not run in this container, and that is not a fault to fix here.** It launches with `channel: 'chrome'`, the machine's installed Google Chrome, and fails with `Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome` — only the playwright build (`/opt/pw-browsers/chromium-1194/`) is present. `verify:browser` reaches the same browser through an explicit `executablePath`, which is why it works. Measured 2026-09-02.

**The status tool is fetched, not committed here.** It lives in the sibling repo and is read-only — it clones into its own temp directory, writes nothing, and collides with no open session:

```bash
curl -sfL https://raw.githubusercontent.com/pina-hash/idea-app/main/tools/idea-status.py -o /tmp/status.py
python3 /tmp/status.py --repo FRC-Team-5669-Techmen/frc-app
```

It reports standing `claude/**` branches, `main` against `integration` in both directions, and a migrations section. **That section reports everything under `supabase/*.sql` as unnumbered**: the tool keys on `NNNN_*.sql`, those files predate numbering, and the numbered ones (0001 onward, from 2026-10-01) live in `supabase/migrations/`. That is the correct reading of the tree, not a defect in the tool.

**The instruments, and what each can and cannot see:**

| | what it proves | what it cannot see |
| --- | --- | --- |
| `npm test` (vitest, `tests/`) | pure logic: hours math, anomaly pairing, the Discord engine, vocabulary drift between `src/` and the SQL files | anything rendered; anything about the live database |
| `npm run verify:browser` | real geometry, contrast, presence and console errors in a real Chromium, on `/_ds` only | every other route; those are fixture mode's |
| `npm run test:checkin` (`tools/e2e/checkin.mjs`) | check-in and check-out end to end in a real Chromium on fixture mode, at 375 (touch) and 1440: every tag tap a new tab, revisits, geofence, the volunteer switch, midnight presence, failed reads on resume | a real phone, WebKit/iOS, NFC hardware, a truly backgrounded tab, and everything fixture mode cannot see (below) |
| `npm run test:features` (`tools/e2e/features.mjs`) | nine feature specs on fixture mode at 375 and 1440, in both migration states, as staff and non-staff, every absence counted against a presence | the same |
| `npm run ds:audit` | the design system's source invariants, 30 numbered checks | what a generated deck added |
| `_rls_test.sql` siblings | an RLS boundary, run by hand in the SQL editor | anything, until somebody runs it |
| `tools/sql-harness/run.mjs` | the SQL itself on a real PostgreSQL 16 with Supabase stand-ins: every `_rls_test.sql`, mutants, two-session races | PostgREST, the real auth service, real pg_net/pg_cron, and anything about the live project |

**Fixture mode drives every route** (since 2026-10-01; `src/dev/fixture/README.md`). Under `npm run dev:fixture` a Vite plugin resolves `src/supabase.js` to an in-memory fake that answers from a catalog generated from the frozen SQL, so the real app renders every route signed in as any of seven fictional personas (or signed out), with any of migrations 0001 to 0012 on or off, from a clean checkout with no credential; `tools/e2e/` drives it in the container's Chromium. **What it can see**: a missing column, table or RPC, a wrong RPC argument name, NOT NULL, enum CHECKs, unique and foreign keys and cascades, all answered with the real PostgREST or Postgres code, and the SELECT policies narrower than `using (true)` applied as read filters, which UPDATE and DELETE find their rows through. **What it cannot see**: write-side RLS (a write a persona makes succeeds unless a constraint refuses it), triggers, views, CHECKs that are not enum lists, and anything about the live database. So a write boundary is proved only by a `_rls_test.sql`, and a fixture pass says nothing about what has been applied. A production build contains neither the fake nor `/_fixture`. `verify:browser` still drives only `/_ds`, the one route that needs no session at all.

- **`innerText` applies `text-transform`; `textContent` does not.** A copy check that compares against `innerText` reports strings missing from nodes that plainly contain them, because CSS uppercased them. Measured on `/_ds`, whose header is `v1.1.0 · /_ds · dev only` in source and `V1.1.0 · /_DS · DEV ONLY` rendered.

- **`opacity` is not inherited.** A child of an `opacity: 0` parent computes opacity 1, so any visibility check that does not walk ancestors reports elements visible while they are painted nowhere.

- **`chromium.executablePath()` points at a build this container does not have.** playwright-core 1.62.1 wants build 1234; the image ships 1194, under a differently-named directory. The resolution chain in `tools/browser-verify/browser.mjs` is load-bearing, and upgrading playwright-core would make it worse, not better — the download it would then want is not reachable.

- **`shoot.mjs --theme light|dark|system`** (ledger 0019) stores that choice under `techmen:theme` before every page load, so the page is painted exactly as for a person who picked it; it refuses a shot whose `<html data-theme>` does not match, and the file name and `shots.json` carry the theme. Use a free `--port` when another checkout's fixture server holds 5401.
