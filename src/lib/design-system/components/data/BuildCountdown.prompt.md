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
