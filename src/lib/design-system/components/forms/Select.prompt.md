# Select

`forms/Select` - classes `frc-control`, `frc-select` - namespace FRC5669DesignSystem

A choice control.

## Copy

- `slot="label"`, `slot="hint"`, and ordinary `<option>` children - so the choices stay editable copy.

## Rules

- The caret is the mono geometric glyph, never an icon file and never an emoji.
- For the subteam list, map `SUBTEAMS` rather than typing the options: one vocabulary, no drift.
- `invalid` behaves as it does on `Input`.

## Example

```jsx
<Select defaultValue="Mechanical">
  <span slot="label">Subteam</span>
  {SUBTEAMS.map((s) => <option key={s}>{s}</option>)}
</Select>
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
