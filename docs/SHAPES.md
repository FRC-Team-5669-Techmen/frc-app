# The plate: this app's shape language

Mr. Pina, 2026-09-30: the IDEA Classroom's recent UI update is "such a nice UI" and this app should take its **geometry**. This is that port: the IDEA Classroom's Plate v3 (`idea-app` `src/lib/classroom/plate.css`, approved 2026-09-27, rolled out as ledger 0345) carried over shape for shape, with every colour taken from this app's own `src/theme.css`.

**THE ONE-LINE REVERT.** In `src/plate.js`, `export const APP_PLATE = 'tm-plate'` becomes `export const APP_PLATE = ''`. Nothing in `src/plate.css` can match without the class, so that restores today's look on every page. Measured, not argued: [Off is today](#off-is-today).

## The architecture

| file | what it is |
| --- | --- |
| `src/plate.js` | The ONE constant, `APP_PLATE`. The only place the class is spelled. |
| `src/plate.css` | Every rule. Keyed on `:root.tm-plate`, nothing else. |
| `src/main.jsx` | Imports `./plate.css` and `APP_PLATE`, and adds the class to `<html>` when the constant is non-empty: three lines and a comment. |
| `tools/e2e/plate/` | The harness: screenshots, the pixel compare, the 44px sweep, the style diff, the token table, the index. |

