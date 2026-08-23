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
