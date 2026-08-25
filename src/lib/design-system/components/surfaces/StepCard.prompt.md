# StepCard / Step

`surfaces/StepCard` - classes `frc-steps`, `frc-step` - namespace FRC5669DesignSystem

A numbered procedure. `StepCard` is the container; numbering is a CSS counter, so inserting a step renumbers the rest and no printed number goes stale. Step states: `default`, `done`, `current`.

## Copy

- Steps are child components; inside: `slot="title"`, `slot="text"`.

## Rules

- Procedure sheets are the ones a sophomore runs a session from: every step is visible at rest, and nothing waits for a click.
- Keep a card to five or six steps. Past that it is two sheets.

## Example

```jsx
<StepCard>
  <Step state="done"><span slot="title">Square the stock</span><span slot="text">Face one side, then the adjacent edge.</span></Step>
  <Step state="current"><span slot="title">Locate the datum</span><span slot="text">Edge find both walls, zero the readout.</span></Step>
</StepCard>
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
