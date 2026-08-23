# DeckStage

`brand/DeckStage` · class `frc-deck-stage` · namespace FRC5669DesignSystem

**Every deck mounts this exactly once.** It is the one component that is behaviour rather than appearance: it renders nothing visible, and it drives the deck.

It replaces the stage script that used to live inside `templates/Deck.dc.html`. That shell is no longer a starting point — no template can reach Claude Design from a repo-sourced design system, so a deck starts from Blank and assembles out of this library. Mounting `DeckStage` is how the deck gets its stage behaviour back.

## What it does

Paints the **canvas, the letterbox and the thumbnail frames** from the **active sheet's** `--bg0` and `--edge`, and repaints on every sheet change.

`--edge` is the whole point. A deck that paints only `--bg0` leaves everything outside the stage at the browser default, so the moment a transition moves the sheet the room sees white through the gap. `--edge` is the ground's own outside-the-sheet tone — black on SQUADRON, near-black on FIELD, warm grey on paper. Reading it off the *active sheet* rather than the deck root is what keeps a paper sheet from sitting in a black letterbox.

It paints the **document** canvas only when the deck owns the viewport, which is what `.frc-letterbox` on the root declares. An embedded deck — a demo card, a proof, a deck inside a page — paints itself and leaves the host page alone.

It also runs the keys (arrows, PageUp/PageDown, Home, End, `T` for the thumbnail rail), scales the stage into its letterbox, and builds the rail if the deck has one. Each is a prop: `nav`, `fit`, `thumbs`.

## Placement

Anywhere inside the deck root. It finds the root by walking up from itself, so it does not need to be first, last, or a direct child.

```jsx
<div className="frc-deck frc-ground-squadron frc-audience-internal frc-letterbox">
  <DeckStage />
  <div className="frc-stage" data-aspect="4:3">
    <section className="frc-sheet frc-slide-shutter" data-deck-active>…</section>
    <section className="frc-sheet frc-slide-boot">…</section>
  </div>
  <nav className="frc-thumbs frc-thumbs-dock" data-deck-thumbs hidden />
</div>
```

## Rules

- **Exactly once per deck.** A second instance renders the fault marker rather than fighting the first over the canvas.
- It **does not own the deck root and asserts nothing about it** — it reads what is there and refuses when what it reads is wrong.
- Put the ground and audience classes on the root yourself. `DeckStage` will not add them; it will tell you they are missing.
- Declare `data-aspect` on the stage explicitly, `4:3` or `16:9`. The CSS defaults to 4:3, which is exactly how a 16:9 deck silently becomes a 4:3 one.

## Refusals

Renders the shared rust fault marker, and throws only inside the dev harness — the same behaviour as every other guard in this system.

| State | Why it is a fault |
| --- | --- |
| No `.frc-deck` ancestor | There is no deck to drive. |
| No `.frc-stage` in the deck | There is nothing to paint. |
| Stage declares no `data-aspect` (or not `4:3`/`16:9`) | 4:3 and 16:9 are different decks; unstated is how one becomes the other. |
| No ground class on the root | No `--bg0`/`--edge` for the canvas to follow. |
| No audience class on the root | Audience chrome is switched in CSS off that class. |
| A second `DeckStage` on the same deck | Two painters fight over the canvas. |

The middle four are exactly the states a deck generated from Blank lands in by default. That is the reason the marker matters here: it puts the defect on the sheet instead of leaving it for someone to remember to look for.

## Example

```jsx
<DeckStage />
```

With the rail off and the deck driving its own keys:

```jsx
<DeckStage nav={false} thumbs={false} />
```
