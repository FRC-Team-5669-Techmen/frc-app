# StatBlock

`data/StatBlock` - class `frc-stat` - namespace FRC5669DesignSystem

One number said loudly. Tones: `default`, `hero`, `ok`, `warn`, `fault`. `size="sm"` drops it to sub scale.

## Copy

- `slot="value"`, `slot="unit"`, `slot="label"`, `slot="note"` - all children.

## Rules

- Numerals are hero material: display face, tabular figures, tight tracking.
- **Glow is rationed** to `tone="hero"`, and it is zero on paper by alias, so a light sheet needs no variant.
- One hero stat per sheet. Three heroes is no heroes.

## Example

```jsx
<StatBlock tone="hero">
  <span slot="value">412</span><span slot="unit">hrs</span>
  <span slot="label">Shop hours this season</span>
</StatBlock>
```
