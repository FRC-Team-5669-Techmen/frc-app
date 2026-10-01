# `src/dev/fixture/` -- fixture mode (dev only)

Runs the REAL app, every real route and component, against an in-memory fake
Supabase client seeded with fictional data, so a route behind sign-in can be
driven in a real browser from a clean checkout with no credential.

```bash
npm run dev:fixture          # vite --mode fixture, http://127.0.0.1:5401 (FIXTURE_PORT or --port to move it)
open http://127.0.0.1:5401/_fixture
npm run test:checkin         # the standing check-in / check-out end-to-end test
node tools/e2e/shoot.mjs --persona admin --widths 375,1440 --routes all --out artifacts/shots/x
```

**It never reaches production.** Fixture mode exists only under
`vite --mode fixture` (`npm run dev:fixture`). In that mode a Vite plugin in
`vite.config.js` resolves `src/supabase.js` to `src/dev/fixture/client.js`; in
any other mode that plugin is not even constructed. A production build
(`vite build`, mode `production`) never resolves anything in this directory,
and the `/_fixture` control route is created only when `import.meta.env.DEV`
(same pattern as `/_ds`), so `dist/` contains neither and `/_fixture` renders
the same 404 element as `/_ds` there. `client.js` carries a marker string
(`FIXTURE_MARKER`) that the production-build check greps `dist/` for and
requires ABSENT (`tools/e2e/README.md`).

## Files

| file | what it is |
| --- | --- |
| `client.js` | The stand-in for `src/supabase.js` (same named export `supabase`). Browser shell: persistence, controls, auth, storage, Edge Functions, `window.__fx`. |
| `engine.js` | The fake PostgREST: query builder, filters, embeds, writes, constraints, RPC dispatch. **Pure** -- no window, no storage -- so `tests/fixture-client.test.js` drives it under node. |
| `schema.js` | **Generated** (`tools/e2e/gen-fixture-schema.mjs`) from a Postgres with every frozen `supabase/*.sql` applied: columns, defaults, NOT NULL, enum CHECKs, unique keys (partial ones too), foreign keys, unreadable columns, RPC signatures. Do not edit by hand. |
| `core.js` | The core plugin (same shape as a feature plugin, no migration): seed, RPCs, read filters, Edge Functions for everything already in production. |
| `seed.js` | The core seed. Fictional people, deterministic (fixed-seed PRNG), relative to the fixture clock in America/Los_Angeles. |
| `rpcs.js` | One handler per RPC the app calls, modelled on its SQL body: same permission check, same raised message, same writes, same return shape. |
| `personas.js` | Who can be signed in. Ids match the Postgres harness's fixture members. |
| `routes.js` | Every route in `App.jsx` with a concrete URL. `tests/fixture-routes.test.js` holds it equal to App.jsx. |
| `time.js` | LA wall-clock helpers for seeds. |
| `FixturePage.jsx` | The `/_fixture` control page. |
| `features/` | One file per feature (the contract below). May be empty. |

## Fidelity: what the fake does and does not model

It answers from the real catalog, so a client mistake fails here the way it
fails against the live project:

- a column the table does not have: select/filter/order -> `42703`, insert/update payload -> `PGRST204`;
- `select('*')` on a table with a column `authenticated` cannot read -> `42501` (`member_applications.parent_token`);
- a missing table -> `PGRST205`, a missing RPC **or an RPC called with argument names its deployed signature does not have** -> `PGRST202`, an embed with no foreign key -> `PGRST200`, an ambiguous one -> `PGRST201`;
- NOT NULL (`23502`), enum-shaped CHECKs such as `attendance_events_method_check` (`23514`), unique keys including partial ones such as `surveys_one_open_idx` (`23505`), foreign keys (`23503`), `ON DELETE CASCADE` / `SET NULL`; a feature's `alters` relaxes the first two only while its migration is applied;
- **seed rows are typed too**: an `id` that is not a uuid in a uuid column, or an explicit `null` in a NOT NULL column (an explicit null never takes the column default, in Postgres or here), is a seed problem on `/_fixture`. The row is still stored, so the page renders, but the count must read 0;
- the SELECT policies narrower than `using (true)`, as read filters (`core.js` `CORE_VISIBLE`); a signed-out caller reads nothing;
- **UPDATE and DELETE find their rows through the read filter**, as a Postgres UPDATE finds its rows through the SELECT policy: a student's update of `feedback` matches 0 rows, silently, exactly as it does live.
- **A write with `.select()` (RETURNING) must be able to read back what it wrote**: when the new row fails the read filter the write answers `42501` ("new row violates row-level security policy") and nothing is stored, as Postgres does. The same write without `.select()` succeeds.

