# FieldDiagram

`surfaces/FieldDiagram` - class `frc-field-diagram` - namespace FRC5669DesignSystem

The field from above, with zones a strategy conversation can point at.

## Copy

- `slot="zone"` per zone, each with `data-zone` matching a zone id, and `slot="key"` legend entries.

## Locked (props, not canvas copy)

- **`zones` stays an array.** A polygon is structure: nobody reads a point list aloud, and splitting one into children moves the endpoints further apart rather than closer to the canvas. Each zone is `{ id, points, alliance?, at: [x, y] }`, where `at` positions the label as a percentage of the media box.

## Rules

- **The third and last component allowed `--alliance-red` / `--alliance-blue`** (with `AllianceSplit` and `ScoutTable`), and only inside `.frc-ground-field`. Elsewhere zones fall back to structure tones and the legend words say which side is which.
- Clicking a zone raises it and dims the others. Nothing appears that was not already drawn.

## Example

```jsx
<FieldDiagram zones={ZONES} viewBox="0 0 1600 800" grid={8}>
  <span slot="zone" data-zone="red-source">Red source</span>
  <span slot="key" className="frc-fd-key frc-fd-key-red">Red side</span>
</FieldDiagram>
```
