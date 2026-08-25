# SponsorWall / SponsorTier

`surfaces/SponsorWall` - classes `frc-sponsors`, `frc-sponsor-tier` - namespace FRC5669DesignSystem

Sponsor marks, tiered, for the closing sheet of an external deck.

## Copy

- Tiers are child components carrying `slot="name"`; the marks are the tier's other children.

## Rules

- **Every mark is a `Cutout` with `ground="none"`.** A sponsor logo is a floating mark: it arrives with an alpha channel, and a contact shadow under a corporate logo reads as a rendering error to the one person in the room most likely to notice it. `SponsorTier` **refuses** an `ImageFrame` or a `Cutout` with any other ground.
- Size marks by tier with `width` / `height` on the Cutout; never by scaling a mark past its published minimum.
- Marks are used as supplied: no recoloring, no containing shape, no added border.

## The guard

This rule is enforced in code. A tripped guard **renders a visible rust fault marker and throws only inside the dev harness** (`/_ds`, the capture script, a test) — a guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most. The marker is not a soft landing: `npm run ds:audit` fails on a fault marker in a template and pre-delivery audit check 40 requires zero markers in any deck called finished, so the guard's real job is done at audit time and its run-time behaviour only decides how badly a miss hurts.

## Example

```jsx
<SponsorWall>
  <SponsorTier>
    <span slot="name">Lead sponsors</span>
    <Cutout ground="none" src={leadMark} width={260} height={110} />
  </SponsorTier>
</SponsorWall>
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
