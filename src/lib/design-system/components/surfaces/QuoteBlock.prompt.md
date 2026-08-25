# QuoteBlock

`surfaces/QuoteBlock` - class `frc-quote` - namespace FRC5669DesignSystem

A student, mentor, judge or sponsor said this.

## Copy

- `slot="text"`, `slot="attr"`, `slot="role"`.

## Rules

- Display face at sub scale, not hero: a quote is read, not chanted.
- No decorative quotation glyph. The rule and the attribution do that work, and an oversized punctuation mark is the piece of chrome that dates a deck fastest.
- Pair with the `frc-slide-banner` transition on a statement sheet.

## Example

```jsx
<QuoteBlock>
  <span slot="text">They handed us a shop and told us what good work looks like.</span>
  <span slot="attr">Senior, class of 2026</span>
  <span slot="role">Drive coach</span>
</QuoteBlock>
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
