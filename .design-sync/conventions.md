# Building with FRC5669DesignSystem

Techmen, FRC Team 5669. A **presentation and materials** system — slide decks, briefs, printed sheets — not an app UI kit. Near-black ground, Techmen Gold accent, steel chrome.

## The root wrapper is not optional

Every design must have a root element carrying **three classes**. Tokens are scoped to them; nothing below resolves without them.

```jsx
<div className="frc-deck frc-ground-squadron frc-audience-internal">
  {/* everything goes in here */}
</div>
```

- **`frc-deck`** — required. Carries the palette and, as a fail-safe, the SQUADRON alias set.
- **A ground class** — `frc-ground-squadron` (near-black, the default), `frc-ground-field` (slate, for match and pit content), or `frc-ground-paper` (warm off-white, for anything printed). The ground is what supplies `--bg0`, `--fg`, `--accent` and 33 more. A sheet or section may override it by carrying a different ground class; **nesting grounds is normal and supported**.
- **An audience class** — `frc-audience-internal` or `frc-audience-external`. External adds the *FIRST* logo zone and sponsor chrome; internal is the default and so carries no CSS rule of its own, but still set it — `DeckStage` treats a missing audience class as a fault. It switches in CSS only: never branch on it in JS, and no component takes an `audience` prop.

Two more, for full-screen decks only: put `frc-letterbox` on that same root, give the stage element `className="frc-stage" data-aspect="4:3"`, and mount **`<DeckStage />` exactly once** anywhere inside. It renders nothing visible; it paints the canvas and letterbox from the *active sheet's* `--bg0` and `--edge`, which is what stops a white flash between slides. Omit it on an embedded design.

## Style with tokens, never literals

**Never write a hex, `rgb()`, or `hsl()` value.** Every color is a `var(--*)` that re-resolves per ground — a literal freezes and will be wrong on paper.

| Purpose | Tokens |
|---|---|
| Surfaces | `--bg0` `--bg1` `--bg2` `--plate` `--edge` `--surface-viewport` `--chrome-bg` |
| Text | `--fg` `--fg-dim` `--fg-hero` `--fg-structure` `--chrome-fg` |
| Lines | `--line` `--line-strong` `--rim` `--hair` |
| Status | `--ok` `--warn` `--fault` `--live` |
| Identity | `--accent` (gold on dark, **bronze on paper**), `--glow`, `--glow-box` (both `none` on paper), `--season`, `--program` |
| Space / shape | `--space-1`…`--space-8`, `--radius-chip` `--radius-control` `--radius-panel` (2 / 3 / 4px — radii are small here) |
| Type | `--font-display` `--font-body` `--font-mono`, `--fs-hero` `--fs-display` `--fs-h1` `--fs-h2` `--fs-h3` `--fs-body` `--fs-body-sm` `--fs-label` `--fs-micro`, `--track-tight` `--track-wide` `--track-wider`, `--fw-regular` `--fw-medium` `--fw-bold` |

**Gold is identity, hero type and active state — never a large surface fill.** A full-width gold slab out-shouts the team mark on the same screen. Small filled areas (dots, chips, active tabs, progress bars) are exactly what gold is for. Gold is *illegal* on `frc-ground-paper`; `--accent` handles that for you, a literal does not. `--fault` is reserved for genuine faults and destructive actions, never for decoration.

For your own layout glue, use the type classes rather than raw font rules: `frc-hero` `frc-display` `frc-h1` `frc-h2` `frc-h3` `frc-body` `frc-body-sm` `frc-label` `frc-mono` `frc-micro` `frc-numeral` `frc-dim`. Body copy never renders below `--fs-body-sm` (24px) — this is read from across a room.

## Copy lives in children, not in props

Every list-shaped component takes its rows as child components, and names further strings with a plain `slot` attribute. Props carry **structure** (counts, weights, geometry, scales); children carry **words**. This is what makes copy editable on the canvas.

```jsx
<StatBlock tone="hero">
  <span slot="value">412</span>
  <span slot="unit">hrs</span>
  <span slot="label">Shop hours this season</span>
</StatBlock>
```

## Motion

Entrances (`frc-in-rise`, `frc-in-fade`, …) and stagger delays (`frc-d1`…`frc-d8`) only run inside `[data-deck-active]` or `.frc-run`, and only when the viewer has not asked for reduced motion. **The base state is the finished, visible state** — never hide content and rely on an animation to reveal it.

## Read these before styling

- `_ds/<folder>/styles.css` and the `_ds_bundle.css` it imports — the real, complete token and component CSS.
- Each component's `<Name>.prompt.md` — written by the team, with the rules and examples for that component.
- `README.md` — the full brand guide, including the *FIRST* usage rules.

**Also on the global, but undocumented in this sync:** the 26 full-sheet patterns (`CoverSheet`, `AgendaSheet`, `GallerySheet`, `RosterSheet`, `ClosingSheet`, …) and the sub-components of the list-shaped ones (`SpecRow`, `Bar`, `TimelineItem`, `Sample`, `JumpCard`, `SponsorTier`, `Step`, `CompareRow`, `PipelineStep`, `CalloutPin`, `ScoutRow`, `FocusRow`, `GanttBar`). They are real exports on `window.FRC5669DesignSystem` and safe to use; they just have no preview card or `.d.ts` yet.

## A short, real example

```jsx
<div className="frc-deck frc-ground-squadron frc-audience-internal" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)' }}>
  <Eyebrow tone="accent">Week four</Eyebrow>
  <h2 className="frc-h1" style={{ margin: 0 }}>Where the build stands</h2>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
    <StatBlock tone="hero"><span slot="value">412</span><span slot="unit">hrs</span><span slot="label">Shop hours</span></StatBlock>
    <StatBlock tone="ok"><span slot="value">27</span><span slot="label">Certified on the mill</span></StatBlock>
    <StatBlock tone="warn"><span slot="value">6</span><span slot="label">Jobs awaiting sign-off</span></StatBlock>
  </div>
  <Callout tone="fault">
    <span slot="title">Blocked</span>
    <p className="frc-callout-text">Climber geometry is waiting on a field measurement.</p>
  </Callout>
</div>
```
