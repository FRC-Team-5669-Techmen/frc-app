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
