# ResultBanner

`surfaces/ResultBanner` - class `frc-result` - namespace FRC5669DesignSystem

How a match, a qual run or an inspection came out. Tones: `rank`, `win`, `loss`.

## Copy

- `slot="tag"`, `slot="title"`, `slot="note"`, `slot="score"`.

## Rules

- **The outcome is a word in the tag slot**; the color agrees with it rather than replacing it.
- Win is `--ok`, loss is `--fault`. **Never alliance red or blue**: those are alliance identity, and borrowing them for an outcome makes a red alliance win look like a loss on the same sheet.

## Example

```jsx
<ResultBanner tone="win">
  <span slot="tag">Win</span><span slot="title">Qualification 42</span><span slot="score">88 - 74</span>
</ResultBanner>
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
