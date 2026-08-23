# StencilTitle

`brand/StencilTitle` · class `frc-stencil` · namespace FRC5669DesignSystem

Gold as a stencil or a struck emblem: display face, hero color (`--fg-hero` — gold on SQUADRON/FIELD, bronze ink on paper), the rationed glow (already zero on paper by alias), and a stencil bridge — a hairline of the surface cut through the letterforms. Sentence case by default per the casing rule.

## Copy

- The title is the child. `<StencilTitle>Standing orders</StencilTitle>`.

## Props (no copy)

- `as`: heading element (`h1` default). `size`: `h1` | `display` | `hero`.
- `caps`: uppercase opt-in. `bridge`: the cut (default on). `glow`: default on.

## Rules

- One per sheet. It is the hero type; running headings use `.frc-h2` / `.frc-h3` in body color.
- Glow is for hero type only; never add it to a heading by hand.

## Example

```jsx
<StencilTitle size="display" caps>Muster</StencilTitle>
```
