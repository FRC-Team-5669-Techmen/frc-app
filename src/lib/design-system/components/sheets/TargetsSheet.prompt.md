# TargetsSheet

`sheets/TargetsSheet` - class `frc-sheet-targets` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

What the team said it would hit, and where it actually is.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `Bar` children.

## Rules

- `max` and `target` are structural numbers on the sheet, so a target moves in one place and every bar re-reads against it.
- The aside is where the `BuildCountdown` goes. A target with no date attached to it is a wish.
- Bar tone is a judgement about the bar, not decoration.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<TargetsSheet max={120} target={90} label="Targets">
  <span slot="title">What we said we would hit</span>
  <Bar value={52} tone="warn"><span slot="label">Outreach hours</span><span slot="value">52 of 90</span></Bar>
  <BuildCountdown slot="aside" value={31}><span slot="label">To bag and tag</span></BuildCountdown>
</TargetsSheet>
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
