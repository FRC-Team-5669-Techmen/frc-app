# CLAUDE.md - Techmen Team Platform

This file is read automatically by Claude Code on startup. It is the persistent context for this repo so per-task prompts can stay lean. Keep it current (see Self-Maintenance at the bottom).

## What this repo is

The internal team platform for FRC Team 5669 "Techmen" (Don Bosco Technical Institute). A PWA that is the single hub for everything the team runs on: attendance, hours, member profiles, skills/certifications, and a growing set of feature modules. Attendance was the first module, not the point of the app. The long-term vision is one connected platform for the whole team.

Live: frc-app-liard.vercel.app
Repo: set on first run
Local: set on first run

## Branding

Techmen. "Tactical HUD" theme — near-black base, gold targeting accent, silver/steel chrome. Display/UI face is Chakra Petch; all data/readout lines (timestamps, codes, counts, status) use Share Tech Mono. Both fonts are self-hosted via @fontsource (no Google Fonts CDN). Team logo + "TECHMEN·5669" wordmark in the header, not "5669" or "FRC App". Student-facing name is always Techmen.

**Theme tokens live in `src/theme.css`** — a single source of truth (CSS custom properties) imported once in `main.jsx` before `App.css`. Never scatter raw hex through components; use the vars (`--bg`, `--surface`, `--border`/`--border-strong`, `--text`, `--steel`, `--muted`, `--gold`/`--gold-bright`/`--gold-dim`, `--fault`, `--font-ui`, `--font-mono`, `--radius`). Red (`--fault`) is reserved for genuine faults/errors/destructive actions only.

## Tech stack

- Vite + React. PWA (service worker + manifest).
- Fonts: Chakra Petch + Share Tech Mono, bundled offline via @fontsource (woff2 precached by the service worker). No runtime font CDN.
- Supabase: Postgres + auth + RLS. This is live team data.
- Deployed on Vercel, auto-deploys on push.
- Auth: email OTP (6-digit code) and Google OAuth via an Internal consent screen scoped to boscotech.edu. Every student has a school Google account.

## Architecture (locked decisions)

- **Central members table is the hub.** Everything keys off the member ID: attendance, hours, profile, skills, and every future module. Never break this. New tables reference member ID.
- **One app, code-split routes.** Each feature is a lazy-loaded bundle that only downloads when opened. This keeps check-in fast no matter how many modules exist.
- **Check-in is the fast path.** The NFC tag deep-links straight to a deliberately minimal check-in route. Keep it light. Do not pull the dashboard, nav, or other modules into that route.
- **Public site stays separate** from team data. No login, different audience, different security.
- **Read and write RLS differ.** Students write only their own attendance; all members can read the team hours board. Respect this split when adding policies.
- **Parent vs staff role resolution.** `is_staff()` is mentor/lead/admin only — `parent` is never staff. A parent who ALSO holds a staff role is treated as staff and sees the mentor view. Any parent-specific UI must gate on `(hasRole('parent') && !isStaff)`, never on `hasRole('parent')` alone.

## Built so far

