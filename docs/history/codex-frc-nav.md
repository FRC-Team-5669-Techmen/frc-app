---
title: "Calm navigation, grouped account options and search-anything palette"
date: 2026-11-06
branches: [main]
commits: []
migrations: []
subsystems: ["Landing page and nav"]
---

The baseline was origin/main 5aede08, fetched and rebased before changes. The complete implementation first passed all seven gates (7,817/7,817 features); main then advanced to 0fcb1c7 while that gate ran. The unpublished implementation was rebased cleanly onto it, preserving the other job's sign-out session-boundary code, migration 0046 and signout-boundary E2E. The role evidence was refreshed and the entire gate passed again (7,902/7,902 features). Main then advanced to 8cedc44 with mail-only backend changes. The unpublished commit was rebased again, preserving that work. Frontend and fixture files did not change in the mail commit, so the verified navigation source hashes and captures still match; all seven gates are rerun before landing. CLAUDE.md, the full OVERHAUL_AUDIT.md and the touched subsystem documentation were read first. The historical complaint of 15 to 20 profile buttons was not the current tree: decision 49 had already shipped the short five-entry member primary nav, three-entry parent nav, Robot and Team admin hubs, and Do this now links. Decision 50 subsequently added What's new and the theme row. Baseline account links/actions numbered six for ordinary roles and seven for a student sign-out approver; including the three visible theme radios, there were nine or ten exposed controls.

The primary nav is retained. The account menu now groups records and preferences, with five collapsed branches normally and six for staff or a non-staff sign-out approver. Preferences is counted as a branch, rather than exempting theme controls from the cap. My record directly reaches standing, handbook, certifications, personal competition schedule, weekly survey and driver documents as applicable; parents also reach emergency information. What's new and its unread indicator remain direct entries. Theme changes and disclosures keep the menu open. Both dropdowns dismiss on pointer or keyboard focus outside, Escape returns focus, and route changes close the account menu.

The measured entry counts are below. Before account entries are links/actions (the old theme row added three visible radios); after entries include every collapsed disclosure, including Preferences.

| Role | Primary before → after | Account entries before → after | Visible account controls before → after |
| --- | --- | --- | --- |
| Member | 5 → 5 | 6 → 5 | 9 → 5 |
| Scout lead | 5 → 5 | 6 → 5 | 9 → 5 |
| Driver | 5 → 5 | 6 → 5 | 9 → 5 |
| Mentor | 5 → 5 | 6 → 6 | 9 → 6 |
| Admin | 5 → 5 | 6 → 6 | 9 → 6 |
| Parent | 3 → 3 | 6 → 5 | 9 → 5 |
| Staff lead | 5 → 5 | 6 → 6 | 9 → 6 |
| Student approver | 5 → 5 | 7 → 6 | 10 → 6 |
| Parent with staff role | 5 → 5 | 6 → 6 | 9 → 6 |

The [screenshot archive](codex-frc-nav-evidence.zip) includes an offline index.html comparison viewer, all 264 original PNGs, report.md and raw measurements. It covers 54 before account views and 210 after account, expanded-group, palette and Hours views. Member/scout-lead/driver search has 37 route entries, mentor/staff-lead 53, admin 57, parent 13 and student approver 38. Dynamic route entries describe a chooser when there is no current record context; these are page types, not a count of database records.

The new Search button and Ctrl+K/Cmd+K palette share the feature guide's role inventory. Its native dialog contains Tab, makes the page behind it inert, locks background scrolling and restores focus. A labeled combobox supports arrows, Home, End, Enter and touch/click results. Titles, paths, descriptions and task words are searchable. Member next-step links cover the checklist, handbook, training, contributing jobs, weekly survey and competition stations. Parameter routes use current context or a clearly described chooser; private token links remain private and are explained in the footer. No team-data query or database authorization boundary is added. The check-in routes import no palette or nav code.

Checking the inventory found that guideFor treated staff as admin and advertised four admin-only routes to mentors. The restrictive condition and regression now require the actual admin flag; both the automatic tour and Replay tour supply it. Parent handbook and certification entries now match their existing pages. Staff-parent precedence is preserved. Scout lead and driver remain member capabilities/event assignments; the evidence grants a scouting capability and assigns a driver event role rather than inventing application roles.

Red/green proof is retained in tests/nav-shell-dom.test.js and tests/feature-guide.test.js: the original tree failed four checks (the approver cap, Escape focus, outside pointer dismissal and mentor admin visibility), against twelve passing controls. The automatic-tour admin propagation check also failed before its fix. The first real-browser palette run passed 72/81: a search input consumed Escape without closing its dialog, which also prevented the next shortcut. Explicit Escape handling made the same flow pass. The standing navigation spec now passes 882/882 at 375, 1152 and 1440, in both themes. The pure navigation tests include permissive admin, parent and approval-capability mutants that must be rejected. A separate red/green account-switch test reproduced an existing stale sign-out capability when the next member had the same roles. The approval result is now bound to member identity, its effect reloads for a new member, and the account menu closes on that switch.

The retained capture and report tools measure nine role variants at three widths in two themes. Baseline captures passed 54/54 configurations. The final capture includes closed account groups, expanded groups, search and the Hours dropdown, plus inventories of the Robot and Team admin hub links. Paired raw measurements and role route inventories live in tools/e2e/nav-evidence.json; screenshots and the interactive before/after gallery are packaged as a task output. Every recorded capture requires viewport bounds, zero document overflow and no unexpected console errors. The first visible-control counter used getClientRects, which Chromium can return for descendants of closed details. A rerun uses checkVisibility and additionally requires visible controls to equal the collapsed branch count. The packager checks that all Hours and hub links are searchable and that staff tool inventories match the role. Source-file hashes bind the final capture to the shipped application.

The first full gate also caught a regression at scouting: an inactive palette dialog remained in the DOM alongside the observation dialog (383/386 scouting checks passed). A rendered-shell regression reproduces it, and closed search now returns no dialog. Cleanup closes the native modal, restores body scrolling and restores Search focus. The scouting assertions are unchanged. Its rerun then exposed an existing pairs CSV failure (388/389): PAIR_COLUMNS is an object catalog, but toCsv requires key/header tuples. The sole change outside navigation is a one-line adapter at the ScoutingPage export call. A regression executes that actual export callback with real serializers and deterministic timers, failing before the fix and checking three downloaded sheets and the paired average afterward. Pair reconciliation, data access, writes and permissions are unchanged.

The seven-command solo gate is required on the exact landing tree: build, npm test, ds:audit, discord:calendar:test, history:verify, test:checkin and test:features. Final command totals and the main artifact read-back will be recorded after landing. No SQL or migration is created. Mr. Pina's explicit six-entry cap resolves the earlier decision 50 default; no new decision is needed.

Not verified: real iPhone/Android hardware, Safari/WebKit, installed PWA upgrade behavior, hardware NFC, production school sign-in, live Supabase policies or deployed signed-in production behavior. Fixture data is fictional and Chromium-only. The palette indexes page types and the permitted entry points; it does not enumerate private family tokens or every record instance in the database.
