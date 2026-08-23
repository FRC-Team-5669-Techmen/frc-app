# JumpGrid / JumpCard

`surfaces/JumpGrid` - classes `frc-jumps`, `frc-jump` - namespace FRC5669DesignSystem

The hub sheet: one card per part of the deck. Part numbers come from position.

## Copy

- Cards are child components; inside: `slot="title"`, `slot="note"`.

## Rules

- A jump changes which sheet is on screen. It never reveals content that was hidden on this one.
- The hub is the one sheet that carries no footer rail.
- `state="done"` marks a part already covered - useful in a long training block.

## Example

```jsx
<JumpGrid cols={3}>
  <JumpCard href="#brief"><span slot="title">Brief</span><span slot="note">Where the season stands</span></JumpCard>
</JumpGrid>
```
