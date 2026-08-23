# SubteamBadge

`data/SubteamBadge` - class `frc-subteam` - namespace FRC5669DesignSystem

One subteam from the team vocabulary, with a rule in the accent down its left edge. `lead` thickens that rule for the subteam a sheet is about.

## Copy

- **The subteam name is the child**, spelled exactly as the app spells it.

## Rules

- The vocabulary is `src/subteams.js` - the same list the roster, the job board and the member application use. It is imported, never copied, so a new subteam needs no edit here.
- There is deliberately **no color or icon map keyed to the list**. The list grows; a per-value map drops every new value into an unstyled default.
- A name outside the vocabulary still renders, but marked (dimmed rule, title attribute), so a typo shows on the sheet instead of disappearing.

## Example

```jsx
<SubteamBadge>Mechanical</SubteamBadge>
<SubteamBadge lead>Drive Team</SubteamBadge>
```
