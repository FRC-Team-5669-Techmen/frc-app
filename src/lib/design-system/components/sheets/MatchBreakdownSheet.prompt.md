# MatchBreakdownSheet

`sheets/MatchBreakdownSheet` - class `frc-sheet-match` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

One match, taken apart.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="score"` (an `AllianceSplit`), `slot="clock"` (a `MatchClock`), `slot="red"`, `slot="blue"`; the child is the scouting table or the notes.

## Rules

- **The fourth and last place alliance red and blue are legal**, after `AllianceSplit`, `ScoutTable` and `FieldDiagram`. They are alliance DATA, never decoration, and they resolve **only inside `.frc-ground-field`**; on SQUADRON or paper the panels fall back to structure tones and the RED / BLUE words carry the meaning. That scoping lives in `tokens/data.css`, so this sheet never names a ground.
- `MatchClock` renders a time and never runs one. At zero it uses rust, never alliance red - on this sheet of all sheets.
- Win and loss are `--ok` and `--fault`, never an alliance color: borrowing one makes a red alliance win look like a loss on the same sheet.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<MatchBreakdownSheet label="Qual 42">
  <span slot="title">Where the match was won</span>
  <AllianceSplit slot="score" outcome="red">...</AllianceSplit>
  <MatchClock slot="clock" phase="teleop" remaining={0} />
  <SpecTable slot="red">...</SpecTable>
  <SpecTable slot="blue">...</SpecTable>
</MatchBreakdownSheet>
```
