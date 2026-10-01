# Overhaul audit, 2026-10-01

Mr. Pina, 2026-09-30: the app was built "when I was a much lighter AI user" and is "in need
of a legitimate overhaul." This file is the ranked list that overhaul should start from.

## What was audited, and against what

- **Tree:** written against `frc-app` at `aa3f533` (a working branch of the overnight session
  of 2026-10-01), then brought up to date with `main` at `e652b01` the same day. Every item
  carries its state at `e652b01` where it changed: FIXED, PARTLY FIXED or RESOLVED, with the
  commit. Ranking and wording are otherwise as written.
  - `aa3f533` already carried that night's work: the IDEA certifications mirror (migration
    0001), the rebuilt feedback console (0002), Discord announcements (0003), member
    capabilities (0004), the hours and check-out fixes, `/display` history, the LA-date
    rules, and fixture mode (`src/dev/fixture`, `tools/e2e`).
  - Three pieces were in flight then and not audited as missing: the shape-language port (G),
    the feature browser spec (`tools/e2e/features.mjs`) and a revised check-in E2E. All three
    are on `main` at `e652b01`.
  - Commit shas from the session's lane branches (`adadcdc`, `67e6788`, `f7fef0b`) are not on
    `main`: the push of `9543e90` linearized them. The same changes on `main` are `c939674`,
    `eff3d41` and `8615faa`.
- **Bar:** the sibling repo `pina-hash/idea-app` at `f712011`, in particular its `CLAUDE.md`,
  `docs/standards`, `docs/decisions`, `.github/workflows`, `tests/` and `tools/`.
- **Dimensions:** eight, each audited by one agent:
  1. reporting and feedback
  2. admin tooling
  3. permissions and security
  4. testing and CI
  5. errors and empty states
  6. mobile layout
  7. accessibility
  8. documentation
- **Skeptic check:** every critical and high finding (32 in all) went to a second agent. That
  agent tried to disprove it in its own database or browser. None was refuted. Their
  corrections to locations, counts and wording are applied below.
- **Measured:**
  - At `e652b01`: `npm test` (vitest) 640/640 in 37 files, re-run for this file;
    `npm run test:checkin` 51/51 at 375 and 1440; `npm run test:features` 957/957.
  - When the audit was written: `npm test` 561/561 at the real clock, and the fixture-clock
    failure in item 11 reproduced (43/43 at 2026-10-01T20:00Z, failing at 2026-10-02T07:30Z).
    Item 11 is fixed.
  - The security measurements are withheld (decision 04).

### What is NOT verified, and why

Nothing in this container reaches the live Supabase project. No credentials exist here, and CI
reads none. So every statement about the live database is inferred from the repo's SQL
applied to a throwaway Postgres 16 harness (`/home/user/pgharness`, uncommitted). That
covers:

- policies and grants
- which of the two `claim_profile` versions is live
- whether `profiles.geofence_exempt` exists
- whether the Offseason 2026 and Biocore 2027 season rows exist
- the shape of `app_settings`
- the Supabase plan and point-in-time recovery
- the sign-up setting
- the six open feedback reports (closed by `docs/feedback/2026-10-01/MARK_DONE.sql` once it is
  pasted)

The harness databases are still there for re-measurement:

