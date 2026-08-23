# SeasonSheet

`sheets/SeasonSheet` - class `frc-sheet-season` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

The season, named and framed.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lockup"` (a `SeasonLockup`), `slot="stat"` repeated.

## Rules

- Setting `--season` on the deck root and dropping artwork into the lockup is **the entire annual reskin**. Nothing else in the system changes when the season does, which is the point of isolating it.
- Season years render `2026-27`, never `2026/2027`. Team numbers render bare.
- On paper the season rule falls back to the bronze accent, because the gold default is illegal there.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SeasonSheet label="Season">
  <span slot="title">2026-27</span>
  <SeasonLockup slot="lockup" years="2026-27">Biocore</SeasonLockup>
  <StatBlock slot="stat" tone="hero"><span slot="value">5669</span><span slot="label">Techmen</span></StatBlock>
</SeasonSheet>
```
