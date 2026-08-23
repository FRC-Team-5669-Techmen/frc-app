# BuildCountdown

`data/BuildCountdown` - class `frc-countdown` - namespace FRC5669DesignSystem

Days to a milestone, at hero scale. Copper inside `warnAt`, rust at or below `dueAt`.

## Copy

- `slot="label"` says what the countdown is to. `unit` is short fixed chrome and stays a prop.

## Rules

- It takes a **number, never a date**. A deck rendered from a date reads differently in the shop on Tuesday than in the PDF a mentor printed on Monday.
- One countdown per sheet. Two competing deadlines is a `Timeline`.

## Example

```jsx
<BuildCountdown value={31}><span slot="label">To bag and tag</span></BuildCountdown>
```
