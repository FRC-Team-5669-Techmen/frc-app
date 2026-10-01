# 35 Who may send Discord announcements from the app, and should the bot ever hold "Mention @everyone, @here, and All Roles"?
- Raised: 2026-10-01 by the overnight session (Discord announcements, workstream E)
- Status: open
- Default if nobody decides: **admins only, and never grant the bot that
  permission.** The `discord-announce` Edge Function checks `is_admin()` inside
  its body, and `/announce` renders its composer for admins only (the menu entry
  is admin-only too). Staff may read the role list and the announcement log;
  only an admin may edit the role list.
- Decided: --

## What is actually true right now

- Every message is sent with `allowed_mentions` set to `parse: []` plus exactly
  the role ids the admin ticked, so `@everyone`, `@here` and user mentions
  cannot resolve whatever the text says.
- Channels are a fixed list in code (`ANNOUNCE_CHANNELS` in
  `src/discordAnnounce.js`): #announcements (the default), #general,
  #event-logistics and #parents. Each also needs the bot's channel permissions
  set by hand in Discord.
- `scripts/discord/SERVER_SPEC.md` makes the six subteam tags and Drive Team
  mentionable, so pinging them notifies without the bot holding the mention-all
  permission. `@Student` is deliberately not mentionable: "pinging sixty people
  is a weapon in the wrong hands". Pinging a non-mentionable role shows the
  mention but notifies nobody, and the composer's dry run warns about it.
- Nothing can be sent yet: migration 0003 must be pasted, the Edge Function
  deployed by hand with JWT verification on, the bot given channel permissions,
  and the role list filled in (`docs/feedback/2026-10-01/TRIAGE.md`, R5).

## The options

**A. Admins only (the default).**

**B. Mentors too.** A one-line change from `is_admin()` to `is_staff()` in the
function, plus the page's and the menu's admin check.

**C. Grant the bot the mention-all permission.** Makes `@Student` pingable from
the app, which `SERVER_SPEC.md` rules out.