- **The class name cannot collide.** The deck design system's classes are all `frc-`; no class anywhere in `src/` starts `tm-` (`grep -rnE "(^|[^a-zA-Z0-9_-])tm-[a-z]" src` finds only `plate.js` and `plate.css`).
- **Specificity is stated, not hoped for.** Every rule opens `:root.tm-plate` — (0,2,0) before its own selector — so a plate rule beats a component's own `.a` and `.a .b` however the lazily loaded stylesheets land. A qualifier inside a list goes in `:where()` so one compound entry cannot lift a whole list (IDEA learned that one the hard way: its wells rule began beating a select's caret).
- **Only paint and geometry move.** Radius, border colour, shadow, a face sheen, the label face and its case, a control's minimum height, and the page titles' layout. No rule moves a control off its click target, removes one, or changes what a click does. Decoration is paint only — pseudo-elements with `content: ''` and `pointer-events: none`, never animated — and only on the header's pads, the page titles and one lit key; never per row of a long list. No grid, no scan lines, no ruled fill.
- **The deck design system is never reached.** Every selector names an app class; the field rules, the only ones that name an element (`input`, `select`, `textarea`), carry `:not(:where(.frc-deck) *)`. `src/lib/design-system/` is untouched. Measured: [/_ds is untouched](#_ds-is-untouched).
- **Focus is not touched.** Nothing in `plate.css` sets an outline: every focusable control still paints the app's one solid 2px gold ring from `App.css`.
- **One `!important`, on purpose.** `/checkin`'s confirm key is styled inline (`CONFIRM_BTN_STYLE`), and an inline `border-radius` beats every selector; that one declaration carries `!important` and moves a corner, nothing else.
- **The check-in fast path loads it.** `plate.css` is imported by `main.jsx`, so it is in the entry stylesheet every route loads, `/checkin` included. Measured with `npm run build`: the entry stylesheet goes from 34.77 kB (18.24 kB gzip) at 99046e4 to 66.32 kB (24.40 kB gzip), **+6.2 kB over the wire**, once, then precached by the service worker like every other asset. `src/plate.css` is 60 kB of source, most of it comments. No JavaScript was added to the fast path beyond reading one string constant.

## Mapping IDEA's blocks onto this app

IDEA's plate has seven kinds of block. Each kind here is the same geometry; the class lists in `plate.css` were built from the rendered pages (`tools/e2e/plate/inventory.mjs`) and from every stylesheet rule that sets `cursor: pointer` on a bordered box, not from memory, because a list written from memory misses the surface nobody remembered.

| IDEA | here | what it is drawn as |
| --- | --- | --- |
| raised pressable key (`.btn`, header tools, toggles) | every boxed button: `.mb-checkout`, `.mb-rsvp-btn`, `.sch-*` buttons, `.jobs-*` buttons, `.lh-*`, `.mh-*`, `.board-*`, `.profile-*`, `.sv-opt`, the check-in confirm key, and the staff pages' buttons | radius 11 (`--tm-r-control`, a quarter of 44px); the composite edge: the hairline (lighter along its top) as the border, a light ring inside it, a crisp top highlight, a pillow face, a soft darker foot; outside, a tray and a short cast shadow |
| primary key (one flat accent face) | the gold-filled keys (`.sch-new-btn`, `.jobs-add-btn`, `.lh-submit`, `.profile-save`, Check Out …) | the key's edge and shadow, NO face gradient: the accent is flat wherever it appears. The gold fill is this app's own, unchanged |
| lit key (ON) | toggle keys whose ON is a gold fill keep it; the sort keys whose ON was a gold edge (`.jobs-sort-btn`, `.roster-sort-btn`) | the gold edge moves INSIDE the hairline as IDEA's **broken** ring: three ticks and an angled block at the top right, two ticks at the bottom left. The word and the gold ink still say ON |
| pressed / disabled | every key | pressed sinks (shade inside at the top, light at the foot, no drop); disabled is unlit (no highlight, no shadow) and keeps its own dimming |
| chip that is a button | toggle chips (`.checkin-cat`, `.profile-subteam-chip`, `.jobs-skill-chip`, `.board-goal-cat`, `.ma-chip`) and per-row buttons (FLAG, Delete, Request correction) | a small key: radius 5, the key's material |
| recessed chip / tag (never a key) | every status tag: `.role-badge`, `.mb-status`, `.navbar-context`, `.checkin-header-tag`, `.jobs-row-pill`, `.sch-kind`, `.lh-status-chip`, `.mh-session-flag`, `.board-pill`, and ~50 more | radius 5; a shade under its top lip, a light lip at its foot, and NO drop shadow. Each keeps its own size, padding, case, border and tone ink, so not one grows by a pixel |
| well (field, dropdown) | every text input, select and textarea; a segmented control's track (`.sch-viewtabs`, `.profile-cal-scope`, `.board-viewtoggle`, `.msh-toggle`); the feedback drop zone | radius 5 (11 for a track); the hairline all round except while focused (the field's own gold focus edge stands); a crisp shade under the top lip and a light lip outside the foot |
| panel / card | `.mb-tile`, `.glance`, `.sch-event`, `.mh-card`, `.lh-entry`, `.profile-card`, `.sv-q`, `.jobs-card`, `.vh-card`, `.rd-card`, `.squad-card`… | radius 12; the panel edge (softer than a control's hairline: a panel is a region, not a control); one light line inside the top; a faint sheen; a long soft shadow falling down and a little left; a panel inside a panel casts a shorter one. A tinted tile (the student blue, the fault alert) keeps its tint |
| housing (menu, dialog, popover) | `.nav-dropdown-menu`, `.fb-panel`, `.ah-dialog` (Team Hours drill-down), `.mh-modal`, `.lh-modal`, `.jobs-detail`, `.roster-modal`, and the tour's `.driver-popover` (listed, not photographed) | radius 12; a moulded frame inside the edge; a long cast shadow; menu rows 44px with the current row lit (a lighter face and a 2px gold bar at its left, the word gold as before) |
| pads (period tiles, section tabs) with an LED | the primary nav: `.navbar-links .nav-link` and the Hours/Skills dropdown triggers | radius 8; a 3px band with its own gradient inside the hairline, a light inner lip, and a recessed LED in its own lane at the bottom right. The CURRENT section is the lit pad: a lighter face, the LED in gold, the word in its own gold — three signals, so light is never the only one. The old underline goes |
| title bar with hazard blocks | the `h1` that names a page in the app shell (`.sch-title`, `.jobs-title`, `.study-title`, `.sv-title`, `.msh-title`, `.ic-title`, `.ph-title` and nine staff pages'); the single-card screens (the access gate, the application, the parent form, the check-in screens) keep their hero heading as it is | the words in spaced caps in this app's own display face (Chakra Petch 700, never under 20px) between two mirrored blocks of slanted bars over a groove; each block is rounded down to a whole bar so it always ends on its own slant — the chamfer as a detail. The bar runs the width of its region (the page head wraps its controls to the line below) |
| the header | `.navbar` | a lighter plate strip with a groove under it |
| labels | every eyebrow, stat label and field label (`.hud-label`, `.mb-tile-eyebrow`, `.mb-stat-label`, `.sch-label`, `.lh-label`, `.profile-label` … 56 classes and the certification card's `dt`), and every card and section heading that names a block (`.mh-card-title`, `.lh-section-heading`, `.profile-section-heading`, `.mp-section-heading`, `.cp-cat-name`, `.jobs-coverage-title`, `.jobs-thread-title`, `.ic-panel-h`), so twins on one page are never in two faces | Share Tech Mono at the 11px floor, uppercase, tracked 0.14em; each keeps its colour. A label naming a section already sits above it everywhere. Table column heads keep their face on every table alike |
| the display's chamfered screen | the check-in "ALREADY IN" / "ALREADY OUT" readout panel (`.checkin-panel`) | ONE corner, the lower right, cut at 26px and softened (`corner-shape: superellipse(0.25)`), behind `@supports (corner-shape: bevel)`; without it, a plain rounded corner, which is IDEA's own fallback. The left corners stay tight because the left edge is the panel's 4px amber rail, carried as a 1px border plus a 3px background layer so all four borders are one width (see the review, below) |

### What was left alone, and why

- **The page ground stays `--bg`.** IDEA paints the page as a graded charcoal plate; here the page's near-black is this app's colour, and colour is not what was asked for. The header strip is the one lighter plate.
- **The Google sign-in button** is Google's branded control, white by Google's rule; it keeps its own look.
- **The account avatar is not framed** (IDEA's call too): its box grows to 44x44 around the round picture, as hit area only; a negative margin keeps its footprint at the picture's 30px so the header lays out exactly as before.
- **The access gate's `.gate-card` is not a panel.** It is an unframed hero column (no padding, no border, no fill); framing it drew a housing hugging the words with the sign-out key flush on its foot.
- **Calendar day cells, table rows, list rows and the jobs list rows** keep their flat look: a month grid of 35 raised keys, or a raised key per table row, is the "decoration per row of a long list" the plate forbids.
- **The YOU tile's gold corner brackets** are this app's identity ornament. The tile takes the plate's 6px radius (`--tm-r-plate`), not the panel's 12, so a bracket never floats off a rounded corner.
- **Not ported, because nothing here plays the part:** IDEA's progress ring, the switch, the screws and the perforation patch, the display housing, the recessed column and its tabs, the engraved gutters. Inventing a surface to carry a part would be a control with no job.
- **Dense staff-only controls are not raised to 44px** (the skills catalog's reorder arrows, a table row's resend, the survey editor's mini keys). The floor is a student rule; those tables are built around density. Every one still gets the key's corner and material.
- **Native select arrows stay native.** An accent caret needs `appearance: none`, which changes a native control's padding and arrow (IDEA made the same call).
- **The frozen skills files** (`CertifyPage`, `SkillsCatalog`, `MemberSkillsPanel`, `MemberSkillsHome`, `CoverageMatrix`) are not edited; plate rules key on their existing class names from `plate.css`, which changes no file of theirs.
- **No component file was edited.** Every surface already had a stable class to key on.

### Calls made

1. **Title bars take the full width of the page head.** Kept inline, the bar made `/schedule`'s head wrap New Event under the title at 1440 anyway; as IDEA does, the bar runs the width of the region it names and the head's controls wrap to the line below, on every page alike.
2. **A lit outline key's gold moves inside the bezel.** The sort keys' ON state was a gold edge; with the broken ring added inside it, that read as two gold outlines. The bezel becomes the hairline and the gold is the ring, which is IDEA's construction.
3. **The panel edge is softer than the control hairline** (2.13:1 on `--surface` against the hairline's 3.68:1). A panel is a region, and at 3.6:1 every card on a near-black page read as outlined.
4. **My Hours' cards get the spacing scale's inset.** The goal, correction and adjustment rows sat flush against the card edge; a 4px corner hid it and a 12px corner clipped "All categories count". On a plate those rows take 16px.
5. **Every select on a plate is a 44px well.** Chromium laid out the restyled select 3px shorter (44.4 → 41.4px on `/log-hours` and `/profile`) with only paint properties changed — found by the sweep, not by eye — so the floor is set on every single-line field and select.
6. **The nav strip is 56px at desktop** (was 52): the 44px pads plus 6px either side, room for the focus ring's 4px reach and the pads' cast shadow.
7. **The login key has rules of its own** — IDEA's `:is()` trap, met again. The login page styles its submit as `.login-card button[type='submit']`, (0,2,1); written into the shared key list, that one entry raised the whole list to (0,3,1), and the small-key radius (0,3,0) lost to it on every per-row key in the app (the catalog's EDIT keys came out 11px round instead of 5 — seen in a screenshot, not in the CSS). `keyed.mjs` now fails any argument heavier than one class in a class list, with that exact entry as its positive control.

8. **A page title keeps this app's display face.** The first port set the title bar's words in Share Tech Mono at regular weight, as the reference does; two reviewers flagged it against the brief (geometry only, keep the app's fonts) and CLAUDE.md (Chakra Petch is the display face, mono is for readouts). The bar, the hazard blocks, the groove, the caps and the tracking stay; the words are Chakra Petch 700 and never under 20px, so a title on a phone is never smaller than the body copy under it.
9. **A label is a label wherever it sits.** Twins on one page were in two faces (`BY SEASON` mono over `SEASON GOAL` Chakra; `NOTIFICATIONS` mono beside `TEAM DISCORD` Chakra). The label treatment now reaches every card and section heading that names a block; table column heads keep their face on every table alike, because a table head is part of the table's grid, not a label above a region.

## The review, and what it changed

Four reviewers looked at all 176 pairs (and opened twenty more views by hand), each from a different group of routes, and reported 53 defects: 3 broken, 15 wrong, 35 polish (the table merges the ones two reviewers both found). Every broken and wrong one is fixed except `/_fixture`'s seed problems, which are not the plate's and sit in another lane's files; polish was fixed wherever it was cheap and safe, and each one left alone is listed with its reason below. The views the reviewers opened by hand are now states every run photographs and measures (`REVIEW_STATES` in `states.mjs`), and two of the defect classes they found by eye now have an instrument, so the next one is not left to a reviewer:

- **`identity.mjs`** reads all four border sides of every element on every page, on and off, and fails on any edge with chroma (gold, red, a category or role hue) the plate repaints. The reviewers found three such edges (a chosen parent answer, the PDF key, a pending request's rail); the instrument then found three more they had not (the survey editor's Open/Duplicate/Save keys, its Delete key, the feedback dialog's gold Copy key). Its positive control puts the first review's `.ar-card` bug back in memory every run and must catch it.
- **`measure.mjs`** now also measures every element that declares a pointer cursor (the app's own signal for "this is a control"), which is how it missed a skill row a student taps, a jobs row, Team Hours' sort heads and the coverage toggle. 106 of its 691 targets are found that way; 70 of those are under 44px with the class off, which is its positive control.

| reviewer group | defect | severity | what changed |
| --- | --- | --- | --- |
| staff-a | admin avatar menu: Sign out below the fold (the 44px rows made the menu scroll) | broken | Sign out sticks to the housing's foot when the menu scrolls, with a lit seam above it; section labels take 8px, not 12, above them |
| staff-a | admin avatar menu: all three dividers 0px tall | wrong | nothing in a menu may flex-shrink (a divider's min-height is 0, so it was squeezed first); the groove's lip is the panel edge so it reads on `--surface` |
| staff-b | skills catalog at 375: ACTIONS column clipped off the card, EDIT/REMOVE unreachable (pre-existing) | broken | the table scrolls sideways inside its panel |
| staff-b | survey settings at 375: page scrolls sideways 101px (pre-existing) | broken | the Opens/Closes row wraps |
| student-core | check-in duplicate panel: stray amber on the RIGHT border, the rail curling round the corners | wrong | one chamfered corner (lower right); tight left corners; the 4px rail is a 1px border plus a 3px background layer so all borders are one width (the leak was Chromium's `corner-shape` meeting unequal border widths: 82 stray gold pixels before, 0 after) |
| student-core | survey radio rings and checkbox squares vanish on the option key (1.07:1) | wrong | the unchosen mark is a small well with the load-bearing hairline |
| student-core, member-rest | skill rows a student taps, ~33px | wrong | 44px floor on `.msp-clickable` |
| member-rest | coverage view toggle label 17px | wrong | 44px floor; the matrix's member-name links get a 44px hit area too (found by the widened sweep) |
| member-rest | jobs rows 40px; `+ Image` / `+ Upload image` 29–32px | wrong | 44px floor on `.jobs-row`; the image key is an inline flex box at 44px |
| member-rest | Team Hours sort heads 37px | wrong | `height: 44px` on `.board-th-sort` (a cell ignores min-height) |
| member-rest | the chosen parent answer lost its gold edge | wrong | `.pr-choice-on` excluded from the hairline |
| member-rest | the pending gate framed as a panel it never was | wrong | `.gate-card` removed from the panel lists |
| staff-a | `/verify-hours` at 375: wordmark truncated to `TECHMEN·56…` | wrong | the avatar's 44px box is hit area only: a −7px margin keeps its footprint at 30px (0 of 52 route/persona pairs truncate now, as with the class off) |
| staff-a | pending request cards, the jobs review queue and overdue rows lost their accent rail | wrong | excluded from the panel edge, which now paints their other three sides; left corners tight so the rail runs straight |
| staff-a | the PDF key lost its gold-dim identity border | wrong | `.rp-btn-print` excluded from the hairline |
| staff-a, staff-b | page titles moved to the mono face, 15px on a phone | wrong | call 8 above |
| staff-b | `/_fixture` reports 26 seed problems | wrong | not the plate; the fixture belongs to the gate lane (see below) |
| student-core | FLAG key widened, squeezing the time over four lines | polish | the extra padding is gone and the time is one line, so the row's own wrap moves FLAG down |
| student-core | adjustment rows wrap differently from each other at 375 | polish | on a phone every row is category, amount and date over a full-width reason |
| student-core | `THIS WEEK` wraps, `ALL TIME` does not | polish | stat labels do not wrap |
| student-core, member-rest, staff-b | twin headings and labels in two faces (hours, profile, feedback widget, member page, certification card, job detail, certify) | polish | call 9 above |
| student-core | the check-in confirm key's grey ring round a gold face | polish | it sits in the same dark tray as every other accent key |
| student-core | 44px per-row keys (FLAG, Delete, Request correction) with chip corners | polish | they take the control radius; only keys that stay short keep 5px |
| student-core | the schedule's MONTH/AGENDA well 51px beside a 44px key | polish | the segments fill their track (46px); no overflow clip, so the focus ring is not cut |
| member-rest | `.mp-discipline` / `.mp-position` pills beside 5px `.mp-subteam` chips | polish | all three are recessed 5px chips |
| member-rest | the parent dashboard's `FAMILY VIEW` kicker hangs left of the centred title | polish | it centres over the bar |
| member-rest, staff-b | `+ NEW JOB`, `+ ADD SKILL`, `+ ADD DISCIPLINE` stranded at the left under the bar | polish | the primary action keeps the right edge |
| member-rest | dashed drop-zone border on a raised key | polish | the two keys take a solid hairline edge; the image key centres its word in the form |
| member-rest | parent glance next-event link 30px, `View Team Hours →` 18px | polish | both 44px (the underline stays under the words) |
| member-rest | certified skill's "certifier · date" runs off the card at 375 (pre-existing) | polish | the row wraps on a phone |
| member-rest, staff-a | the header is tight at 375; the pending dot floats off the avatar | polish | both follow from the avatar fix above; the dot sits on the picture's rim |
| staff-a | short keys rendered as 11px capsules (drill-down EDIT/VOID, RE-SCAN, `+ Manual session`) | polish | small radius; SAVE is raised to 44 beside its 44px well and keeps 11 |
| staff-a | `.ah-close` 44px box towering over `+ Manual session`, "Sessions by day" wrapping at 375 | polish | the plate no longer resizes it: the component already widens its hit area to 44x44 with a `::before`, which the sweep now counts |
| staff-a, staff-b | ragged rows: 44px wells beside 26–36px keys (Activity, Verify Hours, Applications, feedback inbox, survey editor) | polish | those keys take the 44px floor |
| staff-a | `.rd-bucket` 4px inside a 12px panel; `.rp-table-wrap` not a panel | polish | the tile takes the pad radius; the table wrapper is a panel like its twins |
| staff-b | the roster's search and count flush against the viewport at 375 | polish | inset to the panels' 16px |
| staff-b | wide-screen agenda: stacked 44px Edit/Delete make every event 100px | polish | side by side at 640px and up |
| staff-b | certify categories, catalog groups and survey manage rows flat beside panel twins | polish | panels (the catalog group as header + table with one shadow); the delete row keeps its fault edge |
| staff-b | roster permission toggle a pill beside 5px role chips | polish | small radius |
| staff-b | feedback export panel's gold rail bent into a C | polish | tight left corners |
| staff-b | announce compose card: square sub-panels in a 12px housing | polish | 5px parts (poll/embed editors, the preview message, the checks list, the status banner's right corners) |
| staff-b | lit sort key's ring ticks rasterise as dashes at 1x | polish | dropped at 1.5dppx and under; the masked ring stays |

**Not fixed, and why:**

- **The Reports keys' printer glyph (`🖨 PDF`)** — an emoji in `ReportsPage.jsx`, pre-existing and identical off; the plate lane edits no component file, and a glyph is content, not shape. For a later lane: an inline SVG or plain text.
- **The announce page's "Needs setup before anything can be sent: ." with an empty list** — copy in `AnnouncePage.jsx`, not shape.
- **`/_fixture`'s 26 seed problems** (non-uuid ids and a null category in the b2/d attendance rows) — `src/dev/fixture/**` belongs to the gate lane this night. Those rows do not load, so the anomaly and check-in pictures are missing that data with the class on and off alike.
- **`/_ds`'s specimen lede running past 375** — the deck design system is frozen and identical on, off and base.
- **The schedule's `My events` row air** — it is the toggle's own 44px box around a 17px line; tightening it means going under the floor.
- **Table column heads** stay in their table's face (call 9).
- **Staff-only dense controls** keep their size, as before (the catalog's reorder arrows, a table row's resend, the survey editor's mini keys, the drill-down's EDIT/VOID).

## The token table

Generated by `node tools/e2e/plate/tokens.mjs --port 5413` from `src/plate.css`, so it cannot disagree with the code. Shape tokens are declared once; the only lengths that move, move with the viewport.

**Shape** (every value IDEA's own, except the spacing scale, which is this port's: IDEA's plate has no named scale, so its recurring lengths — 4px lamp and chip gaps, a 12px row inset, a 16px card inset — became one):

| token | declared | at 480px and under |
| --- | --- | --- |
| `--tm-soft` | `superellipse(0.25)` |  |
| `--tm-r-control` | `11px` |  |
| `--tm-r-small` | `5px` |  |
| `--tm-r-pad` | `8px` |  |
| `--tm-r-panel` | `12px` |  |
| `--tm-r-plate` | `6px` |  |
| `--tm-cut-screen` | `26px` |  |
| `--tm-target` | `44px` |  |
| `--tm-label-size` | `0.6875rem` |  |
| `--tm-label-track` | `0.14em` |  |
| `--tm-ring-inset` | `5px` |  |
| `--tm-led` | `7px` |  |
| `--tm-s1` | `4px` |  |
| `--tm-s2` | `8px` |  |
| `--tm-s3` | `12px` |  |
| `--tm-s4` | `16px` |  |
| `--tm-s5` | `24px` |  |
| `--tm-s6` | `32px` |  |
| `--tm-hazard-w` | `min(18%, 132px)` | `24px` |
| `--tm-hazard-h` | `15px` | `10px` |
| `--tm-hazard-pitch` | `10px` | `6.667px` |
| `--tm-hazard-tail` | `3px` | `2px` |
| `--tm-title-size` | `clamp(1.05rem, 0.85rem + 0.55vw, 1.35rem)` | `0.95rem` |
| `--tm-title-track` | `0.12em` | `0.06em` |

**Colour** (one block, because this app has one theme; every value a `color-mix()` of `src/theme.css` tokens, resolved here by the browser with the class on). The load-bearing line is `--tm-hair`, the outer hairline of every control and field: at least 3:1 on every ground a control sits on (3.43:1 on `--surface-2`, the lightest). Everything translucent is a light or a shade laid over whatever face is under it, which is how one rule draws the edge on a gold key and a dark key alike without repainting either:

| token | declared (theme.css tokens only) | resolves to | contrast on --bg / --surface / --surface-2 |
| --- | --- | --- | --- |
| `--tm-hair` | `color-mix(in srgb, var(--steel) 35%, var(--muted))` | `#6b7179` | 4.00 / 3.68 / 3.43 |
| `--tm-hair-top` | `color-mix(in srgb, var(--steel) 70%, var(--muted))` | `#7c828a` | 5.08 / 4.67 / 4.36 |
| `--tm-panel-edge` | `color-mix(in srgb, var(--muted) 62%, var(--border-strong))` | `#484d54` | 2.31 / 2.13 / 1.98 |
| `--tm-bezel` | `color-mix(in srgb, var(--text) 6%, transparent)` | `#e5e7eb at 6%` | (translucent: a shade or a light, not a boundary) |
| `--tm-bezel-hi` | `color-mix(in srgb, var(--text) 16%, transparent)` | `#e5e7eb at 16%` | (translucent: a shade or a light, not a boundary) |
| `--tm-face-hi` | `color-mix(in srgb, var(--text) 8%, transparent)` | `#e5e7eb at 8%` | (translucent: a shade or a light, not a boundary) |
| `--tm-face-lo` | `color-mix(in srgb, var(--text) 2%, transparent)` | `#e5e7eb at 2%` | (translucent: a shade or a light, not a boundary) |
| `--tm-foot` | `color-mix(in srgb, var(--bg) 55%, transparent)` | `#0a0b0d at 55%` | (translucent: a shade or a light, not a boundary) |
| `--tm-rim-out` | `color-mix(in srgb, var(--bg) 60%, transparent)` | `#0a0b0d at 60%` | (translucent: a shade or a light, not a boundary) |
| `--tm-drop` | `color-mix(in srgb, var(--bg) 70%, transparent)` | `#0a0b0d at 70%` | (translucent: a shade or a light, not a boundary) |
| `--tm-drop-far` | `color-mix(in srgb, var(--bg) 55%, transparent)` | `#0a0b0d at 55%` | (translucent: a shade or a light, not a boundary) |
| `--tm-press` | `color-mix(in srgb, var(--bg) 75%, transparent)` | `#0a0b0d at 75%` | (translucent: a shade or a light, not a boundary) |
| `--tm-panel-hi` | `color-mix(in srgb, var(--text) 9%, transparent)` | `#e5e7eb at 9%` | (translucent: a shade or a light, not a boundary) |
| `--tm-panel-sheen` | `color-mix(in srgb, var(--text) 3%, transparent)` | `#e5e7eb at 3%` | (translucent: a shade or a light, not a boundary) |
| `--tm-frame` | `color-mix(in srgb, var(--text) 4%, transparent)` | `#e5e7eb at 4%` | (translucent: a shade or a light, not a boundary) |
| `--tm-frame-in` | `color-mix(in srgb, var(--bg) 35%, transparent)` | `#0a0b0d at 35%` | (translucent: a shade or a light, not a boundary) |
| `--tm-well-shade` | `color-mix(in srgb, var(--bg) 85%, transparent)` | `#0a0b0d at 85%` | (translucent: a shade or a light, not a boundary) |
| `--tm-well-lip` | `color-mix(in srgb, var(--text) 11%, transparent)` | `#e5e7eb at 11%` | (translucent: a shade or a light, not a boundary) |
| `--tm-chip-shade` | `color-mix(in srgb, var(--bg) 70%, transparent)` | `#0a0b0d at 70%` | (translucent: a shade or a light, not a boundary) |
| `--tm-chip-lip` | `color-mix(in srgb, var(--text) 9%, transparent)` | `#e5e7eb at 9%` | (translucent: a shade or a light, not a boundary) |
| `--tm-strip-top` | `color-mix(in srgb, var(--surface) 70%, var(--bg))` | `#111316` | 1.06 / 1.03 / 1.10 |
| `--tm-strip-bot` | `var(--bg)` | `#0a0b0d` | 1.00 / 1.09 / 1.17 |
| `--tm-groove-dk` | `color-mix(in srgb, var(--bg) 95%, transparent)` | `#0a0b0d at 95%` | (translucent: a shade or a light, not a boundary) |
| `--tm-groove-lt` | `color-mix(in srgb, var(--text) 8%, transparent)` | `#e5e7eb at 8%` | (translucent: a shade or a light, not a boundary) |
| `--tm-band-top` | `color-mix(in srgb, var(--border-strong) 80%, var(--steel))` | `#3d4248` | 1.94 / 1.79 / 1.67 |
| `--tm-band-bot` | `var(--border-strong)` | `#2a2e34` | 1.44 / 1.33 / 1.24 |
| `--tm-pad-lip` | `color-mix(in srgb, var(--text) 12%, transparent)` | `#e5e7eb at 12%` | (translucent: a shade or a light, not a boundary) |
| `--tm-pad-face` | `var(--surface)` | `#14161a` | 1.09 / 1.00 / 1.07 |
| `--tm-lit-top` | `color-mix(in srgb, var(--surface-2) 82%, var(--steel))` | `#2e3237` | 1.53 / 1.40 / 1.31 |
| `--tm-lit-bot` | `var(--surface-2)` | `#1a1d22` | 1.17 / 1.07 / 1.00 |
| `--tm-led-off` | `var(--border-strong)` | `#2a2e34` | 1.44 / 1.33 / 1.24 |
| `--tm-led-off-hi` | `color-mix(in srgb, var(--border-strong) 60%, var(--steel))` | `#50555c` | 2.62 / 2.41 / 2.25 |
| `--tm-led-cup` | `var(--bg)` | `#0a0b0d` | 1.00 / 1.09 / 1.17 |
| `--tm-led-on` | `var(--gold)` | `#ffe629` | 15.57 / 14.32 / 13.36 |
| `--tm-led-halo` | `var(--gold-a24)` | `#ffe629 at 24%` | (translucent: a shade or a light, not a boundary) |
| `--tm-hazard` | `color-mix(in srgb, var(--muted) 72%, var(--border-strong))` | `#4d5259` | 2.50 / 2.30 / 2.15 |
| `--tm-accent` | `var(--gold)` | `#ffe629` | 15.57 / 14.32 / 13.36 |

## The measurements

**For reviewers**: `artifacts/shots/plate/INDEX.md` lists all 196 on/off pairs with absolute paths, grouped as the check-in fast path, the member routes, the public routes, the interactive states (avatar menu, Hours menu, feedback panel open, Team Hours drill-down, schedule agenda and new-event form, job detail, flag-a-session and request-a-correction dialogs, the `/checkin` confirm and success screens, and the nine views the first review opened by hand: the check-in duplicate panel, Team coverage, the new-job form, an open certification, an expanded roster row, survey settings, certify with a member, an open catalog category, the feedback inbox detail), the staff and admin routes, the persona-only pages (parent dashboard, pending gate, signed-out landing and login) and the dev harnesses. Every file is `artifacts/shots/plate/<on|off|base|const-empty>/<persona>/<375|1440>/<slug>.png`.

Everything below was measured in this container's Chromium (build 1194, headless, software raster) on fixture mode, 2026-10-01, and every figure is re-runnable with the commands in the next section. `artifacts/shots/plate/INDEX.md` lists every screenshot pair with its paths.

### Off is today

**The proof is two trees, not one switch.** The *base* is `git archive 99046e4` (the commit this work started from, no plate at all). The *const-empty* tree is `git archive a80a8a8` (this branch's source after the review's fixes; nothing under `src/` changed after it) with only `APP_PLATE` changed to `''` (a copy in the scratch directory; this checkout was never edited to make it). Both were served in fixture mode on one port, one after the other, and photographed by the same driver: every route in `src/dev/fixture/routes.js` as admin and as student at 375x812 and 1440x900, the parent dashboard, the pending gate, the signed-out landing and login, and twenty interactive states. The base set was extended by exactly the nine states added after it was first shot (`shots.mjs --routes none --states review --persona-pages false`, from the same 99046e4 archive).

| comparison | result |
| --- | --- |
| const-empty (this source, `APP_PLATE = ''`) against base 99046e4 | **196 of 196 identical**, every one byte-identical as PNG |
| off (this checkout, the class suppressed from the first frame) against base | **196 of 196 identical**, every one byte-identical (re-shot after the review's fixes) |
| on against off (the POSITIVE CONTROL: the comparison can see the plate) | **188 of 196 differ, 8 identical**: the identical ones are `/_ds` and `/_fixture`, the deck specimen and the fixture control page, which no plate rule reaches |

**Repeatable, measured:** the base and const-empty sets were shot by two different server processes from two different trees, and off by a third from this checkout; all three agree byte for byte on every page each holds. Before that, a same-tree control (the base shot twice, 56 pages) read 52 of 56 identical with no pins, 54 of 56 with the rasteriser pinned (the two left were `/_ds`'s tall capture), and identical once `/_ds` was photographed as its first screen.

**What was pinned so one tree renders the same pixels twice**, each found by a run that did not repeat:

- the clock: Playwright's fixed time, Thursday 2026-10-01 4:00 PM in Los Angeles (the check-in E2E's own instant), and the fixture store reseeded on every page;
- randomness: `Math.random` and `crypto.randomUUID` replaced by seeded, counting stand-ins before any page script (the fixture gives rows without an id a random one, and some lists sort by id);
- motion: `prefers-reduced-motion: reduce`, and `transition: none; animation: none` from the document's first byte, not added after load — `/_ds` runs in-page proofs on 60–320 ms timers, and a style tag landing between two of them made one tree render two pages;
- fonts: `document.fonts.ready` before every shot;
- the rasteriser: one raster thread and no partial raster (`DETERMINISTIC_ARGS` in `common.mjs`). Without them two runs of the same base tree differed on 4 of 56 pages by 7 to 217 pixels, every one an antialiased edge (the avatar's circle, calendar cell borders);
- `/_ds` is photographed as its first screen: at 1440 it is 77,000 px tall, and a capture that tall comes back with unpainted tiles in different places on two runs (271,697 and 297,822 px). `styles.mjs` covers the whole of it instead, element by element;
- the build stamp: the feedback panel prints the build, a git checkout's short sha against `dev` for an archive, so this checkout's server runs with `VERCEL_GIT_COMMIT_SHA=dev` for the comparison.

**OFF is a fresh load, and that was measured into being.** The first OFF set removed the class from the ON page; 18 of 176 of those differed from the base — the build stamp (4, the feedback panel), a pointer still resting where a state's click had been in the plated layout (4: the new-event form and the Hours menu), and 10 on pages holding native selects, date fields or the coverage matrix that Chromium did not lay out again exactly as a fresh load does after a style change within one load (traced for the selects: a restyled select measured 3px shorter; the coverage table was not traced further). With a fresh OFF load all 18 are identical. OFF is now a second load whose init script makes `classList.add('tm-plate')` a no-op, so `main.jsx` runs its one line and adds nothing.

### /_ds is untouched

`styles.mjs` reads every element's computed style (every standard property, and the `::before`/`::after` of any element that has one) with the class on, removes it, reads again, restores it and reads a third time; the plate's effect is the second read against the third.

| route | 375 | 1440 |
| --- | --- | --- |
| `/_ds` (6,473 elements, 6,448 inside `.frc-deck`) | **0 differ** | **0 differ** |
| `/dashboard` (positive control) | 45 differ, 0 inside `.frc-deck` | 41 differ |
| `/schedule` (positive control) | 38 differ | 39 differ |

The instrument's own noise is reported beside it: one table under a closed `<details>` on `/_ds` reads 0 px tall before the first style recalculation and 1,348.58 px after, with nothing toggled, which is why the decisive pair is two reads that both follow a recalculation.

### Every rule is keyed

`keyed.mjs` (static, no browser): 107 rules in 7 at-rule blocks, **0 problems**, every selector opening `:root.tm-plate`, no raw colour (no hex, no `rgb()`, no named colour; a mask's opaque stops are `var(--bg)`), no `@import`/`@font-face`/`@keyframes`, no argument heavier than one class in a class `:is()` list, and `main.jsx` adding the class only when the constant is non-empty. **8 of 8 positive controls caught**: an unkeyed rule, one inside `@media`, a decoy `:root .tm-plate` prefix, a keyed selector beside an unkeyed one, a raw hex, a raw `rgba()`, an `@import`, and the login key's heavy `:is()` argument.

### The 44px floor

`measure.mjs`, every student-reachable route and state (the member, public and check-in routes, the fifteen student states, the pending gate, the signed-out landing and login) with the class on. The sweep now also measures every outermost element that declares a pointer cursor, and counts a control's absolutely positioned `::before`/`::after` hit area; a link in a table cell is no longer exempt as running text:

| | 375 | 1440 |
| --- | --- | --- |
| targets measured (buttons, links acting as controls, fields, selects, textareas, labels wrapping a checkbox, and anything else declaring a pointer cursor) | 708 | 708 |
| of those, found by their pointer cursor alone (rows, sort heads, toggle labels) | 106 | 106 |
| **under 44px, class ON** | **0** | **0** |
| under 44px, class OFF (today) | 417 | 298 |
| POSITIVE CONTROL: cursor-found targets under 44px with the class off | 70 | 70 |
| text links in running text, exempt and listed | 0 | 0 |

Fixed on the way (selector, height before): the nav links 37.2 and dropdown triggers, the avatar 30x30, the menu rows ~35, `.mb-next-body` 38, `.sch-viewtab` 27.2, `.sch-myonly-toggle` 17, `.sch-nav-btn` 32x32, `.sch-today-btn` 26.2, `.sch-rsvp-toggle` 15, `.sch-edit`/`.sch-del` 25 (1440), `.sch-toggle` 34.4 (1440), `.mh-session-flagbtn` 14.6, `.lh-submit` 40.8, `.lh-delete-btn`/`.lh-corr-btn` 24.4, every select (Chromium laid a restyled select out 3px shorter, 44.4 to 41.4), `.board-tab` 31.8, `.board-viewbtn` 28.8, `.ah-close` 20x24, `.msh-toggle-btn` 31.4, `.msh-select` 38, `.msh-note` 36, `.msh-btn` 35, `.jobs-add-btn` 33, `.jobs-search` 36, `.jobs-sort-btn` 29.2, `.jobs-group-header` 35.8, `.study-input` 36–38, `.study-log-btn` 36, `.profile-group-toggle` 16, `.profile-save` 40.8, `.profile-cal-subscribe` 37.6, `.profile-cal-tab` 28.8, `.profile-cal-input`/`-copy` 38.4, `.profile-cal-regen` 30.4, `.np-btn` 35, `.np-master` 21, `.np-cat` 32.6, `.np-time` 33.5, `.checkin-home-link` 19, `.landing-nav-link` 32, `.pr-choice` 36, `.pr-clear` 13, `.pr-input` 38.2, `.pr-check` 40.8 (1440).

### Chips are not keys

Same run: **237 chips** (every non-interactive element whose class names it a chip, pill, badge, tag, status, count, flag, kind or state and that draws a box), **0 with a drop shadow, 0 declaring a pointer cursor** (a chip inside a clickable row inherits the row's pointer and is not counted; the row is the control). POSITIVE CONTROL, the same shadow parser over the keys: **154 of 165 keys have a drop shadow**; the 11 without are 6 unlit segments inside a segmented control's well (Team Hours' and Skills' view toggles), 3 disabled keys (drawn unlit on purpose), the certification card's expand header (not a plate key) and Google's sign-in button (left alone).

### No page breaks sideways

The shot run records each page's horizontal overflow on and off: **0 of 196 pages** scroll sideways with the plate on and not off. One page that DID scroll sideways with the plate off no longer does with it on: survey settings at 375 (101px, the Opens/Closes row, pre-existing).

### No identity edge is recoloured

`identity.mjs`, every route as admin and student, the persona pages and all twenty states, at both widths, on and off: **98 pages, 2,221 identity edge sides (a border side with chroma: gold, red, a category or role hue), 0 recoloured** at 375 and at 1440. 78 sides are recoloured on purpose, by the two listed rules (the lit sort keys' gold moving inside as the broken ring, and the nav pads' old underline). POSITIVE CONTROL, run first every time: the first review's `.ar-card` bug put back in memory is caught (4 pending rails reported).

### Check-in and check-out

`npm run test:checkin -- --port 5413`, class on: **`checkin e2e: 8/24 passed (375 and 1440)`**. The same 16 steps fail with the class off — on base 99046e4 (8/24) and on this source with `APP_PLATE = ''` (8/24) — and their failure text is identical byte for byte once the clock time is normalised. They are not the plate's: the second NFC tap now shows a "Check out" confirm screen (`STATUS // CONFIRM TO CHECK OUT`) where `tools/e2e/checkin.mjs` still expects the one-tap check-out it was written against (steps c2 to g), and that file belongs to the gate lane. The 8 that pass are, at both widths, (a) the NFC check-in at the shop, (b) the dashboard's Check Out, (c1) a second check-in the same day and (z) no unexpected console error. Separately, the plate's own shots drive `/checkin`'s confirm screen, its success screen and the duplicate-tap panel at both widths (`state-checkin-confirm`, `state-checkin-success`, `state-checkin-duplicate`). Re-run after the review's fixes: class on (this checkout) **8/24**, class off (`APP_PLATE = ''` tree, its own copy of the same `checkin.mjs`) **8/24**, and the failure text of the two runs is identical once the clock time is normalised.

### The production build

`npm run build` passes. `prod404.mjs` against a production build served by `vite preview` (built with placeholder `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` pointing at a port nothing listens on, as `.env.dsspec` does: a build with no Supabase URL throws at load and renders nothing, which the positive control catches): `/_fixture` renders `404 — not found`, the same element as `/_ds`, `window.__fx` is absent, the fixture client's marker string is in 0 files of `dist/`, and `/login` renders the real login card (the positive control). **PASS.**

### The suites CI runs

`npm test` 529/529, `npm run ds:audit` ok (36 aliases x 3 grounds, 79 components, 315 files), `npm run discord:calendar:test` 19/19, `npm run history:verify` ok, `npm run build` ok.

## Re-shooting and re-measuring

All from a checkout of this tree, with the container's Chromium (`tools/browser-verify/browser.mjs`'s resolution chain). Each tool boots `vite --mode fixture` on `--port` and stops it afterwards, or reuses a fixture server already serving THIS checkout there; `--url` drives any server, unchecked (that is how the base and const-empty trees were shot).

```bash
# one route, on and off, both widths (writes <out>/on/... and <out>/off/...)
node tools/e2e/plate/shots.mjs --port 5413 --routes /schedule --personas student --widths 375,1440 --extras false --out artifacts/shots/plate-one

# the whole set: every route as admin and student, both widths, on and off,
# plus the persona-only pages and the interactive states (about an hour);
# VERCEL_GIT_COMMIT_SHA=dev only matters when comparing against an archive
VERCEL_GIT_COMMIT_SHA=dev node tools/e2e/plate/shots.mjs --port 5413

# the base: the same set from a tree without the plate, served on the port
git archive 99046e4 | tar -x -C /tmp/base && ln -s "$PWD/node_modules" /tmp/base/node_modules
(cd /tmp/base && node node_modules/vite/bin/vite.js --mode fixture --port 5413 --strictPort &)
node tools/e2e/plate/shots.mjs --url http://127.0.0.1:5413 --set base
# ...or extend an existing base by the review states only (into a scratch
# folder, then copy its base/ PNGs in, so base.json is not overwritten)
node tools/e2e/plate/shots.mjs --url http://127.0.0.1:5413 --set base --routes none --states review --persona-pages false --out artifacts/shots/plate-basenew

# off is today: this tree with APP_PLATE = '' (a copy, never an edit here)
git archive HEAD | tar -x -C /tmp/const && ln -s "$PWD/node_modules" /tmp/const/node_modules
sed -i "s/^export const APP_PLATE = 'tm-plate'$/export const APP_PLATE = ''/" /tmp/const/src/plate.js
(cd /tmp/const && node node_modules/vite/bin/vite.js --mode fixture --port 5413 --strictPort &)
node tools/e2e/plate/shots.mjs --url http://127.0.0.1:5413 --set const-empty

# compare (decoded pixels; exit 0 only when all are identical)
node tools/e2e/plate/compare.mjs artifacts/shots/plate/base artifacts/shots/plate/const-empty --json artifacts/shots/plate/const-empty-vs-base.json
node tools/e2e/plate/compare.mjs artifacts/shots/plate/base artifacts/shots/plate/off --json artifacts/shots/plate/off-vs-base.json

node tools/e2e/plate/measure.mjs --port 5413 --widths 375,1440   # the 44px sweep + chips-are-not-keys, student routes
node tools/e2e/plate/identity.mjs --port 5413 --widths 1440,375  # no identity edge recoloured, with its control
node tools/e2e/plate/styles.mjs --port 5413       # /_ds untouched, element by element
node tools/e2e/plate/keyed.mjs                    # every rule keyed, no raw colour, the wiring (static, no browser)
node tools/e2e/plate/tokens.mjs --port 5413       # the token table above
node tools/e2e/plate/index.mjs                    # artifacts/shots/plate/INDEX.md
node tools/e2e/shoot.mjs --port 5413 --persona student --routes /dashboard --plate off   # the quick look
npm run test:checkin -- --port 5413
```

Helpers for looking: `crop.mjs out.png x,y,w,h a.png b.png --scale 2` sets the same region of several shots side by side; `montage.mjs out.png --shrink 2 a.png b.png ...` tiles whole pages.

## Not verified

- **Safari and Firefox.** This container has Chromium only (build 1194). `corner-shape` is Chromium-only today, so elsewhere the check-in panel's foot is a plain rounded corner (the `@supports` fallback, by design); `color-mix()`, `mask-composite` and `round()` are in current Safari and Firefox but were not looked at there. Android Chrome is the platform students check in on, and the 375 run emulates it (touch, `isMobile`, an Android user agent).
- **A real phone and a real projector.** Every figure is a headless software renderer at device scale 2 (375) and 1 (1440).
- **Signed-in surfaces against the live project.** Everything here ran on fixture mode (an in-memory Supabase with fictional people); nothing in this container can reach the live project. Layout depends on data, so a real roster with longer names could wrap differently.
- **Every state of every page.** The sets cover every route in `src/dev/fixture/routes.js` and twenty interactive states; modals and forms not listed in `tools/e2e/plate/states.mjs` (the staff edit forms, the roster's delete dialog, the applications detail modal, the announce poll editor) were not photographed open. Their classes are in the plate's lists, so they are drawn by the same rules.
- **Hover and pressed states were read, not driven.** The screenshots are at rest; `:hover` and `:active` rules were written against each component's own state rules (and the hairline rule excludes them so the component's gold hover edge stands), but no hover was photographed.
- **Reduced motion.** The plate adds no animation and no transition. The harness runs with `prefers-reduced-motion: reduce` and freezes transitions so a toggled class is never photographed mid-ease.
