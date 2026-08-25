# StatementSheet

`sheets/StatementSheet` - class `frc-sheet-statement` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

One thing, said once.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="attribution"`.

## Rules

- The only sheet that may run display type with nothing to support it, so the room reads the sentence instead of skimming a layout.
- One sentence. Two sentences is a `SplitSheet`.
- `StencilTitle` carries the hero color and the rationed glow; on paper both flatten by alias, so there is no print variant.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<StatementSheet label="Standing order">
  <span slot="eyebrow">Standing order</span>
  <span slot="title">Nobody runs a machine alone.</span>
  <span slot="attribution">Shop rule one, every season since 2019</span>
</StatementSheet>
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
