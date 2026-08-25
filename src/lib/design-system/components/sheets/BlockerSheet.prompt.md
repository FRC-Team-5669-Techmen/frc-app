# BlockerSheet

`sheets/BlockerSheet` - class `frc-sheet-blocker` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

What is stopping work, who owns it, and what it needs.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `Blocker` children. Inside a row: `slot="state"`, `slot="title"`, `slot="owner"`.

## Rules

- Rows sit in a `FocusTable`: clicking one dims its siblings and the whole list stays on the sheet. A blocker list that hides rows is how a blocker survives a meeting.
- **Every blocker has a name next to it** before the sheet closes. `slot="owner"` is not optional in practice.
- `severity` maps to the partition: `fault` blocked, `warn` at risk, `ok` cleared. No other red exists.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<BlockerSheet label="Blockers">
  <span slot="title">What is stopping work</span>
  <Blocker id="b1" severity="fault"><span slot="state">Blocked</span><span slot="title">Router table down</span><span slot="owner">Fabrication</span></Blocker>
</BlockerSheet>
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
