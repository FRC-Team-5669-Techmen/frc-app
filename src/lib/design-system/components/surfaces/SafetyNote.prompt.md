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
