# FRC 5669 Techmen - Discord Server Setup Pack

Version 1.0 | Built 2026-08-17 | Owner: Mr. Pina

Everything needed to build the server once and not reorganize it in week three. Work top to bottom. Text blocks marked PASTE are ready to copy without editing.

---

## 1. Constraints this build is designed around

**Discord is blocked on school wifi.** Nothing time-sensitive can live only on Discord. Every announcement gets mirrored to GroupMe. Discord is the off-campus surface: after-hours work, weekend build, CAD and code discussion, competition prep from home. During the school day, GroupMe and the team app are the paths that work.

**Four audiences, three of them walled.** Students see the team. Parents see logistics and nothing else. Alumni see the technical channels but cannot enter parent or mentor space. Mentors see everything.

**Replacing an existing server.** The old one gets locked read-only, not deleted, and everyone re-joins through the new gate. Re-joining is the point: it resets the member list to people who are actually on the team this season and puts every member through rules screening.

**Minors are the majority of the membership.** Every design choice below that looks restrictive is there so the answer to "who can talk to a student unsupervised" is nobody.

---

## 2. Setup order

Do these in order. Roles before channels is not optional, because channel permissions reference roles that must already exist.

1. Create the server. Name it `FRC 5669 Techmen`. Upload the team logo as the icon.
2. Server Settings > Enable Community. This unlocks rules screening, onboarding, and the safety tooling below.
3. Build every role in section 3, in the listed order, top to bottom.
4. Server Settings > Roles > `@everyone` > turn **View Channels OFF**. This is the single most important click in the build. A member with no role now sees nothing.
5. Create the categories in section 4, set permissions at the **category** level, then create channels inside them with permissions synced to the category.
6. Configure Safety Setup per section 5.
7. Enter the rules screening and onboarding text from sections 6 and 7.
8. Post the pinned messages from section 8.
9. Add mentors. Confirm at least two adults hold the Mentor role before any student joins.
10. Add two or three student leads. Have one of them confirm they cannot see #mentor-chat or #parents. Test the gate before it matters.
11. Run the invite waves in section 9.
12. Lock the old server per section 10.

---

## 3. Roles

Create in this order. Discord ranks roles by list position and higher roles win, so the order is the hierarchy.

| # | Role | Color | Who | Key permissions |
|---|---|---|---|---|
| 1 | Head Mentor | Gold | Mr. Pina (owner) | Administrator |
| 2 | Mentor | Red | Garza, Kennedy, Pedroza | Manage Messages, Moderate Members (timeout), Kick, Manage Nicknames, Create Invite |
| 3 | Student Lead | Blue | Subteam leads | Manage Messages, Manage Threads, Pin Messages |
| 4 | Drive Team | Orange | Named at selection | None, access tag only |
| 5 | Mechanical | Gray | Self-assign | None, tag only |
| 6 | Electrical | Gray | Self-assign | None, tag only |
| 7 | Programming | Gray | Self-assign | None, tag only |
| 8 | CAD | Gray | Self-assign | None, tag only |
| 9 | Business/Media | Gray | Self-assign | None, tag only |
| 10 | Scouting | Gray | Self-assign | None, tag only |
| 11 | Student | Green | Verified students | Base access |
| 12 | Alumni | Purple | Graduates | Limited access |
| 13 | Parent | Teal | Verified parents | Logistics only |
| 14 | Bot | Default | Integrations only | Scoped per bot |

Permissions nobody but Head Mentor gets: Administrator, Manage Server, Manage Roles, Manage Channels, Ban Members, Manage Webhooks.

Permissions nobody gets at all: Mention `@everyone` outside #announcements. Turn this off for `@everyone` at the server level and grant it only to Mentor in that one channel.

**Subteam tags carry no permissions.** They exist so a mentor can ping `@Programming` without pinging sixty people. Access is decided entirely by Student, Parent, Alumni, and Mentor.

---

## 4. Channels and permission matrix

`V` = can view and read. `S` = can view and send. `-` = cannot see it exists.

### START HERE

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| #welcome | V | V | V | S |
| #verify | S | S | S | S |
| #announcements | V | V | V | S |
| #calendar | V | V | V | S |
| #shop-hours | V | V | V | S |

### TEAM

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| #general | S | - | S | S |
| #questions | S | - | S | S |
| #photos | S | V | V | S |

