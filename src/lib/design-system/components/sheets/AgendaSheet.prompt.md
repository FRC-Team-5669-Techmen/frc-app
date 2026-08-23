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
