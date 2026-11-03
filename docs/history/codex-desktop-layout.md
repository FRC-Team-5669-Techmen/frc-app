---
title: "Computer layouts across the Techmen application, with repeatable three-width evidence"
date: 2026-11-03
branches: [main]
commits: []
migrations: []
subsystems: ["Landing and navigation", "Hours", "Profile", "Fixture mode"]
---

Job codex-desktop-layout starts from fetched main 4b4516a2800f7d7ce53b6e9836f19c7290e196aa. CLAUDE.md and the ledger/history/solo-mode instructions were read first; AGENTS.md is absent from the tracked tree and local recursive search. The live ledger's claim that scouting PR #4 was open was contradicted by GitHub: it is merged and closed, and merge 20b7e3b is an ancestor of this base. Mr. Pina also explicitly authorized the layout-only overlap in this session. Other ledger entries are left alone.

The original app already had zero horizontal document overflow in all 498 baseline views. The problem was desktop use of space: Schedule, My Hours, Log Hours, Profile and the parent dashboard had 720px frames; six surfaces exceeded the new 1280px cap at 1440 in each theme. The retained baseline combines the first 75 states (450 views) and eight additional reading/detail/personal states (48 views), all at a fixed fictional October 1 afternoon in Los Angeles. Its route catalog covers all 69 application routes, including redirects, with 14 extra role/reading/detail states. The two development tools, /_fixture and /_ds, are outside this app-layout work.

src/layout.css supplies a shared 80rem frame, desktop grids and short prose lines using the existing theme and fonts. Surgical JSX wrappers put the month beside selected-day details, hours entry beside history, identity/form beside profile preferences, survey list beside editor, and Meet a team recording beside progress/notes. Jobs and Feedback retain their phone overlays and show a selected-record pane beside the list at a desk. Public family forms, mission boards, queues, routine/match lists and release dates use columns where there are independent items. Sparse setup/empty states retain short text. The check-in paths keep their lightweight entry and put the note or confirmation beside status at a desk; they gain no nav, dashboard or feedback import. No new palette values or fonts are introduced; src/theme.css is unchanged.

The geometry oracle is tools/e2e/layout.mjs, shared by nav-audit.mjs, layout-audit.mjs and the standing desktop-layout feature spec. It checks real nonempty content, document overflow, escaping descendants, viewport/frame bounds and detail panes. The feature spec also checks intended columns and deliberately breaks the width and empties the page to prove the oracle rejects both. Every existing feature now runs at 375, 1152 and 1440. Features remain sequential; their widths use independent contexts, stores, clocks and screenshot names concurrently, with --serial available for diagnosis. No assertion or timeout is relaxed. The report packager refuses a missing, duplicate or failing after view and produces every original full-page screenshot, a width/theme/page viewer, raw measurements and an 83-row PR description with before/after notes.

The reproducible capture/report commands are documented in tools/e2e/README.md. To recreate the baseline, make a detached checkout of 4b4516a, copy only the tools/e2e/layout*.mjs harnesses there, install its dependencies and run layout-audit.mjs --baseline on a free port. Run the same capture on the completed tree and pass both capture directories to layout-report.mjs. Browser evidence uses fictional in-memory data; it does not establish real-device Safari/NFC, school sign-in, live RLS or deployed production behavior. Final gate summaries and the published commit are recorded in the session's PR-description deliverable.


Content widths in pixels at 375 · 1152 · 1440, in dark/light where different. Every after view has 0px horizontal document overflow and 0 escaping descendants. These notes describe the before and after screenshots for each page/state. Full screenshots are reproducible with the retained capture harness.

