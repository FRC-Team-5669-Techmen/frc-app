# FocusTable / FocusRow

`data/FocusTable` - classes `frc-focus`, `frc-focus-row` - namespace FRC5669DesignSystem

A ranked list where clicking a row dims its siblings.

## Copy

- Rows are child components; inside: `slot="rank"`, `slot="label"`, `slot="value"`.

## Rules

- **Click targets may change emphasis. They may never reveal content.** Every row is fully rendered at rest, so the print, the PDF and the reduced-motion render lose nothing, and nobody has to know an unmarked row is clickable.
- A hidden answer that should appear on cue is a **build slide**, not a click target.
- Give each row a stable `id` when the deck needs a row focused at rest (`defaultActive`).

## Example

```jsx
<FocusTable defaultActive="a">
  <FocusRow id="a"><span slot="rank">01</span><span slot="label">5669 Techmen</span><span slot="value">2.41</span></FocusRow>
  <FocusRow id="b"><span slot="rank">02</span><span slot="label">1671 Buchanan</span><span slot="value">2.28</span></FocusRow>
</FocusTable>
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
