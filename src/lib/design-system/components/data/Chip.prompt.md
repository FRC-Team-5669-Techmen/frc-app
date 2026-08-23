# Chip

`data/Chip` - class `frc-chip` - namespace FRC5669DesignSystem

A small tag: a subteam filter, a PPE item, a category. Optional `count`.

## Copy

- **The label is the child.** The count is a number and rides as a prop.

## Rules

- A chip is not a status. Use `Badge` for state.
- `selected` is EMPHASIS only. A chip never reveals content: base state shows everything.
- Radius stays at 2px. Nothing here is pill-round.

## Example

```jsx
<Chip>Bumpers</Chip>
<Chip selected>Drivetrain</Chip>
<Chip count={4}>Open jobs</Chip>
```
