# HubSheet

`sheets/HubSheet` - class `frc-sheet-hub` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

The map of the deck, one card per part.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, then `JumpCard` children.

## Rules

- **The one sheet with no footer rail.** The format exempts the hub from persistent chrome, so this pattern passes `footer={false}` and reclaims the band.
- That also means the hub carries no FIRST logo zone, which is correct: the team identification a FIRST mark requires lives in the rail this sheet does not have.
- A jump changes which sheet is on screen. It never reveals content hidden on this one.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<HubSheet label="Hub" cols={4}>
  <span slot="title">Pick a part</span>
  <JumpCard href="#build"><span slot="title">Build</span><span slot="note">Mechanisms and blockers</span></JumpCard>
</HubSheet>
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