### BUILD

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| #mechanical | S | - | V | S |
| #electrical | S | - | V | S |
| #programming | S | - | V | S |
| #cad | S | - | V | S |
| #prototyping | S | - | V | S |
| #bom-and-orders | S | - | - | S |

### BUSINESS

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| #outreach | S | V | V | S |
| #media-and-branding | S | - | V | S |
| #impact-award | S | - | V | S |

### COMPETITION

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| #strategy | S | - | V | S |
| #scouting | S | - | V | S |
| #drive-team | S | - | - | S |
| #event-logistics | S | V | - | S |

### VOICE

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| General VC | S | - | S | S |
| Build VC | S | - | S | S |
| Programming VC | S | - | S | S |
| Meeting Room | V | - | - | S |

Meeting Room is view-only for students so a mentor has one room that cannot be joined uninvited. Move students in manually.

### PARENTS

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| #parents | - | S | - | S |
| #volunteer-signups | - | S | - | S |

### MENTORS

| Channel | Student | Parent | Alumni | Mentor |
|---|---|---|---|---|
| #mentor-chat | - | - | - | S |
| #logistics | - | - | - | S |
| #mod-log | - | - | - | V |

### ARCHIVE

Last season's channels, moved here at season rollover and set read-only for every role.

---

## 5. Safety configuration

Server Settings > Safety Setup.

- **Verification level: High.** Members must have a verified phone on their Discord account and be a member for ten minutes before posting.
- **Explicit media content filter: scan messages from all members.**
- **Require 2FA for moderation actions: ON.** Mentors need an authenticator app before they can time anyone out.
- **DM spam filter: ON.**
- **AutoMod rules to enable:**
  - Block commonly flagged words. Action: block message, alert #mod-log.
  - Block spam content. Action: block message.
  - Block mention spam, threshold 5. Action: block message, alert #mod-log.
  - Custom keyword rule blocking `discord.gg` and `discord.com/invite`. Action: block message, alert #mod-log. This stops members from advertising other servers and stops an invite to this server from leaking through a screenshot chain.
- **No NSFW channels, ever.** Discord's teen-by-default settings block age-restricted channels for under-18 accounts with no server-level override, so marking a channel mature just breaks it for most of the team.
- **Invites:** Create Invite permission granted to Mentor only. Every invite is set to expire in 7 days with a finite max-use count. No permanent link exists anywhere.

**What Discord cannot enforce.** There is no server setting that disables direct messages between members. The adult-to-student DM rule is policy, accepted at rules screening, and enforced socially. State it plainly and repeat it at kickoff.

---

## 6. Rules screening

Server Settings > Community > Rules Screening. Members must accept before they can post.

PASTE:

```
1. Use your real name. Nicknames are first name and last initial. A mentor sets yours when you join.

2. This server is an extension of the shop. The student handbook applies here exactly as it does on campus.

3. No direct messages between adults and students. Mentors, parents, and alumni keep all contact with students in server channels where it is visible.

4. Post in the right channel. Build questions go in your subteam channel, not #general.

5. Nothing you would not say in the shop with a mentor standing next to you. No explicit content, slurs, or harassment.

6. Do not share invite links. Mentors issue invites.

7. Discord is blocked on school wifi. Announcements are mirrored in GroupMe. Check GroupMe during the school day.

8. What is posted here stays here. No screenshots to outside servers or social media without a mentor's approval.
```

---

## 7. Onboarding

Server Settings > Community > Onboarding. These assign the gray subteam tags only. They grant no access.

**Question 1 - "What are you working on?"** (multi-select, optional)

- Mechanical - fabrication, assembly, mechanisms
- Electrical - wiring, controls, pneumatics
- Programming - robot code, vision, autonomous
- CAD - SolidWorks, design, drawings
- Business/Media - outreach, sponsorship, video, branding
- Scouting - match data, strategy, pit scouting

**Question 2 - "Not sure yet?"** (single select, optional)

- I want to try everything. Assigns no role. Mentors follow up.

Do not add a self-select question for Student, Parent, or Alumni. Those get assigned by hand in #verify, because a self-select role is a self-granted role and a parent picking "Student" would open every build channel.

---

## 8. Pinned posts

### #welcome

PASTE:

```
WELCOME TO FRC 5669

This is the team server for the 2026-27 season. Read the rules, then post in #verify so a mentor can get you the right access.

WHAT GOES WHERE
- #announcements - anything you have to know. Mentors post, nobody replies.
- #calendar - meetings, competitions, deadlines.
- Subteam channels - build questions, photos, problems you are stuck on.
- #general - everything else.

BEFORE YOU ASK
Discord is blocked on school wifi. Everything posted in #announcements also goes out on GroupMe. If you are on campus, check GroupMe.

- Mr. Pina
```

