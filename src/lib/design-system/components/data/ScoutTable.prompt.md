# ScoutTable / ScoutRow

`data/ScoutTable` - classes `frc-scout`, `frc-scout-row` - namespace FRC5669DesignSystem

Scouting data by team, with the alliance side marked. Clicking a row dims the others.

## Copy

- `slot="col"` per column head, optional `slot="caption"`, then `ScoutRow` children. Inside a row: `slot="team"` then `slot="cell"` per column.

## Rules

- **One of the three components allowed `--alliance-red` / `--alliance-blue`** (with `AllianceSplit` and `FieldDiagram`). They are alliance DATA, never decoration, and they resolve **only inside `.frc-ground-field`**. On SQUADRON or paper the stripe falls back to structure tones and the RED / BLUE word carries the meaning.
- Focus is emphasis. It reveals nothing.

## Example

```jsx
<ScoutTable>
  <span slot="col">Team</span><span slot="col">Cycles</span>
  <ScoutRow id="r1" alliance="red"><span slot="team">5669</span><span slot="cell">7</span></ScoutRow>
</ScoutTable>
```
