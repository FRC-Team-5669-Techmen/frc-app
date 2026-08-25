# Cutout

`surfaces/Cutout` - class `frc-cutout` - namespace FRC5669DesignSystem

Treatment three of three: anything carrying an **alpha channel**. A part, a tool, a mark, a sponsor logo, an award.

`ground="shadow"` is a resting part, `"shelf"` adds a datum line, `"none"` is a floating mark.

## Copy

- `slot="caption"`. Any other child is the media.

## Rules

- **No backplate, no grid, no rectangular overlay, no corner brackets** - a cutout has no rectangle to draw.
- All grading is a **filter chain on the subject itself**, so every layer follows the silhouette instead of the slot.
- **`fit` is always `contain`.** `cover` crops the silhouette against the slot edge, which is the one reliable way to make an alpha image look framed again; passing it trips the guard rather than being quietly corrected.
- **Every sponsor logo is `ground="none"`**: a sponsor mark is a floating mark, and a contact shadow under a corporate logo reads as a rendering error. `SponsorTier` guards it.
- The platform's own grey wash behind uploads is suppressed in `tokens/image-slot.css`, not by patching a copied `image-slot.js`.

## The guard

This rule is enforced in code. A tripped guard **renders a visible rust fault marker and throws only inside the dev harness** (`/_ds`, the capture script, a test) — a guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most. The marker is not a soft landing: `npm run ds:audit` fails on a fault marker in a template and pre-delivery audit check 40 requires zero markers in any deck called finished, so the guard's real job is done at audit time and its run-time behaviour only decides how badly a miss hurts.

## Example

```jsx
<Cutout ground="shelf" src={gearbox} width={220} height={200}><span slot="caption">MAXPlanetary</span></Cutout>
<Cutout ground="none" src={sponsorMark} height={110} />
```

## The element you write is yours

Write any legal element for a slot. `<span slot="title">`, `<h2 slot="title">`
and `<p slot="title">` all render the same box — the component pins the display,
font and margin it needs on the class it paints, so the element carries only
semantics. Pick it for meaning (a heading, a link, an abbreviation), never to get
a layout.

This is a rule the system enforces, not a convention: `ds:audit` check 31 fails
if a slot's class has no `display` of its own. It exists because it used to be
false — `ResultBanner` printed "Quarterfinal 2RED ALLIANCE" and `QuoteBlock`
printed "SENIOR, CLASS OF 2026DRIVE COACH" when their slots were written as
adjacent inline spans, and `<h2 slot="title">` raised a DOM nesting error on
`SectionSheet` while working on `SafetySheet`.
