# RosterSheet

`sheets/RosterSheet` - class `frc-sheet-roster` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

Who is on this team and what they are cleared to run.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="foot"`, then `RoleCard` children.

## Rules

- `RoleCard` carries subteams from the shared vocabulary and certifications in the app model (`certified` / `in_progress`, safety-critical flagged) - **as props and children, never as a query.** A deck must render on a projector in a gym with no network.
- Four cards is the ceiling at 4:3. A full roster is several sheets, or a `SpecTable` of names with a `SubteamBadge` per row.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<RosterSheet cols={2} label="Drive team">
  <span slot="title">Who is on what</span>
  <RoleCard>
    <span slot="name">A. Rivera</span>
    <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
    <li slot="cert" data-status="certified" data-safety>Mill</li>
  </RoleCard>
</RosterSheet>
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
