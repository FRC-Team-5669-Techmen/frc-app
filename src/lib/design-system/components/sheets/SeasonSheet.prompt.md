# SeasonSheet

`sheets/SeasonSheet` - class `frc-sheet-season` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

The season, named and framed.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lockup"` (a `SeasonLockup`), `slot="stat"` repeated.

## Rules

- Setting `--season` on the deck root and dropping artwork into the lockup is **the entire annual reskin**. Nothing else in the system changes when the season does, which is the point of isolating it.
- Season years render `2026-27`, never `2026/2027`. Team numbers render bare.
- On paper the season rule falls back to the bronze accent, because the gold default is illegal there.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SeasonSheet label="Season">
  <span slot="title">2026-27</span>
  <SeasonLockup slot="lockup" years="2026-27">Biocore</SeasonLockup>
  <StatBlock slot="stat" tone="hero"><span slot="value">5669</span><span slot="label">Techmen</span></StatBlock>
</SeasonSheet>
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
