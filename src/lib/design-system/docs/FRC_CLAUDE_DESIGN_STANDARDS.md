# FRC Claude Design Standards
**Version 1.6 - 2026-08-23**

Scoping and prompting rules for every FRC Team 5669 artifact authored in Claude Design against the FRC design system. Presentations are the primary case.

This is the FRC counterpart to `IDEA_CLAUDE_DESIGN_STANDARDS.md`. Brand, tokens, type, motion, and the component manifest are owned by `FRC_Design_System.md`. This document owns what a prompt must contain. Chat scopes and specifies. Design lays out.

**The system lives in a repo, not in Claude Design.** It is authored as React in `frc-app` at `src/lib/design-system/` and Claude Design sources it from GitHub. This is the single most consequential structural difference from the IDEA system, which was authored inside Claude Design from a written description of Svelte components and has drifted from `idea-app` ever since. Two consequences run through this document: the manifest at HEAD is the staleness authority rather than a stated count, and a component change is a Claude Code prompt followed by a commit rather than a canvas edit.

---

## Why this exists, and what it corrects from the IDEA version

The IDEA standard was written after a deck shipped using one design system component across 29 slides with a hand-rolled parallel motion vocabulary. Its fix is the load-bearing rule here too: **a prompt that does not name components per sheet gets hand-rolled sheets.**

This version corrects one architectural decision the IDEA standard inherited. IDEA ships four deck templates as starting points. A template is a copied file, so it forks on first use and receives no later fix. IDEA's four are already drifting from the components they were built on.

This system ships **one minimal shell, twenty-six sheet patterns as components, and six recipes as documentation.** A recipe is an ordered list of sheet patterns written in this file, not a file on disk. Nothing forks, hybrid composition is the default rather than an exception, and a fix to a sheet pattern reaches every deck that ever used it.

---

## The two paths

Roughly thirty decks a year run for weekly meetings. An eight-step scoping protocol is correct for a kickoff deck built once a season and completely wrong for a Tuesday meeting. A system with one speed gets used for kickoff and abandoned by October.

**Fast path.** A recipe is selected, filled, and built. No slide inventory, no scoping session, no chat approval round. Variety comes from the recipe's built-in rotation, not from design work. Applies to BRIEFING, TRAINING, and STRATEGY.

**Full path.** The complete scoping protocol below. Applies to REVIEW, KICKOFF, and OUTREACH, and to anything external, judged, or built once a season.

The variety budget goes to the full path. Spending it where a deck runs once a year, and buying the weekly deck out of a recipe, is how both "visually staggering" and "every week" survive together.

**Nothing prevents a fast-path deck from adding a full-path sheet.** A recipe is a starting list, not a ceiling. Dropping a `FieldSheet` into a briefing is a normal edit, not an exception.

---

## Session prerequisites

`FRC_Design_System.md` must be in context before scoping begins. Both governing documents are also committed to `src/lib/design-system/docs/` in `frc-app`, so a Claude Code session reads them from HEAD rather than depending on an attachment arriving. Project knowledge holds the copy Alejandro maintains; a version ships to both in the same pass. It carries the token layer, the FIRST usage rules, and the component manifest. Scoping without it means naming components from memory, which is how an inventory ends up specifying something that does not exist.

**Harness reproducibility.** The `/_ds` specimen route must boot from a clean checkout. Any environment file, launch configuration, or port setting it needs is committed as a tracked example, and no auth gate stands in front of it. A harness that runs on one machine is not a verification mechanism, it is a personal convenience, and the first time someone else needs to check a component they will skip the check instead.

**Staleness check.** `src/lib/design-system/_ds_manifest.json` at `frc-app` HEAD is the authority. Chat states the registry count from it at the start of a full-path session. The count is the exported registry, not a count of source files: one file exports several components, so a file count and the number Claude Design reports are different numbers, and only one of them moves when a batch adds child components to existing files.

