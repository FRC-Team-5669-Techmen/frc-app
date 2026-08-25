# GallerySheet

`sheets/GallerySheet` - class `frc-sheet-gallery` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

A set: build photos, finishes, liveries, outreach events.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, then `Sample` children.

## Rules

- Items are `Sample` children, so every tile gets the same media well and caption treatment and the set reads as a set.
- Follow the standing photography direction - dark or neutral background, single light source upper left, straight on, consistent framing - or the grid will show the difference.
- Four across at 4:3. Eight tiles is two sheets.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<GallerySheet cols={4} label="Week four">
  <span slot="title">Where the robot is</span>
  <Sample src={photo}><span slot="name">Drivetrain</span><span slot="note">Welded, belted, wired</span></Sample>
</GallerySheet>
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