Not modelled: write-side RLS (a write a persona makes succeeds unless a
constraint refuses it), triggers, views, CHECKs that are not enum lists
(lengths, ranges, cross-column rules), and column types beyond the coercions
in `engine.js` `coerceIn`. Timestamps are stored and returned in
`toISOString()` form (`...Z`), not PostgREST's `+00:00` form.

**Answers arrive after a timer, never on a microtask** (`__fx_latency`,
default 25 ms). A real request is never answered inside the frame that made
it; answering on a microtask let React commit an auth update before React
Router committed a navigation, and manufactured a redirect race that does
not exist against a network (measured: lost at microtask speed, held at 0, 5
and 25 ms).

Three places where the generated catalog was patched by hand, each with its
reason in `tools/e2e/gen-fixture-schema.mjs`: `profiles.geofence_exempt` (read
by the check-in pages, created by NO SQL file in the repo), `events.kind`
gaining `training` and `app_settings.updated_at` (both depend on the order the
frozen files were applied in; the fixture follows CLAUDE.md's account of the
live order).

## The contract a feature fixture follows

One file per feature under `features/`, picked up by `import.meta.glob`. Never
edit another feature's file and never add rows to the core seed for your
feature: the per-feature split is what lets parallel work avoid a shared write
point. The file must import nothing but plain data helpers and have no side
effects. `features/core-*.js` names are reserved for the infra lane.

```js
// src/dev/fixture/features/<feature>.js
export default {
  // The migration that creates the objects below. While the fixture is set to
  // "that migration not applied", every table/rpc/column listed in `creates`
  // answers exactly as PostgREST does for a missing object (see "Errors").
  migration: '0001',            // or null for a feature with no migration
  creates: {
    tables: ['idea_cert_catalog'],
    rpcs: ['idea_cert_sync'],
    // New columns on existing tables, as a list of names, or as an object
    // { col: { default, type } } when an insert should default it. Listing
    // columns for one of YOUR new tables makes that table strict (unknown
    // columns refused); otherwise a new table accepts any column.
    columns: { feedback: ['tried'] },
  },
  // Changes the migration makes to a column that ALREADY EXISTS, applied only
  // while the migration is: `nullable: true` drops a NOT NULL, `values`
  // REPLACES an enum CHECK's list (give the whole new list, old values
  // included). Before the migration the old constraint refuses (23502 /
  // 23514) exactly as the live table does, which is what a client's fallback
  // to the old shape must be tested against. Seed rows are judged with every
  // migration applied, so a value your migration makes legal is not a seed
  // problem.
  alters: {
    feedback: { category: { nullable: true }, status: { values: ['new', 'done', 'open', 'reviewed', 'dismissed'] } },
  },
  // Seed rows. For a table that already exists in core, rows are APPENDED, and
  // missing columns get the schema default. `({ ids, now, uuid })` -> rows:
  // `ids` holds the persona ids (personas.js IDS) and the fixed core row ids
  // (seed.js CORE_IDS: seasonOff2026, buildNow, surveyOpen, appStudent...),
  // `now` is the fixture clock
  // at reset. Constraint problems are reported in window.__fx.seedProblems
  // and on /_fixture, never thrown.
  seed: ({ ids, now }) => ({ idea_cert_catalog: [ /* ... */ ] }),
  // RPC handlers: ({ args, db, user, persona, now, engine, uuid, error }) -> { data, error }
  // Write through engine.insertRow / updateRows / deleteRows (service role:
  // no read filter, constraints still apply). A call is one transaction: when
  // the handler returns an error or throws, every write it made is undone.
  // A handler for an RPC that
  // already exists in core replaces it only while this migration is applied;
  // otherwise core's handler and core's argument check answer. An existing
  // function listed in creates.rpcs WITHOUT a handler (a new signature only)
  // keeps answering through core's handler, minus the old argument check.
  rpcs: { idea_cert_sync: ({ args }) => ({ data: { ok: true }, error: null }) },
  // Embeds: `select('*, profiles!feedback_member_id_fkey(full_name)')`.
  // Core tables embed through their real foreign keys automatically; declare a
  // relation only for a NEW table. key: '<table>.<embed name or fk hint>'.
  relations: {
    'feedback.profiles': { local: 'member_id', foreign: 'id', table: 'profiles', one: true },
  },
  // Optional row-level read filter, applied to every select on these tables
  // (and to the row lookup of update/delete), so a fixture can model "a
  // student cannot see this" without a database.
  // ({ table, row, user, persona, db }) -> boolean
  visible: { idea_cert_sync_log: ({ persona }) => persona.isStaff },
  // Optional Edge Function stand-ins: ({ body, user, persona, db, now, engine }) -> { data, error, status }
  functions: { 'my-function': () => ({ data: { ok: true }, error: null }) },
}
```

