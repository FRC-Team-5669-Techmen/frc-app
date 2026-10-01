# IDEA certifications sync: the contract

Written for the session that builds the IDEA Classroom side (`pina-hash/idea-app`, ideabosco.com).
This file describes the **receiving end**, which is built and lives in the Techmen app
(`FRC-Team-5669-Techmen/frc-app`). Build the sending end against this file. **Every field name
in it is authoritative**: it matches `supabase/migrations/0001_idea_certifications_mirror.sql`
character for character, and `tests/idea-certs-contract.test.js` fails if the two drift.

## What the Techmen app is, in this relationship

Decided by Mr. Pina on 2026-09-30:

- Certifications are the official **IDEA certifications**, open to any Bosco Tech student whether
  or not they are on the robotics team.
- **IDEA Classroom is the one official record.** A certification is awarded there, and only
  there, once every requirement is checked off. Suspending, revoking and expiring happen there too.
- **The Techmen app is a read-only mirror.** It receives an automatic, one-way copy so every
  team member can see who holds which certification. Nothing in the Techmen app awards, edits or
  revokes a certification, and nothing in it ever writes back to IDEA Classroom.
- Team role selection (official driver, drive team and so on) stays in the Techmen app and is
  **not** a certification. It is not part of this sync.

## How IDEA Classroom calls it

One HTTP request, from the IDEA Classroom **server** (never from a browser):

```
POST <TECHMEN_SUPABASE_URL>/rest/v1/rpc/idea_cert_sync
apikey: <TECHMEN_SUPABASE_ANON_KEY>
Authorization: Bearer <TECHMEN_SUPABASE_ANON_KEY>
Content-Type: application/json

{ "p_secret": "<TECHMEN_CERT_SYNC_SECRET>", "p_snapshot": { ...the snapshot below... } }
```

The same call through supabase-js, server side:

```js
const techmen = createClient(env.TECHMEN_SUPABASE_URL, env.TECHMEN_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
const { data, error } = await techmen.rpc('idea_cert_sync', {
  p_secret: env.TECHMEN_CERT_SYNC_SECRET,
  p_snapshot: snapshot,
})
```

The three values are server-only environment variables on the IDEA side, read through
`$env/dynamic/private`, **never** `PUBLIC_`-prefixed, never sent to a browser, never logged:

| variable | what it is | where the value comes from |
| --- | --- | --- |
| `TECHMEN_SUPABASE_URL` | the Techmen Supabase project URL, `https://<project-ref>.supabase.co` | Mr. Pina, from the Supabase dashboard. **This repository does not carry the project ref**, so it is a placeholder here on purpose; do not guess it. |
| `TECHMEN_SUPABASE_ANON_KEY` | the Techmen project's public anon key | Mr. Pina, from the Supabase dashboard (Project Settings, API). It is the same key the Techmen web app ships to browsers, so it grants nothing by itself; the secret below is the credential. |
| `TECHMEN_CERT_SYNC_SECRET` | the shared secret | Mr. Pina generates it and sets it by hand. See "The secret". |

Only the anon key is needed. **Never use the Techmen service-role key** for this: the function
is granted to the anon role precisely so that the IDEA side holds nothing more powerful than a
secret that can do exactly one thing.

## When IDEA Classroom calls it

- **After every change** to the record: an award, a suspension, a reinstatement, a revocation, an
  expiry, a correction to a holder's name or email, and any change to the catalog (a new
  certification, a renamed one, a changed definition, one retired).
- **On a schedule**, as a full resync, whether or not anything changed. Daily is the minimum;
  hourly is fine (the payload is small). This is what heals a missed call, and it is what turns an
  `active` certification whose `expires_at` has passed into a row IDEA itself reports as `expired`.

A burst of changes may be coalesced into one call, because every call carries everything.

## Full snapshot, every time

Every call carries the **entire** current record: every certification in the catalog and every
holder row, of every status. Never a delta, never "just the new award".

The Techmen app replaces its whole mirror with what it receives, in one transaction. So:

- **Idempotent**: sending the same snapshot twice leaves the mirror exactly as one call would.
- **Self-healing**: a call that was missed, failed or arrived out of order is corrected by the
  next one.
- **Leaving something out deletes it from the mirror.** A holder row missing from the snapshot is
  gone from the Techmen app after the call. An empty `holders` array empties the holder list; an
  empty `catalog` (with empty `holders`) empties the mirror. Send revoked, suspended and expired
  rows; do not filter them out.
- **Retire a certification with `"active": false`, never by dropping it**, while any holder row
  still uses its code. A holder whose `code` is not in the same snapshot's catalog refuses the
  whole call.

## The snapshot

A JSON object with exactly these three keys. Keys not listed anywhere in this document are
**ignored**. Every key that IS listed must be **present** in every object, with `null` where the
table allows it: presence is required so a misspelled key refuses the call instead of silently
dropping data.

