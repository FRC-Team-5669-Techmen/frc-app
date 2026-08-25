# SafetyNote

`surfaces/SafetyNote` - class `frc-safety` - namespace FRC5669DesignSystem

The copper shop-hazard note: hazard band, 2px copper frame, mono heading.

## Copy

- Optional `slot="title"` (defaults to **Safety**), `slot="rule"` repeated for the list, `slot="ppe"` repeated for the equipment chips. Everything else is the body.

## Rules

- **It is its own component, not a Callout variant.** Someone scanning a training deck to answer "did this session cover safety" has to be able to answer from the thumbnail rail; a tone prop does not survive that scan.
- There is no quiet variant and the band is not optional.
- Copper (`--warn`) is the hazard color everywhere in the system: shop hazard, safety note, approaching deadline.

## Example

```jsx
<SafetyNote>
  <p>The mill is a two-person tool.</p>
  <li slot="rule">Stock clamped before the spindle turns.</li>
  <Chip slot="ppe">Eye protection</Chip>
</SafetyNote>
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