Because the manifest is versioned in the repo, there is no separate digest to regenerate and no upload step that can silently go stale. If Claude Design reports a count that disagrees with HEAD, Claude Design is holding a cached bundle and needs to re-sync from GitHub, which is a different failure from a stale document and is fixed differently.

---

## Scope and routing

| Artifact | Tool | Why |
|---|---|---|
| Meeting, training, strategy, review deck | Claude Design | Layout is the product |
| Kickoff, outreach, sponsor, judge deck | Claude Design | Same |
| One-pager, poster, pit signage for screen | Claude Design | Same |
| Printed handout for a bench or binder | Print pipeline per `IDEA_PRINT_STANDARDS.md` | Ink and paper rules differ entirely |
| Anything in `frc-app` or `idea-app` | Claude Code | Lives in a repo |
| The design system itself: any token, component, or sheet pattern | Claude Code | Lives in `frc-app` |
| Anything stateful or persisting data | Claude Code | Not a layout problem |

---

## Recipes

A recipe names ground, audience default, sheet patterns in order, and the rotation that keeps repeated runs from looking identical. Chat pastes the recipe into the prompt's per-sheet spec and edits from there.

### BRIEFING (fast path)
Weekly meeting. Ground SQUADRON, audience internal, 8 sheets.

`CoverSheet` · `AgendaSheet` · `SubteamStatusSheet` (one per active subteam) · `BlockerSheet` · `TargetsSheet` · `ScheduleSheet` · `SafetySheet` · `ClosingSheet`

Rotation: the cover cycles through four SQUADRON ambient layers by week number, and the agenda alternates between a numbered rail and a `JumpGrid` hub. Both are built into the recipe so the variety costs nothing per week.

### TRAINING (fast path)
Skills and certification session. Ground SQUADRON, audience internal, 10 to 14 sheets.

`CoverSheet` · `AgendaSheet` · `SafetySheet` · `SectionSheet` · `ProcedureSheet` (repeats) · `SplitSheet` (repeats) · `PartCallout` sheets as needed · `ComparisonSheet` · `ClosingSheet`

The safety sheet is second, not buried. Any training touching shop equipment carries it before the first procedure.

### STRATEGY (fast path)
Match strategy and scouting review. Ground FIELD, audience internal, 8 to 12 sheets.

`CoverSheet` · `SeasonSheet` · `FieldSheet` · `MatchBreakdownSheet` · `ScoutingSheet` · `DataSheet` · `ComparisonSheet` · `TargetsSheet` · `ClosingSheet`

The only recipe where `AllianceSplit` and the alliance colors are legal.

### REVIEW (full path)
Design review and technical review. Ground FIELD, audience internal, 9 to 12 sheets.

`CoverSheet` · `AgendaSheet` · `SectionSheet` · `CalloutDrawing` sheets · `DataSheet` · `ComparisonSheet` · `ScheduleSheet` · `BlockerSheet` · `StatementSheet` · `ClosingSheet`

Drawing-office plain. Tighter chrome, glow only on hero numerals, `HudFrame` on data sheets only.

### KICKOFF (full path, variety budget)
Season kickoff and game analysis. Ground FIELD with SQUADRON bookends, audience external, 14 to 18 sheets.

`CoverSheet` (external) · `SeasonSheet` · `SectionSheet` · `FieldSheet` · `MatchBreakdownSheet` · `GallerySheet` · `ComparisonSheet` · `DataSheet` · `ScheduleSheet` · `RosterSheet` · `TargetsSheet` · `StatementSheet` · `SponsorSheet` · `ClosingSheet` (external)

The deck that most justifies a hybrid ground: SQUADRON identity bookends around a FIELD content body.

### OUTREACH (full path, variety budget)
Sponsor, judge, parent night, recruitment, awards. Ground SQUADRON, audience external, 12 to 16 sheets.

`CoverSheet` (external) · `StatementSheet` · `SectionSheet` · `TimelineSheet` · `GallerySheet` · `RosterSheet` · `DataSheet` · `AwardSheet` · `QuoteSheet` · `SponsorSheet` · `ClosingSheet` (external)

