# ScoutingSheet

`sheets/ScoutingSheet` - class `frc-sheet-scouting` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

What the scouts saw.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`; the child is the `ScoutTable`.

## Rules

- Clicking a row dims its siblings and reveals nothing, so the sheet is complete on paper and in a PDF.
- The aside is the `FocusTable` of pick order, the readout stack, or the `Callout` that says what the room should DO with the numbers.
- Alliance colors here belong to `ScoutTable` and resolve only on FIELD, which is where a scouting sheet lives anyway.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<ScoutingSheet label="Alliance selection">
  <span slot="title">Who we want</span>
  <ScoutTable>...</ScoutTable>
  <FocusTable slot="aside">...</FocusTable>
</ScoutingSheet>
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