- `audit_reporting_feedback`
- `audit_admin_tooling`
- `audit_permissions_security`
- `audit_testing_ci`
- `audit_errors_empty_states`
- `audit_documentation`
- `audit_check_*` (the skeptics' copies)

Also not verified:

- **Browser measurements.** All of them were made with scratch harnesses outside the repo:
  fixture mode, axe-core, tab walks, tap sweeps, and a fake PostgREST for failed reads. By
  CLAUDE.md's own rule they are claims about the past until items 20 and 65 make them
  repeatable.
- **iOS and WebKit behaviour.** The zoom on small inputs and the status bar were not measured;
  only Chromium is here.
- **Edge Functions.** None was executed; there is no Deno here.
- **Vercel.** Its answering a missing `/assets/*.js` with `index.html` is read from its
  documented behaviour, not observed. Its Node version comes from a June snapshot.

### Security detail in this file

The repository is public. Items 1, 2, 3, 6, 7, 8, 14, 15, 16, 50, 51 and 52, and part (c) of
item 72, describe security weaknesses that are unfixed at `e652b01`. Under decision 04's
default each is a stub here: its number, a neutral title, its severity, size and dimension,
and the kind of fix. Nothing else. Their full text, with the evidence and the reproductions,
was delivered to Mr. Pina privately on 2026-10-01 and is not in this repository. A stub gets
its full text back once its fix is applied on the live project. The cheapest high-value fix
is one small migration covering items 1, 3 and 7.

### Fixed on 2026-10-01 (code on `main`, deployed; no SQL involved)

Fixed before the audit was written (in `aa3f533`):

- **Team Hours "+ Manual session" crash.** `c939674` on `main`; production crashed until the
  push of `9543e90`. See item 12.
- **Double check-out.** Under StrictMode one NFC check-out tap wrote two OUTs. Fixed by
  `eff3d41`, which acts on an arrival once.
- **Team Hours Matrix vs By-member.** The two views no longer disagree: `attendanceHoursByDate`
  is gone and the Matrix uses `hoursByDay` on the LA day.
- **Unpaged attendance reads.** These lost the newest rows past 1000. They are now paged
  through `fetchAllRows`, and `tests/hours-reads-complete.test.js` enforces that. One allowance
  remains: the member's own dashboard read in `HomePage.jsx`. It is newest-first, so check-out
  state is right; only a season total past 1000 events would be short.
- **Admin feedback badge.** It counts both `new` and `open`, so it works before and after 0002.

Fixed after `aa3f533`, by four pushes to `main`: `9543e90` (the check-in gate pass, and item
12's fix reaching production), `e24d63d` (the finish pass, `25bc795` to `e24d63d`), `7cdf3e3`
(the audit's trivial fixes, `7539e03` onward) and `e652b01` (the shape-language port,
`78d239c` onward). Fixed: items 5, 10, 11, 13, 27, 29, 30, 33, 36, 41, 43, 64, 76 and 81.
Partly fixed: 4, 9, 12, 17, 24, 25, 28, 31, 35, 38, 40, 44, 45, 46, 65, 72, 74, 75, 77, 79, 80,
82, 83 and 85. Item 23 is resolved by decision 05. Each item's status line names its commit.

---

## The ranked list

Ranking: harm to students and the team first, then cost. Within a severity, a cheaper fix ranks
higher. "Trivial fix" means a fix in a file that night's session already touched. Status lines
say what changed after the audit was written, at `e652b01`. "Decision NN" names a file in
`docs/decisions/`; **Needs Mr. Pina** at the end maps the audit's drafts to them.

### Critical

#### 1. Security finding: a database permission gap in the attendance path
- **Dimension:** permissions-security. **Severity:** critical. **Size:** S.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** One small numbered migration that tightens a database privilege, plus a test
  that keeps it tight.
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 2. Security finding: the database's member read and write boundary
- **Dimension:** permissions-security. **Severity:** critical. **Size:** L.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** A membership check added across the member read and write policies, after
  item 3 (decision 06).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

### High

#### 3. Security finding: a missing database guard on a member table
- **Dimension:** permissions-security, admin-tooling, testing-ci. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** One small numbered migration adding a guard trigger, with an RLS test whose
  positive controls show the admin paths still work (decision 06).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 4. A failed `claim_profile` call shows approved students the "not on the roster" form, even on an NFC tap; a failed roles read demotes mentors
- **Dimension:** errors-empty-states. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED. A failed `claim_profile` call or roles read no longer
  downgrades what the tab already holds (`35c2ef3`, `af10e6b`, `9864059`;
  `src/claimApproval.js`), pinned by `test:checkin` steps R8 to R10. Still open: with nothing
  held, a first-load failure shows the access form, not a "can't reach the team server" card
  (decision 40).
- **What is wrong:**
  - `src/App.jsx:103-104` ignores the `claim_profile` error and sets
    `approved = (claimed === true)`.
  - `:105-110` ignores the `member_roles` error and sets roles to `[]`.
  - `claimAndLoad` runs on load (`:150-154`) and on every auth event that carries a session
    (`:157-160`). supabase-js 2.106.2 emits one on every hidden-to-visible tab change and every
    token refresh.
  - The `approved === false` gate (`:241`) has no `/checkin` exemption.
  - `AccessGate.jsx:30-35` also falls back to the request form on its own read error.
  - postgrest-js never retries the `claim_profile` POST.
- **Why it matters:** an approved student in a dead spot, or resuming the installed app, is told
  "your email isn't on the team roster yet". That happens on an NFC tap too, where
  CheckinPage's careful "nothing was recorded" state never gets a chance to show. Some will file
  a duplicate access request or sign out. A mentor whose roles read fails loses every staff
  control and can be shown the student application.
- **Size:** S. An error never downgrades state the tab already holds (trivial fix). On a
  first-load error, show a "can't reach the team server" card instead of the access form.
- **Evidence:** errors audit, measured in Chromium against a scratch fake PostgREST:
  - `claim_profile` answering 401: the access form.
  - Supabase unreachable: the same form on `/checkin?loc=front-door` after about 1.2 s.
  - A mentor whose `member_roles` read fails: lost the Readiness link, the Skills dropdown and
    the staff tile.

  The skeptic confirmed every link in code and in `node_modules` (`GoTrueClient.js:3889`,
  `:4260`; postgrest-js `RETRYABLE_METHODS`).

#### 5. One error boundary above the shell: a page crash, or a stale chunk after a deploy, removes the nav and the report button
- **Dimension:** reporting-feedback, errors-empty-states. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** FIXED by `9dba1f3`: a boundary keyed on the path around the routed
  page, keyed boundaries around both pre-shell gates, and a reload-once `vite:preloadError`
  listener, proved on a production preview build. Still open: the widget has no silent boundary
  of its own.
- **What is wrong:**
  - The only `ErrorBoundary` (`src/App.jsx:270`) wraps all routes outside `ProtectedLayout`
    (`:66-76`). A page crash therefore replaces NavBar and FeedbackWidget too.
  - It is never reset, so Back still shows the card.
  - The pre-shell gates (AccessGate `:241-247`, MemberApplication `:254-267`) have no boundary
    at all.
  - `src/ErrorBoundary.jsx:4-27` shows the raw message and a Reload button, nothing else.
  - Separately, `src/sw.js:10-14` (skipWaiting, clients.claim, precache cleanup) deletes the
    old build's chunks under an open tab.
  - `vercel.json:2` answers a missing `/assets/*.js` with `index.html`.
  - Every page is lazy (`App.jsx:9-47`).
  - Nothing in `src/` listens for Vite's `vite:preloadError`.
- **Why it matters:**
  - Any crash takes away the report button exactly when a student has something to report.
  - After most deploys, a student who reopens the installed app and taps a page they had not
    opened sees "Failed to fetch dynamically imported module" with no nav. Reload recovers,
    but it reads as a broken app.
  - A new member whose gate chunk fails gets a blank page.
- **Size:** S.
  - An inner boundary keyed on the pathname around `<Outlet/>`.
  - Boundaries around both gates.
  - A reload-once `vite:preloadError` listener. Verify it on a production build.
  - All three are trivial fixes in `App.jsx`.
  - A silent boundary around the widget needs a one-line `silent` prop in `ErrorBoundary.jsx`,
    which was not touched tonight.
- **Evidence:** fixture mode at 375 as a student.

  | Case | Nav | Launcher | Error card |
  | --- | --- | --- | --- |
  | Control | 1 | 1 | 0 |
  | `/my-hours` throwing | 0 | 0 | 1 |
  | After Back | 0 | 0 | 1 |
  | Widget chunk served as HTML | 0 | 0 | 1 |

  With the AccessGate chunk failing, `#root` has 0 children. The skeptic reproduced every case.
  Not observed on Vercel.

#### 6. Security finding: integrity of attendance rows written from the client
- **Dimension:** permissions-security. **Severity:** high. **Size:** M.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** A database-side check on new attendance rows (a trigger or a check-in RPC),
  verified with `test:checkin` at both widths.
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 7. Security finding: execute grants on a set of database functions
- **Dimension:** permissions-security. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** One numbered migration tightening execute grants on functions that only
  triggers and cron call, plus a migrations-README rule for every new function. Fix it before
  push notifications go live (decision 03).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 8. Security finding: authorization in an email-sending Edge Function
- **Dimension:** permissions-security. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** The caller check `invite-member` already uses, plus escaping one field;
  redeployed by hand.
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 9. Hours pages show a smaller total, with no warning, when one of their reads fails
- **Dimension:** errors-empty-states. **Severity:** high. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED. Team Hours keeps the last good board when a re-read
  fails (`3df69eb`). My Hours, the parent dashboard's hours reads and MemberHoursAdmin are
  unchanged.
- **What is wrong:** these all destructure only `data` and fall back to `[]`:
  - `MyHoursPage.jsx:35-51` (6 reads)
  - `HoursBoard.jsx:116-145` (7 reads) and `reloadEvents` `:105-114`
  - `ParentHomePage.jsx:60-64` and `:87-95`
  - `MemberHoursAdmin.jsx:82-91`

  `fetchAllRows` (`src/fetchAllRows.js:41-61`) returns `{data: null, error}` on any failed page
  precisely so a short read is never handed back, and each caller turns that into zero rows.
  `myHoursModel` takes no error input at all. The parent page re-polls every 15 s, so one failed
  poll overwrites good numbers. HomePage's own hours card already handles failure, so the pattern
  exists in the repo.
- **Why it matters:** students and parents read these as their hours, and mentors use them for
  goals and eligibility. A network failure shows a plausible lower number that nothing marks as
  wrong, so nobody re-checks. A failed re-read after a staff edit blanks Team Hours to zero.
- **Size:** M. One shared read helper and one error card. Keep the last good data on a failed
  re-read; HoursBoard's `reloadEvents` is a trivial fix.
- **Evidence:** errors audit, Chromium with the attendance read failing:

  | Page | Control | With the read failing |
  | --- | --- | --- |
  | `/my-hours` | 9h 30m | 2h, no error text |
  | `/hours` | 9h 30m, Days 2 | 2h, Days 0 |
  | Parent dashboard (Season) | 7h 30m | 0m |

  The skeptic confirmed the code.

#### 10. Reports and service letters print totals built from failed reads
- **Dimension:** reporting-feedback, errors-empty-states. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** FIXED by `921bbbd`: any of the five reads failing renders no table
  and no letter.
- **What is wrong:** `src/ReportsPage.jsx:67-81` runs five reads and destructures only `data`
  (`:73`); the file never mentions `error`. A failed `session_reviews` read empties the exclusion
  map, so voided and pending sessions count (`reporting.js:113`, `:172`, `:181`).
- **Why it matters:** a mentor printing a letter or exporting team hours during a blip gets a
  confident wrong number, and a voided session can be certified back into a signed letter. It is
  rare and invisible, and the document leaves the building.
- **Size:** S. Render no table and no letter when any of the five reads fails (trivial fix).
- **Evidence:** fixture mode as a mentor, Exports tab, no error text in any failing run:

  | Case | Rows | Total |
  | --- | --- | --- |
  | Control | 198 | 641h 14m |
  | `attendance_events` failing | 4 | 14h |
  | `session_reviews` failing | 198 | 656h 14m (+15h of voided/pending) |

  The skeptic reproduced all four runs.

#### 11. CI goes red tomorrow morning on every branch built from integration: a fixture test reads the wall clock
- **Dimension:** testing-ci. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** FIXED by `7539e03`: the test pins `Date` to its NOW. The
  fixture-client file passes 46/46 at 2026-10-02T07:30Z and at 2027-03-14.
- **What is wrong:** `tests/fixture-client.test.js:83-96` seeds open sessions relative to the
  pinned `NOW` (`:17`, 2026-10-01 16:00 PDT). But `detectAnomalies` reads the real clock
  (`src/hoursUtils.js:34`, `src/accountability.js:106`). From about 2026-10-02 07:25Z the seeded
  sessions pass the 10-hour cap and the test gets extra `capped` items.
- **Why it matters:** every branch containing `f7fef0b` goes red: `integration`, and every
  `claude/**` branch cut from it. `integrate.yml` then merges nothing, so every session's branch
  stays standing and looks as if it broke CI. `main`'s nightly stays green, because `main` does
  not have the file.
- **Size:** S. Pin `Date` in that one test (trivial fix).
- **Evidence:** reproduced by the writer with a shifted `Date`: 43/43 at 2026-10-01T20:00Z, and
  `['capped c6','capped c7', ...]` at 2026-10-02T07:30Z. The testing audit and its skeptic
  measured the same and proved the fix in a scratch copy.

#### 12. Team Hours "+ Manual session" crashes in production, and nothing static catches an undefined name
- **Dimension:** testing-ci. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED. The crash is fixed in production: the import reached
  `main` as `c939674`, pushed with `9543e90` on 2026-10-01. Still open: nothing static catches
  an undefined name.
- **What is wrong:**
  - On deployed `main` (`89896ca`), `src/HoursBoard.jsx:905` uses `DEFAULT_CATEGORY` with no
    import.
  - The add mode of AdjustPanel throws, and the app-level boundary replaces the whole app. Edit
    mode works.
  - There is no lint or no-undef check in `package.json` or `ci.yml`, and `npm run build` passed
    on that commit.
- **Why it matters:** every mentor attempt to add a manual session from Team Hours has failed
  for at least 40 days. That is a lower bound, because the clone is shallow.
- **Size:** S. Deploy, then add a scope check to CI: the 40-line @babel scan the audit wrote, or
  ESLint with only `no-undef`.
- **Evidence:** the scope scan finds 0 unresolved names at `aa3f533` and exactly
  `HoursBoard.jsx:905` on `origin/main` (positive control). The skeptic re-ran it.

#### 13. Check-in and check-out results are silent to screen readers
- **Dimension:** accessibility. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** FIXED by `9fe2a87` (both check-in pages: `role=alert` on the result
  lines only, glyphs and footers `aria-hidden`) and `ccd6aef` (the dashboard status line is
  `role=status`). `test:checkin` asserts 0 alerts on the confirm screen against 1 on the
  receipt.
- **What is wrong:**
  - `CheckinPage.jsx:286-405` and `VolunteerCheckinPage.jsx:327-429` render each result as a
    fresh tree with no live region.
  - The activated button unmounts, so focus falls to `<body>`.
  - The title never changes.
  - The glyphs (✓ ✗ !) and footers ("STATUS // ON DECK") are read as text.
  - The dashboard Check Out (`HomePage.jsx:212-248`) behaves the same. Only its error `<p>`
    (`:244`) has `role=alert`.
- **Why it matters:** every screen-reader student, at the start and end of every session, hears
  nothing after Confirm and cannot tell "Checked in" from "Not at the shop" without exploring.
- **Size:** S. Add `role=alert` to the result paragraph in the success, duplicate and fault
  branches only. The confirm screens share the class, so they must not get it. Add
  `aria-hidden` on the glyphs and footers, and `role=status` on the dashboard status line. All
  trivial fixes.
- **Evidence:** Playwright at 375 in fixture mode, three flows: focus on BODY, 0 live regions,
  title unchanged. The skeptic reproduced all three plus the dashboard.

#### 14. Security finding: removing a member from the team
- **Dimension:** admin-tooling, permissions-security. **Severity:** high. **Size:** L.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** An admin-set block that the sign-in claim checks first, whitelist cleanup
  when a role is revoked, and a whitelist screen (decision 07).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 15. Security finding: who can grant the mentor role
- **Dimension:** admin-tooling. **Severity:** high. **Size:** M.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** Mentor grants made admin-only in three places, and no preselected role on
  Approve (decision 08).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 16. Security finding: the parent-request email flow
- **Dimension:** permissions-security. **Severity:** high. **Size:** M.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** Require an approved member, limit student-initiated sends, and treat consent
  as unverified until staff confirm it (decision 14).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 17. Primary actions are mouse-only: a keyboard user cannot claim a job
- **Dimension:** accessibility. **Severity:** high. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED. Job rows open from the keyboard (`c63e1ce`). Team
  Hours sort heads, drill-down rows and matrix cells, Applications rows and the skills toggle
  are unchanged.
- **What is wrong:** these elements have click handlers but no role, tabindex or key handling.
  `RosterPage.jsx:369` already does it right with `<button aria-expanded>`.
  - `JobsPage.jsx:675` (click at `:678`) is the only way into a job's detail, and so the only way
    to Claim (`:861`), Mark done (`:837`) and "I'm on this job".
  - `HoursBoard.jsx:16` (sort headers, no `aria-sort`), `:498` (drill-down), `:564` (matrix
    cells).
  - `ApplicationsPage.jsx:464` (row detail).
  - `MemberSkillsPanel.jsx:174` (the in-progress toggle).
- **Why it matters:** a student on a keyboard, a switch or a screen reader cannot claim a job at
  all. Mentors cannot open an application or sort Team Hours.
- **Size:** M. The Jobs row is a one-line trivial fix.
- **Evidence:** a tab walk of every fixture route found mouse-only elements on `/hours` (26),
  `/jobs` (8), `/skills` (9), `/profile` (9) and `/applications` (13), and 0 everywhere else. The
  skeptic's 150-Tab walk on `/jobs` never focused a row.

#### 18. `--muted` text fails contrast on almost every screen
- **Dimension:** accessibility. **Severity:** high. **Size:** S.
- **What is wrong:** `--muted` `#5A6068` (`src/theme.css:25`) measures:

  | Ground | Ratio |
  | --- | --- |
  | `--bg` | 3.10:1 |
  | `--surface` | 2.85:1 |
  | `--surface-2` | 2.66:1 |

  Body text needs 4.5:1. 209 `color: var(--muted)` declarations sit in 42 product CSS files.
  Also failing:
  - the skills "Safety critical" badge, `--fault` on its tint, at 4.2 and 3.9:1
    (`MemberSkillsPanel.css:211-217`)
  - absent names on `/display` at 1.71:1 (`PresenceBoard.css:164`)
- **Why it matters:** timestamps, season names, hints, empty states and placeholders are
  unreadable for low-vision students and hard for everyone in a bright shop. The safety label is
  the one place where legibility is a safety matter.
- **Size:** S. One token. The smallest grey that passes on all three grounds is `#7F858D`, which
  is close to `--steel`, so the text ramp becomes two steps. **Decision 24.**
- **Evidence:** axe-core over 39 route/persona views at 375: color-contrast failed on 35, 451
  nodes, 284 of them `#5a6068`. The skeptic reproduced `/profile` 39, `/skills` 29 and
  `/members` 28.

#### 19. Modals are not dialogs, and they do not fit a phone
- **Dimension:** accessibility, mobile-layout. **Severity:** high. **Size:** M.
- **What is wrong:** there are nine hand-rolled backdrop dialogs in eight components:
  `JobsPage.jsx:735`, `MyHoursPage.jsx:316`, `LogHoursPage.jsx:293`, `ApplicationsPage.jsx:165`,
  `RosterPage.jsx:556`, `HoursBoard.jsx:759` and `:864`, `AttendanceHistory.jsx:56`,
  `FeedbackPage.jsx:189`.
  - **As dialogs:** only two have `role=dialog`, none traps focus, and six components ignore
    Escape. AttendanceHistory's Escape stops working once focus has left it.
  - **On a phone:**
    - The close buttons are 14x24 (My Hours, Log Hours) and 22x24 (Jobs).
    - Jobs detail is 909-931px tall and the Team Hours drill-down 2584-2761px, both with no
      sticky header.
    - No modal locks scrolling.
    - The backdrops (z 50/60) sit under the feedback launcher (z 70).
    - Only `.ah-close` got a 44px hit area.

  `FeedbackWidget.jsx:203` is a non-modal popover, which is correct.
- **Why it matters:** Jobs detail (the only place to claim) and both hours-correction forms are
  where students act. Keyboard and screen-reader users are not told a dialog opened and tab into
  the page behind it. Phone users aim at a 14px glyph or scroll four screens back to Close.
- **Size:** M. One shared Dialog: native `<dialog>.showModal()` gives an inert background and
  Escape. Give it a 44px close and a sticky header. The adjust panel stacked over
  AttendanceHistory needs care; its `covered` prop exists for that.
- **Evidence:** dialog probe at 1440: 27/30 Tab stops outside Jobs detail, 29/30 outside
  AttendanceHistory, 30/30 outside the adjust panel. The mobile audit measured the close boxes
  and heights at 342, 375 and 384. The skeptic reproduced the Jobs and Applications parts.

#### 20. Ignoring Supabase errors is the house pattern, and nothing can reproduce or bound it
- **Dimension:** errors-empty-states, reporting-feedback. **Severity:** high. **Size:** L (sweep), S (tooling).
- **What is wrong:** of about 278 Supabase calls in `src/` (excluding dev and the design
  system), 108 to 125 never look at the error, depending on how discarded `Promise.all` and
  whole-result reads are counted. Worst files:
  - VerifyHoursPage 15
  - ParentHomePage 9
  - MyHoursPage 7
  - CertifyPage 6
  - HoursBoard 6 + 4
  - App, MemberSkillsPanel, ReportsPage, RosterPage, SurveysAdmin 5 each
  - CoverageMatrix 4

  Also:
  - `?? []` appears on 239 lines.
  - No Supabase `.then` chain has a `.catch`.
  - The fixture engine can only answer missing-schema codes, never a 401, a 503, a network
    failure or an RLS refusal.
  - No test bounds the count.
- **Why it matters:** an outage, an expired session, an RLS change or a renamed column shows as
  "nothing here" instead of "something broke", so nobody reports it. Items 4, 9, 10, 26, 29, 30
  and 77 are the instances with a concrete cost. Without a fault switch, nobody can re-verify any
  fix.
- **Size:** L for the sweep. S for the tooling that must come first:
  - a `__fx_fail=<table|rpc>[:status]` control in the fixture client
  - a ratchet test with a per-file allowance, shaped like `tests/hours-reads-complete.test.js`'s
    `PENDING`, so the count can only fall
- **Evidence:** the errors audit's AST scan counted 116 of 275; the skeptic's independent rescan
  counted 108 strict and about 125 broad, of 278.

#### 21. No database test runs in CI; 37 of 49 tables have no RLS test; the harness that proved tonight's is not in the repo
- **Dimension:** testing-ci, permissions-security, documentation. **Severity:** high. **Size:** M, then L.
- **What is wrong:**
  - `.github/workflows/ci.yml:75-121` runs build, vitest, ds:audit, the Discord suite and
    history:verify. Nothing executes SQL.
  - The seven `_rls_test.sql` files (feedback, member_applications, parent_responses,
    0001-0004) run only when pasted into the SQL editor. They cover 12 of 49 tables, and neither
    `profiles` nor `attendance_events` is among them.
  - `/home/user/pgharness` (bootstrap, apply order, seed) is not committed, and
    `tools/e2e/gen-fixture-schema.mjs:19-21` depends on it too.
  - No test compares grants to intent. In the harness, authenticated holds write grants on tables
    with no matching policy: the silent 0-row class.
- **Why it matters:** items 1, 3 and 7 are exactly what a grant-surface test catches. Any future
  migration can widen a policy with nothing noticing. Tonight's PASS counts cannot be re-run next
  month, which breaks CLAUDE.md's own rule.
- **Size:** M to commit the harness and add a CI job running the seven suites on Postgres 16;
  they need nothing else. L to cover the tables that matter (profiles, attendance_events,
  logged_hours, hour_adjustments, member_roles, guardian_links) and add a grant-surface test like
  idea-app's.
- **Evidence:** all seven suites pass with plain psql in `audit_testing_ci` and
  `audit_check_testing-ci`:

  | Suite | Result |
  | --- | --- |
  | 0001 | 27/27 |
  | 0002 | 24 PASS |
  | 0003 | 24 PASS |
  | 0004 | 33/33 |
  | three frozen suites | PASS |

  All 49 tables have RLS on; 12 are tested.

#### 22. The nightly CI never tests `integration`, so the gated deploy has never been able to pass
- **Dimension:** testing-ci. **Severity:** high. **Size:** M.
- **What is wrong:**
  - `ci.yml:24-36` says it runs daily against integration. But a schedule event runs on the
    default branch, and the checkout at `:57` has no ref.
  - `deploy.yml:107-126` requires a completed CI run on integration's exact tip.
  - `integrate.yml` does not test the merged tree.
- **Why it matters:** integration, 96 commits ahead of `main` when this was written, has never
  been tested. The first time Mr. Pina presses Deploy it refuses, unless someone first
  dispatches CI on integration by hand, and before item 11's fix that run would also have been
  red.
- **Size:** M. A scheduled job that checks out integration explicitly, or `integrate.yml` testing
  the merged tree before it pushes. Correct the comments.
- **Evidence:** Actions API:
  - 0 CI runs on integration.
  - 28 scheduled runs, all on `main`.
  - Deploy has run once ever (2026-09-02), and failed.

#### 23. Three contradictory rules for how code reaches `main`
- **Dimension:** testing-ci, documentation. **Severity:** high. **Size:** S once decided.
- **Status at `e652b01`:** RESOLVED. Decision 05 records Mr. Pina's rule as decided: a solo
  session pushes straight to `main`, and the branch path is for parallel work only.
  `CLAUDE.md`'s branch section is rewritten to match in the closing docs of 2026-10-01. Still
  open: there is no `npm run gate`; the local gate is run by hand.
- **What is wrong:**
  - CLAUDE.md:40 describes the retired `integrate.yml` merging into `main`. The real one targets
    integration (`:142`) and refuses `main` (`:147-148`).
  - CLAUDE.md:195-197 says `main` moves only when a person moves it.
  - Ledger 0002:7 says tonight pushed straight to `main` under the 2026-09-27 solo rule. That
    rule exists only in idea-app (its CLAUDE.md:5971, IDEA_instructions 4.30).

  Two commits had reached `main` by the time this was written (`164766c`, `89896ca`). `main` is
  unprotected, and there is no single local gate command.
- **Why it matters:** every push to `main` deploys to students who may be mid-check-in, and SQL
  here is pasted by hand. Vercel's production deploy of `89896ca` went live at 05:38:16Z, before
  CI finished at 05:38:30Z. idea-app's solo mode assumes `migrate.yml` applies migrations, and
  frc-app has nothing like it.
- **Size:** S. Rewrite the Branches section for both modes and add `npm run gate` (build, test,
  ds:audit, discord:calendar:test, history:verify, test:checkin). **Decision 05.**
- **Evidence:** testing and documentation audits, both confirmed by skeptics; deploy and CI
  timestamps from the APIs.

#### 24. CLAUDE.md contradicts the tree in 16 places and carries none of tonight's rules
- **Dimension:** documentation, testing-ci. **Severity:** high. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED by the closing docs of 2026-10-01: all ten
  rows shown below are corrected in `CLAUDE.md`, which now also names
  `src/attendanceState.js` and `fetchAllRows`, and its Commands block carries `dev:fixture`
  and `test:checkin`. The withheld row stands (decision 04). The other five of the 16 were
  not re-checked.
- **What is wrong:** examples of the 16, each claim against the tree (one row is withheld under
  decision 04):

  | CLAUDE.md says | The tree |
  | --- | --- |
  | `/feedback` is "isAdmin-gated in App.jsx" | `App.jsx:315` is ungated; FeedbackPage gates itself |
  | Statuses are open/reviewed/dismissed | Now new/seen/in_progress/done/wont_do/spam |
  | "No commit-sha telemetry" | `VITE_APP_BUILD` is sent |
  | `/checkin` "shows a category picker" | `CheckinPage.jsx:106` always writes the default |
  | Schedule defaults to Agenda and has a Week view | Month is the default; there is no Week |
  | An 8-value subteam taxonomy | 12 values |
  | Both acknowledgments are unstorable-as-false | The build CHECK was dropped |
  | `attendanceHoursByDate` | Gone |
  | "Drives ONE route ... no committed fixture-mounting harness" | Fixture mode exists |
  | "Three have a `_rls_test.sql` sibling" | Seven |

  CLAUDE.md was last edited 2026-09-02, 99 commits ago. It has 0 mentions of 17 names added
  since, including the two rules most likely to be undone:
  - `src/attendanceState.js`: a re-shown `/checkin` never writes, and an open session under 10h
    stays "in" across midnight.
  - The `fetchAllRows` paging rule.

  The Commands block also lacks `dev:fixture` and `test:checkin`.
- **Why it matters:** every session treats CLAUDE.md as the reference. A session told there is a
  category picker may restore one on the NFC fast path. Tonight's lanes logged 61 wrong-claim
  bullets, 33 of them about CLAUDE.md.
- **Size:** M. This is the closing agent's job tonight.
- **Evidence:** documentation audit; the skeptic confirmed all 16 at `aa3f533`.

#### 25. The base access policies live in two root SQL files no document names
- **Dimension:** documentation. **Severity:** high. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED by the closing docs of 2026-10-01: `CLAUDE.md`'s
  database section names both files and says which one was pasted. Neither file is marked "do
  not run" at its top, and `supabase/migrations/README.md` still describes the frozen set as
  `supabase/*.sql` plus `sql/` only.
- **What is wrong:**
  - `platform_migration.sql` and `platform_foundation.sql` at the repo root define the
    base read and update policies for `profiles` and `attendance_events`, `has_role()`
    (`:49-59`) and the sign-up trigger.
  - CLAUDE.md and `supabase/migrations/README.md:29` describe the frozen foundation as
    `supabase/*.sql` plus `sql/` only.
  - Re-pasting `platform_migration.sql`, as its header invites, would reinstall a
    `handle_new_user` (`:61-77`) that gives every sign-up `student`. The live one gives none.
  - `platform_foundation.sql`'s role CHECK has no `parent`.
  - Both use bare `$$`, which CLAUDE.md:150 forbids.
- **Why it matters:** a session diagnosing access searches `supabase/` and never finds the policy
  that decides it; three lanes rediscovered this tonight. A re-paste silently changes what every
  new account gets.
- **Size:** S. Mark both "do not run" at the top, and name them in CLAUDE.md's database section.
- **Evidence:** 0 doc references. `0004:226-234` and `0001:33` do point at
  `platform_migration.sql`. Behaviour was measured in `audit_documentation`.

### Medium

#### 26. Every Verify Hours queue reads "All caught up" when its read fails
- **Dimension:** errors-empty-states. **Severity:** medium. **Size:** S.
- **What is wrong:** none of these check the error, so on a failed read all five queues show the
  green empty state and the dashboard reads "Pending 0 all clear":
  - `VerifyHoursPage.jsx:89-195`: missed check-outs, corrections, logged-hours corrections and
    anomalies.
  - `:267-285`: pending logged hours.
  - `HomePage.jsx:30-60`: staff tiles.
  - `NavBar.jsx:201-226`: badges.
- **Why it matters:** a student's volunteer hours or correction sits unreviewed while mentors
  are told there is nothing to do.
- **Size:** S. Give each queue a third state, "couldn't load".
- **Evidence:** with `logged_hours` answering 401, the pending entry vanished under "All caught
  up", with no error text.

#### 27. Two staff writes report success without checking: the auto-close cutoff, and missed-checkout Approve/Void
- **Dimension:** admin-tooling, errors-empty-states. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** FIXED by `ccd6aef`: the cutoff save drops `updated_at`, checks its
  result and reports a write that matched no row; a failed Approve or Void keeps its card.
- **What is wrong:**
  - `saveCutoff` (`VerifyHoursPage.jsx:401-409`) ignores the result, marks the value saved, and
    writes `app_settings.updated_at`. That column does not exist where `study_sessions.sql:46`
    created the table before `sql/forgotten_checkout.sql:8-11`.
  - `handleMissed` (`:388-397`) removes the card whether or not the update landed.
- **Why it matters:** a mentor moving the cutoff for a late build night is told it saved while
  22:00 stays in force, and everyone still in the shop is auto-closed. An approved missed
  check-out can vanish while staying uncounted.
- **Size:** S (trivial fixes). Check live with
  `select column_name from information_schema.columns where table_name='app_settings'`.
- **Evidence:**
  - Database: the update with `updated_at` raised 42703; without it, `UPDATE 1`.
  - Browser: after a failed save, the field read 23:30 and Save was disabled.

#### 28. Service-hour letters: three ways a signed letter is wrong
- **Dimension:** reporting-feedback. **Severity:** medium. **Size:** S (b, c), M (a).
- **Status at `e652b01`:** (b) and (c) FIXED by `921bbbd`: the method sentence states what the
  code does, capped sessions are marked `(capped)`, and Generate needs a From date. (a) is open
  (decision 13).
- **What is wrong:**
  - **(a) Adjustments are left out.** Letters, the Reports export, the per-event rollup and the
    Team Hours CSV omit `hour_adjustments`, while My Hours counts them.
    - `reporting.js:57-102` reads attendance and logged hours only.
    - `ReportsPage.jsx:67-72` never reads adjustments.
    - `HoursBoard.jsx:347-373` omits from the CSV what the on-screen table includes.
  - **(b) The method sentence is false.** `reporting.js:249-251` says "Sessions exceeding the
    daily cap ... are excluded". In fact a capped session counts at 10h with no mark in the
    itemized record (`:204-210`), an open session counts up to "now", and
    `attendance_events.verified` defaults false.
  - **(c) No From date prints 1970.** Without a From date the letter says "between January 1,
    1970" (`ReportsPage.jsx:107`). Generate is enabled (`:330`) and the preview reads "start".
- **Why it matters:** the letter is the copy that goes to a school or employer over a mentor's
  signature. Under (a) and (b), the student, Team Hours, the CSV and the letter disagree; (b)
  inflates the total; (c) is the default quick path.
- **Size:** S for (b) and (c), as trivial fixes; M for (a). **Decision 13.**
- **Evidence:**
  - A +1.5h fixture adjustment shows on My Hours and is absent from exports and the letter.
  - A 20h forgotten session yields a 10h row and a 12h letter for 2h of clean sessions.
  - `letterHtml` with no From date prints January 1, 1970.

#### 29. The parent dashboard says "No students linked" when a read fails
- **Dimension:** errors-empty-states. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** FIXED by `ccd6aef`: a failed `guardian_links` read keeps the last
  good view.
- **What is wrong:** `ParentHomePage.jsx:58-83` treats a failed `guardian_links` read as no
  links. The 15 s poll means one failed poll flips the view.
- **Why it matters:** parents, the least technical audience, are invited to request a link they
  already have, and staff triage the duplicates.
- **Size:** S (trivial fix). **Evidence:** with `guardian_links` answering 401, the page read
  "No students linked to your account yet."

#### 30. Log Hours says "No entries yet" when its read fails, inviting duplicate submissions
- **Dimension:** errors-empty-states. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** FIXED by `ccd6aef`: a failed read says so, and the correction
  modal's fields are labelled.
- **What is wrong:**
  - `LogHoursPage.jsx:34-41` sets entries to `[]` on failure, which renders the first-time
    state (`:246-247`).
  - The corrections read (`:43-50`) is also unbound, so "Request correction" reappears on an
    entry that already has one pending.
- **Why it matters:** students re-log hours they already logged. Two verified duplicates
  double-count service hours.
- **Size:** S (trivial fix). **Evidence:** read from code; not measured in the browser.

#### 31. The NFC check-in fault screen throws away the error and offers no way to report
- **Dimension:** reporting-feedback. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED by `9fe2a87`: the fault screen names its error code and
  says to show the screen to a mentor. The "Report this" link is still the M follow-up.
- **What is wrong:**
  - `CheckinPage.jsx:128-131`, `:157-160` and `:237-240` send errors to `console.error` and show
    "System fault / Could not record your attendance. Try again." (`:306`) with no code.
    `VolunteerCheckinPage.jsx:323` does the same.
  - The feedback widget is excluded from the fast paths by design, and nothing replaces it.
    idea-app's rule is that an exclusion relocates the control, never deletes it.
  - AccessGate, MemberApplication, Login and Landing have no report path either.
- **Why it matters:** check-in is what every student does every session, and tonight's open bug
  report was about this path. A student who hits the fault has nothing specific to tell a
  mentor.
- **Size:** S. Show the code and "show this screen to a mentor" (trivial fix; run `test:checkin`
  afterwards). A "Report this" link is the M follow-up.
- **Evidence:** read from code.

#### 32. Offline, the service worker has no navigation fallback, so an NFC tap gets the browser's offline page
- **Dimension:** errors-empty-states. **Severity:** medium. **Size:** S.
- **What is wrong:**
  - `src/sw.js:5-14` registers only `precacheAndRoute`.
  - vite-plugin-pwa supplies `navigateFallback` only in generateSW mode
    (`node_modules/vite-plugin-pwa/dist/index.js:791`), so the move to injectManifest dropped it.
  - Every deep link (`/checkin?loc=...`, `/dashboard`) needs the network.
  - The installed app's start URL `/` boots from cache, then lands on item 4's access form.
  - CLAUDE.md says offline is preserved.
- **Why it matters:** NFC taps happen where signal varies. The student sees the browser's
  offline page or "not on the roster", never "no connection, nothing was recorded".
- **Size:** S. A `NavigationRoute` to the cached index, plus an offline state on `/checkin`.
  Whether to queue taps is **Decision 19**.
- **Evidence:** read from source. The offline deep-link page itself was not measured; that needs
  a production build with the service worker.

#### 33. My Hours "Flag this session": the time being corrected does not fit in its field
- **Dimension:** mobile-layout. **Severity:** medium (the skeptic lowered it from high). **Size:** S.
- **Status at `e652b01`:** FIXED by `aeb27fc`: the two fields stack on narrow screens.
- **What is wrong:** `MyHoursPage.jsx:330-338` puts two `datetime-local` fields side by side at
  every width (`MyHoursPage.css:393-394`). Each field's content is 108, 125 and 129px wide at
  342, 375 and 384, against about 145px for the value text alone, so it cannot fit below a
  roughly 458px viewport.
- **Why it matters:** a student flagging a session on a phone cannot read back the time they are
  proposing. The 2026-09-23 report came from 384x692. The required field is the note and the
  original time is printed above, so the form is degraded rather than blocked.
- **Size:** S (trivial CSS).
- **Evidence:** at 342 the field shows "09/30/2026," and at 384 "09/30/2026, 10". This is
  desktop Chromium's control under an Android UA, not a real Android widget.

#### 34. No 16px floor on form fields, so iPhone Safari zooms into every form
- **Dimension:** mobile-layout. **Severity:** medium. **Size:** S.
- **What is wrong:** there is no control font-size floor in `theme.css` or `App.css`. 28 fields
  on 9 phone routes compute below 16px:
  - Log Hours: 15.2
  - Study: 14.4
  - Profile: down to 12.48
  - Survey: 15.2
  - Parent pages: 14.4 and 15.2
  - Every member-application field (`MemberApplication.css:144-147`): 15.2
  - The flag modal: 14.4
- **Why it matters:** every iPhone student filling in Log Hours or the season application gets a
  zoomed, sideways-scrolling page on each field.
- **Size:** S. One rule in `theme.css`.
- **Evidence:** computed sizes at 375. The zoom itself is WebKit behaviour and was not observed.

#### 35. Schedule opens on an unreadable month grid on phones, and tapping a day appears to do nothing
- **Dimension:** mobile-layout. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED by `aeb27fc`, under decision 21's default: Agenda under
  640px wide. Scrolling a tapped month day into view is not done.
- **What is wrong:**
  - `SchedulePage.jsx:84` defaults to Month, and `:12` offers only month and agenda.
  - Phone cells are 41-47px wide, and all 20 chip titles are clipped to 28px.
  - A tapped day's events render under the grid with no scroll (`:670-677`). At 342x673 the list
    starts at y=702.
- **Why it matters:** students and parents open Schedule to find the next build session.
- **Size:** S (trivial under the default). **Decision 21.**
- **Evidence:** mobile audit at 342x673, 384x692 and 375x812.

#### 36. Team Hours on a phone loses the names when scrolled to the totals
- **Dimension:** mobile-layout. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** FIXED by `3df69eb`: the Member column is sticky.
- **What is wrong:** the by-member Member column (`HoursBoard.jsx:487`, `:504`) lacks
  `.board-sticky`, which the Matrix already uses (`HoursBoard.css:271-277`). The table is 849px
  wide in a 341px wrap.
- **Why it matters:** Team Hours is one of a parent's three nav items and the board students
  check. On a phone nobody can tell whose total is whose.
- **Size:** S (trivial fix). **Evidence:** adding the class in the browser kept the names visible
  (positive control).

#### 37. The installed iPhone app probably draws the nav under the status bar
- **Dimension:** mobile-layout. **Severity:** medium. **Size:** S.
- **What is wrong:**
  - `index.html:7` sets `black-translucent`.
  - `index.html:5` lacks `viewport-fit=cover`.
  - `src/` has 0 `env(safe-area-inset-*)`.
  - The wordmark and the 30px avatar sit at y about 12-48.
- **Why it matters:** on a notched iPhone, the account menu (Profile, Survey, Sign out) is
  likely under the clock on every launch.
- **Size:** S. **Decision 22.**
- **Evidence:** PLAUSIBLE, not measured; there is no WebKit here. One look at the installed app
  settles it.

#### 38. Tap targets and type sizes on student screens are below any floor
- **Dimension:** mobile-layout, accessibility. **Severity:** medium. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED by the shape-language port (`docs/SHAPES.md`): with
  the plate on, which is the default at `e652b01`, 0 of 708 student-reachable targets are under
  44px at 375 and at 1440 (417 and 298 with it off). Dense staff-only controls are exempt. Text
  under 11px was not re-measured (decision 23).
- **What is wrong:** there is no tap-size rule. On 15 student routes at 375, 150 of 242 controls
  are under 44px (182 at 342), and 12 are under 24px:
  - the My Hours flag button, 38.6x14.6, seven times a page (`MyHoursPage.css:327-338`)
  - VIEW STATUS, 116.9x19, on both check-in receipts (`CheckinPage.css:217-225`)
  - Schedule "My events", 87.8x17
  - Profile group toggle, 293x16
  - "Clear this answer" on `/parent`, 105.7x13

  The nav links are 37px tall and the avatar 30x30 on every page (`NavBar.css`). 167 of 1,045
  text nodes are under 11px.
- **Why it matters:** students tap in the shop, often with dirty hands. The smallest control on
  My Hours is the only way to dispute a session, and VIEW STATUS is the only way back from the
  NFC path.
- **Size:** M. The flag button is a trivial CSS fix. **Decision 23.** Re-measure after the
  shape-language port (G) lands.
- **Evidence:** tap and text sweeps in fixture mode.

#### 39. Errors and loading states are never announced
- **Dimension:** accessibility. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - 0 `aria-live` in `src/`.
  - 43 error paragraphs, 5 with `role=alert`, all of them in tonight's code.
  - 28 bare spinners.
  - Ten errors are dismissable only by clicking the paragraph.
  - The spinner keyframes are copied 27 times.
- **Why it matters:** a wrong sign-in code, a failed claim and a failed hours request appear
  without being spoken, and loading cannot be told from broken.
- **Size:** M; it folds into item 66. **Evidence:** grep counts; 0 live regions measured.

#### 40. 71 form fields have no label
- **Dimension:** accessibility. **Severity:** medium. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED: the My Hours flag modal (`aeb27fc`) and the Log Hours
  correction modal (`ccd6aef`) are labelled.
- **What is wrong:** 186 fields in 47 files; 71 have no association. Among them:
  - the My Hours flag modal (`MyHoursPage.jsx:325-342`)
  - the Log Hours correction modal (`LogHoursPage.jsx:304-333`)
  - `LoginPage.jsx:58` and `:106` (placeholder only)
  - `SquadPage.jsx:212` (14 selects)
  - `MemberHoursAdmin.jsx` (16)
  - `VerifyHoursPage.jsx:999-1091` and `RosterPage.jsx:463-513`

  There are 0 `aria-required`, `aria-describedby` or `aria-invalid` attributes.
- **Why it matters:** a screen reader announces the correction fields as "edit text, date", so a
  student cannot tell check-in from check-out.
- **Size:** M. The two hours-correction modals are trivial fixes.
- **Evidence:** AST scan; axe confirmed 27 without opening modals. MemberApplication, AccessGate
  and ParentResponse have 0.

#### 41. Form field edges are invisible
- **Dimension:** accessibility. **Severity:** medium. **Size:** M.
- **Status at `e652b01`:** FIXED with the plate on: every field and select sits in a well whose
  hairline (`--tm-hair`) measures 4.00, 3.68 and 3.43:1 on `--bg`, `--surface` and
  `--surface-2` (`docs/SHAPES.md`).
- **What is wrong:** the resting field borders (`--border-strong`, `--border`, `theme.css:21-22`)
  measure at most 1.33:1 against the card. A control boundary needs 3:1. Focused fields measure
  14.32:1.
- **Why it matters:** in shop light, students see a label with no box under it on Log Hours,
  Profile, Study and the survey.
- **Size:** M. A load-bearing boundary token (`#64686E` is the lightest that passes on
  `--surface`), as idea-app keeps decorative and load-bearing boundaries apart.
- **Evidence:** 18 of 18 fields under 3:1 at 375.

#### 42. No `<main>`, no page titles, and 16 views with no h1
- **Dimension:** accessibility. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - `ProtectedLayout` (`App.jsx:66-76`) renders pages in a div, with no skip link.
  - `document.title` is never written.
  - 16 of 39 views have no h1. The dashboard and VerifyHoursPage have no headings at all.
  - Focus does not move on navigation.
- **Why it matters:** screen-reader users cannot jump to the content, and every navigation is
  silent.
- **Size:** M. `<main>` (plus `flex:1` in App.css), a per-route title from the labels
  `routes.js` already holds, and one h1 per page.
- **Evidence:** axe: `landmark-one-main` failed on 39/39 and `page-has-heading-one` on 16/39.

#### 43. Nav dropdowns: no expanded state, no Escape, and the staff pending dot is hidden
- **Dimension:** accessibility. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** FIXED by `aeb27fc`: `aria-expanded`, Escape closes, and the pending
  count is in the avatar button's name. Still open: the outside-click close is mouse-only, and
  Escape does not return focus to the trigger.
- **What is wrong:**
  - `NavBar.jsx:66-93` and `:97-120` set no `aria-expanded` and ignore Escape.
  - `useOutsideClick` (`:54-63`) listens to the mouse only.
  - The accessible names include the chevron.
  - The pending dot (`:118`) is `aria-hidden` with no text equivalent.
- **Why it matters:** keyboard users pile up open menus. Screen-reader staff are never told
  requests are waiting, so a pending student or parent waits until someone sighted notices.
- **Size:** S (trivial fix). **Evidence:** after Escape and 12 Tabs the menu stayed open. The
  feedback launcher in the same shell does it right.

#### 44. Selection is shown by colour alone on 22 toggles
- **Dimension:** accessibility. **Severity:** medium. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED: Team Hours' season tabs and view toggle carry
  `aria-pressed` (`3df69eb`).
- **What is wrong:** 22 buttons in 13 files toggle a class with no `aria-pressed`, among them
  Profile subteam chips (`ProfilePage.jsx:248`, `:268`), Team Hours season tabs and views
  (`HoursBoard.jsx:435`, `:448-456`) and Reports tabs. Tonight's code uses `aria-pressed`
  correctly 8 times.
- **Why it matters:** a screen-reader student cannot hear which subteams are selected.
- **Size:** M. HoursBoard's are trivial fixes. **Evidence:** AST scan.

#### 45. Wide tables cannot be scrolled by keyboard
- **Dimension:** accessibility. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED: Team Hours' table wraps are focusable regions
  (`3df69eb`). Reports' `rp-table-wrap` is unchanged.
- **What is wrong:** the `board-table-wrap` and `rp-table-wrap` containers scroll sideways but
  are not focusable, and their rows are mouse-only (item 17).
- **Why it matters:** at 375 a keyboard user cannot reach Total, Days or any matrix day.
- **Size:** S (trivial fix). **Evidence:** axe `scrollable-region-focusable` failed on `/hours`
  for three personas and on `/reports`.

#### 46. The staff drill-down hides Edit and Void behind a sideways scroll in every day
- **Dimension:** mobile-layout. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED by `8dcaae2`: duration and category stay in view at
  375, but Edit and Void still scroll sideways, by about 57px.
- **What is wrong:** `AttendanceHistory.css:121` holds a 362px table (`:128`) in a 263-305px day
  box, so each day scrolls sideways with no visible bar. The buttons are 40x18.
- **Why it matters:** a mentor correcting a session on the shop floor cannot see Void on any row,
  nor Edit at 342.
- **Size:** S. Stack the actions under 480px. **Evidence:** Void was clipped on 23/23 rows at all
  three widths.

#### 47. Missed-checkout review is all-or-nothing, and a Void cannot be undone
- **Dimension:** admin-tooling. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - Approve credits up to the 22:00 cutoff and Void credits 0. Each is one unconfirmed click,
    side by side (`VerifyHoursPage.jsx:545-556`).
  - A voided review never reappears in any queue.
  - Approving the student's correction leaves the review voided (`session_reviews` is written
    only at `:390`), so the session stays uncounted.
  - There is no select-all.
- **Why it matters:** every forgotten tap lands here. A student who left at 6 PM gets 6.5h or 0h,
  and a misclick zeroes a real session nobody can restore in the app.
- **Size:** M. An end-time option on the card (reuse `src/hoursResolve.js`), a voided list or an
  undo, and an approved correction that clears its review.
- **Evidence:** grep; admin audit.

#### 48. A rejected logged-hours entry is final and unexplained
- **Dimension:** admin-tooling. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - Reject (`VerifyHoursPage.jsx:413-421`) stores only the status: no reviewer, time or note.
  - Nothing reopens a rejected entry; `staff_edit_logged_hours` never changes status.
  - Students can request correction only on verified entries.
- **Why it matters:** a misclicked Reject on a student's volunteer hours is permanent, and the
  student is never told why.
- **Size:** M. **Evidence:** the only `'rejected'` in `src/` is `:418`.

#### 49. Readiness reports the wrong hours, pads its at-risk list, and counts 3 of the 8 queues
- **Dimension:** reporting-feedback. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - `readiness_summary.sql:45-79` pairs sessions per UTC date with no cap, and calls every
    category "build hours". It is a second copy of the hours arithmetic that tonight's LA-day and
    cap rules no longer match, with no CI gate.
  - `:89-101` lists every approved profile with no event as at risk, whatever its role.
  - `:147-191` counts only pending logged hours, submitted claims and unapproved profiles.
- **Why it matters:** the team-health screen misses most after-school build time, one forgotten
  tag inflates it by days, and the at-risk list is padded with parents and mentors. A mentor can
  read "All clear" while corrections, access, cert and parent-link requests and feedback wait.
- **Size:** M. One migration rebuilds it on the shared rules, with a parity test against
  `hoursUtils`.
- **Evidence:** in `audit_reporting_feedback`:
  - Two 4h sessions read as 4.0.
  - One forgotten check-in gave 108.1.
  - At risk: 4 names, 3 of them not students.
  - Five waiting items of five kinds: total 1.

#### 50. Security finding: the read scope of parent accounts
- **Dimension:** permissions-security. **Severity:** medium. **Size:** M.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** Scope parent reads of attendance and presence (decision 10).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 51. Security finding: the lead role, and staff acting on their own hours
- **Dimension:** admin-tooling, permissions-security. **Severity:** medium. **Size:** S/M.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** Block staff from crediting their own hours, and define who holds lead
  (decision 09).
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 52. Security finding: calendar feed tokens
- **Dimension:** permissions-security, documentation. **Severity:** medium. **Size:** S.
- **Status at `e652b01`:** unfixed.
- **Kind of fix:** Rebuild one column grant the way `parent_responses.sql` does, and check
  membership in the feed function.
- Detail withheld from this public repository until fixed (decision 04,
  public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.

#### 53. Schema the code needs that no SQL file creates; only tonight's features handle a missing migration
- **Dimension:** errors-empty-states, documentation. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - `profiles.geofence_exempt` is read by both check-in pages and the roster, but no SQL file
    creates it, and no file creates `profiles` or `attendance_events` either.
  - `src/schemaMissing.js` is used by 5 modules, all of them tonight's. Older features show raw
    PostgREST text (`SurveyPage.jsx:166`, `:182`), an empty list, or a default.
  - The check-in pages ignore the `geofence_exempt` read error (`CheckinPage.jsx:181-186`,
    `VolunteerCheckinPage.jsx:196-201`).
- **Why it matters:** SQL is pasted by hand, so "deployed before its migration" is normal here.
  If the column were missing live, an exempted student with bad GPS would be refused at the
  fence. Students see Postgres jargon.
- **Size:** M. An idempotent migration re-pinning the column (**Decision 26**), and older features
  routed through `isSchemaMissing`.
- **Evidence:** grep. `/survey` rendered "Could not find the table 'public.surveys' in the schema
  cache".

#### 54. Re-pasting three frozen SQL files silently reverts live
- **Dimension:** admin-tooling, testing-ci, documentation. **Severity:** medium. **Size:** M.
- **What is wrong:** each of these undoes later work if re-run:
  - `categories_reduce_event_kind.sql:59-60` re-pins the kind CHECK without `training`.
  - `study_sessions.sql:46` creates `app_settings` without `updated_at`.
  - `domain_roster_gate.sql` re-creates `claim_profile` with no whitelist branch (`:47-84`) and
    `admin_get_members` without nickname (`:113`).

  The migrations README says only to assume the frozen files are applied. The event-kind
  vocabulary has no drift test, although all four sites are machine-readable.
- **Why it matters:** a mentor re-running one "to make sure" breaks Training events, the cutoff
  save, roster nicknames, or every invite and access approval, with no error. The shared
  `frc_base` harness held the wrong `claim_profile`, so lane measurements of invite and access
  flows there used the wrong function.
- **Size:** M. A migration re-pinning each object in its final form, a "never re-run" header on
  the three files, and an event-kind case in `tests/vocabulary-drift.test.js`.
- **Evidence:** built in documented order: the CHECK has no training, there is no nickname
  column, and `updated_at` is absent. The whitelist test returned `student` only until
  `access_requests.sql` was re-applied.

#### 55. Seasons have no screen, and the current season rows exist in no SQL file
- **Dimension:** admin-tooling, documentation. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - `src/` makes 0 writes to `seasons` (5 readers), although `seasons.sql:19` lets staff write.
  - No repo SQL creates Offseason 2026 or Biocore 2027.
  - The only SQL for them is inside `hours_types_build_plan.md`, and it fails against the frozen
    table: there is no unique key on name, and `end_date` is NOT NULL.
  - Inserting the next season row is what puts the application in front of every student.
- **Why it matters:** Biocore 2027 starts 2027-01-07. Without the row, the application gate never
  fires and goals cannot be set. A mistyped row gates every student at the wrong moment, from the
  SQL editor, with no preview.
- **Size:** M. A staff season editor that previews who the gate will catch, plus idempotent rows
  (**Decision 26**).
- **Evidence:** grep. The plan's SQL raised "no unique or exclusion constraint matching the ON
  CONFLICT specification".

#### 56. A member application cannot be corrected by anyone
- **Dimension:** admin-tooling. **Severity:** medium. **Size:** M.
- **What is wrong:** `member_applications.sql:180-247` has select and insert only. The one RPC
  sets the Discord flag.
- **Why it matters:** a mistyped emergency contact stays wrong in the export staff would use in
  an emergency. This happens to some students every season.
- **Size:** M. A staff correction RPC that audits its change. **Evidence:** grep.

#### 57. Admins cannot delete most members, and the confirmation understates what a delete destroys
- **Dimension:** admin-tooling. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - `admin_delete_member` (`admin_member_management.sql:66-121`) nulls 15 actor columns.
  - Eight NO ACTION foreign keys are left: `attendance_audit.member_id` and `.actor_id`,
    `hour_adjustments.created_by`, `hour_goals.updated_by`, and four `reviewed_by` columns.
  - The modal (`RosterPage.jsx:206-218`, `:559-562`) names 6 kinds of data, while about 24 tables
    cascade, with no counts.
  - The fixture emulation (`src/dev/fixture/rpcs.js:111-125`) succeeds where live refuses.
- **Why it matters:** deleting any student whose attendance was ever corrected fails with a raw
  FK error, and tonight's resolve tools make more members undeletable. A delete that succeeds
  silently rewrites survey aggregates and empties that member's bug reports.
- **Size:** M. **Decision 11.**
- **Evidence:** two `attendance_audit` failures and one `hour_adjustments` failure. A member with
  no audit rows deleted cleanly (control).

#### 58. The last admin can remove their own admin role with one unconfirmed tap
- **Dimension:** admin-tooling. **Severity:** medium. **Size:** S.
- **What is wrong:** `admin_set_member_role` (`:29-55`) has no last-admin guard, and the roster
  chip toggles immediately, including on the admin's own row (`RosterPage.jsx:183-204`,
  `:407-425`).
- **Why it matters:** Mr. Pina, probably the only admin (unverified), would lose the roster,
  inbox, announce composer and capability grants until an INSERT in the SQL editor.
- **Size:** S. **Evidence:** the sole admin removed their own role; the admin count went to 0.

#### 59. Admin actions leave no record
- **Dimension:** admin-tooling. **Severity:** medium. **Size:** L.
- **What is wrong:** `attendance_audit` covers attendance edits only, and nothing reads it in
  `src/`. None of these is recorded:
  - role grants and approvals
  - domain and whitelist changes
  - deletions
  - capability revokes
  - logged-hours edits, deletes (`admin_hours_management.sql:20-62`, no reason) and rejects
  - un-certifications

  `/access-requests` shows pending requests only.
- **Why it matters:** when a student disputes hours, or Mr. Pina needs to know how someone got
  staff, the app cannot answer.
- **Size:** L. One action log written by the RPCs, and a viewer, starting with roles and
  approvals.
- **Evidence:** harness trigger and table lists.

#### 60. There is no backup, and no way to see which migrations are live
- **Dimension:** admin-tooling, testing-ci. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - `.github/workflows` holds `ci.yml`, `deploy.yml` and `integrate.yml`; none takes a backup.
  - Every removal is a hard DELETE.
  - Nothing records applied migrations; the typed DEPLOY sentence (`deploy.yml:16-25`) is the
    only gate.
  - The Supabase plan and PITR are unverified.
- **Why it matters:** one wrong statement in the SQL editor loses a season of hours for good, and
  Mr. Pina must remember which of 0001-0004 he has pasted.
- **Size:** M. idea-app's `backup.yml` (nightly `pg_dump` off Supabase) and `deploy-probe.mjs`,
  both on one read-only credential. **Decision 12.**
- **Evidence:** the workflow listing; idea-app's files.

#### 61. A crash reaches nobody unless a student types it up
- **Dimension:** reporting-feedback. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - 0 `error`, `unhandledrejection` or `componentDidCatch` handlers in `src/`.
  - The error card has no id, route or build, and no report action.
  - CLAUDE.md records "no automatic client-error capture" as deliberate.
- **Why it matters:** most students press Reload, so failures that hit many people silently (stale
  chunks, one phone model) leave no trace.
- **Size:** M. **Decision 15.** **Evidence:** grep; idea-app's `hooks.client.ts` and error page.

#### 62. Nothing tells Mr. Pina a feedback report has arrived
- **Dimension:** reporting-feedback. **Severity:** medium. **Size:** S.
- **What is wrong:** `FeedbackPage.jsx:455` says so itself. The only signal is a count inside the
  admin avatar menu (`NavBar.jsx:214-227`), and Readiness does not count feedback. Lane c
  recorded six open reports on 2026-10-01, the oldest about 28 days old and one of them Mr.
  Pina's own (not verified against live).
- **Why it matters:** a student who reports a problem waits weeks with no sign it was seen, and
  learns that reporting does nothing.
- **Size:** S. **Decision 16.**

#### 63. Edge Functions and the week-ahead cron are untested, unpinned and undocumented
- **Dimension:** testing-ci, documentation. **Severity:** medium. **Size:** M.
- **What is wrong:**
  - 7 of 9 functions (1,066 lines) have no test. None is type-checked or run under Deno.
  - Every one imports `https://esm.sh/@supabase/supabase-js@2` unpinned.
  - `api/_lib/weekAhead.js` (305 lines, pure) has no test.
  - Only `discord-calendar` has a README. It, `index.ts:10` and `SERVER_SPEC.md:397` still
    promise a 24h reminder retired on 2026-08-26.
  - No document lists the functions, their 18 secrets, which need `--no-verify-jwt`, or the three
    config rows to fill.
- **Why it matters:**
  - `parent-response` is an anon-reachable URL writing parent answers with the service role, and
    its validation is untested.
  - A broken redeploy is found by parents and calendar subscribers.
  - Each redeploy pulls whatever supabase-js 2.x is current that day.
  - The week-ahead post's no-ping and title-only rules are pinned by nothing.
- **Size:** M. A `deno.json` pin, Node tests for the pure parts (as `discord-calendar` does), and
  one `supabase/functions/README.md`.
- **Evidence:** grep; `which deno` is empty.

#### 64. The check-in E2E reads 8/24, and nothing machine-enforced stopped the merge
- **Dimension:** testing-ci. **Severity:** medium. **Size:** M.
- **Status at `e652b01`:** FIXED. The test was wrong, not the app: it tapped the tag in the
  same tab, which Chromium turns into a reload that keeps the page's history state. The
  check-in gate pass remodelled a tag tap as a new tab and pinned the same-tab case as step R7
  (decision 28). `test:checkin` reads 51/51 at 375 and 1440 at `e652b01`, and the README no
  longer describes the fixed double check-out. CI still runs no browser instrument (item 65).
- **What is wrong:**
  - `tools/e2e/checkin.mjs` at `aa3f533`: step c2 expects a zero-tap CHECKED OUT and now gets the
    confirm-out screen from `67e6788`, and steps d-g cascade.
  - `tools/e2e/README.md` still describes the double-OUT that `67e6788` fixed.
  - CI runs no browser instrument, and `shoot.mjs` always exits 0.
  - A revised E2E is in flight, so this is not a missing instrument.
- **Why it matters:** c2 is the end-of-session check-out. Until the revision lands, the instrument
  cannot tell a harness artifact from a regression.
- **Size:** M (the revision plus a CI job). **Evidence:** the testing audit ran it; `shoot.mjs`
  rendered 33/33 routes.

#### 65. No browser check runs on the app's real routes
- **Dimension:** mobile-layout, accessibility. **Severity:** medium. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED: the viewport parsing (`ef9edd7` for `lib.mjs`,
  `a685503` for `shoot.mjs`, which now renders exact sizes such as 342x673). `npm run
  test:features` (957/957 at `e652b01`) and the plate's 44px sweep now exist, local only. No
  axe or contrast run on real routes, and nothing in CI (decision 25).
- **What is wrong:**
  - `tools/browser-verify/checks.mjs` has `contrast()` (`:168`) and `tapTargets()` (`:217`), but
    they run only on `/_ds`.
  - `tools/e2e/lib.mjs:38-42` hard-codes 812px height for phones.
  - `shoot.mjs:33` drops `342x673` as NaN, so the reported phone sizes cannot even be rendered.
  - Every mobile and accessibility number above came from scratch harnesses.
- **Why it matters:** each of those findings can be fixed and silently re-broken, and mobile
  regressions arrive as student reports.
- **Size:** M. A fixture-mode spec running axe-core plus `contrast`, `tapTargets` and
  `horizontalScroll` over every `routes.js` entry per persona, at 342x673, 375x812, 384x692 and
  1440, with a positive control. The viewport parsing is a trivial fix. **Decision 25.**
- **Evidence:** read; mobile and accessibility audits. A result to keep: 0px horizontal page
  overflow on all 69 runs.

#### 66. No shared accessible primitives
- **Dimension:** accessibility. **Severity:** medium. **Size:** L.
- **What is wrong:** there is no Dialog, Field, Spinner, ErrorText or ToggleButton:
  - 10 backdrop divs
  - 28 spinners
  - 43 error paragraphs
  - 126 labels, of which 28 use `htmlFor`

  The design system is deliberately not used by the app.
- **Why it matters:** items 19 and 39-44 exist many times over because each page made its own
  copy, and page-by-page fixes drift back. About five small components close most of them at
  once.
- **Size:** L. **Evidence:** grep and AST counts.

#### 67. Two certification systems run side by side, and the decision to retire one is not filed
- **Dimension:** documentation. **Severity:** medium. **Size:** S to decide.
- **What is wrong:**
  - `docs/IDEA_CERTIFICATIONS_SYNC.md:277-278` makes IDEA Classroom "the one official record".
  - `/certify` (`CertifyPage.jsx:91`) and `approve_cert_request` still award `member_skills`
    certs.
  - Job claims gate on `member_skills` (`JobsPage.jsx:107-126`).
  - The mirror keys holders by email with no member id (`0001:112`). That is an unrecorded
    exception to CLAUDE.md:125's member-ID rule.
- **Why it matters:** a student can be "certified" on `/skills` and not on `/certifications`, and
  job gates read the system the contract says is not the record.
- **Size:** S. **Decision 27.**

#### 68. The repo is public, and the closing docs will describe unfixed weaknesses
- **Dimension:** documentation. **Severity:** medium. **Size:** S.
- **What is wrong:** GitHub reports `private: false`. Committed docs already describe unfixed
  weaknesses (CLAUDE.md:54 and `:147`), and this file and tonight's closing docs record more.
  `docs/feedback` keeps student names out because the repo is public, but no rule covers security
  detail.
- **Why it matters:** the app holds minors' names, attendance and hours.
- **Size:** S. **Decision 04.** This file follows its default strictly: the unfixed
  security items are stubs.

#### 69. Four orphaned planning documents at the root contradict the live schema
- **Dimension:** documentation. **Severity:** medium. **Size:** S.
- **What is wrong:**
  - `BUILD_PLAN.md:3` ("the source of truth for building the app") specifies attendance method
    `qr`/`geofence`, which `attendance_method_check_fix.sql:18` rejects.
  - `hours_types_build_plan.md` and `skills_build_plan.md` carry SQL that conflicts with the
    frozen tables, including a team-wide `logged_hours` read.
  - `FRC5669_Application_Field_Spec.md:6` is an unshipped draft with 8 subteams.
  - Nothing references any of the four.
- **Why it matters:** a session asked to add QR check-in "per the plan" writes a method that
  every insert rejects, on the NFC fast path.
- **Size:** S. Move them under `docs/history/` with a "superseded" header.

#### 70. No README, and `.env.example` lacks the variables needed to boot
- **Dimension:** documentation. **Severity:** medium. **Size:** S.
- **What is wrong:** there is no root `README.md`, and the GitHub description is empty.
  `.env.example` omits 12 names the code reads, including `VITE_SUPABASE_URL`, without which
  `src/supabase.js` throws at load.
- **Why it matters:** a student or mentor joining development cannot boot the app from the docs.
- **Size:** S.

#### 71. CLAUDE.md's layout prevents parallel editing
- **Dimension:** documentation. **Severity:** medium. **Size:** L.
- **What is wrong:** 82% of CLAUDE.md is subsystem narrative. 12 lines exceed 3,000 characters,
  and line 38 is 34,137.
- **Why it matters:** every session loads about 37k tokens, mostly narrative. Two sessions cannot
  edit one 34K-character line, so tonight all ten lanes left CLAUDE.md alone and wrote
  corrections into an uncommitted file. A name checker like idea-app's would find nothing,
  because all 146 paths and 171 symbols resolve; the drift is in the sentences.
- **Size:** L. Move the narrative into per-subsystem docs and keep CLAUDE.md to rules.

### Low

#### 72. Feedback intake gaps: an unlabeled button, orphaned retry uploads, and a storage finding
- **Dimension:** reporting-feedback, permissions-security. **Size:** S (a, b), M (c).
- **Status at `e652b01`:** (b) FIXED by `aeb27fc`: a retried submit reuses the screenshots it
  already uploaded. (a) is open; (c) is unfixed.
- **What is wrong:**
  - **(a)** The launcher is an icon-only circle (`FeedbackWidget.jsx:184-198`), and
    `src/tour.js` never mentions it.
  - **(b)** A retried submit re-uploads every screenshot (`:147-176`), orphaning copies only an
    admin can delete.
  - **(c)** A storage security finding. Detail withheld from this public repository until fixed
    (decision 04, public-repo-security-detail); delivered to Mr. Pina privately on 2026-10-01.
- **Why it matters:** few students find the button (inferred from six open reports in a month).
- **Size:** (b) was a trivial fix; (c) is S to M.

#### 73. The feedback loop never closes for the student
- **Dimension:** reporting-feedback. **Size:** M.
- **What is wrong:** a reporter cannot read their own report (`feedback.sql:94-96`). "Sent. Thank
  you." carries no reference. No student-facing record of what changed exists.
- **Why it matters:** students re-report, or stop reporting. **Decision 17.**

#### 74. The feedback round has a manual privacy sweep, no reproduction step, and three hand pastes
- **Dimension:** reporting-feedback. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED by `ef9edd7`: step 7 now requires a fixture
  reproduction for a confirmed bug. The identity sweep is still a grep someone must remember.
- **What is wrong:**
  - `.claude/skills/feedback-round/SKILL.md` step 8.2's identity sweep is a grep someone must
    remember.
  - Step 7 does not require a fixture reproduction for a confirmed bug.
  - Closing a round needs `MARK_SEEN.sql` and `MARK_DONE.sql` pastes, although the console can
    now bulk-move to Seen with undo (`FeedbackPage.jsx:340-350`).
- **Why it matters:** one missed sweep commits a student's name to a public repo for good, and a
  report marked Done may not be fixed for the student who filed it.
- **Size:** S. The SKILL.md addition is a trivial fix; a uuid-leak test under `tests/` is the
  rest.

#### 75. CSV exports: five escapers, no BOM, no formula guard
- **Dimension:** reporting-feedback. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED: the Team Hours and Reports CSVs start with a UTF-8 BOM
  (`3df69eb`, `921bbbd`). The Applications and survey CSVs do not; five escapers remain; no
  formula guard (decision 18).
- **What is wrong:**
  - The escaper exists five times (`ApplicationsPage.jsx:12`, `reporting.js:138`,
    `ReportsPage.jsx:38`, `HoursBoard.jsx:27`, `surveys.js:273`).
  - There is no UTF-8 BOM, so Excel on Windows garbles accented names.
  - Cells starting `= + - @` are written verbatim. That is deliberate for surveys, but it also
    applies to the Applications CSV, which holds parent phones beside free text.
- **Size:** S. One `src/csv.js`. The BOM is a trivial fix. **Decision 18.**

#### 76. Reports page small defects
- **Dimension:** reporting-feedback. **Size:** S.
- **Status at `e652b01`:** FIXED by `921bbbd`.
- **What is wrong:**
  - `whenLabel` (`ReportsPage.jsx:350-355`) uses the device zone.
  - The per-event tab lists every event ever, future first (`:88-91`).
  - The buttons carry glyphs (`:178-179`, `:257-258`, `:330`).
  - `fmtClock` in `reporting.js:15` is unused.
- **Size:** S (trivial fixes).

#### 77. Smaller surfaces that show a false state
- **Dimension:** errors-empty-states. **Size:** S each.
- **Status at `e652b01`:** PARTLY FIXED by `ccd6aef`: `/display` shows a failed first load
  instead of spinning, and an RSVP shows only once it saved. `useGlance`, NotificationsPanel
  and Applications (decision 20) are unchanged.
- **What is wrong:**
  - `PresenceBoard.jsx:50-56` spins forever on a failed first load.
  - `useGlance.js:32-50` turns a failed read into "Shop closed".
  - `HomePage.jsx:170-183` shows an RSVP whether or not it saved.
  - `NotificationsPanel.jsx:59-74` shows the defaults on a failed read, and the next toggle saves
    them over the member's choices. This is dormant until push ships.
  - `ApplicationsPage.jsx:288-297` silences a failed parent-responses read, so every row reads
    Pending with Resend.
- **Why it matters:** a student goes home because the shop "is closed", believes they RSVP'd, or
  staff re-email parents who already answered.
- **Size:** PresenceBoard and the RSVP are trivial fixes. **Decision 20.**

#### 78. Certification writes are unchecked, and un-certifying is one tap
- **Dimension:** admin-tooling, errors-empty-states. **Size:** S/M.
- **What is wrong:**
  - `CertifyPage.jsx:72-98`: "Not started" deletes the cert (with its certifier) with no confirm,
    the result is discarded, and the UI updates anyway. `MemberSkillsPanel.jsx:49-80` has the
    same shape.
  - `JobsPage.jsx:336-352` edits required certs as delete-then-insert with the delete unchecked,
    so a failed insert ungates the job.
- **Why it matters:** certifications gate machine jobs.

#### 79. Raw database errors reach students; the roster gate matches message text
- **Dimension:** errors-empty-states. **Size:** M.
- **Status at `e652b01`:** PARTLY FIXED by `aeb27fc`: the roster also matches error code 42501;
  the text match stays, because the deployed RPC raises P0001.
- **What is wrong:**
  - `.message` is shown in 104 places across 28 files.
  - There are three one-off translators.
  - `RosterPage.jsx:109` decides "not an admin" by substring, which `schemaMissing.js` forbids.
- **Size:** M. One `src/errorText.js`. The roster code match is a trivial fix.

#### 80. Roster and access small gaps
- **Dimension:** admin-tooling. **Size:** S/M.
- **Status at `e652b01`:** PARTLY FIXED by `aeb27fc`: removing an allowed domain asks for
  confirmation.
- **What is wrong:**
  - Staff cannot set a member's name or subteam placement, so invited parents show as email
    addresses.
  - Roster Approve (`RosterPage.jsx:148-165`) always adds `student` and sends no email, so an
    approved parent gets the student application.
  - `removeDomain` (`:177-181`) deletes `boscotech.edu` on one unconfirmed click, and `addDomain`
    omits `added_by`.
- **Size:** the domain confirm is a trivial fix.

#### 81. Job reference links render any URL scheme
- **Dimension:** permissions-security. **Size:** S.
- **Status at `e652b01`:** FIXED by `c63e1ce`: a reference link gets an `href` only for http(s)
  URLs.
- **What is wrong:** `JobsPage.jsx:789` renders `href={l.url}` unchecked. In Chromium, with
  `target=_blank` and `noopener`, a `javascript:` link opened an opaque page. Safari was not
  measured.
- **Why it matters:** today it is a phishing aid.
- **Size:** trivial fix.

#### 82. Mobile polish
- **Dimension:** mobile-layout. **Size:** S each.
- **Status at `e652b01`:** PARTLY FIXED: My Hours card contents are inset again (`8dcaae2`),
  and with the plate on the `/verify-hours` wordmark no longer truncates at 375
  (`docs/SHAPES.md`). The rest was not re-measured.
- **What is wrong:**
  - On `/survey` the launcher overlaps the sticky Submit while scrolling (44x44 at 342x673), so a
    tap there opens feedback.
  - My Hours goal and correction text touches the card border (`.mh-card` has no padding,
    `MyHoursPage.css:202`).
  - Jobs titles are cut to about 16 characters at 342.
  - TECHMEN·5669 is truncated at 342 on 8 of 15 routes.
  - The Log Hours stats strip spills past its card at 342.
  - `/display` shows a second header inside the app shell.

#### 83. Reduced motion and the coverage matrix
- **Dimension:** accessibility. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED by `aeb27fc`: MemberHoursAdmin's scroll honours reduced
  motion.
- **What is wrong:**
  - The onboarding tour animates regardless of the setting (`tour.js:104`).
  - Two scrolls hard-code `smooth` (`MemberHoursAdmin.jsx:124`, `SurveyPage.jsx:218`).
  - Coverage matrix status lives only in a title attribute on a textless dot
    (`CoverageMatrix.jsx:166-174`).
- **Size:** MemberHoursAdmin is a trivial fix.

#### 84. CI hygiene
- **Dimension:** testing-ci. **Size:** S each.
- **What is wrong:**
  - CI builds on Node 22 (`ci.yml:64`), while Vercel's June snapshot says 24.x.
  - The 04:30 UTC nightly never lands in the LA 00:00-02:00 window (idea-app moved to 08:00).
  - `ci.yml` declares no `permissions`.
  - The merged branch `claude/repo-standards-conformance-uk5er7` stands as a false failure
    signal.

#### 85. Small documentation drift
- **Dimension:** documentation. **Size:** S.
- **Status at `e652b01`:** PARTLY FIXED: the fixture comments in `seed.js` and `features/d.js`
  are corrected (`ef9edd7`), `features/c.js` declares the 0002 alters (`281cf0a`), and
  `docs/feedback/2026-10-01/` exists. The rest stands.
- **What is wrong:**
  - **SQL counts are wrong.** There are 67 tracked `.sql` files: 56 under `supabase/`, 1 under
    `sql/`, 2 at the root and 8 numbered.
  - **Decision 01 is stale.** It still prices a reversal at "one deleted directory".
  - **The README examples collide.** Its example migration names collide with the real 0001 and
    0002.
  - **The design-system bullet contradicts itself six times.** That includes two "hazards"
    long fixed: `--gold` is `#FFE629`, and `gen-icons.js` refuses non-canonical marks.
  - **Stale comments:**
    - `seed.js:197` promises a geofence anomaly for an exempt member.
    - `features/d.js:49-50` says the day key is UTC.
    - `features/c.js:13-14` says the engine enforces no constraints. Worse, `c.js` lacks the
      `alters` declaration that infra's reviewer specified, so under `mig=all` the fixture
      refuses an untyped report with 23502. Live does not, after 0002. Measured by the writer:
      23502 as shipped, and accepted with the declaration added. `mig=none` still refuses in
      both cases.
    - `CheckinPage.css:230-260` is a dead picker block.
    - `member_applications.sql:65-66` is stale.
  - **A June Vercel record sits at the root under a mangled name**
    (`C<U+F03A>frc-app__deploy_info.json`).
  - **Tonight's records are unfinished.** Tonight left no `docs/history` entry, ledger 0002 still
    reads "issued", and `docs/feedback/README.md:118` links a missing folder. The closing agent
    owns those three.
- **Size:** the fixture comments and the `c.js` declaration are trivial fixes.

---

## How each dimension compares with idea-app

**Reporting and feedback.** The console itself now meets idea-app's bar:

- filter-then-export
- a zip with screenshots
- exact undo
- spam as a status
- an insert trigger clamping member-set fields
- a 24-check rollback-safe RLS test
- a build stamp
- a digest redacted at the source

What is missing is everything around it. idea-app treats the error path as the highest-value
report: a root boundary, correlation ids minted in both hooks, chunk-load detection, and the
report control moved into the error page, prefilled. It relocates the control where it cannot
float, checks screenshot bytes against limits the bucket enforces, and closes the loop through a
student-readable update log. Staff reporting has no idea-app counterpart, and it is the weaker
half here (items 10, 28, 49).

**Admin tooling.** idea-app treats every admin write as something that may need undoing or
explaining:

- append-only ledgers and revisions
- separate hide and delete, each with a named two-step confirm
- a 10-second status undo
- a nightly off-Supabase backup
- `migrate.yml` and `docs/migrations-applied/` recording what is live
- 45 filed decisions

frc-app is the opposite on almost every axis:

- hard deletes
- no backup
- one attendance-only audit table with no viewer
- two unfixed access findings (items 14 and 15)
- paste-order dependence
- no tests over roster, access or deletion

Tonight's 0002-0004 are the first admin surfaces at idea-app's bar.

**Permissions and security.** idea-app treats the grant layer as the boundary of record and
proves it:

- `tests/grant-surface.test.ts` compares the live catalog with declared lists.
- Its db stub carries Supabase's default privileges.
- More than 100 DB tests run against embedded Postgres in CI.
- Its security audit ranks by exploitability.

frc-app's grant and policy layer carries the unfixed findings stubbed above (items 1, 2, 3
and 7). Tonight's migrations follow idea-app's pattern (explicit revokes, revoke-then-grant
helpers, rollback-safe tests with positive controls), but they sit on that base layer until
its findings are fixed.