- Multi-claim jobs (`supabase/multi_claim_jobs.sql`, refactors jobs_board). Per-claimant lifecycle lives in `task_claims(task_id, member_id, status[claimed/submitted/completed], …)`, PK (task_id, member_id). `tasks.max_claimants` (int, default 1 = solo, null = unlimited, N = capped). `tasks.status` is now staff-controlled **availability** (open/closed/completed), no longer auto-driven by a single claim. RLS: task_claims readable by all authenticated, staff write/delete; members transition only via the SECURITY DEFINER RPCs. **claim_task locks the tasks row FOR UPDATE before counting claims (race-safe capacity)** and enforces the cert gate per claimant (same missing-cert message). **verify_task signature changed to `verify_task(p_task, p_member, p_approve)`** — per-claimant sign-off; update every caller. Staff close/complete/reopen by updating `tasks.status` directly. **Deprecated (kept, not dropped — live data): `tasks.claimed_by`, `tasks.verified_by`** — unused by the new logic. `readiness_summary.sql` was updated to read task counts from `task_claims` (re-run it alongside the migration).
- Installable PWA, OTP + Google OAuth login.
- Check-in/out with NFC deep-link fast path. Geofence at 34.041550 / -118.086826, 150m radius (check-in gated to location, check-out always allowed).
- Presence Board (`/display`, staff-opened wall display): read-only, who-is-present derived from open check-ins, subteam-grouped, live via 15s polling (realtime is not wired in the project). Full-screen, no NavBar.
- Kiosk check-in (`/kiosk`, shared tablet): Web NFC reader (feature-detected; Chrome-on-Android only) that toggles a member in/out via the `staff_override_attendance` RPC. Note: tags must carry the member id (URL `?member=`/`?m=` or a UUID text record) — the door `?loc=` deep-link tags identify a location, not a person. Present-state derivation is shared in `src/presence.js`.
- Auto-checkout at 10 PM via pg_cron; auto-closed sessions are flagged for mentor review before counting.
- Public landing page. NavBar: primary row is Dashboard / Schedule / Hours (dropdown) / Skills / Jobs / Study for members; the **parent branch** (`hasRole('parent') && !isStaff`) shows only Dashboard / Schedule / Team Hours. **All staff links live in the avatar menu** under a `STAFF` section (My Profile, Replay tour, divider, STAFF + staff links, divider, Sign out last) — there is no top-row Staff dropdown. The avatar menu right-anchors via `.nav-dropdown-menu.nav-avatar-menu` (the doubled-class selector is load-bearing: it out-specifies the base `.nav-dropdown-menu { left:0 }` so the menu can't overflow the right edge) and scrolls on short viewports. A gold dot on the avatar flags pending access requests for staff.
- My Hours and Team Hours board (aggregates attendance events live).
- Profile customization (subteam, nickname, bio, shirt_size, avatar_url, grad_year). Multi-select subteams for crossover members.
- Admin roster: manage roles (student, mentor, lead, admin, parent) and status (active, inactive, alumni), gated by has_role('admin').
- Access-request system + `parent` role (`supabase/access_requests.sql`). Non-allowed-email sign-ins hit a request form (replaces the old AccessGate dead-end) that writes an `access_requests` row; staff review at `/access-requests` and Approve (with assigned role student/mentor/parent) or Deny via SECURITY DEFINER RPCs. Approve whitelists the email in `approved_emails`; `claim_profile()` approval order is domain → approved_emails (grants the stored role) → already-approved (still defaults to student). Approval sends a courtesy email via the `send-approval-email` Edge Function (Gmail SMTP via denomailer; secrets `GMAIL_USER` + `GMAIL_APP_PASSWORD`, optional `EMAIL_FROM`/`APP_URL`) — approval never fails if those are unset. boscotech.edu still auto-approves as student.
- Staff invite flow (parent-friendly, additive to the request flow): the `/access-requests` page has an "Invite someone" panel that calls the `invite-member` Edge Function — it whitelists the email in `approved_emails` with a role (default parent) and sends Supabase's built-in one-tap invite link via the project SMTP, so the invitee clicks through and lands in already approved (no request/wait). Falls back gracefully if they already have an account. Requires Supabase Auth **Custom SMTP** configured and the app URL in Auth → URL Configuration (Site/redirect URLs).
- Login screen (`LoginPage.jsx`) routes by audience: "Continue with school account" (Google, org-internal `@boscotech.edu`) for students/mentors; an email sign-in-code path labeled "parents & guests" so non-org users don't hit Google's org_internal block. The Google OAuth consent screen is Internal by design — external users must use the email path.
- Scheduling module (`supabase/events.sql`). `events(title, kind, starts_at, ends_at, location, notes, ...)` — readable by all authenticated, writable by `is_staff()` only (plain staff-write policy, no RPCs). `/schedule` is an agenda list grouped by day (all roles view; staff create/edit/delete via a form; past events behind a toggle). **Shop open/closed rule:** the shop is "open" only during today's `kind='build'` event windows (other kinds do not open the shop); status is "Open until END" inside a window, "Closed, opens START" before the first, else "Closed today", with a live "N checked in" override from `presence.js`. The shop-status derivation + the dashboard glance card live in one shared module (`shopStatus.js` + `GlanceCard.jsx`) imported by both HomePage and ParentHomePage; the `/checkin` fast path deliberately imports none of it. Event times render in America/Los_Angeles via `toLocaleTimeString`.
- Event RSVPs / signups (`supabase/event_signups.sql`). Additive columns on `events`: `rsvp_enabled` (bool), `capacity` (int null). New `event_signups(event_id, member_id, response[going/maybe/declined], item, …)`, PK (event_id, member_id) — one upserted row per member per event. RLS: readable by all authenticated; insert/update/delete gated to `member_id = auth.uid() OR is_staff()` — plain own-row writes, **no RPCs** (reserve the RPC pattern for cert-gated/privileged transitions). Any approved member (student/parent/staff) can RSVP. The RSVP control + attendee list render inline on `/schedule` **only when `rsvp_enabled`** (non-RSVP events are visually unchanged), reusing the existing schedule UI. Capacity is **informational** (shows "N of CAP", soft-warns when full) — it does NOT hard-block; strict-limited slots would need a row-locking sign-up RPC (follow-up).
- Parent dashboard + guardian links (`supabase/guardian_links.sql`). `guardian_links(parent_id, student_id, created_by)` links a parent to students; staff manage links on RosterPage (parent-role members get a Students section) via `link_guardian`/`unlink_guardian` SECURITY DEFINER RPCs. RLS: readable by staff or the parent themselves, writable by staff only; a `lh parent select` policy lets a parent read their linked students' `logged_hours` (other tables were already authenticated-readable). `/dashboard` renders `ParentHomePage` (per-student live status/hours/certs + read-only team glance) for `(hasRole('parent') && !isStaff)`; NavBar shows only Dashboard + Team Hours for that case. Shared hours math lives in `hoursUtils.js` (`computeHoursMs`/`fmtDuration`).
- Skills and certifications: catalog, member view, certify screen with audit trail.
- Hours types / seasons table (Offseason 2026 ends 2027-01-06, Biocore 2027 starts 2027-01-07). Logged hours (volunteering, outreach, competition) with mentor verification.

## Roadmap (planned modules)

- Custom scouting app and system.
- Calculators and reference tables for robot design.
- Automated FRC learning environment so students can build skills and take on more responsibility during the season. Offseason priority.
- Job and task list with assignment to members.

This list will grow. When building a new module, confirm the members table and roles already carry it before adding new foundation.

## Hard rules

1. **Surgical edits only.** Edit the smallest unique chunk with a targeted replace. Never rewrite a whole file when a targeted edit works. Never re-output a full file after editing.
2. **Schema and UI ship together.** When a feature needs a column or table, put the migration and the UI change in the same task so they never drift. Column-mismatch bugs come from shipping one without the other.
3. **Run migrations in Supabase before testing.** A feature that reads a new column will throw "column does not exist" until the migration runs. Apply it first.
4. **Supabase holds live team data.** Never run destructive schema or data operations without explicit confirmation. Treat migrations and table changes as high-risk and propose first.
5. **Do not commit secrets.** Supabase URL/anon key and service keys live in env vars / Vercel settings. Never hardcode the service role key in client code.
6. **Commit and push in the same task.** Do not leave changes unstaged. Push success is the confirmation signal.

## Gotchas

- **PWA cache.** Service workers serve stale copies after deploy. Test in an incognito window to see the true current version. A "missing build" is almost always cache.
- **SQL dollar-quoting.** Use named tags like $fn$ ... $fn$ for function bodies, not bare $$. Bare dollar signs break on paste.
- **Web NFC is Chrome/Android only.** Keep that constraint in mind for any check-in change.

## How tasks come in

Default: tasks are described by intent and constraints. You own the implementation. Read the repo, find the right place, and write the code yourself. That is the normal mode.

Exact content is provided only in two cases:
- A file or snippet was drafted in chat and must land verbatim. Use it as given.
- A change is precise enough that an exact locator prevents the wrong edit. These arrive as CURRENT / REPLACE blocks: read the actual file first, apply even if the anchor text differs slightly, and report any miss instead of guessing.

Either way, read the repo file yourself rather than requiring a full-file paste to resync.

## Workflow notes

- Run via the Claude Desktop App. Built across multiple machines, synced through GitHub.
- Bundle multiple changes into one task rather than one item per task.
- Build in milestones.
- System is in active pilot. Favor changes safe to ship to live users; flag anything that could disrupt an in-progress check-in session.

## Self-Maintenance

Keep this file accurate. When you discover during a task that any of the following has drifted from what is written here, update this file in the same commit as your other changes:

- Repo structure, key paths, or file names changed.
- The stack, Supabase schema, or external integrations changed.
- A module shipped (move it from Roadmap to Built so far) or a new milestone landed.
- An architecture decision or standing rule was established or revised.

When you update this file, bump the Last reviewed date below and note what changed in the commit message. Do not let this file go stale. If a task reveals a new recurring pattern worth encoding, add it rather than waiting to be told.

Last reviewed: 2026-06-16 (added Presence Board + Kiosk; access-request + parent role; parent dashboard + guardian links; scheduling module + glance card + shop status)
