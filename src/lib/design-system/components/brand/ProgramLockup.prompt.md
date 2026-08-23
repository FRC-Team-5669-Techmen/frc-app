# ProgramLockup

`brand/ProgramLockup` · class `frc-program-lockup` · namespace FRC5669DesignSystem

The program logo (FIRST Robotics Competition by default; `ftc`, `fll`) as supplied — full-color reverse on dark grounds — over a 4px `--program` rail and the team identification permitted use requires (`TEAM 5669`). External covers carry one.

## Asset

Expects `assets/first/FRC-Icon-Horizontal-Reverse.png` / `-Vertical-` (and FTC / FLL equivalents). Empty slot until supplied, at the published minimums: 60px tall horizontal, 120px tall vertical. Never drawn, never recolored.

## Props (no copy)

- `program`: `frc` | `ftc` | `fll` — sets `--program` on the lockup (Process Blue, FTC orange, FLL red). `--program` colors the rail only; it never colors content.
- `orientation`: `horizontal` | `vertical`. `src` override.

## Rules

- Team gold and FIRST blue are separated by zone, never blended. The lockup lives in the cover lockup and the footer rail, not in content.
- The wordmark or icon alone may never be the only representation of the FIRST logo nearby; this lockup is the complete logo.

## Example

```jsx
<ProgramLockup program="frc" />
```
