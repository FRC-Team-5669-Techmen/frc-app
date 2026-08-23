# DeckFooter

`brand/DeckFooter` · class `frc-footer` · namespace FRC5669DesignSystem

The persistent footer rail on every sheet except the hub: the **logotype** (32px tall), `5669`, deck name + current part (bottom-left, mono, reduced opacity), the LOGICAL sheet number (bottom-right), and the per-part progress rail along the bottom edge. A flat plate in `--chrome-bg`; **ambient layers are clipped out of the whole rail band**, so a FIRST mark never sits on a busy background.

On `.frc-audience-external` (deck root, a section, or `audience="external"` on the footer) it adds the **FIRST full-color-reverse horizontal logo zone**, 200×60 on a flat plate, enforcing the published 30px floor. The team number beside it satisfies the team-identification rule on every sheet.

## Copy

All props are short fixed chrome — the one case the system allows copy in a prop:

- `deckName` (locked: chrome), `parts` + `partIndex` (structural), `sheet` + `total` (the logical number; a build chain repeats it), `part` override.

## Asset

The rail mark expects `assets/team/Type-{Gold,White,Black}.svg` (the `variant="auto"` logotype: gold on the dark grounds, black on paper, because gold on paper is illegal); `mark="seal"` expects `assets/team/5669-Seal.svg`; the external zone expects `assets/first/FIRST-Horizontal-Reverse.png`. Each renders an empty marked slot until supplied.

## The rail mark is the logotype

`mark` defaults to `"logotype"`. The logotype is horizontal, so it survives rail scale, and it does not duplicate the team number the rail already sets in type — the seal carries `5669` and `TECHMEN` inside its own ring.

`mark="seal"` stays available for a rail on a cover or closing sheet whose sheet body is not already carrying a seal. Those two patterns put the seal in the sheet body, which is where the spec wants it: seal on covers, closing sheets, and anything printed or worn; logotype in the rail; the mark alone only where the rail already carries the logotype on the same sheet.

## Rules

- No dates in the rail. Dates go stale the moment a meeting moves.
- Never place it inside an ambient layer or give it a texture. It is chrome.
- A gold FIRST logo does not exist; the zone shows the reverse artwork as supplied.

## Example

```jsx
<DeckFooter deckName="Kickoff brief" parts={['Brief', 'Roster', 'Quals']} partIndex={1} sheet={4} total={18} />
```
