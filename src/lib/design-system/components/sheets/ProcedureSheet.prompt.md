# ProcedureSheet

`sheets/ProcedureSheet` - class `frc-sheet-procedure` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

How a job is done, in order. The training sheet a sophomore runs a session from.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `Step` children.

## Rules

- Every step is on the sheet at rest and nothing waits for a click. That is the mentor constraint, and it is load-bearing here.
- The aside is where the drawing, the tool list or a `Callout` goes.
- A procedure that involves a shop hazard belongs on a `SafetySheet`, which cannot be built without a `SafetyNote`.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<ProcedureSheet label="Squaring stock">
  <span slot="title">Squaring stock</span>
  <Step state="current"><span slot="title">Locate the datum</span><span slot="text">Edge find both walls, zero the readout.</span></Step>
  <Callout slot="aside" tone="warn"><span slot="title">Before you start</span><p className="frc-callout-text">Stock clamped, sleeves down.</p></Callout>
</ProcedureSheet>
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
