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
