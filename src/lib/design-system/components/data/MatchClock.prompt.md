# MatchClock

`data/MatchClock` - class `frc-clock` - namespace FRC5669DesignSystem

The match clock at projection scale: `phase="auto"` is 0:20, `phase="teleop"` is 2:20, rendered `M:SS`.

## Copy

- Optional `slot="phase"` to override the phase word, and `slot="note"`.

## Locked (props, not canvas copy)

- `remaining` and `warnAt` are seconds. Omit `remaining` and the clock shows the **full duration of the phase**, which is the base state.

## Rules

- **It is silent and it does not run.** A deck component that counted down would put a moving number on a printed sheet and would disagree with the field the moment the field paused. To show a state, render another sheet with a different `remaining` - that is a build slide.
- Copper (`--warn`) at the warning threshold.
- **At zero it uses rust (`--fault`), never alliance red.** A sheet carrying a match clock also carries alliance colors, and a red zero state is unreadable there.

## Example

```jsx
<MatchClock phase="teleop" />
<MatchClock phase="teleop" remaining={22} />
<MatchClock phase="teleop" remaining={0}><span slot="note">Match over</span></MatchClock>
```
