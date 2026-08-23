# DeckFooter

`brand/DeckFooter` · class `frc-footer` · namespace FRC5669DesignSystem

The persistent footer rail on every sheet except the hub: seal (64px slot), `5669`, deck name + current part (bottom-left, mono, reduced opacity), the LOGICAL sheet number (bottom-right), and the per-part progress rail along the bottom edge. A flat plate in `--chrome-bg`; **ambient layers are clipped out of the whole rail band**, so a FIRST mark never sits on a busy background.

On `.frc-audience-external` (deck root, a section, or `audience="external"` on the footer) it adds the **FIRST full-color-reverse horizontal logo zone**, 200×60 on a flat plate, enforcing the published 30px floor. The team number beside it satisfies the team-identification rule on every sheet.

## Copy

All props are short fixed chrome — the one case the system allows copy in a prop:

- `deckName` (locked: chrome), `parts` + `partIndex` (structural), `sheet` + `total` (the logical number; a build chain repeats it), `part` override.

## Asset

Seal slot expects `assets/team/5669-Seal.svg`; the external zone expects `assets/first/FIRST-Horizontal-Reverse.png`. Both render empty slots until supplied.

## Rules

- No dates in the rail. Dates go stale the moment a meeting moves.
- Never place it inside an ambient layer or give it a texture. It is chrome.
- A gold FIRST logo does not exist; the zone shows the reverse artwork as supplied.

## Example

```jsx
<DeckFooter deckName="Kickoff brief" parts={['Brief', 'Roster', 'Quals']} partIndex={1} sheet={4} total={18} />
```
