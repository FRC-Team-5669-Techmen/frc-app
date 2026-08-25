# AllianceSplit

`data/AllianceSplit` - class `frc-alliance` - namespace FRC5669DesignSystem

Two alliances, one score line, the match label between them.

## Copy

- `slot="red-tag"`, `slot="red-score"`, `slot="red-teams"`, `slot="vs"`, `slot="blue-tag"`, `slot="blue-score"`, `slot="blue-teams"`.

## Rules

- **One of the three components allowed `--alliance-red` / `--alliance-blue`**, and only on the FIELD ground. Elsewhere both sides render in structure tones - which is why the tag slot is not optional: the word is what tells the room which side is which.
- `outcome="red" | "blue"` marks the winner in `--ok`. Never mark a win by loudening an alliance color; on a sheet with two alliances that reads as the other side losing.
- Scores are display face with tabular numerals.

## Example

```jsx
<AllianceSplit outcome="red">
  <span slot="red-tag">Red alliance</span><span slot="red-score">88</span>
  <span slot="vs">Qual 42</span>
  <span slot="blue-tag">Blue alliance</span><span slot="blue-score">74</span>
</AllianceSplit>
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
