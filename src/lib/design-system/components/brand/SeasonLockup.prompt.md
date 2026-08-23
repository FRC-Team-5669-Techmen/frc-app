# SeasonLockup

`brand/SeasonLockup` · class `frc-season-lockup` · namespace FRC5669DesignSystem

Season artwork slot + season name (display face, hero color) + season years (mono, `2026-27`) over a short rule in `--season`. **Setting `--season` on the deck root and dropping artwork into this slot is the entire annual reskin.** Nothing else changes when the season does.

## Copy

- **The season name is the child**: `<SeasonLockup years="2026-27">Biocore</SeasonLockup>`.
- `years` is fixed chrome; render `2026-27`, never `2026/2027`.

## Asset

Expects `assets/season/season-lockup.png` (team-supplied each January). Empty 240×240 slot until supplied.

## Ground behaviour

`--season` is unset-to-gold by default. On paper the rule falls back to the bronze accent because gold is illegal there; the name uses `--fg-hero`, so it is already bronze.

## Example

```jsx
<div className="frc-deck frc-ground-squadron" style={{ '--season': 'var(--program-fll-explore)' }}>
  <SeasonLockup years="2026-27">Bioglow</SeasonLockup>
</div>
```
