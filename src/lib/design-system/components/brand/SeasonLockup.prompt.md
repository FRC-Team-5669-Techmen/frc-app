# SeasonLockup

`brand/SeasonLockup` · class `frc-season-lockup` · namespace FRC5669DesignSystem

Season artwork slot + season name (display face, hero color) + season years (mono, `2026-27`) over a short rule in `--season`. **Setting `--season` on the deck root and dropping artwork into this slot is the entire annual reskin.** Nothing else changes when the season does.

## Copy

- **The season name is the child**: `<SeasonLockup years="2026-27">Biocore</SeasonLockup>`.
- `years` is fixed chrome; render `2026-27`, never `2026/2027`.

## Asset

`assets/season/season-lockup.png` is **wired**: the FRC 2027 season logo, BIOCORE presented by Haas, taken byte-for-byte from the FIRST season brand downloads page. It is FIRST artwork — used as supplied, never recolored, rotated, skewed, cropped, bordered, or combined with added text. The slot is `object-fit: contain`, so the 240×240 default letterboxes the 1730×1230 artwork to 240×171 rather than distorting it; widen `artWidth`/`artHeight` to give it more room. The artwork carries its own filled plates, so it needs no reverse variant and reads on all three grounds. Replace this one file each January.

## Ground behaviour

`--season` is unset-to-gold by default. On paper the rule falls back to the bronze accent because gold is illegal there; the name uses `--fg-hero`, so it is already bronze.

## Example

```jsx
<div className="frc-deck frc-ground-squadron" style={{ '--season': 'var(--program-fll-explore)' }}>
  <SeasonLockup years="2026-27">Bioglow</SeasonLockup>
</div>
```
