# Eyebrow

`core/Eyebrow` · class `frc-eyebrow` · namespace FRC5669DesignSystem

The mono label that sits above a title or a block: UPPERCASE, wide tracking, a leading 16×2 tick. Tones: `default` (ash), `accent` (gold tick, body-colored text), `live` (a pulsing gold dot — the LIVE / REC indicator; never red), `plain` (no tick).

## Copy

- **The label is the child.** `<Eyebrow>Standing orders</Eyebrow>`.
- Voice: SQUADRON terse and declarative (brief, roster, quals, mission, muster); FIELD technical (match, alliance, cycle, queue, pit, auto, teleop, endgame).

## Rules

- Gold is never the text color here. The `accent` tone carries gold on the tick only.
- `live` pulses only inside `[data-deck-active]` or `.frc-run`; the static state is a solid gold dot, so print and reduced motion still show the indicator.

## Example

```jsx
<Eyebrow tone="accent">Mission brief</Eyebrow>
<Eyebrow tone="live">Live</Eyebrow>
```
