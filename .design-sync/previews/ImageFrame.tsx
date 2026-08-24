import { ImageFrame } from 'frc5669-design-system'

/* The repo ships no photography yet, so every frame below renders the marked
   EMPTY SLOT at the correct size. That is the true current state of this
   component, not a broken render — what each shape does to an image is what
   these cards are showing. */

export const Shapes = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 40, alignItems: 'start' }}>
    <ImageFrame kind="screenshot" ratio="16 / 10" file="scouting-app.png"><span slot="caption">Screenshot, hard edge</span></ImageFrame>
    <ImageFrame kind="render" ratio="4 / 3" file="drivetrain-render.png"><span slot="caption">Render, brackets</span></ImageFrame>
    <ImageFrame kind="portrait" file="member-portrait.jpg"><span slot="caption">Portrait, round</span></ImageFrame>
  </div>
)

export const Bleed = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 40, alignItems: 'start' }}>
    <ImageFrame kind="photo" bleed="right" ratio="4 / 3" file="pit-photo.jpg"><span slot="caption">Photo, bleeding right</span></ImageFrame>
    <ImageFrame kind="photo" ratio="4 / 3" file="pit-photo.jpg"><span slot="caption">The same photo, contained</span></ImageFrame>
  </div>
)
