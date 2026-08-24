import { PartCallout, Cutout } from 'frc5669-design-system'

export const Gearbox = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 760 }}>
    <PartCallout>
      <Cutout slot="media" ground="shelf" width={200} height={160} file="cots-gearbox.png" />
      <span slot="name">MAXPlanetary, 3 stage</span>
      <span slot="vendor">REV Robotics</span>
      <span slot="pn">REV-21-2100</span>
      <span slot="price">$74.00</span>
      <span slot="note">Two per drivetrain side. Order the 12 tooth pinion separately.</span>
    </PartCallout>
  </div>
)

export const Motor = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 760 }}>
    <PartCallout>
      <Cutout slot="media" ground="shelf" width={200} height={160} file="kraken.png" />
      <span slot="name">Kraken X60</span>
      <span slot="vendor">WCP</span>
      <span slot="pn">WCP-0940</span>
      <span slot="price">$219.99</span>
      <span slot="note">Four on the drivetrain, two on the shooter.</span>
    </PartCallout>
  </div>
)
