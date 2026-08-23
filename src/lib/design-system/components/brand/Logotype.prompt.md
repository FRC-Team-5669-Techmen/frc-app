# Logotype

`brand/Logotype` · class `frc-logotype` · namespace FRC5669DesignSystem

The mark locked up with the TECHMEN wordmark, published in Gold, White and Black. The footer rail form of the identity.

## Asset

Expects `assets/team/Type-Gold.svg`, `Type-White.svg`, `Type-Black.svg`. Empty slot (height-driven, floor 24px tall / 120px wide; the slot width is a placeholder until the SVG supplies the real aspect) until they land. Never drawn, never approximated; spacing per `Type-Guides.svg`.

## Props (no copy)

- `variant`: `gold` | `white` | `black` | `auto` (Gold on dark grounds, Black on paper, chosen by the ground scope).
- `height` px, `width` placeholder, `src` override, `alt`.

## Example

```jsx
<Logotype variant="auto" height={40} />
```
