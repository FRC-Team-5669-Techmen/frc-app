# Input

`forms/Input` - classes `frc-control`, `frc-input` - namespace FRC5669DesignSystem

A single-line control, or a textarea with `as="textarea"`. `mono` for codes and numbers, `size="lg"` for a control someone fills in from across a pit.

## Copy

- `slot="label"` and `slot="hint"`. The placeholder is short chrome and stays a prop.

## Rules

- 3px radius, recessed like every other well, never pill-round.
- `invalid` colors the border and the hint in rust and sets `aria-invalid`.
- A deck rarely collects typing; this exists so a pit checklist, a scouting mockup or a training worksheet looks like this system rather than like the browser.

## Example

```jsx
<Input mono placeholder="5669">
  <span slot="label">Team number</span>
  <span slot="hint">Digits only</span>
</Input>
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