Every FIRST usage rule is mandatory here rather than advisory. This is the deck a judge reads.

---

## The scoping protocol (full path)

No prompt is written until every step is answered. Where a reasonable default exists, chat proposes it with a one-line rationale rather than asking. Genuine forks are asked as tappable multiple choice, one question per fork, three questions maximum per turn.

### Step 1. Purpose and room
What the artifact does in one sentence. Where it runs: projected in the shop bay, handed off as PDF, shown on a laptop to a judge. Who operates it. **If anyone other than Alejandro may run it, the mentor constraint applies:** nothing may depend on undocumented knowledge of how the artifact behaves. Whether it must survive printing or export, which decides whether hidden-by-default content is legal at all. It usually is not.

### Step 2. Content spine
Parts named, with sheet ranges. Whether the deck can be entered mid-stream; if yes, a hub and persistent orientation chrome are required. Whether pacing is predictable; if not, every part boundary is a legal stopping point. Which sheets carry speaker notes, in `data-speaker-notes` on the section. Which blocks of copy are expected to change after the build, since everything on that list needs a canvas-editable home.

### Step 3. Sheet inventory
**The step that prevents hand-rolled sheets.** Every sheet gets a row before anything is built.

| # | Purpose | Sheet pattern | Components inside | Transition | Entrances | Image slots | Build states | Interrogable |
|---|---|---|---|---|---|---|---|---|

A sheet with nothing in column three is a sheet that will be hand-built.

The Interrogable column marks sheets carrying click targets. It matters operationally: a clicker cannot drive them, so those are the sheets you walk to the screen for.

Chat proposes the full table. Alejandro edits it. The approved table goes into the prompt verbatim.

### Step 4. Ground and audience plan
Ground per part, not only per deck. Audience per section where it differs from the root. Which parts use `.frc-ground-paper`, since value contrast breaks monotony harder than any other move and is chronically under-used.

### Step 5. Motion plan
One transition per non-build sheet from the four that exist. Entrance budget per sheet, default maximum six. Ambient texture maximum one per sheet and not on every sheet. Stagger via `frc-d1` through `frc-d8` only.

### Step 6. Reveal and interaction plan
Pacing: which sheets need stepped delivery and how many build states each gets. Interrogation: which sheets carry click targets, what each emphasizes, what the base state shows.

### Step 7. Image plan
Every slot listed with id, subject, source, treatment, frame variant, and placeholder text. Sheets carrying **no** visual aid are listed here too, each with a one-line reason. Slot ids follow `s{sheet}-{subject}`. Placeholder text is photography direction, not a label.

### Step 8. Confirm and lock
Chat restates every decision compactly. Alejandro confirms. Only then is the prompt written.

---

## The prompt skeleton

Six sections in this order. One, two, and six are near-verbatim boilerplate.

### 1. Routing header

```
Use the FRC Team 5669 Design System. Start from a blank deck; this system has
no template, by design.

Set on the deck root, explicitly. None of these are inherited from anywhere:
  Aspect: 4:3, 1920 x 1440. The platform default is 16:9 and is wrong here.
  Ground class: .frc-ground-squadron
  Audience class: .frc-audience-internal
  .frc-letterbox, which declares the deck owns the viewport
  Mount DeckStage once, so canvas and letterbox paint from the active ground.

Output: a single .dc.html deck.
```

The routing header is the only thing carrying aspect, ground, and audience. A repo authored design system cannot contribute a template, so a deck that does not state these does not get them, and the failure is quiet: a 16:9 deck with no audience class renders correctly and is simply the wrong artifact.

### 2. Inheritance block

Pasted verbatim. Never paraphrased.

