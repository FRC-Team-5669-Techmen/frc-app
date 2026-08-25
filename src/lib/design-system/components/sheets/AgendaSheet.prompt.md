# AgendaSheet

`sheets/AgendaSheet` - class `frc-sheet-agenda` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

What this session covers, in order.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="foot"`, then `Step` children.

## Rules

- Items are `Step` children, so numbering is the `StepCard` CSS counter: inserting an item renumbers the rest and no printed number goes stale.
- Every item is visible at rest. An agenda that reveals itself one line at a time tells the room nothing about how long the session is.
- Six items is the ceiling at 4:3.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<AgendaSheet label="Agenda">
  <span slot="title">What we cover today</span>
  <Step state="current"><span slot="title">Drivetrain handoff</span><span slot="text">Mechanical walks Programming through the gearbox change.</span></Step>
</AgendaSheet>
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
