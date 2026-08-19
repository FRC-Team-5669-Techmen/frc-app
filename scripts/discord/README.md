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
- **In Server Settings → Roles, drag the bot's own role above `Head Mentor`.**
  Discord silently clamps any role a bot creates or moves to below its own
  highest role. This is the single most common reason a run "succeeds" but the
  role order comes out wrong.

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

It prints the full plan grouped by phase, with a create/update/skip count per
phase, then:

- **UNMANAGED** — anything in the guild the spec does not describe. Reported,
  never touched. The script has no delete path at all.
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
| 7 | Channels | Synced to their category except where the spec differs |
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
npm run discord:plan     # confirm: zero creates, zero updates
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
- `cellOverwrite` — `V` / `S` / `-` → allow/deny bitfields, separately for text
  and voice.

Add a new colour or permission phrase to the spec and the run will stop with
`unknown colour "chartreuse". Add it to COLOR_WORDS.` That is deliberate.

### How categories and channels divide up

Each category's overwrites are the **modal cell per role** across its channels,
ties broken toward the more restrictive value. A channel whose final bits equal
what it would inherit gets **no overwrites at all** and stays synced; only the
differences are written. That is why `#photos`, `#outreach`, `#bom-and-orders`,
`#strategy`, `#scouting`, `#event-logistics`, `#verify`, `#announcements`,
`#mod-log` and `Meeting Room` carry explicit overwrites and the other twenty do
not.

---

## Ambiguities in the spec

The permission matrix does not resolve these. The script's behaviour is noted,
but none of them is settled — decide them before the first student invite.

1. **What a member with no role sees.** Section 2 step 4 says "A member with no
   role now sees nothing," and `@everyone` has no matrix column. But the
   `#verify` pin in section 8 says "You will not see *the rest of* the server
   until then," which only makes sense if a new joiner can already see
   `#welcome` and `#verify`. As written, a new member sees a completely empty
   server and cannot post the line that gets them verified.
   *Implemented literally: `@everyone` is denied View Channels and gets no
   overwrite anywhere.* This also decides whether onboarding can be enabled at
   all — see the WATCH note in the run output.

2. **Student Lead has no row in the matrix.** It carries Manage Messages /
   Threads but is granted view access nowhere. Section 2 step 10 implies leads
   also hold `Student`. *Implemented: no overwrites reference Student Lead, so a
   lead sees nothing unless also given `Student`.*

3. **`Drive Team` the role vs `#drive-team` the channel.** Section 3 says tags
   carry no permissions and access is decided entirely by Student / Parent /
   Alumni / Mentor; the matrix gives `#drive-team` to every Student (`S`). So the
   role does not gate the channel. *Implemented per the matrix.* If the intent
   was to restrict it, the matrix needs a Drive Team column.

4. **`Head Mentor` and `Bot` have no matrix rows.** Head Mentor is moot
   (Administrator). `Bot` — "scoped per bot" — is not actionable, so the role is
   created with no permissions and appears in no overwrite. Any integration
   needs per-channel grants added by hand.

5. **Does `V` include adding reactions?** "Can view and read" is silent.
   *Implemented: every send path is explicitly denied, reactions are left
   inherited (allowed)* — reacting to an announcement is normal, but this is a
   choice.

6. **Voice semantics of `S` / `V` / `-`.** The legend is written for text
   channels. *Implemented: `S` = connect + speak, `V` = can see but cannot
   connect, which is what makes Meeting Room "view-only so a mentor has one room
   that cannot be joined uninvited."*

7. **Hoist and mentionable are never specified.** *Derived: hoist = the role
   decides access (a matrix column) or carries permissions; mentionable =
   everything else, i.e. the tag roles, which section 3 says exist precisely so a
   mentor can ping `@Programming`.* Whether `@Student` should be mentionable is a
   real question this guesses at.

8. **AutoMod exemptions.** Section 5 grants Create Invite to Mentor only, but the
   custom keyword rule blocks `discord.gg` for everyone — including a mentor
   pasting an invite. *Implemented with no `exempt_roles`, per the literal spec.*

9. **ARCHIVE "read-only for every role" — including Mentor?** *Implemented as
   view-only for all four audiences, so mentors cannot post there either.*

10. **`#announcements` channel type.** "Mentors post, nobody replies" could mean
    a Discord Announcement channel (which other servers can follow).
    *Implemented as a normal text channel whose send permission is limited by
    overwrites.* Converting the type later is not something this script does.

---

## What the script deliberately does not do

- **It never deletes anything.** Not roles, channels, categories, AutoMod rules
  or overwrites on channels it does not manage.
- **It never posts a message.** The section 8 pinned posts are yours to paste.
  Nothing here writes into a channel members can read.
- **It does not assign roles to people.** Verification stays manual, which is the
  point of `#verify`.
- **It does not create invites.** The five waves in section 9 are sequenced
  deliberately, with expiry and max-use set per wave.
