# ScoutingSheet

`sheets/ScoutingSheet` - class `frc-sheet-scouting` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

What the scouts saw.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`; the child is the `ScoutTable`.

## Rules

- Clicking a row dims its siblings and reveals nothing, so the sheet is complete on paper and in a PDF.
- The aside is the `FocusTable` of pick order, the readout stack, or the `Callout` that says what the room should DO with the numbers.
- Alliance colors here belong to `ScoutTable` and resolve only on FIELD, which is where a scouting sheet lives anyway.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<ScoutingSheet label="Alliance selection">
  <span slot="title">Who we want</span>
  <ScoutTable>...</ScoutTable>
  <FocusTable slot="aside">...</FocusTable>
</ScoutingSheet>
```
