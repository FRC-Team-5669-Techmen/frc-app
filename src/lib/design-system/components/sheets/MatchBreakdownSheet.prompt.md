# MatchBreakdownSheet

`sheets/MatchBreakdownSheet` - class `frc-sheet-match` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

One match, taken apart.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="score"` (an `AllianceSplit`), `slot="clock"` (a `MatchClock`), `slot="red"`, `slot="blue"`; the child is the scouting table or the notes.

## Rules

- **The fourth and last place alliance red and blue are legal**, after `AllianceSplit`, `ScoutTable` and `FieldDiagram`. They are alliance DATA, never decoration, and they resolve **only inside `.frc-ground-field`**; on SQUADRON or paper the panels fall back to structure tones and the RED / BLUE words carry the meaning. That scoping lives in `tokens/data.css`, so this sheet never names a ground.
- `MatchClock` renders a time and never runs one. At zero it uses rust, never alliance red - on this sheet of all sheets.
- Win and loss are `--ok` and `--fault`, never an alliance color: borrowing one makes a red alliance win look like a loss on the same sheet.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<MatchBreakdownSheet label="Qual 42">
  <span slot="title">Where the match was won</span>
  <AllianceSplit slot="score" outcome="red">...</AllianceSplit>
  <MatchClock slot="clock" phase="teleop" remaining={0} />
  <SpecTable slot="red">...</SpecTable>
  <SpecTable slot="blue">...</SpecTable>
</MatchBreakdownSheet>
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
