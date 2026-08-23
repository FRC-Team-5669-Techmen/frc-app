# SpecTable / SpecRow

`data/SpecTable` - classes `frc-spec`, `frc-spec-row` - namespace FRC5669DesignSystem

The spec sheet: label left, measured value right, hairline between. `emphasis` puts one value in hero color.

## Copy

- **Rows are child components.** Inside a row: `slot="label"`, `slot="value"`, optional `slot="note"` on its own line. Optional `slot="caption"` on the table.

## Rules

- Values are mono with tabular numerals so a column reads as a column.
- At most one `emphasis` row per table.
- A spec table counts toward the density floor: two thirds of sheets carry a visual aid.

## Example

```jsx
<SpecTable>
  <span slot="caption">Drivetrain, as built</span>
  <SpecRow><span slot="label">Free speed</span><span slot="value">16.4 ft/s</span></SpecRow>
  <SpecRow emphasis><span slot="label">Wheel</span><span slot="value">4 in colson</span></SpecRow>
</SpecTable>
```
