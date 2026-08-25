# JumpGrid / JumpCard

`surfaces/JumpGrid` - classes `frc-jumps`, `frc-jump` - namespace FRC5669DesignSystem

The hub sheet: one card per part of the deck. Part numbers come from position.

## Copy

- Cards are child components; inside: `slot="title"`, `slot="note"`.

## Rules

- A jump changes which sheet is on screen. It never reveals content that was hidden on this one.
- The hub is the one sheet that carries no footer rail.
- `state="done"` marks a part already covered - useful in a long training block.

## Example

```jsx
<JumpGrid cols={3}>
  <JumpCard href="#brief"><span slot="title">Brief</span><span slot="note">Where the season stands</span></JumpCard>
</JumpGrid>
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
