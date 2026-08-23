# ClosingSheet

`sheets/ClosingSheet` - class `frc-sheet-closing` - transition `frc-slide-cut` - namespace FRC5669DesignSystem

The last beat. `cut`, because the end of a deck is a deliberate stillness rather than another wipe.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="next"`, `slot="sponsors"`, `slot="attribution"`.

## Rules

- Seal, one closing line, and what happens next. If the room leaves with one instruction, it is the one in `slot="lede"`.
- **Audience chrome, not content:** on `.frc-audience-external` the sponsor rail appears. Pass a `SponsorWall` as `slot="sponsors"`; the switch is CSS on the deck root.
- The FIRST attribution line sits at reduced opacity on covers and closing sheets only, in the quarantined Roboto face.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<ClosingSheet label="Closing">
  <span slot="title">Shop opens at 15:30.</span>
  <span slot="lede">Tag in at the door, tag out when you leave.</span>
  <SponsorWall slot="sponsors">...</SponsorWall>
</ClosingSheet>
```
