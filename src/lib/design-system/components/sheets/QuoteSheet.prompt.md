# QuoteSheet

`sheets/QuoteSheet` - class `frc-sheet-quote` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

A student, mentor, judge or sponsor said this.

## Copy

- `slot="text"`, `slot="attr"`, `slot="role"`, optional `slot="portrait"`.

## Rules

- The quote is a `QuoteBlock`, so the rule, the display face and the attribution treatment come from the component.
- The portrait is a `Cutout` (alpha) or a round `ImageFrame` (opaque). A transparent PNG never goes in a frame.
- No decorative quotation glyph. It is the piece of chrome that dates a deck fastest.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<QuoteSheet label="Quote">
  <Cutout slot="portrait" ground="none" src={portrait} width={280} height={280} />
  <span slot="text">They handed us a shop and told us what good work looks like.</span>
  <span slot="attr">Senior, class of 2026</span>
</QuoteSheet>
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
