# SafetySheet

`sheets/SafetySheet` - class `frc-sheet-safety` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

The shop hazard, the rules, and the steps that keep them.

## Copy

- `slot="note"` (a `SafetyNote`, **required**), `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `Step` children.

## Rules

- **It throws without a `SafetyNote`.** A safety sheet whose hazard was softened into a normal callout is worse than no safety sheet: the deck still reads as "safety was covered" to someone scanning the thumbnail rail for exactly that.
- Copper is the hazard color everywhere in the system. There is no quiet variant of this sheet.
- PPE belongs in the note as `slot="ppe"` chips, not in prose.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<SafetySheet label="The mill">
  <span slot="title">The mill</span>
  <SafetyNote slot="note">
    <p>The mill is a two-person tool.</p>
    <li slot="rule">Stock clamped before the spindle turns.</li>
  </SafetyNote>
  <Step><span slot="title">Check the vise</span><span slot="text">Jaws clean, stock seated.</span></Step>
</SafetySheet>
```
