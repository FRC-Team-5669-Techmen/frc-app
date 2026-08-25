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
