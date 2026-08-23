# Input

`forms/Input` - classes `frc-control`, `frc-input` - namespace FRC5669DesignSystem

A single-line control, or a textarea with `as="textarea"`. `mono` for codes and numbers, `size="lg"` for a control someone fills in from across a pit.

## Copy

- `slot="label"` and `slot="hint"`. The placeholder is short chrome and stays a prop.

## Rules

- 3px radius, recessed like every other well, never pill-round.
- `invalid` colors the border and the hint in rust and sets `aria-invalid`.
- A deck rarely collects typing; this exists so a pit checklist, a scouting mockup or a training worksheet looks like this system rather than like the browser.

## Example

```jsx
<Input mono placeholder="5669">
  <span slot="label">Team number</span>
  <span slot="hint">Digits only</span>
</Input>
```
