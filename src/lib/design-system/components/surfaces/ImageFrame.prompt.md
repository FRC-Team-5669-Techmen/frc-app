# ImageFrame

`surfaces/ImageFrame` - class `frc-frame` - namespace FRC5669DesignSystem

Treatment one of three: **opaque content, edge to edge**. Photographs, screenshots, CAD renders, drawings.

`kind` says what the image IS and picks the shape: `screenshot` / `photo` are a plain rect, `render` / `equipment` / `drawing` get corner brackets, `portrait` is round. `shape` overrides.

## Copy

- `slot="caption"`. Any other child is the media (an `<img>`, an `<image-slot>`).

## Rules

- **A transparent PNG never goes in here.** The frame fills the alpha region with its backplate and grades it as a rectangle, which is exactly the discolored box around the subject. Use `Cutout`.
- The backplate reads from `--surface-viewport`, so a ground scope retints it. **Never hardcode it in a component**: that is the ground-alias freeze bug one level down, and it is how a light sheet keeps a dark box.
- `bleed` feathers one edge into the ground and **drops the rim ring and the corner brackets automatically**.
- **Never bleed a screenshot.** A feathered interface capture reads as a rendering fault, and the hard edge is what tells the room it is looking at a screen. `bleed` with `kind="screenshot"` trips the guard.
- QR codes are the one exemption in the whole system: bare on a light plate, no frame, no grade.

## The guard

This rule is enforced in code. A tripped guard **renders a visible rust fault marker and throws only inside the dev harness** (`/_ds`, the capture script, a test) — a guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most. The marker is not a soft landing: `npm run ds:audit` fails on a fault marker in a template and pre-delivery audit check 40 requires zero markers in any deck called finished, so the guard's real job is done at audit time and its run-time behaviour only decides how badly a miss hurts.

## Example

```jsx
<ImageFrame kind="render" ratio="4 / 3" src={render}><span slot="caption">Drivetrain, rev 3</span></ImageFrame>
<ImageFrame kind="photo" bleed="right" src={pit} />
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
