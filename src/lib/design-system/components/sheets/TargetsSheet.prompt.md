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