```
INHERITANCE, NON-NEGOTIABLE

Use the design system's own components and motion library. Do not
reimplement anything the system already ships.

Sheets: every sheet uses a pattern from the sheets/ group. Read the
matching sheets/<Name>.prompt.md before using one. A sheet built out of
raw markup instead of a pattern is a defect. If a named pattern does not
fit, stop and say so rather than substituting a hand-built equivalent.

Components: use the components named per sheet below. Read the matching
components/<group>/<Name>.prompt.md before using one.

Motion: use only classes defined in the FRC motion tokens.
  Slide transitions: frc-slide-shutter | frc-slide-boot |
    frc-slide-banner | frc-slide-cut
  Element entrances: frc-in-rise | drop | left | right | fade | blur |
    tracking | stamp | zoom | strike | flicker
  Image reveals: frc-img-wipe | wipe-down | iris | chamfer | zoom | kenburns
  Ambient texture layers, static, stacked as
    <div class="frc-ambient frc-ambient-NAME">:
    SQUADRON: patch | stencil | chevron | stars | rivet | bloom
    FIELD: extrusion | tread | hazard | matrix | fieldgrid | bracket | bloom
    PAPER: grid | hatch | foldline
  Ambient loops, animation: frc-bg-pan | scanlines | pulse | drift | shimmer
  Stagger: frc-d1 through frc-d8

The two ambient systems are separate and not interchangeable. The static
layers are what a sheet's atmosphere is built from; the loops animate a
layer that is already there.

Do not define custom animation classes. Do not define custom keyframes.
Do not create a parallel motion vocabulary under any prefix.

Colors: tokens only. Never invent a color, never hardcode a hex that is
not already a token value.

Gold is never body copy. Gold is illegal on the paper ground; that scope
carries bronze ink instead.

Alliance red and alliance blue appear only inside AllianceSplit,
ScoutTable, MatchBreakdownSheet, and FieldDiagram, and only on the FIELD
ground. They are never decoration. LIVE and REC are a gold dot.

FIRST marks are used as supplied. Never recolored, rotated, skewed,
cropped, bordered, or combined with added text. Never on a busy
background: ambient layers are clipped out of the footer logo zone.
FIRST in text is always all caps and italic with a superscript registered
symbol on first use. Use the FirstName component; do not type it by hand.

Images: every image slot carries exactly one of the three treatments named
per slot below, ImageFrame, ImageFrame with bleed, or Cutout. Never
hand-roll a filter, tint, gradient, mask, or scanline composite over an
image slot. Sponsor logos are Cutout with ground="none". QR codes are the
one exemption and are named as such in the slot plan.

Copy: running copy goes in element children or a component's child slot.
Do not move copy into a component prop or into the data-props script block
unless that block is listed as locked copy in Declared Exceptions.
```

### 3. Global chrome spec
Footer content, sheet numbering, hub behavior, progress rail, speaker notes policy, which sections override the deck ground or audience.

### 4. Per-sheet spec
The approved Step 3 table, one row per sheet, plus body copy per sheet.

### 5. Declared exceptions
Every deviation from the inheritance block, named in advance with a one-line reason:

```
EXCEPTION: Sheet 11 sponsor tier rule.
No sheet pattern covers a four-tier sponsor grid with per-tier sizing.
Hand-built on SponsorWall, hairline rule between tiers, 4px radius.
```

Undeclared hand-rolling is a defect and goes back for rebuild.

### 6. Prohibitions

```
Do not add sheets not in the spec.
Do not add motion not in the spec.
Do not substitute a hand-built element for a named sheet pattern or component.
Do not change the aspect ratio.
Do not use alliance red or blue outside the four named components.
Do not use a red for status. Warning is copper, error is rust, LIVE is gold.
Do not recolor, rotate, crop, or add anything to a FIRST mark.
```

---

## Inheritance rules

**Strong default with declared exceptions.** Hand-building something the system already ships is a defect when it was not declared in advance and acceptable when it was.

The failure mode this addresses is not "the pattern did not fit." It is "the pattern was never considered." Requiring the exception in the prompt forces that consideration to happen at scoping time.

Chrome discipline:

- `HudFrame` on data and telemetry sheets only, never as general decoration.
- Glow on hero type and hero numerals only. Never body copy, never every heading, never on paper.
- Stats sit under a hairline rule, not inside bevelled boxes.
- One ambient texture per sheet maximum.
- Radii stay small: 2px chips and badges, 3px buttons and inputs, 4px cards and panels.
- Deck chrome never shows a neutral white.

---

## Pre-delivery audit

Run against every output before it is called finished. **The audit is a separate chat pass against the exported bundle.** The session that built the artifact does not audit it, because the same reading that produced the mistake produces the check.

**Structure**
1. Every sheet uses a `sheets/` pattern. Zero sheets built from raw markup.
2. `frc-slide-*` occurrences equal the number of non-build sheets.
3. Aspect ratio matches the routing header.
4. Sheet count matches the spec. No sheets added.
5. Footer numbers logical sheets, not physical ones.
6. Build sheets carry no transition class and no stale entrance classes on carried-over elements.
7. Component usage matches the Step 3 table; every deviation appears in Declared Exceptions.

**Motion**
8. `frc-in-*` present, within the per-sheet entrance budget.
9. `frc-img-*` present on every image slot the plan called for.
10. `frc-d1` through `frc-d8` present wherever the plan called for stagger.
11. Ambient layer count does not exceed one per sheet, and ambient is not on every sheet.
12. Zero custom animation classes. Zero custom keyframes. Grep for any repeated non-`frc-` class prefix.

**Color**
13. Every `var(--token)` resolves. No hardcoded hex outside token values.
14. Gold appears on no body copy anywhere.
15. Gold appears nowhere inside a `.frc-ground-paper` scope.
16. Alliance red and blue appear only inside the four named components, only on FIELD.
17. No red is used for status. LIVE and REC render gold.
18. Ground class matches the plan per part; every scope declares its complete alias set as literals.

**FIRST compliance**
19. No FIRST mark is recolored, rotated, skewed, cropped, bordered, or carries added text.
20. No FIRST wordmark or icon element stands alone without a complete logo nearby.
21. Every occurrence of the FIRST name is all caps and italic, with a superscript registered symbol on first use in both heading and body, and is never plural or possessive.
22. Team number 5669 appears on every sheet carrying a FIRST mark.
23. No ambient layer runs behind the footer logo zone.
24. On an external deck: `ProgramLockup` on the cover, FIRST logo zone in the footer rail, sponsor rail on the closing sheet.

**Images**
25. Every image slot carries its planned treatment. `ImageFrame` plus `Cutout` wrappers plus declared QR exemptions equals slot count.
26. No alpha-carrying image sits inside `ImageFrame`. Every cutout uses `fit="contain"` and carries no hand-rolled filter chain.
27. No `bleed` on a screenshot slot.
28. Sponsor logos use `Cutout` with `ground="none"`.
29. QR slots render bare at full contrast and appear in the plan as exemptions.
30. Visual aid density meets the two-thirds floor; every text-only sheet appears in the Step 7 plan with its reason.
31. Rendered against every ground the deck actually uses. A slot verified only on SQUADRON is not verified.

**Interaction**
32. No element is hidden in its base state. Click targets change emphasis only.
33. Every interrogable sheet appears in the Step 3 inventory's Interrogable column.
34. Click targets are visibly affordant at projection scale.
35. Sheet state resets on re-entry.

**Copy**
36. No running copy sits in a component prop or `data-props` unless declared as locked copy.

**Output**
37. Print or PDF export shows all content, including every build state.
38. Text fits at 4:3 without overflow or forced shrinking.

**Deck root**
43. The deck root carries the aspect from the routing header, a ground class, an audience class, and `.frc-letterbox`, and `DeckStage` is mounted. All five come from the prompt and none are inherited, so all five are checked as present rather than as matching a plan. A generated deck defaults to 16:9 with no audience class, which renders perfectly well and is the wrong artifact.

`.frc-letterbox` is the one `DeckStage` cannot guard on, because its absence is legal: it declares that the deck owns the viewport, and an embedded deck correctly lacks it so it does not repaint its host page. A full-viewport deck missing it gets no canvas painting and flashes white on transition, which is the failure the stage exists to prevent, so the audit is the only thing standing between that and a shipped deck.