| key | type | rules |
| --- | --- | --- |
| `source_revision` | string or null | Free text the Techmen app stores in its sync log so a sync can be traced back to IDEA's state. Use something monotonic, such as the timestamp or id of IDEA's latest change. |
| `catalog` | array | Every certification definition. |
| `holders` | array | Every holder row, of every status. |

### A catalog entry

| key | type | rules |
| --- | --- | --- |
| `code` | string | The certification's identity, like `SAFE-1`. Unique within the catalog. Non-empty, at most 64 characters, no leading or trailing spaces. |
| `name` | string | Non-empty. |
| `level` | integer | A JSON number with no fractional part (`2` and `2.0` are both accepted). |
| `category` | string | Non-empty. The Techmen page groups certifications by it. |
| `definition` | string or null | What the certification means. |
| `allows` | string or null | What a holder may do. |
| `does_not_allow` | string or null | What a holder may still not do. |
| `prerequisites` | array of strings | Codes of other certifications **in the same catalog**. `[]` when there are none, never null. A code not in the catalog refuses the call. |
| `renewal` | string or null | How and when it is renewed, as text. |
| `active` | boolean | `false` means no longer offered. Keep it in the catalog while any holder row uses it. |
| `sort_order` | integer | IDEA's display order. The Techmen page orders certifications by it, then by level, then by code, and orders categories by their earliest certification. |

### A holder row

One row per **award**, identified by its serial. A student re-awarded a certification after a
revocation has two rows with two serials; that is expected.

| key | type | rules |
| --- | --- | --- |
| `serial` | string | Assigned by IDEA Classroom. Unique within the snapshot. Non-empty, at most 128 characters, no leading or trailing spaces. |
| `email` | string | **Lowercase**, one address, no spaces. This is the ONLY link to a Techmen account: see "Who the Techmen app thinks a holder is". |
| `holder_name` | string | Non-empty. Shown as-is; the holder need not have a Techmen account. |
| `code` | string | Must be a `code` in this snapshot's `catalog`. |
| `status` | string | Exactly one of `active`, `suspended`, `revoked`, `expired`. |
| `awarded_at` | string | ISO 8601 instant **with an offset**, like `2026-09-30T17:05:00Z` or `2026-09-30T10:05:00-07:00`. A bare local time is refused (it would be read in UTC and shift by hours). |
| `awarded_by_name` | string | Non-empty. The name of whoever signed it off in IDEA. |
| `expires_at` | string or null | Same format as `awarded_at`, or null for no expiry. |

### Worked example

Fictional people throughout.

```json
{
  "source_revision": "idea-certs-2026-10-01T17:05:00Z",
  "catalog": [
    {
      "code": "SAFE-1",
      "name": "Shop Safety",
      "level": 1,
      "category": "Safety",
      "definition": "Knows the shop rules, the PPE for each station and the emergency stops.",
      "allows": "Working in the shop under supervision.",
      "does_not_allow": "Operating any powered machine.",
      "prerequisites": [],
      "renewal": "Every school year.",
      "active": true,
      "sort_order": 1
    },
    {
      "code": "MILL-2",
      "name": "Manual Mill Operator",
      "level": 2,
      "category": "Machining",
      "definition": "Sets up and runs the manual mill for simple parts.",
      "allows": "Running the manual mill with a mentor in the room.",
      "does_not_allow": "Running the CNC router.",
      "prerequisites": ["SAFE-1"],
      "renewal": null,
      "active": true,
      "sort_order": 10
    }
  ],
  "holders": [
    {
      "serial": "IDEA-C-000101",
      "email": "jordan.example@boscotech.edu",
      "holder_name": "Jordan Example",
      "code": "SAFE-1",
      "status": "active",
      "awarded_at": "2026-09-30T17:05:00Z",
      "awarded_by_name": "Ms. Sample",
      "expires_at": "2027-06-30T07:00:00Z"
    },
    {
      "serial": "IDEA-C-000102",
      "email": "jordan.example@boscotech.edu",
      "holder_name": "Jordan Example",
      "code": "MILL-2",
      "status": "suspended",
      "awarded_at": "2026-09-30T18:20:00Z",
      "awarded_by_name": "Ms. Sample",
      "expires_at": null
    },
    {
      "serial": "IDEA-C-000103",
      "email": "casey.example@boscotech.edu",
      "holder_name": "Casey Example",
      "code": "SAFE-1",
      "status": "revoked",
      "awarded_at": "2026-09-15T16:00:00-07:00",
      "awarded_by_name": "Mr. Placeholder",
      "expires_at": null
    }
  ]
}
```

## What comes back

**Success is HTTP 2xx AND `ok === true` in the body. Treat everything else as a failure.**

