# DeckSteps

Stepped reveal for a deck. Behaviour, not appearance — it renders nothing.

**Every deck mounts it exactly once**, beside `DeckStage`. Two steppers on one
deck both consume the same key and the deck skips items; the guard catches it,
but the rule is the point.

```jsx
<div className="frc-deck frc-ground-squadron frc-audience-internal frc-letterbox">
  <DeckStage />
  <DeckSteps />
  <div className="frc-stage" data-aspect="4:3">…</div>
</div>
```

## Opting a sheet in

Stepping is **opt-in per sheet**, because pacing is an authorial decision and
mounting `DeckSteps` must never silently re-pace a deck someone already wrote.
Two ways, neither of which changes any pattern's props:

| you write | it means |
| --- | --- |
| `<GallerySheet data-steps>` | step this sheet's list; find it yourself |
| `<div data-step-group>…</div>` | step exactly this container |

`data-steps` resolves the first of the containers that already exist, in order:
`.frc-samples`, `.frc-steps`, `.frc-pipeline`, `.frc-role-grid`,
`.frc-safety-list`, `.frc-subteam-grid`. Use `data-step-group` for anything
else, or when a sheet holds two lists and you mean the second.

**A sheet with neither is untouched** — same markup, same keys, same behaviour
as before this component existed.

## What the keys do

`ArrowRight` / `PageDown` reveal the next item; `ArrowLeft` / `PageUp` take one
back. When the items run out the key passes to `DeckStage` and the deck changes
sheet, exactly as it always did.

The step index is **per sheet**, and re-entry is decided by direction:

- entered going **forward** → step 1. The only case that starts partial, because
  it is the only case where you are pacing.
- entered going **backward** → the **last** step. Back from the first item lands
  on the previous sheet complete, which is what "back" means to a presenter.
- arrived any other way (thumbnail, `Home`, `End`) → the **last** step. A jump is
  navigation; answering a question from the floor must never show a sheet with
  eight of nine cards missing.

## What it does not do

It never hides anything you can't get back. The reveal is gated entirely behind
`[data-deck-active][data-step]`, `data-step` exists only while a live
`DeckSteps` is driving, print releases the gate, and unmounting strips every
attribute it wrote. **A deck exported, printed, captured, or opened without this
component shows every item.**

Reduced motion still steps — it just does not animate. The pending state is
ungated; only the fade-and-rise between states sits inside the motion gate.