**Guards and visual verification**
40. Zero invariant guard fault markers anywhere in the deck. A marker is a caught defect, not an accepted state.
41. **Someone looked at it.** Every sheet was viewed as a rendered image, on every ground the deck uses. DOM measurement is not visual verification: it confirms that an alias resolved, never that a sheet reads well, that two elements are not colliding, or that a layout is worth projecting. An audit run entirely on computed styles states so explicitly and is incomplete until this check is satisfied.

Automated capture settles first: finite animations are run to completion and infinite ambient loops parked at frame 0 before the frame is taken. A capture that fires on load photographs sheets mid-transition, and a wipe still crossing the frame looks enough like a design decision to be reviewed and approved.
42. Reduced motion checked by actually setting the preference, not only by measuring gate coverage and base state. Gate coverage proves the rule was applied; it does not prove the result is legible.

**Facts**
39. Every date, match number, team number, part number, dollar figure, sponsor name, award name, and proper name is checked against a source before delivery. Any projected figure is labeled projected on the sheet itself, not only in the notes.

---

## Live evolution

### Loop A: pattern and component promotion

**Trigger.** Every declared exception in a shipped prompt is logged as a promotion candidate. An exception is a written admission the system lacked something.

**Criterion.** Promote on the second use, or on the first if the element is obviously generic. One-off elements genuinely specific to a single deck stay hand-built. Promoting them inflates the library, which makes it harder to search, which causes hand-building. The failure mode is symmetric with under-promotion.

**Process.** Chat writes the promotion spec, then delivers it as a Claude Code prompt with a `MODEL | EFFORT` routing header. CC authors the `.jsx`, `.d.ts`, and `.prompt.md` in `src/lib/design-system/components/<group>/`, updates the group demo card, `_ds_manifest.json`, and the specimen route, then commits and pushes directly to main. Claude Design re-syncs from GitHub. The retired exception is then removed from the prompt template and from any deck spec that carried it. That last step is what closes the loop: a promoted pattern that prompts keep declaring an exception against was not actually promoted.

**A component is never edited on the Claude Design canvas.** The canvas edits deck copy. The repo owns the components. An edit made on the canvas to something that lives in `frc-app` is lost on the next re-sync, and worse, it is lost silently.

**Sheet patterns promote before components do.** If two decks hand-build the same sheet arrangement, the answer is a new sheet pattern, not three new components.

### Loop B: standards correction

**Trigger.** Any output that misses.

| Case | Fix |
|---|---|
| Rule was missing | Add it |
| Rule was ambiguous | Sharpen it, keep it in one place |
| Rule was wrong | Correct it, note the reversal in the changelog |
| Rule existed and was not followed | **Change nothing in the doc.** Add a check to the audit |

The fourth row carries the weight. Restating an existing rule louder does not make it more likely to be followed, and doing it repeatedly turns a standard into something too long to read, which produces exactly the failure it was written to prevent. A compliance failure is an audit gap, not a documentation gap.

**Timing.** The correction ships in the same turn as the miss, as a complete updated file. Never a patch list.

**Scope.** The correction lands in the one document that owns the rule. Brand, tokens, and components belong in `FRC_Design_System.md`. Scoping and prompting belong here. Duplicating a rule across documents guarantees they drift.

---

## Artifact types beyond decks

| Artifact | Starting point | Motion activation | Notes |
|---|---|---|---|
| Deck | `templates/Deck.dc.html` | `[data-deck-active]` | Full transition set |
| One-pager, poster, pit signage | Static HTML | `.frc-run` container | No slide transitions. Entrances and ambient only |
| Printed handout | Print pipeline | none | Paper ground, print rules |

For any non-deck artifact, motion runs inside a `.frc-run` container and the four slide transitions do not apply. Element entrances, image reveals, ambient loops, and stagger work identically.

---

## Changelog

