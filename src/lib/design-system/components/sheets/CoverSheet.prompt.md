# CoverSheet

`sheets/CoverSheet` - class `frc-sheet-cover` - transition `frc-slide-banner` - namespace FRC5669DesignSystem

The deck opens here: seal, one title, one line of what this is about. `banner` rather than `shutter`, because a cover is the opening statement of a deck rather than general content.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="subtitle"`, `slot="meta"`, `slot="attribution"`.

## Rules

- The **seal** goes on covers, closing sheets, and anything printed or worn. The footer rail is the logotype's zone, so the mark alone never appears here.
- **Audience chrome, not content:** on `.frc-audience-external` the cover adds a `ProgramLockup`. That switch is CSS on the deck root - the component takes no audience prop, and no deck has to remember it.
- 5669 appears twice on this sheet in external mode: in the footer rail and inside the program lockup. That is the team identification permitted use of a FIRST mark requires.
- **No dates in the title.** A date goes stale the moment a meeting moves.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<CoverSheet label="Cover" footer={{ deckName: 'Kickoff', sheet: 1, total: 18 }}>
  <span slot="eyebrow">Kickoff briefing</span>
  <span slot="title">Build season starts Saturday</span>
  <span slot="subtitle">What we are building, who is on what, and the three dates that do not move.</span>
</CoverSheet>
```
