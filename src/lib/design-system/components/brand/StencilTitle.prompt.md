# StencilTitle

`brand/StencilTitle` · class `frc-stencil` · namespace FRC5669DesignSystem

Gold as a stencil or a struck emblem: display face, hero color (`--fg-hero` — gold on SQUADRON/FIELD, bronze ink on paper), and the rationed glow (already zero on paper by alias). Sentence case by default per the casing rule.

## Copy

- The title is the child. `<StencilTitle>Standing orders</StencilTitle>`.

## Props (no copy)

- `as`: heading element (`h1` default). `size`: `h1` | `display` | `hero`.
- `caps`: uppercase opt-in. `glow`: default on. `bridge`: the stencil cut, **default OFF**.

## Rules

- One per sheet. It is the hero type; running headings use `.frc-h2` / `.frc-h3` in body color.
- Glow is for hero type only; never add it to a heading by hand.
- **`bridge` is off by default.** It draws a hairline of the surface across the letterforms, and the first rendered captures of this system showed why that cannot be the default: at display size, across a whole sentence, it reads as a strikethrough rather than as a stencil. A real stencil bridge is a short gap that keeps a counter from falling out, not a rule through the middle of a title. Turn it on for a single struck word, which is what it is for — and look at the render.

## Example

```jsx
<StencilTitle size="display" caps>Muster</StencilTitle>
```
