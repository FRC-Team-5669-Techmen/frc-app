# FocusTable / FocusRow

`data/FocusTable` - classes `frc-focus`, `frc-focus-row` - namespace FRC5669DesignSystem

A ranked list where clicking a row dims its siblings.

## Copy

- Rows are child components; inside: `slot="rank"`, `slot="label"`, `slot="value"`.

## Rules

- **Click targets may change emphasis. They may never reveal content.** Every row is fully rendered at rest, so the print, the PDF and the reduced-motion render lose nothing, and nobody has to know an unmarked row is clickable.
- A hidden answer that should appear on cue is a **build slide**, not a click target.
- Give each row a stable `id` when the deck needs a row focused at rest (`defaultActive`).

## Example

```jsx
<FocusTable defaultActive="a">
  <FocusRow id="a"><span slot="rank">01</span><span slot="label">5669 Techmen</span><span slot="value">2.41</span></FocusRow>
  <FocusRow id="b"><span slot="rank">02</span><span slot="label">1671 Buchanan</span><span slot="value">2.28</span></FocusRow>
</FocusTable>
```
