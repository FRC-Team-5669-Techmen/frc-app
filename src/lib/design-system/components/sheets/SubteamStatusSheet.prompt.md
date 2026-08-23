# SubteamStatusSheet

`sheets/SubteamStatusSheet` - class `frc-sheet-subteam` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

Where every subteam stands, on one sheet. The weekly meeting sheet.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="foot"`, then `SubteamStatus` children. Inside a row: `slot="subteam"`, `slot="status"`, `slot="metric"`, `slot="note"`.

## Rules

- **Every subteam that exists appears**, whether or not it has news. A subteam missing from the grid reads as a subteam nobody is tracking, which is the failure this sheet exists to catch.
- Subteam names come from `SubteamBadge`, which reads the one shared vocabulary in `src/subteams.js`.
- `progress` and `max` are structural numbers. The status word is a child, because the word is what the room repeats.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SubteamStatusSheet cols={3} label="Muster">
  <span slot="title">Where every subteam stands</span>
  <SubteamStatus tone="warn" progress={54}>
    <span slot="subteam">Electrical</span><span slot="status">Behind</span>
    <span slot="note">Waiting on the second CAN run.</span>
  </SubteamStatus>
</SubteamStatusSheet>
```
