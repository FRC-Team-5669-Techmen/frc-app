# TeamWordmark

`core/TeamWordmark` · class `frc-wordmark` · namespace FRC5669DesignSystem

The typeset `TECHMEN · 5669` for text contexts: display face for the name, mono bold gold numeral for the number. **It is not the logotype.** The published `Type-*.svg` is the mark and is used as supplied; this is type, for running chrome, title cards and anywhere an SVG mark would be wrong.

## Copy

Fixed chrome: the team name and number. No children. `number={false}` drops the numeral.

## Rules

- Never restyle it into a fake logotype (no wings, no ring, no outline).
- Gold on the numeral is hero-numeral use and is legal; on paper it resolves to bronze ink.

## Example

```jsx
<TeamWordmark />
<TeamWordmark number={false} size={64} />
```