- **1.6 (2026-08-23)** - Gave `.frc-letterbox` its own bullet in the routing header. It was
  named only in prose under the DeckStage bullet while check 43 counts it as a fifth
  independent item, so the header and the check disagreed on what a deck must carry.
- **1.5 (2026-08-23)** - Added `.frc-letterbox` to check 43. `DeckStage` scopes document
  canvas painting behind it so an embedded deck does not repaint its host page, which is
  correct and makes it a fourth required root class that nothing can guard: its absence is
  legal for an embedded deck, so a full-viewport deck missing it silently gets no canvas
  painting and flashes white. Also recorded that both governing documents are committed to
  `src/lib/design-system/docs/`, after a Claude Code session built `DeckStage` without them
  because an attachment did not arrive. A repo file at HEAD cannot fail to arrive, which is
  the same argument that put the system in a repo to begin with.
- **1.4 (2026-08-23)** - Rewrote the routing header and added check 43. A repo authored
  design system cannot contribute a template, so "start from Deck.dc.html" named a mechanism
  that does not exist, and the header is now the only thing carrying aspect, ground, and
  audience. The verification deck came back 16:9 with zero audience class occurrences, which
  is the failure mode worth naming: it renders perfectly well and is simply the wrong
  artifact, so check 43 tests for presence rather than for matching a plan.
- **1.3 (2026-08-22)** - Amended check 41 to require automated capture to settle animations
  before shooting, running finite ones to completion and parking infinite ambient loops at
  frame 0. The first capture run photographed sheets mid-transition, and a wipe still
  crossing the frame looks enough like a design decision to be reviewed and approved, which
  would have made the visual audit worse than no audit.
- **1.2 (2026-08-22)** - Added audit checks 40 through 42 and a harness reproducibility
  prerequisite, all from gaps the three build passes exposed rather than from any rule being
  broken. Check 41 is the significant one: the build verified itself almost entirely by DOM
  measurement, which confirms an alias resolved but never that a sheet reads well, that two
  elements are not colliding, or that a layout is worth projecting, and a system whose whole
  brief is visual cannot be signed off on computed styles. Check 40 pairs with the new
  Invariant guards section in `FRC_Design_System.md`, which moves guards from throwing at run
  time to rendering a visible fault marker, so the audit is where a guard actually does its
  job. Check 42 closes the reduced-motion gap left open in pass 1.
- **1.1 (2026-08-22)** - Authoring moved from Claude Design to Claude Code, with the
  system living in `frc-app` at `src/lib/design-system/` and Claude Design sourcing it
  from GitHub. The reason is that Claude Design's output format is React either way, so
  authoring in React removes a translation step, and `frc-app` is React, which means the
  deck components and the app components can be one set. IDEA could not do this because
  `idea-app` is SvelteKit, so its 56 components were re-authored from a description and
  have drifted since. Three sections corrected to match: the staleness check now reads
  `_ds_manifest.json` at HEAD rather than a stated header count, which removes the digest
  regeneration and upload step entirely; Loop A promotion is now a CC prompt and a commit
  rather than a Claude Design task, with the added rule that a component is never edited
  on the canvas because that edit is lost silently on re-sync; and the routing table now
  sends design system changes themselves to Claude Code.
- **1.0 (2026-08-22)** - Initial standard. Establishes the sheet inventory as a required full-path scoping step, the verbatim inheritance block, the FIRST compliance checks as audit items rather than presenter memory, build sheets as the presenter-control mechanism, and 4:3 as the default. Departs from `IDEA_CLAUDE_DESIGN_STANDARDS.md` in two places. First, templates are replaced by one shell plus twenty-six sheet patterns as components plus six recipes as documentation, because a template is a copied file that forks on first use and receives no later fix; IDEA's four are already drifting from the components they were built on. Second, a two-path protocol, because a single eight-step protocol against a thirty-deck-a-year cadence gets abandoned, so the fast path buys weekly decks out of a recipe and the variety budget is spent on the six-a-year decks that justify it.
