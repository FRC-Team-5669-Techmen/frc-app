# SealMark

`brand/SealMark` · class `frc-seal` · namespace FRC5669DesignSystem

The team seal: a faceted helmet with a T faceplate over wide feathered wings inside a gear ring carrying 5669 above and TECHMEN below. **Seal on covers, closing sheets, and anything printed or worn.**

## Asset

Expects `assets/team/5669-Seal.svg`. Until it lands the component renders a clearly marked empty slot at the requested size (floor 48px). **No substitute is drawn.** The mark is never edited, distorted, recolored or reconfigured.

## Props (no copy)

- `size` px (square), `src` override, `alt`.

## Rules

- One seal per sheet at most; the footer rail already carries it at 64px.
- Follow the published spacing guide (`Mark-Guides.svg`) for clearance once it is in the repo.

## Example

```jsx
<SealMark size={240} />
```