### #verify

PASTE:

```
Post one line and nothing else:

Full name, and whether you are a student, parent, or alumni. Students add your grad year.

Examples:
Ruben Rendon, student, 2030
Maria Rendon, parent
Justin Cini, alumni 2028

A mentor will set your name and access. You will not see the rest of the server until then. This usually takes a day.
```

### #announcements

PASTE:

```
This channel is mentors only. Turn notifications on.

Everything posted here also goes out on GroupMe. Discord is blocked on school wifi, so GroupMe is the one that reaches you during the school day. Both say the same thing.
```

---

## 9. Invite waves

Run these in order, not simultaneously. Each wave is a separate invite link, 7-day expiry, max uses set to the size of the wave plus five.

1. **Mentors.** Confirm two adults hold the Mentor role before anything else happens.
2. **Student leads.** Have them break the permission model if they can. Fix what they find.
3. **Students.** Link goes out on GroupMe and in the shop, not by email.
4. **Parents.** Link goes out by email with a short note explaining that parents see logistics channels only. Sign "Mr. Pina."
5. **Alumni.** Last, once everything else is stable.

Verification runs in bursts. Check #verify at the start and end of each shop day during the first two weeks, then whenever it pings.

---

## 10. Retiring the old server

Do not delete it. A deleted server takes its history with it and there is no export.

1. Rename it `FRC 5669 (ARCHIVE - do not post)`.
2. `@everyone` > Send Messages OFF, Create Invite OFF, at the server level.
3. Delete every existing invite link. Server Settings > Invites > revoke all.
4. Pin one message in the top channel with the new invite. Update that pin every 7 days during the migration window, then remove it.
5. Leave it read-only permanently. It costs nothing and it is the only copy of anything worth keeping.

PASTE, for the old server pin:

```
This server is closed. The team has moved.

New server invite: [LINK]

Everyone re-joins and goes through verification, including people who were here last season. Nothing gets posted here anymore.

- Mr. Pina
```

---

## 11. Announcement workflow

One message, written once, reformatted per platform. Never pasted unchanged across all three.

| Surface | Format | Reaches |
|---|---|---|
| Team app | Source of truth. Calendar entry plus push notification. | On campus and off |
| GroupMe | Condensed, split if over the character limit. Facts only. | On campus and off |
| Discord #announcements | Full detail. Headers, bold, lists. Ping the specific subteam role, not `@everyone`. | Off campus only |

The team app is the only one of the three that works on school wifi and reaches phones. If the app's push notifications are reliable, it should carry the on-campus load and GroupMe becomes the backup rather than the primary. Worth testing during the first week of shop hours before the season depends on it.

Announcement shape:

PASTE, as a template:

```
SHOP HOURS THIS WEEK

Tuesday 3:15 to 6:00
Thursday 3:15 to 6:00
Saturday 9:00 to 2:00

Bring safety glasses. If you do not have a pair, see me before Tuesday.

@Mechanical @Electrical - drivetrain assembly starts Tuesday and does not wait.

- Mr. Pina
```

---

## 12. Season rollover

Run this once, every August.

1. Move BUILD and COMPETITION channels into ARCHIVE. Set every role to view-only on them.
2. Create fresh channels for the new season.
3. Remove the Student role from graduating seniors and add Alumni.
4. Clear subteam tags from everyone. Onboarding re-assigns them.
5. Revoke all standing invites and issue new ones.
6. Re-read the rules pin. Update anything that no longer matches how the team actually runs.

---

## 13. Open items

- **Administrator sign-off.** A school-sanctioned platform hosting minors needs approval before the first student invite goes out. The two-adult moderator rule, the no-DM policy, the real-name requirement, and #mod-log are the four things that make that conversation short. Confirm with Brendan Chua or the Assistant Principal.
- **Moderation bot.** None at launch. Discord's AutoMod covers spam, slurs, and invite links without one, and a bot is another system to maintain. Revisit only if manual verification in #verify becomes a bottleneck.
- **App integration.** A Discord webhook could post team app calendar changes into #calendar automatically. Worth building after the server is stable, not during setup.

---

## Changelog

- **1.0** (2026-08-17) - Initial build. Four-audience access model, wifi-block redundancy workflow, old server retirement plan.
