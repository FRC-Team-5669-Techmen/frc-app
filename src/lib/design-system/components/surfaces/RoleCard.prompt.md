# RoleCard

`surfaces/RoleCard` - class `frc-role` - namespace FRC5669DesignSystem

A member: who they are, which subteams they sit on, what they are certified to run.

## Copy

- `slot="media"` (a `Cutout` or a round `ImageFrame`), `slot="name"`, `slot="title"`, `slot="subteam"` repeated (`SubteamBadge` children), `slot="cert"` repeated, `slot="note"` for one short line under the certs.
- `slot="portrait"` is the original name for the media slot and still works. New decks use `slot="media"`.

## Props

- `density` - `"default"` | `"compact"`. Default is `"default"`.
- `mediaFile` - the filename the empty media slot names. Slot chrome, not copy.

## Rules

- A cert child carries `data-status="certified" | "in_progress"` and optional `data-safety`, which mirrors the app model: `member_skills.status` and `skills.safety_critical`.
- **It takes data as props and children and never queries Supabase.** A deck component that fetched would put an auth dependency on a projector in a gym with no network.
- Subteam names come from `SubteamBadge`, which reads the one shared vocabulary.
- **The card owns its type scale, its padding and its gaps.** Never set `font-size`, `padding`, `gap` or `grid-template-columns` on a RoleCard or on anything inside one. If a grid of them does not fit, that is what `density="compact"` is for, not a deck-side override.
- **Six or more cards on one sheet is `density="compact"`.** Compact puts the media above the text instead of beside it and drops the whole card to the smaller scale on its own.
- **A grid of cards goes in a wrapper carrying `frc-role-grid`.** That class owns the columns and the gutter for both densities, so a deck never writes `gridTemplateColumns` or `gap` either. It fits columns to the sheet width off a per-density floor: nine compact cards land as six and three on a 16:9 stage without anyone counting.
- **The media slot is optional.** Left empty it renders the system's marked empty slot — the same dashed, mono, `frc-frame-empty` affordance `Cutout` and `AssetSlot` render — sized to the slot. An unfilled card reads as a slot waiting for a photo, never as a card that failed to lay out.

## Example

```jsx
<div className="frc-role-grid">
  <RoleCard density="compact" mediaFile="rivera-portrait.png">
    <Cutout slot="media" ground="none" src={portrait} width={160} height={160} />
    <span slot="name">A. Rivera</span>
    <span slot="title">Drive coach</span>
    <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
    <li slot="cert" data-status="certified" data-safety>Mill</li>
    <p slot="note">Runs the pit checklist every match.</p>
  </RoleCard>
  {/* …eight more, no photo yet: each renders its marked empty slot. */}
</div>
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