| outcome | HTTP | body | what happened | what IDEA should do |
| --- | --- | --- | --- | --- |
| applied | 200 | `{"ok": true, "catalog_count": 2, "holder_count": 3, "synced_at": "...", "log_id": 41}` | The mirror now equals the snapshot. One log row written. | Nothing. |
| snapshot refused | 422 | `{"ok": false, "error": "2 problem(s): holders[1] (IDEA-C-000102): ...", "problem_count": 2, "log_id": 42}` | **Nothing in the mirror changed.** The whole call is refused on any problem, after the WHOLE snapshot is checked, so `error` lists every problem found (the first 20 spelled out, the count always exact). One log row with `ok = false` records the refusal so Techmen staff can see why the mirror stopped updating. | Fix the data, then send again. Do not retry the same snapshot: it will be refused the same way. |
| secret refused | 403 | PostgREST error, SQLSTATE `28000`, message `idea_cert_sync: refused` | A wrong, empty or missing secret, or no secret configured on the Techmen side yet. The message deliberately does not say which. **Nothing is written, not even a log row** (the endpoint is reachable with the public anon key, so logging these would let anyone fill the log). | Alert a person. Do not retry in a loop. |
| not set up | 404 | PostgREST error `PGRST202` | Migration 0001 has not been applied on the Techmen database yet. | Alert a person; the scheduled resync will succeed once it is applied. |
| bad anon key | 401 | PostgREST error | `TECHMEN_SUPABASE_ANON_KEY` is wrong. | Alert a person. |
| network error, 5xx | 5xx / none | none or a gateway error | Transient. | Retry with backoff. Retrying is always safe: every call is a full snapshot. |

Messages in `error` name problems by array index and serial or code. They never echo a holder's
email.

## The secret

- **Mr. Pina generates it** on his own machine: 64 hexadecimal characters, for example the output
  of `openssl rand -hex 32`. (bcrypt reads only the first 72 bytes, so do not use anything longer.)
- **On the Techmen side** he stores only its bcrypt hash, by running the one statement given in the
  header of `supabase/migrations/0001_idea_certifications_mirror.sql` in the Supabase SQL editor,
  with the secret pasted in place of `<PASTE SECRET>`. The plain secret is never stored there.
- **On the IDEA side** he sets the same value as the server-only environment variable
  `TECHMEN_CERT_SYNC_SECRET`, by hand.
- It never appears in either repository, a test, a log line, an error report or a chat.
- **Rotation**: generate a new one, run the Techmen statement with it (the old secret stops working
  at once), update `TECHMEN_CERT_SYNC_SECRET` and redeploy. Calls in between get the 403 above; the
  next scheduled resync heals the mirror.

## Who the Techmen app thinks a holder is

- **By lowercased email, and by nothing else.** The mirror has no member id. A holder need not have
  a Techmen account at all: the certifications are open to every Bosco Tech student.
- A member sees a certification as **theirs** when the holder row's `email` equals the email they
  sign in to the Techmen app with, lowercased. Students sign in with their school Google account,
  so **send the student's school email** (`@boscotech.edu`). A row sent under a personal address
  will show in the team list but will not be recognised as that student's own.
- A parent sees only the rows whose `email` equals the sign-in email of a student linked to them
  in the Techmen app (staff create those links). Same rule: the school email is what matches.

## What the Techmen app guarantees

1. **Read-only.** No Techmen user, staff or admin can insert, update or delete a mirror row; every
   client write privilege is revoked and there is no write policy. `idea_cert_sync` is the only
   writer.
2. **All or nothing.** A call is applied completely or not at all. Nothing is written before the
   whole snapshot has passed validation.
3. **Full replace.** After an accepted call the mirror is exactly the snapshot, no more and no less.
4. **Serialized.** Two overlapping calls never interleave; the second waits for the first.
5. **`synced_at`** on every catalog and holder row is stamped by the Techmen database at the moment
   the call was applied. It is not read from the snapshot.
6. **Only an active row whose `expires_at` has not passed counts as held.** Suspended, revoked and
   expired rows are shown as what they are and never counted. An `active` row whose `expires_at`
   has already passed is shown as expired even before IDEA resyncs it.
7. **Who can read what**: the catalog, to any approved Techmen account; every holder row, to staff
   and to approved members who are not parent-only accounts; a parent-only account, only their
   linked students' rows; the sync log, to staff only; the stored secret hash, to nobody.
8. **It never calls IDEA Classroom.** The flow is one-way.

## Not part of this contract

- No partial or delta updates.
- No per-row acknowledgement: the response is for the whole snapshot.
- No team roles (driver, drive team and so on); those stay in the Techmen app.
- The Techmen app's older skills / certify system (`skills`, `member_skills`, `cert_requests`) is
  untouched by this and still runs beside it. Retiring it is a separate, later decision.
