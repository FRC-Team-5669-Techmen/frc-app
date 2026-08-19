# Discord server provisioning

`provision.js` builds the FRC 5669 Techmen Discord server from `SERVER_SPEC.md`
in one run — guild settings, Community enablement, roles, categories, channels,
AutoMod and onboarding.

`SERVER_SPEC.md` is the source of truth. The script **parses that markdown at
runtime**: the role table, every channel permission matrix, the safety section
and the onboarding questions. Edit the spec, re-run, and the plan changes. There
is no second copy of the structure to keep in sync.

---

## Prerequisites

**1. A bot application with Administrator in the target guild.**

Discord will not let a bot grant a permission it does not itself hold, and the
spec's top role is `Administrator`. Anything less and phase 4 fails partway.

- Create the app at <https://discord.com/developers/applications>
- Bot → reset/copy the token
- OAuth2 → URL Generator → scope `bot`, permission `Administrator` → invite it
- **In Server Settings → Roles, drag the bot's own role to the TOP of the list.**
  Discord will not let a bot create or move a role at or above its own highest
  role, and a bot cannot raise itself. The spec places 14 roles at positions
  1-14, so the bot needs position 15 or higher.

  Phase 4 pre-flights this and refuses to start otherwise:

  ```
  The bot's own role ("Techmen Bot") is at position 1, but the spec places 14
  roles at positions 1-14, so the bot needs position 15 or higher.
  ```

  Without that check the run creates all 14 roles and only then fails on the
  position PATCH with a bare `50013 Missing Permissions`, leaving the guild
  half-built. This is the single most common reason a first apply fails.

**2. Node 20.6+** (uses `--env-file`). Dependencies are already in the repo's
`package.json`:

```bash
npm install
```

**3. Credentials.** Copy `.env.example` to `.env.local` in the repo root and
fill it in:

```
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
```

`.env.local` is gitignored (along with `.env.local.*` and `.env.*.local`).
Never commit a token. The script reads plain `process.env` too, so CI can inject
the values instead.

---

## Dry run

Default mode. Read-only — it issues `GET` requests and nothing else.

```bash
npm run discord:plan
```

Equivalent to `node --env-file-if-exists=.env.local scripts/discord/provision.js`.
Any of these work the same way:

```bash
node --env-file=.env.local scripts/discord/provision.js
DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/discord/provision.js
```

It prints the full plan grouped by phase, with a create/update/delete/skip count
per phase, then:

- **UNMANAGED** — anything in the guild the spec does not describe. Reported,
  never touched. The only deletion the script can perform is the AutoMod
  single-slot exception described below.
- **MUST BE DONE BY HAND** — what the Discord API cannot set.
- **WATCH** — the parts most likely to fail on a first apply, and why.

If `DISCORD_BOT_TOKEN` or `DISCORD_GUILD_ID` are missing it says so and stops.
It never guesses a value and never contacts anything.

To review the plan with no credentials at all — useful when reviewing a spec
change — use offline mode, which simulates an empty guild:

```bash
npm run discord:offline
```

Add `--verbose` to any run to list the items that already match, not just the
changes.

---

## Apply

```bash
npm run discord:apply
```

`--apply` is required to write. Phases run in a fixed order because each one
depends on ids created by the last:

| # | Phase | Why here |
|---|---|---|
| 1 | Guild settings | Community is rejected below the verification / content-filter minimums, so these are set first |
| 2 | Community prerequisite channels | `#welcome` and `#mod-log` must exist before they can be named as rules / public-updates channels |
| 3 | Community enablement | `PATCH /guilds/{id}` adding `COMMUNITY` to `features` plus both channel ids |
| 4 | Roles | Channel overwrites reference role ids |
| 5 | `@everyone` | Denies View Channels guild-wide — the click the whole access model rests on |
| 6 | Categories | Permissions live here |
| 7 | Channels | Category baseline plus per-channel differences, written in full |
| 8 | AutoMod | Alert actions need the `#mod-log` id |
| 9 | Onboarding | Answer options need the subteam role ids |

Neither `#welcome` nor `#mod-log` has a category or permissions in phase 2 —
no roles exist yet. Phase 7 files them into `START HERE` / `MENTORS` and applies
the matrix.

**On failure the run stops immediately**, prints everything already written, and
exits non-zero. There is no rollback. Fix the cause and re-run: the script is
idempotent, so it skips what already landed and picks up where it stopped.

Rate limits are handled off the `retry_after` Discord returns, never a fixed
sleep — `@discordjs/rest` parks on the bucket reset, and an outer guard catches
global 429s the client re-throws. Creating thirty-nine channels and categories
will hit limits; that is expected and the run just takes longer.

---

## Re-running after spec edits

This is the normal workflow. Edit `SERVER_SPEC.md`, then:

```bash
npm run discord:plan     # read the diff
npm run discord:apply    # land it
npm run discord:plan     # confirm: zero creates, zero updates, zero deletes
```

Matching is **by name** — roles by role name, categories and channels by
channel name, AutoMod rules by rule name. So:

- **Adding** a row to a matrix, a role to the table, or an AutoMod bullet
  creates it on the next apply.
- **Changing** a permission cell, a colour, a threshold or a keyword patches the
  existing object in place.
- **Renaming** anything creates the new name and reports the old one as
  UNMANAGED. It is not deleted and not renamed. Rename it by hand in Discord
  first if you want to keep its history and messages.
- **Removing** a row leaves the channel alone and reports it as UNMANAGED.

