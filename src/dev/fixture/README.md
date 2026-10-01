# `src/dev/fixture/` -- fixture mode (dev only)

Runs the REAL app, every real route and component, against an in-memory fake
Supabase client seeded with fictional data, so a route behind sign-in can be
driven in a real browser from a clean checkout with no credential.

**It never reaches production.** Fixture mode exists only under
`vite --mode fixture` (`npm run dev:fixture`). In that mode a Vite plugin in
`vite.config.js` resolves `src/supabase.js` to `src/dev/fixture/client.js`. A
production build (`vite build`, mode `production`) never resolves anything in
this directory, and the `/_fixture` control route is created only when
`import.meta.env.DEV` (same pattern as `/_ds`), so `dist/` contains neither.

## The contract a feature fixture follows

One file per feature under `features/`, picked up by `import.meta.glob`. Never
edit another feature's file and never add rows to the core seed for your
feature: the per-feature split is what lets parallel work avoid a shared write
point.

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
    columns: { feedback: ['tried'] },  // new columns on existing tables
  },
  // Seed rows. For a table that already exists in core, rows are APPENDED.
  // `({ ids, now })` -> rows, so seeds can reference the fixed persona ids and
  // be relative to the fixture clock.
  seed: ({ ids, now }) => ({ idea_cert_catalog: [ /* ... */ ] }),
  // RPC handlers: ({ args, db, user, persona, now, error }) -> { data, error }
  rpcs: { idea_cert_sync: ({ args }) => ({ data: { ok: true }, error: null }) },
  // Embeds: `select('*, profiles!feedback_member_id_fkey(full_name)')`.
  // key: '<table>.<embed name or fk hint>' -> how to join.
  relations: {
    'feedback.profiles': { local: 'member_id', foreign: 'id', table: 'profiles', one: true },
  },
  // Optional row-level read filter, applied to every select on these tables,
  // so a fixture can model "a student cannot see this" without a database.
  // ({ table, row, user, persona, db }) -> boolean
  visible: { idea_cert_sync_log: ({ persona }) => persona.isStaff },
}
```

## Controls

Set by `/_fixture` (the control page) or by query string on ANY route, e.g.
`/dashboard?__fx=persona:student,mig:none,reset`. Persisted in `localStorage`:

| key | values | meaning |
| --- | --- | --- |
| `__fx_persona` | `student` `student2` `mentor` `admin` `parent` `pending` `signedout` | who is signed in |
| `__fx_mig` | `all` (default), `none`, or a list like `0001,0003` | which new migrations count as applied |
| `__fx_db` | JSON | the persisted store, so a navigation or reload keeps writes |
| `reset` | (flag) | drop `__fx_db` and reseed |

`window.__fx` exposes `{ db, reset(), persona, setPersona(), setMigrations(), calls }`
for a test to read and assert on.

## Errors (what "missing" looks like)

Matches PostgREST so `src/schemaMissing.js` sees the same codes it will see in
production: a missing table selects/inserts with `{ code: 'PGRST205' }`, a
missing RPC with `{ code: 'PGRST202' }`, an insert/update naming a missing
column with `{ code: 'PGRST204' }`, a select naming one with `{ code: '42703' }`.
An unknown table that no fixture declares answers `PGRST205` too.
