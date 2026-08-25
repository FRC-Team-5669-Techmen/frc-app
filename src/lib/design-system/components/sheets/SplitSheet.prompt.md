# SplitSheet

`sheets/SplitSheet` - class `frc-sheet-split` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

Copy on one side, a visual aid on the other. The workhorse of the density floor.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="media"`. Every other child is copy.

## Rules

- The aid is an `ImageFrame`, a `Cutout`, a `CalloutDrawing`, a chart or a `SpecTable`. Two thirds of sheets carry one; this is the pattern most of them use.
- `media="right"` moves the aid, `weight="media" | "copy"` shifts the ratio.
- At 4:3 there is less horizontal room than a widescreen deck. The pattern will not shrink type to rescue a paragraph - cut the paragraph.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SplitSheet media="right" label="Drivetrain">
  <span slot="title">Belted, not chained</span>
  <ImageFrame slot="media" kind="render" ratio="4 / 3" src={render} />
  <p className="frc-body">Belts hold tension through an event without a mid-match check.</p>
</SplitSheet>
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
