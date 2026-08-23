# Badge

`data/Badge` - class `frc-badge` - namespace FRC5669DesignSystem

A status on a colored pill. Tones: `default` (structure), `ok`, `warn`, `fault`, `accent`, `program`. `solid` fills the pill, `dot={false}` drops the state token.

## Copy

- **The status is the child**, and it is a WORD: `<Badge tone="ok">Certified</Badge>`. Never a bare colored dot, never an emoji. The word is what survives a projector, a grayscale print and a colorblind reader.

## Rules

- Status is a Badge. A tag is a `Chip`. A shop hazard is a `SafetyNote`, never a fault Badge.
- The circular state dot is the one exemption to the small-radius rule.
- `tone="program"` is program chrome (`--program`); it never marks team content.
- No red outside the partition: `fault` is rust, and alliance red is not available here.

## Example

```jsx
<Badge tone="warn">Awaiting sign-off</Badge>
<Badge tone="accent" solid>Live</Badge>
```
