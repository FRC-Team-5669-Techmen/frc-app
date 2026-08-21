# Discord calendar posting (Vercel cron)

Posts the team schedule from `public.events` into the team Discord, hourly:

- **`#calendar`** — one embed per upcoming event (title, start/end in
  America/Los_Angeles, location, description).
- **`#announcements`** — a reminder 24 hours before and again 2 hours before,
  pinging the subteam role **only when the event names one**.

It is **report-only by default**. The first runs write nothing to Discord; they
log exactly what they *would* have posted. See
[Leaving report-only mode](#leaving-report-only-mode).

This is the first Vercel serverless function in the repo. Everything else
server-side lives in Supabase Edge Functions (`supabase/functions/`).

---

## Files

| Path | What it is |
|---|---|
| `api/discord-calendar.js` | The cron entrypoint: auth, env, config, response. |
| `api/_lib/discord.js` | Discord REST client. 429 handling, name→snowflake resolution. Plain `fetch`, no new runtime dependency. |
| `api/_lib/render.js` | Pure rendering: LA time formatting, embeds, subteam matching, content hash. |
| `api/_lib/calendarSync.js` | The engine: cancellation sweep → calendar posts → reminders. |
| `supabase/discord_calendar.sql` | `discord_calendar_posts` (tracking) + `discord_calendar_log` (audit). **Run this before switching to live.** |
| `scripts/discord/calendar-sync.test.mjs` | `npm run discord:calendar:test` — in-memory tests of the dedupe / edit / cancel rules. No network. |

Files under `api/` beginning with `_` are ignored by Vercel's function detection,
so only `api/discord-calendar.js` becomes a route.

---

## Environment variables

All are set in **Vercel → Project → Settings → Environment Variables**. **None
are `VITE_`-prefixed**, which is what keeps them out of the browser: Vite exposes
only `VITE_*` through `import.meta.env`, and `api/` is not part of the client
build at all.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CRON_SECRET` | **yes** | — | Vercel sends it as `Authorization: Bearer …` on cron invocations. The function **refuses to run** if it is unset — the URL is public. |
| `DISCORD_BOT_TOKEN` | **yes** | — | Bot token. Server-side only. |
| `DISCORD_GUILD_ID` | **yes** | — | The Bosco Tech Robotics guild ID. |
| `SUPABASE_URL` | **yes** | falls back to `VITE_SUPABASE_URL` | Same project URL the app uses. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | — | Needed to read `events` and write the tracking tables (both are RLS-locked to staff-read / no-client-write). **Never** put this in a `VITE_` var. |
| `DISCORD_CALENDAR_MODE` | no | `report` | Only the literal `live` enables posting. A typo, an empty value, or a missing variable all stay in report-only. |
| `DISCORD_CALENDAR_CHANNEL` | no | `calendar` | Channel **name**, not an ID. |
| `DISCORD_ANNOUNCE_CHANNEL` | no | `announcements` | Channel **name**, not an ID. |
| `DISCORD_CALENDAR_HORIZON_DAYS` | no | `14` | How far ahead to post. Clamped to 1–90. |

**No Discord snowflakes are stored anywhere in this repo.** Channels and roles
are resolved by name from the guild on every run, so renaming or recreating a
channel is picked up automatically instead of posting into a dead ID.

### Verifying the token never reaches the client

```bash
npm run build && grep -rn "DISCORD_BOT_TOKEN\|SERVICE_ROLE\|CRON_SECRET" dist/ || echo "clean"
```

Run with a canary value (`DISCORD_BOT_TOKEN=CANARY npm run build`, then
`grep -r CANARY dist/`) to prove the value itself is absent, not just the name.
Both checks are clean as of this commit.

---

## Cron schedule

Declared in `vercel.json`:

```json
{ "crons": [{ "path": "/api/discord-calendar", "schedule": "0 * * * *" }] }
```

Top of every hour, UTC. Hourly is comfortably inside the 2-hour reminder window,
so a single missed run cannot skip a reminder.

Two Vercel behaviours to know:

- **Crons only run on Production deployments.** A preview deploy never fires.
- **Hobby-plan projects are limited to one cron invocation per day.** If this
  project is on Hobby, the hourly schedule will be rejected or throttled — the
  2-hour reminder cannot work on a daily trigger. Pro is required for hourly.

Running it by hand (the same thing the cron does):

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://frc-app-liard.vercel.app/api/discord-calendar?mode=report" | jq
```

`?mode=report` can only **downgrade** a live deployment to a dry run. There is
deliberately no query param that turns posting on — that decision belongs to
`DISCORD_CALENDAR_MODE` alone.

---

## Leaving report-only mode

1. Run `supabase/discord_calendar.sql` in the Supabase SQL editor. Nothing works
   before this; the function will error on the first table read.
2. Let the hourly cron run in report mode for a day. Then read the plan:

   ```sql
   select created_at, action, post_kind, detail
   from discord_calendar_log
   where report_only
   order by created_at desc
   limit 100;
   ```

   `plan_create` / `plan_edit` / `plan_cancel` rows carry a `preview` object with
   the exact title, when/where lines, and the role IDs that would be pinged.
3. Confirm `resolve` rows found both channels (`calendar_channel` and
   `announce_channel` non-null) and a sensible `roles_seen` count.
4. Set `DISCORD_CALENDAR_MODE=live` in Vercel and redeploy (env changes need a
   redeploy to take effect).

**Report-only never writes to `discord_calendar_posts`.** A week of dry runs does
not burn any dedupe keys — the first live run posts everything as if for the
first time.

Going back is symmetrical: set it to `report` (or delete the variable) and
redeploy. Messages already posted stay posted and simply stop being updated.

---

## How double-posting is prevented

`discord_calendar_posts` has `unique (event_id, post_kind)`, and that constraint —
not application logic — is the guarantee. Each post is **reserved then sent**:

1. Insert the tracking row with `status = 'pending'`. Two overlapping runs race
   here; the loser gets `23505` and posts nothing.
2. `POST` the message to Discord.
3. Update the row to `status = 'posted'` with the `message_id`.

If step 2 fails with a definitive **4xx** (Discord rejected it, so no message
exists) the reservation is released and the next run retries. If it fails
**ambiguously** — network drop, exhausted 429/5xx retries, function timeout —
the reservation is deliberately kept as `pending` and **never auto-retried**.
A stale `pending` row is a visible, fixable state; a duplicate ping to sixty
people is not.

Everything else follows from the same row:

- **Event changed** → the rendered payload hashes differently → the stored
  `message_id` is **edited**. Never reposted.
- **Event cancelled** → `public.events` has no `cancelled` column; staff cancel
  by deleting the row. The tracking row has **no foreign key** to `events`
  precisely so it survives that delete, and `event_snapshot` holds the last known
  event so the message can still render. The message is edited to struck-through
  **CANCELLED** and kept. Nothing is ever deleted from Discord.
- **Message deleted in Discord** (`10008 Unknown Message`) → the row is marked
  `archived` and left alone. A human deleted it; the bot does not resurrect it.

### Reminder timing

| post_kind | Fires when |
|---|---|
| `reminder_24h` | `0 < starts_at − now ≤ 24h`, and **not** already inside the 2h window |
| `reminder_2h` | `0 < starts_at − now ≤ 2h` |

If the cron was down, or an event was created late, a slot whose window already
closed is written as `superseded` (no message) instead of firing hours late.

### Pings

`public.events` has no subteam column, so "the event names a subteam" is taken
literally: `api/_lib/render.js` word-matches the subteam vocabulary in the event
**title and notes** and maps it to the Discord role names in
`scripts/discord/SERVER_SPEC.md` §3. No match → no ping. `allowed_mentions` is
pinned to the resolved role IDs with `parse: []`, so `@everyone`/`@here` can
never be triggered, even by an event title containing that literal text.

`Fabrication`, `Robot Construction`, and `Field & Pit` are app subteams with no
Discord role in the spec, so they intentionally ping nobody. Add them to
`SUBTEAM_ROLE_ALIASES` once the roles exist.

---

## Backfill and resetting the tracking table

There is no separate backfill command — the engine backfills by definition:
**any event inside the horizon with no tracking row gets posted on the next run.**

**Post further ahead (backfill upcoming events).** Raise
`DISCORD_CALENDAR_HORIZON_DAYS` (e.g. `60`), redeploy, let one run happen, then
put it back. Everything newly in range is posted once and tracked.

**See what is tracked.**

```sql
select event_id, post_kind, status, channel_name, message_id, event_starts_at, updated_at
from discord_calendar_posts
order by event_starts_at desc;
```

**Force one event to be re-posted from scratch.** Delete its tracking rows. The
old Discord messages are *not* removed by this — delete them by hand first, or
you will have both.

```sql
delete from discord_calendar_posts where event_id = '<uuid>';
```

**Mute an event so it is never posted** (e.g. an internal-only entry). Insert a
terminal row per kind; the engine skips any row that is not `posted`.

```sql
insert into discord_calendar_posts
  (event_id, post_kind, channel_id, channel_name, content_hash, event_snapshot, status)
select '<uuid>', k, '0', 'muted', 'muted', to_jsonb(e), 'archived'
from public.events e, unnest(array['calendar','reminder_24h','reminder_2h']) k
where e.id = '<uuid>';
```

**Clear a stale `pending` row.** First check the channel — did the message
actually post? If yes, fill in the real `message_id` and set `status='posted'`.
If no, delete the row so the next run retries.

```sql
select * from discord_calendar_posts where status = 'pending';
-- message did post:
update discord_calendar_posts set status='posted', message_id='<snowflake>' where id='<row uuid>';
-- message did not post:
delete from discord_calendar_posts where id='<row uuid>';
```

**Full reset (start the channel over).** Destructive; every existing message
becomes untracked and will be duplicated by the next run unless you delete the
messages in Discord too.

```sql
truncate table discord_calendar_posts;
-- optional, keeps the audit trail:
-- truncate table discord_calendar_log;
```

---

## Logging and troubleshooting

Every action — including the ones not taken — lands in `discord_calendar_log`,
keyed by `run_id`.

```sql
select created_at, action, event_id, post_kind, detail
from discord_calendar_log
order by created_at desc
limit 50;
```

| `action` | Means |
|---|---|
| `run_start` / `run_end` | Bookends; `run_end.detail` is the run summary. |
| `resolve` | Which channels/roles were found by name. Null channel = the run aborted. |
| `plan_create` / `plan_edit` / `plan_cancel` | Report-only mode. What *would* have happened. |
| `created` / `edited` / `cancelled` | Live writes, with the `message_id`. |
| `superseded` | A reminder window closed before it could fire. |
| `skipped` | With a `reason`: `pending_stale`, `already_reserved`, `role_lookup`. |
| `rate_limited` | A 429 was honoured, with the `retry_after_ms` the API asked for. |
| `message_missing` | The message was deleted in Discord; the row is now `archived`. |
| `error` | Includes `phase` (`reserve`/`create`/`edit`/`cancel`) and whether the reservation was `released`. |

Both tables are RLS **staff-read, no-client-write** — only the service role
writes them.

Rate limits are honoured off the `retry_after` the API returns (body first,
`Retry-After` header as fallback), never a fixed delay, and the client parks
proactively when a bucket reports `x-ratelimit-remaining: 0`.

**Bot permissions needed in the guild:** View Channel, Send Messages, and Embed
Links in `#calendar` and `#announcements`, plus Manage Messages is *not* needed —
a bot can always edit its own messages.

---

## Local testing

```bash
npm run discord:calendar:test
```

Runs the dedupe / edit / cancel / reminder rules against in-memory fakes,
including a fake `unique (event_id, post_kind)` constraint. No network, no
credentials, no Discord.