`persona` in a handler or filter is `{ key, id, email, name, roles, isStaff, isAdmin, isParent }`, roles read
from `member_roles` in the store at call time.

## Personas

`student` (Sam, c1), `student2` (Riley, c2), `exempt` (Casey, c3, `geofence_exempt`), `mentor` (Max, b1),
`admin` (Ada, a1), `parent` (Pat, d1, linked to Sam through `guardian_links`), `pending` (Una, e1,
unapproved: `claim_profile` answers false), and `signedout`. Every student persona holds an application for
the season spanning today, or App.jsx's application gate would swallow every route. In the CORE seed Sam, Riley
and Casey have no attendance today (a feature may add some; `npm run test:checkin` clears today's rows for the
personas it drives before its first step, so it does not depend on that); four other members are checked in right
now, and a build event covers now, so the shop reads open.

## Controls

Set by `/_fixture` (the control page) or by query string on ANY route, e.g.
`/dashboard?__fx=persona:student,mig:none,reset`. Persisted in `localStorage`;
the `__fx` parameter is stripped from the URL before the router reads it.

| key | values | meaning |
| --- | --- | --- |
| `__fx_persona` | `student` `student2` `exempt` `mentor` `admin` `parent` `pending` `signedout` | who is signed in (default `student`) |
| `__fx_mig` | `all` (default), `none`, or a list like `0001,0003` | which new migrations count as applied. In the query string a bare number continues the list: `mig:0001,0003` |
| `__fx_latency` | milliseconds, default 25 | how long a query or RPC takes to answer |
| `__fx_db` | JSON | the persisted store, so a navigation or reload keeps writes |
| `reset` | (flag) | drop `__fx_db` and reseed |

The store also reseeds by itself when it was seeded on an earlier LA day (its
"now" would be stale) or by different seed code (a plugin was added or changed).

`window.__fx` exposes `{ supabase, db, reset(), persona, setPersona(key), migrations, setMigrations(v), latency,
setLatency(ms), calls, seedProblems, rows(table), insert(table, row), patch(table, match, values), plugins,
migrationNumbers, marker }` for a test to read and assert on. `setPersona` emits `SIGNED_IN` /
`SIGNED_OUT` to `onAuthStateChange` listeners as supabase-js does, so a mounted app reacts (App.jsx
completes a pending NFC check-in on it). `calls` logs every query, RPC and function call with the error
code it got, which is how `shoot.mjs` reports the error answers a page received.

Auth: `getSession`/`getUser`/`refreshSession` answer for the current persona; `onAuthStateChange` delivers
`INITIAL_SESSION` asynchronously and returns `{ data: { subscription: { unsubscribe } } }`; `signOut`
switches to `signedout`; `signInWithOtp` / `verifyOtp` / `signInWithOAuth` are harmless no-ops (the persona
switch is the sign-in). Storage records uploads in the store and hands back object URLs (or a placeholder
image) from `createSignedUrl(s)` / `getPublicUrl`. `functions.invoke` and a plain `fetch` to
`VITE_SUPABASE_URL/functions/v1/<name>` (ParentResponse.jsx uses the latter) both go to the function
stand-ins; an unknown function answers `{ ok: true, skipped: true }`. Realtime channels are no-ops.

## Errors (what "missing" looks like)

Matches PostgREST so `src/schemaMissing.js` sees the same codes it will see in
production: a missing table selects/inserts with `{ code: 'PGRST205' }`, a
missing RPC with `{ code: 'PGRST202' }`, an insert/update naming a missing
column with `{ code: 'PGRST204' }`, a select naming one with `{ code: '42703' }`,
an embed through a relation that does not exist with `{ code: 'PGRST200' }`.
An unknown table that no fixture declares answers `PGRST205` too.
