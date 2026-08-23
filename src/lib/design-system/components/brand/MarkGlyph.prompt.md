# MarkGlyph

`brand/MarkGlyph` · class `frc-mark` · namespace FRC5669DesignSystem

The winged helmet alone — no ring, no lettering. Published in Gold, White and Black. **Use the mark alone only where the footer rail already carries the logotype on the same sheet.**

## Asset

Expects `assets/team/Mark-Gold.svg`, `Mark-White.svg`, `Mark-Black.svg`. Empty slot (floor 24px) until they land. Never drawn, never approximated.

## Props (no copy)

- `variant`: `gold` (default) | `white` | `black` | `auto`. **`auto` is the safe choice on a mixed deck**: the ground scope shows Gold on SQUADRON/FIELD and Black on paper, because gold on paper is illegal.
- `size` px, `src` override, `alt`.

## Example

```jsx
<MarkGlyph variant="auto" size={64} />
```
