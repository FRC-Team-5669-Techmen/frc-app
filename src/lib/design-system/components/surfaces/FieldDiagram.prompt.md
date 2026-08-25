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

## The element you write is yours

Write any legal element for a slot. `<span slot="title">`, `<h2 slot="title">`
and `<p slot="title">` all render the same box — the component pins the display,
font and margin it needs on the class it paints, so the element carries only
semantics. Pick it for meaning (a heading, a link, an abbreviation), never to get
a layout.

This is a rule the system enforces, not a convention: `ds:audit` check 31 fails
if a slot's class has no `display` of its own. It exists because it used to be
false — `ResultBanner` printed "Quarterfinal 2RED ALLIANCE" and `QuoteBlock`
printed "SENIOR, CLASS OF 2026DRIVE COACH" when their slots were written as
adjacent inline spans, and `<h2 slot="title">` raised a DOM nesting error on
`SectionSheet` while working on `SafetySheet`.
