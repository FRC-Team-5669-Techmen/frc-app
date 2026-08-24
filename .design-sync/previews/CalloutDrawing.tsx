import { CalloutDrawing, CalloutPin, ImageFrame } from 'frc5669-design-system'

/* The drawing itself is an ImageFrame, so the slot is empty until artwork
   lands. The PINS are the component, and they are drawn at rest — every label
   is readable without interaction, which is the rule this component exists to
   hold. Pin positions avoid the vertical middle of an empty slot, where the
   slot prints its own marker text. */

export const Gearbox = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 720 }}>
    <CalloutDrawing>
      <ImageFrame kind="drawing" ratio="4 / 3" file="gearbox-section.png" />
      <CalloutPin x={26} y={30}><span slot="label">Input pinion</span></CalloutPin>
      <CalloutPin x={62} y={54} side="left"><span slot="label">Output shaft</span></CalloutPin>
      <CalloutPin x={40} y={78}><span slot="label">Bearing block</span></CalloutPin>
      <span slot="caption">Every label is drawn at rest. Clicking a pin raises it.</span>
    </CalloutDrawing>
  </div>
)

export const PitLayout = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 720 }}>
    <CalloutDrawing>
      <ImageFrame kind="drawing" ratio="16 / 10" file="pit-layout.png" />
      <CalloutPin x={22} y={62}><span slot="label">Battery cart</span></CalloutPin>
      <CalloutPin x={74} y={62} side="left"><span slot="label">Tool wall</span></CalloutPin>
      <CalloutPin x={48} y={86}><span slot="label">Robot cart, wheels chocked</span></CalloutPin>
      <span slot="caption">Pit layout, 10 by 10.</span>
    </CalloutDrawing>
  </div>
)
