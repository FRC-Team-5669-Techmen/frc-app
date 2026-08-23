# Select

`forms/Select` - classes `frc-control`, `frc-select` - namespace FRC5669DesignSystem

A choice control.

## Copy

- `slot="label"`, `slot="hint"`, and ordinary `<option>` children - so the choices stay editable copy.

## Rules

- The caret is the mono geometric glyph, never an icon file and never an emoji.
- For the subteam list, map `SUBTEAMS` rather than typing the options: one vocabulary, no drift.
- `invalid` behaves as it does on `Input`.

## Example

```jsx
<Select defaultValue="Mechanical">
  <span slot="label">Subteam</span>
  {SUBTEAMS.map((s) => <option key={s}>{s}</option>)}
</Select>
```