**Testing and CI.** idea-app runs:

- a scope job
- a type and a11y gate
- 639 test files in five shards, about 100 of them applying real migrations to embedded Postgres
- a nightly at 08:00 UTC to catch LA day-boundary bugs
- an `integrate.yml` that tests the merged tree
- a deploy gated by a production probe
- `migrate.yml`
- a nightly backup
- a solo mode with a written local gate

frc-app runs:

- one CI job: build, vitest (37 files and 640 tests at `e652b01`; 33 and 561 when this was
  written; pure logic and source-text checks, nothing rendered), ds:audit, the Discord suite
  and history:verify
- no lint or type check
- no DB tests
- a nightly that lands on `main`
- a deploy gate that has never passed

Worth keeping: real positive controls, a timezone-robust suite, workflow-file tests, and fixture
mode, which renders all 33 routes for every persona with no credential and is the natural base
for a browser gate.

**Errors and empty states.** idea-app makes failure something every surface says out loud, with
code and tests behind it:

- a root `+error.svelte` that keeps the chrome
- `deploy-safety.ts` for stale tabs
- "four states minimum, always on screen" for writes
- degrade rungs pinned by tests

frc-app's own server code meets that bar, but its client ignores errors in roughly 40% of calls,
has no offline fallback, and has not-set-up handling only in tonight's four features. A per-page
boundary and a reload-once stale-chunk guard landed after this was written, in `9dba1f3`. The
good patterns already exist in the repo (ParentResponse's offline state, CheckinPage's
"unknown", HomePage's `readFailed`, `fetchAllRows`, `schemaMissing.js`); the gap is applying
them everywhere, plus a ratchet.

**Mobile layout.** idea-app's Interface Standards §10-11 set:

- 44px targets on student surfaces and a 24px floor everywhere
- measured verification at 375 and 1440
- a shared `.tap-reach-44` class
- `viewport-fit=cover` with 13 safe-area uses
- 565 browser-verify route specs, 346 of which measure tap targets or overflow

When this was written frc-app had no rule, no token and no check. Since `e652b01` the plate
gives student controls a 44px floor (`--tm-target`) with a local sweep (`docs/SHAPES.md`).
There is 0px page overflow anywhere, which is the good news. Against that:

- with the plate off, 62-75% of student controls are under 44px
- 28 fields are under 16px
- there is no safe-area handling
- eight modals are written eight ways

**Accessibility.** idea-app writes the rules down:

- contrast measured on the real ground
- no colour-only signals
- a load-bearing boundary token at 3:1
- a keyboard path for repeated operations
- focus never lost by a state change

It pins them with tests and uses `aria-live` in 25 places. It has no shared Dialog either, so
the thing to borrow is the standard and the measure-then-gate habit, not a library. frc-app's
strengths, all measured:

- `lang="en"`
- zoom left enabled
- a gold `:focus-visible` ring that held on every stop
- reduced-motion gating on every keyframe
- tonight's pages using `aria-pressed`, `aria-expanded` and `role=alert` correctly

**Documentation.** idea-app's CLAUDE.md is three times larger, but it is split into rule-titled
sections with no line over 156 characters. It also has:

- a README and an AGENTS.md
- 45 decision entries, with a numbering claim protocol
- `docs/migrations-applied/`
- a standards register and standing audits
- `tools/claude-md-check.mjs`

Porting that checker would buy little here, because frc-app's drift is in sentences, not names.
The fix is cutting narrative down to rules.

---

## Needs Mr. Pina

Every draft this audit wrote is now a file in `docs/decisions/`, in that directory's
format, with the default a session follows until he answers. A decision file says at most
where a weakness is and which check is missing (decision 04).

| Draft | Decision | Status | Items |
| --- | --- | --- | --- |
| A | `04-public-repo-security-detail.md` | open | 68, and the stubbed items |
| B | `05-solo-mode-on-frc-app.md` | decided (rule of 2026-09-27) | 23 |
| C | `06-data-boundary-approved-members.md` | open | 2, 3 |
| D | `07-what-removal-means.md` | open | 14 |
| E | `08-who-may-grant-mentor.md` | open | 15 |
| F | `09-lead-role-and-self-credit.md` | open | 51 |
| G | `10-parent-attendance-visibility.md` | open | 50 |
| H | `11-delete-or-archive-members.md` | open | 57 |
| I | `12-backup-and-read-only-credential.md` | open | 60 |
| J | `13-what-a-service-letter-counts.md` | open | 28 |
| K | `14-parent-consent-verification.md` | open | 16 |
| L | `15-crash-reporting-shape.md` | open | 61, 5 |
| M | `16-how-new-feedback-reaches-you.md` | open | 62 |
| N | `17-student-facing-update-log.md` | open | 73 |
| O | `18-csv-formula-guard.md` | open | 75 |
| P | `19-offline-nfc-tap.md` | open | 32 |
| Q | `20-applications-parent-response-failure.md` | open | 77 |
| R | `21-schedule-default-view-on-phones.md` | open (its default is applied) | 35 |
| S | `22-iphone-status-bar.md` | open | 37 |
| T | `23-tap-target-floor.md` | open | 38 |
| U | `24-muted-text-contrast.md` | open | 18 |
| V | `25-browser-checks-blocking.md` | open | 65 |
| W | `26-repin-frozen-objects.md` | open | 53, 54, 55 |
| X | `27-two-certification-systems.md` | open | 67 |

Decisions 28 to 41 come from the same night's build lanes rather than from this audit: the
check-out fix's costs (28 to 30), the feedback console (31), member permissions (32), the
IDEA mirror (33, 34), Discord announcements (35), `/display` (36), My Hours (37, 38), the LA
day rule (39), first-load failures (40, which also covers item 4) and the Check Out button (41).
