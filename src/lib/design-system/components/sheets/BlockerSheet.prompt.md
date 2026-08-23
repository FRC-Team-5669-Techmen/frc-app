# BlockerSheet

`sheets/BlockerSheet` - class `frc-sheet-blocker` - transition `frc-slide-boot` - namespace FRC5669DesignSystem

What is stopping work, who owns it, and what it needs.

## Copy

- `slot="eyebrow"`, `slot="title"`, `slot="lede"`, `slot="aside"`, then `Blocker` children. Inside a row: `slot="state"`, `slot="title"`, `slot="owner"`.

## Rules

- Rows sit in a `FocusTable`: clicking one dims its siblings and the whole list stays on the sheet. A blocker list that hides rows is how a blocker survives a meeting.
- **Every blocker has a name next to it** before the sheet closes. `slot="owner"` is not optional in practice.
- `severity` maps to the partition: `fault` blocked, `warn` at risk, `ok` cleared. No other red exists.
- Ground and audience are **inherited from the deck**. This pattern takes neither as a prop and has no per-ground variant: it renders on SQUADRON, FIELD and PAPER unchanged.
- Nothing is hidden at rest. Click targets change emphasis only.

## Example

```jsx
<BlockerSheet label="Blockers">
  <span slot="title">What is stopping work</span>
  <Blocker id="b1" severity="fault"><span slot="state">Blocked</span><span slot="title">Router table down</span><span slot="owner">Fabrication</span></Blocker>
</BlockerSheet>
```
