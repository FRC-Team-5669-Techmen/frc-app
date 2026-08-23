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