| Page / persona | Before widths | After widths | Before → after screenshot description |
| --- | --- | --- | --- |
| / — Landing (signed-out) / redirect (signedout) | 375 · 1152 · 1440 | 375 · 1152 · 1280 | Hero above feature cards. → Hero beside the feature overview; bounded navigation and footer. |
| /login — Login (signedout) | 343 · 360 · 360 | 343 · 1120 · 1120 | Both sign-in methods stacked in a small card. → School and guest methods share a two-column card. |
| /parent/:token — Parent questionnaire (signedout) | 343 · 512 · 512 | 343 · 1120 · 1280 | Questionnaire in one narrow column. → Independent questions share two columns; instructions keep a short line length. |
| /family/:token — Family link (signedout) | 375 · 960 · 960 | 375 · 1152 · 1280 | Student records and forms stacked. → Record cards share two columns; handbook stays readable. |
| /rules — Handbook, no login (signedout) | 375 · 1120 · 1120 | 375 · 1152 · 1280 | Quick-reference cards already use a grid. → Wider reference grid; reading paragraphs remain capped. |
| /e/:token — Event family page (Sam, fresh) (signedout) | 375 · 880 · 880 | 375 · 1152 · 1280 | Part heading above the family questions. → Part heading beside the questions; tracker stays across the frame. |
| /e — Event family page: no link (goes to /join) (signedout) | 375 · 880 · 880 | 375 · 1152 · 1280 | Student picker above contact fields. → Student picker beside contact and consent fields. |
| /join — Event open sign-up link (signedout) | 375 · 880 · 880 | 375 · 1152 · 1280 | Student picker above contact fields. → Student picker beside contact and consent fields. |
| /join/:eventId — Event open sign-up link (by event) (signedout) | 375 · 880 · 880 | 375 · 1152 · 1280 | Student picker above contact fields. → Student picker beside contact and consent fields. |
| /dashboard — Dashboard (admin) | 375 · 880 · 880 | 375 · 1152 · 1280 | Compact mission board with a full-width task list. → Wider mission grid and two-column task list. |
| /schedule — Schedule (admin) | 375 · 720 · 720 | 375 · 1152 · 1280 | Calendar above the selected day. → Calendar beside selected-day details; event actions below the description. |
| /my-hours — My Hours (admin) | 375 · 720 · 720 | 375 · 1152 · 1280 | Summary and history cards stacked. → Summary across a two-column evidence/history dashboard. |
| /log-hours — Log Hours (admin) | 375 · 720 · 720 | 375 · 1152 · 1280 | Entry form above saved entries. → Entry form beside saved history; totals span both columns. |
| /hours — Team Hours (admin) | 375 · 1152 · 1200 | 375 · 1152 · 1280 | Wide category/member table. → Table uses the shared frame; matrix scrolling stays inside its own box. |
| /skills — Skills (retired, redirects to /certifications) (admin) | 375 · 760 · 760 | 375 · 1152 · 1280 | Catalog and holder rows in one column. → Catalog and holder grids use the wider frame. |
| /jobs — Jobs (admin) | 375 · 980 · 980 | 375 · 1152 · 1280 | Grouped job rows; selected job opened over the list. → Wide rows; selecting a job opens a work pane beside the list. |
| /study — Study (retired, redirects to /certifications) (admin) | 375 · 760 · 760 | 375 · 1152 · 1280 | Catalog and holder rows in one column. → Catalog and holder grids use the wider frame. |
| /members/:id — Member page (Sam) (admin) | 375 · 720 · 720 | 375 · 1152 · 1280 | Identity above certification information. → Identity beside certification information. |
| /profile — My Profile (admin) | 375 · 720 · 720 | 375 · 1152 · 1280 | Identity, form and integrations stacked. → Identity/editing beside appearance, calendar and notifications. |
| /survey — Weekly Survey (admin) | 375 · 474.9 · 474.9 | 375 · 1152 · 1280 | Questions in a narrow vertical form. → Questions share two columns; the submit row spans the form. |
| /display — Presence Board (admin) | 375 · 1152 · 1440 | 375 · 1152 · 1280 | Timeline stretches across the viewport. → Timeline and coverage use a bounded wide frame. |
| /certifications — Certifications (admin) | 375 · 760 · 760 | 375 · 1152 · 1280 | Catalog and holder rows in one column. → Catalog and holder grids use the wider frame. |
| /handbook — Member handbook (admin) | 375 · 1120 · 1120 | 375 · 1152 · 1280 | Reference grid; reading view has an index. → Wider reference grid and reading/index layout; prose capped at 72ch. |
| /trips — Trips (admin) | 375 · 1100 · 1100 | 375 · 1152 · 1280 | Trip rows stacked above Create. → Trip cards share two columns above Create. |
| /batteries — Batteries (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Responsive fleet card grid. → Fleet grid uses the shared frame and gains room for cards. |
| /robot — Robot hub (admin) | 375 · 1024 · 1024 | 375 · 1152 · 1280 | Compact tool-card grid. → Tool cards use a three-column desktop grid. |
| /manage — Team admin (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Waiting and admin tool grids. → Four-column tool grids retain waiting tools first. |
| /roles/:eventId — Role board (Fixture Regional) (admin) | 375 · 1152 · 1280 | 375 · 1152 · 1280 | Wide role-assignment table. → Bounded role table retains its local scroller and assignment controls. |
| /my-schedule — My schedule (admin) | 375 · 545.1 · 545.1 | 375 · 1152 · 1280 | Compact station and day list. → Current work spans the frame; schedule entries share two columns. |
| /autos — Autos (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Routine rows stacked. → Routine cards share two columns. |
| /meet — Meet a team (admin) | 375 · 896 · 896 | 375 · 1152 · 1280 | Competition links stacked. → Competition cards share three columns. |
| /meet/:eventId — Meet a team (Fixture Blitz) (admin) | 375 · 896 · 896 | 375 · 1152 · 1280 | Log form before progress and shared notes. → Log form beside progress and shared notes. |
| /drivers — Drivers (admin) | 375 · 1152 · 1216 | 375 · 1152 · 1280 | Wide leaderboard with practice/rating columns. → Leaderboard and practice/rating columns use the shared frame. |
| /human-player — Human player (admin) | 375 · 1152 · 1216 | 375 · 1152 · 1280 | Wide leaderboard and training panels. → Leaderboard and training panels use the shared frame. |
| /match-sim — Match simulator (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Setup above match history. → Setup beside match history; full-screen running clock retained. |
| /robot/matches — Match log (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Match records stacked under filters. → Match records share two columns under the filters. |
| /robot/matches/:id — Match log (practice 1) (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Metrics, phase bars and battery data already use grids. → Existing detail grids use the shared frame. |
| /updates — What's new (admin) | 375 · 704 · 704 | 375 · 1152 · 1280 | Release dates in one narrow timeline. → Release-date groups share two columns. |
| /standing — My standing (admin) | 375 · 960 · 960 | 375 · 1152 · 1280 | Standing and checklist cards in a compact grid. → Standing cards use the wider grid; explanations keep a short line length. |
| /scouting — Scouting events (admin) | 375 · 793.2 · 793.2 | 375 · 1152 · 1280 | Event chooser and preparation cards in a compact frame. → Chooser and preparation cards use the shared frame. |
| /scouting/:eventId — Event scouting (admin) | 375 · 1152 · 1440 | 375 · 1152 · 1280 | Wide event workspace with tabs and assignment panels. → Workspace is bounded; existing tab and panel grids retained. |
| /scouting/:eventId/board — Pick board (admin) | 375 · 1152 · 1440 | 375 · 1152 · 1280 | Three work panes on wide screens; two on smaller laptops. → Same pane arrangement within the shared frame; phone tabs retained. |
| /rosters — Event rosters (admin) | 375 · 960 · 960 | 375 · 1152 · 1280 | Event links in a compact list. → Events share two columns with dates/status alongside titles. |
| /leaderboard — Hours leaderboard (admin) | 375 · 960 · 960 | 375 · 1152 · 1280 | Ranked names and hours in one list. → Ranked entries share two columns with explicit rank numbers. |
| /status-reports — Sub-team status (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Subteam reports stacked. → Subteam report cards share two columns. |
| /driver-docs — Driver documents (admin) | 375 · 960 · 960 | 375 · 1152 · 1280 | Upload and document lists stacked. → Upload beside personal documents; staff records span the frame. |
| /emergency-info — Emergency information (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Staff emergency sheet table. → Emergency sheet uses the shared frame; table scrolling stays local. |
| /no-photo — No-photo list (admin) | 375 · 960 · 960 | 375 · 1152 · 1280 | Short exception list and member picker. → Picker and exception list use the shared frame; short copy stays readable. |
| /rosters/:id — Event roster (all-team meeting) (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Roster controls and attendance list. → Roster controls and attendance list use the shared frame. |
| /trips/:id — Trip boards (Fixture Blitz) (admin) | 375 · 1100 · 1100 | 375 · 1152 · 1280 | Trip sections, day selectors and carpool cards. → Trip boards use the shared frame; local board layouts retained. |
| /certify — Certify (retired, redirects to /certifications) (admin) | 375 · 760 · 760 | 375 · 1152 · 1280 | Catalog and holder rows in one column. → Catalog and holder grids use the wider frame. |
| /coverage — Coverage (retired, redirects to /certifications) (admin) | 375 · 760 · 760 | 375 · 1152 · 1280 | Catalog and holder rows in one column. → Catalog and holder grids use the wider frame. |
| /verify-hours — Verify Hours (admin) | 375 · 720 · 720 | 375 · 1152 · 1280 | Review queues in one narrow column. → Review cards share two columns; bulk controls span the queue. |
| /reports — Reports (admin) | 375 · 1100 · 1100 | 375 · 1152 · 1280 | Report tabs, filters and export table. → Filters and tables use the shared frame with local table scrolling. |
| /activity — Activity (admin) | 375 · 900 · 900 | 375 · 1152 · 1280 | Compact member/status/time table. → Activity table and manual controls use the shared frame. |
| /readiness — Readiness (admin) | 375 · 1100 · 1100 | 375 · 1152 · 1280 | Action counts and coverage panels already use a grid. → Existing readiness grid uses the shared frame. |
| /signouts — Sign-out approvals (admin) | 375 · 648.8 · 648.8 | 375 · 1152 · 1280 | Compact waiting, present and decision panels. → Waiting and present panels share the width; decisions span the frame. |
| /standing/team — Team standing (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Standing tabs, roster table and action panels. → Standing workspace and existing panel grids use the shared frame. |
| /squad — Squad (admin) | 375 · 980 · 980 | 375 · 1152 · 1280 | Position cards in a compact grid. → Position cards use the wider grid. |
| /access-requests — Access Requests (admin) | 375 · 720 · 720 | 375 · 1152 · 1280 | Invite, parent links and access requests stacked. → Invite spans the frame; parent links and access requests sit beside each other. |
| /applications — Applications (admin) | 375 · 1100 · 1100 | 375 · 1152 · 1280 | Application stats, filters and table. → Stats, filters and table use the shared frame; table scrolling stays local. |
| /surveys — Surveys (admin) (admin) | 375 · 745.7 · 745.7 | 375 · 1152 · 1280 | Create/list above the selected survey. → Create/list beside the selected survey editor and results. |
| /trips/:id/manage — Trip mentor page (admin) | 375 · 1100 · 1100 | 375 · 1152 · 1280 | Trip readiness and management tabs. → Readiness and management workspace use the shared frame. |
| /roster — Roster (admin) | 375 · 1100 · 1100 | 375 · 1152 · 1280 | Capabilities grid, filters and member rows. → Capabilities and member rows use the wider frame. |
| /feedback — Feedback inbox (admin) | 375 · 986.2 · 986.2 | 375 · 1152 · 1280 | Report list; selection opens an overlay. → Report cards use a grid; selection opens a pane beside the list. |
| /announce — Discord announce (admin) | 375 · 1152 · 1152 | 375 · 1152 · 1280 | Composer and preview already share two columns. → Composer/preview layout retained within the shared frame. |
| /connector/* — Claude connector (admin) | 343 · 832 · 832 | 343 · 1120 · 1280 | Narrow connector setup instructions in this fixture. → Wider bounded frame and short instructions; populated sections have a two-column layout. |
| /checkin — NFC check-in (shop) (student) | 375 · 1152 · 1440 | 375 · 1152 · 1280 | Centered sign-out note and status. → Note beside status on desktop; lightweight phone flow retained. |
| /checkin-volunteer — NFC volunteer check-in (student) | 375 · 1152 · 1440 | 375 · 1152 · 1280 | Minimal switch-to-volunteer confirmation. → Status beside the confirmation action inside a bounded receipt. |
| /dashboard — Student dashboard (student) | 375 · 880 · 880 | 375 · 1152 · 1280 | Compact mission board with a full-width task list. → Wider mission grid and two-column task list. |
| /dashboard — Parent dashboard (parent) | 375 · 720 · 720 | 375 · 1152 · 1280 | Student cards, glance and link request stacked. → Student records beside glance and link request. |
| /profile — Student profile (student) | 375 · 720 · 720 | 375 · 1152 · 1280 | Identity, form and integrations stacked. → Identity/editing beside appearance, calendar and notifications. |
| /my-hours — Student hours dashboard (student) | 375 · 720 · 720 | 375 · 1152 · 1280 | Summary and history cards stacked. → Summary across a two-column evidence/history dashboard. |
| /log-hours — Student hours entry and history (student) | 375 · 720 · 720 | 375 · 1152 · 1280 | Entry form above saved entries. → Entry form beside saved history; totals span both columns. |
| /my-schedule — Student competition schedule (student) | 375 · 545.1 · 545.1 | 375 · 1152 · 1280 | Compact station and day list. → Current work spans the frame; schedule entries share two columns. |
| /standing — Student standing (student) | 375 · 960 · 960 | 375 · 1152 · 1280 | Standing and checklist cards in a compact grid. → Standing cards use the wider grid; explanations keep a short line length. |
| /survey — Student weekly survey (student) | 375 · 474.9 · 474.9 | 375 · 1152 · 1280 | Questions in a narrow vertical form. → Questions share two columns; the submit row spans the form. |
| /dashboard — Access gate (pending) | 311 · 416 · 416 | 311 · 1024 · 1024 | Pending-access notice centered in a narrow column. → Identity beside the pending notice and sign-out control. |
| /dashboard — Member application (student) | 343 · 544 · 544 | 343 · 1120 · 1152 | Application introduction above a narrow step form. → Introduction/progress beside the current step. |
| /jobs — Selected job (student) | 375 · 980 · 980 | 375 · 541.5 · 598 | Grouped job rows; selected job opened over the list. → Wide rows; selecting a job opens a work pane beside the list. |
| /feedback — Selected feedback report (admin) | 375 · 986.2 · 986.2 | 375 · 1152 · 1280 | Report list; selection opens an overlay. → Report cards use a grid; selection opens a pane beside the list. |
| /handbook — Handbook reading and index (student) | 375 · 1120 · 1120 | 375 · 1152 · 1280 | Reference grid; reading view has an index. → Wider reference grid and reading/index layout; prose capped at 72ch. |
| /scouting/:eventId — Scouting practice (student) | 375 · 1152 · 1168 | 375 · 1152 · 1280 | Practice missions already use responsive panels. → Practice panels use the bounded shared frame. |
