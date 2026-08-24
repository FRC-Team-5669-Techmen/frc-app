# SafetySheet

`sheets/SafetySheet` - class `frc-sheet-safety` - transition `frc-slide-shutter` - namespace FRC5669DesignSystem

The shop hazard, the rules, and the steps that keep them.

## Copy

- `slot="note"` (a `SafetyNote`, **required**), `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `Step` children.

## Rules

- **It refuses to render without a `SafetyNote`.** A safety sheet whose hazard was softened into a normal callout is worse than no safety sheet: the deck still reads as "safety was covered" to someone scanning the thumbnail rail for exactly that.
- Copper is the hazard color everywhere in the system. There is no quiet variant of this sheet.
- PPE belongs in the note as `slot="ppe"` chips, not in prose.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## The guard

This rule is enforced in code. A tripped guard **renders a visible rust fault marker and throws only inside the dev harness** (`/_ds`, the capture script, a test) — a guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most. The marker is not a soft landing: `npm run ds:audit` fails on a fault marker in a template and pre-delivery audit check 40 requires zero markers in any deck called finished, so the guard's real job is done at audit time and its run-time behaviour only decides how badly a miss hurts.

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

## Host transparency

The note is found **through any layout-transparent host** the Claude Design runtime put between this sheet and the `SafetyNote` — pass it as ordinary markup and it works whether the runtime hoists `slot` onto the wrapper or leaves it on the child. Nothing extra to write, and no reason to hand-build this sheet in JavaScript to get past the guard.

The guard is unchanged in what it refuses. It looks through a runtime wrapper and through nothing else: a hazard softened into a `Callout`, or a `SafetyNote` buried inside another component, is different content and is still refused. See `components/host.jsx`.
