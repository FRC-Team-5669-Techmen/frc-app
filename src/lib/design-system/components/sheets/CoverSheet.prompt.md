# CoverSheet

`sheets/CoverSheet` - class `frc-sheet-cover` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

The deck opens here: seal, one title, one line of what this is about. `banner` rather than `shutter`, because a cover is the opening statement of a deck rather than general content.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="subtitle"`, `slot="meta"`, `slot="attribution"`.

## Rules

- The **seal** goes on covers, closing sheets, and anything printed or worn. The footer rail is the logotype's zone, so the mark alone never appears here.
- **Audience chrome, not content:** on `.frc-audience-external` the cover adds a `ProgramLockup`. That switch is CSS on the deck root - the component takes no audience prop, and no deck has to remember it.
- 5669 appears twice on this sheet in external mode: in the footer rail and inside the program lockup. That is the team identification permitted use of a FIRST mark requires.
- **No dates in the title.** A date goes stale the moment a meeting moves.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<CoverSheet label="Cover" footer={{ deckName: 'Kickoff', sheet: 1, total: 18 }}>
  <span slot="eyebrow">Kickoff briefing</span>
  <span slot="title">Build season starts Saturday</span>
  <span slot="subtitle">What we are building, who is on what, and the three dates that do not move.</span>
</CoverSheet>
```

## The element you write is yours

Write any legal element for a slot. `<span slot="title">`, `<h2 slot="title">`
and `<p slot="title">` all render the same box — the component pins the display,
font and margin it needs on the class it paints, so the element carries only
semantics. Pick it for meaning (a heading, a link, an abbreviation), never to get
a layout.

This is a rule the system enforces, not a convention: `ds:audit` check 31 fails
if a slot's class has no `display` of its own. It exists because it used to be
false — `ResultBanner` printed "Quarterfinal 2RED ALLIANCE" and `QuoteBlock`
printed "SENIOR, CLASS OF 2026DRIVE COACH" when their slots were written as
adjacent inline spans, and `<h2 slot="title">` raised a DOM nesting error on
`SectionSheet` while working on `SafetySheet`.