A second apply over an unchanged spec must report zero creates and zero updates.
You can verify that end to end without a guild:

```bash
node scripts/discord/provision.js --offline --dump-state=/tmp/s.json
node scripts/discord/provision.js --offline --state=/tmp/s.json   # all skip
```

### Vocabulary the script has to translate

The structure comes from the spec. Three vocabularies do not, and each one
**fails loudly** on a word it does not know rather than silently dropping it:

- `COLOR_WORDS` — `Gold`, `Red`, `Gray`… → hex. Currently Discord's own default
  role swatches, **not** the Techmen theme gold from `src/theme.css`. One line to
  change if the team palette is wanted.
- `PERMISSION_PHRASES` — the spec's "Key permissions" wording → permission bits.
  Note `Pin Messages` maps to `ManageMessages`; Discord has no separate pin
  permission.
- `cellOverwrite` — `V` / `S` / `-` / `~` → allow/deny bitfields, separately for
  text and voice. The exact bits are written out in the §4 legend, so the spec
  and the code state the same thing.
- The `@everyone` gate table names Discord permissions directly
  (`ViewChannel, ReadMessageHistory`), looked up against `PermissionFlagsBits`.

Add a new colour or permission phrase to the spec and the run will stop with
`unknown colour "chartreuse". Add it to COLOR_WORDS.` That is deliberate.

### How categories and channels divide up

Each category's overwrites are the **modal cell per role** across its channels,
ties broken toward the more restrictive value (`~` only wins by strict
majority). Each channel is then written with the category baseline plus its own
differences — see "Why every channel carries a full overwrite list" below.

Ten channels differ from their category and say so in the plan: `#verify`,
`#welcome`, `#announcements`, `#photos`, `#bom-and-orders`, `#outreach`,
`#strategy`, `#scouting`, `#drive-team`, `#event-logistics`, `#mod-log` and
`Meeting Room`. The rest come out identical to their parent.

---

## Decisions the spec now records

Every question the permission matrix used to leave open has been answered in
`SERVER_SPEC.md` itself, so the script derives them rather than guessing.

| Was ambiguous | Settled as | Where in the spec |
|---|---|---|
| Server name | Stays `Bosco Tech Robotics`. Recorded so provisioning asserts it instead of renaming | §2 step 1 |
| What a roleless member sees | `@everyone` stays denied guild-wide, plus two explicit gate overwrites: `#welcome` view+read, `#verify` view+read+send | §2 step 4, §4 GATE OVERWRITES |
| Student Lead's missing row | Additive, never held alone. Grants moderation, not access; every lead also holds `@Student` | §3 |
| `#drive-team` | Student `-`, Drive Team `S`. The tag gates the channel | §4 COMPETITION |
| Head Mentor / Bot | No overwrites anywhere. Administrator bypasses everything; bots are scoped by hand | §3 |
| Does `V` include reactions | Yes. `AddReactions` allowed, every send path denied | §4 legend |
| Voice `S` / `V` | `S` = view+connect+speak+stream+VAD, `V` = view, Connect denied | §4 legend |
| hoist / mentionable | Real columns in the role table. Mentionable is Drive Team and the six tags only — `@Student` is deliberately not | §3 |
| AutoMod invite rule | `exempt_roles`: Head Mentor, Mentor | §5 |
| ARCHIVE | Mentor `S`, everyone else `V` | §4 ARCHIVE |
| `#announcements` type | Normal text channel, not an Announcement channel | §4 |

A fifth cell value, `~`, means "no overwrite written for this role" — it exists
so `Drive Team` can gate `#drive-team` without contradicting the `Student` row
on the three COMPETITION channels it has no opinion about.

### Why every channel carries a full overwrite list

Discord has **no runtime inheritance** from a category to its channels. The
client's "Synced" badge means the channel's overwrite array is *identical* to
its parent's. A channel created under a parent with no explicit array gets a
copy at creation time — but re-parenting an existing channel copies nothing.

So each channel is written with its complete effective list: the category
baseline, with per-role replacements where the spec differs, plus any
`@everyone` gate entry. Channels that come out identical to their category are
synced in exactly the sense Discord means, and the three pre-existing channels
this run adopts (`#welcome`, `#mod-log`, `#general`) get correct permissions
instead of silently keeping their old ones.

One consequence worth knowing: writing `permission_overwrites` replaces the
whole array, so a hand-made overwrite on a managed channel is discarded. The
plan reports this as `-N stale` before it happens.

## The one authorised deletion

Discord permits exactly **one** AutoMod rule per guild for each of the
`MentionSpam`, `Spam` and `KeywordPreset` trigger types. Matching is by name,
so a rule sitting in one of those slots under a different name cannot be
patched and cannot be worked around — it blocks the spec's rule outright.

When that happens the script **deletes the squatter and creates the spec
version**, and logs it as an explicit `DELETE` line with a reason plus a note
in the summary. This exception is scoped to AutoMod rules only.

**Roles, channels and categories are still never deleted.** They are reported
as UNMANAGED and left alone.

## What the script deliberately does not do

- **It never deletes anything.** Not roles, channels, categories, AutoMod rules
  or overwrites on channels it does not manage.
- **It never posts a message.** The section 8 pinned posts are yours to paste.
  Nothing here writes into a channel members can read.
- **It does not assign roles to people.** Verification stays manual, which is the
  point of `#verify`.
- **It does not create invites.** The five waves in section 9 are sequenced
  deliberately, with expiry and max-use set per wave.
